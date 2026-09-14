const express = require('express');
const crypto = require('node:crypto');

function createHeadlightService({ getUnit, notify, baseUrl = process.env.ESP32_CAM_BASE_URL, request = fetch }) {
  const simulatedStates = new Map();
  const reported = new Map();
  let queue = Promise.resolve();
  function publish(unitId, result) {
    const key = `${result.simulated}:${result.state}`;
    if (reported.get(unitId) !== key) {
      reported.set(unitId, key);
      notify({ id: crypto.randomUUID(), unitId, level: 'SYSTEM', timestamp: Date.now(),
        message: `HEADLIGHT ${result.state}${result.simulated ? ' (SIMULATED)' : ''}`, data: { headlight: result } });
    }
    return result;
  }
  async function execute(unitId, state) {
    const unit = getUnit(unitId);
    const simulated = unit?.operatingMode === 'SIMULATION';
    const unavailable = error => publish(unitId, { state: 'UNAVAILABLE', simulated, error });
    if (!unit?.online || !['SIMULATION', 'LIVE'].includes(unit.operatingMode)) return unavailable('Unit offline or mode unverified');
    if (simulated) {
      if (state) simulatedStates.set(unitId, state);
      return publish(unitId, { state: simulatedStates.get(unitId) || 'OFF', simulated: true });
    }
    try {
      if (!baseUrl) throw new Error('ESP32_CAM_BASE_URL is not configured');
      const base = new URL(baseUrl);
      if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Invalid ESP32-CAM base URL');
      const url = new URL('/headlight', base);
      if (state) url.searchParams.set('state', state.toLowerCase());
      const response = await request(url, { signal: AbortSignal.timeout(2500), redirect: 'error', cache: 'no-store' });
      if (!response.ok) throw new Error(`Camera HTTP ${response.status}`);
      const body = await response.json();
      if (body.ok !== true || !['ON', 'OFF'].includes(body.state) || (state && body.state !== state)) throw new Error('Invalid headlight acknowledgement');
      // Discard an acknowledgement if the unit went offline or changed mode in flight.
      if (!getUnit(unitId)?.online || getUnit(unitId)?.operatingMode !== 'LIVE') return unavailable('Unit mode or connectivity changed');
      return publish(unitId, { state: body.state, simulated: false });
    } catch (error) { return unavailable(error.name === 'TimeoutError' ? 'Camera request timed out' : error.message); }
  }
  return {
    run(unitId, state) {
      if (state !== undefined && !['ON', 'OFF'].includes(state)) return Promise.reject(new Error('Expected ON or OFF'));
      const task = queue.then(() => execute(unitId, state));
      queue = task.catch(() => {});
      return task;
    },
  };
}

function buildHeadlightRouter(service) {
  const router = express.Router();
  router.get('/units/:unitId/headlight', async (req, res, next) => {
    try { res.json(await service.run(req.params.unitId)); } catch (error) { next(error); }
  });
  router.post('/units/:unitId/headlight', async (req, res, next) => {
    if (!['ON', 'OFF'].includes(req.body?.state)) return res.status(400).json({ error: 'state must be ON or OFF' });
    try {
      const result = await service.run(req.params.unitId, req.body.state);
      res.status(result.state === 'UNAVAILABLE' ? 503 : 200).json(result);
    } catch (error) { next(error); }
  });
  return router;
}
module.exports = { createHeadlightService, buildHeadlightRouter };
