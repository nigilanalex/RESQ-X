/**
 * Turns raw sensor + detection data into one 0-100 risk score and a level.
 * Tune the thresholds/weights against your real sensor ranges once you have
 * field data — these are reasonable starting points for MQ2 (gas), a
 * DHT22 (temp/humidity), an SW-420 vibration switch, and a PIR.
 */

const WEIGHTS = {
  gas: 0.30,
  temp: 0.20,
  vibration: 0.15,
  personDetected: 0.35,
};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// Each of these maps a raw reading to a 0-1 danger score.
function gasDanger(gasPPM) {
  if (gasPPM == null) return 0;
  // MQ2: ~200 ppm background, 1000+ ppm is hazardous smoke/gas concentration
  return clamp((gasPPM - 200) / 1800, 0, 1);
}

function tempDanger(tempC) {
  if (tempC == null) return 0;
  // Above 45C suggests fire/heat hazard rather than ambient temperature
  return clamp((tempC - 45) / 55, 0, 1);
}

function vibrationDanger(vibration) {
  if (vibration == null) return 0;
  // Treated as 0-1 already (e.g. rolling average of a digital vibration switch)
  return clamp(vibration, 0, 1);
}

function detectionDanger(detection) {
  if (!detection || !detection.personDetected) return 0;
  // A confident detection of a trapped/stranded person is itself the emergency
  return clamp(detection.confidence ?? 0.6, 0, 1);
}

function levelForScore(score) {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}

function computeRisk({ sensors, detection }) {
  const gas = gasDanger(sensors?.gasPPM);
  const temp = tempDanger(sensors?.temp);
  const vibration = vibrationDanger(sensors?.vibration);
  const person = detectionDanger(detection);

  const weighted =
    gas * WEIGHTS.gas +
    temp * WEIGHTS.temp +
    vibration * WEIGHTS.vibration +
    person * WEIGHTS.personDetected;

  const score = Math.round(weighted * 100);

  return {
    score,
    level: levelForScore(score),
    breakdown: {
      gas: Math.round(gas * 100),
      temp: Math.round(temp * 100),
      vibration: Math.round(vibration * 100),
      person: Math.round(person * 100),
    },
  };
}

module.exports = { computeRisk, levelForScore };
