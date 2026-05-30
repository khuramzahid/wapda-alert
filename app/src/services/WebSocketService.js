/**
 * WebSocketService — Singleton WebSocket manager for ESP8266 communication.
 *
 * Handles connection, auto-reconnect with exponential backoff,
 * heartbeat pings, token-based authentication, and state change listeners.
 */

const WS_AUTH_KEY = 'wapda-secret-2026';  // Must match firmware WS_AUTH_KEY

class WebSocketService {
  constructor() {
    this.ws = null;
    this.url = null;
    this.listeners = new Set();
    this.connectionListeners = new Set();
    this.connected = false;
    this.authenticated = false;
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

    this.authenticated = false;

    console.log(`[WS] Connecting to ${this.url}`);
    this.ws = new WebSocket(this.url);

    // Timeout to prevent hanging in "Connecting..." indefinitely
    const connTimeout = setTimeout(() => {
      if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
        console.log('[WS] Connection timeout');
        try { this.ws.close(); } catch (e) {}
      }
    }, 5000);

    this.ws.onopen = () => {
      console.log('[WS] Connected, awaiting auth challenge');
      clearTimeout(connTimeout);
      this.connected = true;
      this.reconnectDelay = 2000; // Reset backoff
      // Don't notify connection listeners yet — wait for AUTH_OK
    };

    this.ws.onmessage = (event) => {
      const raw = event.data;

      // ── Input sanitization ──
      // 1. Reject non-string or oversized messages
      if (typeof raw !== 'string' || raw.length > 64) {
        console.warn('[WS] Dropped message: invalid type or too long', typeof raw, raw?.length);
        return;
      }

      // 2. Strip non-printable characters (keep ASCII 32-126)
      const data = raw.replace(/[^\x20-\x7E]/g, '');

      // ── Authentication protocol ──
      if (data === 'AUTH_REQUIRED') {
        console.log('[WS] Auth required, sending credentials');
        this.ws.send(`AUTH:${WS_AUTH_KEY}`);
        return;
      }

      if (data === 'AUTH_OK') {
        console.log('[WS] Authenticated successfully');
        this.authenticated = true;
        this._notifyConnectionListeners(true);
        this._startHeartbeat();
        return;
      }

      if (data === 'AUTH_FAIL') {
        console.error('[WS] Authentication FAILED — wrong key');
        this.authenticated = false;
        this.intentionalClose = true; // Don't auto-reconnect on auth failure
        return;
      }

      // ── State messages (only process if authenticated) ──
      if (!this.authenticated) {
        console.warn('[WS] Dropped message before auth:', data);
        return;
      }

      // 3. Allowlist: only process known protocol messages
      const ALLOWED_MESSAGES = ['STATE:ON', 'STATE:OFF', 'RESETTING'];
      if (!ALLOWED_MESSAGES.includes(data)) {
        console.warn('[WS] Dropped message: not in allowlist:', data);
        return;
      }

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
    this.authenticated = false;
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
