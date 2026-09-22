import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api/socket';
import './HeadlightControl.css';

export default function HeadlightControl({ unit, canOperate = false }) {
  const [result, setResult] = useState({ state: 'UNAVAILABLE' });
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const commandVersion = useRef(0);
  const simulated = unit?.operatingMode === 'SIMULATION';
  const enabled = unit?.online && ['SIMULATION', 'LIVE'].includes(unit?.operatingMode);
  const endpoint = `/api/units/${encodeURIComponent(unit?.unitId || '')}/headlight`;
  useEffect(() => {
    const current = ++generation.current;
    setResult({ state: 'UNAVAILABLE' });
    let stopped = false;
    let timer;
    async function poll() {
      if (!enabled || stopped) return;
      if (!inFlight.current) {
        const version = commandVersion.current;
        try {
          const response = await apiFetch(endpoint, { signal: AbortSignal.timeout(5000) });
          if (!response.ok) throw new Error('Headlight status unavailable');
          const data = await response.json();
          if (!stopped && current === generation.current && !inFlight.current && version === commandVersion.current) setResult(data);
        } catch { if (!stopped && !inFlight.current && version === commandVersion.current) setResult({ state: 'UNAVAILABLE' }); }
      }
      if (!stopped) timer = setTimeout(poll, 3000);
    }
    poll();
    return () => { stopped = true; clearTimeout(timer); generation.current++; };
  }, [endpoint, enabled, simulated]);
  async function command(state) {
    if (!canOperate || !enabled || !['ON', 'OFF'].includes(result.state) || inFlight.current) return;
    inFlight.current = true;
    commandVersion.current++;
    setBusy(true);
    const current = generation.current;
    try {
      const response = await apiFetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state }), signal: AbortSignal.timeout(6000) });
      const data = await response.json();
      if (current === generation.current) setResult(response.ok ? data : { ...data, state: 'UNAVAILABLE' });
    } catch { if (current === generation.current) setResult({ state: 'UNAVAILABLE', error: 'Backend unavailable' }); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const state = enabled ? result.state : 'UNAVAILABLE';
  return <section className={`headlight headlight--${state.toLowerCase()}`} aria-label="Headlight control">
    <div><strong><span aria-hidden="true">💡</span> HEADLIGHT</strong>{simulated && <small>SIMULATED</small>}</div>
    <output aria-live="polite">{busy ? 'SENDING…' : state === 'UNAVAILABLE' ? state : `HEADLIGHT ${state}`}</output>
    <button aria-label="Headlight on" aria-pressed={state === 'ON'} disabled={!canOperate || !enabled || busy || !['ON', 'OFF'].includes(state)} onClick={() => command('ON')}>ON</button>
    <button aria-label="Headlight off" aria-pressed={state === 'OFF'} disabled={!canOperate || !enabled || busy || !['ON', 'OFF'].includes(state)} onClick={() => command('OFF')}>OFF</button>
    {result.error && <small className="headlight__error" title={result.error}>{result.error}</small>}
  </section>;
}
