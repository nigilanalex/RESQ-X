const express = require("express");
const store = require("../store");

const VALID_ACTIONS = new Set([
  "move_forward",
  "move_backward",
  "turn_left",
  "turn_right",
  "stop",
  "siren_on",
  "siren_off",
  "light_on",
  "light_off",
]);
const SIMULATION_SCENARIOS = new Set(["normal", "fire", "high_temp", "impact", "human", "human_moving", "human_stationary", "no_human", "human_sensor_unavailable", "gas", "water", "low_battery", "gps_available", "gps_unavailable", "offline", "camera_online", "camera_offline", "camera_not_configured", "camera_error"]);

function buildApiRouter(mqttHandle) {
  ["human_fire", "human_high_temp", "human_impact", "fire_high_temp", "multiple_hazards", "all_clear"].forEach(scenario => SIMULATION_SCENARIOS.add(scenario));
  const router = express.Router();

  router.get("/units", (req, res) => {
    res.json(store.getAllUnits());
  });

  router.get("/units/:unitId", (req, res) => {
    const unit = store.getUnit(req.params.unitId);
    if (!unit) return res.status(404).json({ error: "Unknown unit" });
    res.json(unit);
  });

  router.get("/alerts", (req, res) => {
    const limit = Number(req.query.limit) || 100;
    res.json(store.getAlerts(limit));
  });

  router.delete("/alerts", (req, res) => {
    store.clearAlerts();
    res.json({ ok: true });
  });

  router.post("/units/:unitId/control", (req, res) => {
    const { unitId } = req.params;
    const { action, params } = req.body || {};

    if (!VALID_ACTIONS.has(action)) {
      return res.status(400).json({
        error: `Invalid action. Expected one of: ${[...VALID_ACTIONS].join(", ")}`,
      });
    }

    try {
      const command = mqttHandle.sendControl(unitId, action, params || {});
      res.json({ ok: true, command });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.post("/simulator/:unitId/scenario", (req, res) => {
    const { scenario } = req.body || {};
    if (!SIMULATION_SCENARIOS.has(scenario)) return res.status(400).json({ error: "Invalid simulation scenario" });
    try { res.json({ ok: true, simulation: mqttHandle.sendSimulationScenario(req.params.unitId, scenario) }); }
    catch (error) { res.status(error.statusCode || 500).json({ error: error.message }); }
  });

  return router;
}

module.exports = { buildApiRouter };
