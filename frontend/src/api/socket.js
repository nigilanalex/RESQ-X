import { io } from "socket.io-client";

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

export const socket = io(BACKEND_URL, { autoConnect: false, withCredentials: true });

let csrfToken = null;
export function setCsrfToken(token) { csrfToken = token || null; }
export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase()) && csrfToken) headers.set('X-CSRF-Token', csrfToken);
  const response = await fetch(`${BACKEND_URL}${path}`, { ...options, headers, credentials: 'include' });
  return response;
}

export async function sendControl(unitId, action, params = {}) {
  const res = await apiFetch(`/api/units/${encodeURIComponent(unitId)}/control`, {
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
  const res = await apiFetch(`/api/simulator/${encodeURIComponent(unitId)}/scenario`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario }) });
  if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error || `Simulation request failed (${res.status})`); }
  return res.json();
}
