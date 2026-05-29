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
