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
npx expo prebuild --platform android
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
