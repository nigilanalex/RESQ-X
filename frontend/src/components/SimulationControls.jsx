import { useState } from "react";
import { triggerSimulationScenario } from "../api/socket";
import "./SimulationControls.css";

const SCENARIOS = [["normal", "NORMAL"], ["fire", "FIRE"], ["high_temp", "HIGH TEMP"], ["impact", "IMPACT"], ["human", "HUMAN"], ["gas", "SMOKE/GAS"], ["water", "WATER"], ["low_battery", "LOW BATTERY"], ["gps_available", "GPS FIX"], ["gps_unavailable", "GPS OFF"], ["offline", "ROBOT OFFLINE"]];
export default function SimulationControls({ unit }) {
  const [error, setError] = useState("");
  if (unit?.operatingMode !== "SIMULATION") return null;
  const trigger = async (scenario) => { try { setError(""); await triggerSimulationScenario(unit.unitId, scenario); } catch (requestError) { setError(requestError.message); } };
  return <details className="sim-controls"><summary>DEVELOPER SIMULATION EVENTS <span>SIMULATION ONLY</span></summary><div className="sim-controls__body"><p>These buttons command only the software simulator through MQTT. They are hidden for live hardware.</p><div className="sim-controls__buttons">{SCENARIOS.map(([scenario, label]) => <button key={scenario} onClick={() => trigger(scenario)}>{label}</button>)}</div>{error && <div className="sim-controls__error">{error}</div>}</div></details>;
}
