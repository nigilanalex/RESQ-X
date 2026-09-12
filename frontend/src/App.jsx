import { useEffect, useRef, useState } from "react";
import { socket } from "./api/socket";
import Header from "./components/Header.jsx";
import CameraFeed from "./components/CameraFeed.jsx";
import SensorGrid from "./components/SensorGrid.jsx";
import AlertFeed from "./components/AlertFeed.jsx";
import ControlPanel from "./components/ControlPanel.jsx";
import SimulationControls from "./components/SimulationControls.jsx";
import MapView from "./components/MapView.jsx";
import "./App.css";

const now = () => Date.now();
const statusNotice = (message, severity = "SYSTEM", unitId = "SYSTEM") => ({ id: `${unitId}-${message}-${now()}`, message, severity, unitId, timestamp: now() });

export default function App() {
  const [socketConnected, setSocketConnected] = useState(socket.connected);
  const [mqttStatus, setMqttStatus] = useState({ connected: false, error: null });
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
  }

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

  useEffect(() => {
    setSocketConnected(socket.connected);
    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);
    const onSnapshot = ({ units: initialUnits, alerts, mqtt }) => {
      unitRef.current = initialUnits;
      setUnits(initialUnits);
      setSelectedUnitId((current) => current || initialUnits[0]?.unitId || null);
      setNotifications((alerts || []).map((alert) => ({ ...alert, severity: alert.level || "ALERT" })));
      initialUnits.forEach((unit) => addNotice(statusNotice(`${unit.unitId} ${unit.online ? "online" : "offline"}`, unit.online ? "SYSTEM" : "WARNING", unit.unitId)));
      if (mqtt) recordMqttStatus(mqtt);
    };
    const onAlert = (alert) => addNotice({ ...alert, severity: alert.level || "ALERT" }, 1000);
    socket.on("connect", onConnect); socket.on("disconnect", onDisconnect); socket.on("snapshot", onSnapshot);
    socket.on("unit:update", recordUnit); socket.on("alert", onAlert); socket.on("mqtt:status", recordMqttStatus);
    return () => {
      socket.off("connect", onConnect); socket.off("disconnect", onDisconnect); socket.off("snapshot", onSnapshot);
      socket.off("unit:update", recordUnit); socket.off("alert", onAlert); socket.off("mqtt:status", recordMqttStatus);
    };
  }, []);

  const selectedUnit = units.find((unit) => unit.unitId === selectedUnitId) || null;
  const telemetryTime = selectedUnit?.lastSeen ? new Date(selectedUnit.lastSeen).toLocaleTimeString() : "No telemetry";
  const isSimulation = selectedUnit?.operatingMode === "SIMULATION";
  const isLiveHardware = selectedUnit?.operatingMode === "LIVE";
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

  return <div className="app">
    <Header units={units} selectedUnitId={selectedUnitId} onSelectUnit={setSelectedUnitId} socketConnected={socketConnected} mqttStatus={mqttStatus} />
    {units.length === 0 ? <div className="app__empty">Waiting for a unit to come online. MQTT: {mqttStatus.connected ? "ONLINE" : "OFFLINE"}</div> : <>
      <main className="console-grid">
        <section className="console-grid__camera"><CameraFeed unit={selectedUnit} streamUrl={streamUrl} onChangeStreamUrl={handleChangeStreamUrl} /></section>
        <section className="console-grid__telemetry"><SensorGrid unit={selectedUnit} /><MapView unit={selectedUnit} /></section>
        <section className="console-grid__controls"><ControlPanel unit={selectedUnit} /><SimulationControls unit={selectedUnit} /></section>
        <section className="console-grid__notifications"><AlertFeed alerts={notifications} onClear={clearNotifications} /></section>
      </main>
      <footer className="console-status">
        <div className="console-status__group"><h3>UNIT INFORMATION</h3><span>Unit ID <b>{selectedUnit?.unitId || "N/A"}</b></span><span>Mode <b className={isSimulation ? "is-orange" : isLiveHardware ? "is-green" : "is-red"}>{isSimulation ? "SIMULATION" : isLiveHardware ? "LIVE" : "UNVERIFIED"}</b></span><span>Source <b>{isSimulation ? "Simulated data" : isLiveHardware ? "Real hardware" : "Not verified"}</b></span><span>Status <b className={selectedUnit?.online ? "is-green" : "is-red"}>{selectedUnit?.online ? "ONLINE" : "OFFLINE"}</b></span><span>Last seen <b>{telemetryTime}</b></span></div>
        <div className="console-status__group"><h3>CONNECTIONS</h3><span><i className={socketConnected ? "is-green" : "is-red"} />Backend (Socket.IO)<b>{socketConnected ? "Connected" : "Offline"}</b></span><span><i className={mqttStatus.connected ? "is-green" : "is-red"} />MQTT Broker<b>{mqttStatus.connected ? "Connected" : "Offline"}</b></span><span><i className={selectedUnit?.online ? "is-green" : "is-red"} />Unit Link<b>{selectedUnit?.online ? "OK" : "Lost"}</b></span></div>
        <div className="console-status__group"><h3>SYSTEM STATUS</h3><span><i className="is-green" />Frontend<b>Running</b></span><span><i className={socketConnected ? "is-green" : "is-red"} />Backend<b>{socketConnected ? "Running" : "Offline"}</b></span><span><i className={sensorData.simulated ? "is-green" : "is-red"} />Simulator<b>{sensorData.simulated ? "Running" : "Standby"}</b></span><span><i className={mqttStatus.connected ? "is-green" : "is-red"} />Mosquitto<b>{mqttStatus.connected ? "Running" : "Offline"}</b></span></div>
        <div className="console-status__group"><h3>QUICK INFO</h3><span>ESP32-CAM <b>{streamUrl ? "Configured" : "Not connected"}</b></span><span>GPS <b>{sensorData.gps?.valid ? "Valid" : "Unavailable"}</b></span><span>Battery <b>{sensorData.batteryAvailable ? `${sensorData.battery}%` : "Not measured"}</b></span><span>PIR <b>{sensorData.pirAvailable ? "Installed" : "Not installed"}</b></span></div>
        <div className="console-status__motto">TECHNOLOGY FOR A SAFER TOMORROW</div>
      </footer>
    </>}
  </div>;
}
