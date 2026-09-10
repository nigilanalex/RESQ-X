const mqtt = require("mqtt");
const store = require("./store");
const { computeRisk } = require("./riskEngine");
const alertService = require("./alertService");

/**
 * Topic convention:
 *
 * resqx/<unitId>/sensors
 * resqx/<unitId>/detection
 * resqx/<unitId>/status
 * resqx/<unitId>/control
 */

function setupMqtt(io) {
  alertService.attachIo(io);

  const client = mqtt.connect(
    process.env.MQTT_BROKER_URL || "mqtt://localhost:1883",
    {
      username: process.env.MQTT_USERNAME || undefined,
      password: process.env.MQTT_PASSWORD || undefined,
      reconnectPeriod: 2000,
      clientId: `resqx-server-${Math.random().toString(16).slice(2)}`,
    }
  );

  const unitIds = (process.env.RESQX_UNIT_IDS || "unit-01")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  client.on("connect", () => {
    console.log("[MQTT] connected to broker");

    unitIds.forEach((unitId) => {
      client.subscribe(`resqx/${unitId}/sensors`);
      client.subscribe(`resqx/${unitId}/detection`);
      client.subscribe(`resqx/${unitId}/status`);
    });
  });

  client.on("reconnect", () => {
    console.log("[MQTT] reconnecting...");
  });

  client.on("error", (err) => {
    console.error("[MQTT] error:", err.message);
  });

  client.on("message", async (topic, payloadBuf) => {
    const parts = topic.split("/");

    if (parts.length !== 3 || parts[0] !== "resqx") {
      return;
    }

    const [, unitId, channel] = parts;
    const payload = payloadBuf.toString();

    console.log("[MQTT RECEIVED]", topic, payload);

    try {
      if (channel === "status") {
        const online = payload === "online";

        const unit = store.setStatus(unitId, online);

        io.emit("unit:update", unit);

        return;
      }

      const data = JSON.parse(payload);

      if (channel === "sensors") {
        console.log("[MQTT] Updating sensors:", data);

        const unit = store.updateSensors(unitId, data);

        console.log("[STORE] Sensors now:", unit.sensors);

        const risk = computeRisk({
          sensors: unit.sensors,
          detection: unit.detection,
        });

        store.setRisk(unitId, risk);

        console.log(
          "[SOCKET] Sending unit:update:",
          store.getUnit(unitId)
        );

        io.emit("unit:update", store.getUnit(unitId));

        await alertService.maybeRaiseAlert(
          unitId,
          risk,
          unit.detection
        );

        return;
      }

      if (channel === "detection") {
        const unit = store.updateDetection(unitId, data);

        const risk = computeRisk({
          sensors: unit.sensors,
          detection: unit.detection,
        });

        store.setRisk(unitId, risk);

        io.emit("unit:update", store.getUnit(unitId));

        await alertService.maybeRaiseAlert(
          unitId,
          risk,
          unit.detection
        );

        return;
      }
    } catch (err) {
      console.error(
        `[MQTT] failed to handle ${topic}:`,
        err.message
      );
    }
  });

  function sendControl(unitId, action, params = {}) {
    const command = {
      action,
      params,
      ts: Date.now(),
    };

    client.publish(
      `resqx/${unitId}/control`,
      JSON.stringify(command),
      { qos: 1 }
    );

    store.setLastCommand(unitId, command);

    io.emit("unit:update", store.getUnit(unitId));

    return command;
  }

  return {
    client,
    sendControl,
    unitIds,
  };
}

module.exports = { setupMqtt };