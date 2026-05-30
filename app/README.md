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
3. ✅ **Encrypted WebSocket Traffic (WSS):** Firmware rewritten for ESP32-only with TLS. Communication uses `wss://` with a self-signed RSA-2048 certificate embedded in the firmware.
4. **Plaintext Credential Storage:** The ESP32 stores home WiFi passwords in NVS (Non-Volatile Storage) in plain text. **Mitigation options:**
   - **Best:** Enable ESP-IDF NVS Encryption (`CONFIG_SECURE_FLASH_ENC_ENABLED`). Requires building with ESP-IDF instead of Arduino IDE. The NVS partition is automatically encrypted at rest using a hardware key.
   - **Lightweight:** XOR-encrypt the password with the device's MAC address before storing via `Preferences`. This makes casual NVS dumps useless without the specific device's MAC address.

### React Native App Security
1. ✅ **Cleartext Traffic Restricted:** Replaced blanket `usesCleartextTraffic="true"` with a Network Security Config (`res/xml/network_security_config.xml`) that allows cleartext HTTP only to `192.168.4.1` (the ESP32 captive portal). All other traffic enforces HTTPS/TLS.
2. **NPM Dependency Vulnerabilities:** Run the following to resolve known CVEs in the build chain:
   ```bash
   cd app
   npx expo install expo@latest   # Upgrade Expo SDK + compatible deps
   npx expo-doctor                # Check for version mismatches
   npm audit fix                  # Fix remaining resolvable vulnerabilities
   ```

### Input Sanitization
1. ✅ **WebSocket Message Validation:** Both firmware and app validate incoming messages with length checks, character sanitization, and protocol allowlisting.
