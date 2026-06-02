import { PermissionsAndroid, Platform } from 'react-native';
import WifiManager from 'react-native-wifi-reborn';

const AP_PREFIX = 'WAPDA-Alert';

/**
 * Request ACCESS_FINE_LOCATION permission (required for WiFi scanning on Android).
 * @returns {Promise<boolean>}
 */
export async function requestLocationPermission() {
  if (Platform.OS !== 'android') return true;

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: 'Location Permission Required',
      message:
        'WAPDA Alert needs location access to scan for nearby ESP8266 devices over WiFi.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    }
  );

  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Scan WiFi networks and return only those matching the WAPDA-Alert AP prefix.
 * @returns {Promise<Array<{ SSID: string, BSSID: string, level: number }>>}
 */
export async function scanForDevices() {
  const hasPermission = await requestLocationPermission();
  if (!hasPermission) {
    throw new Error('Location permission denied. Cannot scan WiFi networks.');
  }

  const networks = await WifiManager.loadWifiList();

  // Filter to only show our device APs, deduplicate by SSID
  const seen = new Set();
  const filtered = [];

  for (const net of networks) {
    if (net.SSID && net.SSID.startsWith(AP_PREFIX) && !seen.has(net.SSID)) {
      seen.add(net.SSID);
      filtered.push(net);
    }
  }

  // Sort by signal strength (strongest first)
  filtered.sort((a, b) => b.level - a.level);
  return filtered;
}

/**
 * Connect the phone to an ESP8266 AP (open network, no password).
 * @param {string} ssid - The AP SSID to connect to (e.g., "WAPDA-Alert-0F2F")
 * @returns {Promise<void>}
 */
export async function connectToDeviceAP(ssid) {
  const hasPermission = await requestLocationPermission();
  if (!hasPermission) {
    throw new Error('Location permission denied.');
  }

  // Connect to open (no password) network
  // connectToProtectedSSID(ssid, password, isWEP, isHidden)
  await WifiManager.connectToProtectedSSID(ssid, '', false, false);
}

/**
 * Disconnect from the current WiFi network.
 * The phone will auto-reconnect to its preferred home network.
 */
export async function disconnectFromAP() {
  try {
    await WifiManager.disconnect();
  } catch (e) {
    // Ignore — phone may have already disconnected
    console.log('WifiService: disconnect notice:', e.message);
  }
}


/**
 * Fetch device info from the ESP8266 captive portal /info endpoint.
 * Call this while connected to the device's AP.
 * @returns {Promise<{ mac: string, ssid: string }>}
 */
export async function fetchDeviceInfo() {
  const resp = await fetch('http://192.168.4.1/info', { timeout: 5000 });
  if (!resp.ok) throw new Error('Failed to fetch device info');
  return await resp.json();
}
