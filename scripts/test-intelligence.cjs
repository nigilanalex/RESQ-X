const assert = require('node:assert/strict');
const { io } = require('../frontend/node_modules/socket.io-client');
const { assessUnit } = require('../backend/src/intelligence');
const { normalizeSensors } = require('../backend/src/mqttClient');
const { computeRisk } = require('../backend/src/riskEngine');
const base = 'http://localhost:4000/api';
const socket = io('http://localhost:4000', { autoConnect: false });
let latest; const alerts = []; let updateCount = 0;
socket.on('unit:update', unit => { latest = unit; updateCount++; });
socket.on('snapshot', value => { latest = value.units.find(u => u.unitId === 'unit-01'); });
socket.on('alert', alert => alerts.push(alert));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function post(path, body) { const r = await fetch(base + path, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)}); assert.equal(r.status,200,await r.text()); }
async function scenario(name, situation, severity) {
  const count = updateCount;
  await post('/simulator/unit-01/scenario',{scenario:name});
  for (let i=0;i<50;i++) { if(updateCount>count && latest?.intelligence?.situation===situation && (name==='offline' ? !latest.online : latest.sensors.simulation.scenario===(name==='all_clear'?'normal':name))) break; await delay(100); }
  assert.equal(latest.intelligence.situation,situation,name);
  assert.equal(latest.intelligence.severity,severity,name);
  assert.equal(latest.intelligence.simulated,true);
  assert.equal(latest.intelligence.confidence,null);
  assert.ok(latest.intelligence.recommendedAction);
  console.log(`${name}: ${situation} / ${severity} / risk ${latest.risk.level}`);
}
async function main() {
  const absent = normalizeSensors({source:'simulator',simulated:true,temp:null,human:{distance:null},gps:{valid:true,lat:null,lng:null}});
  assert.equal(absent.temp,null); assert.equal(absent.human.distance,null); assert.equal(absent.gps.valid,false);
  const flameOnly = {online:true,sensors:{flame:true,human:{available:true,presence:false}}};
  assert.equal(assessUnit(flameOnly).situation,'POSSIBLE_FIRE');
  assert.equal(assessUnit({...flameOnly,online:false}).location,null);
  socket.connect();
  for(let i=0;i<50&&!latest;i++) await delay(100);
  assert.ok(latest,'Socket snapshot received');
  const commandsBefore = latest.lastCommand;
  await scenario('normal','NORMAL','LOW');
  await scenario('human_moving','HUMAN_DETECTED','HIGH');
  const alertCount = alerts.filter(a=>a.data?.intelligence).length;
  await delay(6500);
  assert.equal(alerts.filter(a=>a.data?.intelligence).length,alertCount,'No repeated intelligence alerts');
  await scenario('human_stationary','HUMAN_DETECTED','HIGH');
  await scenario('fire','MULTIPLE_HAZARDS','CRITICAL'); // Existing fire scenario includes 82 C heat.
  await scenario('human_fire','FIRE_WITH_HUMAN','CRITICAL');
  await scenario('human_high_temp','HIGH_TEMPERATURE_WITH_HUMAN','CRITICAL');
  await scenario('human_impact','IMPACT_WITH_HUMAN','CRITICAL');
  await scenario('fire_high_temp','MULTIPLE_HAZARDS','CRITICAL');
  await scenario('multiple_hazards','MULTIPLE_HAZARDS','CRITICAL');
  await scenario('human_sensor_unavailable','SENSOR_UNAVAILABLE','WARNING');
  await scenario('impact','IMPACT_DETECTED','HIGH');
  await scenario('high_temp','HIGH_TEMPERATURE','HIGH');
  await scenario('water','SENSOR_HAZARD','MEDIUM');
  await scenario('gps_available','NORMAL','LOW');
  assert.ok(latest.intelligence.location?.simulated);
  await scenario('gps_unavailable','NORMAL','LOW'); assert.equal(latest.intelligence.location,null);
  await post('/simulator/unit-01/scenario',{scenario:'camera_online'}); await delay(700);
  assert.ok(latest.intelligence.reasons.some(r=>r.includes('Simulated camera state: STREAMING')));
  await scenario('offline','ROBOT_OFFLINE','OFFLINE');
  await scenario('all_clear','NORMAL','LOW');
  assert.equal(latest.sensors.camera.status,'NOT_CONNECTED');
  assert.deepEqual(latest.lastCommand,commandsBefore,'Intelligence never changes motor commands');
  await post('/units/unit-01/control',{action:'stop'});
  for(let i=0;i<30&&latest.lastCommand?.action!=='stop';i++) await delay(100);
  assert.equal(latest.lastCommand.action,'stop');
  assert.ok(alerts.some(a=>a.data?.intelligence?.situation==='FIRE_WITH_HUMAN' && a.message.includes('SIMULATED')));
  const html = await fetch('http://localhost:5173'); assert.equal(html.status,200);
  console.log('PASS: MQTT scenarios, Socket.IO assessments/alerts, deduplication, GPS/camera context, controls, frontend HTTP');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await post('/simulator/unit-01/scenario',{scenario:'all_clear'}).catch(()=>{});socket.disconnect();});
