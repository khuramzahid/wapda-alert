import BackgroundService from 'react-native-background-actions';
import * as Notifications from 'expo-notifications';
import WebSocketService from './WebSocketService';

// Configure notification handler for foreground display
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const NOTIFICATION_CHANNEL_ID = 'wapda-power-alerts';

/**
 * Request notification permissions from the user.
 */
export async function requestNotificationPermission() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') {
    console.warn('Notification permission not granted');
    return false;
  }

  // Create Android notification channel
  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
    name: 'Power Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#3b82f6',
    sound: 'default',
  });

  return true;
}

/**
 * Send a local notification for power state changes.
 */
async function sendPowerNotification(powerOn) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: powerOn ? '✅ Power Restored' : '⚡ Power Went OFF',
      body: powerOn
        ? 'WAPDA power has been restored. The device LED is back ON.'
        : 'WAPDA power has gone OFF. The device LED turned OFF.',
      channelId: NOTIFICATION_CHANNEL_ID,
      priority: 'high',
    },
    trigger: null, // Immediate
  });
}

// Background task configuration
const bgOptions = {
  taskName: 'WAPDA Alert Monitor',
  taskTitle: 'WAPDA Alert',
  taskDesc: 'Monitoring power status...',
  taskIcon: {
    name: 'ic_launcher',
    type: 'mipmap',
  },
  color: '#3b82f6',
  linkingURI: 'wapdaalert://',
  // Required for Android 14+ (SDK 34): must match AndroidManifest.xml
  foregroundServiceType: ['dataSync'],
  progressBar: {
    max: 100,
    value: 0,
    indeterminate: true,
  },
  parameters: {
    delay: 1000,
  },
};

/**
 * The background task loop.
 * Keeps the WebSocket connection alive and sends notifications on state changes.
 */
const backgroundTask = async (taskData) => {
  const { delay } = taskData;
  let lastConnectionState = null; // null until first callback

  // Register state change listener for notifications
  const unsubState = WebSocketService.onStateChange((ledOn, changed) => {
    if (changed) {
      sendPowerNotification(ledOn);
    }
  });

  // Register connection listener to detect power loss
  const unsubConn = WebSocketService.onConnectionChange((isConnected) => {
    // Deduplicate: onclose can fire repeatedly during reconnect attempts.
    // Only notify when the connection state actually transitions.
    if (lastConnectionState === isConnected) return;
    lastConnectionState = isConnected;

    if (!isConnected) {
      // Device disconnected (power likely went out and device died)
      sendPowerNotification(false);
    }
    // When reconnected, we wait for an actual LED state update to send "Power Restored".
  });

  // Keep the task alive indefinitely
  await new Promise((resolve) => {
    const checkInterval = setInterval(async () => {
      if (!BackgroundService.isRunning()) {
        clearInterval(checkInterval);
        unsubState();
        unsubConn();
        resolve();
      }
    }, delay);
  });
};

/**
 * Start background monitoring.
 * Must be called AFTER WebSocketService.connect() has been established.
 * @param {string} ip - Device IP to maintain connection to
 */
export async function startBackgroundMonitoring(ip) {
  // Ensure notification permission
  await requestNotificationPermission();

  // If WebSocket isn't connected yet, connect it
  if (!WebSocketService.isConnected()) {
    WebSocketService.connect(ip);
  }

  // Start the foreground service
  if (!BackgroundService.isRunning()) {
    await BackgroundService.start(backgroundTask, bgOptions);
    console.log('[BG] Background monitoring started');
  }
}

/**
 * Stop background monitoring.
 */
export async function stopBackgroundMonitoring() {
  if (BackgroundService.isRunning()) {
    await BackgroundService.stop();
    console.log('[BG] Background monitoring stopped');
  }
}

/**
 * Check if background monitoring is currently active.
 */
export function isBackgroundMonitoringActive() {
  return BackgroundService.isRunning();
}
