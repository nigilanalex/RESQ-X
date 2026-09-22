// Snapshot primitive values, never retain references to changing live telemetry.
export function captureMetadata(unit, cameraSource, date = new Date()) {
  const s = unit?.sensors || {};
  const g = s.gps || {};
  const validGps = g.valid === true && Number.isFinite(g.lat) && Number.isFinite(g.lng)
    && Math.abs(g.lat) <= 90 && Math.abs(g.lng) <= 180;
  const pad = n => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  const unitId = typeof unit?.unitId === 'string' ? unit.unitId.slice(0, 64) : 'UNKNOWN';
  const safeUnitId = unitId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'UNKNOWN';
  return {
    id: crypto.randomUUID(), timestamp: date.toISOString(), unitId, cameraSource,
    filename: `RESQ-X_${safeUnitId}_${day}_${time}.jpg`,
    gps: validGps ? { lat: g.lat, lng: g.lng } : null,
    temperature: Number.isFinite(s.temp) ? s.temp : null,
    humidity: Number.isFinite(s.humidity) ? s.humidity : null,
    flame: s.flame === true ? 'DETECTED' : s.flame === false ? 'CLEAR' : 'UNAVAILABLE',
    human: s.human?.available !== true ? 'NOT AVAILABLE' : s.human.presence === true ? 'DETECTED' : s.human.presence === false ? 'NOT DETECTED' : 'UNAVAILABLE',
    risk: unit?.risk?.level || 'UNAVAILABLE', severity: unit?.intelligence?.severity || 'UNAVAILABLE',
    telemetrySimulated: s.simulated === true,
    telemetryTimestamp: unit?.lastSeen || null,
  };
}
