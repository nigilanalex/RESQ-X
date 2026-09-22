/* Deterministic motor-path tests. No broker or physical hardware is contacted. */
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const store = require('../backend/src/store');
const { setupMqtt } = require('../backend/src/mqttClient');
const { normalizeMotorStatus, MOTOR_COMMAND_TOPIC, MOTOR_STATUS_TOPIC, MOTOR_SIMULATOR_COMMAND_TOPIC } = require('../backend/src/motorControl');

const tick = () => new Promise(resolve => setImmediate(resolve));

async function main() {
  const savedIds = process.env.RESQX_UNIT_IDS;
  const savedMotorId = process.env.RESQX_MOTOR_UNIT_ID;
  const savedSimulationMode = process.env.RESQX_SIMULATION_MODE;
  process.env.RESQX_UNIT_IDS = 'unit-01'; process.env.RESQX_MOTOR_UNIT_ID = 'unit-01'; process.env.RESQX_SIMULATION_MODE = 'false';
  const client = new EventEmitter(); client.connected = true; client.subscribe = () => {};
  const publications = [];
  client.publish = (...args) => { publications.push(args); args.find(value => typeof value === 'function')?.(); };
  const emitted = [];
  const handle = setupMqtt({ emit:(event, data) => emitted.push({ event, data }) }, () => client);

  try {
    assert.throws(() => normalizeMotorStatus({}), /online/, 'incomplete status rejected');
    assert.throws(() => normalizeMotorStatus({ online:true, state:'flying', source:'motor-esp32', simulated:false, controllerId:'motor-01' }), /state/, 'invalid state rejected');
    assert.throws(() => normalizeMotorStatus({ online:true, state:'stopped', source:'motor-esp32', simulated:true, controllerId:'motor-01' }), /simulation/, 'forged simulation marker rejected');

    const liveStatus = normalizeMotorStatus({ online:true, state:'stopped', source:'motor-esp32', simulated:false, controllerId:'motor-01', commandId:null, reason:'connected' });
    store.updateMotorStatus('unit-01', liveStatus);
    for (const command of ['forward', 'backward', 'left', 'right', 'stop']) {
      const result = await handle.sendControl('unit-01', command);
      const published = publications.at(-1);
      assert.equal(published[0], MOTOR_COMMAND_TOPIC);
      assert.equal(JSON.parse(published[1]).command, command);
      assert.equal(result.status, 'REQUESTED');
    }
    await assert.rejects(handle.sendControl('unit-01', 'spin'), /Invalid motor command/, 'invalid command rejected');

    store.markMotorOffline('heartbeat_timeout');
    await assert.rejects(handle.sendControl('unit-01', 'forward'), /offline/, 'offline movement rejected');
    await handle.sendControl('unit-01', 'stop');
    assert.equal(publications.at(-1)[0], MOTOR_COMMAND_TOPIC, 'offline STOP still sent to verified controller');

    store.updateMotorStatus('unit-01', { ...liveStatus, source:'simulator', simulated:true, controllerId:'motor-sim-01' });
    await handle.sendControl('unit-01', 'forward');
    assert.equal(publications.at(-1)[0], MOTOR_SIMULATOR_COMMAND_TOPIC, 'simulation uses isolated command topic');

    client.publish = (...args) => args.find(value => typeof value === 'function')?.(new Error('publish failed'));
    await assert.rejects(handle.sendControl('unit-01', 'stop'), /publish failed/, 'MQTT publish failure propagated');

    const statusPayload = { online:true, state:'left', source:'motor-esp32', simulated:false, controllerId:'motor-01', commandId:'status-test-1', reason:'command' };
    client.emit('message', MOTOR_STATUS_TOPIC, Buffer.from(JSON.stringify(statusPayload))); await tick();
    assert.equal(store.getMotorStatus().state, 'left', 'status updates motor store');
    assert.ok(emitted.some(item => item.event === 'motor:update' && item.data.state === 'left'), 'status emitted through Socket.IO');
    const before = store.getMotorStatus().lastSeen;
    client.emit('message', MOTOR_STATUS_TOPIC, Buffer.from('{bad json')); await tick();
    assert.equal(store.getMotorStatus().lastSeen, before, 'malformed status ignored');
    assert.equal(store.expireStaleMotor(before + 7000)?.state, 'offline', 'stale heartbeat marks motor offline');

    const firmware = fs.readFileSync(path.join(__dirname, '../firmware/resqx_motor_controller/resqx_motor_controller.ino'), 'utf8');
    for (const [name, pin] of [['MOTOR_A_IN1',18],['MOTOR_A_IN2',19],['MOTOR_B_IN3',21],['MOTOR_B_IN4',22]]) assert.match(firmware, new RegExp(`${name}\\s*=\\s*${pin}`), `${name} pin is preserved`);
    for (const fn of ['stopMotors', 'moveForward', 'moveBackward', 'turnLeft', 'turnRight']) assert.match(firmware, new RegExp(`void\\s+${fn}\\s*\\(`), `${fn} exists`);
    assert.match(firmware, /MOTOR_COMMAND_TIMEOUT_MS\s*=\s*1000/, 'one-second movement watchdog configured');
    assert.match(firmware, /if \(WiFi\.status\(\) != WL_CONNECTED\)[\s\S]*?stopMotors\(\)/, 'Wi-Fi loss stops motors');
    assert.match(firmware, /if \(mqtt\.connected\(\)\) mqtt\.loop\(\);\s*else stopMotors\(\)/, 'MQTT loss stops motors');
    assert.match(firmware, /mqtt\.subscribe\(MOTOR_COMMAND_TOPIC, 1\)/, 'firmware subscribes only to fixed motor command topic');

    process.env.RESQX_SIMULATION_MODE = 'true';
    const lockedClient = new EventEmitter(); lockedClient.connected = true; lockedClient.subscribe = () => {}; lockedClient.publish = () => { throw new Error('physical publish must not be attempted'); };
    const lockedHandle = setupMqtt({ emit:() => {} }, () => lockedClient);
    store.updateMotorStatus('unit-01', liveStatus);
    await assert.rejects(lockedHandle.sendControl('unit-01', 'forward'), /simulation lock/, 'simulation lock rejects a verified physical controller');

    console.log('Motor tests passed: five commands, strict validation, isolated simulation, simulation lock, publish failure, status confirmation, offline STOP, heartbeat fail-safe, pins, and firmware safety guards.');
  } finally {
    process.env.RESQX_UNIT_IDS = savedIds; process.env.RESQX_MOTOR_UNIT_ID = savedMotorId; process.env.RESQX_SIMULATION_MODE = savedSimulationMode;
  }
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
