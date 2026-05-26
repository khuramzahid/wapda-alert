import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_KEY = '@wapda_alert_device';

/**
 * Save provisioned device info.
 * @param {{ ip: string, mac: string, apSSID: string }} device
 */
export async function saveDevice(device) {
  try {
    await AsyncStorage.setItem(DEVICE_KEY, JSON.stringify(device));
  } catch (e) {
    console.error('DeviceStorage: failed to save', e);
  }
}

/**
 * Load saved device info.
 * @returns {Promise<{ ip: string, mac: string, apSSID: string } | null>}
 */
export async function loadDevice() {
  try {
    const json = await AsyncStorage.getItem(DEVICE_KEY);
    return json ? JSON.parse(json) : null;
  } catch (e) {
    console.error('DeviceStorage: failed to load', e);
    return null;
  }
}

/**
 * Clear saved device info (forget device).
 */
export async function clearDevice() {
  try {
    await AsyncStorage.removeItem(DEVICE_KEY);
  } catch (e) {
    console.error('DeviceStorage: failed to clear', e);
  }
}
