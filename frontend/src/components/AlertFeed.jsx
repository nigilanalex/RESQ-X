import { alertSource } from './telemetryView';
import './AlertFeed.css';
const ICON = { CRITICAL:'!', HIGH:'!', WARNING:'△', MEDIUM:'△', INFO:'i', SYSTEM:'•', LOW:'✓' };
export default function AlertFeed({ alerts, onClear, acknowledged = {}, onAcknowledge, title = 'EMERGENCY ALERTS' }) {
  return <section className="afeed"><div className="afeed__title"><span>{title}</span>{onClear && <button onClick={onClear} title="Clear this session view only; backend history is unchanged">Clear view</button>}</div>
    <div className="afeed__list">{!alerts.length ? <p className="afeed__empty">No events in this view.</p> : [...alerts].sort((a,b) => b.timestamp-a.timestamp).map(alert => {
      const level = alert.severity || alert.level || 'INFO';
      return <article className={`afeed__row afeed__row--${level.toLowerCase()} ${acknowledged[alert.id] ? 'is-acknowledged' : ''}`} key={alert.id}>
        <span className="afeed__dot" aria-hidden="true">{ICON[level] || 'i'}</span><div className="afeed__body">
          <div className="afeed__meta"><b>{level}</b><time>{new Date(alert.timestamp).toLocaleTimeString()}</time></div>
          <div className="afeed__msg">{alert.message}</div><div className="afeed__unit">{alert.unitId} · {alertSource(alert)}</div>
          {onAcknowledge && <button className="afeed__ack" disabled={Boolean(acknowledged[alert.id])} onClick={() => onAcknowledge(alert.id)} title="Session-only acknowledgement; does not resolve the hazard">{acknowledged[alert.id] ? 'ACKNOWLEDGED · LOCAL' : 'ACKNOWLEDGE · LOCAL'}</button>}
        </div></article>;
    })}</div></section>;
}
