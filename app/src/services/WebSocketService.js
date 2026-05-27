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
    this.lastLedState = null;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.reconnectDelay = 2000; // Start at 2s, max 30s
    this.intentionalClose = false;
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
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      this.connected = true;
      this.reconnectDelay = 2000; // Reset backoff
      this._notifyConnectionListeners(true);
      this._startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      const data = event.data;
      console.log('[WS] Message:', data);

      if (data === 'STATE:ON' || data === 'STATE:OFF') {
        const newState = data === 'STATE:ON';
        const changed = this.lastLedState !== null && this.lastLedState !== newState;
        this.lastLedState = newState;
        this._notifyListeners(newState, changed);
      }
    };

    this.ws.onclose = (event) => {
      console.log('[WS] Closed:', event.code, event.reason);
      this.connected = false;
      this._stopHeartbeat();
      this._notifyConnectionListeners(false);

      if (!this.intentionalClose) {
        this._scheduleReconnect();
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

    // Exponential backoff: 2s → 4s → 8s → 16s → 30s (cap)
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send('PING');
        } catch (e) {
          // Connection may have died
        }
      }
    }, 15000);
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Send a command to the ESP8266.
   * @param {'ON' | 'OFF'} command
   */
  send(command) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(command);
    } else {
      console.warn('[WS] Cannot send, not connected');
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
   * Get the last known LED state.
   * @returns {boolean | null}
   */
  getLastState() {
    return this.lastLedState;
  }
}

// Singleton export
export default new WebSocketService();
