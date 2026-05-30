# WAPDA Alert — React Native App

A React Native (Expo) app for Android that provisions, controls, and monitors an ESP8266-based power alert device.

---

## Setup Instructions

### 1. Flash the Updated Firmware

Open `firmware/main.ino` in Arduino IDE and upload — the Serial Monitor should now show a unique AP name like `WAPDA-Alert-0F2F`.

### 2. Install Dependencies

```bash
cd /home/aisha/Documents/ESP8266/wapda-alert/app
npm install
```

### 3. Build the Development APK

Since this uses native modules (WiFi, background service), you need a dev build.

**Option A — Local build** (requires Android SDK):

```bash
npx expo run:android
```

**Option B — Cloud build via EAS**:

```bash
npm install -g eas-cli
eas login
eas build -p android --profile development
```

### 4. Run

```bash
npx expo start --dev-client
```

Scan the QR code from the dev build app on your phone.

---

## Building a Release APK

To build a standalone APK for your phone:

```bash
npm run build:apk
```

> ⚠️ **IMPORTANT: Do NOT use `expo prebuild --clean`**
>
> The `android/` directory contains manual native configurations that are required for this app to function, including:
> - `android:usesCleartextTraffic="true"` (Allows HTTP traffic to the ESP8266)
> - `CHANGE_WIFI_MULTICAST_STATE` permission (Required for mDNS discovery)
> - `dataSync` foreground service type (Fixes Android 14+ crashes)
>
> Running `expo prebuild --clean` will delete the `android/` directory and regenerate it from scratch, which will erase these necessary manual changes and break the app. Always use `npx expo run:android` or the `build:apk` script instead.

---

## Security To-Dos
The following security vulnerabilities have been identified. Items marked ✅ are resolved.

### Firmware / Hardware Security
1. ✅ **WPA2 Setup WiFi Network:** The setup AP (`WAPDA-Alert-XXXX`) is now protected with WPA2 password `wapda1234`. The app auto-fills this password — users are never prompted.
2. ✅ **Authenticated WebSocket Access:** The WebSocket server and `/status` endpoint now require token-based authentication. Clients must send `AUTH:<shared_secret>` after connecting. Unauthenticated clients are disconnected.
3. ❌ **Encrypted WebSocket Traffic (WSS):** *Attempted but reverted.* The `arduinoWebSockets` library does not support `wss://` for servers. Furthermore, React Native strictly rejects self-signed certificates for local WebSockets. We must rely on `ws://` secured by the Token-Based Authentication implemented in Issue 2.
4. **Plaintext Credential Storage:** The device stores home WiFi passwords in flash memory (EEPROM/NVS) in plain text. **Mitigation options:**
   - **Best (ESP32 only):** Enable ESP-IDF NVS Encryption (`CONFIG_SECURE_FLASH_ENC_ENABLED`). Requires building with ESP-IDF instead of Arduino IDE. The NVS partition is automatically encrypted at rest using a hardware key.
   - **Lightweight (ESP8266/ESP32):** XOR-encrypt the password with the device's MAC address before storing. This makes casual memory dumps useless without the specific device's MAC address.

### React Native App Security
1. ❌ **Cleartext Traffic Restricted:** *Attempted but reverted.* Android's Network Security Config does not support allowing IP ranges (like `192.168.*.*`). Because we must use `ws://` (cleartext) to communicate with the ESP32 dynamically on the local network, `cleartextTrafficPermitted` must remain `true`.
2. **NPM Dependency Vulnerabilities:** Run the following to resolve known CVEs in the build chain:
   ```bash
   cd app
   npx expo install expo@latest   # Upgrade Expo SDK + compatible deps
   npx expo-doctor                # Check for version mismatches
   npm audit fix                  # Fix remaining resolvable vulnerabilities
   ```

### Input Sanitization
1. ✅ **WebSocket Message Validation:** Both firmware and app validate incoming messages with length checks, character sanitization, and protocol allowlisting.
