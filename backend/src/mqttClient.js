const mqtt = require("mqtt");
const store = require("./store");
const { computeRisk } = require("./riskEngine");
const alertService = require("./alertService");
const {
  MOTOR_COMMAND_TOPIC,
  MOTOR_STATUS_TOPIC,
  MOTOR_SIMULATOR_COMMAND_TOPIC,
  MAX_MOTOR_STATUS_BYTES,
  validateMotorCommand,
  normalizeMotorStatus,
  createMotorCommand,
} = require('./motorControl');

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
const MAX_MQTT_PAYLOAD_BYTES = 8192;
const UNIT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const SIMULATION_SCENARIOS = new Set(['normal', 'fire', 'high_temp', 'impact', 'human', 'human_moving', 'human_stationary', 'no_human', 'human_sensor_unavailable', 'gas', 'water', 'low_battery', 'gps_available', 'gps_unavailable', 'offline', 'camera_online', 'camera_offline', 'camera_not_configured', 'camera_error', 'human_fire', 'human_high_temp', 'human_impact', 'fire_high_temp', 'multiple_hazards', 'all_clear']);
function plainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value, allowed, label) { if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error(`unexpected ${label} field`); }
function optionalBoolean(value, label) { if (value !== undefined && value !== null && typeof value !== 'boolean') throw new Error(`${label} must be boolean or null`); }
function optionalNumber(value, label, min = -Infinity, max = Infinity) { if (value !== undefined && value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)) throw new Error(`${label} must be a finite number or null`); }
function normalizeHuman(raw) {
  if (raw !== undefined && raw !== null && !plainObject(raw)) throw new Error('human must be an object or null');
  const value = raw || {};
  exactKeys(value, ['presence', 'moving', 'stationary', 'distance', 'status', 'available', 'sensor'], 'human');
  ['presence', 'moving', 'stationary', 'available'].forEach(key => optionalBoolean(value[key], `human.${key}`));
  optionalNumber(value.distance, 'human.distance', 0, 1000);
  if (value.status !== undefined && !['HUMAN_DETECTED', 'NO_HUMAN', 'NOT_AVAILABLE'].includes(value.status)) throw new Error('invalid human status');
  if (value.sensor !== undefined && !['LD2410', 'ESP32-CAM', 'THERMAL', 'COMBINED'].includes(value.sensor)) throw new Error('invalid human sensor');
  const status = ["HUMAN_DETECTED", "NO_HUMAN", "NOT_AVAILABLE"].includes(value.status) ? value.status : "NOT_AVAILABLE";
  const available = value.available === true;
  return { presence: available && value.presence === true, moving: available && value.moving === true, stationary: available && value.stationary === true, distance: finiteNumber(value.distance), status: available ? status : "NOT_AVAILABLE", available, sensor: ["LD2410", "ESP32-CAM", "THERMAL", "COMBINED"].includes(value.sensor) ? value.sensor : "LD2410" };
}
function normalizeCamera(raw) {
  if (raw !== undefined && raw !== null && !plainObject(raw)) throw new Error('camera must be an object or null');
  const value = raw || {};
  exactKeys(value, ['available', 'connected', 'streaming', 'streamUrl', 'source', 'simulated', 'lastFrameAt', 'status'], 'camera');
  ['available', 'connected', 'streaming', 'simulated'].forEach(key => optionalBoolean(value[key], `camera.${key}`));
  optionalNumber(value.lastFrameAt, 'camera.lastFrameAt', 0);
  if (value.streamUrl !== undefined && value.streamUrl !== null) throw new Error('camera stream URL is not accepted from telemetry');
  if (value.source !== undefined && value.source !== 'ESP32-CAM') throw new Error('invalid camera source');
  if (value.status !== undefined && !['NOT_CONNECTED', 'CONNECTING', 'ONLINE', 'STREAMING', 'OFFLINE', 'ERROR'].includes(value.status)) throw new Error('invalid camera status');
  const status = ["NOT_CONNECTED", "CONNECTING", "ONLINE", "STREAMING", "OFFLINE", "ERROR"].includes(value.status) ? value.status : "NOT_CONNECTED";
  return { available: value.available === true, connected: value.connected === true, streaming: value.streaming === true, streamUrl: null, source: "ESP32-CAM", simulated: value.simulated === true, lastFrameAt: finiteNumber(value.lastFrameAt), status };
}

function normalizeSensors(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("sensor payload must be a JSON object");
  }
  const allowed = new Set(['temp', 'humidity', 'flame', 'flameActiveLow', 'vibration', 'accel', 'pir', 'pirAvailable', 'battery', 'batteryAvailable', 'source', 'simulated', 'simulation', 'human', 'camera', 'gps']);
  if (Object.keys(raw).some(key => !allowed.has(key))) throw new Error('unexpected sensor field');
  optionalNumber(raw.temp, 'temp', -80, 200); optionalNumber(raw.humidity, 'humidity', 0, 100); optionalNumber(raw.vibration, 'vibration', 0, 100);
  optionalNumber(raw.battery, 'battery', 0, 100); optionalBoolean(raw.flame, 'flame'); optionalBoolean(raw.flameActiveLow, 'flameActiveLow'); optionalBoolean(raw.pir, 'pir'); optionalBoolean(raw.pirAvailable, 'pirAvailable'); optionalBoolean(raw.batteryAvailable, 'batteryAvailable'); optionalBoolean(raw.simulated, 'simulated');
  if (raw.source !== undefined && !['simulator', 'esp32'].includes(raw.source)) throw new Error('invalid telemetry source');
  if (raw.accel !== undefined && raw.accel !== null) { if (!plainObject(raw.accel)) throw new Error('accel must be an object or null'); exactKeys(raw.accel, ['x', 'y', 'z', 'magnitude'], 'accel'); ['x', 'y', 'z', 'magnitude'].forEach(key => optionalNumber(raw.accel[key], `accel.${key}`, -1000, 1000)); }
  if (raw.simulation !== undefined && raw.simulation !== null) { if (!plainObject(raw.simulation)) throw new Error('simulation must be an object or null'); exactKeys(raw.simulation, ['scenario', 'events'], 'simulation'); if (raw.simulation.scenario !== undefined && (typeof raw.simulation.scenario !== 'string' || !/^[a-z0-9_]{1,64}$/.test(raw.simulation.scenario))) throw new Error('invalid simulation scenario'); if (raw.simulation.events !== undefined && (!Array.isArray(raw.simulation.events) || raw.simulation.events.length > 20 || raw.simulation.events.some(event => typeof event !== 'string' || !/^[a-z0-9_]{1,64}$/.test(event)))) throw new Error('invalid simulation events'); }
  if (raw.gps !== undefined && raw.gps !== null && !plainObject(raw.gps)) throw new Error('gps must be an object or null');
  const rawGps = raw.gps || {};
  exactKeys(rawGps, ['valid', 'lat', 'lng', 'satellites', 'ageMs'], 'gps'); optionalBoolean(rawGps.valid, 'gps.valid'); optionalNumber(rawGps.lat, 'gps.lat', -90, 90); optionalNumber(rawGps.lng, 'gps.lng', -180, 180); optionalNumber(rawGps.satellites, 'gps.satellites', 0, 100); optionalNumber(rawGps.ageMs, 'gps.ageMs', 0);
  const latitude = finiteNumber(rawGps.lat);
  const longitude = finiteNumber(rawGps.lng);
  const gpsValid = rawGps.valid === true && latitude !== null && longitude !== null && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;

  return {
    temp: finiteNumber(raw.temp),
    humidity: finiteNumber(raw.humidity),
    flame: typeof raw.flame === 'boolean' ? raw.flame : null,
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

function normalizeDetection(raw, expectedUnitId) {
  if (!plainObject(raw)) throw new Error('detection payload must be a JSON object');
  exactKeys(raw, ['unitId', 'type', 'source', 'simulated', 'severity', 'details', 'personDetected', 'confidence', 'count', 'boundingBoxes'], 'detection');
  if (raw.unitId !== undefined && raw.unitId !== expectedUnitId) throw new Error('detection unit mismatch');
  if (raw.type !== undefined && !['HUMAN_DETECTED', 'NO_HUMAN'].includes(raw.type)) throw new Error('invalid detection type');
  if (raw.source !== undefined && !['simulator', 'esp32', 'ai-detector'].includes(raw.source)) throw new Error('invalid detection source');
  if (raw.severity !== undefined && !['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(raw.severity)) throw new Error('invalid detection severity');
  optionalBoolean(raw.simulated, 'detection.simulated'); optionalBoolean(raw.personDetected, 'detection.personDetected'); optionalNumber(raw.confidence, 'detection.confidence', 0, 1); optionalNumber(raw.count, 'detection.count', 0, 100);
  if (raw.count !== undefined && raw.count !== null && !Number.isInteger(raw.count)) throw new Error('detection count must be an integer');
  const details = raw.details === undefined || raw.details === null ? null : normalizeHuman(raw.details);
  const boxes = raw.boundingBoxes === undefined ? [] : raw.boundingBoxes;
  if (!Array.isArray(boxes) || boxes.length > 100) throw new Error('invalid detection bounding boxes');
  const boundingBoxes = boxes.map(box => { if (!plainObject(box)) throw new Error('invalid detection bounding box'); exactKeys(box, ['x1', 'y1', 'x2', 'y2'], 'bounding box'); ['x1', 'y1', 'x2', 'y2'].forEach(key => optionalNumber(box[key], `boundingBox.${key}`, 0, 100000)); return { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2 }; });
  return { ...(raw.type === undefined ? {} : { type: raw.type }), ...(raw.source === undefined ? {} : { source: raw.source }), simulated: raw.simulated === true, ...(raw.severity === undefined ? {} : { severity: raw.severity }), details, personDetected: raw.personDetected === true, confidence: finiteNumber(raw.confidence), count: finiteNumber(raw.count) ?? 0, boundingBoxes };
}

function setupMqtt(io, connect = mqtt.connect) {
  alertService.attachIo(io);
  let brokerConnected = false;
  let lastBrokerError = null;
  const simulationMode = process.env.RESQX_SIMULATION_MODE === 'true';

  const brokerUrl = new URL(process.env.MQTT_BROKER_URL || "mqtt://localhost:1883");
  if (!['mqtt:', 'mqtts:', 'ws:', 'wss:'].includes(brokerUrl.protocol) || brokerUrl.username || brokerUrl.password) throw new Error('MQTT_BROKER_URL must be a credential-free mqtt(s) URL');
  const client = connect(brokerUrl.href, {
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    reconnectPeriod: 2000,
    clientId: `resqx-server-${Math.random().toString(16).slice(2)}`,
  });

  const unitIds = [...new Set((process.env.RESQX_UNIT_IDS || "unit-01").split(",").map((s) => s.trim()).filter((id) => UNIT_ID.test(id)))];
  if (!unitIds.length) throw new Error('RESQX_UNIT_IDS must contain at least one valid unit ID');
  const motorUnitId = process.env.RESQX_MOTOR_UNIT_ID || unitIds[0];
  if (!UNIT_ID.test(motorUnitId) || !unitIds.includes(motorUnitId)) throw new Error('RESQX_MOTOR_UNIT_ID must match a configured unit ID');
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
    client.subscribe(MOTOR_STATUS_TOPIC, (error) => {
      if (error) console.error(`[MQTT] subscription failed for ${MOTOR_STATUS_TOPIC}:`, error.message);
    });
  });

  client.on("reconnect", () => console.log("[MQTT] reconnecting..."));
  client.on("close", () => {
    brokerConnected = false;
    const motor = store.markMotorOffline('broker_disconnected');
    io.emit('motor:update', motor);
    emitBrokerStatus();
  });
  client.on("error", (error) => {
    lastBrokerError = 'MQTT broker unavailable';
    console.error("[MQTT] connection error:", error.code || 'unavailable');
    emitBrokerStatus();
  });

  client.on("message", async (topic, payloadBuffer) => {
    // A received broker message is also a confirmed live connection. This keeps
    // the dashboard state correct if it connected before a browser subscribed.
    brokerConnected = client.connected === true;
    emitBrokerStatus();
    if (topic === MOTOR_STATUS_TOPIC) {
      if (payloadBuffer.length > MAX_MOTOR_STATUS_BYTES) { console.warn('[MQTT] rejected oversized motor status payload'); return; }
      try {
        const status = normalizeMotorStatus(JSON.parse(payloadBuffer.toString('utf8')));
        if (simulationMode && !status.simulated) { console.warn('[MQTT] ignored physical motor status while simulation lock is active'); return; }
        const motor = store.updateMotorStatus(motorUnitId, status);
        io.emit('motor:update', motor);
      } catch (error) {
        console.warn('[MQTT] rejected motor status payload:', error.message);
      }
      return;
    }
    const parts = topic.split("/");
    if (parts.length !== 3 || parts[0] !== "resqx") return;
    const [, unitId, channel] = parts;
    if (!unitIds.includes(unitId) || !['sensors', 'detection', 'status'].includes(channel)) return;
    if (payloadBuffer.length > MAX_MQTT_PAYLOAD_BYTES) { console.warn(`[MQTT] rejected oversized ${channel} payload from ${unitId}`); return; }
    const payload = payloadBuffer.toString('utf8');

    try {
      if (channel === "status") {
        if (!['online', 'offline'].includes(payload.trim().toLowerCase())) throw new Error('invalid status payload');
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
        const unit = store.updateDetection(unitId, normalizeDetection(data, unitId));
        store.setRisk(unitId, computeRisk({ sensors: unit.sensors, detection: unit.detection }));
        alertService.updateIntelligence(unit);
        io.emit("unit:update", store.getUnit(unitId));
        await alertService.maybeRaiseAlert(unitId, unit.risk, unit.detection, unit.sensors);
      }
    } catch (error) {
      console.warn(`[MQTT] rejected ${channel} payload from ${unitId}:`, error.message);
    }
  });

  async function sendControl(unitId, action, params = {}) {
    if (!unitIds.includes(unitId) || !plainObject(params) || Object.keys(params).length) { const error = new Error('Invalid control command'); error.statusCode = 400; throw error; }
    const commandName = validateMotorCommand(action);
    if (!client.connected) {
      const error = new Error("MQTT broker is unavailable; command was not sent");
      error.statusCode = 503;
      throw error;
    }
    const motor = store.getMotorStatus();
    if (simulationMode && !motor.simulated) {
      const error = new Error('Physical motor control is disabled by the simulation lock');
      error.statusCode = 409;
      throw error;
    }
    if (!['motor-esp32', 'simulator'].includes(motor.source) || motor.unitId !== unitId) {
      const error = new Error('Motor controller identity is unverified; command was not sent');
      error.statusCode = 409;
      throw error;
    }
    if (commandName !== 'stop' && !motor.online) {
      const error = new Error('Motor controller is offline; movement command was not sent');
      error.statusCode = 409;
      throw error;
    }
    const command = createMotorCommand(commandName);
    const topic = motor.simulated ? MOTOR_SIMULATOR_COMMAND_TOPIC : MOTOR_COMMAND_TOPIC;
    await new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        const error = new Error('MQTT publish acknowledgement timed out'); error.statusCode = 503; reject(error);
      }, 1500);
      try {
        client.publish(topic, JSON.stringify(command), { qos: 1 }, (publishError) => {
          if (settled) return;
          settled = true; clearTimeout(timeout);
          if (publishError) { publishError.statusCode = 503; reject(publishError); }
          else resolve();
        });
      } catch (publishError) {
        if (!settled) { settled = true; clearTimeout(timeout); publishError.statusCode = 503; reject(publishError); }
      }
    });
    const updated = store.setMotorCommandRequested(unitId, command);
    io.emit('motor:update', updated);
    return { ...command, simulated: motor.simulated, status: 'REQUESTED' };
  }

  function sendSimulationScenario(unitId, scenario) {
    if (!unitIds.includes(unitId) || !SIMULATION_SCENARIOS.has(scenario)) { const error = new Error('Invalid simulation command'); error.statusCode = 400; throw error; }
    const unit = store.getUnit(unitId);
    if (!client.connected) { const error = new Error("MQTT broker is unavailable; simulation event was not sent"); error.statusCode = 503; throw error; }
    if (unit?.operatingMode !== 'SIMULATION' || !unit?.sensors?.simulated) { const error = new Error("Simulation controls are available only for a simulated unit"); error.statusCode = 409; throw error; }
    client.publish(`resqx/${unitId}/simulator`, JSON.stringify({ scenario, ts: Date.now() }), { qos: 1 });
    return { unitId, scenario };
  }

  return { client, sendControl, sendSimulationScenario, unitIds, motorUnitId, simulationMode, getStatus };
}

module.exports = { setupMqtt, normalizeSensors, normalizeDetection, MAX_MQTT_PAYLOAD_BYTES };
