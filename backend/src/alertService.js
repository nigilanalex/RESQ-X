const store = require("./store");
const { assessUnit } = require("./intelligence");
let ioRef = null;
const lastScenario = new Map();
const lastCameraStatus = new Map();
const lastRiskLevel = new Map();
function attachIo(io) { ioRef = io; }
function emit(unitId, level, message, data = {}) { const alert = { id: `${unitId}-${Date.now()}-${Math.random().toString(16).slice(2)}`, unitId, level, message, data, timestamp: Date.now() }; store.addAlert(alert); ioRef?.emit("alert", alert); return alert; }

const SIMULATION_ALERTS = {
  normal: ["SYSTEM", "unit-01 returned to normal (SIMULATED)"],
  fire: ["CRITICAL", "🔥 FIRE DETECTED (SIMULATED) — simulated flame event"],
  high_temp: ["HIGH", "🌡️ HIGH TEMPERATURE (SIMULATED) — simulated temperature threshold exceeded"],
  impact: ["HIGH", "⚠️ HIGH MOTION / IMPACT (SIMULATED)"],
  human: ["HIGH", "👤 HUMAN DETECTED (SIMULATED) — future camera/mmWave test event"],
  human_moving: ["HIGH", "👤 HUMAN DETECTED — MOVING (SIMULATED) · LD2410"],
  human_stationary: ["HIGH", "👤 HUMAN DETECTED — STATIONARY (SIMULATED) · LD2410"],
  no_human: ["SYSTEM", "HUMAN NO LONGER DETECTED (SIMULATED) · LD2410"],
  human_sensor_unavailable: ["SYSTEM", "LD2410 HUMAN SENSOR NOT AVAILABLE (SIMULATED)"],
  gas: ["HIGH", "💨 SMOKE/GAS DETECTED (SIMULATED) — no gas sensor is installed"],
  water: ["WARNING", "💧 WATER DETECTED (SIMULATED) — no water sensor is installed"],
  low_battery: ["WARNING", "🔋 BATTERY LOW (SIMULATED) — no real battery measurement is installed"],
  gps_available: ["INFO", "📍 GPS FIX ACQUIRED (SIMULATED)"],
  gps_unavailable: ["INFO", "📍 GPS UNAVAILABLE (SIMULATED)"],
};

async function maybeRaiseAlert(unitId, risk, detection, sensors) {
  const cameraStatus = sensors?.camera?.status;
  if (cameraStatus && lastCameraStatus.get(unitId) !== cameraStatus) {
    lastCameraStatus.set(unitId, cameraStatus);
    const label = cameraStatus === "STREAMING" ? "ESP32-CAM stream restored" : cameraStatus === "ERROR" ? "ESP32-CAM reported a camera error" : cameraStatus === "OFFLINE" ? "ESP32-CAM stream unavailable" : "ESP32-CAM stream URL not configured";
    emit(unitId, cameraStatus === "ERROR" ? "WARNING" : "SYSTEM", `${label}${sensors.camera.simulated ? " (SIMULATED)" : ""}`, { camera: sensors.camera });
  }
  const scenario = sensors?.simulated ? sensors.simulation?.scenario : null;
  if (scenario) {
    if (lastScenario.get(unitId) !== scenario) {
      lastScenario.set(unitId, scenario);
      const [level, message] = SIMULATION_ALERTS[scenario] || ["INFO", `SIMULATION EVENT: ${scenario}`];
      return emit(unitId, level, message, { simulated: true, scenario, risk, detection });
    }
    return null;
  }
  if (risk.level === "LOW" || lastRiskLevel.get(unitId) === risk.level) return null;
  lastRiskLevel.set(unitId, risk.level);
  return emit(unitId, risk.level, `[${risk.level}] Unit ${unitId}: risk score ${risk.score}/100.`, { risk, detection });
}

function raiseUnitLinkAlert(unitId, online, simulated) {
  if (simulated) return emit(unitId, online ? "SYSTEM" : "WARNING", online ? `${unitId} unit link recovered (SIMULATED)` : `${unitId} unit link lost (SIMULATED)` , { simulated: true, online });
  return emit(unitId, online ? "SYSTEM" : "WARNING", `${unitId} unit link ${online ? "recovered" : "lost"}`, { online });
}
function updateIntelligence(unit) {
  const previous = unit.intelligence;
  const assessment = assessUnit(unit);
  unit.intelligence = assessment;
  if (!previous || previous.situation !== assessment.situation || previous.severity !== assessment.severity || previous.simulated !== assessment.simulated) {
    const label = assessment.situation === "NORMAL" ? "ALL CLEAR" : assessment.situation.replaceAll("_", " ");
    emit(unit.unitId, ["LOW"].includes(assessment.severity) ? "SYSTEM" : assessment.severity === "OFFLINE" ? "WARNING" : assessment.severity,
      `RESCUE INTELLIGENCE — ${label}${assessment.simulated ? " (SIMULATED)" : ""}`, { intelligence: assessment });
  }
  return assessment;
}
module.exports = { attachIo, maybeRaiseAlert, raiseUnitLinkAlert, updateIntelligence };
