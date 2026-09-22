const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROLES = Object.freeze({ ADMIN: 'ADMIN', OPERATOR: 'OPERATOR', VIEWER: 'VIEWER' });
const COOKIE_NAME = 'resqx_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const USERNAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}$/;

function safeEqual(left, right) {
  const a = Buffer.from(String(left)); const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('base64url')) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) throw new Error('Password must be 12–256 characters');
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64url');
  return `scrypt$${salt}$${hash}`;
}
function verifyPassword(password, encoded) {
  try {
    const [scheme, salt, expected] = String(encoded).split('$');
    if (scheme !== 'scrypt' || !salt || !expected || typeof password !== 'string') return false;
    const actual = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64url');
    return safeEqual(actual, expected);
  } catch { return false; }
}
function parseCookies(header = '') {
  const cookies = {};
  for (const part of String(header).slice(0, 16384).split(';')) {
    const separator = part.indexOf('='); if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    try { cookies[key] = decodeURIComponent(part.slice(separator + 1)); } catch { /* Ignore malformed cookie values. */ }
  }
  return cookies;
}
function publicUser(user) { return { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt }; }
function isProduction() { return process.env.NODE_ENV === 'production'; }

function createSecurity({ dataDir = path.join(__dirname, '..', '.data'), auditDir = dataDir } = {}) {
  const usersPath = path.join(dataDir, 'users.json');
  const auditPath = path.join(auditDir, 'audit.jsonl');
  const sessions = new Map();
  const invalidationListeners = new Set();
  const ensureDirectory = () => fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  function readUsers() {
    try { const data = JSON.parse(fs.readFileSync(usersPath, 'utf8')); return Array.isArray(data.users) ? data.users : []; }
    catch (error) { if (error.code === 'ENOENT') return []; throw new Error('Cannot read local account store'); }
  }
  function saveUsers(users) {
    ensureDirectory();
    const temp = `${usersPath}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify({ version: 1, users }, null, 2), { mode: 0o600 });
    fs.renameSync(temp, usersPath);
  }
  function audit(event, details = {}) {
    const allowed = { timestamp: new Date().toISOString(), event, userId: details.userId || null, role: details.role || null, action: details.action || null, unitId: details.unitId || null, result: details.result || 'UNKNOWN', ip: details.ip || null };
    try { ensureDirectory(); fs.appendFileSync(auditPath, `${JSON.stringify(allowed)}\n`, { mode: 0o600 }); } catch { /* Audit storage must not reveal failures or secrets to clients. */ }
  }
  function userByUsername(username) { return readUsers().find(user => user.username === username) || null; }
  function createUser({ username, password, role = ROLES.VIEWER }) {
    if (!USERNAME.test(username || '')) throw new Error('Username must be 3–32 letters, numbers, dots, underscores, or hyphens');
    if (!Object.values(ROLES).includes(role)) throw new Error('Invalid role');
    const users = readUsers(); if (users.some(user => user.username.toLowerCase() === username.toLowerCase())) throw new Error('Username already exists');
    const user = { id: crypto.randomUUID(), username, passwordHash: hashPassword(password), role, createdAt: new Date().toISOString() };
    users.push(user); saveUsers(users); audit('USER_CREATED', { userId: user.id, role, result: 'SUCCESS' }); return publicUser(user);
  }
  function changeRole(userId, role) {
    if (!Object.values(ROLES).includes(role)) throw new Error('Invalid role');
    const users = readUsers(); const user = users.find(item => item.id === userId); if (!user) throw new Error('Unknown user');
    if (user.role === ROLES.ADMIN && role !== ROLES.ADMIN && users.filter(item => item.role === ROLES.ADMIN).length < 2) throw new Error('At least one ADMIN is required');
    user.role = role; saveUsers(users); invalidateUserSessions(user.id); audit('USER_ROLE_CHANGED', { userId, role, result: 'SUCCESS' }); return publicUser(user);
  }
  function changePassword(userId, password) {
    const users = readUsers(); const user = users.find(item => item.id === userId); if (!user) throw new Error('Unknown user');
    user.passwordHash = hashPassword(password); saveUsers(users); invalidateUserSessions(user.id);
    audit('USER_PASSWORD_CHANGED', { userId, role: user.role, result: 'SUCCESS' }); return publicUser(user);
  }
  function createSession(user) {
    const token = crypto.randomBytes(32).toString('base64url'); const csrf = crypto.randomBytes(24).toString('base64url');
    sessions.set(crypto.createHash('sha256').update(token).digest('hex'), { userId: user.id, csrf, expiresAt: Date.now() + SESSION_TTL_MS });
    return { token, csrf, user: publicUser(user), expiresAt: Date.now() + SESSION_TTL_MS };
  }
  function createLocalSession() {
    const user = { id: 'local-dashboard', username: 'local-dashboard', role: ROLES.ADMIN, createdAt: 'runtime' };
    const token = crypto.randomBytes(32).toString('base64url'); const csrf = crypto.randomBytes(24).toString('base64url');
    const expiresAt = Date.now() + SESSION_TTL_MS;
    sessions.set(crypto.createHash('sha256').update(token).digest('hex'), { userId: user.id, user, local: true, csrf, expiresAt });
    return { token, csrf, user: publicUser(user), expiresAt };
  }
  function getSession(token) {
    const key = crypto.createHash('sha256').update(String(token || '')).digest('hex'); const session = sessions.get(key);
    if (!session || session.expiresAt <= Date.now()) { sessions.delete(key); return null; }
    const user = session.local ? session.user : readUsers().find(item => item.id === session.userId);
    return user ? { ...session, key, user } : null;
  }
  function notifyInvalidated(userId) { for (const listener of invalidationListeners) { try { listener(userId); } catch { /* Session invalidation must continue. */ } } }
  function invalidate(token) { const key = crypto.createHash('sha256').update(String(token || '')).digest('hex'); const session = sessions.get(key); sessions.delete(key); if (session) notifyInvalidated(session.userId); }
  function invalidateUserSessions(userId) { for (const [key, value] of sessions) if (value.userId === userId) sessions.delete(key); notifyInvalidated(userId); }
  function onSessionInvalidated(listener) { invalidationListeners.add(listener); return () => invalidationListeners.delete(listener); }
  function setSessionCookie(res, token) {
    const parts = [`${COOKIE_NAME}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`];
    if (isProduction()) parts.push('Secure'); res.append('Set-Cookie', parts.join('; '));
  }
  function clearSessionCookie(res) { res.append('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${isProduction() ? '; Secure' : ''}`); }
  function authenticate(req) { return getSession(parseCookies(req.headers.cookie || '')[COOKIE_NAME]); }
  const dummyPasswordHash = hashPassword(crypto.randomBytes(24).toString('base64url'));
  function authenticateCredentials(username, password) {
    const user = typeof username === 'string' ? userByUsername(username) : null;
    const valid = verifyPassword(password, user?.passwordHash || dummyPasswordHash);
    return valid && user ? user : null;
  }
  function bootstrapFromEnvironment() {
    const username = process.env.INITIAL_ADMIN_USERNAME; const password = process.env.INITIAL_ADMIN_PASSWORD;
    if (readUsers().length || !username || !password) return false;
    try { createUser({ username, password, role: ROLES.ADMIN }); return true; } catch { return false; }
  }
  return { ROLES, COOKIE_NAME, publicUser, audit, readUsers, createUser, changeRole, changePassword, userByUsername, authenticateCredentials, createSession, createLocalSession, getSession, invalidate, authenticate, setSessionCookie, clearSessionCookie, bootstrapFromEnvironment, verifyPassword, onSessionInvalidated, isConfigured: () => readUsers().length > 0 };
}
module.exports = { createSecurity, ROLES, parseCookies, publicUser };
