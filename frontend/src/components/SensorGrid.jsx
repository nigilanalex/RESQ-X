import "./SensorGrid.css";

function text(value, suffix = "", digits = 1) { return Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : "UNAVAILABLE"; }

export default function SensorGrid({ unit }) {
  const sensors = unit?.sensors || {};
  const gps = sensors.gps || {};
  const human = sensors.human || { available: false, status: "NOT_AVAILABLE" };
  const simEvents = sensors.simulation?.events || [];
  const simulatedEvent = (name) => sensors.simulated && simEvents.includes(name);
  const rows = [
    ["01", "TEMPERATURE", text(sensors.temp, " °C"), sensors.temp > 45],
    ["02", "HUMIDITY", text(sensors.humidity, "%"), false],
    ["03", "FLAME SENSOR", sensors.flame ? "FLAME DETECTED" : "CLEAR", sensors.flame === true],
    ["04", "MPU6050 MOTION", text(sensors.vibration, " g", 2), sensors.vibration > 0.35],
    ["05", "PIR MOTION", sensors.pirAvailable ? (sensors.pir ? "MOTION" : "CLEAR") : "NOT INSTALLED", sensors.pirAvailable && sensors.pir],
    ["06", "BATTERY", simulatedEvent("low_battery") ? "LOW (SIMULATED)" : sensors.batteryAvailable ? text(sensors.battery, "%", 0) : "NOT MEASURED", simulatedEvent("low_battery") || (sensors.batteryAvailable && sensors.battery < 20)],
    ["HUMAN", "HUMAN PRESENCE", !human.available ? "NOT AVAILABLE" : human.presence ? "DETECTED" : "NO HUMAN", human.presence],
    ["LD2410", "HUMAN SENSOR", !human.available ? "NOT CONNECTED" : `${human.moving ? "MOVING" : human.stationary ? "STATIONARY" : "ONLINE"}${Number.isFinite(human.distance) ? ` · ${human.distance.toFixed(1)} m` : ""}`, human.presence],
  ];
  const gpsText = gps.valid && Number.isFinite(gps.lat) && Number.isFinite(gps.lng) ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}` : "GPS UNAVAILABLE";
  const simulationLabel = sensors.simulated && sensors.simulation?.scenario && sensors.simulation.scenario !== "normal" ? ` · ${sensors.simulation.scenario.replaceAll("_", " ").toUpperCase()} (SIMULATED)` : "";
  const sourceLabel = unit?.operatingMode === "SIMULATION" ? "- SIMULATED DATA" : unit?.operatingMode === "LIVE" ? "- REAL HARDWARE" : "- UNVERIFIED SOURCE";
  return <div className="sgrid"><div className="sgrid__title">TELEMETRY {sourceLabel}</div><div className="sgrid__list">
    {rows.map(([id, label, value, danger]) => <div className="sgrid__row" key={id}><span className="sgrid__id">SENSOR-{id}</span><span className="sgrid__label">{label}</span><span className={`sgrid__value ${danger ? "is-danger" : ""}`}>{value}</span></div>)}
    <div className="sgrid__row"><span className="sgrid__id">GPS</span><span className="sgrid__label">LAST FIX ({gps.satellites || 0} SATS)</span><span className="sgrid__value">{gpsText}</span></div>
    {simulationLabel && <div className="sgrid__row"><span className="sgrid__id">SIM</span><span className="sgrid__label">TEST EVENT</span><span className="sgrid__value is-danger">{simulationLabel}</span></div>}
  </div></div>;
}
