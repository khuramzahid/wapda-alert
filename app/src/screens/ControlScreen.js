import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  Easing,
  Switch,
  Alert,
  Vibration,
} from 'react-native';
import { colors, fonts, spacing, radii } from '../theme/colors';
import WebSocketService from '../services/WebSocketService';
import { loadDevice, clearDevice } from '../services/DeviceStorage';
import {
  startBackgroundMonitoring,
  stopBackgroundMonitoring,
  isBackgroundMonitoringActive,
  requestNotificationPermission,
} from '../services/BackgroundService';

export default function ControlScreen({ navigation }) {
  const [ledOn, setLedOn] = useState(false);
  const [connected, setConnected] = useState(false);
  const [deviceIP, setDeviceIP] = useState('');
  const [connecting, setConnecting] = useState(true);

  // Animated values
  const glowAnim = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseRing = useRef(new Animated.Value(0)).current;

  // ── LED glow animation ──
  useEffect(() => {
    Animated.timing(glowAnim, {
      toValue: ledOn ? 1 : 0,
      duration: 600,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [ledOn]);

  // ── Connection pulse ring ──
  useEffect(() => {
    if (!connected) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseRing, {
            toValue: 1,
            duration: 1500,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseRing, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseRing.setValue(0);
    }
  }, [connected]);

  // ── Fade in on mount ──
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  // ── Connect to device on mount ──
  useEffect(() => {
    let unsubState;
    let unsubConn;

    const init = async () => {
      const device = await loadDevice();
      if (!device) {
        navigation.replace('Setup');
        return;
      }

      setDeviceIP(device.ip);

      // Sync initial state if already connected via background service
      if (WebSocketService.isConnected()) {
        setConnected(true);
        setConnecting(false);
        setLedOn(WebSocketService.getLastState() || false);
      }

      // Register listeners
      unsubState = WebSocketService.onStateChange((on, changed) => {
        setLedOn(on);
      });

      unsubConn = WebSocketService.onConnectionChange((isConn) => {
        setConnected(isConn);
        setConnecting(false);
      });

      // Automatically start background monitoring (which handles WebSocket connection)
      const hasPermission = await requestNotificationPermission();
      if (hasPermission) {
        await startBackgroundMonitoring(device.ip);
      } else {
        // Fallback to regular foreground connection if permission denied
        WebSocketService.connect(device.ip);
      }
    };

    init();

    return () => {
      if (unsubState) unsubState();
      if (unsubConn) unsubConn();
      // We no longer disconnect on unmount, background service keeps it alive!
    };
  }, [navigation]);

  // ── Toggle LED ──
  const handleToggle = useCallback(() => {
    if (!connected) return;

    Vibration.vibrate(30);

    // Button press animation
    Animated.sequence([
      Animated.timing(buttonScale, {
        toValue: 0.92,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScale, {
        toValue: 1,
        duration: 80,
        useNativeDriver: true,
      }),
    ]).start();

    const expectedState = !ledOn;
    WebSocketService.send(expectedState ? 'ON' : 'OFF');

    // Auto-remove device if no update is received within 5 seconds
    setTimeout(async () => {
      if (WebSocketService.getLastState() !== expectedState) {
        Alert.alert(
          'Device Unreachable',
          'No response received from the device. Removing device to allow network re-scan.'
        );
        await stopBackgroundMonitoring();
        WebSocketService.disconnect();
        await clearDevice();
        navigation.replace('Setup');
      }
    }, 5000);
  }, [connected, ledOn, navigation]);


  // ── Restart device ──
  const handleRestart = useCallback(() => {
    if (!connected) return;

    Alert.alert(
      'Factory Reset',
      'This will erase saved WiFi credentials and restart the ESP8266 into setup mode. You will need to reconfigure it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            Vibration.vibrate(50);
            WebSocketService.send('RESET');
            await stopBackgroundMonitoring();
            WebSocketService.disconnect();
            await clearDevice();
            navigation.replace('Setup');
          },
        },
      ]
    );
  }, [connected]);

  // ── Forget device ──
  const handleForget = useCallback(() => {
    Alert.alert(
      'Forget Device',
      'This will remove the saved device. You can set it up again later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget',
          style: 'destructive',
          onPress: async () => {
            await stopBackgroundMonitoring();
            WebSocketService.disconnect();
            await clearDevice();
            navigation.replace('Setup');
          },
        },
      ]
    );
  }, [navigation]);

  // ── Interpolations ──
  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.1, 0.6],
  });

  const glowScale = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1.2],
  });

  const ledColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.textMuted, colors.success],
  });

  const ringScale = pulseRing.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.8],
  });

  const ringOpacity = pulseRing.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.4, 0.2, 0],
  });

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>WAPDA Alert</Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: connected ? colors.success : colors.danger },
              ]}
            />
            <Text style={styles.statusLabel}>
              {connecting
                ? 'Connecting...'
                : connected
                ? 'Connected'
                : 'Disconnected'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => {
            Alert.alert('Settings', '', [
              {
                text: 'Add New Device',
                onPress: () => navigation.navigate('Setup'),
              },
              {
                text: 'Forget Device',
                style: 'destructive',
                onPress: handleForget,
              },
              { text: 'Cancel', style: 'cancel' },
            ]);
          }}
          style={styles.settingsBtn}
        >
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* ── LED Display ── */}
      <View style={styles.ledSection}>
        {/* Glow effect */}
        <Animated.View
          style={[
            styles.glowRing,
            {
              opacity: glowOpacity,
              transform: [{ scale: glowScale }],
              backgroundColor: ledOn ? colors.successGlow : colors.transparent,
              shadowColor: ledOn ? colors.success : colors.transparent,
            },
          ]}
        />

        {/* Pulse ring when disconnected */}
        {!connected && !connecting && (
          <Animated.View
            style={[
              styles.pulseRingOuter,
              {
                opacity: ringOpacity,
                transform: [{ scale: ringScale }],
              },
            ]}
          />
        )}

        {/* LED Circle */}
        <Animated.View style={[styles.ledCircle, { borderColor: ledColor }]}>
          <Text style={styles.ledEmoji}>{ledOn ? '💡' : '🔌'}</Text>
          <Animated.Text style={[styles.ledStatus, { color: ledColor }]}>
            {ledOn ? 'POWER ON' : 'POWER OFF'}
          </Animated.Text>
        </Animated.View>
      </View>

      {/* ── Toggle Button ── */}
      <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            ledOn ? styles.toggleButtonOff : styles.toggleButtonOn,
            !connected && styles.toggleButtonDisabled,
          ]}
          onPress={handleToggle}
          disabled={!connected}
          activeOpacity={0.8}
        >
          <Text style={styles.toggleButtonText}>
            {ledOn ? 'Turn OFF' : 'Turn ON'}
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* ── Info Cards ── */}
      <View style={styles.infoSection}>

        {/* Device Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoCardLeft}>
            <Text style={styles.infoCardIcon}>📟</Text>
            <View>
              <Text style={styles.infoCardTitle}>Device Info</Text>
              <Text style={styles.infoCardSubtitle}>
                IP: {deviceIP || '—'} • Port: 81
              </Text>
            </View>
          </View>
        </View>

        {/* Connection Stats Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoCardLeft}>
            <Text style={styles.infoCardIcon}>📊</Text>
            <View>
              <Text style={styles.infoCardTitle}>Status</Text>
              <Text style={styles.infoCardSubtitle}>
                LED: {ledOn ? 'ON' : 'OFF'} •{' '}
                {connected ? 'Real-time sync active' : 'Waiting for connection'}
              </Text>
            </View>
          </View>
        </View>

        {/* Restart Device Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoCardLeft}>
            <Text style={styles.infoCardIcon}>🔄</Text>
            <View>
              <Text style={styles.infoCardTitle}>Factory Reset</Text>
              <Text style={styles.infoCardSubtitle}>
                Erase credentials & enter setup mode
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[
              styles.restartBtn,
              !connected && styles.restartBtnDisabled,
            ]}
            onPress={handleRestart}
            disabled={!connected}
            activeOpacity={0.7}
          >
            <Text style={styles.restartBtnText}>Reset</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

// ── Styles ──
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: StatusBar.currentHeight || 44,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.bold,
    color: colors.textPrimary,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  statusLabel: {
    fontSize: fonts.sizes.sm,
    color: colors.textSecondary,
  },
  settingsBtn: {
    padding: spacing.sm,
  },
  settingsIcon: {
    fontSize: 24,
  },

  // LED Display
  ledSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    position: 'relative',
  },
  glowRing: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
    elevation: 20,
  },
  pulseRingOuter: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
    borderColor: colors.danger,
  },
  ledCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 3,
    backgroundColor: colors.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  ledEmoji: {
    fontSize: 52,
    marginBottom: spacing.sm,
  },
  ledStatus: {
    fontSize: fonts.sizes.sm,
    fontWeight: fonts.weights.bold,
    letterSpacing: 2,
  },

  // Toggle Button
  toggleButton: {
    marginHorizontal: spacing.xxl,
    paddingVertical: 18,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  toggleButtonOn: {
    backgroundColor: colors.success,
    shadowColor: colors.success,
  },
  toggleButtonOff: {
    backgroundColor: colors.danger,
    shadowColor: colors.danger,
  },
  toggleButtonDisabled: {
    backgroundColor: colors.borderLight,
    shadowColor: colors.transparent,
    opacity: 0.5,
  },
  toggleButtonText: {
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    color: colors.white,
    letterSpacing: 1,
  },

  // Info Cards
  infoSection: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  infoCardIcon: {
    fontSize: 24,
    marginRight: spacing.md,
  },
  infoCardTitle: {
    fontSize: fonts.sizes.md,
    fontWeight: fonts.weights.semibold,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  infoCardSubtitle: {
    fontSize: fonts.sizes.xs,
    color: colors.textMuted,
  },
  restartBtn: {
    backgroundColor: colors.danger,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
  },
  restartBtnDisabled: {
    backgroundColor: colors.borderLight,
    opacity: 0.5,
  },
  restartBtnText: {
    fontSize: fonts.sizes.sm,
    fontWeight: fonts.weights.bold,
    color: colors.textInverse,
  },
});
