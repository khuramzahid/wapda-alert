/**
 * DiscoveryService — Finds WAPDA Alert devices on the local network.
 *
 * Strategy 1: mDNS — Uses Android's native Network Service Discovery
 *             to find the ESP8266's advertised _esp8266-device._tcp service.
 * Strategy 2: UDP Broadcast — Fast fallback that hits port 8888.
 */

import Zeroconf from 'react-native-zeroconf';
import UdpSockets from 'react-native-udp';

const UDP_PORT = 8888;
const MDNS_SERVICE = 'esp8266-device';

// ── Verification ────────────────────────────────────────────────────────

/**
 * Verify a device by hitting its /status endpoint.
 *
 * @param {string} ip
 * @returns {Promise<{deviceId: string, ledStatus: boolean, deviceType: string} | null>}
 */
export async function verifyDeviceIdentity(ip) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    
    const resp = await fetch(`http://${ip}/status`, {
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.device_type === 'esp8266' && data.device_id) {
        return {
          deviceId: data.device_id,
          ledStatus: data.led_status,
          deviceType: data.device_type,
          ip: ip
        };
      }
    }
  } catch (e) {
    // Timeout or network error
  }
  return null;
}

// ── Strategy 1: mDNS / Zeroconf ────────────────────────────────────────

/**
 * Use Android NSD to discover our device's _esp8266-device._tcp mDNS service.
 *
 * @param {(msg: string) => void} [onProgress]
 * @param {number} [timeoutMs=5000]
 * @returns {Promise<string|null>} - Device IP if found, null otherwise
 */
export function discoverDeviceViaMDNS(onProgress, timeoutMs = 5000) {
  const log = onProgress || (() => {});
  let zeroconf;
  try {
    zeroconf = new Zeroconf();
  } catch (e) {
    log('mDNS unavailable on this build.');
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let found = false;
    let timer;

    const cleanup = () => {
      clearTimeout(timer);
      zeroconf.stop();
      zeroconf.removeAllListeners();
    };

    zeroconf.on('resolved', (service) => {
      if (!found && service.name && service.name.includes('esp8266-device')) {
        const ip =
          service.addresses && service.addresses.length > 0
            ? service.addresses[0]
            : service.host;
        
        if (ip) {
          found = true;
          log(`Found via mDNS: ${ip}`);
          cleanup();
          resolve(ip);
        }
      }
    });

    zeroconf.on('error', (err) => {
      console.log('[Discovery] mDNS error:', err);
    });

    log('Scanning via mDNS...');
    zeroconf.scan(MDNS_SERVICE, 'tcp', 'local.');

    timer = setTimeout(() => {
      if (!found) {
        log('mDNS scan timed out.');
        cleanup();
        resolve(null);
      }
    }, timeoutMs);
  });
}

// ── Strategy 2: UDP Broadcast ──────────────────────────────────────────

/**
 * Scan the local network via UDP Broadcast.
 *
 * @param {(msg: string) => void} [onProgress]
 * @param {number} [timeoutMs=5000]
 * @returns {Promise<string|null>} - Device IP if found, null otherwise
 */
export function discoverDeviceViaUDP(onProgress, timeoutMs = 5000) {
  const log = onProgress || (() => {});
  
  return new Promise((resolve) => {
    let found = false;
    let timer;
    let broadcastInterval;
    let socket;
    try {
      socket = UdpSockets.createSocket('udp4');
    } catch (e) {
      log('UDP discovery unavailable on this build.');
      resolve(null);
      return;
    }
    
    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(broadcastInterval);
      try { socket.close(); } catch (e) {}
    };

    socket.on('message', (msg, rinfo) => {
      if (found) return;
      try {
        const data = JSON.parse(msg.toString());
        if (data && data.device_type === 'esp8266' && data.device_id && data.device_ip) {
          found = true;
          log(`Found via UDP: ${data.device_ip}`);
          cleanup();
          resolve(data.device_ip);
        }
      } catch (e) {
        // Parse error, ignore
      }
    });

    socket.on('error', (err) => {
      console.log('[Discovery] UDP error:', err);
    });

    socket.bind(0, () => {
      socket.setBroadcast(true);
      const msgStr = JSON.stringify({ type: 'discover', version: '1.0' });
      
      log('Scanning via UDP Broadcast...');
      
      const sendBroadcast = () => {
        if (!found) {
          try {
            // react-native-udp supports sending strings on many builds.
            // If the native module expects a Buffer, this will throw and we'll just stop UDP discovery.
            socket.send(msgStr, 0, msgStr.length, UDP_PORT, '255.255.255.255', (err) => {
              if (err) console.log('UDP send error:', err);
            });
          } catch (e) {
            console.log('[Discovery] UDP send unsupported:', e?.message || e);
            log('UDP discovery not supported on this device.');
            cleanup();
            resolve(null);
          }
        }
      };

      // Send immediately, then every 1 second
      sendBroadcast();
      broadcastInterval = setInterval(sendBroadcast, 1000);
    });

    timer = setTimeout(() => {
      if (!found) {
        log('UDP scan timed out.');
        cleanup();
        resolve(null);
      }
    }, timeoutMs);
  });
}

// ── Main entry point ──────────────────────────────────────────────────

/**
 * Try mDNS first, then fall back to UDP.
 *
 * @param {(msg: string) => void} [onProgress]
 * @returns {Promise<string|null>} - Device IP if found, null otherwise
 */
export async function findDevice(onProgress) {
  const log = onProgress || (() => {});

  // Strategy 1: mDNS
  log('Looking for device via mDNS...');
  let ip = await discoverDeviceViaMDNS(onProgress);
  
  if (!ip) {
    // Strategy 2: UDP Broadcast
    log('mDNS failed. Trying UDP broadcast...');
    ip = await discoverDeviceViaUDP(onProgress);
  }
  
  if (ip) {
    log('Verifying device identity...');
    const identity = await verifyDeviceIdentity(ip);
    if (identity) {
      log('Device verified successfully.');
      return ip;
    } else {
      log('Device verification failed.');
    }
  }

  return null;
}
