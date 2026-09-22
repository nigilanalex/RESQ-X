import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, setCsrfToken, socket } from "./api/socket";
import Header from "./components/Header.jsx";
import CameraFeed from "./components/CameraFeed.jsx";
import CapturedPhotos from './components/CapturedPhotos';
import SensorGrid from "./components/SensorGrid.jsx";
import AlertFeed from "./components/AlertFeed.jsx";
import ControlPanel from "./components/ControlPanel.jsx";
import SimulationControls from "./components/SimulationControls.jsx";
import MapView from "./components/MapView.jsx";
import RescueIntelligence from "./components/RescueIntelligence.jsx";
import MissionTimeline from './components/MissionTimeline';
import { validGPS } from './components/telemetryView';
import "./App.css";

const now = () => Date.now();
const statusNotice = (message, severity = "SYSTEM", unitId = "SYSTEM") => ({ id: `${unitId}-${message}-${now()}`, message, severity, unitId, timestamp: now() });

export default function App() {
  const [authState, setAuthState] = useState({ loading: true, user: null, error: null });
  useEffect(() => {
    let cancelled = false;
    async function openCommandCenter() {
      try {
        let response = await apiFetch('/api/auth/me');
        if (!response.ok) {
          const url = new URL(window.location.href);
          const accessToken = url.searchParams.get('access');
          if (!accessToken) throw new Error('Open the secure local dashboard link printed by the backend.');
          url.searchParams.delete('access');
          window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
          response = await apiFetch('/api/auth/local', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken }) });
          if (!response.ok) throw new Error('The secure local dashboard link is invalid or expired. Restart RESQ-X and open the new link.');
        }
        const data = await response.json();
        setCsrfToken(data.csrfToken);
        if (!cancelled) { setAuthState({ loading: false, user: data.user, error: null }); socket.connect(); }
      } catch (error) {
        if (!cancelled) setAuthState({ loading: false, user: null, error: error.message });
      }
    }
    openCommandCenter();
    return () => { cancelled = true; };
  }, []);
  const [activeTab, setActiveTab] = useState('OVERVIEW');
  const [history, setHistory] = useState([]);
  const [acknowledged, setAcknowledged] = useState({});
  const [cameraState, setCameraState] = useState(null);
  const cameraStatusRef = useRef(null);
  const [photos, setPhotos] = useState([]);
  const photoUrls = useRef(new Set());
  useEffect(() => () => {
    photoUrls.current.forEach(url => URL.revokeObjectURL(url));
    photoUrls.current.clear();
  }, []);
  function recordPhoto(metadata, blob) {
    const url = URL.createObjectURL(blob);
    photoUrls.current.add(url);
    setPhotos(previous => [{ ...metadata, url }, ...previous]);
    addNotice({ ...statusNotice('Photo evidence captured', 'INFO', metadata.unitId), source:'ESP32-CAM' });
  }
  const [socketConnected, setSocketConnected] = useState(socket.connected);
  const [mqttStatus, setMqttStatus] = useState({ connected: false, error: null });
  const [motorStatus, setMotorStatus] = useState(null);
  const motorRef = useRef(null);
  const [units, setUnits] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [selectedUnitId, setSelectedUnitId] = useState(null);
  const [streamUrl, setStreamUrl] = useState(localStorage.getItem("resqx-stream-url") || "");
  const unitRef = useRef([]);
  const mqttRef = useRef(null);
  const dedupeRef = useRef(new Map());

  function addNotice(notice, dedupeWindowMs = 30000) {
    const key = `${notice.severity}:${notice.unitId}:${notice.message}`;
    const last = dedupeRef.current.get(key) || 0;
    if (now() - last < dedupeWindowMs) return;
    dedupeRef.current.set(key, now());
    setNotifications((previous) => [notice, ...previous].slice(0, 200));
    setHistory(previous => [notice, ...previous.filter(item => item.id !== notice.id)].slice(0, 500));
  }

  const recordCameraStatus = useCallback(next => {
    const previous = cameraStatusRef.current;
    cameraStatusRef.current = next;
    setCameraState(next);
    if (next.unitId && (!previous || previous.unitId !== next.unitId || previous.status !== next.status)) {
      addNotice({ ...statusNotice(`Camera: ${next.status}`, 'SYSTEM', next.unitId), source:'ESP32-CAM' });
    }
  }, []);
  function acknowledge(id) { setAcknowledged(previous => ({ ...previous, [id]: true })); }

  function recordMqttStatus(status) {
    const previous = mqttRef.current;
    mqttRef.current = status;
    setMqttStatus(status);
    if (!previous || previous.connected !== status.connected) addNotice(statusNotice(status.connected ? "MQTT broker connected" : "MQTT broker offline", status.connected ? "SYSTEM" : "WARNING"));
  }

  function recordUnit(unit) {
    const previous = unitRef.current.find((item) => item.unitId === unit.unitId);
    const next = previous ? unitRef.current.map((item) => item.unitId === unit.unitId ? unit : item) : [...unitRef.current, unit];
    unitRef.current = next;
    setUnits(next);
    setSelectedUnitId((current) => current || unit.unitId);
    if (!previous || previous.online !== unit.online) addNotice(statusNotice(`${unit.unitId} ${unit.online ? "online" : "offline"}`, unit.online ? "SYSTEM" : "WARNING", unit.unitId));
    if (unit.sensors && !previous?.sensors) addNotice(statusNotice(`Telemetry received from ${unit.unitId}`, "INFO", unit.unitId), 60000);
  }

  function recordMotor(next) {
    const previous = motorRef.current;
    motorRef.current = next; setMotorStatus(next);
    if (!previous || previous.online !== next.online) addNotice(statusNotice(`Motor controller ${next.online ? 'online' : 'offline'}`, next.online ? 'SYSTEM' : 'WARNING', next.unitId || 'MOTOR'));
    if (previous?.state && previous.state !== next.state) addNotice(statusNotice(`Motor state confirmed: ${next.state}`, next.state === 'offline' ? 'WARNING' : 'INFO', next.unitId || 'MOTOR'), 1000);
    setSelectedUnitId(current => current || next.unitId || null);
  }

  useEffect(() => {
    setSocketConnected(socket.connected);
    const onConnect = () => setSocketConnected(true);
    const onDisconnect = (reason) => {
      setSocketConnected(false);
      if (reason === 'io server disconnect') {
        setCsrfToken(null); photoUrls.current.forEach(url => URL.revokeObjectURL(url)); photoUrls.current.clear(); setPhotos([]); setMotorStatus(null); motorRef.current = null;
        setAuthState({ loading: false, user: null, error: 'Session ended. Restart RESQ-X and open the new secure local dashboard link.' });
      }
    };
    const onConnectError = (error) => { if (error?.message === 'Authentication required') setAuthState({ loading: false, user: null, error: 'Session unavailable. Open the secure local dashboard link printed by the backend.' }); };
    const onSnapshot = ({ units: initialUnits, motor, alerts, mqtt }) => {
      unitRef.current = initialUnits;
      setUnits(initialUnits);
      setSelectedUnitId((current) => current || initialUnits[0]?.unitId || motor?.unitId || null);
      setNotifications((alerts || []).map((alert) => ({ ...alert, severity: alert.level || "ALERT" })));
      setHistory(previous => [...new Map([...(alerts || []), ...previous].map(alert => [alert.id, alert])).values()].sort((a,b) => b.timestamp-a.timestamp).slice(0,500));
      initialUnits.forEach((unit) => addNotice(statusNotice(`${unit.unitId} ${unit.online ? "online" : "offline"}`, unit.online ? "SYSTEM" : "WARNING", unit.unitId)));
      if (motor) recordMotor(motor);
      if (mqtt) recordMqttStatus(mqtt);
    };
    const onAlert = (alert) => addNotice({ ...alert, severity: alert.level || "ALERT" }, 1000);
    socket.on("connect", onConnect); socket.on("disconnect", onDisconnect); socket.on("connect_error", onConnectError); socket.on("snapshot", onSnapshot);
    socket.on("unit:update", recordUnit); socket.on('motor:update', recordMotor); socket.on("alert", onAlert); socket.on("mqtt:status", recordMqttStatus);
    return () => {
      socket.off("connect", onConnect); socket.off("disconnect", onDisconnect); socket.off("connect_error", onConnectError); socket.off("snapshot", onSnapshot);
      socket.off("unit:update", recordUnit); socket.off('motor:update', recordMotor); socket.off("alert", onAlert); socket.off("mqtt:status", recordMqttStatus);
    };
  }, []);

  const storedUnit = units.find((unit) => unit.unitId === selectedUnitId) || null;
  const motorOnlyUnit = !storedUnit && motorStatus?.unitId === selectedUnitId ? { unitId:selectedUnitId, online:false, lastSeen:null, sensors:null, detection:null, risk:{score:0,level:'LOW'}, operatingMode:'UNVERIFIED' } : null;
  const selectedUnit = storedUnit ? { ...storedUnit, online: socketConnected && storedUnit.online } : motorOnlyUnit;
  const displayUnits = units.length ? units : selectedUnit ? [selectedUnit] : [];
  const telemetryTime = selectedUnit?.lastSeen ? new Date(selectedUnit.lastSeen).toLocaleTimeString() : "No telemetry";
  const isSimulation = selectedUnit?.operatingMode === "SIMULATION";
  const isLiveHardware = selectedUnit?.online && selectedUnit?.operatingMode === "LIVE";
  const mode = isSimulation ? "SIMULATION MODE" : isLiveHardware ? "LIVE HARDWARE MODE" : "UNVERIFIED TELEMETRY";
  function handleChangeStreamUrl(url) {
    setStreamUrl(url); localStorage.setItem("resqx-stream-url", url);
    addNotice(statusNotice(url ? "Camera stream configured" : "Camera stream cleared", "SYSTEM", selectedUnit?.unitId || "CAMERA"));
  }

  function clearNotifications() {
    setNotifications([]);
    dedupeRef.current.clear();
  }

  const sensorData = selectedUnit?.sensors || {};

  const tabs = ['OVERVIEW', 'TELEMETRY', 'MISSION', 'EVIDENCE', 'ALERT HISTORY'];
  const currentCameraStatus = cameraState?.unitId === selectedUnitId ? cameraState.status : 'NOT AVAILABLE';
  const visibleAlerts = notifications.filter(alert => !acknowledged[alert.id]);
  if (authState.loading) return <div className="app__empty">Checking secure session…</div>;
  if (!authState.user) return <div className="app__empty">{authState.error || 'Secure command-center session unavailable.'}</div>;
  const canOperate = ['ADMIN', 'OPERATOR'].includes(authState.user.role);
  const canConfigure = authState.user.role === 'ADMIN';
  return <div className="app command-center">
    <Header units={displayUnits} selectedUnitId={selectedUnitId} onSelectUnit={setSelectedUnitId} socketConnected={socketConnected} mqttStatus={{ ...mqttStatus, connected: socketConnected && mqttStatus.connected }} cameraStatus={currentCameraStatus} currentUser={authState.user} />
    {units.length === 0 && !motorStatus?.controllerId ? <div className="app__empty">Waiting for a unit or motor controller to come online. MQTT: {mqttStatus.connected ? "ONLINE" : "OFFLINE"}</div> : <>
      <div className="command-heading"><div><span className="eyebrow">OPERATIONS / {selectedUnitId}</span><h1>Rescue command center</h1></div><span className={`mode-banner ${isSimulation ? 'mode-banner--sim' : ''}`}>{mode} · OPERATOR ASSISTANCE</span></div>
      <main className="console-grid">
        <section className="console-grid__controls" aria-label="Robot control and location"><ControlPanel unit={selectedUnit} motor={motorStatus} canOperate={canOperate} /><MapView unit={selectedUnit} />{canOperate && selectedUnit?.sensors && <SimulationControls unit={selectedUnit} />}</section>
        <section className="console-grid__camera" aria-label="Mission visual feed"><CameraFeed unit={selectedUnit} streamUrl={streamUrl} onChangeStreamUrl={handleChangeStreamUrl} onCaptured={recordPhoto} onStatusChange={recordCameraStatus} canOperate={canOperate} canConfigure={canConfigure} /><SensorGrid unit={selectedUnit} compact /></section>
        <section className="console-grid__notifications" aria-label="Intelligence and alerts"><RescueIntelligence unit={selectedUnit} /><AlertFeed alerts={visibleAlerts} onClear={clearNotifications} acknowledged={acknowledged} onAcknowledge={acknowledge} /></section>
      </main>
      <section className="command-lower" aria-label="Mission workspace">
      <div role="tablist" aria-label="Command workspace" className="command-tabs">{tabs.map((tab, index) => <button key={tab} id={`tab-${index}`} role="tab" aria-selected={activeTab === tab} aria-controls={`panel-${index}`} tabIndex={activeTab === tab ? 0 : -1} onClick={() => setActiveTab(tab)} onKeyDown={event => { if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length-1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; setActiveTab(tabs[next]); document.getElementById(`tab-${next}`)?.focus(); } }}>{tab}{tab === 'EVIDENCE' && <span>{photos.length}</span>}</button>)}</div>
      <div role="tabpanel" id="panel-0" aria-labelledby="tab-0" hidden={activeTab !== 'OVERVIEW'}>
      <div className="console-status">
        <div className="console-status__group"><h3>UNIT INFORMATION</h3><span>Unit ID <b>{selectedUnit?.unitId || "N/A"}</b></span><span>Mode <b className={isSimulation ? "is-orange" : isLiveHardware ? "is-green" : "is-red"}>{isSimulation ? "SIMULATION" : isLiveHardware ? "LIVE" : "UNVERIFIED"}</b></span><span>Source <b>{isSimulation ? "Simulated data" : isLiveHardware ? "Real hardware" : "Not verified"}</b></span><span>Status <b className={selectedUnit?.online ? "is-green" : "is-red"}>{selectedUnit?.online ? "ONLINE" : "OFFLINE"}</b></span><span>Last seen <b>{telemetryTime}</b></span></div>
        <div className="console-status__group"><h3>CONNECTIONS</h3><span>Backend (Socket.IO)<b>{socketConnected ? 'Connected' : 'Offline'}</b></span><span>MQTT Broker<b>{socketConnected ? mqttStatus.connected ? 'Connected' : 'Offline' : 'Not available'}</b></span><span>Sensor Link<b>{selectedUnit?.online ? 'OK' : 'Lost'}</b></span><span>Motor Link<b>{motorStatus?.online ? 'OK' : 'Lost'}</b></span></div>
        <div className="console-status__group"><h3>SYSTEM STATUS</h3><span>Frontend<b>Running</b></span><span>Backend<b>{socketConnected ? 'Connected' : 'Offline'}</b></span><span>Motor state<b>{motorStatus?.online ? motorStatus.state?.toUpperCase() : 'OFFLINE'}</b></span><span>Simulator telemetry<b>{selectedUnit?.online && sensorData.simulated ? 'Receiving' : 'Not receiving'}</b></span><span>Camera<b>{currentCameraStatus}</b></span></div>
        <div className="console-status__group"><h3>QUICK INFO</h3><span>Stream URL <b>{streamUrl ? 'Configured' : 'Not configured'}</b></span><span>GPS <b>{validGPS(sensorData.gps) ? selectedUnit?.online ? 'Valid' : 'Last known fix' : 'Not available'}</b></span><span>Battery <b>{sensorData.batteryAvailable && Number.isFinite(sensorData.battery) ? `${sensorData.battery}%` : 'Not measured'}</b></span><span>PIR <b>{sensorData.pirAvailable ? 'Installed' : 'Not installed'}</b></span></div>
        <div className="console-status__motto">TECHNOLOGY FOR A SAFER TOMORROW</div>
      </div></div>
      <div role="tabpanel" id="panel-1" aria-labelledby="tab-1" hidden={activeTab !== 'TELEMETRY'}><SensorGrid unit={selectedUnit} /></div>
      <div role="tabpanel" id="panel-2" aria-labelledby="tab-2" hidden={activeTab !== 'MISSION'}><MissionTimeline events={history} /></div>
      <div role="tabpanel" id="panel-3" aria-labelledby="tab-3" hidden={activeTab !== 'EVIDENCE'}><CapturedPhotos photos={photos} /></div>
      <div role="tabpanel" id="panel-4" aria-labelledby="tab-4" hidden={activeTab !== 'ALERT HISTORY'}><AlertFeed alerts={history} title="ALERT HISTORY · SESSION" acknowledged={acknowledged} onAcknowledge={acknowledge} /></div>
      </section>
      <footer className="command-footer"><span>RESQ-X / SEARCH · ASSIST · SAVE</span><span>Operator-controlled rover · {socketConnected ? 'Backend connected' : 'Backend offline'} · Evidence stored in session only</span></footer>
    </>}
  </div>;
}
