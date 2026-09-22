function safeBaseUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) throw new Error('Camera is not configured safely');
  const url = new URL(raw);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !hostname || (!/^[A-Za-z0-9.-]+$/.test(hostname) && !/^[0-9A-Fa-f:]+$/.test(hostname))) throw new Error('Camera is not configured safely');
  return url;
}
function createCaptureService({ getUnit, baseUrl = process.env.ESP32_CAM_BASE_URL, request = fetch }) {
  return { async capture(unitId) {
    const unit = getUnit(unitId);
    if (!unit?.online || unit.operatingMode !== 'LIVE') { const error = new Error('Camera unavailable'); error.statusCode = 503; throw error; }
    const response = await request(new URL('/capture', safeBaseUrl(baseUrl)), { signal: AbortSignal.timeout(10000), redirect: 'error', cache: 'no-store' });
    if (!response.ok || !String(response.headers.get('content-type') || '').toLowerCase().startsWith('image/jpeg')) { const error = new Error('Camera capture unavailable'); error.statusCode = 502; throw error; }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 10 * 1024 * 1024 || bytes[0] !== 0xff || bytes[1] !== 0xd8) { const error = new Error('Invalid camera response'); error.statusCode = 502; throw error; }
    return bytes;
  } };
}
module.exports = { createCaptureService, safeBaseUrl };
