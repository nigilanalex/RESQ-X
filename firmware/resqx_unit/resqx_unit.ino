/*
  RESQ-X 4WD rescue unit firmware

  Hardware: DOIT ESP32 DEVKIT V1, L298N, DHT22, MPU6050, flame sensor,
  NEO-6M GPS. ESP32-CAM is a separate optional board and is not required.

  Required Arduino libraries: PubSubClient, ArduinoJson, DHT sensor library
  by Adafruit, and TinyGPSPlus. Copy secrets.h.example to secrets.h before
  uploading; secrets.h is ignored by Git to protect Wi-Fi credentials.
*/

#include <WiFi.h>
#include <WebServer.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <Wire.h>
#include <TinyGPSPlus.h>
#include "secrets.h"

// Preserve the existing wiring.
constexpr uint8_t IN1 = 15;
constexpr uint8_t IN2 = 2;
constexpr uint8_t IN3 = 5;
constexpr uint8_t IN4 = 3;  // RX0: do not attach external serial data here.
constexpr uint8_t DHT_PIN = 4;
constexpr uint8_t FLAME_PIN = 23;
constexpr uint8_t I2C_SDA = 21;
constexpr uint8_t I2C_SCL = 22;
constexpr uint8_t GPS_RX = 16;
constexpr uint8_t GPS_TX = 17;
constexpr uint8_t MPU6050_ADDRESS = 0x68;

constexpr unsigned long WIFI_RETRY_MS = 10000;
constexpr unsigned long MQTT_RETRY_MS = 5000;
constexpr unsigned long DHT_INTERVAL_MS = 2500;
constexpr unsigned long SENSOR_INTERVAL_MS = 3000;
constexpr unsigned long MOTOR_TIMEOUT_MS = 900;
constexpr unsigned long GPS_FIX_MAX_AGE_MS = 10000;

// Most flame modules assert LOW on detection. Change only after testing yours.
constexpr bool FLAME_ACTIVE_LOW = true;
// Set true only if a physical side is wired in reverse.
constexpr bool INVERT_LEFT_MOTORS = false;
constexpr bool INVERT_RIGHT_MOTORS = false;

WebServer webServer(80);
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);
DHT dht(DHT_PIN, DHT22);
TinyGPSPlus gps;
HardwareSerial gpsSerial(2);

String topicSensors;
String topicStatus;
String topicControl;
unsigned long lastWifiAttemptMs = 0;
unsigned long lastMqttAttemptMs = 0;
unsigned long lastDhtReadMs = 0;
unsigned long lastSensorPublishMs = 0;
unsigned long lastMotorCommandMs = 0;
float temperatureC = NAN;
float humidityPercent = NAN;
bool motorsMoving = false;
bool wifiReportedConnected = false;

enum MotorDirection { STOPPED, FORWARD, BACKWARD };

void stopMotors() {
  digitalWrite(IN1, LOW); digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW); digitalWrite(IN4, LOW);
  motorsMoving = false;
}

void driveSide(uint8_t pinA, uint8_t pinB, MotorDirection direction, bool inverted) {
  if (inverted) {
    if (direction == FORWARD) direction = BACKWARD;
    else if (direction == BACKWARD) direction = FORWARD;
  }
  if (direction == FORWARD) {
    digitalWrite(pinA, HIGH); digitalWrite(pinB, LOW);
  } else if (direction == BACKWARD) {
    digitalWrite(pinA, LOW); digitalWrite(pinB, HIGH);
  } else {
    digitalWrite(pinA, LOW); digitalWrite(pinB, LOW);
  }
}

void setDrive(MotorDirection left, MotorDirection right) {
  driveSide(IN1, IN2, left, INVERT_LEFT_MOTORS);
  driveSide(IN3, IN4, right, INVERT_RIGHT_MOTORS);
  motorsMoving = left != STOPPED || right != STOPPED;
  if (motorsMoving) lastMotorCommandMs = millis();
}

bool applyMotorAction(const String& action) {
  if (action == "move_forward") setDrive(FORWARD, FORWARD);
  else if (action == "move_backward") setDrive(BACKWARD, BACKWARD);
  else if (action == "turn_left") setDrive(BACKWARD, FORWARD);
  else if (action == "turn_right") setDrive(FORWARD, BACKWARD);
  else if (action == "stop") stopMotors();
  else return false;
  return true;
}

void startWifiAttempt() {
  if (WiFi.status() == WL_CONNECTED) return;
  lastWifiAttemptMs = millis();
  Serial.println("[WiFi] attempting connection");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD); // async: never wait in loop
}

void maintainWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    if (!wifiReportedConnected) {
      Serial.print("[WiFi] connected. Web control: http://");
      Serial.println(WiFi.localIP());
      wifiReportedConnected = true;
    }
    return;
  }
  wifiReportedConnected = false;
  if (millis() - lastWifiAttemptMs >= WIFI_RETRY_MS) {
    startWifiAttempt();
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  if (String(topic) != topicControl) return;
  StaticJsonDocument<192> document;
  if (deserializeJson(document, payload, length)) return;
  const char* action = document["action"] | "";
  if (!applyMotorAction(String(action))) {
    Serial.printf("[Control] ignored unsupported action: %s\n", action);
  }
}

void maintainMqtt() {
  if (WiFi.status() != WL_CONNECTED || mqtt.connected()) return;
  if (millis() - lastMqttAttemptMs < MQTT_RETRY_MS) return;
  lastMqttAttemptMs = millis();
  Serial.println("[MQTT] attempting connection");
  // One short attempt only. Do not use a reconnect while-loop.
  if (mqtt.connect(UNIT_ID, topicStatus.c_str(), 1, true, "offline")) {
    Serial.println("[MQTT] connected");
    mqtt.publish(topicStatus.c_str(), "online", true);
    mqtt.subscribe(topicControl.c_str());
  } else {
    Serial.printf("[MQTT] unavailable, state=%d\n", mqtt.state());
  }
}

bool readMpuAcceleration(float& ax, float& ay, float& az) {
  Wire.beginTransmission(MPU6050_ADDRESS);
  Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(MPU6050_ADDRESS, static_cast<uint8_t>(6), true) != 6) return false;
  int16_t rawX = (Wire.read() << 8) | Wire.read();
  int16_t rawY = (Wire.read() << 8) | Wire.read();
  int16_t rawZ = (Wire.read() << 8) | Wire.read();
  ax = rawX / 16384.0f; ay = rawY / 16384.0f; az = rawZ / 16384.0f;
  return true;
}

bool initializeMpu6050() {
  Wire.beginTransmission(MPU6050_ADDRESS);
  Wire.write(0x6B); // PWR_MGMT_1
  Wire.write(0x00); // wake the device
  const bool ready = Wire.endTransmission() == 0;
  Serial.println(ready ? "[MPU6050] ready" : "[MPU6050] not detected");
  return ready;
}

void updateDht() {
  if (millis() - lastDhtReadMs < DHT_INTERVAL_MS) return;
  lastDhtReadMs = millis();
  const float nextTemperature = dht.readTemperature();
  const float nextHumidity = dht.readHumidity();
  if (!isnan(nextTemperature)) temperatureC = nextTemperature;
  if (!isnan(nextHumidity)) humidityPercent = nextHumidity;
}

void consumeGps() {
  while (gpsSerial.available()) gps.encode(gpsSerial.read());
}

bool hasFreshGpsFix() {
  return gps.location.isValid() && gps.location.age() <= GPS_FIX_MAX_AGE_MS;
}

bool flameDetected() {
  return FLAME_ACTIVE_LOW ? digitalRead(FLAME_PIN) == LOW : digitalRead(FLAME_PIN) == HIGH;
}

void publishSensors() {
  if (!mqtt.connected()) return;
  float ax = NAN, ay = NAN, az = NAN;
  const bool mpuAvailable = readMpuAcceleration(ax, ay, az);
  const float magnitude = mpuAvailable ? sqrtf(ax * ax + ay * ay + az * az) : NAN;
  const float vibration = mpuAvailable ? fabsf(magnitude - 1.0f) : NAN;
  const bool gpsValid = hasFreshGpsFix();

  StaticJsonDocument<512> document;
  document["source"] = "esp32";  // Required by the dashboard to verify LIVE hardware telemetry.
  if (isnan(temperatureC)) document["temp"] = nullptr; else document["temp"] = temperatureC;
  if (isnan(humidityPercent)) document["humidity"] = nullptr; else document["humidity"] = humidityPercent;
  document["flame"] = flameDetected();
  document["flameActiveLow"] = FLAME_ACTIVE_LOW;
  if (isnan(vibration)) document["vibration"] = nullptr; else document["vibration"] = vibration;
  document["pir"] = nullptr;
  document["pirAvailable"] = false;
  document["battery"] = nullptr;
  document["batteryAvailable"] = false;

  JsonObject acceleration = document.createNestedObject("accel");
  if (mpuAvailable) {
    acceleration["x"] = ax; acceleration["y"] = ay; acceleration["z"] = az;
    acceleration["magnitude"] = magnitude;
  } else {
    acceleration["x"] = nullptr; acceleration["y"] = nullptr; acceleration["z"] = nullptr;
    acceleration["magnitude"] = nullptr;
  }

  JsonObject gpsData = document.createNestedObject("gps");
  gpsData["valid"] = gpsValid;
  gpsData["satellites"] = gps.satellites.isValid() ? gps.satellites.value() : 0;
  if (gps.location.isValid()) gpsData["ageMs"] = gps.location.age(); else gpsData["ageMs"] = nullptr;
  if (gpsValid) {
    gpsData["lat"] = gps.location.lat(); gpsData["lng"] = gps.location.lng();
  } else {
    gpsData["lat"] = nullptr; gpsData["lng"] = nullptr;
  }

  char payload[512];
  const size_t length = serializeJson(document, payload, sizeof(payload));
  if (!mqtt.publish(topicSensors.c_str(), payload, length)) Serial.println("[MQTT] sensor publish failed");
}

String statusJson() {
  StaticJsonDocument<192> document;
  document["wifiConnected"] = WiFi.status() == WL_CONNECTED;
  document["mqttConnected"] = mqtt.connected();
  document["ip"] = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : "";
  document["motorsMoving"] = motorsMoving;
  document["gpsValid"] = hasFreshGpsFix();
  String output; serializeJson(document, output); return output;
}

void setupWebServer() {
  webServer.on("/", HTTP_GET, []() {
    webServer.send(200, "text/html", R"HTML(
<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>RESQ-X Control</title><style>body{font-family:Arial;background:#0a0f1a;color:#e8ecf5;margin:0;padding:20px;text-align:center}h1{color:#ff7a30}.status{color:#8a96b3;margin:16px}.grid{display:grid;grid-template-columns:repeat(3,90px);gap:10px;justify-content:center}button{min-height:56px;border:1px solid #34405b;border-radius:8px;background:#182238;color:#fff;font-weight:bold;font-size:13px}button:active{background:#ff7a30}.stop{border-color:#ff3b3b;color:#ff8e8e}</style></head><body><h1>RESQ-X 4WD CONTROL</h1><div id="status" class="status">Connecting...</div><div class="grid"><span></span><button data-action="move_forward">FORWARD</button><span></span><button data-action="turn_left">LEFT</button><button class="stop" data-action="stop">STOP</button><button data-action="turn_right">RIGHT</button><span></span><button data-action="move_backward">BACKWARD</button><span></span></div><script>let holdTimer;async function command(a){await fetch('/api/control',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'action='+encodeURIComponent(a)});}document.querySelectorAll('[data-action]').forEach(b=>{const a=b.dataset.action;if(a==='stop'){b.onclick=()=>command('stop');return;}const start=()=>{command(a);holdTimer=setInterval(()=>command(a),300)};const stop=()=>{clearInterval(holdTimer);command('stop')};b.onpointerdown=start;b.onpointerup=stop;b.onpointercancel=stop;b.onpointerleave=stop;});setInterval(async()=>{try{const s=await (await fetch('/api/status')).json();document.getElementById('status').textContent='Wi-Fi: '+(s.wifiConnected?'CONNECTED '+s.ip:'CONNECTING')+' | MQTT: '+(s.mqttConnected?'CONNECTED':'UNAVAILABLE')+' | GPS: '+(s.gpsValid?'VALID':'UNAVAILABLE')}catch(e){}},1000);</script></body></html>)HTML");
  });
  webServer.on("/api/status", HTTP_GET, []() { webServer.send(200, "application/json", statusJson()); });
  webServer.on("/api/control", HTTP_POST, []() {
    if (!applyMotorAction(webServer.arg("action"))) {
      webServer.send(400, "application/json", "{\"ok\":false,\"error\":\"Unsupported action\"}"); return;
    }
    webServer.send(200, "application/json", "{\"ok\":true}");
  });
  webServer.begin();
}

void setup() {
  Serial.begin(115200);
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  pinMode(FLAME_PIN, INPUT); stopMotors();
  dht.begin(); Wire.begin(I2C_SDA, I2C_SCL); initializeMpu6050();
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
  topicSensors = "resqx/" + String(UNIT_ID) + "/sensors";
  topicStatus = "resqx/" + String(UNIT_ID) + "/status";
  topicControl = "resqx/" + String(UNIT_ID) + "/control";
  mqtt.setServer(MQTT_HOST, MQTT_PORT); mqtt.setCallback(mqttCallback); mqtt.setSocketTimeout(1);
  WiFi.mode(WIFI_STA); setupWebServer(); startWifiAttempt();
}

void loop() {
  webServer.handleClient(); consumeGps(); updateDht(); maintainWifi(); maintainMqtt();
  if (mqtt.connected()) mqtt.loop();
  if (motorsMoving && millis() - lastMotorCommandMs >= MOTOR_TIMEOUT_MS) {
    Serial.println("[Safety] motor command timed out; stopping"); stopMotors();
  }
  if (millis() - lastSensorPublishMs >= SENSOR_INTERVAL_MS) {
    lastSensorPublishMs = millis(); publishSensors();
  }
}
