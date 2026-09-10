/*
  RESQ-X unit firmware (reference sketch)
  Board: ESP32 (+ ESP32-CAM for video, run as a second sketch/board — see note below)

  This is a REFERENCE showing the exact MQTT topics and JSON payloads the
  backend (mqttClient.js) expects. Wire it to your actual sensor pins and
  motor driver — the sensor reading calls below are placeholders.

  Libraries needed (Arduino Library Manager):
    - PubSubClient
    - ArduinoJson
    - DHT sensor library (if using DHT22)

  Topics:
    resqx/<UNIT_ID>/sensors    (publish, every SENSOR_INTERVAL_MS)
    resqx/<UNIT_ID>/detection  (publish, only when on-device/edge detection runs)
    resqx/<UNIT_ID>/status     (publish "online" on connect, LWT "offline" on disconnect)
    resqx/<UNIT_ID>/control    (subscribe — receives {"action": "...", "params": {...}})
*/

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ---- Config ----
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* MQTT_HOST     = "192.168.1.50"; // your broker IP
const int   MQTT_PORT     = 1883;
const char* UNIT_ID       = "unit-01";

const unsigned long SENSOR_INTERVAL_MS = 3000;

// ---- Pins (adjust to your wiring) ----
const int PIN_GAS_MQ2   = 34; // analog
const int PIN_PIR       = 27; // digital
const int PIN_VIBRATION = 26; // digital
const int PIN_MOTOR_IN1 = 16;
const int PIN_MOTOR_IN2 = 17;
const int PIN_MOTOR_IN3 = 18;
const int PIN_MOTOR_IN4 = 19;
const int PIN_SIREN     = 23;
const int PIN_LIGHT     = 25;

WiFiClient espClient;
PubSubClient mqtt(espClient);

String topicSensors, topicDetection, topicStatus, topicControl;
unsigned long lastSensorPublish = 0;

void connectWifi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected: " + WiFi.localIP().toString());
}

void handleControlMessage(byte* payload, unsigned int length) {
  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) return;

  const char* action = doc["action"];
  if (!action) return;

  Serial.printf("Control action received: %s\n", action);

  if (strcmp(action, "move_forward") == 0) {
    digitalWrite(PIN_MOTOR_IN1, HIGH); digitalWrite(PIN_MOTOR_IN2, LOW);
    digitalWrite(PIN_MOTOR_IN3, HIGH); digitalWrite(PIN_MOTOR_IN4, LOW);
  } else if (strcmp(action, "move_backward") == 0) {
    digitalWrite(PIN_MOTOR_IN1, LOW); digitalWrite(PIN_MOTOR_IN2, HIGH);
    digitalWrite(PIN_MOTOR_IN3, LOW); digitalWrite(PIN_MOTOR_IN4, HIGH);
  } else if (strcmp(action, "turn_left") == 0) {
    digitalWrite(PIN_MOTOR_IN1, LOW); digitalWrite(PIN_MOTOR_IN2, HIGH);
    digitalWrite(PIN_MOTOR_IN3, HIGH); digitalWrite(PIN_MOTOR_IN4, LOW);
  } else if (strcmp(action, "turn_right") == 0) {
    digitalWrite(PIN_MOTOR_IN1, HIGH); digitalWrite(PIN_MOTOR_IN2, LOW);
    digitalWrite(PIN_MOTOR_IN3, LOW); digitalWrite(PIN_MOTOR_IN4, HIGH);
  } else if (strcmp(action, "stop") == 0) {
    digitalWrite(PIN_MOTOR_IN1, LOW); digitalWrite(PIN_MOTOR_IN2, LOW);
    digitalWrite(PIN_MOTOR_IN3, LOW); digitalWrite(PIN_MOTOR_IN4, LOW);
  } else if (strcmp(action, "siren_on") == 0) {
    digitalWrite(PIN_SIREN, HIGH);
  } else if (strcmp(action, "siren_off") == 0) {
    digitalWrite(PIN_SIREN, LOW);
  } else if (strcmp(action, "light_on") == 0) {
    digitalWrite(PIN_LIGHT, HIGH);
  } else if (strcmp(action, "light_off") == 0) {
    digitalWrite(PIN_LIGHT, LOW);
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  if (String(topic) == topicControl) {
    handleControlMessage(payload, length);
  }
}

void connectMqtt() {
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(mqttCallback);

  while (!mqtt.connected()) {
    Serial.println("Connecting to MQTT...");
    // Last Will: broker auto-publishes "offline" if this unit drops off unexpectedly
    if (mqtt.connect(UNIT_ID, topicStatus.c_str(), 1, true, "offline")) {
      Serial.println("MQTT connected");
      mqtt.publish(topicStatus.c_str(), "online", true);
      mqtt.subscribe(topicControl.c_str());
    } else {
      delay(1500);
    }
  }
}

void publishSensors() {
  // TODO: replace with real reads (analogRead / dht.readTemperature() / etc.)
  float tempC     = 32.5;
  float humidity  = 55.0;
  int   gasPPM    = analogRead(PIN_GAS_MQ2); // calibrate to ppm for your MQ2
  bool  pir       = digitalRead(PIN_PIR) == HIGH;
  bool  vibration = digitalRead(PIN_VIBRATION) == HIGH;

  StaticJsonDocument<256> doc;
  doc["temp"] = tempC;
  doc["humidity"] = humidity;
  doc["gasPPM"] = gasPPM;
  doc["vibration"] = vibration ? 1.0 : 0.0;
  doc["pir"] = pir;
  doc["battery"] = 87; // percent, from a voltage divider reading
  JsonObject gps = doc.createNestedObject("gps");
  gps["lat"] = 0.0;  // wire up a GPS module for real coordinates
  gps["lng"] = 0.0;

  char buf[256];
  size_t n = serializeJson(doc, buf);
  mqtt.publish(topicSensors.c_str(), buf, n);
}

void setup() {
  Serial.begin(115200);

  topicSensors   = "resqx/" + String(UNIT_ID) + "/sensors";
  topicDetection = "resqx/" + String(UNIT_ID) + "/detection";
  topicStatus    = "resqx/" + String(UNIT_ID) + "/status";
  topicControl   = "resqx/" + String(UNIT_ID) + "/control";

  pinMode(PIN_PIR, INPUT);
  pinMode(PIN_VIBRATION, INPUT);
  pinMode(PIN_MOTOR_IN1, OUTPUT);
  pinMode(PIN_MOTOR_IN2, OUTPUT);
  pinMode(PIN_MOTOR_IN3, OUTPUT);
  pinMode(PIN_MOTOR_IN4, OUTPUT);
  pinMode(PIN_SIREN, OUTPUT);
  pinMode(PIN_LIGHT, OUTPUT);

  connectWifi();
  connectMqtt();
}

void loop() {
  if (!mqtt.connected()) connectMqtt();
  mqtt.loop();

  if (millis() - lastSensorPublish > SENSOR_INTERVAL_MS) {
    publishSensors();
    lastSensorPublish = millis();
  }
}

/*
  Camera + AI detection note:
  ESP32-CAM alone is too weak to run a real person-detector well. The
  practical pattern rescue teams actually use:

    1. ESP32-CAM streams MJPEG over HTTP (CameraWebServer example sketch
       that ships with the ESP32 board package) at http://<cam-ip>:81/stream
    2. The frontend points an <img> tag straight at that URL (see CameraFeed.jsx)
    3. A small Python service (or the Node backend) periodically grabs a
       frame from that stream, runs a lightweight model (e.g. YOLOv8n or
       MobileNet-SSD) on it, and publishes the result to:
           resqx/<UNIT_ID>/detection
       with payload: {"personDetected": true, "confidence": 0.87, "count": 1}

  That keeps heavy AI off the microcontroller entirely.
*/
