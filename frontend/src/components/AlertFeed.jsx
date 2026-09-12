import "./AlertFeed.css";

const COLORS = { INFO: "var(--accent)", SYSTEM: "var(--online)", WARNING: "var(--level-medium)", HIGH: "var(--level-high)", CRITICAL: "var(--level-critical)", MEDIUM: "var(--level-medium)", LOW: "var(--level-low)", ALERT: "var(--level-high)" };
function timeLabel(timestamp) { return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

export default function AlertFeed({ alerts, onClear }) {
  return <div className="afeed"><div className="afeed__title"><span>● &nbsp;NOTIFICATIONS</span><button onClick={onClear}>Clear all</button></div><div className="afeed__list">{alerts.length === 0 ? <div className="afeed__empty">No notifications. System quiet.</div> : alerts.map((alert) => { const level = alert.severity || alert.level || "INFO"; return <div className="afeed__row" key={alert.id}><span className="afeed__dot" style={{ background: COLORS[level] || COLORS.INFO }} /><div className="afeed__body"><div className="afeed__meta"><time>{timeLabel(alert.timestamp)}</time><span style={{ color: COLORS[level] || COLORS.INFO }}>{level}</span></div><div className="afeed__msg">{alert.message}</div><div className="afeed__unit">{alert.unitId}</div></div></div>; })}</div></div>;
}
