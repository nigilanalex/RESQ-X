import { useEffect, useState } from 'react';
import './Header.css';
export default function Header({ units, selectedUnitId, onSelectUnit, socketConnected, mqttStatus, cameraStatus, currentUser }) {
  const [clock, setClock] = useState(new Date());
  useEffect(() => { const timer = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(timer); }, []);
  const unit = units.find(item => item.unitId === selectedUnitId);
  const connected = socketConnected && unit?.online === true;
  const simulated = unit?.operatingMode === 'SIMULATION';
  const live = connected && unit?.operatingMode === 'LIVE';
  return <header className="hdr">
    <div className="hdr__brand"><span className="hdr__crest" aria-hidden="true"><i /><i /><i /></span><div><strong className="hdr__mark">RESQ-X<span> / </span></strong><small className="hdr__tag">RESCUE COMMAND CENTER</small></div></div>
    <div className="hdr__units"><label htmlFor="active-unit">{connected ? '● SYSTEM ONLINE' : '○ SYSTEM OFFLINE'}</label><select id="active-unit" value={selectedUnitId || ''} onChange={event => onSelectUnit(event.target.value)}><option value="" disabled>Select unit</option>{units.map(item => <option key={item.unitId} value={item.unitId}>{item.unitId} · {item.operatingMode}</option>)}</select></div>
    <div className="hdr__status">
      <div className="hdr__conn"><small>MISSION LINK</small><b className={connected ? 'is-online' : ''}>{connected ? 'MONITORING' : 'STANDBY'}</b></div>
      <div className="hdr__conn" title={mqttStatus?.error || 'MQTT transport'}><small>MQTT</small><b className={mqttStatus?.connected ? 'is-online' : 'is-offline'}>{mqttStatus?.connected ? 'ONLINE' : 'OFFLINE'}</b></div>
      <div className="hdr__conn"><small>CAMERA</small><b>{cameraStatus || 'NOT AVAILABLE'}</b></div>
      <div className={`hdr__mode ${simulated ? 'is-sim' : live ? 'is-live' : ''}`}><small>OPERATING MODE</small><b>{simulated ? 'SIMULATION' : live ? 'LIVE' : 'OFFLINE / UNVERIFIED'}</b><small>{simulated ? 'SIMULATED DATA' : live ? 'ESP32 TELEMETRY' : 'NO LIVE CONFIRMATION'}</small></div>
      <div className="hdr__clock"><time>{clock.toLocaleTimeString([], { hour12:false })}</time><small>{clock.toLocaleDateString()} · LOCAL</small></div>
    </div>
    <div className="hdr__user"><small>{currentUser?.role}</small><b>{currentUser?.username}</b></div>
  </header>;
}
