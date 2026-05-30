/**
 * DiscoveryService — Finds WAPDA Alert devices on the local network.
 *
 * Strategy 1: NSD/Zeroconf — Uses Android's native Network Service Discovery
 *             to find the ESP8266's advertised _http._tcp service instantly.
 * Strategy 2: Subnet scan — Fast fallback that hits /status on each local IP.
 */

import Zeroconf from 'react-native-zeroconf';
import WifiManager from 'react-native-wifi-reborn';

// ── Strategy 1: NSD / Zeroconf (near-instant) ──────────────────────

/**
 * Use Android NSD to discover our device's _http._tcp mDNS service.
 * Typically resolves within 1-3 seconds.
 *
 * @param {(msg: string) => void} [onProgress] - Optional progress callback
 * @param {number} [timeoutMs=6000] - How long to scan before giving up
 * @returns {Promise<string|null>} - Device IP if found, null otherwise
 */
export function discoverDeviceViaNSD(onProgress, timeoutMs = 6000) {
  const log = onProgress || (() => {});
  const zeroconf = new Zeroconf();

  return new Promise((resolve) => {
    let found = false;
    let timer;

    const cleanup = () => {
      clearTimeout(timer);
      zeroconf.stop();
      zeroconf.removeAllListeners();
    };

    zeroconf.on('resolved', (service) => {
      // Match our device by its mDNS hostname
      if (
        !found &&
        service.name &&
        service.name.toLowerCase().includes('wapda-alert')
      ) {
        found = true;
        const ip =
          service.addresses && service.addresses.length > 0
            ? service.addresses[0]
            : service.host;
        log(`Found via NSD: ${ip}`);
        cleanup();
        resolve(ip);
      }
    });

    zeroconf.on('error', (err) => {
      console.log('[Discovery] NSD error:', err);
      // Don't resolve null yet — let timeout handle it
    });

    // Start scanning for HTTP services
    log('Scanning for devices via NSD...');
    zeroconf.scan('http', 'tcp', 'local.');

    // Timeout: give up and let the caller try the next strategy
    timer = setTimeout(() => {
      if (!found) {
        log('NSD scan timed out.');
        cleanup();
        resolve(null);
      }
    }, timeoutMs);
  });
}

const WS_AUTH_KEY = 'wapda-secret-2026';  // Must match firmware

// ── Strategy 2: Subnet scan (fallback) ──────────────────────────────

/**
 * Scan the local /24 subnet for an ESP8266 running WAPDA Alert firmware.
 * Fires all 254 requests in parallel — first success wins immediately.
 *
 * @param {(msg: string) => void} [onProgress] - Optional progress callback
 * @returns {Promise<string|null>} - Device IP if found, null otherwise
 */
export async function discoverDeviceOnNetwork(onProgress) {
  const log = onProgress || (() => {});

  let phoneIP = null;
  try {
    phoneIP = await WifiManager.getIP();
  } catch (e) {
    console.log('[Discovery] Could not get phone IP:', e.message);
    return null;
  }

  if (!phoneIP) return null;

  const parts = phoneIP.split('.');
  if (parts.length !== 4) return null;
  const subnet = parts.slice(0, 3).join('.') + '.';

  log(`Scanning ${subnet}0/24...`);

  // Fire all 254 requests simultaneously — first valid response wins
  return new Promise((resolve) => {
    let found = false;
    let pending = 254;

    for (let i = 1; i <= 254; i++) {
      const ip = subnet + i;
      fetch(`http://${ip}/status?token=${WS_AUTH_KEY}`, { signal: AbortSignal.timeout(1500) })
        .then((resp) => (resp.ok ? resp.json() : null))
        .then((data) => {
          if (!found && data && typeof data.led === 'boolean') {
            found = true;
            log(`Found device at ${ip}`);
            resolve(data.ip || ip);
          }
        })
        .catch(() => {})
        .finally(() => {
          pending--;
          if (pending === 0 && !found) {
            log('No device found on subnet.');
            resolve(null);
          }
        });
    }
  });
}

// ── Main entry point ────────────────────────────────────────────────

/**
 * Try NSD first (fast, ~1-3s), then fall back to subnet scan.
 *
 * @param {(msg: string) => void} [onProgress] - Optional progress callback
 * @returns {Promise<string|null>} - Device IP if found, null otherwise
 */
export async function findDevice(onProgress) {
  const log = onProgress || (() => {});

  // Strategy 1: NSD / Zeroconf (instant on Android)
  log('Looking for device via NSD...');
  const nsdResult = await discoverDeviceViaNSD(onProgress);
  if (nsdResult) return nsdResult;

  // Strategy 2: Subnet scan (reliable fallback)
  log('NSD failed. Scanning local network...');
  return await discoverDeviceOnNetwork(onProgress);
}
