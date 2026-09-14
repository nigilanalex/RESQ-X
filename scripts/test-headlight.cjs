const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('../backend/node_modules/express');
const { createHeadlightService, buildHeadlightRouter } = require('../backend/src/headlight');

test('headlight HTTP acknowledgement, simulation isolation, failures and notifications', async () => {
  let state = 'OFF', requests = 0, behavior = 'ok';
  const camera = express();
  camera.get('/headlight', (req, res) => {
    requests++;
    if (behavior === 'timeout') return;
    if (behavior === 'bad') return res.json({ ok: false, state: 'ON' });
    if (req.query.state) state = req.query.state.toUpperCase();
    res.json({ ok: true, state });
  });
  const server = await new Promise(resolve => { const s = camera.listen(0, '127.0.0.1', () => resolve(s)); });
  const unit = { online: true, operatingMode: 'SIMULATION' };
  const notices = [];
  const service = createHeadlightService({ getUnit: () => unit, notify: n => notices.push(n), baseUrl: `http://127.0.0.1:${server.address().port}` });
  const api = express(); api.use(express.json()); api.use(buildHeadlightRouter(service));
  const apiServer = await new Promise(resolve => { const s = api.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    assert.equal((await service.run('unit-01', 'ON')).state, 'ON');
    assert.equal((await service.run('unit-01', 'OFF')).state, 'OFF');
    assert.equal(requests, 0, 'Simulation never contacts camera');
    assert.ok(notices.every(n => n.message.includes('SIMULATED')));
    unit.operatingMode = 'LIVE';
    assert.equal((await service.run('unit-01')).state, 'OFF');
    assert.equal((await service.run('unit-01', 'ON')).state, 'ON');
    const count = notices.length;
    await service.run('unit-01'); await service.run('unit-01', 'ON');
    assert.equal(notices.length, count, 'No duplicate notifications');
    assert.equal((await service.run('unit-01', 'OFF')).state, 'OFF');
    behavior = 'bad';
    assert.equal((await service.run('unit-01', 'ON')).state, 'UNAVAILABLE');
    behavior = 'timeout';
    assert.equal((await service.run('unit-01', 'ON')).state, 'UNAVAILABLE');
    behavior = 'ok';
    assert.equal((await service.run('unit-01')).state, 'OFF', 'Recovery does not send ON');
    const before = requests;
    unit.online = false;
    assert.equal((await service.run('unit-01', 'ON')).state, 'UNAVAILABLE');
    assert.equal(requests, before);
    const unreachable = createHeadlightService({ getUnit: () => ({ online: true, operatingMode: 'LIVE' }), notify: () => {}, baseUrl: 'http://127.0.0.1', request: async () => { throw new TypeError('connection refused'); } });
    assert.equal((await unreachable.run('unit-01', 'ON')).state, 'UNAVAILABLE');
    unit.online = true; unit.operatingMode = 'UNVERIFIED';
    assert.equal((await service.run('unit-01', 'ON')).state, 'UNAVAILABLE');
    assert.equal(requests, before);
    for (const invalid of ['on', true, 1, null]) {
      const response = await fetch(`http://127.0.0.1:${apiServer.address().port}/units/unit-01/headlight`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: invalid }) });
      assert.equal(response.status, 400);
    }
    console.log('PASS: ON, OFF, invalid ACK, timeout, offline, mode guard, simulation isolation, deduplication, recovery, strict API validation');
  } finally {
    server.closeAllConnections(); apiServer.closeAllConnections();
    await Promise.all([new Promise(r => server.close(r)), new Promise(r => apiServer.close(r))]);
  }
});
