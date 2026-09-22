import "./RescueIntelligence.css";
import { riskView } from './telemetryView';

export default function RescueIntelligence({ unit }) {
  const assessment = unit?.intelligence;
  const risk = riskView(unit);
  if (!assessment) return <section className="intelligence"><h2>RESCUE INTELLIGENCE</h2><p>Awaiting assessment.</p></section>;
  return <section className={`intelligence intelligence--${assessment.severity.toLowerCase()}`} aria-label="Rescue intelligence">
    <h2>RESCUE INTELLIGENCE</h2>
    <div className={`intelligence__risk intelligence__risk--${risk.level.toLowerCase().replaceAll(' ', '-')}`}>
      <span>RISK SCORE</span><strong>{risk.score === null ? '—' : String(risk.score).padStart(2, '0')}<small> / 100</small></strong>
      <b>{risk.level === 'LOW' ? 'LOW RISK' : risk.level}</b><meter min="0" max="100" value={risk.score ?? 0} aria-label="Backend risk score" hidden={risk.score === null} />
    </div>
    <small>{assessment.simulated ? "SIMULATED INTELLIGENCE" : "TELEMETRY ASSESSMENT"}</small>
    <p className="intelligence__eyebrow">CURRENT SITUATION {unit?.online ? '' : '· UNIT OFFLINE'}</p><h3>{assessment.situation.replaceAll("_", " ")}</h3>
    <p className="intelligence__meta">Severity: <b>{assessment.severity}</b> · Confidence: <span title={assessment.confidenceBasis}>{assessment.confidence === null ? "Not scored" : assessment.confidence}</span></p>
    <details><summary>Reasons ({assessment.reasons.length})</summary><ul>{assessment.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></details>
    <p className="intelligence__action"><b>Recommended action</b>{assessment.recommendedAction}</p>
    <p className="intelligence__location">{assessment.location ? `${assessment.location.simulated ? "SIMULATED " : ""}INCIDENT LOCATION: ${assessment.location.lat.toFixed(6)}, ${assessment.location.lng.toFixed(6)}` : "GPS LOCATION UNAVAILABLE"}</p>
    <small>Operator guidance only · No automatic movement</small>
  </section>;
}
