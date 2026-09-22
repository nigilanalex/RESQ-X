/* Deterministic Rescue Intelligence tests. No server, broker, camera, or hardware is contacted. */
const assert = require('node:assert/strict');
const { normalizeSensors } = require('../backend/src/mqttClient');
const { computeRisk } = require('../backend/src/riskEngine');
const { assessUnit } = require('../backend/src/intelligence');
const alerts = require('../backend/src/alertService');

function sensors(scenario, changes = {}) {
  const events = ['gas', 'water', 'low_battery'].includes(scenario) ? [scenario] : [];
  return normalizeSensors({
    source:'simulator', simulated:true, simulation:{ scenario, events }, temp:24.5, humidity:62, vibration:0.1, flame:false,
    human:{ presence:false, moving:false, stationary:false, distance:null, status:'NO_HUMAN', available:true, sensor:'LD2410' },
    camera:{ available:false, connected:false, streaming:false, streamUrl:null, source:'ESP32-CAM', simulated:true, lastFrameAt:null, status:'NOT_CONNECTED' },
    gps:{ valid:false, lat:null, lng:null, satellites:0, ageMs:null }, ...changes,
  });
}
function assess(name, expectedSituation, expectedSeverity, changes = {}, online = true) {
  const current = sensors(name, changes); const risk = computeRisk({ sensors:current, detection:null });
  const result = assessUnit({ unitId:'unit-test', online, sensors:current, risk });
  assert.equal(result.situation, expectedSituation, name); assert.equal(result.severity, expectedSeverity, name);
  assert.equal(result.confidence, null); assert.equal(result.simulated, true); assert.ok(result.recommendedAction); return { result, risk, sensors:current };
}
async function main() {
  assess('normal', 'NORMAL', 'LOW');
  assess('human_moving', 'HUMAN_DETECTED', 'HIGH', { human:{ presence:true, moving:true, stationary:false, distance:2.8, status:'HUMAN_DETECTED', available:true, sensor:'LD2410' } });
  assess('human_stationary', 'HUMAN_DETECTED', 'HIGH', { human:{ presence:true, moving:false, stationary:true, distance:2.8, status:'HUMAN_DETECTED', available:true, sensor:'LD2410' } });
  assess('fire', 'MULTIPLE_HAZARDS', 'CRITICAL', { flame:true, temp:82 });
  assess('human_fire', 'FIRE_WITH_HUMAN', 'CRITICAL', { flame:true, human:{ presence:true, moving:true, stationary:false, distance:2.8, status:'HUMAN_DETECTED', available:true, sensor:'LD2410' } });
  assess('human_high_temp', 'HIGH_TEMPERATURE_WITH_HUMAN', 'CRITICAL', { temp:74, human:{ presence:true, moving:true, stationary:false, distance:2.8, status:'HUMAN_DETECTED', available:true, sensor:'LD2410' } });
  assess('human_impact', 'IMPACT_WITH_HUMAN', 'CRITICAL', { vibration:.96, human:{ presence:true, moving:true, stationary:false, distance:2.8, status:'HUMAN_DETECTED', available:true, sensor:'LD2410' } });
  assess('multiple_hazards', 'MULTIPLE_HAZARDS', 'CRITICAL', { flame:true, temp:74, vibration:.96 });
  assess('impact', 'IMPACT_DETECTED', 'HIGH', { vibration:.96 });
  assess('high_temp', 'HIGH_TEMPERATURE', 'HIGH', { temp:74 });
  assess('water', 'SENSOR_HAZARD', 'MEDIUM');
  const gps = assess('gps_available', 'NORMAL', 'LOW', { gps:{ valid:true, lat:12.874434, lng:80.218645, satellites:9, ageMs:0 } }); assert.deepEqual(gps.result.location, { lat:12.874434, lng:80.218645, simulated:true });
  const noGps = assess('gps_unavailable', 'NORMAL', 'LOW'); assert.equal(noGps.result.location, null);
  assess('offline', 'ROBOT_OFFLINE', 'OFFLINE', {}, false);
  const emitted = []; alerts.attachIo({ emit:(event, value) => { if (event === 'alert') emitted.push(value); } });
  const dedupe = assess('dedupe_security', 'NORMAL', 'LOW');
  await alerts.maybeRaiseAlert('unit-dedupe-security', dedupe.risk, null, dedupe.sensors);
  await alerts.maybeRaiseAlert('unit-dedupe-security', dedupe.risk, null, dedupe.sensors);
  assert.equal(emitted.filter(item => item.data?.scenario === 'dedupe_security').length, 1, 'meaningful scenario alert is deduplicated');
  console.log('Intelligence tests passed: situations, severity, rule-based confidence, GPS integrity, simulation labels, and alert deduplication.');
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
