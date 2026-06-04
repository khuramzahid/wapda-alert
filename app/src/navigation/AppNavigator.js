import React, { useState, useEffect } from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, ActivityIndicator, StyleSheet, Animated, Easing } from 'react-native';

import SetupScreen from '../screens/SetupScreen';
import ControlScreen from '../screens/ControlScreen';
import { loadDevice } from '../services/DeviceStorage';
import { colors, fonts, spacing } from '../theme/colors';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const [initialRoute, setInitialRoute] = useState(null);
  const [statusMsg, setStatusMsg] = useState('Loading...');
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
      setStatusMsg('Checking saved device...');
      const device = await loadDevice();
      const ip = device?.deviceIp || device?.ip;
      
      // Validate that the stored IP is a well-formed dotted-quad address.
      // This guards against stale/corrupt AsyncStorage entries surviving
      // across app reinstalls on Android.
      const isValidIP = ip && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip);

      if (device && isValidIP) {
        // Everyday Use: We have a saved device, go straight to control (Instant)
        setInitialRoute('Control');
      } else {
        // First launch / no saved device / corrupt data: always go to Setup.
        // Users can choose "Find on Network" from Setup if they want discovery.
        if (device && !isValidIP) {
          // Clear the corrupt entry so it doesn't confuse future launches
          const { clearDevice } = require('../services/DeviceStorage');
          await clearDevice();
        }
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
