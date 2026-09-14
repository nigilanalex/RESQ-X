// Operator guidance only. This module never sends robot commands.
function assessUnit(unit) {
  const s = unit.sensors || {};
  const human = s.human?.available === true && s.human?.presence === true;
  const flame = s.flame === true;
  const hot = Number.isFinite(s.temp) && s.temp >= 68;
  const impact = Number.isFinite(s.vibration) && s.vibration >= 0.9;
  const events = s.simulated === true ? s.simulation?.events || [] : [];
  const extra = events.filter(e => ["gas", "water", "low_battery"].includes(e));
  const hazards = Number(flame) + Number(hot) + Number(impact) + extra.length;
  let situation = "NORMAL", severity = "LOW";
  const guidance = {
    NORMAL: "Continue reconnaissance.",
    HUMAN_DETECTED: "Inspect detected location and establish communication.",
    POSSIBLE_FIRE: "Maintain safe distance and assess fire conditions.",
    FIRE_WITH_HUMAN: "PRIORITIZE HUMAN RESCUE. Avoid direct approach.",
    HIGH_TEMPERATURE_WITH_HUMAN: "Prioritize human rescue. Assess heat exposure before approaching.",
    IMPACT_WITH_HUMAN: "Possible casualty detected. Inspect immediately.",
    HIGH_TEMPERATURE: "Maintain safe distance and assess heat conditions.",
    IMPACT_DETECTED: "Stop and inspect the robot and surrounding area before proceeding.",
    MULTIPLE_HAZARDS: "Multiple hazards detected. Reassess route before proceeding.",
    SENSOR_UNAVAILABLE: "Verify sensor connection before relying on presence assessment.",
    SENSOR_HAZARD: "Inspect the reported sensor warning before proceeding.",
    ROBOT_OFFLINE: "Communication lost. Stop autonomous movement and verify link.",
  };
  if (!unit.online) { situation = "ROBOT_OFFLINE"; severity = "OFFLINE"; }
  else if (!unit.sensors) { situation = "SENSOR_UNAVAILABLE"; severity = "WARNING"; }
  else if (hazards >= 3) { situation = "MULTIPLE_HAZARDS"; severity = "CRITICAL"; }
  else if (human && flame) { situation = "FIRE_WITH_HUMAN"; severity = "CRITICAL"; }
  else if (human && hot) { situation = "HIGH_TEMPERATURE_WITH_HUMAN"; severity = "CRITICAL"; }
  else if (human && impact) { situation = "IMPACT_WITH_HUMAN"; severity = "CRITICAL"; }
  else if (hazards >= 2) { situation = "MULTIPLE_HAZARDS"; severity = "CRITICAL"; }
  else if (flame) { situation = "POSSIBLE_FIRE"; severity = "CRITICAL"; }
  else if (human) { situation = "HUMAN_DETECTED"; severity = "HIGH"; }
  else if (hot) { situation = "HIGH_TEMPERATURE"; severity = "HIGH"; }
  else if (impact) { situation = "IMPACT_DETECTED"; severity = "HIGH"; }
  else if (extra.length) { situation = "SENSOR_HAZARD"; severity = unit.risk?.level || "MEDIUM"; }
  else if (!s.human?.available) { situation = "SENSOR_UNAVAILABLE"; severity = "WARNING"; }
  const reasons = [];
  if (!unit.online) reasons.push("Unit heartbeat unavailable; previous readings are stale.");
  else {
    if (human) reasons.push(`${s.human.stationary ? "Stationary" : s.human.moving ? "Moving" : "Reported"} human presence detected by ${s.human.sensor || "LD2410"}.`);
    if (flame) reasons.push("Flame detected.");
    if (hot) reasons.push(`Temperature elevated: ${s.temp} °C.`);
    if (impact) reasons.push(`Major motion/impact: ${s.vibration} g.`);
    extra.forEach(e => reasons.push(`${e.replaceAll("_", " ")} warning (simulated).`));
    if (!s.human?.available) reasons.push("Human presence sensor unavailable; absence cannot be confirmed.");
    if (situation === "NORMAL") reasons.push("No human presence or hazard threshold detected in current telemetry.");
    if (Number.isFinite(s.humidity)) reasons.push(`Humidity: ${s.humidity}% (context only).`);
    const cam = s.camera;
    if (cam?.simulated) reasons.push(`Simulated camera state: ${cam.status}; no real visual confirmation.`);
    else reasons.push(cam?.connected && ["ONLINE", "STREAMING"].includes(cam.status) ? "Camera reported available for operator visual confirmation; no AI detection." : "Visual confirmation unavailable.");
  }
  const gps = s.gps;
  const validGps = unit.online && gps?.valid === true && Number.isFinite(gps.lat) && Number.isFinite(gps.lng) && Math.abs(gps.lat) <= 90 && Math.abs(gps.lng) <= 180;
  return { situation, severity, confidence: null, confidenceBasis: "Rule-based assessment; no calibrated confidence supplied by sensors.", reasons, recommendedAction: guidance[situation], simulated: s.simulated === true, location: validGps ? { lat: gps.lat, lng: gps.lng, simulated: s.simulated === true } : null };
}
module.exports = { assessUnit };
