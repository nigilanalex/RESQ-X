import "./AlertFeed.css";

const LEVEL_COLOR = {
  LOW: "var(--level-low)",
  MEDIUM: "var(--level-medium)",
  HIGH: "var(--level-high)",
  CRITICAL: "var(--level-critical)",
};

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export default function AlertFeed({ alerts }) {
  return (
    <div className="afeed">
      <div className="afeed__title">ALERT LOG</div>
      <div className="afeed__list">
        {alerts.length === 0 && (
          <div className="afeed__empty">No alerts yet. Quiet is good.</div>
        )}
        {alerts.map((a) => (
          <div className="afeed__row" key={a.id}>
            <span
              className="afeed__level"
              style={{ color: LEVEL_COLOR[a.level], borderColor: LEVEL_COLOR[a.level] }}
            >
              {a.level}
            </span>
            <div className="afeed__body">
              <div className="afeed__msg">{a.message}</div>
              <div className="afeed__meta">
                {a.unitId} · {timeAgo(a.timestamp)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
