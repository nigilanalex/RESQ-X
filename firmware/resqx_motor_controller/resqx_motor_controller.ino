/*
  RESQ-X dedicated motor controller

  Board: DOIT ESP32 DEVKIT V1
  Driver: L298N with ENA/ENB jumpers fitted
  Libraries: PubSubClient, ArduinoJson

  This firmware contains no sensor logic. Copy secrets.h.example to secrets.h
  and keep the populated secrets.h out of Git.
*/

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "secrets.h"

constexpr uint8_t MOTOR_A_IN1 = 18;
constexpr uint8_t MOTOR_A_IN2 = 19;
constexpr uint8_t MOTOR_B_IN3 = 21;
constexpr uint8_t MOTOR_B_IN4 = 22;

constexpr bool INVERT_MOTOR_A = false;
constexpr bool INVERT_MOTOR_B = false;
constexpr unsigned long MOTOR_COMMAND_TIMEOUT_MS = 1000;
constexpr unsigned long MOTOR_STATUS_INTERVAL_MS = 2000;
constexpr unsigned long WIFI_RETRY_MS = 10000;
constexpr unsigned long MQTT_RETRY_MS = 3000;

const char* MOTOR_COMMAND_TOPIC = "resqx/robot/motor/command";
const char* MOTOR_STATUS_TOPIC = "resqx/robot/motor/status";

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

enum class MotorState { STOPPED, FORWARD, BACKWARD, LEFT, RIGHT };
enum class SideDirection { STOPPED, FORWARD, BACKWARD };

MotorState currentState = MotorState::STOPPED;
String lastCommandId;
unsigned long lastCommandAt = 0;
unsigned long lastStatusAt = 0;
unsigned long lastWifiAttemptAt = 0;
unsigned long lastMqttAttemptAt = 0;

const char* stateName(MotorState state) {
  switch (state) {
    case MotorState::FORWARD: return "forward";
    case MotorState::BACKWARD: return "backward";
    case MotorState::LEFT: return "left";
    case MotorState::RIGHT: return "right";
    default: return "stopped";
  }
}

void driveSide(uint8_t firstPin, uint8_t secondPin, SideDirection direction, bool inverted) {
  if (inverted) {
    if (direction == SideDirection::FORWARD) direction = SideDirection::BACKWARD;
    else if (direction == SideDirection::BACKWARD) direction = SideDirection::FORWARD;
  }
  digitalWrite(firstPin, direction == SideDirection::FORWARD ? HIGH : LOW);
  digitalWrite(secondPin, direction == SideDirection::BACKWARD ? HIGH : LOW);
}

void stopMotors() {
  driveSide(MOTOR_A_IN1, MOTOR_A_IN2, SideDirection::STOPPED, INVERT_MOTOR_A);
  driveSide(MOTOR_B_IN3, MOTOR_B_IN4, SideDirection::STOPPED, INVERT_MOTOR_B);
  currentState = MotorState::STOPPED;
}

void moveForward() {
  driveSide(MOTOR_A_IN1, MOTOR_A_IN2, SideDirection::FORWARD, INVERT_MOTOR_A);
  driveSide(MOTOR_B_IN3, MOTOR_B_IN4, SideDirection::FORWARD, INVERT_MOTOR_B);
  currentState = MotorState::FORWARD;
}

void moveBackward() {
  driveSide(MOTOR_A_IN1, MOTOR_A_IN2, SideDirection::BACKWARD, INVERT_MOTOR_A);
  driveSide(MOTOR_B_IN3, MOTOR_B_IN4, SideDirection::BACKWARD, INVERT_MOTOR_B);
  currentState = MotorState::BACKWARD;
}

void turnLeft() {
  driveSide(MOTOR_A_IN1, MOTOR_A_IN2, SideDirection::BACKWARD, INVERT_MOTOR_A);
  driveSide(MOTOR_B_IN3, MOTOR_B_IN4, SideDirection::FORWARD, INVERT_MOTOR_B);
  currentState = MotorState::LEFT;
}

void turnRight() {
  driveSide(MOTOR_A_IN1, MOTOR_A_IN2, SideDirection::FORWARD, INVERT_MOTOR_A);
  driveSide(MOTOR_B_IN3, MOTOR_B_IN4, SideDirection::BACKWARD, INVERT_MOTOR_B);
  currentState = MotorState::RIGHT;
}

void publishStatus(const char* reason, bool online = true) {
  if (!mqtt.connected()) return;
  StaticJsonDocument<256> status;
  status["online"] = online;
  status["state"] = online ? stateName(currentState) : "offline";
  status["source"] = "motor-esp32";
  status["simulated"] = false;
  status["controllerId"] = MOTOR_CONTROLLER_ID;
  if (lastCommandId.length()) status["commandId"] = lastCommandId; else status["commandId"] = nullptr;
  status["reason"] = reason;
  char payload[256];
  const size_t length = serializeJson(status, payload, sizeof(payload));
  mqtt.publish(MOTOR_STATUS_TOPIC, reinterpret_cast<const uint8_t*>(payload), length, true);
  lastStatusAt = millis();
}

bool applyCommand(const char* command) {
  if (strcmp(command, "forward") == 0) moveForward();
  else if (strcmp(command, "backward") == 0) moveBackward();
  else if (strcmp(command, "left") == 0) turnLeft();
  else if (strcmp(command, "right") == 0) turnRight();
  else if (strcmp(command, "stop") == 0) stopMotors();
  else return false;
  lastCommandAt = millis();
  return true;
}

bool hasOnlyCommandFields(JsonObjectConst object) {
  for (JsonPairConst pair : object) {
    const char* key = pair.key().c_str();
    if (strcmp(key, "command") != 0 && strcmp(key, "commandId") != 0 && strcmp(key, "issuedAt") != 0) return false;
  }
  return true;
}

bool validCommandId(const char* commandId) {
  const size_t length = strlen(commandId);
  if (length == 0 || length > 64) return false;
  for (size_t index = 0; index < length; index++) {
    const char value = commandId[index];
    if (!isalnum(static_cast<unsigned char>(value)) && value != '-') return false;
  }
  return true;
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  if (strcmp(topic, MOTOR_COMMAND_TOPIC) != 0) return;
  if (length == 0 || length > 512) { stopMotors(); lastCommandId = ""; publishStatus("invalid_command"); return; }
  StaticJsonDocument<256> document;
  if (deserializeJson(document, payload, length) || !document.is<JsonObject>() || !hasOnlyCommandFields(document.as<JsonObjectConst>())) {
    stopMotors(); lastCommandId = ""; publishStatus("invalid_command"); return;
  }
  const char* command = document["command"] | "";
  const char* commandId = document["commandId"] | "";
  if (!validCommandId(commandId) || !document["issuedAt"].is<unsigned long long>() || !applyCommand(command)) {
    stopMotors(); lastCommandId = ""; publishStatus("invalid_command"); return;
  }
  lastCommandId = commandId;
  publishStatus("command");
}

void maintainWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  stopMotors();
  if (mqtt.connected()) mqtt.disconnect();
  if (millis() - lastWifiAttemptAt < WIFI_RETRY_MS) return;
  lastWifiAttemptAt = millis();
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void maintainMqtt() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (mqtt.connected()) return;
  stopMotors();
  if (millis() - lastMqttAttemptAt < MQTT_RETRY_MS) return;
  lastMqttAttemptAt = millis();
  const String will = String("{\"online\":false,\"state\":\"offline\",\"source\":\"motor-esp32\",\"simulated\":false,\"controllerId\":\"") + MOTOR_CONTROLLER_ID + "\",\"commandId\":null,\"reason\":\"disconnected\"}";
  bool connected;
  if (strlen(MQTT_USERNAME)) connected = mqtt.connect(MOTOR_CONTROLLER_ID, MQTT_USERNAME, MQTT_PASSWORD, MOTOR_STATUS_TOPIC, 1, true, will.c_str());
  else connected = mqtt.connect(MOTOR_CONTROLLER_ID, MOTOR_STATUS_TOPIC, 1, true, will.c_str());
  if (!connected) return;
  mqtt.subscribe(MOTOR_COMMAND_TOPIC, 1);
  lastCommandId = "";
  publishStatus("connected");
}

void setup() {
  Serial.begin(115200);
  pinMode(MOTOR_A_IN1, OUTPUT); pinMode(MOTOR_A_IN2, OUTPUT);
  pinMode(MOTOR_B_IN3, OUTPUT); pinMode(MOTOR_B_IN4, OUTPUT);
  stopMotors();
  WiFi.mode(WIFI_STA);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  mqtt.setSocketTimeout(1);
  mqtt.setBufferSize(512);
  lastWifiAttemptAt = millis() - WIFI_RETRY_MS;
}

void loop() {
  maintainWifi();
  maintainMqtt();
  if (mqtt.connected()) mqtt.loop();
  else stopMotors();

  if (currentState != MotorState::STOPPED && millis() - lastCommandAt >= MOTOR_COMMAND_TIMEOUT_MS) {
    stopMotors(); lastCommandId = ""; publishStatus("timeout");
  }
  if (mqtt.connected() && millis() - lastStatusAt >= MOTOR_STATUS_INTERVAL_MS) publishStatus("heartbeat");
  delay(2);
}
