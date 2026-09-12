/**
 * Converts verified telemetry into one 0-100 operational risk score.
 * Gas, water, person, and battery test events are only considered when they
 * arrive in explicitly simulated telemetry; they are not claims about fitted
 * RESQ-X hardware.
 */
function clamp(value, min = 0, max = 100) { return Math.max(min, Math.min(max, value)); }
function levelForScore(score) { return score >= 75 ? "CRITICAL" : score >= 50 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW"; }
function hasSimEvent(sensors, event) { return sensors?.simulated === true && Array.isArray(sensors.simulation?.events) && sensors.simulation.events.includes(event); }

function computeRisk({ sensors, detection }) {
  const flame = sensors?.flame === true ? 90 : 0;
  const temp = Number.isFinite(sensors?.temp) ? clamp(((sensors.temp - 45) / 30) * 65) : 0;
  const impact = Number.isFinite(sensors?.vibration) ? clamp(sensors.vibration * 55) : 0;
  const person = detection?.personDetected ? 60 : 0;
  const gas = hasSimEvent(sensors, "gas") ? 60 : 0;
  const water = hasSimEvent(sensors, "water") ? 30 : 0;
  const battery = hasSimEvent(sensors, "low_battery") ? 30 : 0;
  const score = Math.round(clamp(flame + temp + impact + person + gas + water + battery));

  return { score, level: levelForScore(score), breakdown: { flame, temp: Math.round(temp), vibration: Math.round(impact), personDetected: person, simulatedGas: gas, simulatedWater: water, simulatedLowBattery: battery } };
}

module.exports = { computeRisk, levelForScore };
