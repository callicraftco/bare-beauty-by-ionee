// Studio login. Two passwords open the control panel:
//   1. ADMIN_PASSWORD, set as a Netlify environment variable (the owner's master key)
//   2. A password Ionee sets herself inside the panel (stored only as a scrypt hash)
// Sessions are signed tokens (HMAC-SHA256) that last 30 days.
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { HttpError, fail, randomToken } from './util.mjs';
import { mutateDoc, store } from './store.mjs';

const SESSION_DAYS = 30;

export async function getAuth() {
  const s = store();
  const existing = await s.get('auth', { type: 'json' });
  if (existing && existing.secret) return existing;
  const fresh = {
    secret: randomToken(32),
    feedKey: randomToken(18),
    sessionVersion: 1,
    ownerHash: '',
    ownerSalt: '',
    createdAt: new Date().toISOString(),
  };
  const write = await s.setJSON('auth', fresh, { onlyIfNew: true });
  if (write.modified) return fresh;
  return s.get('auth', { type: 'json' });
}

export async function updateAuth(change) {
  const { data } = await mutateDoc('auth', null, async (doc) => {
    if (!doc || !doc.secret) throw new HttpError(500, 'Studio login is not set up yet.');
    await change(doc);
  });
  return data;
}

const b64 = (buf) => Buffer.from(buf).toString('base64url');

function sign(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function issueToken(auth) {
  const payload = b64(JSON.stringify({ v: auth.sessionVersion, exp: Date.now() + SESSION_DAYS * 86400000 }));
  return `${payload}.${sign(payload, auth.secret)}`;
}

export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function verifyToken(token, auth) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, mac] = token.split('.');
  if (!safeEqual(sign(payload, auth.secret), mac)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.v === auth.sessionVersion && data.exp > Date.now();
  } catch {
    return false;
  }
}

export async function requireAdmin(req) {
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const auth = await getAuth();
  if (!verifyToken(token, auth)) fail(401, 'Please sign in again.', 'auth');
  return auth;
}

function hashPassword(password, salt) {
  return scryptSync(String(password), salt, 32).toString('base64url');
}

export function masterPasswordSet() {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 8);
}

export function checkPassword(password, auth) {
  let ok = false;
  const master = process.env.ADMIN_PASSWORD || '';
  if (master.length >= 8) {
    const a = createHash('sha256').update(String(password)).digest();
    const b = createHash('sha256').update(master).digest();
    ok = timingSafeEqual(a, b) || ok;
  }
  if (auth.ownerHash && auth.ownerSalt) {
    ok = safeEqual(hashPassword(password, auth.ownerSalt), auth.ownerHash) || ok;
  }
  return ok;
}

// A new password also signs out every other device, so an old session can't linger.
export async function setOwnerPassword(password) {
  const salt = randomBytes(16).toString('base64url');
  const hash = hashPassword(password, salt);
  return updateAuth((doc) => {
    doc.ownerSalt = salt;
    doc.ownerHash = hash;
    doc.ownerUpdatedAt = new Date().toISOString();
    doc.sessionVersion = (Number(doc.sessionVersion) || 1) + 1;
  });
}

// Per-visitor rate limit kept in Blobs. Every attempt writes its own small record,
// then counts the records inside the window. Nothing is read-then-written, so a burst
// of parallel requests can't slip past the limit. Returns false when over the limit.
// The visitor's IP address is only kept as a keyed hash (HMAC with the site's secret),
// so it can't be turned back into the address without that secret.
const THROTTLE_PREFIX = 'throttle/';

function throttleBase(kind, ip, secret) {
  const code = createHmac('sha256', String(secret || 'bare-beauty')).update(String(ip || 'unknown')).digest('hex').slice(0, 24);
  return `${THROTTLE_PREFIX}${kind}-${code}/`;
}

const attemptTime = (key) => Number(key.slice(key.lastIndexOf('/') + 1).split('-')[0]) || 0;

export async function throttle(kind, ip, limit, windowMinutes, secret) {
  const base = throttleBase(kind, ip, secret);
  const s = store();
  const now = Date.now();
  await s.set(`${base}${now}-${randomBytes(4).toString('hex')}`, '1');
  const { blobs } = await s.list({ prefix: base });
  const cutoff = now - windowMinutes * 60000;
  let count = 0;
  const stale = [];
  for (const b of blobs) {
    if (attemptTime(b.key) >= cutoff) count += 1;
    else stale.push(b.key);
  }
  if (stale.length) await Promise.all(stale.slice(0, 40).map((k) => s.delete(k).catch(() => {})));
  return count <= limit;
}

export async function clearThrottle(kind, ip, secret) {
  const s = store();
  const { blobs } = await s.list({ prefix: throttleBase(kind, ip, secret) });
  await Promise.all(blobs.map((b) => s.delete(b.key).catch(() => {})));
}

// Deletes rate-limit records older than maxAgeHours. The daily job runs this.
export async function sweepThrottles(maxAgeHours = 24) {
  const s = store();
  const { blobs } = await s.list({ prefix: THROTTLE_PREFIX });
  const cutoff = Date.now() - maxAgeHours * 3600000;
  const old = blobs.filter((b) => attemptTime(b.key) < cutoff).map((b) => b.key);
  for (let i = 0; i < old.length; i += 50) {
    await Promise.all(old.slice(i, i + 50).map((k) => s.delete(k).catch(() => {})));
  }
  return old.length;
}

// Links clients use to view or cancel their own appointment.
export function manageToken(id, auth) {
  return createHmac('sha256', auth.secret).update(`manage:${id}`).digest('base64url').slice(0, 22);
}

export function checkManageToken(id, token, auth) {
  return safeEqual(manageToken(id, auth), token || '');
}
