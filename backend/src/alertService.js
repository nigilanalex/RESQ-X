const store = require("./store");

// Only re-alert on a level once it's been stable for a moment, and don't
// spam the same level repeatedly — track last alerted level per unit.
const lastAlertedLevel = new Map();

let ioRef = null;
function attachIo(io) {
  ioRef = io;
}

function shouldAlert(unitId, level) {
  if (level === "LOW") {
    lastAlertedLevel.delete(unitId);
    return false;
  }
  const previous = lastAlertedLevel.get(unitId);
  return previous !== level;
}

function messageFor(unitId, risk, detection) {
  const who = detection?.personDetected
    ? `${detection.count ?? 1} person(s) detected nearby. `
    : "";
  return `[${risk.level}] Unit ${unitId}: ${who}risk score ${risk.score}/100.`;
}

async function maybeRaiseAlert(unitId, risk, detection) {
  if (!shouldAlert(unitId, risk.level)) return null;
  lastAlertedLevel.set(unitId, risk.level);

  const alert = {
    id: `${unitId}-${Date.now()}`,
    unitId,
    level: risk.level,
    message: messageFor(unitId, risk, detection),
    data: { risk, detection },
    timestamp: Date.now(),
  };

  store.addAlert(alert);

  if (ioRef) {
    ioRef.emit("alert", alert);
  }

  if (risk.level === "HIGH" || risk.level === "CRITICAL") {
    await deliverExternalAlert(alert);
  }

  return alert;
}

// Stub for real-world delivery (SMS/email/push). Wire in Twilio, SNS,
// Firebase, whatever your rescue team actually watches. Kept fire-and-forget
// so a delivery failure never blocks the live dashboard.
async function deliverExternalAlert(alert) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, ALERT_SMS_TO } =
    process.env;

  if (!TWILIO_ACCOUNT_SID || !ALERT_SMS_TO) {
    console.log("[ALERT]", alert.message, "(SMS not configured, logging only)");
    return;
  }

  try {
    // Uncomment once `npm install twilio` and env vars are set:
    //
    // const twilio = require("twilio")(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    // await twilio.messages.create({
    //   body: alert.message,
    //   from: TWILIO_FROM_NUMBER,
    //   to: ALERT_SMS_TO,
    // });
    console.log("[ALERT->SMS]", alert.message);
  } catch (err) {
    console.error("Failed to deliver SMS alert:", err.message);
  }
}

module.exports = { attachIo, maybeRaiseAlert };
