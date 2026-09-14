import "./RescueIntelligence.css";

export default function RescueIntelligence({ unit }) {
  const assessment = unit?.intelligence;
  if (!assessment) return <section className="intelligence"><h2>RESCUE INTELLIGENCE</h2><p>Awaiting assessment.</p></section>;
  return <section className={`intelligence intelligence--${assessment.severity.toLowerCase()}`} aria-label="Rescue intelligence">
    <h2>RESCUE INTELLIGENCE</h2>
    <small>{assessment.simulated ? "SIMULATED INTELLIGENCE" : "TELEMETRY ASSESSMENT"}</small>
    <h3>{assessment.situation.replaceAll("_", " ")}</h3>
    <p className="intelligence__meta">Severity: <b>{assessment.severity}</b> · Confidence: <span title={assessment.confidenceBasis}>{assessment.confidence === null ? "Not scored" : assessment.confidence}</span></p>
    <details><summary>Reasons ({assessment.reasons.length})</summary><ul>{assessment.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></details>
    <p className="intelligence__action"><b>Recommended action</b>{assessment.recommendedAction}</p>
    <p className="intelligence__location">{assessment.location ? `${assessment.location.simulated ? "SIMULATED " : ""}INCIDENT LOCATION: ${assessment.location.lat.toFixed(6)}, ${assessment.location.lng.toFixed(6)}` : "GPS LOCATION UNAVAILABLE"}</p>
    <small>Operator guidance only · No automatic movement</small>
  </section>;
}
