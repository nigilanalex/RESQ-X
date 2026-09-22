// Non-browser checks: real components rendered with React SSR, plus isolated
// MQTT adapter tests. This does not claim layout, media, or fullscreen QA.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');
const root = path.resolve(__dirname, '..');
const frontendRequire = createRequire(path.join(root, 'frontend/package.json'));
const React = frontendRequire('react');
const { renderToStaticMarkup } = frontendRequire('react-dom/server');
const esbuild = frontendRequire('esbuild');

async function component(name) {
  const result = await esbuild.build({
    entryPoints: [path.join(root, 'frontend/src/components', `${name}.jsx`)],
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx:'automatic', loader: { '.css': 'empty' },
    external: ['react', 'react-dom'], define: { 'import.meta.env': '{}' },
    plugins: [{ name:'isolate-socket', setup(build) {
      build.onLoad({ filter:/api[\\/]socket\.js$/ }, () => ({ contents:"export const BACKEND_URL='http://localhost:4000'; export const sendControl=()=>Promise.resolve(); export const apiFetch=()=>Promise.resolve({ok:false,json:()=>Promise.resolve({})});", loader:'js' }));
    } }],
  });
  const m = { exports:{} };
  new Function('require','module','exports','window',result.outputFiles[0].text)(frontendRequire,m,m.exports,{location:{protocol:'http:'}});
  return m.exports.default;
}
async function main() {
  const { telemetryRows, validGPS, riskView } = await import(pathToFileURL(path.join(root,'frontend/src/components/telemetryView.js')));
  assert.equal(validGPS({valid:true,lat:null,lng:null}),false);
  assert.equal(validGPS({valid:true,lat:100,lng:80}),false);
  assert.equal(validGPS({valid:false,lat:12,lng:80}),false);
  assert.equal(riskView(null).score,null);
  for (const id of ['temp','humidity','flame','human','battery','motion']) assert.equal(telemetryRows(null).find(r=>r.id===id).value,'NOT AVAILABLE');
  const sim = { unitId:'unit-01', online:true, operatingMode:'SIMULATION', sensors:{simulated:true, camera:{status:'STREAMING'}} };
  const live = {...sim,operatingMode:'LIVE',sensors:{source:'ESP32'}};
  const Camera = await component('CameraFeed');
  const render = (C, props) => renderToStaticMarkup(React.createElement(C,props));
  const simMarkup = render(Camera,{unit:sim,streamUrl:'http://192.168.1.10:81/stream'});
  assert.ok(!simMarkup.includes('<img'),'Simulation mounts no real camera image');
  assert.ok(simMarkup.includes('NO PHYSICAL CAMERA REQUESTS'));
  const liveMarkup = render(Camera,{unit:live,streamUrl:'http://192.168.1.10:81/stream'});
  assert.ok(liveMarkup.includes('src="http://192.168.1.10:81/stream"'));
  assert.ok(liveMarkup.includes('CAPTURE IMAGE') && liveMarkup.includes('FULL SCREEN') && liveMarkup.includes('HEADLIGHT'));
  assert.ok(liveMarkup.includes('Recording unavailable'));
  const Header = await component('Header');
  const offlineHeader = render(Header,{units:[{...live,online:false}], selectedUnitId:'unit-01',socketConnected:true,mqttStatus:{connected:true}});
  assert.ok(!offlineHeader.includes('>LIVE<'),'Offline telemetry cannot produce LIVE badge');
  const Sensors = await component('SensorGrid');
  assert.ok(render(Sensors,{unit:null}).includes('NOT AVAILABLE'));
  const Controls = await component('ControlPanel');
  const controlMarkup = render(Controls,{unit:sim,motor:{unitId:'unit-01',online:true,state:'forward',source:'simulator',simulated:true,controllerId:'motor-sim-01'},canOperate:true});
  assert.ok(controlMarkup.includes('MOVING FORWARD') && controlMarkup.includes('SIMULATED MOTOR'));
  assert.ok(controlMarkup.includes('FORWARD') && controlMarkup.includes('BACKWARD') && controlMarkup.includes('EMERGENCY STOP'));
  const Gallery = await component('CapturedPhotos');
  assert.ok(render(Gallery,{photos:[]}).includes('No captured photos yet'));
  const Alerts = await component('AlertFeed');
  assert.ok(render(Alerts,{alerts:[{id:'1',timestamp:1,message:'Test event',unitId:'unit-01',level:'CRITICAL'}],onAcknowledge:()=>{}}).includes('ACKNOWLEDGE · LOCAL'));

  const client = new EventEmitter(); client.connected = true;
  const published=[]; client.publish=(...args)=>published.push(args); client.subscribe=()=>{};
  {
    const store=require('../backend/src/store');
    const {setupMqtt,normalizeSensors}=require('../backend/src/mqttClient');
    const savedIds=process.env.RESQX_UNIT_IDS; process.env.RESQX_UNIT_IDS='test-ui';
    const handle=setupMqtt({emit:()=>{}},()=>client);
    assert.equal(normalizeSensors({}).flame,null,'Missing flame stays unknown');
    store.updateMotorStatus('test-ui',{online:true,state:'stopped',source:'simulator',simulated:true,controllerId:'motor-sim-test',commandId:null,reason:'connected'});
    client.publish=(...args)=>{published.push(args); args.find(value=>typeof value==='function')?.();};
    const result=await handle.sendControl('test-ui','forward');
    assert.equal(result.simulated,true); assert.equal(published[0][0],'resqx/robot/motor/simulator','Simulated command uses isolated motor topic');
    store.updateMotorStatus('test-ui',{online:true,state:'stopped',source:'motor-esp32',simulated:false,controllerId:'motor-test',commandId:null,reason:'connected'});
    await handle.sendControl('test-ui','stop');
    assert.equal(published[1][0],'resqx/robot/motor/command');
    assert.throws(()=>normalizeSensors({source:'unknown'}),/invalid telemetry source/,'Unknown telemetry source is rejected');
    process.env.RESQX_UNIT_IDS=savedIds;
  }
  console.log('PASS: component SSR, unavailable sensors/GPS, LIVE label, simulation camera isolation, MQTT motor isolation, strict source validation, motor topic, gallery and local acknowledgement');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
