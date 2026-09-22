const express = require("express");
const store = require("../store");
const { ROLES } = require('../security');

const VALID_ACTIONS = new Set([
  "forward",
  "backward",
  "left",
  "right",
  "stop",
]);
const SIMULATION_SCENARIOS = new Set(["normal", "fire", "high_temp", "impact", "human", "human_moving", "human_stationary", "no_human", "human_sensor_unavailable", "gas", "water", "low_battery", "gps_available", "gps_unavailable", "offline", "camera_online", "camera_offline", "camera_not_configured", "camera_error"]);

function buildApiRouter(mqttHandle, { security, auth, captureService } = {}) {
  ["human_fire", "human_high_temp", "human_impact", "fire_high_temp", "multiple_hazards", "all_clear"].forEach(scenario => SIMULATION_SCENARIOS.add(scenario));
  const router = express.Router();
  const operator = auth.requireRoles(ROLES.ADMIN, ROLES.OPERATOR);
  const admin = auth.requireRoles(ROLES.ADMIN);
  const validUnit = (unitId) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(unitId) && mqttHandle.unitIds.includes(unitId);
  const checkUnit = (req, res) => {
    if (validUnit(req.params.unitId)) return true;
    security.audit('INVALID_COMMAND', { userId: req.auth?.user.id, role: req.auth?.user.role, unitId: req.params.unitId, result: 'REJECTED' });
    res.status(404).json({ error: 'Unknown unit' }); return false;
  };

  router.get("/units", (req, res) => {
    res.json(store.getAllUnits());
  });

  router.get("/units/:unitId", (req, res) => {
    if (!checkUnit(req, res)) return;
    const unit = store.getUnit(req.params.unitId);
    if (!unit) return res.status(404).json({ error: "Unknown unit" });
    res.json(unit);
  });

  router.get("/alerts", (req, res) => {
    const supplied = Number(req.query.limit);
    const limit = Number.isInteger(supplied) && supplied > 0 ? Math.min(supplied, 200) : 100;
    res.json(store.getAlerts(limit));
  });

  router.delete("/alerts", admin, auth.csrf, (req, res) => {
    store.clearAlerts();
    security.audit('ALERTS_CLEARED', { userId: req.auth.user.id, role: req.auth.user.role, result: 'SUCCESS' });
    res.json({ ok: true });
  });

  router.post("/units/:unitId/control", operator, auth.csrf, async (req, res) => {
    const { unitId } = req.params;
    const { action, params } = req.body || {};
    if (!checkUnit(req, res)) return;

    if (!VALID_ACTIONS.has(action) || Object.keys(req.body || {}).some(key => !['action', 'params'].includes(key)) || (params !== undefined && (typeof params !== 'object' || Array.isArray(params) || Object.keys(params).length))) {
      security.audit('INVALID_COMMAND', { userId: req.auth.user.id, role: req.auth.user.role, action, unitId, result: 'REJECTED' });
      return res.status(400).json({
        error: 'Invalid control command',
      });
    }

    try {
      const command = await mqttHandle.sendControl(unitId, action, {});
      security.audit(action === 'stop' ? 'EMERGENCY_STOP' : 'ROBOT_COMMAND', { userId: req.auth.user.id, role: req.auth.user.role, action, unitId, result: 'SENT' });
      res.json({ ok: true, status: 'REQUESTED', command });
    } catch (error) {
      security.audit(action === 'stop' ? 'EMERGENCY_STOP' : 'ROBOT_COMMAND', { userId: req.auth.user.id, role: req.auth.user.role, action, unitId, result: 'FAILED' });
      res.status(error.statusCode || 500).json({ error: 'Command could not be sent' });
    }
  });

  router.post("/simulator/:unitId/scenario", operator, auth.csrf, (req, res) => {
    if (!checkUnit(req, res)) return;
    const { scenario } = req.body || {};
    if (!SIMULATION_SCENARIOS.has(scenario) || Object.keys(req.body || {}).length !== 1) return res.status(400).json({ error: "Invalid simulation scenario" });
    try { res.json({ ok: true, simulation: mqttHandle.sendSimulationScenario(req.params.unitId, scenario) }); }
    catch (error) { res.status(error.statusCode || 500).json({ error: 'Simulation event could not be sent' }); }
  });

  router.post('/units/:unitId/capture', operator, auth.csrf, async (req, res, next) => {
    if (!checkUnit(req, res)) return;
    if (Object.keys(req.body || {}).length) return res.status(400).json({ error: 'Capture request must not include parameters' });
    try {
      const image = await captureService.capture(req.params.unitId);
      security.audit('CAMERA_CAPTURE', { userId: req.auth.user.id, role: req.auth.user.role, unitId: req.params.unitId, result: 'SUCCESS' });
      res.type('image/jpeg').set('Cache-Control', 'no-store').send(image);
    } catch (error) {
      security.audit('CAMERA_CAPTURE', { userId: req.auth.user.id, role: req.auth.user.role, unitId: req.params.unitId, result: 'FAILED' });
      next(error);
    }
  });

  router.get('/users', admin, (req, res) => res.json(security.readUsers().map(security.publicUser)));
  router.post('/users', admin, auth.csrf, (req, res) => {
    try {
      if (Object.keys(req.body || {}).some(key => !['username', 'password', 'role'].includes(key))) return res.status(400).json({ error: 'Invalid user request' });
      const user = security.createUser(req.body);
      security.audit('USER_CREATED', { userId: req.auth.user.id, role: req.auth.user.role, action: user.role, result: 'SUCCESS' });
      res.status(201).json(user);
    } catch (error) { res.status(400).json({ error: error.message }); }
  });
  router.patch('/users/:userId/role', admin, auth.csrf, (req, res) => {
    try {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.userId)) return res.status(400).json({ error: 'Invalid user ID' });
      if (Object.keys(req.body || {}).length !== 1) return res.status(400).json({ error: 'Invalid role request' });
      const user = security.changeRole(req.params.userId, req.body.role);
      security.audit('USER_ROLE_CHANGED', { userId: req.auth.user.id, role: req.auth.user.role, action: user.role, result: 'SUCCESS' }); res.json(user);
    } catch (error) { res.status(400).json({ error: error.message }); }
  });
  router.patch('/users/:userId/password', admin, auth.csrf, (req, res) => {
    try {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.userId) || Object.keys(req.body || {}).length !== 1 || typeof req.body?.password !== 'string') return res.status(400).json({ error: 'Invalid password-change request' });
      const user = security.changePassword(req.params.userId, req.body.password);
      security.audit('USER_PASSWORD_CHANGED', { userId: req.auth.user.id, role: req.auth.user.role, action: user.id, result: 'SUCCESS' });
      res.json(user);
    } catch (error) { res.status(400).json({ error: error.message }); }
  });

  return router;
}

module.exports = { buildApiRouter };
