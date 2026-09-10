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

function buildApiRouter(mqttHandle) {
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

  router.post("/units/:unitId/control", (req, res) => {
    const { unitId } = req.params;
    const { action, params } = req.body || {};

    if (!VALID_ACTIONS.has(action)) {
      return res.status(400).json({
        error: `Invalid action. Expected one of: ${[...VALID_ACTIONS].join(", ")}`,
      });
    }

    const command = mqttHandle.sendControl(unitId, action, params || {});
    res.json({ ok: true, command });
  });

  return router;
}

module.exports = { buildApiRouter };
