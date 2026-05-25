#include <WiFi.h>
#include <WebSocketsServer.h>

#ifndef LED_BUILTIN
#define LED_BUILTIN 2
#endif

const char* ssid = "HUAWEI-c43u";
const char* password = "engineer1";

WebSocketsServer webSocket(81);

bool ledState = false;

void broadcastState() {
  String msg = ledState ? "STATE:ON" : "STATE:OFF";
  webSocket.broadcastTXT(msg);
}

void handleMessage(uint8_t num, String msg) {
  Serial.println("Received: " + msg);

  if (msg == "ON") {
    ledState = true;
    digitalWrite(LED_BUILTIN, HIGH);
    broadcastState();
  }

  if (msg == "OFF") {
    ledState = false;
    digitalWrite(LED_BUILTIN, LOW);
    broadcastState();
  }
}

void onEvent(uint8_t num, WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {

    case WStype_CONNECTED:
      Serial.println("Client connected");

      // Send current state to new client
      if (ledState) webSocket.sendTXT(num, "STATE:ON");
      else webSocket.sendTXT(num, "STATE:OFF");

      break;

    case WStype_TEXT: {
      String msg = String((char*)payload).substring(0, length);
      handleMessage(num, msg);
      break;
    }

    case WStype_DISCONNECTED:
      Serial.println("Client disconnected");
      break;
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);

  WiFi.begin(ssid, password);

  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nConnected");
  Serial.println(WiFi.localIP());

  webSocket.begin();
  webSocket.onEvent(onEvent);

  Serial.println("WebSocket started");
}

void loop() {
  webSocket.loop();
}