import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Animated,
  Easing,
  StatusBar,
  Alert,
  Dimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, fonts, spacing, radii } from '../theme/colors';
import {
  scanForDevices,
  connectToDeviceAP,
  disconnectFromAP,
  fetchDeviceInfo,
  requestLocationPermission,
} from '../services/WifiService';
import { saveDevice } from '../services/DeviceStorage';
import {
  requestNotificationPermission,
  startBackgroundMonitoring,
} from '../services/BackgroundService';
import { findDevice } from '../services/DiscoveryService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Stages ──
const STAGE = {
  SCANNING: 'scanning',
  CONNECTING: 'connecting',
  CONFIGURING: 'configuring',
  WAITING: 'waiting',
};

export default function SetupScreen({ navigation }) {
  const [stage, setStage] = useState(STAGE.SCANNING);
  const [devices, setDevices] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [selectedAP, setSelectedAP] = useState(null);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [error, setError] = useState(null);
  const [waitMessage, setWaitMessage] = useState('');

  // Animated values
  const pulseAnim = useRef(new Animated.Value(0.6)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ── Pulse animation for radar ──
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.6,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // ── Fade in on mount ──
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  // ── Auto-scan on mount ──
  useEffect(() => {
    handleScan();
  }, []);

  // ── WiFi Scan ──
  const handleScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const results = await scanForDevices();
      setDevices(results);
      if (results.length === 0) {
        setError('No WAPDA Alert devices found. Make sure the device is in setup mode.');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setScanning(false);
    }
  }, []);

  // ── Connect to device AP ──
  const handleSelectDevice = useCallback(async (device) => {
    setSelectedAP(device.SSID);
    setStage(STAGE.CONNECTING);
    setError(null);

    try {
      await connectToDeviceAP(device.SSID);

      // Brief pause to let the connection stabilize
      await new Promise((r) => setTimeout(r, 2000));

      // Fetch device info from the AP
      try {
        const info = await fetchDeviceInfo();
        setDeviceInfo(info);
      } catch (e) {
        // Info endpoint may not respond immediately, use AP SSID as fallback
        setDeviceInfo({ mac: 'unknown', ssid: device.SSID });
      }

      setStage(STAGE.CONFIGURING);
    } catch (e) {
      setError('Failed to connect to ' + device.SSID + ': ' + e.message);
      setStage(STAGE.SCANNING);
    }
  }, []);

  // ── WebView message handler — detect successful config ──
  const handleWebViewNavigationChange = useCallback(
    (navState) => {
      // We inject JS to detect the success message
    },
    []
  );

  const INJECTED_JS = `
    (function() {
      // Poll for the success message in the captive portal
      var checkInterval = setInterval(function() {
        var status = document.getElementById('status');
        if (status && status.textContent.indexOf('Saved!') !== -1) {
          clearInterval(checkInterval);
          window.ReactNativeWebView.postMessage('CONFIG_DONE');
        }
      }, 500);
      true;
    })();
  `;


  const handleWebViewMessage = useCallback(
    async (event) => {
      if (event.nativeEvent.data === 'CONFIG_DONE') {
        setStage(STAGE.WAITING);
        setWaitMessage('Device saved WiFi credentials.\nDisconnecting from setup AP...');

        // Disconnect from the ESP8266 AP
        await disconnectFromAP();

        setWaitMessage('Reconnecting to your home WiFi...');
        await new Promise((r) => setTimeout(r, 5000));

        setWaitMessage('Waiting for device to join the network...');

        // Give the ESP8266 time to restart and connect (~8-12 seconds)
        await new Promise((r) => setTimeout(r, 5000));

        // Discover the device on the home network
        const deviceIP = await findDevice(setWaitMessage);

        if (deviceIP) {
          // Save the device info
          await saveDevice({
            ip: deviceIP,
            mac: deviceInfo?.mac || 'unknown',
            apSSID: selectedAP,
          });

          // Request notification permission & auto-start background monitoring
          setWaitMessage('Device found! Setting up notifications...');
          const hasPermission = await requestNotificationPermission();
          if (hasPermission) {
            try {
              await startBackgroundMonitoring(deviceIP);
            } catch (e) {
              console.log('Background monitoring setup deferred:', e.message);
            }
          }

          setWaitMessage('All set! Opening controls...');
          await new Promise((r) => setTimeout(r, 1000));

          // Navigate to Control screen
          navigation.replace('Control');
        } else {
          setError(
            'Could not find the device on your home network. ' +
            'Please make sure the device and phone are on the same WiFi network, then try again.'
          );
          setStage(STAGE.SCANNING);
        }
      }
    },
    [deviceInfo, selectedAP, navigation]
  );

  // ── Signal strength helper ──
  const getSignalIcon = (level) => {
    if (level >= -50) return { icon: '📶', label: 'Excellent' };
    if (level >= -60) return { icon: '📶', label: 'Good' };
    if (level >= -70) return { icon: '📶', label: 'Fair' };
    return { icon: '📶', label: 'Weak' };
  };

  const getSignalColor = (level) => {
    if (level >= -50) return colors.success;
    if (level >= -60) return colors.primaryLight;
    if (level >= -70) return colors.warning;
    return colors.danger;
  };

  // ── Render: Scanning Stage ──
  const renderScanning = () => (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      {/* Header */}
      <View style={styles.header}>
        <Animated.Text
          style={[styles.radarIcon, { opacity: pulseAnim, transform: [{ scale: pulseAnim }] }]}
        >
          📡
        </Animated.Text>
        <Text style={styles.title}>Device Setup</Text>
        <Text style={styles.subtitle}>
          Scanning for WAPDA Alert devices in setup mode
        </Text>
      </View>

      {/* Error */}
      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      )}

      {/* Device List */}
      <FlatList
        data={devices}
        keyExtractor={(item) => item.BSSID || item.SSID}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const signal = getSignalIcon(item.level);
          return (
            <TouchableOpacity
              style={styles.deviceCard}
              activeOpacity={0.7}
              onPress={() => handleSelectDevice(item)}
            >
              <View style={styles.deviceIcon}>
                <Text style={{ fontSize: 28 }}>⚡</Text>
              </View>
              <View style={styles.deviceInfo}>
                <Text style={styles.deviceSSID}>{item.SSID}</Text>
                <Text style={styles.deviceMeta}>
                  {signal.label} signal • {item.level} dBm
                </Text>
              </View>
              <View
                style={[
                  styles.signalBadge,
                  { backgroundColor: getSignalColor(item.level) + '20' },
                ]}
              >
                <Text
                  style={[
                    styles.signalText,
                    { color: getSignalColor(item.level) },
                  ]}
                >
                  {item.level} dBm
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          !scanning && !error ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyText}>No devices found</Text>
              <Text style={styles.emptySubtext}>
                Press the reset button on your ESP8266{'\n'}to enter setup mode,
                then scan again.
              </Text>
            </View>
          ) : null
        }
      />

      {/* Scan Button */}
      <TouchableOpacity
        style={[styles.scanButton, scanning && styles.scanButtonDisabled]}
        onPress={handleScan}
        disabled={scanning}
        activeOpacity={0.8}
      >
        {scanning ? (
          <ActivityIndicator color={colors.white} size="small" />
        ) : (
          <Text style={styles.scanButtonText}>🔄  Scan Again</Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );

  // ── Render: Connecting Stage ──
  const renderConnecting = () => (
    <View style={styles.centeredContainer}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.connectingText}>
        Connecting to{'\n'}
        <Text style={styles.connectingSSID}>{selectedAP}</Text>
      </Text>
      <Text style={styles.connectingHint}>
        Your phone will temporarily disconnect{'\n'}from your home WiFi
      </Text>
    </View>
  );

  // ── Render: Configuring Stage (WebView) ──
  const renderConfiguring = () => (
    <View style={styles.webviewContainer}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgCard} />

      {/* WebView Header Bar */}
      <View style={styles.webviewHeader}>
        <TouchableOpacity
          onPress={() => {
            Alert.alert(
              'Cancel Setup',
              'Are you sure you want to cancel device configuration?',
              [
                { text: 'Continue Setup', style: 'cancel' },
                {
                  text: 'Cancel',
                  style: 'destructive',
                  onPress: async () => {
                    await disconnectFromAP();
                    setStage(STAGE.SCANNING);
                  },
                },
              ]
            );
          }}
        >
          <Text style={styles.webviewBackBtn}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.webviewTitle}>WiFi Configuration</Text>
        <View style={{ width: 40 }} />
      </View>

      <WebView
        source={{ uri: 'http://192.168.4.1/' }}
        style={styles.webview}
        injectedJavaScript={INJECTED_JS}
        onMessage={handleWebViewMessage}
        onNavigationStateChange={handleWebViewNavigationChange}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={styles.webviewLoading}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.webviewLoadingText}>
              Loading device configuration...
            </Text>
          </View>
        )}
      />
    </View>
  );

  // ── Render: Waiting Stage ──
  const renderWaiting = () => (
    <View style={styles.centeredContainer}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <Animated.Text
        style={[styles.waitingIcon, { opacity: pulseAnim }]}
      >
        ⏳
      </Animated.Text>
      <ActivityIndicator
        size="large"
        color={colors.primary}
        style={{ marginBottom: spacing.lg }}
      />
      <Text style={styles.waitingText}>{waitMessage}</Text>

      {error && (
        <View style={[styles.errorCard, { marginTop: spacing.lg }]}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
          <TouchableOpacity
            style={[styles.scanButton, { marginTop: spacing.md }]}
            onPress={() => {
              setError(null);
              setStage(STAGE.SCANNING);
            }}
          >
            <Text style={styles.scanButtonText}>Back to Scan</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  // ── Main Render Switch ──
  switch (stage) {
    case STAGE.SCANNING:
      return renderScanning();
    case STAGE.CONNECTING:
      return renderConnecting();
    case STAGE.CONFIGURING:
      return renderConfiguring();
    case STAGE.WAITING:
      return renderWaiting();
    default:
      return renderScanning();
  }
}

// ── Styles ──
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: StatusBar.currentHeight || 44,
  },
  centeredContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  webviewContainer: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  // Header
  header: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  radarIcon: {
    fontSize: 56,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fonts.sizes.xxl,
    fontWeight: fonts.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fonts.sizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Error
  errorCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.dangerGlow,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.danger + '30',
  },
  errorText: {
    color: colors.danger,
    fontSize: fonts.sizes.sm,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Device List
  list: {
    flex: 1,
    marginTop: spacing.md,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deviceIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.primaryGlow,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceSSID: {
    fontSize: fonts.sizes.md,
    fontWeight: fonts.weights.semibold,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  deviceMeta: {
    fontSize: fonts.sizes.xs,
    color: colors.textMuted,
  },
  signalBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  signalText: {
    fontSize: fonts.sizes.xs,
    fontWeight: fonts.weights.semibold,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  emptySubtext: {
    fontSize: fonts.sizes.sm,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Scan Button
  scanButton: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanButtonDisabled: {
    opacity: 0.5,
  },
  scanButtonText: {
    color: colors.white,
    fontSize: fonts.sizes.md,
    fontWeight: fonts.weights.semibold,
  },

  // Connecting Stage
  connectingText: {
    fontSize: fonts.sizes.lg,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 28,
  },
  connectingSSID: {
    color: colors.primary,
    fontWeight: fonts.weights.bold,
  },
  connectingHint: {
    fontSize: fonts.sizes.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 20,
  },

  // WebView
  webviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgCard,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    paddingTop: (StatusBar.currentHeight || 44) + spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  webviewBackBtn: {
    fontSize: 22,
    color: colors.textSecondary,
    padding: spacing.sm,
  },
  webviewTitle: {
    fontSize: fonts.sizes.md,
    fontWeight: fonts.weights.semibold,
    color: colors.textPrimary,
  },
  webview: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  webviewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  webviewLoadingText: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    marginTop: spacing.md,
  },

  // Waiting Stage
  waitingIcon: {
    fontSize: 56,
    marginBottom: spacing.lg,
  },
  waitingText: {
    fontSize: fonts.sizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
});
