/* Software-only unit-01 simulator. Every test event is published through MQTT. */
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mqtt = require("mqtt");
const unitId = process.env.RESQX_SIMULATOR_UNIT_ID || "unit-01";
const brokerUrl = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";
const topics = { sensors: `resqx/${unitId}/sensors`, status: `resqx/${unitId}/status`, detection: `resqx/${unitId}/detection`, control: `resqx/${unitId}/control`, simulator: `resqx/${unitId}/simulator` };
let interval = null; let scenario = "normal"; let paused = false;
let cameraScenario = "camera_not_configured";
const between = (min, max) => Number((min + Math.random() * (max - min)).toFixed(2));
function eventList() { return ["normal", "offline", "no_human", "human_sensor_unavailable"].includes(scenario) ? [] : [scenario]; }
function humanState() {
  if (["human", "human_moving", "human_fire", "human_high_temp", "human_impact", "multiple_hazards"].includes(scenario)) return { presence: true, moving: true, stationary: false, distance: 2.8, status: "HUMAN_DETECTED", available: true, sensor: "LD2410" };
  if (scenario === "human_stationary") return { presence: true, moving: false, stationary: true, distance: 2.8, status: "HUMAN_DETECTED", available: true, sensor: "LD2410" };
  if (scenario === "human_sensor_unavailable") return { presence: false, moving: false, stationary: false, distance: null, status: "NOT_AVAILABLE", available: false, sensor: "LD2410" };
  return { presence: false, moving: false, stationary: false, distance: null, status: "NO_HUMAN", available: true, sensor: "LD2410" };
}
function cameraState() {
  if (cameraScenario === "camera_online") return { available: true, connected: true, streaming: true, streamUrl: null, source: "ESP32-CAM", simulated: true, lastFrameAt: null, status: "STREAMING" };
  if (cameraScenario === "camera_error") return { available: true, connected: false, streaming: false, streamUrl: null, source: "ESP32-CAM", simulated: true, lastFrameAt: null, status: "ERROR" };
  if (cameraScenario === "camera_offline") return { available: false, connected: false, streaming: false, streamUrl: null, source: "ESP32-CAM", simulated: true, lastFrameAt: null, status: "OFFLINE" };
  return { available: false, connected: false, streaming: false, streamUrl: null, source: "ESP32-CAM", simulated: true, lastFrameAt: null, status: "NOT_CONNECTED" };
}
function telemetry() {
  const data = { source: "simulator", simulated: true, simulation: { scenario, events: eventList() }, human: humanState(), camera: cameraState(), temp: between(23.8, 25.4), humidity: between(58, 64), vibration: between(.02, .14), flame: false, flameActiveLow: true, pir: null, pirAvailable: false, battery: null, batteryAvailable: false, gps: { valid: false, lat: null, lng: null, satellites: 0, ageMs: null } };
  if (scenario === "fire") { data.flame = true; data.temp = 82; }
  if (scenario === "high_temp") data.temp = 74;
  if (scenario === "impact") data.vibration = .96;
  if (["human_fire", "fire_high_temp", "multiple_hazards"].includes(scenario)) data.flame = true;
  if (["human_high_temp", "fire_high_temp", "multiple_hazards"].includes(scenario)) data.temp = 74;
  if (["human_impact", "multiple_hazards"].includes(scenario)) data.vibration = .96;
  if (scenario === "gps_available") data.gps = { valid: true, lat: 12.874434, lng: 80.218645, satellites: 9, ageMs: 0 };
  return data;
}
function detection() { const human = humanState(); return { unitId, type: human.presence ? "HUMAN_DETECTED" : "NO_HUMAN", source: "simulator", simulated: true, severity: human.presence ? "HIGH" : "INFO", details: human, personDetected: human.presence, confidence: human.presence ? .92 : null, count: human.presence ? 1 : 0 }; }
function publishTelemetry() { if (paused || !client.connected) return; client.publish(topics.sensors, JSON.stringify(telemetry())); client.publish(topics.detection, JSON.stringify(detection())); console.log(`[SIMULATOR] ${scenario} published through MQTT`); }
function startTelemetry() { if (!interval) interval = setInterval(publishTelemetry, 3000); publishTelemetry(); }
function stopTelemetry() { if (interval) clearInterval(interval); interval = null; }
function setScenario(next) {
  if (next === "all_clear") { cameraScenario = "camera_not_configured"; next = "normal"; }
  if (["camera_online", "camera_offline", "camera_not_configured", "camera_error"].includes(next)) { cameraScenario = next; publishTelemetry(); console.log(`[SIMULATOR] camera state set to ${next}`); return; }
  scenario = next;
  if (next === "offline") { paused = true; stopTelemetry(); client.publish(topics.status, "offline", { qos: 1, retain: true }); console.log("[SIMULATOR] unit-01 telemetry paused (offline scenario)"); return; }
  const recovering = paused; paused = false; client.publish(topics.status, "online", { qos: 1, retain: true }); startTelemetry(); console.log(`[SIMULATOR] scenario set to ${next}${recovering ? " (unit link resumed)" : ""}`);
}
const client = mqtt.connect(brokerUrl, { clientId: `resqx-simulator-${unitId}`, reconnectPeriod: 2000, will: { topic: topics.status, payload: "offline", qos: 1, retain: true } });
client.on("connect", () => { console.log(`[SIMULATOR] connected to ${brokerUrl}`); client.subscribe([topics.control, topics.simulator]); setScenario(paused ? "offline" : scenario); });
client.on("reconnect", () => console.log("[SIMULATOR] reconnecting to MQTT..."));
client.on("error", (error) => console.error("[SIMULATOR] MQTT error:", error.message));
client.on("message", (topic, payload) => { if (topic === topics.simulator) { try { const { scenario: next } = JSON.parse(payload); setScenario(next); } catch { console.error("[SIMULATOR] invalid scenario command"); } } else console.log(`[SIMULATOR] received ${topic}: ${payload} (no hardware action)`); });
function shutdown() { stopTelemetry(); if (client.connected) client.publish(topics.status, "offline", { qos: 1, retain: true }, () => client.end()); else client.end(); }
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
