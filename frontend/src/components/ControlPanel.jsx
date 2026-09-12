import { useEffect, useRef, useState } from "react";
import { sendControl } from "../api/socket";
import "./ControlPanel.css";

export default function ControlPanel({ unit }) {
  const [error, setError] = useState(null);
  const [activeAction, setActiveAction] = useState(null);
  const timerRef = useRef(null);
  const simulated = unit?.operatingMode === "SIMULATION";
  const enabled = Boolean(unit?.unitId && unit.online);
  const send = async (action) => { if (!enabled) return; try { setError(null); await sendControl(unit.unitId, action); } catch (requestError) { setError(requestError.message); } };
  const stop = () => { if (timerRef.current) clearInterval(timerRef.current); timerRef.current = null; setActiveAction(null); send("stop"); };
  const start = (action) => { if (!enabled || timerRef.current) return; setActiveAction(action); send(action); timerRef.current = setInterval(() => send(action), 300); };
  useEffect(() => () => stop(), []);
  const active = (action) => activeAction === action ? " is-active" : "";
  return <div className="ctrl">
    <div className="ctrl__title"><span>MANUAL CONTROL</span><span className={simulated ? "ctrl__mode is-sim" : "ctrl__mode"}>{simulated ? "SIMULATION MODE" : unit?.online ? "LIVE CONTROL" : "UNIT OFFLINE"}</span></div>
    <div className="ctrl__dpad"><div /><button className={`ctrl__btn${active("move_forward")}`} disabled={!enabled} onPointerDown={() => start("move_forward")} onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop}>FORWARD</button><div />
      <button className={`ctrl__btn${active("turn_left")}`} disabled={!enabled} onPointerDown={() => start("turn_left")} onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop}>LEFT</button><button className="ctrl__btn ctrl__btn--stop" disabled={!enabled} onClick={stop}>STOP</button><button className={`ctrl__btn${active("turn_right")}`} disabled={!enabled} onPointerDown={() => start("turn_right")} onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop}>RIGHT</button>
      <div /><button className={`ctrl__btn${active("move_backward")}`} disabled={!enabled} onPointerDown={() => start("move_backward")} onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop}>BACKWARD</button><div /></div>
    <div className="ctrl__note">{simulated ? "Motor commands are simulated; no physical robot is being driven." : "Hold a direction to move. Releasing it sends STOP."}</div>
    {error && <div className="ctrl__error">{error}</div>}
    {unit?.lastCommand && <div className="ctrl__last">Last requested: <span>{unit.lastCommand.action}</span></div>}
  </div>;
}
