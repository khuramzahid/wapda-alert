# WAPDA Alert System ⚡

A robust IoT solution for monitoring local power grids (WAPDA) in real-time, featuring a custom ESP8266 hardware monitor and a beautiful React Native mobile application for instant notifications and seamless device management.

> **Note to recruiters & developers:** This repository serves as a portfolio project showcasing full-stack IoT capabilities, including embedded C++ firmware engineering, React Native mobile development, WebSocket networking, and custom network discovery protocols. 

[👉 **View the Project Landing Page**](https://your-github-username.github.io/wapda-alert/)

---

## 🌟 Salient Features

*   **Instant Hybrid Provisioning:** The ESP8266 hosts a temporary Captive Portal AP (`WAPDA-Alert-XXXX`). The React Native app connects directly to this AP and securely passes home WiFi credentials via a native-integrated WebView, receiving the newly assigned IP synchronously.
*   **Robust Network Discovery:** Fallback mechanism using a hybrid mDNS and Subnet Ping Sweep approach. If the device's IP changes, the app will automatically locate it on the home network without manual intervention.
*   **Persistent Background Monitoring:** The Android application automatically registers background services (via `expo-background-fetch` and `expo-task-manager`) to monitor the ESP8266's power state, pushing native Android notifications instantly when power events occur.
*   **Real-Time WebSocket Control:** Low-latency, bidirectional WebSocket communication ensures you see power state changes within milliseconds, and allows instant hardware control (e.g., toggling the onboard LED).
*   **Remote Management:** Over-The-Air (OTA) style factory reset capability. Users can remotely clear WiFi credentials and place the device back into setup mode directly from their mobile app.

---

## 🏗️ System Architecture

### 1. ESP8266 Firmware (`/firmware`)
Written in C++ for the Arduino framework.
*   **State Machine:** Dynamically switches between `WIFI_AP_STA` (Setup Mode) and `WIFI_STA` (Operational Mode).
*   **WebSockets:** Runs a WebSocket server on port 81 to push state changes to connected clients.
*   **EEPROM Storage:** Persists network credentials securely.
*   **HTTP Endpoints:** Provides `/scan` (scans local networks), `/save` (applies credentials), and `/status` (reports MAC address and IP for subnet discovery).

### 2. React Native App (`/app`)
Built with Expo and React Native.
*   **Native Discovery Engine:** Custom Javascript implementation to perform aggressive subnet sweeps combined with standard mDNS resolution.
*   **UI/UX:** Premium dark-mode interface built with custom theming and micro-animations to give a polished, responsive feel.
*   **Background Services:** Utilizes Expo's native background task runner to maintain the WebSocket heartbeat even when the app is minimized.

---

## 🚀 Getting Started

### Hardware Requirements
*   ESP8266 Development Board (e.g., NodeMCU or Wemos D1 Mini)
*   Micro-USB Cable
*   Android Device (for the mobile app)

### Firmware Installation
1. Open `firmware/main.ino` in the Arduino IDE.
2. Install the necessary libraries: `WebSockets` by Markus Sattler.
3. Select your ESP8266 board from the Tools menu.
4. Upload to the device.

### Mobile App Installation
1. Navigate to the `app` directory: `cd app`
2. Install dependencies: `npm install`
3. Since this project uses custom native modules (Background Fetch), you need to run a development build rather than standard Expo Go:
   ```bash
   npm run android
   ```

---

## 📱 Screenshots
*(Replace these placeholders with actual screenshots of your app)*

| Onboarding Flow | Network Scanning | Real-Time Dashboard |
| :---: | :---: | :---: |
| <img src="https://via.placeholder.com/250x500.png?text=Setup+Screen" width="250" /> | <img src="https://via.placeholder.com/250x500.png?text=Network+Scan" width="250" /> | <img src="https://via.placeholder.com/250x500.png?text=Dashboard" width="250" /> |

---

## 📄 License
This project is licensed under the MIT License.
