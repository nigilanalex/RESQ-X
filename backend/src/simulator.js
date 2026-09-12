/* Software-only unit-01 simulator. Every test event is published through MQTT. */
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mqtt = require("mqtt");
const unitId = process.env.RESQX_SIMULATOR_UNIT_ID || "unit-01";
const brokerUrl = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";
const topics = { sensors: `resqx/${unitId}/sensors`, status: `resqx/${unitId}/status`, detection: `resqx/${unitId}/detection`, control: `resqx/${unitId}/control`, simulator: `resqx/${unitId}/simulator` };
let interval = null; let scenario = "normal"; let paused = false;
const between = (min, max) => Number((min + Math.random() * (max - min)).toFixed(2));
function eventList() { return scenario === "normal" || scenario === "offline" ? [] : [scenario]; }
function telemetry() {
  const data = { source: "simulator", simulated: true, simulation: { scenario, events: eventList() }, temp: between(23.8, 25.4), humidity: between(58, 64), vibration: between(.02, .14), flame: false, flameActiveLow: true, pir: null, pirAvailable: false, battery: null, batteryAvailable: false, gps: { valid: false, lat: null, lng: null, satellites: 0, ageMs: null } };
  if (scenario === "fire") { data.flame = true; data.temp = 82; }
  if (scenario === "high_temp") data.temp = 74;
  if (scenario === "impact") data.vibration = .96;
  if (scenario === "gps_available") data.gps = { valid: true, lat: 12.874434, lng: 80.218645, satellites: 9, ageMs: 0 };
  return data;
}
function detection() { return scenario === "human" ? { simulated: true, personDetected: true, confidence: .92, count: 1 } : { simulated: true, personDetected: false, confidence: null, count: 0 }; }
function publishTelemetry() { if (paused || !client.connected) return; client.publish(topics.sensors, JSON.stringify(telemetry())); client.publish(topics.detection, JSON.stringify(detection())); console.log(`[SIMULATOR] ${scenario} published through MQTT`); }
function startTelemetry() { if (!interval) interval = setInterval(publishTelemetry, 3000); publishTelemetry(); }
function stopTelemetry() { if (interval) clearInterval(interval); interval = null; }
function setScenario(next) {
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
