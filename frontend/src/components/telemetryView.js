export const UNAVAILABLE = 'NOT AVAILABLE';
export function validGPS(gps) {
  return gps?.valid === true && Number.isFinite(gps.lat) && Number.isFinite(gps.lng)
    && Math.abs(gps.lat) <= 90 && Math.abs(gps.lng) <= 180;
}
export function riskView(unit) {
  const available = Boolean(unit?.sensors && Number.isFinite(unit?.risk?.score));
  return { score: available ? unit.risk.score : null, level: available ? unit.risk.level : UNAVAILABLE };
}
export function telemetryRows(unit) {
  const s = unit?.sensors || {}, h = s.human || {}, gps = s.gps;
  const numeric = (v, suffix) => Number.isFinite(v) ? `${v.toFixed(1)}${suffix}` : UNAVAILABLE;
  const binary = (v, yes, no) => v === true ? yes : v === false ? no : UNAVAILABLE;
  const fixed = validGPS(gps);
  const lowBattery = s.simulated === true && s.simulation?.events?.includes('low_battery');
  return [
    { id:'temp', icon:'♨', label:'Temperature', value:numeric(s.temp,' °C'), status:Number.isFinite(s.temp) ? s.temp > 45 ? 'ELEVATED' : 'NORMAL' : UNAVAILABLE, warning:s.temp > 45 },
    { id:'humidity', icon:'◈', label:'Humidity', value:numeric(s.humidity,' %'), status:Number.isFinite(s.humidity) ? 'MEASURED' : UNAVAILABLE },
    { id:'flame', icon:'♨', label:'Flame', value:binary(s.flame,'DETECTED','CLEAR'), status:binary(s.flame,'HAZARD','CLEAR'), warning:s.flame === true },
    { id:'human', icon:'◎', label:'Human presence', value:h.available === true ? binary(h.presence,'DETECTED','CLEAR') : UNAVAILABLE, status:h.available === true ? h.moving ? 'MOVING · LD2410' : h.stationary ? 'STATIONARY · LD2410' : 'LD2410 AVAILABLE' : UNAVAILABLE, warning:h.available === true && h.presence === true },
    { id:'human_sensor', icon:'◉', label:'Presence sensor / range', value:h.available === true ? h.sensor || UNAVAILABLE : UNAVAILABLE, status:h.available === true && Number.isFinite(h.distance) ? `${h.distance.toFixed(1)} m` : 'RANGE NOT AVAILABLE' },
    { id:'motion', icon:'⌁', label:'Motion / impact', value:numeric(s.vibration,' g'), status:Number.isFinite(s.vibration) ? s.vibration > .35 ? 'WARNING' : 'NORMAL' : UNAVAILABLE, warning:s.vibration > .35 },
    { id:'gps', icon:'⌖', label:'GPS signal', value:fixed ? `${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}` : 'NO FIX', status:fixed ? s.simulated ? 'SIMULATED FIX' : 'FIXED' : UNAVAILABLE },
    { id:'battery', icon:'▰', label:'Battery', value:lowBattery ? 'LOW (SIMULATED)' : s.batteryAvailable === true ? numeric(s.battery,' %') : UNAVAILABLE, status:lowBattery ? 'SIMULATED TEST' : s.batteryAvailable && Number.isFinite(s.battery) ? 'MEASURED' : 'NOT MEASURED', warning:lowBattery || s.batteryAvailable === true && Number.isFinite(s.battery) && s.battery < 20 },
    { id:'pir', icon:'◉', label:'PIR motion', value:s.pirAvailable === true ? binary(s.pir,'DETECTED','CLEAR') : UNAVAILABLE, status:s.pirAvailable ? 'INSTALLED' : 'NOT INSTALLED' },
    { id:'link', icon:'↗', label:'Unit connection', value:unit?.online === true ? 'CONNECTED' : 'OFFLINE', status:unit?.unitId || UNAVAILABLE },
  ];
}
export function alertSource(alert) {
  const data = alert.data || {};
  const simulated = data.simulated || data.intelligence?.simulated || data.headlight?.simulated || data.camera?.simulated || /SIMULAT/i.test(alert.message);
  return simulated ? 'SIMULATED' : alert.source || (data.headlight || data.camera ? 'ESP32-CAM' : data.intelligence ? 'RISK ENGINE' : 'RESQ-X');
}
