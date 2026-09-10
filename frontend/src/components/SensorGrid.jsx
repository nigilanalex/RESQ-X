import "./SensorGrid.css";

function fmt(value, unit, digits = 1) {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toFixed(digits)}${unit}`;
}

export default function SensorGrid({ unit }) {
  const s = unit?.sensors;

  const channels = [
    { id: "01", label: "TEMPERATURE", value: fmt(s?.temp, "°C"), danger: s?.temp > 45 },
    { id: "02", label: "HUMIDITY", value: fmt(s?.humidity, "%"), danger: false },
    { id: "03", label: "GAS / SMOKE", value: fmt(s?.gasPPM, " ppm", 0), danger: s?.gasPPM > 1000 },
    {
      id: "04",
      label: "VIBRATION",
      value: s?.vibration ? "DETECTED" : "STABLE",
      danger: !!s?.vibration,
    },
    { id: "05", label: "MOTION (PIR)", value: s?.pir ? "MOTION" : "CLEAR", danger: !!s?.pir },
    { id: "06", label: "BATTERY", value: fmt(s?.battery, "%", 0), danger: s?.battery < 20 },
  ];

  return (
    <div className="sgrid">
      <div className="sgrid__title">TELEMETRY</div>
      <div className="sgrid__list">
        {channels.map((c) => (
          <div className="sgrid__row" key={c.id}>
            <span className="sgrid__id">SENSOR-{c.id}</span>
            <span className="sgrid__label">{c.label}</span>
            <span className={`sgrid__value ${c.danger ? "is-danger" : ""}`}>{c.value}</span>
          </div>
        ))}
        <div className="sgrid__row">
          <span className="sgrid__id">GPS</span>
          <span className="sgrid__label">LAST FIX</span>
          <span className="sgrid__value">
            {s?.gps ? `${s.gps.lat.toFixed(4)}, ${s.gps.lng.toFixed(4)}` : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
