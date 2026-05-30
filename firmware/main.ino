// ============================================================
//  WAPDA Alert — ESP32 Firmware (TLS-enabled)
//  WiFi provisioning via SoftAP + Captive Portal
//  Secure WebSockets (wss://) with token authentication
// ============================================================

// -------------------- Platform Includes --------------------
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <DNSServer.h>
#include <WebSocketsServer.h>

// -------------------- Pin Definitions ----------------------
#ifndef LED_BUILTIN
  #define LED_BUILTIN 2
#endif

#define RESET_BUTTON 0  // GPIO0 — BOOT button on most dev boards

// -------------------- Constants ----------------------------
const char* AP_PREFIX        = "WAPDA-Alert";
char AP_SSID[24];  // Built dynamically: "WAPDA-Alert-XXXX" (MAC suffix)
const char* AP_PASSWORD      = "wapda1234";  // WPA2 password for setup AP
const char* MDNS_HOSTNAME    = "wapda-alert";
const int   DNS_PORT         = 53;
const int   HTTP_PORT        = 80;
const int   WS_PORT          = 81;
const unsigned long RESET_HOLD_MS   = 5000;  // 5-second hold to factory reset
const unsigned long WIFI_TIMEOUT_MS = 15000; // 15 seconds to connect before falling back to AP

// -------------------- Authentication -----------------------
const char* WS_AUTH_KEY = "wapda-secret-2026";  // Shared secret for WebSocket auth
#define MAX_WS_CLIENTS 5
bool clientAuthenticated[MAX_WS_CLIENTS] = { false };

// -------------------- TLS Certificate ----------------------
// Self-signed RSA-2048 certificate for wss:// (valid 10 years)
// Regenerate with: openssl req -x509 -nodes -newkey rsa:2048 -keyout key.pem -out cert.pem -days 3650 -subj "/CN=wapda-alert.local"
const char SSL_CERT[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
MIIDGTCCAgGgAwIBAgIUUBqJfFbQcvpEz+ZmrEOK/jyLukYwDQYJKoZIhvcNAQEL
BQAwHDEaMBgGA1UEAwwRd2FwZGEtYWxlcnQubG9jYWwwHhcNMjYwNTMwMTYzMTE3
WhcNMzYwNTI3MTYzMTE3WjAcMRowGAYDVQQDDBF3YXBkYS1hbGVydC5sb2NhbDCC
ASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAKv+uN1dY5XkKahiwZ+S2aWR
pC9yCKbGw8yfyqQQ/F1mtOQ8WyGeVsagmIACJCFxsE3Cy3GbcXgITKPmYpaBNTfG
HnYUTUAjQlFxjmvkbzFL6HjL7fWc/x+a1+UdQVdusMyhNPGXFpUBF22zi7FHOD5g
uK3bmdJPijTqtunSYKnDhqL5zQsPkoQwMW0UEqYBHSi3iYcYizWEfMs4vjRk1jKG
U9RF/ekkHByDTxcBDVPi7wmg0zqu0mDzLfLVbUkCoaWzS5Hls19GaFl8B3QO17vo
KrauQTFGQkUJ8PfkFSoqjPsnajOuVai7YPKf5wzmhmQrhVumlqiZkDPalBRkZD8C
AwEAAaNTMFEwHQYDVR0OBBYEFPogEAakP0v/3v8w+gGyIvy0+9gLMB8GA1UdIwQY
MBaAFPogEAakP0v/3v8w+gGyIvy0+9gLMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZI
hvcNAQELBQADggEBADbIrwqAvvyboxP05c/KrBFT0pclXiVCpvLfMPVXN7adSCpd
NMMDI+2bPKE+o1QW01jbR5j/k8J/eAb793aM57aZrOvYqAFR5FJCW5SATegXBnOs
8N3Bv2AOe0KIt1zE8bzPUyML96+MpMhhTf6Cj212pXzKaIfPxhwEpvBEiFzXGVez
xNuF1VIczLs+bRIA8oFGEZhklq7QD117malYpfYj6TOGGM2JJ1pDbtgdP45Mdljx
DLjMEHv7nTB2oal4l5NmQMs4k/Nevv6bmfbzOp1swxrMEwE3s8WCfQfojbKXu+u0
eJ8zc9bH0XeHNDTH6UxlYdDu/8yBe1WBrl+Zeeo=
-----END CERTIFICATE-----
)EOF";

const char SSL_KEY[] PROGMEM = R"EOF(
-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCr/rjdXWOV5Cmo
YsGfktmlkaQvcgimxsPMn8qkEPxdZrTkPFshnlbGoJiAAiQhcbBNwstxm3F4CEyj
5mKWgTU3xh52FE1AI0JRcY5r5G8xS+h4y+31nP8fmtflHUFXbrDMoTTxlxaVARdt
s4uxRzg+YLit25nST4o06rbp0mCpw4ai+c0LD5KEMDFtFBKmAR0ot4mHGIs1hHzL
OL40ZNYyhlPURf3pJBwcg08XAQ1T4u8JoNM6rtJg8y3y1W1JAqGls0uR5bNfRmhZ
fAd0Dte76Cq2rkExRkJFCfD35BUqKoz7J2ozrlWou2Dyn+cM5oZkK4VbppaomZAz
2pQUZGQ/AgMBAAECggEAAbn2Ur6CZo7vk3GeU5g5QriyBwnkKAG8axGQNVJi/hsE
UNAsSADwtQtdTIJOU4mdGpgMdmZNiXC9ODNH+mPEoXvbHWtPFTLlZ6+LSEOhkW3w
y5mcbgfhOwjRBvXity/KFYZpY3gVRsdH3Bbecu1DQBkKHDClRspRRFO2JKWzHlvE
VH79jznTLZ8ftcRuCOfQaBh19krxrb4LIpBia1bS2RADAHMKJ9aQm9xDqSs/WrxM
JAmSp/M7jNcLb5XSPMEERvEi5kS8/k1Qd5syh51nIPP+SbKSmtTvGhjCx7HkrSax
/FHeddHILFrSXSqm1UmUzh64bqyWi+TXyIEhqet1eQKBgQDuZ56XJ55g0rRLTP7v
MQTQfqWoHbvEU7rykLzPW3wCo2j2wGZHQmM1z0oPTxM7yCcdW5FsC+qo6OQikro4
BnEBLVfb9gqwWbvI0Y7is4LoAXnW1wLcTrh3Dp5afjAJpTkqD8XxstuZ2Z7hIKmN
XiDVOsxb7sJNr4SO/ID1gk+H5wKBgQC4sF4biUSLFyF8UTEKSm6GbKJ+mM+nauDf
SDoK2CqV/KbnwxuaSl9vxIymahz2U+U/W0gDzyRZLV5jywYyoup4225fK+tiWWon
UASzD9S+XIgtd7B3FTGnhyii0N8pZvaFnQW3Jh7RB5sVpl7nW/rn0xlJs5Sd4YQr
bymO2s5V6QKBgBk2hjQwMXTF8+Fe1DtRsNOoATcFZf0+abALlJxNbZEN3STzdh2l
LL7dHFUAJOWWpmRZcci+feO9NZtebylLrRnVxMvzem/qHY0AdJ8PIxIMTelltdy8
yo900VR6sfPjMGd9YY7NPqJHvKDMhoH36XsDi+dRGeWDYX6Jv823KVgTAoGAd4Pa
QmN/8apURwibfZdRErg2J0poBmUJhDRPKzlbxZerworlz+CVBdThV8ePWnBMB8Xg
QmbHlNXhIR7+scHvjaoiMIBRYGGQakRD5kQ2XcGvdgzgKw+SBGFYkJQt9bLlkO1e
B3kptAcB+u6gt4M0SNS4ppMJd2m6iAj1kbZSlBECgYBqXaNFXBH7zau16WnrHuYe
bdfTWG2uIqvIRmX6st0lAvjxaZ3j48nBzIyvpk3Fb4LXFhwnOC0f8ySp5lSewjdr
fKwv5tqt1HM8Zk6TtSfYAr3172nijFNpk4jQNpPM5lWNbvQpQRK9HZtUqTQ705MH
d71jpvkmu89ebsYP1yprQQ==
-----END PRIVATE KEY-----
)EOF";

// -------------------- Global State -------------------------
enum DeviceMode { MODE_SETUP, MODE_NORMAL };
DeviceMode currentMode = MODE_SETUP;

DNSServer       dnsServer;
WebServer       httpServer(HTTP_PORT);
WebSocketsServer webSocket(WS_PORT);

bool ledState = false;

// ESP32 built-in LED: HIGH = ON, LOW = OFF
#define LED_ON  HIGH
#define LED_OFF LOW

// -------------------- Credential Storage -------------------
Preferences prefs;

// ESP32 uses Preferences (NVS) for credential storage
String loadSSID() {
  prefs.begin("wifi", true);
  String s = prefs.getString("ssid", "");
  prefs.end();
  return s;
}

String loadPassword() {
  prefs.begin("wifi", true);
  String p = prefs.getString("pass", "");
  prefs.end();
  return p;
}

void saveCredentials(const String& ssid, const String& pass) {
  prefs.begin("wifi", false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.end();
  Serial.println("Credentials saved to NVS.");
}

void clearCredentials() {
  prefs.begin("wifi", false);
  prefs.clear();
  prefs.end();
  Serial.println("Credentials cleared from NVS.");
}

// -------------------- Captive Portal HTML ------------------
const char SETUP_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WAPDA Alert — WiFi Setup</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .card {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 32px 24px;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 25px 50px rgba(0,0,0,0.5);
    }
    .logo {
      text-align: center;
      margin-bottom: 24px;
    }
    .logo span {
      font-size: 36px;
    }
    h1 {
      text-align: center;
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 4px;
      color: #f8fafc;
    }
    .sub {
      text-align: center;
      font-size: 13px;
      color: #94a3b8;
      margin-bottom: 24px;
    }
    label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: #94a3b8;
      margin-bottom: 6px;
    }
    select, input[type="text"], input[type="password"] {
      width: 100%;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid #334155;
      background: #0f172a;
      color: #f8fafc;
      font-size: 15px;
      outline: none;
      margin-bottom: 16px;
      transition: border-color 0.2s;
    }
    select:focus, input:focus {
      border-color: #3b82f6;
    }
    .pass-wrap {
      position: relative;
    }
    .pass-wrap input { padding-right: 44px; }
    .toggle-pass {
      position: absolute;
      right: 10px;
      top: 10px;
      background: none;
      border: none;
      color: #64748b;
      cursor: pointer;
      font-size: 18px;
    }
    button[type="submit"] {
      width: 100%;
      padding: 14px;
      border: none;
      border-radius: 8px;
      background: linear-gradient(135deg, #3b82f6, #2563eb);
      color: #fff;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 8px;
      transition: opacity 0.2s;
    }
    button[type="submit"]:hover { opacity: 0.9; }
    button[type="submit"]:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .scan-btn {
      display: inline-block;
      background: none;
      border: 1px solid #334155;
      color: #94a3b8;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 12px;
      cursor: pointer;
      margin-bottom: 16px;
      transition: border-color 0.2s;
    }
    .scan-btn:hover { border-color: #3b82f6; color: #e2e8f0; }
    .status {
      text-align: center;
      font-size: 14px;
      margin-top: 16px;
      min-height: 20px;
    }
    .success { color: #4ade80; }
    .error { color: #f87171; }
    .manual-toggle {
      text-align: center;
      margin-bottom: 16px;
    }
    .manual-toggle a {
      color: #3b82f6;
      font-size: 13px;
      cursor: pointer;
      text-decoration: none;
    }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo"><span>⚡</span></div>
    <h1>WAPDA Alert</h1>
    <p class="sub">Connect your device to WiFi</p>

    <form id="wifiForm">
      <label for="ssidSelect">WiFi Network</label>
      <select id="ssidSelect">
        <option value="">Scanning...</option>
      </select>

      <div class="manual-toggle">
        <a onclick="toggleManual()">or enter manually</a>
      </div>

      <div id="manualInput" class="hidden">
        <label for="ssidManual">SSID</label>
        <input type="text" id="ssidManual" placeholder="Enter network name">
      </div>

      <label for="pass">Password</label>
      <div class="pass-wrap">
        <input type="password" id="pass" placeholder="Enter WiFi password">
        <button type="button" class="toggle-pass" onclick="togglePass()">👁</button>
      </div>

      <button type="submit" id="saveBtn">Save & Connect</button>
    </form>

    <p class="status" id="status"></p>
  </div>

  <script>
    let manualMode = false;

    function toggleManual() {
      manualMode = !manualMode;
      document.getElementById('manualInput').classList.toggle('hidden');
      document.getElementById('ssidSelect').classList.toggle('hidden');
    }

    function togglePass() {
      const p = document.getElementById('pass');
      p.type = p.type === 'password' ? 'text' : 'password';
    }

    function scanNetworks() {
      fetch('/scan')
        .then(r => r.json())
        .then(networks => {
          const sel = document.getElementById('ssidSelect');
          sel.innerHTML = '';
          if (networks.length === 0) {
            sel.innerHTML = '<option value="">No networks found</option>';
            return;
          }
          networks.forEach(n => {
            const opt = document.createElement('option');
            opt.value = n.ssid;
            opt.textContent = n.ssid + ' (' + n.rssi + ' dBm)';
            sel.appendChild(opt);
          });
        })
        .catch(() => {
          document.getElementById('ssidSelect').innerHTML =
            '<option value="">Scan failed — enter manually</option>';
        });
    }

    document.getElementById('wifiForm').addEventListener('submit', function(e) {
      e.preventDefault();
      const ssid = manualMode
        ? document.getElementById('ssidManual').value
        : document.getElementById('ssidSelect').value;
      const pass = document.getElementById('pass').value;
      const status = document.getElementById('status');

      if (!ssid) {
        status.className = 'status error';
        status.textContent = 'Please select or enter a WiFi network.';
        return;
      }

      document.getElementById('saveBtn').disabled = true;
      status.className = 'status';
      status.textContent = 'Saving...';

      fetch('/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'ssid=' + encodeURIComponent(ssid) + '&pass=' + encodeURIComponent(pass)
      })
      .then(r => r.text())
      .then(() => {
        status.className = 'status success';
        status.textContent = 'Saved! Device is restarting...';
      })
      .catch(() => {
        status.className = 'status error';
        status.textContent = 'Error saving. Please try again.';
        document.getElementById('saveBtn').disabled = false;
      });
    });

    scanNetworks();
  </script>
</body>
</html>
)rawliteral";

// -------------------- WebSocket Handlers -------------------

// Broadcast state only to authenticated clients
void broadcastState() {
  String msg = ledState ? "STATE:ON" : "STATE:OFF";
  for (uint8_t i = 0; i < MAX_WS_CLIENTS; i++) {
    if (clientAuthenticated[i]) {
      webSocket.sendTXT(i, msg);
    }
  }
}

void handleMessage(uint8_t num, String msg) {
  // Input sanitization: reject oversized messages
  if (msg.length() > 32) {
    Serial.println("Rejected oversized message from client " + String(num));
    return;
  }

  Serial.println("Received from client " + String(num) + ": " + msg);

  if (msg == "ON") {
    ledState = true;
    digitalWrite(LED_BUILTIN, LED_ON);
    broadcastState();
  } else if (msg == "OFF") {
    ledState = false;
    digitalWrite(LED_BUILTIN, LED_OFF);
    broadcastState();
  } else if (msg == "RESET") {
    Serial.println("Factory reset requested remotely.");
    // Send RESETTING only to authenticated clients
    for (uint8_t i = 0; i < MAX_WS_CLIENTS; i++) {
      if (clientAuthenticated[i]) {
        webSocket.sendTXT(i, "RESETTING");
      }
    }
    clearCredentials();
    delay(1000);
    ESP.restart();
  } else if (msg == "PING") {
    // Heartbeat — no action needed
  } else {
    Serial.println("Unknown command ignored: " + msg);
  }
}

void onEvent(uint8_t num, WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {

    case WStype_CONNECTED:
      Serial.println("Client " + String(num) + " connected — awaiting auth");
      // Mark as unauthenticated
      if (num < MAX_WS_CLIENTS) {
        clientAuthenticated[num] = false;
      }
      // Prompt client to authenticate
      webSocket.sendTXT(num, "AUTH_REQUIRED");
      break;

    case WStype_TEXT: {
      String msg = String((char*)payload).substring(0, length);

      // ── Authentication gate ──
      if (num < MAX_WS_CLIENTS && !clientAuthenticated[num]) {
        // Expect: AUTH:<shared_secret>
        if (msg.startsWith("AUTH:")) {
          String token = msg.substring(5);
          if (token == WS_AUTH_KEY) {
            clientAuthenticated[num] = true;
            Serial.println("Client " + String(num) + " authenticated");
            webSocket.sendTXT(num, "AUTH_OK");
            // Send current state after successful auth
            if (ledState) webSocket.sendTXT(num, "STATE:ON");
            else webSocket.sendTXT(num, "STATE:OFF");
          } else {
            Serial.println("Client " + String(num) + " auth FAILED");
            webSocket.sendTXT(num, "AUTH_FAIL");
            webSocket.disconnect(num);
          }
        } else {
          // Not an auth message — reject
          webSocket.sendTXT(num, "AUTH_REQUIRED");
        }
        break;
      }

      // ── Authenticated client — process command ──
      handleMessage(num, msg);
      break;
    }

    case WStype_DISCONNECTED:
      Serial.println("Client " + String(num) + " disconnected");
      if (num < MAX_WS_CLIENTS) {
        clientAuthenticated[num] = false;
      }
      break;
  }
}

// -------------------- HTTP Handlers (Setup Mode) -----------
void handleRoot() {
  httpServer.send_P(200, "text/html", SETUP_HTML);
}

void handleScan() {
  int n = WiFi.scanNetworks();
  String json = "[";
  for (int i = 0; i < n; i++) {
    if (i > 0) json += ",";
    json += "{\"ssid\":\"" + WiFi.SSID(i) + "\",\"rssi\":" + String(WiFi.RSSI(i)) + "}";
  }
  json += "]";
  httpServer.send(200, "application/json", json);
}

// Device info endpoint (available in setup mode for app provisioning)
void handleInfo() {
  String json = "{\"mac\":\"" + WiFi.macAddress() + "\",\"ssid\":\"" + String(AP_SSID) + "\"}";
  httpServer.send(200, "application/json", json);
}

// LED status endpoint (available in normal mode for app state polling)
// Protected by auth token query parameter: /status?token=<WS_AUTH_KEY>
void handleStatus() {
  String token = httpServer.arg("token");
  if (token != WS_AUTH_KEY) {
    httpServer.send(401, "text/plain", "Unauthorized");
    return;
  }
  String json = "{\"led\":";
  json += ledState ? "true" : "false";
  json += ",\"ip\":\"" + WiFi.localIP().toString() + "\"}";
  httpServer.send(200, "application/json", json);
}

void handleSave() {
  String ssid = httpServer.arg("ssid");
  String pass = httpServer.arg("pass");

  if (ssid.length() == 0) {
    httpServer.send(400, "text/plain", "SSID is required");
    return;
  }

  saveCredentials(ssid, pass);
  httpServer.send(200, "text/plain", "OK");

  Serial.println("Credentials saved. Restarting in 2 seconds...");
  delay(2000);
  ESP.restart();
}

// Redirect all unknown URLs to the setup page (captive portal behavior)
void handleNotFound() {
  httpServer.sendHeader("Location", "http://192.168.4.1/", true);
  httpServer.send(302, "text/plain", "");
}

// -------------------- Setup Mode ---------------------------
void startSetupMode() {
  currentMode = MODE_SETUP;

  Serial.println("\n=== SETUP MODE ===");
  Serial.println("Starting access point: " + String(AP_SSID));

  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASSWORD);

  delay(100);
  Serial.print("AP IP address: ");
  Serial.println(WiFi.softAPIP());

  // DNS server: redirect ALL domains to our IP (captive portal)
  dnsServer.start(DNS_PORT, "*", WiFi.softAPIP());

  // HTTP routes
  httpServer.on("/",     HTTP_GET,  handleRoot);
  httpServer.on("/scan", HTTP_GET,  handleScan);
  httpServer.on("/save", HTTP_POST, handleSave);
  httpServer.on("/info", HTTP_GET,  handleInfo);
  httpServer.onNotFound(handleNotFound);
  httpServer.begin();

  Serial.println("Captive portal running at http://192.168.4.1");
}

// -------------------- Normal Mode --------------------------
bool connectToWiFi(const String& ssid, const String& pass) {
  Serial.println("\nConnecting to WiFi: " + ssid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), pass.c_str());

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start > WIFI_TIMEOUT_MS) {
      Serial.println("\nWiFi connection timed out.");
      return false;
    }
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
  return true;
}

void startNormalMode() {
  currentMode = MODE_NORMAL;

  Serial.println("\n=== NORMAL MODE ===");

  // mDNS
  if (!MDNS.begin(MDNS_HOSTNAME)) {
    Serial.println("Error starting mDNS");
  } else {
    Serial.println("mDNS started: " + String(MDNS_HOSTNAME) + ".local");
    // Advertise HTTP service so Android NSD can discover us instantly
    MDNS.addService("http", "tcp", HTTP_PORT);
    Serial.println("mDNS service advertised: _http._tcp on port " + String(HTTP_PORT));
  }

  // HTTP server (for /status endpoint in normal mode)
  httpServer.on("/status", HTTP_GET, handleStatus);
  httpServer.begin();
  Serial.println("HTTP status endpoint active on port " + String(HTTP_PORT));

  // Secure WebSocket server (wss://)
  webSocket.beginSSL(SSL_CERT, SSL_KEY);
  webSocket.onEvent(onEvent);
  Serial.println("Secure WebSocket (wss://) started on port " + String(WS_PORT));
}

// -------------------- Factory Reset Check ------------------
void checkFactoryReset() {
  if (digitalRead(RESET_BUTTON) == LOW) {
    Serial.println("BOOT button held — hold for 5s to factory reset...");
    unsigned long pressStart = millis();

    while (digitalRead(RESET_BUTTON) == LOW) {
      if (millis() - pressStart > RESET_HOLD_MS) {
        Serial.println("\n!!! FACTORY RESET !!!");
        clearCredentials();

        // Blink LED rapidly to indicate reset
        for (int i = 0; i < 10; i++) {
          digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
          delay(100);
        }

        ESP.restart();
      }
      delay(50);
    }

    Serial.println("Button released before 5s — no reset.");
  }
}

// -------------------- Arduino Entry Points -----------------
void setup() {
  Serial.begin(115200);

  // Build unique AP SSID from MAC address
  String mac = WiFi.macAddress();
  String suffix = mac.substring(12, 14) + mac.substring(15, 17); // last 4 hex chars
  snprintf(AP_SSID, sizeof(AP_SSID), "%s-%s", AP_PREFIX, suffix.c_str());
  Serial.println("Device AP SSID: " + String(AP_SSID));

  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LED_OFF);

  pinMode(RESET_BUTTON, INPUT_PULLUP);

  // Check for factory reset at boot
  checkFactoryReset();

  // Try to load saved credentials
  String savedSSID = loadSSID();
  String savedPass = loadPassword();

  if (savedSSID.length() > 0) {
    // Credentials exist — try to connect
    if (connectToWiFi(savedSSID, savedPass)) {
      startNormalMode();
      return;
    }
    // Connection failed — fall through to setup mode
    Serial.println("Saved WiFi not reachable. Entering setup mode...");
  } else {
    Serial.println("No saved credentials. Entering setup mode...");
  }

  startSetupMode();
}

void loop() {
  if (currentMode == MODE_SETUP) {
    dnsServer.processNextRequest();
    httpServer.handleClient();
  } else {
    webSocket.loop();
    httpServer.handleClient();  // Handle /status requests in normal mode
  }

  // Check for factory reset during operation
  checkFactoryReset();
}