const { parseCookies } = require('./security');

const MAX_BODY = '32kb';
function securityHeaders(req, res, next) {
  // This process serves JSON/JPEG API responses, not the Vite application.
  // A deny-by-default CSP is therefore safe and cannot block the dashboard UI.
  res.set({
    'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Resource-Policy': 'same-site',
  });
  if (process.env.NODE_ENV === 'production') res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
}
function createRateLimiter({ windowMs, max, key = req => req.ip }) {
  const hits = new Map();
  let requests = 0;
  return (req, res, next) => {
    const now = Date.now();
    if (++requests % 500 === 0) for (const [id, value] of hits) if (value.resetAt <= now) hits.delete(id);
    const id = String(key(req)); const entry = hits.get(id);
    const current = !entry || entry.resetAt <= now ? { count: 0, resetAt: now + windowMs } : entry;
    current.count += 1; hits.set(id, current);
    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(Math.max(0, max - current.count)));
    res.set('RateLimit-Reset', String(Math.ceil(current.resetAt / 1000)));
    if (current.count > max) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))));
      return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }
    next();
  };
}
function createAuthMiddleware(security) {
  function attach(req, res, next) { try { req.auth = security.authenticate(req); next(); } catch { req.auth = null; next(); } }
  function requireAuth(req, res, next) {
    if (!req.auth) { security.audit('UNAUTHORIZED_ACCESS', { action: req.method + ' ' + req.path, result: 'DENIED', ip: req.ip }); return res.status(401).json({ error: 'Authentication required' }); }
    next();
  }
  function requireRoles(...roles) { return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.user.role)) { security.audit('UNAUTHORIZED_ACCESS', { userId: req.auth?.user.id, role: req.auth?.user.role, action: req.method + ' ' + req.path, result: 'DENIED', ip: req.ip }); return res.status(403).json({ error: 'Insufficient permission' }); }
    next();
  }; }
  function csrf(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const session = req.auth; const token = req.get('X-CSRF-Token');
    if (!session || !token || token !== session.csrf) return res.status(403).json({ error: 'Invalid request token' });
    next();
  }
  function authenticateSocket(socket, next) {
    const session = security.getSession(parseCookies(socket.handshake.headers.cookie || '')[security.COOKIE_NAME]);
    if (!session) return next(new Error('Authentication required')); socket.auth = session; next();
  }
  return { attach, requireAuth, requireRoles, csrf, authenticateSocket };
}
function notFound(req, res) { res.status(404).json({ error: 'Not found' }); }
function safeErrorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = error?.type === 'entity.too.large' ? 413 : error instanceof SyntaxError && error?.status === 400 ? 400 : Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500;
  const message = status === 413 ? 'Request body too large' : status === 400 ? 'Invalid JSON request' : status === 500 ? 'Internal server error' : 'Request failed';
  if (process.env.NODE_ENV !== 'production' && status >= 500) console.error('[api] request failed:', error?.message || 'unknown error');
  res.status(status).json({ error: message });
}
module.exports = { MAX_BODY, securityHeaders, createRateLimiter, createAuthMiddleware, notFound, safeErrorHandler };
