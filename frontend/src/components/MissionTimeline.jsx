import { alertSource } from './telemetryView';
export default function MissionTimeline({ events }) {
  return <section className="mission-timeline"><h2>MISSION TIMELINE</h2><p>Observed session events. No mission start or resolution is inferred.</p>
    {!events.length ? <p>No events received yet.</p> : <ol>{[...events].sort((a,b) => b.timestamp-a.timestamp).map(event => <li key={event.id}><time>{new Date(event.timestamp).toLocaleTimeString()}</time><div><strong>{event.message}</strong><small>{event.unitId} · {alertSource(event)} · {event.severity || event.level || 'SYSTEM'}</small></div></li>)}</ol>}
  </section>;
}
