import { useCallback, useEffect, useRef, useState } from "react";
import { sendControl } from "../api/socket";
import "./ControlPanel.css";

const STATE_LABELS = { forward:'MOVING FORWARD', backward:'MOVING BACKWARD', left:'TURNING LEFT', right:'TURNING RIGHT', stopped:'STOPPED', offline:'OFFLINE' };

export default function ControlPanel({ unit, motor, canOperate = false }) {
  const [error, setError] = useState(null);
  const [activeAction, setActiveAction] = useState(null);
  const timerRef = useRef(null);
  const unitId = unit?.unitId || motor?.unitId || null;
  const motorVerified = Boolean(motor && ['motor-esp32', 'simulator'].includes(motor.source) && motor.unitId === unitId);
  const movementEnabled = Boolean(canOperate && unitId && motorVerified && motor.online);
  const stopEnabled = Boolean(canOperate && unitId && motorVerified);
  const simulated = motor?.simulated === true;

  const send = useCallback(async action => {
    if (action === 'stop' ? !stopEnabled : !movementEnabled) return;
    try { setError(null); await sendControl(unitId, action); }
    catch (requestError) { setError(requestError.message); }
  }, [movementEnabled, stopEnabled, unitId]);
  const stop = useCallback(() => { if (timerRef.current) clearInterval(timerRef.current); timerRef.current = null; setActiveAction(null); send('stop'); }, [send]);
  const start = useCallback(action => { if (!movementEnabled || timerRef.current) return; setActiveAction(action); send(action); timerRef.current = setInterval(() => send(action), 300); }, [movementEnabled, send]);

  useEffect(() => {
    const cancelMovement = () => { if (timerRef.current) stop(); };
    window.addEventListener('blur', cancelMovement);
    const onHidden = () => { if (document.hidden) cancelMovement(); };
    document.addEventListener('visibilitychange', onHidden);
    return () => { cancelMovement(); window.removeEventListener('blur', cancelMovement); document.removeEventListener('visibilitychange', onHidden); };
  }, [stop]);
  useEffect(() => {
    const keyActions = { w:'forward', arrowup:'forward', a:'left', arrowleft:'left', s:'backward', arrowdown:'backward', d:'right', arrowright:'right' };
    const isTyping = element => element instanceof HTMLElement && (element.isContentEditable || Boolean(element.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')));
    const onKeyDown = event => { if (isTyping(event.target)) return; const key = event.key.toLowerCase(); if (key === ' ' || key === 'x') { event.preventDefault(); stop(); return; } if (keyActions[key]) { event.preventDefault(); start(keyActions[key]); } };
    const onKeyUp = event => { if (isTyping(event.target)) return; if (keyActions[event.key.toLowerCase()]) { event.preventDefault(); stop(); } };
    window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, [start, stop]);

  const active = action => activeAction === action ? ' is-active' : '';
  const pointerStart = action => event => { event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId); start(action); };
  const confirmedState = motor?.online ? (STATE_LABELS[motor.state] || 'UNKNOWN') : 'OFFLINE';
  const awaitingConfirmation = Boolean(motor?.lastRequested && motor.lastRequested.commandId !== motor.lastConfirmed?.commandId);
  const statusClass = motor?.online ? motor.state === 'stopped' ? ' is-stopped' : ' is-moving' : ' is-offline';
  return <div className="ctrl">
    <div className="ctrl__title"><span>ROBOT CONTROL</span><span className={simulated ? 'ctrl__mode is-sim' : 'ctrl__mode'}>{simulated ? 'SIMULATED MOTOR' : motor?.source === 'motor-esp32' ? 'LIVE MOTOR' : 'UNVERIFIED'}</span></div>
    <div className="ctrl__unit"><span>{unitId || 'NO UNIT'} / {motor?.controllerId || 'NO MOTOR'}</span><b>{motor?.online ? '● MOTOR LINK OK' : '○ MOTOR LINK LOST'}</b></div>
    <div className={`ctrl__motor-state${statusClass}`}><small>CONFIRMED MOTOR STATE</small><strong>{confirmedState}</strong><span>{awaitingConfirmation ? `COMMAND REQUESTED: ${motor.lastRequested.command.toUpperCase()}` : motor?.lastConfirmed ? `CONFIRMED ${new Date(motor.lastConfirmed.confirmedAt).toLocaleTimeString()}` : 'AWAITING CONTROLLER STATUS'}</span></div>
    <div className="ctrl__dpad"><div /><button className={`ctrl__btn${active('forward')}`} disabled={!movementEnabled} onPointerDown={pointerStart('forward')} onPointerUp={stop} onPointerCancel={stop}>FORWARD</button><div />
      <button className={`ctrl__btn${active('left')}`} disabled={!movementEnabled} onPointerDown={pointerStart('left')} onPointerUp={stop} onPointerCancel={stop}>LEFT</button><button className="ctrl__btn ctrl__btn--stop" disabled={!stopEnabled} onClick={stop}>STOP</button><button className={`ctrl__btn${active('right')}`} disabled={!movementEnabled} onPointerDown={pointerStart('right')} onPointerUp={stop} onPointerCancel={stop}>RIGHT</button>
      <div /><button className={`ctrl__btn${active('backward')}`} disabled={!movementEnabled} onPointerDown={pointerStart('backward')} onPointerUp={stop} onPointerCancel={stop}>BACKWARD</button><div /></div>
    <button className="ctrl__emergency" disabled={!stopEnabled} onClick={stop} title="Sends STOP immediately; this is not a hardware power cutoff">■ EMERGENCY STOP</button>
    <div className="ctrl__note">{!canOperate ? 'VIEWER access: robot controls are unavailable.' : simulated ? 'Simulation uses an isolated motor topic and cannot reach physical hardware.' : !motorVerified ? 'Waiting for verified motor-controller status.' : !motor?.online ? 'Motor offline. Movement is disabled; STOP remains available.' : 'Hold a direction to move. Releasing it sends STOP.'} Keyboard: W/A/S/D or arrows to move; Space/X stops.</div>
    {error && <div className="ctrl__error">{error}</div>}
    <div className="ctrl__speed">SPEED <span>ENA/ENB jumpers</span><small>No adjustable speed API configured</small></div>
  </div>;
}
