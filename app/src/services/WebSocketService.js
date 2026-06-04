/**
 * WebSocketService — Singleton WebSocket manager for ESP8266 communication.
 *
 * Handles connection, auto-reconnect with exponential backoff,
 * heartbeat pings, and state change listeners.
 */

class WebSocketService {
  constructor() {
    this.ws = null;
    this.url = null;
    this.listeners = new Set();
    this.connectionListeners = new Set();
    this.connected = false;
    this.connecting = false;
    this.lastLedState = null;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.reconnectDelay = 2000; // Start at 2s, max 30s
    this.intentionalClose = false;
    this.messageQueue = [];
    this.missedHeartbeats = 0;
    this._freshModeUntil = 0; // timestamp: suppress backoff until this time
  }

  _normalizeLedStatus(value) {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1') return true;
    if (value === 0 || value === '0') return false;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
  }

  /**
   * Connect to the ESP8266 WebSocket server.
   * @param {string} ip - Device IP address
   * @param {number} [port=81] - WebSocket port
   */
  connect(ip, port = 81) {
    const newUrl = `ws://${ip}:${port}`;

    // Skip if already connected to the same device
    if (this.url === newUrl && this.isConnected()) {
      console.log('[WS] Already connected to', newUrl);
      return;
    }

    this.url = newUrl;
    this.intentionalClose = false;
    this._doConnect();
  }

  /**
   * Connect with aggressive retries (no exponential backoff) for the first
   * 30 seconds.  Use this right after device provisioning when the ESP8266
   * is still rebooting and joining the home WiFi network.
   * @param {string} ip - Device IP address
   * @param {number} [port=81] - WebSocket port
   */
  connectFresh(ip, port = 81) {
    console.log('[WS] Fresh-connect mode: aggressive retries for 30s');
    this._freshModeUntil = Date.now() + 30000;
    this.reconnectDelay = 2000; // Force-reset to 2s
    this.connect(ip, port);
  }

  _doConnect() {
    // Clean up old socket without triggering reconnect
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.close();
      } catch (e) {
        // ignore
      }
      this.ws = null;
    }

    console.log(`[WS] Connecting to ${this.url}`);
    this.connecting = true;
    this.ws = new WebSocket(this.url);

    // Timeout to prevent hanging in "Connecting..." indefinitely
    const connTimeout = setTimeout(() => {
      if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
        console.log('[WS] Connection timeout');
        try { this.ws.close(); } catch (e) {}
      }
    }, 5000);

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      clearTimeout(connTimeout);
      this.connected = true;
      this.connecting = false;
      this.reconnectDelay = 2000; // Reset backoff
      this.missedHeartbeats = 0;
      this._notifyConnectionListeners(true);
      this._startHeartbeat();
      this._flushQueue();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[WS] Message:', data);

        if (data.type === 'pong') {
          this.missedHeartbeats = 0;
        } else if (data.type === 'state_update' || data.type === 'initial_state') {
          const normalized = this._normalizeLedStatus(data.led_status);
          if (normalized === null) return;

          const hasPrev = this.lastLedState !== null;
          const changed = hasPrev && this.lastLedState !== normalized;

          // Only notify when the value actually changes, or when we learn it the first time.
          if (!hasPrev || changed) {
            this.lastLedState = normalized;
            this._notifyListeners(normalized, changed);
          }
        }
      } catch (e) {
        console.log('[WS] Ignore non-JSON message:', event.data);
      }
    };

    this.ws.onclose = (event) => {
      console.log('[WS] Closed:', event.code, event.reason);
      
      this.connected = false;
      this._stopHeartbeat();
      // Always notify on close. If the initial connect fails (timeout/close before OPEN),
      // UI can otherwise get stuck showing "Connecting..." forever.
      this._notifyConnectionListeners(false);

      if (!this.intentionalClose) {
        // We will keep trying; treat as still "connecting" for UI.
        this.connecting = true;
        this._scheduleReconnect();
      } else {
        this.connecting = false;
      }
    };

    this.ws.onerror = (error) => {
      console.log('[WS] Error:', error.message);
      // onclose will fire after onerror
    };
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    console.log(`[WS] Reconnecting in ${this.reconnectDelay}ms...`);
    this.reconnectTimer = setTimeout(() => {
      this._doConnect();
    }, this.reconnectDelay);

    // In "fresh" mode (right after provisioning), keep retrying every 2s
    // so the user sees "Connected" as soon as the device comes online.
    if (Date.now() < this._freshModeUntil) {
      this.reconnectDelay = 2000; // Stay at 2s
    } else {
      // Exponential backoff: 2s → 4s → 8s → 16s → 30s (cap)
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    }
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.missedHeartbeats = 0;
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        if (this.missedHeartbeats >= 2) {
          console.log('[WS] Missed heartbeats, closing connection');
          try { this.ws.close(); } catch (e) {}
          return;
        }
        try {
          this.missedHeartbeats++;
          this.ws.send(JSON.stringify({ type: 'ping' }));
        } catch (e) {
          // Connection may have died
        }
      }
    }, 10000); // Send ping every 10s
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  _flushQueue() {
    while (this.messageQueue.length > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
      const msg = this.messageQueue.shift();
      try {
        this.ws.send(msg);
      } catch (e) {
        this.messageQueue.unshift(msg);
        break;
      }
    }
  }

  /**
   * Send a command to the ESP8266.
   * @param {object} payload
   */
  send(payload) {
    const msg = JSON.stringify(payload);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
    } else {
      console.warn('[WS] Not connected, queueing message');
      this.messageQueue.push(msg);
      if (this.messageQueue.length > 10) {
        this.messageQueue.shift(); // Drop oldest message
      }
    }
  }

  /**
   * Register a listener for LED state changes.
   * @param {(ledOn: boolean, changed: boolean) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  onStateChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Register a listener for connection status changes.
   * @param {(connected: boolean) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  onConnectionChange(callback) {
    this.connectionListeners.add(callback);
    return () => this.connectionListeners.delete(callback);
  }

  _notifyListeners(ledOn, changed) {
    for (const cb of this.listeners) {
      try {
        cb(ledOn, changed);
      } catch (e) {
        console.error('[WS] Listener error:', e);
      }
    }
  }

  _notifyConnectionListeners(connected) {
    for (const cb of this.connectionListeners) {
      try {
        cb(connected);
      } catch (e) {
        console.error('[WS] Connection listener error:', e);
      }
    }
  }

  /**
   * Disconnect intentionally (no auto-reconnect).
   */
  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this._stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.connecting = false;
    this.lastLedState = null;
  }

  /**
   * Check if currently connected.
   * @returns {boolean}
   */
  isConnected() {
    return this.connected && this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * True while we are actively trying (or re-trying) to connect.
   * @returns {boolean}
   */
  isConnecting() {
    return !this.intentionalClose && this.connecting;
  }

  /**
   * Get the last known LED state.
   * @returns {boolean | null}
   */
  getLastState() {
    return this.lastLedState;
  }
}

// Singleton export
export default new WebSocketService();
