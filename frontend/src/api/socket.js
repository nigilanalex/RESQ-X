import { io } from "socket.io-client";

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

export const socket = io(BACKEND_URL, { autoConnect: true });

export async function sendControl(unitId, action, params = {}) {
  const res = await fetch(`${BACKEND_URL}/api/units/${unitId}/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, params }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Control request failed (${res.status})`);
  }
  return res.json();
}

export async function triggerSimulationScenario(unitId, scenario) {
  const res = await fetch(`${BACKEND_URL}/api/simulator/${unitId}/scenario`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario }) });
  if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error || `Simulation request failed (${res.status})`); }
  return res.json();
}
