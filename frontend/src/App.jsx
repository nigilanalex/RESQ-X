import { useEffect, useState } from "react";
import { socket } from "./api/socket";
import Header from "./components/Header.jsx";
import CameraFeed from "./components/CameraFeed.jsx";
import SensorGrid from "./components/SensorGrid.jsx";
import AlertFeed from "./components/AlertFeed.jsx";
import ControlPanel from "./components/ControlPanel.jsx";
import "./App.css";
import MapView from "./components/MapView.jsx";

export default function App() {
  const [connected, setConnected] = useState(false);
  const [units, setUnits] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [selectedUnitId, setSelectedUnitId] = useState(null);
  const [streamUrl, setStreamUrl] = useState(
    localStorage.getItem("resqx-stream-url") || ""
  );

  useEffect(() => {
    function onConnect() {
      setConnected(true);
    }
    function onDisconnect() {
      setConnected(false);
    }
    function onSnapshot({ units: initialUnits, alerts: initialAlerts }) {
      setUnits(initialUnits);
      setAlerts(initialAlerts);
      if (!selectedUnitId && initialUnits.length > 0) {
        setSelectedUnitId(initialUnits[0].unitId);
      }
    }
    function onUnitUpdate(updatedUnit) {
      setUnits((prev) => {
        const idx = prev.findIndex((u) => u.unitId === updatedUnit.unitId);
        if (idx === -1) return [...prev, updatedUnit];
        const next = [...prev];
        next[idx] = updatedUnit;
        return next;
      });
      setSelectedUnitId((current) => current || updatedUnit.unitId);
    }
    function onAlert(alert) {
      setAlerts((prev) => [alert, ...prev].slice(0, 200));
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("snapshot", onSnapshot);
    socket.on("unit:update", onUnitUpdate);
    socket.on("alert", onAlert);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("snapshot", onSnapshot);
      socket.off("unit:update", onUnitUpdate);
      socket.off("alert", onAlert);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedUnit = units.find((u) => u.unitId === selectedUnitId) || null;

  function handleChangeStreamUrl(url) {
    setStreamUrl(url);
    localStorage.setItem("resqx-stream-url", url);
  }

  return (
    <div className="app">
      <Header
        units={units}
        selectedUnitId={selectedUnitId}
        onSelectUnit={setSelectedUnitId}
        connected={connected}
      />

      {units.length === 0 ? (
        <div className="app__empty">
          Waiting for a unit to come online — check that your ESP32 is connected
          to the MQTT broker and publishing to <code>resqx/&lt;unit-id&gt;/sensors</code>.
        </div>
      ) : (
        <main className="app__grid">
          <section className="app__col app__col--main">
            <CameraFeed
  unit={selectedUnit}
  streamUrl={streamUrl}
  onChangeStreamUrl={handleChangeStreamUrl}
/>

<MapView unit={selectedUnit} />

<ControlPanel unit={selectedUnit} />
          </section>

          <section className="app__col">
            <SensorGrid unit={selectedUnit} />
          </section>

          <section className="app__col app__col--alerts">
            <AlertFeed alerts={alerts} />
          </section>
        </main>
      )}
    </div>
  );
}
