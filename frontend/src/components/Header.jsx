import "./Header.css";

const LEVEL_COLOR = {
  LOW: "var(--level-low)",
  MEDIUM: "var(--level-medium)",
  HIGH: "var(--level-high)",
  CRITICAL: "var(--level-critical)",
};

export default function Header({ units, selectedUnitId, onSelectUnit, connected }) {
  const unit = units.find((u) => u.unitId === selectedUnitId);
  const level = unit?.risk?.level || "LOW";

  return (
    <header className="hdr">
      <div className="hdr__brand">
        <span className="hdr__mark">RESQ&#8209;X</span>
        <span className="hdr__tag">Field Console</span>
      </div>

      <div className="hdr__units">
        {units.map((u) => (
          <button
            key={u.unitId}
            className={`hdr__unit ${u.unitId === selectedUnitId ? "is-active" : ""}`}
            onClick={() => onSelectUnit(u.unitId)}
          >
            <span
              className="hdr__dot"
              style={{ background: u.online ? "var(--online)" : "var(--offline)" }}
            />
            {u.unitId}
          </button>
        ))}
      </div>

      <div className="hdr__status">
        <div className="hdr__conn">
          <span
            className="hdr__dot"
            style={{ background: connected ? "var(--online)" : "var(--level-critical)" }}
          />
          {connected ? "LINK OK" : "LINK LOST"}
        </div>
        <div className="hdr__risk" style={{ "--level-color": LEVEL_COLOR[level] }}>
          <span className="hdr__risk-label">RISK</span>
          <span className="hdr__risk-score">{unit?.risk?.score ?? 0}</span>
          <span className="hdr__risk-level">{level}</span>
        </div>
      </div>
    </header>
  );
}
