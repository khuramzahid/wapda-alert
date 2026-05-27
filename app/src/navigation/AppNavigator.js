import React, { useState, useEffect } from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, ActivityIndicator, StyleSheet, Animated, Easing } from 'react-native';

import SetupScreen from '../screens/SetupScreen';
import ControlScreen from '../screens/ControlScreen';
import { loadDevice, saveDevice } from '../services/DeviceStorage';
import { findDevice } from '../services/DiscoveryService';
import { colors, fonts, spacing } from '../theme/colors';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const [initialRoute, setInitialRoute] = useState(null);
  const [statusMsg, setStatusMsg] = useState('Checking saved device...');
  const pulseAnim = React.useRef(new Animated.Value(0.6)).current;

  // Pulse animation for the loading icon
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.6,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    const checkDevice = async () => {
      // 1. Check if we already have a saved device
      const device = await loadDevice();
      if (device) {
        // Verify the saved device is still reachable
        setStatusMsg('Checking saved device...');
        try {
          const resp = await fetch(`http://${device.ip}/status`, {
            signal: AbortSignal.timeout(3000),
          });
          if (resp.ok) {
            setInitialRoute('Control');
            return;
          }
        } catch (e) {
          // Saved device unreachable — try rediscovery
          setStatusMsg('Saved device unreachable. Scanning network...');
        }

        // Try to rediscover (device IP may have changed via DHCP)
        const newIP = await findDevice(setStatusMsg);
        if (newIP) {
          await saveDevice({ ...device, ip: newIP });
          setInitialRoute('Control');
          return;
        }

        // Device not found — still go to Control (it will handle reconnection)
        setInitialRoute('Control');
        return;
      }

      // 2. No saved device — try auto-discovery on the local network
      setStatusMsg('Looking for devices on your network...');
      const discoveredIP = await findDevice(setStatusMsg);

      if (discoveredIP) {
        // Found a device! Save it and go to Control
        await saveDevice({
          ip: discoveredIP,
          mac: 'auto-discovered',
          apSSID: 'unknown',
        });
        setInitialRoute('Control');
      } else {
        // No device found — show Setup screen
        setInitialRoute('Setup');
      }
    };

    checkDevice();
  }, []);

  // Show loading while discovering
  if (!initialRoute) {
    return (
      <View style={styles.loading}>
        <Animated.Text style={[styles.loadingIcon, { opacity: pulseAnim }]}>
          ⚡
        </Animated.Text>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: spacing.md }} />
        <Text style={styles.loadingTitle}>WAPDA Alert</Text>
        <Text style={styles.loadingStatus}>{statusMsg}</Text>
      </View>
    );
  }

  const customTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: colors.primary,
      background: colors.bg,
      card: colors.bgCard,
      text: colors.textPrimary,
      border: colors.border,
      notification: colors.danger,
    },
  };

  return (
    <NavigationContainer theme={customTheme}>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="Setup" component={SetupScreen} />
        <Stack.Screen name="Control" component={ControlScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
    padding: spacing.xl,
  },
  loadingIcon: {
    fontSize: 56,
    marginBottom: spacing.lg,
  },
  loadingTitle: {
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  loadingStatus: {
    fontSize: fonts.sizes.sm,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
