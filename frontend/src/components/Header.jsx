import "./Header.css";

const LEVEL_COLOR = { LOW: "var(--level-low)", MEDIUM: "var(--level-medium)", HIGH: "var(--level-high)", CRITICAL: "var(--level-critical)" };

export default function Header({ units, selectedUnitId, onSelectUnit, socketConnected, mqttStatus }) {
  const unit = units.find((item) => item.unitId === selectedUnitId);
  const unitOnline = unit?.online === true;
  const mode = unit?.operatingMode || "UNVERIFIED";
  const simulated = mode === "SIMULATION";
  const liveHardware = mode === "LIVE";
  const level = unit?.risk?.level || "LOW";
  return <header className="hdr">
    <div className="hdr__brand"><span className="hdr__crest"><i /><i /><i /></span><span><strong className="hdr__mark">RESQ-X</strong><small className="hdr__tag">FIELD CONSOLE<br />SEARCH · ASSIST · SAVE</small></span></div>
    <div className="hdr__units">{units.map((item) => <button key={item.unitId} className={`hdr__unit ${item.unitId === selectedUnitId ? "is-active" : ""}`} onClick={() => onSelectUnit(item.unitId)}><span className="hdr__dot" style={{ background: item.online ? "var(--online)" : "var(--offline)" }} />{item.unitId}{item.operatingMode === "SIMULATION" ? " (SIM)" : item.operatingMode === "LIVE" ? " (HW)" : ""}<b>⌄</b></button>)}<small className={`hdr__sim-label ${liveHardware ? "is-live" : ""}`}>{simulated ? "SIMULATED DATA" : liveHardware ? "REAL HARDWARE" : "AWAITING VERIFIED HARDWARE"}</small></div>
    <div className="hdr__status">
      <div className="hdr__conn"><span className="hdr__icon">▣</span><small>DASHBOARD</small><b className={socketConnected ? "is-online" : "is-offline"}>{socketConnected ? "LIVE" : "OFFLINE"}</b></div>
      <div className="hdr__conn" title={mqttStatus?.error || ""}><span className="hdr__icon">◉</span><small>MQTT BROKER</small><b className={mqttStatus?.connected ? "is-online" : "is-offline"}>{mqttStatus?.connected ? "ONLINE" : "OFFLINE"}</b></div>
      <div className="hdr__conn"><span className="hdr__icon">▰</span><small>UNIT LINK</small><b className={unitOnline ? "is-online" : "is-offline"}>{unitOnline ? "OK" : "LOST"}</b></div>
      <div className={`hdr__mode ${simulated ? "is-sim" : ""} ${liveHardware ? "is-live" : ""}`}><span>⌁</span><small>MODE</small><b>{simulated ? "SIMULATION" : liveHardware ? "LIVE" : "UNVERIFIED"}</b></div>
      <div className="hdr__risk" style={{ "--level-color": LEVEL_COLOR[level] }}><span className="hdr__risk-label">RISK</span><span className="hdr__risk-score">{unit?.risk?.score ?? 0}</span><span className="hdr__risk-level">{level}</span></div>
    </div>
  </header>;
}
