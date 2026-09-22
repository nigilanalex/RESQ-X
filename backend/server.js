require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const { setupMqtt } = require("./src/mqttClient");
const { buildApiRouter } = require("./src/routes/api");
const store = require("./src/store");
const { updateIntelligence } = require("./src/alertService");
const { createHeadlightService, buildHeadlightRouter } = require("./src/headlight");
const { createSecurity } = require('./src/security');
const { MAX_BODY, securityHeaders, createRateLimiter, createAuthMiddleware, notFound, safeErrorHandler } = require('./src/securityMiddleware');
const { createCaptureService } = require('./src/cameraCapture');

const PORT = process.env.PORT || 4000;
const CORS_ORIGINS = (process.env.CORS_ORIGIN || "http://localhost:5173").split(',').map(value => value.trim()).filter(Boolean);
if (process.env.NODE_ENV === 'production' && (!process.env.CORS_ORIGIN || CORS_ORIGINS.some(origin => !origin.startsWith('https://')))) throw new Error('Production requires explicit HTTPS CORS_ORIGIN values');
const corsOptions = { origin(origin, callback) { if (!origin || CORS_ORIGINS.includes(origin)) return callback(null, true); const error = new Error('Origin not allowed'); error.statusCode = 403; callback(error); }, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'X-CSRF-Token'], maxAge: 600 };

const app = express();
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(express.json({ limit: MAX_BODY, strict: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: corsOptions });

const security = createSecurity();
const auth = createAuthMiddleware(security);
security.onSessionInvalidated((userId) => {
  for (const socket of io.sockets.sockets.values()) if (socket.auth?.userId === userId) socket.disconnect(true);
});
const bootstrapped = security.bootstrapFromEnvironment();
if (bootstrapped) console.log('[security] Initial admin account created from environment. Remove INITIAL_ADMIN_PASSWORD from .env now.');

const mqttHandle = setupMqtt(io);

const headlight = createHeadlightService({
  getUnit: store.getUnit,
  notify: alert => { store.addAlert(alert); io.emit('alert', alert); },
});
const captureService = createCaptureService({ getUnit: store.getUnit });
const loginIpLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 30 });
const loginAccountLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 8, key: req => `${req.ip}:${String(req.body?.username || '').toLowerCase().slice(0, 32)}` });
const authLimit = createRateLimiter({ windowMs: 60 * 1000, max: 60 });
const generalLimit = createRateLimiter({ windowMs: 60 * 1000, max: 240 });
const controlLimit = createRateLimiter({ windowMs: 1000, max: 12, key: req => `${req.auth?.user.id || req.ip}:${req.params.unitId || ''}` });
const headlightLimit = createRateLimiter({ windowMs: 60 * 1000, max: 60, key: req => `${req.auth?.user.id || req.ip}:${req.params.unitId || ''}` });
const captureLimit = createRateLimiter({ windowMs: 60 * 1000, max: 10, key: req => `${req.auth?.user.id || req.ip}:${req.params.unitId || ''}` });
const simulationLimit = createRateLimiter({ windowMs: 60 * 1000, max: 30, key: req => `${req.auth?.user.id || req.ip}:${req.params.unitId || ''}` });
app.use('/api/auth', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.get('/api/auth/status', authLimit, (req, res) => res.set('Cache-Control', 'no-store').json({ configured: security.isConfigured() }));
app.post('/api/auth/login', loginIpLimit, loginAccountLimit, (req, res) => {
  const { username, password } = req.body || {};
  if (Object.keys(req.body || {}).some(key => !['username', 'password'].includes(key)) || typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Invalid login request' });
  if (username.length > 32 || password.length > 256) { security.audit('LOGIN_FAILURE', { action: 'LOGIN', result: 'DENIED', ip: req.ip }); return res.status(401).json({ error: 'Invalid username or password' }); }
  const user = security.authenticateCredentials(username, password);
  if (!user) { security.audit('LOGIN_FAILURE', { action: 'LOGIN', result: 'DENIED', ip: req.ip }); return res.status(401).json({ error: 'Invalid username or password' }); }
  const session = security.createSession(user); security.setSessionCookie(res, session.token); security.audit('LOGIN_SUCCESS', { userId: user.id, role: user.role, action: 'LOGIN', result: 'SUCCESS', ip: req.ip });
  res.set('Cache-Control', 'no-store').json({ user: session.user, csrfToken: session.csrf, expiresAt: session.expiresAt });
});
app.use('/api', generalLimit, auth.attach);
app.use('/api/auth', authLimit);
app.get('/api/auth/me', auth.requireAuth, (req, res) => res.set('Cache-Control', 'no-store').json({ user: security.publicUser(req.auth.user), csrfToken: req.auth.csrf, expiresAt: req.auth.expiresAt }));
app.post('/api/auth/logout', auth.requireAuth, auth.csrf, (req, res) => { security.invalidate(req.headers.cookie ? require('./src/security').parseCookies(req.headers.cookie)[security.COOKIE_NAME] : ''); security.clearSessionCookie(res); security.audit('LOGOUT', { userId: req.auth.user.id, role: req.auth.user.role, result: 'SUCCESS', ip: req.ip }); res.json({ ok: true }); });
app.use('/api/units/:unitId/control', (req, res, next) => req.body?.action === 'stop' ? next() : controlLimit(req, res, next));
app.use('/api/units/:unitId/headlight', headlightLimit);
app.use('/api/units/:unitId/capture', captureLimit);
app.use('/api/simulator/:unitId/scenario', simulationLimit);
app.use('/api', auth.requireAuth, buildApiRouter(mqttHandle, { security, auth, captureService }));
app.use('/api', auth.requireAuth, buildHeadlightRouter(headlight, { auth, security, validUnit: id => mqttHandle.unitIds.includes(id) && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id) }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "resqx-backend", time: Date.now() });
});

app.use(notFound);
app.use(safeErrorHandler);

io.use(auth.authenticateSocket);
io.on("connection", (socket) => {
  console.log("[socket] authenticated dashboard connected");
  const expiryTimer = setTimeout(() => socket.disconnect(true), Math.max(0, socket.auth.expiresAt - Date.now()));
  // Send current snapshot immediately so the UI isn't empty until the next MQTT message
  socket.emit("snapshot", {
    units: store.getAllUnits(),
    motor: store.getMotorStatus(),
    alerts: store.getAlerts(50),
    mqtt: mqttHandle.getStatus(),
  });

  socket.on("disconnect", () => {
    clearTimeout(expiryTimer);
    console.log("[socket] authenticated dashboard disconnected");
  });
});

// A unit is live only while it sends status or telemetry within the heartbeat window.
setInterval(() => {
  store.expireStaleUnits().forEach((unit) => {
    updateIntelligence(unit);
    console.log(`[UNIT] ${unit.unitId} heartbeat expired; marking offline`);
    io.emit("unit:update", unit);
  });
  const motor = store.expireStaleMotor();
  if (motor) {
    console.log('[MOTOR] heartbeat expired; marking motor controller offline');
    io.emit('motor:update', motor);
  }
}, 1000);

server.listen(PORT, () => {
  console.log(`RESQ-X backend listening on http://localhost:${PORT}`);
  console.log(`Expecting units: ${mqttHandle.unitIds.join(", ")}`);
});
