const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function configuredBroker() {
  const envPath = path.join(__dirname, "..", "backend", ".env");
  const text = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  return text.match(/^MQTT_BROKER_URL=(.+)$/m)?.[1]?.trim() || "mqtt://localhost:1883";
}
function safeBrokerLabel(value) {
  try { const url = new URL(value); return `${url.protocol}//${url.host}`; }
  catch { return 'configured broker'; }
}
function serviceState() {
  try { return execFileSync("powershell.exe", ["-NoProfile", "-Command", "(Get-Service -Name mosquitto -ErrorAction Stop).Status"], { encoding: "utf8" }).trim(); }
  catch { return null; }
}
const broker = configuredBroker();
const brokerLabel = safeBrokerLabel(broker);
const state = serviceState();
if (state === "Running") {
  console.log(`[MQTT] Mosquitto Windows service is running. Software-only dev uses mqtt://localhost:1883; saved configuration remains ${brokerLabel}.`);
} else if (state) {
  console.log(`[MQTT] Mosquitto service is ${state}; attempting to start it.`);
  try {
    execFileSync("powershell.exe", ["-NoProfile", "-Command", "Start-Service -Name mosquitto -ErrorAction Stop"], { stdio: "inherit" });
    console.log("[MQTT] Mosquitto service started.");
  } catch {
    console.error("[MQTT] Mosquitto is installed but could not be started. Run this terminal as Administrator, then retry.");
    process.exit(1);
  }
} else {
  console.error(`[MQTT] Mosquitto Windows service was not found. Software-only dev requires a local broker on localhost:1883.`);
  process.exit(1);
}
