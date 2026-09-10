/**
 * Simple in-memory store.
 * Swap this for Redis/Postgres later if you need history beyond a restart —
 * the rest of the app only talks to the functions below, not the shape.
 */

const units = new Map(); // unitId -> latest state
const alerts = []; // { id, unitId, level, message, data, timestamp }

const MAX_ALERTS = 500;

function getOrCreateUnit(unitId) {
  if (!units.has(unitId)) {
    units.set(unitId, {
      unitId,
      online: false,
      lastSeen: null,
      sensors: null, // { temp, humidity, gasPPM, vibration, pir, gps, battery }
      detection: null, // { personDetected, confidence, count, boundingBoxes }
      risk: { score: 0, level: "LOW" },
      lastCommand: null,
    });
  }
  return units.get(unitId);
}

function updateSensors(unitId, sensors) {
  const unit = getOrCreateUnit(unitId);
  unit.sensors = sensors;
  unit.online = true;
  unit.lastSeen = Date.now();
  return unit;
}

function updateDetection(unitId, detection) {
  const unit = getOrCreateUnit(unitId);
  unit.detection = detection;
  unit.online = true;
  unit.lastSeen = Date.now();
  return unit;
}

function setStatus(unitId, online) {
  const unit = getOrCreateUnit(unitId);
  unit.online = online;
  if (online) unit.lastSeen = Date.now();
  return unit;
}

function setRisk(unitId, risk) {
  const unit = getOrCreateUnit(unitId);
  unit.risk = risk;
  return unit;
}

function setLastCommand(unitId, command) {
  const unit = getOrCreateUnit(unitId);
  unit.lastCommand = { ...command, sentAt: Date.now() };
  return unit;
}

function getAllUnits() {
  return Array.from(units.values());
}

function getUnit(unitId) {
  return units.get(unitId) || null;
}

function addAlert(alert) {
  alerts.unshift(alert);
  if (alerts.length > MAX_ALERTS) alerts.length = MAX_ALERTS;
  return alert;
}

function getAlerts(limit = 100) {
  return alerts.slice(0, limit);
}

module.exports = {
  getOrCreateUnit,
  updateSensors,
  updateDetection,
  setStatus,
  setRisk,
  setLastCommand,
  getAllUnits,
  getUnit,
  addAlert,
  getAlerts,
};
