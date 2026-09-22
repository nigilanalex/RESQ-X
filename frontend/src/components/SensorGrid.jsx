import { telemetryRows } from './telemetryView';
import './SensorGrid.css';
export default function SensorGrid({ unit, compact = false }) {
  const rows = telemetryRows(unit).filter(row => !compact || ['temp','flame','human','motion'].includes(row.id));
  return <section className={`sgrid ${compact ? 'sgrid--compact' : ''}`} aria-label="Sensor telemetry">
    <div className="sgrid__title"><span>{compact ? 'SITUATION AT A GLANCE' : 'LIVE TELEMETRY'}</span><small>{unit?.sensors?.simulated ? 'SIMULATED DATA' : unit?.online ? 'LATEST READINGS' : 'LAST KNOWN · UNIT OFFLINE'}</small></div>
    <div className="sgrid__list">{rows.map(row => <article className={`sgrid__row ${row.warning ? 'is-danger' : ''}`} key={row.id}>
      <span className="sgrid__icon" aria-hidden="true">{row.icon}</span><span className="sgrid__label">{row.label}</span>
      <strong className="sgrid__value">{row.value}</strong><small className="sgrid__status">{row.status}</small>
    </article>)}</div>
    {!compact && <p className="sgrid__footnote">Current samples only · No synthetic trends. {unit?.sensors?.simulation?.scenario ? `Scenario: ${unit.sensors.simulation.scenario}` : ''}</p>}
  </section>;
}
