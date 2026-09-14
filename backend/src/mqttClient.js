const mqtt = require("mqtt");
const store = require("./store");
const { computeRisk } = require("./riskEngine");
const alertService = require("./alertService");

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function normalizeHuman(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  const status = ["HUMAN_DETECTED", "NO_HUMAN", "NOT_AVAILABLE"].includes(value.status) ? value.status : "NOT_AVAILABLE";
  const available = value.available === true;
  return { presence: available && value.presence === true, moving: available && value.moving === true, stationary: available && value.stationary === true, distance: finiteNumber(value.distance), status: available ? status : "NOT_AVAILABLE", available, sensor: ["LD2410", "ESP32-CAM", "THERMAL", "COMBINED"].includes(value.sensor) ? value.sensor : "LD2410" };
}
function normalizeCamera(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  const status = ["NOT_CONNECTED", "CONNECTING", "ONLINE", "STREAMING", "OFFLINE", "ERROR"].includes(value.status) ? value.status : "NOT_CONNECTED";
  return { available: value.available === true, connected: value.connected === true, streaming: value.streaming === true, streamUrl: null, source: value.source === "ESP32-CAM" ? "ESP32-CAM" : "ESP32-CAM", simulated: value.simulated === true, lastFrameAt: Number.isFinite(Number(value.lastFrameAt)) ? Number(value.lastFrameAt) : null, status };
}

function normalizeSensors(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("sensor payload must be a JSON object");
  }
  const rawGps = raw.gps && typeof raw.gps === "object" ? raw.gps : {};
  const latitude = finiteNumber(rawGps.lat);
  const longitude = finiteNumber(rawGps.lng);
  const gpsValid = rawGps.valid === true && latitude !== null && longitude !== null;

  return {
    temp: finiteNumber(raw.temp),
    humidity: finiteNumber(raw.humidity),
    flame: raw.flame === true,
    flameActiveLow: raw.flameActiveLow === true,
    vibration: finiteNumber(raw.vibration),
    accel: raw.accel && typeof raw.accel === "object" ? {
      x: finiteNumber(raw.accel.x),
      y: finiteNumber(raw.accel.y),
      z: finiteNumber(raw.accel.z),
      magnitude: finiteNumber(raw.accel.magnitude),
    } : null,
    // No PIR or battery hardware is currently fitted. Keep those states explicit.
    pir: raw.pir === true,
    pirAvailable: raw.pirAvailable === true,
    battery: raw.batteryAvailable === true ? finiteNumber(raw.battery) : null,
    batteryAvailable: raw.batteryAvailable === true,
    // Source is a telemetry assertion, not a dashboard toggle. Only the
    // firmware's explicit ESP32 marker is eligible for LIVE mode.
    source: raw.source === "simulator" ? "SIMULATOR" : raw.source === "esp32" ? "ESP32" : "UNVERIFIED",
    simulated: raw.source === "simulator" && raw.simulated === true,
    simulation: raw.simulated === true && raw.simulation && typeof raw.simulation === "object" ? {
      scenario: typeof raw.simulation.scenario === "string" ? raw.simulation.scenario : "normal",
      events: Array.isArray(raw.simulation.events) ? raw.simulation.events.filter((event) => typeof event === "string") : [],
    } : null,
    human: normalizeHuman(raw.human),
    camera: normalizeCamera(raw.camera),
    gps: {
      valid: gpsValid,
      lat: gpsValid ? latitude : null,
      lng: gpsValid ? longitude : null,
      satellites: finiteNumber(rawGps.satellites) ?? 0,
      ageMs: finiteNumber(rawGps.ageMs),
    },
  };
}

function setupMqtt(io) {
  alertService.attachIo(io);
  let brokerConnected = false;
  let lastBrokerError = null;

  const client = mqtt.connect(process.env.MQTT_BROKER_URL || "mqtt://localhost:1883", {
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    reconnectPeriod: 2000,
    clientId: `resqx-server-${Math.random().toString(16).slice(2)}`,
  });

  const unitIds = (process.env.RESQX_UNIT_IDS || "unit-01").split(",").map((s) => s.trim()).filter(Boolean);
  // `client.connected` is the MQTT library's authoritative transport state.
  // Keeping a separate event flag alone can become stale during a reconnect.
  const getStatus = () => ({
    connected: client.connected === true,
    error: client.connected ? null : lastBrokerError,
  });
  const emitBrokerStatus = () => io.emit("mqtt:status", getStatus());

  client.on("connect", () => {
    brokerConnected = true;
    lastBrokerError = null;
    console.log("[MQTT] connected to broker");
    emitBrokerStatus();
    unitIds.forEach((unitId) => {
      ["sensors", "detection", "status"].forEach((channel) => {
        const topic = `resqx/${unitId}/${channel}`;
        client.subscribe(topic, (error) => {
          if (error) console.error(`[MQTT] subscription failed for ${topic}:`, error.message);
        });
      });
    });
  });

  client.on("reconnect", () => console.log("[MQTT] reconnecting..."));
  client.on("close", () => {
    brokerConnected = false;
    emitBrokerStatus();
  });
  client.on("error", (error) => {
    lastBrokerError = error.message;
    console.error("[MQTT] error:", error.message);
    emitBrokerStatus();
  });

  client.on("message", async (topic, payloadBuffer) => {
    // A received broker message is also a confirmed live connection. This keeps
    // the dashboard state correct if it connected before a browser subscribed.
    brokerConnected = client.connected === true;
    emitBrokerStatus();
    const parts = topic.split("/");
    if (parts.length !== 3 || parts[0] !== "resqx") return;
    const [, unitId, channel] = parts;
    const payload = payloadBuffer.toString();
    console.log("[MQTT RECEIVED]", topic, payload);

    try {
      if (channel === "status") {
        const wasOnline = store.getUnit(unitId)?.online;
        const unit = store.setStatus(unitId, payload.trim().toLowerCase() === "online");
        alertService.updateIntelligence(unit);
        io.emit("unit:update", unit);
        if (wasOnline !== undefined && wasOnline !== unit.online) alertService.raiseUnitLinkAlert(unitId, unit.online, unit.sensors?.simulated === true);
        return;
      }

      const data = JSON.parse(payload);
      if (channel === "sensors") {
        const unit = store.updateSensors(unitId, normalizeSensors(data));
        store.setRisk(unitId, computeRisk({ sensors: unit.sensors, detection: unit.detection }));
        alertService.updateIntelligence(unit);
        io.emit("unit:update", store.getUnit(unitId));
        await alertService.maybeRaiseAlert(unitId, unit.risk, unit.detection, unit.sensors);
      } else if (channel === "detection") {
        if (!data || typeof data !== "object") throw new Error("detection payload must be a JSON object");
        const unit = store.updateDetection(unitId, data);
        store.setRisk(unitId, computeRisk({ sensors: unit.sensors, detection: unit.detection }));
        alertService.updateIntelligence(unit);
        io.emit("unit:update", store.getUnit(unitId));
        await alertService.maybeRaiseAlert(unitId, unit.risk, unit.detection, unit.sensors);
      }
    } catch (error) {
      console.error(`[MQTT] failed to handle ${topic}:`, error.message);
    }
  });

  function sendControl(unitId, action, params = {}) {
    if (!client.connected) {
      const error = new Error("MQTT broker is unavailable; command was not sent");
      error.statusCode = 503;
      throw error;
    }
    const unit = store.getUnit(unitId);
    if (!unit?.online) {
      const error = new Error("Robot is offline; command was not sent");
      error.statusCode = 409;
      throw error;
    }
    const command = { action, params, ts: Date.now() };
    client.publish(`resqx/${unitId}/control`, JSON.stringify(command), { qos: 1 });
    store.setLastCommand(unitId, command);
    io.emit("unit:update", store.getUnit(unitId));
    return command;
  }

  function sendSimulationScenario(unitId, scenario) {
    const unit = store.getUnit(unitId);
    if (!client.connected) { const error = new Error("MQTT broker is unavailable; simulation event was not sent"); error.statusCode = 503; throw error; }
    if (!unit?.sensors?.simulated) { const error = new Error("Simulation controls are available only for a simulated unit"); error.statusCode = 409; throw error; }
    client.publish(`resqx/${unitId}/simulator`, JSON.stringify({ scenario, ts: Date.now() }), { qos: 1 });
    return { unitId, scenario };
  }

  return { client, sendControl, sendSimulationScenario, unitIds, getStatus };
}

module.exports = { setupMqtt, normalizeSensors };
