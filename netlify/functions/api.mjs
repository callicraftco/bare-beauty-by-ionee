// One function serves every /api/* route for the site and the studio panel.
import { createHash } from 'node:crypto';
import { purgeCache } from '@netlify/functions';
import {
  HttpError,
  bool,
  fail,
  int,
  json,
  money,
  normEmail,
  phoneDigits,
  randomToken,
  readJson,
  siteOrigin,
  sleep,
  str,
  text,
  uid,
  validEmail,
} from '../lib/util.mjs';
import {
  addDays,
  addMonths,
  formatDateLong,
  formatTime,
  isDate,
  isTime,
  monthKey,
  nowIn,
  toMin,
  validTimeZone,
  zonedToDate,
} from '../lib/time.mjs';
import {
  dedupe,
  findAppointment,
  flatServices,
  getBlocks,
  getClients,
  getMedia,
  getServices,
  getSettings,
  monthKeys,
  monthsBetween,
  mutateDoc,
  mutateMonth,
  readDoc,
  readMonth,
  readMonths,
  store,
  writeDoc,
} from '../lib/store.mjs';
import { bookingWindow, conflictsFor, slotsForDate, slotsForRange } from '../lib/availability.mjs';
import {
  checkManageToken,
  checkPassword,
  clearThrottle,
  getAuth,
  issueToken,
  manageToken,
  masterPasswordSet,
  requireAdmin,
  safeEqual,
  setOwnerPassword,
  throttle,
  updateAuth,
} from '../lib/auth.mjs';
import {
  clientBookedEmail,
  clientCancelledEmail,
  clientConfirmedEmail,
  clientDeclinedEmail,
  mailEnabled,
  ownerCancelledEmail,
  ownerEmail,
  ownerNewBookingEmail,
  sendMail,
  testEmail,
} from '../lib/mail.mjs';
import { buildCalendar } from '../lib/ics.mjs';
import { ACTIVE_STATUSES, POLICY_VERSION, STATUSES } from '../lib/defaults.mjs';
import * as instagram from '../lib/instagram.mjs';
import * as privacy from '../lib/privacy.mjs';

export const config = { path: '/api/*' };

const ID = '([a-z0-9_]{3,40})';
const routes = [
  ['GET', '/site', getSite],
  ['GET', '/availability', getAvailability],
  ['POST', '/book', postBook],
  ['GET', '/appointment', getPublicAppointment],
  ['POST', '/appointment/cancel', cancelPublicAppointment],
  ['GET', `/media/${ID}`, getMediaFile],
  ['GET', '/calendar.ics', getCalendar],
  ['POST', '/admin/login', adminLogin],
  ['GET', '/admin/bootstrap', admin(bootstrap)],
  ['GET', '/admin/pulse', admin(getPulse)],
  ['GET', '/admin/appointments', admin(listAppointments)],
  ['POST', '/admin/appointments', admin(createAppointment)],
  ['PATCH', `/admin/appointments/${ID}`, admin(updateAppointment)],
  ['DELETE', `/admin/appointments/${ID}`, admin(deleteAppointment)],
  ['POST', '/admin/clients', admin(createClient)],
  ['PATCH', `/admin/clients/${ID}`, admin(updateClient)],
  ['DELETE', `/admin/clients/${ID}`, admin(deleteClient)],
  ['GET', `/admin/clients/${ID}/export`, admin(exportClient)],
  ['POST', `/admin/clients/${ID}/erase`, admin(eraseClient)],
  ['GET', '/admin/privacy/old-records', admin(listOldRecords)],
  ['POST', '/admin/privacy/old-records', admin(eraseOldRecords)],
  ['GET', '/admin/instagram', admin(igStatus)],
  ['POST', '/admin/instagram', admin(igConnect)],
  ['PATCH', '/admin/instagram', admin(igPrefs)],
  ['DELETE', '/admin/instagram', admin(igDisconnect)],
  ['POST', '/admin/instagram/sync', admin(igSync)],
  ['PUT', '/admin/services', admin(putServices)],
  ['PUT', '/admin/settings', admin(putSettings)],
  ['POST', '/admin/blocks', admin(createBlock)],
  ['DELETE', `/admin/blocks/${ID}`, admin(deleteBlock)],
  ['POST', '/admin/media', admin(uploadMedia)],
  ['PATCH', '/admin/media', admin(updateMedia)],
  ['DELETE', `/admin/media/${ID}`, admin(deleteMedia)],
  ['POST', '/admin/password', admin(changePassword)],
  ['POST', '/admin/feed-reset', admin(resetFeed)],
  ['POST', '/admin/signout-all', admin(signOutAll)],
  ['GET', '/admin/backup', admin(backup)],
  ['POST', '/admin/restore', admin(restore)],
  ['POST', '/admin/test-email', admin(sendTestEmail)],
].map(([method, pattern, handler]) => [method, new RegExp(`^${pattern.replace('.', '\\.')}$`), handler]);

export default async (req, context) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, '').replace(/\/$/, '') || '/';
  try {
    let pathMatched = false;
    for (const [method, re, handler] of routes) {
      const m = path.match(re);
      if (!m) continue;
      pathMatched = true;
      if (method !== req.method) continue;
      return await handler({ req, context, url, params: m.slice(1), origin: siteOrigin(req) });
    }
    if (pathMatched) return json({ error: 'Method not allowed.' }, 405);
    return json({ error: 'Not found.' }, 404);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message, code: err.code, clashes: err.clashes }, err.status);
    console.error(err);
    return json({ error: 'Something went wrong on our side. Please try again.' }, 500);
  }
};

function admin(handler) {
  return async (ctx) => {
    ctx.auth = await requireAdmin(ctx.req);
    return handler(ctx);
  };
}

// Run work after the response is sent when the platform allows it.
function later(ctx, work) {
  const p = Promise.resolve()
    .then(work)
    .catch((err) => console.error('Background task failed', err));
  if (ctx.context && typeof ctx.context.waitUntil === 'function') ctx.context.waitUntil(p);
  return p;
}

async function refreshSiteCache(extraTags = []) {
  try {
    await purgeCache({ tags: ['site', ...extraTags] });
  } catch {
    // Local development has no CDN to purge.
  }
}

const links = (origin) => ({
  book: `${origin}/book/`,
  admin: `${origin}/admin/`,
  manage: (appt, auth) => `${origin}/appointment/?id=${appt.id}&m=${monthKey(appt.date)}&t=${manageToken(appt.id, auth)}`,
});

// ------------------------------------------------------------------ public

function mediaUrl(item) {
  return { id: item.id, kind: item.kind, alt: item.alt || '', w: item.w || 0, h: item.h || 0, url: `/api/media/${item.id}` };
}

function publicSite(settings, services, media, feed, igAccount) {
  const b = settings.business;
  const visible = (media.items || []).map(mediaUrl);
  return {
    business: {
      name: b.name,
      tagline: b.tagline,
      area: b.area,
      phone: b.phone,
      email: b.email,
      instagram: b.instagram,
      about: b.about,
      announcement: b.announcement,
      timezone: b.timezone,
    },
    hours: settings.hours,
    booking: {
      mode: settings.booking.mode,
      minNoticeHours: settings.booking.minNoticeHours,
      maxDaysAhead: settings.booking.maxDaysAhead,
      cancelNoticeHours: settings.booking.cancelNoticeHours,
      paymentNote: settings.booking.paymentNote,
    },
    faq: settings.faq,
    services: {
      categories: services.categories
        .map((c) => ({ ...c, services: c.services.filter((s) => s.visible !== false) }))
        .filter((c) => c.services.length),
    },
    media: {
      hero: visible.find((m) => m.kind === 'hero') || null,
      about: visible.find((m) => m.kind === 'about') || null,
      gallery: visible.filter((m) => m.kind === 'gallery').sort((a, b) => (a.order || 0) - (b.order || 0)),
    },
    instagram: instagram.publicFeed(feed, igAccount),
    privacy: { retentionYears: settings.privacy.retentionYears },
    policyVersion: POLICY_VERSION,
  };
}

async function getSite() {
  const [settings, services, media, feed, igAccount] = await Promise.all([getSettings(), getServices(), getMedia(), instagram.getFeed(), instagram.getAccount()]);
  return json(publicSite(settings, services, media, feed, igAccount), 200, {
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'Netlify-CDN-Cache-Control': 'public, durable, max-age=300, stale-while-revalidate=604800',
    'Netlify-Cache-Tag': 'site',
  });
}

function pickServices(ids, services, { onlineOnly }) {
  const all = flatServices(services);
  const chosen = [];
  for (const id of ids) {
    const s = all.find((x) => x.id === id);
    if (!s || (onlineOnly && (s.online === false || s.visible === false))) {
      fail(400, 'One of the services you picked is no longer available. Please refresh and try again.', 'service');
    }
    chosen.push({ id: s.id, name: s.name, price: Number(s.price) || 0, duration: Number(s.duration) || 0 });
  }
  return chosen;
}

async function getAvailability({ url }) {
  const ids = str(url.searchParams.get('services'), 600).split(',').filter(Boolean).slice(0, 10);
  if (!ids.length) fail(400, 'Pick at least one service first.');
  const [settings, services, blocksDoc] = await Promise.all([getSettings(), getServices(), getBlocks()]);
  const chosen = pickServices(ids, services, { onlineOnly: true });
  const duration = chosen.reduce((sum, s) => sum + s.duration, 0);
  const window = bookingWindow(settings);
  let from = url.searchParams.get('from');
  if (!isDate(from)) from = window.now.date;
  // Slots never start before the earliest bookable day, so read months from there.
  if (from < window.earliest.date) from = window.earliest.date;
  const days = int(url.searchParams.get('days'), 1, 370, 42);
  const months = monthsBetween(monthKey(from), monthKey(addDays(from, days)));
  const appointments = await readMonths(months);
  const slots = slotsForRange(from, days, duration, { settings, appointments, blocks: blocksDoc.items, window });
  return json({ duration, days: slots, today: window.now.date, lastDate: window.lastDate, timezone: window.tz });
}

function cleanInstagram(v) {
  return str(v, 60).replace(/^@+/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[^A-Za-z0-9._]/g, '').slice(0, 30);
}

function contactFrom(body, { requirePhone }) {
  const name = str(body.name, 80);
  const phone = str(body.phone, 30);
  const email = normEmail(body.email);
  if (name.length < 2) fail(400, 'Please add your name.', 'name');
  if (requirePhone && phoneDigits(phone).length < 10) fail(400, 'Please add a phone number with area code so I can reach you.', 'phone');
  if (email && !validEmail(email)) fail(400, 'That email address looks incomplete.', 'email');
  return { name, phone, email, instagram: cleanInstagram(body.instagram) };
}

// Same person? Phone first: two people who share an email stay separate.
const sameClient = (c, contact) => privacy.contactMatch(c, contact);

const hasId = (id) => (items) => items.some((x) => x.id === id);
const lacksId = (id) => (items) => !items.some((x) => x.id === id);
const docHas = (id) => (doc) => (doc.items || []).some((x) => x.id === id);
const docLacks = (id) => (doc) => !(doc.items || []).some((x) => x.id === id);

// Finds the client by phone or email, or adds them (with `id`, when given). `marketing`
// is an opt-in to offer texts, recorded with when and where it was given.
async function upsertClient(contact, { marketing, id } = {}) {
  const { result } = await mutateDoc(
    'clients',
    { items: [] },
    (doc) => {
      if (!Array.isArray(doc.items)) doc.items = [];
      const now = new Date().toISOString();
      let c = doc.items.find((x) => sameClient(x, contact));
      if (c) {
        if (!c.email && contact.email) c.email = contact.email;
        if (!c.instagram && contact.instagram) c.instagram = contact.instagram;
        if (!c.phone && contact.phone) c.phone = contact.phone;
        if (marketing) c.marketing = marketing;
        c.updatedAt = now;
        return c.id;
      }
      c = { id: id || uid('cl'), ...contact, notes: '', createdAt: now, updatedAt: now, ...(marketing ? { marketing } : {}) };
      doc.items.push(c);
      return c.id;
    },
    { verify: (doc, id) => docHas(id)(doc) },
  );
  return result;
}

// Two appointments on the same day overlap (cleanup buffer included).
function overlaps(a, b, buffer) {
  if (a.date !== b.date) return false;
  const as = toMin(a.start);
  const bs = toMin(b.start);
  return as < bs + Number(b.duration || 0) + buffer && bs < as + Number(a.duration || 0) + buffer;
}

// Insurance against a race: if another booking for an overlapping time was
// saved earlier than ours, ours steps aside.
function earlierRival(items, appt, buffer) {
  return items.find(
    (x) =>
      x.id !== appt.id &&
      ACTIVE_STATUSES.includes(x.status) &&
      x.source === 'online' &&
      overlaps(x, appt, buffer) &&
      (x.createdAt < appt.createdAt || (x.createdAt === appt.createdAt && x.id < appt.id)),
  );
}

function publicAppointment(appt, settings) {
  const tz = settings.business.timezone;
  const start = zonedToDate(appt.date, appt.start, tz);
  const hours = Number(settings.booking.cancelNoticeHours) || 0;
  const deadline = new Date(start.getTime() - hours * 3600000);
  const active = ACTIVE_STATUSES.includes(appt.status);
  return {
    id: appt.id,
    date: appt.date,
    start: appt.start,
    duration: appt.duration,
    status: appt.status,
    services: appt.services.map((s) => ({ name: s.name, price: s.price })),
    total: appt.total,
    name: appt.name,
    address: appt.status === 'confirmed' ? settings.business.address || '' : '',
    startsAt: start.toISOString(),
    canCancel: active && Date.now() < deadline.getTime(),
    cancelNoticeHours: hours,
    past: start.getTime() < Date.now(),
  };
}

async function postBook(ctx) {
  const { req, context } = ctx;
  const body = await readJson(req, 20_000);
  // Bots fill hidden fields and submit instantly. Pretend it worked.
  if (body.website || (Number(body.elapsed) > 0 && Number(body.elapsed) < 2500)) {
    return json({ ok: true, appointment: null });
  }
  const auth = await getAuth();
  const limit = Number(process.env.BOOK_LIMIT_PER_HOUR) || 8;
  if (!(await throttle('book', context?.ip, limit, 60, auth.secret))) {
    fail(429, 'Too many booking attempts from this connection. Please wait a bit or text the studio.');
  }
  const ids = Array.isArray(body.services) ? body.services.map((x) => str(x, 60)).filter(Boolean).slice(0, 10) : [];
  if (!ids.length) fail(400, 'Pick at least one service.', 'services');
  if (!isDate(body.date) || !isTime(body.start)) fail(400, 'Pick a day and time.', 'time');
  if (body.agree !== true) fail(400, 'Please agree to the booking terms to continue.', 'agree');
  const contact = contactFrom(body, { requirePhone: true });
  const [settings, services, blocksDoc, clientsDoc] = await Promise.all([getSettings(), getServices(), getBlocks(), getClients()]);
  const chosen = pickServices(ids, services, { onlineOnly: true });
  const duration = chosen.reduce((sum, s) => sum + s.duration, 0);
  const total = chosen.reduce((sum, s) => sum + s.price, 0);
  const window = bookingWindow(settings);

  // Cheap check before touching anything.
  const before = slotsForDate(body.date, duration, {
    settings,
    appointments: await readMonth(monthKey(body.date)),
    blocks: blocksDoc.items,
    window,
  });
  if (!before.includes(body.start)) fail(409, 'That time was just taken. Please pick another time.', 'slot');

  const now = new Date().toISOString();
  const offers = body.offers === true ? { sms: true, at: now, source: 'Booking form' } : undefined;
  // The client record (and any offer-text opt-in) is saved only once the time is secured.
  const known = (clientsDoc.items || []).find((c) => sameClient(c, contact));
  const clientId = known ? known.id : uid('cl');
  const status = settings.booking.mode === 'instant' ? 'confirmed' : 'pending';
  const appt = {
    id: uid('ap'),
    date: body.date,
    start: body.start,
    duration,
    services: chosen,
    total,
    status,
    clientId,
    ...contact,
    firstVisit: bool(body.firstVisit, false),
    notes: text(body.notes, 800),
    staffNotes: '',
    source: 'online',
    // What was agreed to: the terms version, plus the cancel cutoff and payment note shown then.
    terms: {
      version: POLICY_VERSION,
      at: now,
      cancelNoticeHours: Number(settings.booking.cancelNoticeHours) || 0,
      paymentNote: settings.booking.paymentNote || '',
    },
    createdAt: now,
    updatedAt: now,
    log: [
      { at: now, text: status === 'pending' ? 'Requested online' : 'Booked online' },
      { at: now, text: `Agreed to the booking terms (version ${POLICY_VERSION})` },
      ...(offers ? [{ at: now, text: 'Asked for offer texts' }] : []),
    ],
  };

  const ym = monthKey(body.date);
  const { data: saved } = await mutateMonth(
    ym,
    (items) => {
      if (items.some((x) => x.id === appt.id)) return;
      const open = slotsForDate(body.date, duration, { settings, appointments: items, blocks: blocksDoc.items, window });
      if (!open.includes(body.start)) throw new HttpError(409, 'That time was just taken. Please pick another time.', 'slot');
      items.push(appt);
    },
    hasId(appt.id),
  );
  const buffer = Math.max(0, Number(settings.booking.buffer) || 0);
  if (earlierRival(saved.items || [], appt, buffer)) {
    await mutateMonth(
      ym,
      (items) => {
        const idx = items.findIndex((x) => x.id === appt.id);
        if (idx >= 0) items.splice(idx, 1);
      },
      lacksId(appt.id),
    );
    fail(409, 'That time was just taken. Please pick another time.', 'slot');
  }

  const savedClientId = await upsertClient(contact, { marketing: offers, id: clientId });
  if (savedClientId !== clientId) {
    // Someone else added this person a moment ago. Link the booking to that record.
    await mutateMonth(
      ym,
      (items) => {
        const a = items.find((x) => x.id === appt.id);
        if (a) a.clientId = savedClientId;
      },
      (items) => items.some((x) => x.id === appt.id && x.clientId === savedClientId),
    );
    appt.clientId = savedClientId;
  }

  const l = links(ctx.origin);
  const manageUrl = l.manage(appt, auth);
  later(ctx, async () => {
    const owner = ownerEmail(settings);
    if (owner) {
      const m = ownerNewBookingEmail(appt, settings, l.admin);
      await sendMail({ to: owner, ...m, replyTo: appt.email || undefined });
    }
    if (appt.email) {
      const m = clientBookedEmail(appt, settings, manageUrl);
      await sendMail({ to: appt.email, ...m, replyTo: owner || undefined });
    }
  });

  return json({ ok: true, appointment: publicAppointment(appt, settings), manageUrl, emailSent: mailEnabled() && Boolean(appt.email) });
}

async function loadManaged(url, auth) {
  const id = str(url.searchParams.get('id'), 40);
  const t = str(url.searchParams.get('t'), 60);
  const m = str(url.searchParams.get('m'), 7);
  return loadManagedBy(id, t, m, auth);
}

async function loadManagedBy(id, t, m, auth) {
  if (!/^ap_[a-z0-9]+$/.test(id) || !checkManageToken(id, t, auth)) fail(404, 'This link is not valid. Please check the link in your confirmation.');
  let found = await findAppointment(id, m);
  if (!found) {
    // It may be mid-move between months. Look once more.
    await sleep(400);
    found = await findAppointment(id, m);
  }
  if (!found) fail(404, 'This appointment could not be found. It may have been removed.');
  return found;
}

async function getPublicAppointment({ url }) {
  const [auth, settings] = await Promise.all([getAuth(), getSettings()]);
  const { appt } = await loadManaged(url, auth);
  const b = settings.business;
  return json({
    appointment: publicAppointment(appt, settings),
    studio: { name: b.name, phone: b.phone, instagram: b.instagram, email: b.email, area: b.area },
  });
}

async function cancelPublicAppointment(ctx) {
  const body = await readJson(ctx.req, 2000);
  const [auth, settings] = await Promise.all([getAuth(), getSettings()]);
  const id = str(body.id, 40);
  let updated;
  // Two tries: if the studio moves the appointment to another month at this exact
  // moment, it is briefly in neither month. The second try finds it in its new place.
  for (let attempt = 0; attempt < 2 && !updated; attempt++) {
    if (attempt) await sleep(500);
    const { appt, ym } = await loadManagedBy(id, str(body.t, 60), str(body.m, 7), auth);
    const view = publicAppointment(appt, settings);
    if (!ACTIVE_STATUSES.includes(appt.status)) fail(400, 'This appointment is already closed.');
    if (!view.canCancel) {
      fail(403, `Online cancellation closes ${view.cancelNoticeHours} hours before your appointment. Please text the studio instead.`, 'late');
    }
    let gone = false;
    await mutateMonth(
      ym,
      (items) => {
        const a = items.find((x) => x.id === appt.id);
        if (!a) {
          gone = true;
          return;
        }
        // Check again inside the save: the studio may have declined it a moment ago.
        if (a.status !== 'cancelled') {
          if (!ACTIVE_STATUSES.includes(a.status)) throw new HttpError(400, 'This appointment is already closed.');
          const now = new Date().toISOString();
          a.status = 'cancelled';
          a.updatedAt = now;
          a.log = [...(a.log || []), { at: now, text: 'Cancelled by client online' }];
        }
        updated = a;
      },
      (items) => gone || items.some((x) => x.id === appt.id && x.status === 'cancelled'),
    );
  }
  if (!updated) fail(409, 'This appointment just changed. Please reload the page and try again.');
  const l = links(ctx.origin);
  later(ctx, async () => {
    const owner = ownerEmail(settings);
    if (owner) await sendMail({ to: owner, ...ownerCancelledEmail(updated, settings, l.admin) });
    if (updated.email) await sendMail({ to: updated.email, ...clientCancelledEmail(updated, settings, l.book, true), replyTo: owner || undefined });
  });
  return json({ ok: true, appointment: publicAppointment(updated, settings) });
}

async function getMediaFile({ params }) {
  const [id] = params;
  const res = await store().getWithMetadata(`media-file/${id}`, { type: 'arrayBuffer' });
  if (!res || !res.data) return new Response('Not found', { status: 404 });
  const type = (res.metadata && res.metadata.type) || 'image/jpeg';
  return new Response(res.data, {
    headers: {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=86400',
      'Netlify-CDN-Cache-Control': 'public, durable, max-age=31536000, immutable',
      // Tagged so a deleted photo can be cleared from the CDN right away.
      'Netlify-Cache-Tag': `media-${id}`,
    },
  });
}

async function getCalendar({ url, origin }) {
  const [auth, settings] = await Promise.all([getAuth(), getSettings()]);
  const key = url.searchParams.get('key') || '';
  if (!auth.feedKey || key.length < 10 || !safeEqual(key, auth.feedKey)) return new Response('Not found', { status: 404 });
  const tz = settings.business.timezone;
  const today = nowIn(tz).date;
  const fromYm = monthKey(addDays(today, -60));
  const keys = (await monthKeys()).filter((k) => k >= fromYm);
  const appts = (await readMonths(keys)).filter((a) => ['pending', 'confirmed', 'completed'].includes(a.status));
  const host = new URL(origin || 'https://example.com').host;
  const body = buildCalendar({ name: settings.business.name, appointments: appts, tz, host });
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="studio.ics"',
      'Cache-Control': 'no-store',
    },
  });
}

// ------------------------------------------------------------------ studio panel

async function adminLogin({ req, context }) {
  const body = await readJson(req, 2000);
  const auth = await getAuth();
  if (!masterPasswordSet() && !auth.ownerHash) {
    fail(503, 'The studio password is not set yet. Add ADMIN_PASSWORD (8+ characters) in Netlify, then redeploy.', 'setup');
  }
  if (!(await throttle('login', context?.ip, 10, 15, auth.secret))) {
    fail(429, 'Too many tries. Wait 15 minutes, then try again.');
  }
  // Passwords are compared exactly as typed, spaces included.
  const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
  if (!checkPassword(password, auth)) fail(401, "That password didn't work.", 'password');
  await clearThrottle('login', context?.ip, auth.secret);
  return json({ token: issueToken(auth) });
}

// A short fingerprint of everything that can change outside the panel
// (new bookings, client cancellations). The panel polls it and reloads only on change.
async function computePulse() {
  const s = store();
  const [appts, docs] = await Promise.all([s.list({ prefix: 'appts/' }), s.list({ prefix: 'clients' })]);
  const parts = [...appts.blobs, ...docs.blobs.filter((b) => b.key === 'clients')]
    .map((b) => `${b.key}:${b.etag}`)
    .sort()
    .join('|');
  return createHash('sha1').update(parts).digest('hex').slice(0, 16);
}

async function getPulse() {
  return json({ pulse: await computePulse() });
}

async function bootstrap({ auth, origin }) {
  const [settings, services, clients, blocks, media, keys] = await Promise.all([
    getSettings(),
    getServices(),
    getClients(),
    getBlocks(),
    getMedia(),
    monthKeys(),
  ]);
  const now = nowIn(settings.business.timezone);
  const fromYm = addMonths(monthKey(now.date), -12);
  const recent = keys.filter((k) => k >= fromYm);
  const [appointments, pulse] = await Promise.all([readMonths(recent), computePulse()]);
  const l = links(origin);
  for (const a of appointments) a.manageUrl = l.manage(a, auth);
  return json({
    pulse,
    settings,
    services,
    clients: clients.items || [],
    blocks: blocks.items || [],
    media: (media.items || []).map(mediaUrl),
    appointments,
    now,
    olderMonths: keys.filter((k) => k < fromYm),
    feedUrl: `${origin}/api/calendar.ics?key=${auth.feedKey}`,
    mail: { enabled: mailEnabled(), ownerEmail: ownerEmail(settings), from: process.env.MAIL_FROM || '' },
    hasOwnPassword: Boolean(auth.ownerHash),
    masterPassword: masterPasswordSet(),
    instagram: await instagram.status(),
    privacyCheck: await readDoc('privacy-check', null),
    policyVersion: POLICY_VERSION,
  });
}

async function listAppointments({ url }) {
  const from = str(url.searchParams.get('from'), 7);
  const to = str(url.searchParams.get('to'), 7);
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) fail(400, 'Pick a month range.');
  const keys = (await monthKeys()).filter((k) => k >= from && k <= to);
  return json({ appointments: await readMonths(keys) });
}

function servicesFromBody(body, services) {
  if (Array.isArray(body.services) && body.services.length) {
    const ids = body.services.filter((x) => typeof x === 'string').map((x) => str(x, 60));
    const custom = body.services.filter((x) => x && typeof x === 'object');
    const chosen = ids.length ? pickServices(ids, services, { onlineOnly: false }) : [];
    for (const c of custom.slice(0, 10)) {
      const name = str(c.name, 80);
      if (!name) continue;
      chosen.push({ id: str(c.id, 60) || 'custom', name, price: money(c.price), duration: int(c.duration, 0, 720, 0) });
    }
    return chosen;
  }
  return null;
}

async function studioContext(date, settings, ignoreId) {
  const [items, blocksDoc] = await Promise.all([readMonth(monthKey(date)), getBlocks()]);
  return { settings, appointments: items, blocks: blocksDoc.items, ignoreId };
}

async function createAppointment(ctx) {
  const body = await readJson(ctx.req, 20_000);
  const [settings, services, auth] = await Promise.all([getSettings(), getServices(), getAuth()]);
  if (!isDate(body.date) || !isTime(body.start)) fail(400, 'Pick a day and a start time.');
  const chosen = servicesFromBody(body, services);
  if (!chosen || !chosen.length) fail(400, 'Add at least one service.');
  const contact = contactFrom(body, { requirePhone: false });
  const duration = body.duration !== undefined && body.duration !== '' ? int(body.duration, 5, 720, 60) : chosen.reduce((s, x) => s + x.duration, 0) || 30;
  const total = body.total !== undefined && body.total !== '' ? money(body.total) : chosen.reduce((s, x) => s + x.price, 0);
  const status = STATUSES.includes(body.status) ? body.status : 'confirmed';

  let clientId = str(body.clientId, 40);
  if (clientId) {
    const clients = await getClients();
    if (!clients.items.some((c) => c.id === clientId)) clientId = '';
  }
  if (!clientId && (phoneDigits(contact.phone).length >= 10 || contact.email)) clientId = await upsertClient(contact);

  const now = new Date().toISOString();
  const appt = {
    id: uid('ap'),
    date: body.date,
    start: body.start,
    duration,
    services: chosen,
    total,
    status,
    clientId: clientId || '',
    ...contact,
    firstVisit: bool(body.firstVisit, false),
    notes: text(body.notes, 800),
    staffNotes: text(body.staffNotes, 2000),
    source: 'studio',
    createdAt: now,
    updatedAt: now,
    log: [{ at: now, text: 'Added in the studio panel' }],
  };

  const blocksDoc = await getBlocks();
  await mutateMonth(
    monthKey(body.date),
    (items) => {
      if (items.some((x) => x.id === appt.id)) return;
      if (!body.force && ACTIVE_STATUSES.includes(status)) {
        const clashes = conflictsFor(body.date, body.start, duration, { settings, appointments: items, blocks: blocksDoc.items });
        if (clashes.length) throw Object.assign(new HttpError(409, describeClashes(clashes), 'conflict'), { clashes });
      }
      items.push(appt);
    },
    hasId(appt.id),
  );

  if (bool(body.notifyClient) && appt.email && appt.status === 'confirmed') {
    const l = links(ctx.origin);
    later(ctx, () => sendMail({ to: appt.email, ...clientConfirmedEmail(appt, settings, l.manage(appt, auth)), replyTo: ownerEmail(settings) || undefined }));
  }
  return json({ appointment: { ...appt, manageUrl: links(ctx.origin).manage(appt, auth) } });
}

function describeClashes(clashes) {
  const parts = clashes.map((c) => (c.type === 'block' ? `your time off (${c.note})` : `${c.name} at ${formatTime(c.start)}`));
  return `This overlaps ${parts.join(' and ')}.`;
}

const ACTIONS = {
  confirm: { from: ['pending'], to: 'confirmed', log: 'Confirmed' },
  decline: { from: ['pending'], to: 'declined', log: 'Declined' },
  complete: { from: ['pending', 'confirmed', 'no-show'], to: 'completed', log: 'Marked completed' },
  'no-show': { from: ['pending', 'confirmed', 'completed'], to: 'no-show', log: 'Marked as no-show' },
  cancel: { from: ['pending', 'confirmed'], to: 'cancelled', log: 'Cancelled by studio' },
  reopen: { from: ['cancelled', 'declined', 'no-show', 'completed'], to: 'confirmed', log: 'Reopened' },
};

async function updateAppointment(ctx) {
  const [id] = ctx.params;
  const body = await readJson(ctx.req, 20_000);
  const [settings, services, auth] = await Promise.all([getSettings(), getServices(), getAuth()]);
  const found = await findAppointment(id, str(body.month, 7));
  if (!found) fail(404, 'That appointment was not found. It may have been deleted.');
  const { ym: oldYm } = found;
  const now = new Date().toISOString();

  const apply = (a) => {
    const next = { ...a, log: [...(a.log || [])] };
    const notes = [];
    if (body.action) {
      const rule = ACTIONS[body.action];
      if (!rule) fail(400, 'Unknown action.');
      if (!rule.from.includes(a.status)) fail(400, `This appointment is ${a.status}, so it can't be changed that way.`);
      next.status = rule.to;
      notes.push(rule.log);
    }
    if (body.date !== undefined || body.start !== undefined) {
      const date = body.date ?? a.date;
      const start = body.start ?? a.start;
      if (!isDate(date) || !isTime(start)) fail(400, 'Pick a valid day and start time.');
      if (date !== a.date || start !== a.start) {
        notes.push(`Moved from ${formatDateLong(a.date)} ${formatTime(a.start)} to ${formatDateLong(date)} ${formatTime(start)}`);
      }
      next.date = date;
      next.start = start;
    }
    const chosen = servicesFromBody(body, services);
    if (chosen && chosen.length) {
      next.services = chosen;
      if (body.duration === undefined) next.duration = chosen.reduce((s, x) => s + x.duration, 0) || next.duration;
      if (body.total === undefined) next.total = chosen.reduce((s, x) => s + x.price, 0);
      notes.push('Services updated');
    }
    if (body.duration !== undefined && body.duration !== '') next.duration = int(body.duration, 5, 720, next.duration);
    if (body.total !== undefined && body.total !== '') next.total = money(body.total, next.total);
    if (body.reminded === true) {
      next.remindedAt = now;
      notes.push('Reminder text sent');
    }
    if (body.thanked === true) {
      next.thankedAt = now;
      notes.push('Thank-you text sent');
    }
    if (body.staffNotes !== undefined) next.staffNotes = text(body.staffNotes, 2000);
    if (body.notes !== undefined) next.notes = text(body.notes, 800);
    if (body.name !== undefined || body.phone !== undefined || body.email !== undefined || body.instagram !== undefined) {
      const contact = contactFrom({ name: body.name ?? a.name, phone: body.phone ?? a.phone, email: body.email ?? a.email, instagram: body.instagram ?? a.instagram }, { requirePhone: false });
      Object.assign(next, contact);
    }
    if (notes.length) next.log.push(...notes.map((t) => ({ at: now, text: t })));
    next.updatedAt = now;
    return next;
  };

  const timeChanged = (a, n) => a.date !== n.date || a.start !== n.start || a.duration !== n.duration;
  const checkClashes = async (items, a, n) => {
    if (body.force || !ACTIVE_STATUSES.includes(n.status)) return;
    if (!timeChanged(a, n) && !(body.action === 'reopen')) return;
    const blocksDoc = await getBlocks();
    const clashes = conflictsFor(n.date, n.start, n.duration, { settings, appointments: items, blocks: blocksDoc.items, ignoreId: n.id });
    if (clashes.length) throw Object.assign(new HttpError(409, describeClashes(clashes), 'conflict'), { clashes });
  };

  let before;
  let after;
  const applied = (items) => items.some((x) => x.id === id && x.updatedAt === now);
  const newYmGuess = body.date && isDate(body.date) ? monthKey(body.date) : oldYm;
  if (newYmGuess === oldYm) {
    await mutateMonth(
      oldYm,
      async (items) => {
        const idx = items.findIndex((x) => x.id === id);
        if (idx < 0) throw new HttpError(404, 'That appointment was not found.');
        if (items[idx].updatedAt === now) return; // already saved on an earlier try
        before = items[idx];
        after = apply(before);
        await checkClashes(items, before, after);
        items[idx] = after;
      },
      applied,
    );
  } else {
    // Moving to another month. First a dry run against the new month, so a clash is
    // reported before anything changes.
    const preview = apply(found.appt);
    await checkClashes(await readMonth(newYmGuess), found.appt, preview);

    // 1. Take it out of the old month, building the moved copy from what is saved there
    //    right now. A change that landed a moment ago (a client cancelling) travels with it.
    await mutateMonth(
      oldYm,
      (items) => {
        const idx = items.findIndex((x) => x.id === id);
        if (idx < 0) {
          if (after) return; // removed on an earlier try
          throw new HttpError(404, 'That appointment was not found.');
        }
        before = items[idx];
        after = apply(before);
        items.splice(idx, 1);
      },
      lacksId(id),
    );

    // 2. Put it in the new month. If the time was taken in the meantime, put it back.
    let clash = null;
    await mutateMonth(
      monthKey(after.date),
      async (items) => {
        if (applied(items)) return;
        try {
          await checkClashes(items, before, after);
        } catch (err) {
          clash = err;
          return;
        }
        const idx = items.findIndex((x) => x.id === id);
        if (idx >= 0) items[idx] = after;
        else items.push(after);
      },
      (items) => Boolean(clash) || applied(items),
    );
    if (clash) {
      await mutateMonth(
        oldYm,
        (items) => {
          if (!items.some((x) => x.id === id)) items.push(before);
        },
        hasId(id),
      );
      throw clash;
    }
  }

  const notify = bool(body.notifyClient, false) && after.email;
  if (notify) {
    const l = links(ctx.origin);
    const manage = l.manage(after, auth);
    const replyTo = ownerEmail(settings) || undefined;
    let message = null;
    if (body.action === 'confirm' || body.action === 'reopen') message = clientConfirmedEmail(after, settings, manage);
    else if (body.action === 'decline') message = clientDeclinedEmail(after, settings, l.book);
    else if (body.action === 'cancel') message = clientCancelledEmail(after, settings, l.book, false);
    else if (timeChanged(before, after) && after.status === 'confirmed') message = clientConfirmedEmail(after, settings, manage);
    if (message) later(ctx, () => sendMail({ to: after.email, ...message, replyTo }));
  }
  return json({ appointment: { ...after, manageUrl: links(ctx.origin).manage(after, auth) } });
}

async function deleteAppointment({ params, url }) {
  const [id] = params;
  const found = await findAppointment(id, str(url.searchParams.get('month'), 7));
  if (!found) fail(404, 'That appointment was not found.');
  await mutateMonth(
    found.ym,
    (items) => {
      const idx = items.findIndex((x) => x.id === id);
      if (idx >= 0) items.splice(idx, 1);
    },
    lacksId(id),
  );
  return json({ ok: true });
}

function clientFields(body, existing = {}) {
  const contact = contactFrom(
    {
      name: body.name ?? existing.name,
      phone: body.phone ?? existing.phone,
      email: body.email ?? existing.email,
      instagram: body.instagram ?? existing.instagram,
    },
    { requirePhone: false },
  );
  const out = { ...contact, notes: body.notes !== undefined ? text(body.notes, 4000) : existing.notes || '' };
  // Offer texts: recorded when Ionee notes a yes or a STOP she got in person or by text.
  if (typeof body.marketing === 'boolean') {
    const was = existing.marketing && existing.marketing.sms;
    if (was !== body.marketing) out.marketing = { sms: body.marketing, at: new Date().toISOString(), source: 'Studio' };
  }
  return out;
}

async function createClient({ req }) {
  const body = await readJson(req, 10_000);
  const fields = clientFields(body);
  const now = new Date().toISOString();
  const id = uid('cl');
  const { result } = await mutateDoc(
    'clients',
    { items: [] },
    (doc) => {
      if (!Array.isArray(doc.items)) doc.items = [];
      const mine = doc.items.find((c) => c.id === id);
      if (mine) return mine;
      const dupe = doc.items.find((c) => sameClient(c, fields));
      if (dupe) throw new HttpError(409, `${dupe.name} already has that phone number or email.`, 'duplicate');
      const c = { id, ...fields, createdAt: now, updatedAt: now };
      doc.items.push(c);
      return c;
    },
    { verify: docHas(id) },
  );
  return json({ client: result });
}

async function updateClient({ req, params }) {
  const [id] = params;
  const body = await readJson(req, 10_000);
  const now = new Date().toISOString();
  const { result } = await mutateDoc(
    'clients',
    { items: [] },
    (doc) => {
      const c = (doc.items || []).find((x) => x.id === id);
      if (!c) throw new HttpError(404, 'That client was not found.');
      Object.assign(c, clientFields(body, c), { updatedAt: now });
      return c;
    },
    { verify: (doc) => (doc.items || []).some((x) => x.id === id && x.updatedAt === now) },
  );
  return json({ client: result });
}

async function deleteClient({ params }) {
  const [id] = params;
  await mutateDoc(
    'clients',
    { items: [] },
    (doc) => {
      doc.items = (doc.items || []).filter((x) => x.id !== id);
    },
    { verify: docLacks(id) },
  );
  return json({ ok: true });
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function cleanServices(body) {
  if (!body || !Array.isArray(body.categories)) fail(400, 'The menu could not be read.');
  const seen = new Set();
  const uniqueId = (wanted, fallbackName) => {
    let base = slug(wanted) || slug(fallbackName) || 'item';
    let id = base;
    let n = 2;
    while (seen.has(id)) id = `${base}-${n++}`;
    seen.add(id);
    return id;
  };
  const categories = body.categories.slice(0, 30).map((c) => {
    const name = str(c.name, 60);
    if (!name) fail(400, 'Every section of the menu needs a name.');
    return {
      id: uniqueId(c.id, name),
      name,
      group: str(c.group, 60),
      note: text(c.note, 400),
      services: (Array.isArray(c.services) ? c.services : []).slice(0, 60).map((s) => {
        const sname = str(s.name, 80);
        if (!sname) fail(400, `A service in ${name} is missing its name.`);
        return {
          id: uniqueId(s.id, `${name}-${sname}`),
          name: sname,
          price: money(s.price),
          duration: int(s.duration, 5, 720, 30),
          durationLabel: str(s.durationLabel, 40),
          badge: str(s.badge, 40),
          description: text(s.description, 600),
          rebookDays: int(s.rebookDays, 0, 365, 0),
          online: bool(s.online, true),
          visible: bool(s.visible, true),
        };
      }),
    };
  });
  return { categories, updatedAt: new Date().toISOString() };
}

async function putServices({ req }) {
  const body = await readJson(req, 200_000);
  const clean = cleanServices(body);
  await writeDoc('services', clean);
  await refreshSiteCache();
  return json({ services: clean });
}

function cleanSettings(body, current) {
  const b = body.business || {};
  const tz = str(b.timezone, 60) || current.business.timezone;
  if (!validTimeZone(tz)) fail(400, 'That time zone is not recognized.');
  const email = normEmail(b.email ?? current.business.email);
  if (email && !validEmail(email)) fail(400, 'The studio email looks incomplete.');
  const business = {
    name: str(b.name ?? current.business.name, 80) || 'Bare Beauty by Ionee',
    tagline: str(b.tagline ?? current.business.tagline, 140),
    area: str(b.area ?? current.business.area, 80),
    address: text(b.address ?? current.business.address, 200),
    phone: str(b.phone ?? current.business.phone, 30),
    email,
    instagram: cleanInstagram(b.instagram ?? current.business.instagram),
    about: text(b.about ?? current.business.about, 1500),
    announcement: str(b.announcement ?? current.business.announcement, 160),
    timezone: tz,
  };
  const hours = {};
  for (const d of ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']) {
    const h = (body.hours && body.hours[d]) || current.hours[d];
    const start = isTime(h.start) ? h.start : '10:00';
    const end = isTime(h.end) ? h.end : '18:00';
    const open = bool(h.open, false);
    if (open && toMin(end) <= toMin(start)) fail(400, 'Closing time has to be after opening time.');
    hours[d] = { open, start, end };
  }
  const bk = body.booking || {};
  const cb = current.booking;
  const booking = {
    mode: (bk.mode ?? cb.mode) === 'instant' ? 'instant' : 'request',
    step: [10, 15, 20, 30, 45, 60].includes(Number(bk.step ?? cb.step)) ? Number(bk.step ?? cb.step) : 30,
    buffer: int(bk.buffer ?? cb.buffer, 0, 120, 15),
    minNoticeHours: int(bk.minNoticeHours ?? cb.minNoticeHours, 0, 336, 12),
    maxDaysAhead: int(bk.maxDaysAhead ?? cb.maxDaysAhead, 7, 365, 60),
    cancelNoticeHours: int(bk.cancelNoticeHours ?? cb.cancelNoticeHours, 0, 168, 24),
    paymentNote: text(bk.paymentNote ?? cb.paymentNote, 400),
  };
  const faqSource = Array.isArray(body.faq) ? body.faq : current.faq;
  const faq = faqSource
    .slice(0, 30)
    .map((f) => ({ id: str(f.id, 40) || uid('faq'), q: str(f.q, 160), a: text(f.a, 1500) }))
    .filter((f) => f.q && f.a);
  const templates = { ...current.templates };
  for (const [k, v] of Object.entries(body.templates || {})) {
    if (k in current.templates) templates[k] = text(v, 700);
  }
  const pv = body.privacy || {};
  const privacy = {
    retentionYears: [0, 1, 2, 3, 4, 5, 7].includes(Number(pv.retentionYears ?? current.privacy.retentionYears))
      ? Number(pv.retentionYears ?? current.privacy.retentionYears)
      : 3,
  };
  const s = body.setup || {};
  const setup = {
    dismissed: bool(s.dismissed ?? current.setup.dismissed, false),
    hoursReviewed: bool(s.hoursReviewed ?? current.setup.hoursReviewed, false),
    menuReviewed: bool(s.menuReviewed ?? current.setup.menuReviewed, false),
    policiesReviewed: bool(s.policiesReviewed ?? current.setup.policiesReviewed, false),
  };
  return { business, hours, booking, faq, templates, privacy, setup, updatedAt: new Date().toISOString() };
}

async function putSettings({ req }) {
  const body = await readJson(req, 100_000);
  const current = await getSettings();
  const clean = cleanSettings(body, current);
  await writeDoc('settings', clean);
  await refreshSiteCache();
  return json({ settings: clean });
}

async function createBlock({ req }) {
  const body = await readJson(req, 4000);
  if (!isDate(body.startDate)) fail(400, 'Pick the first day.');
  const endDate = isDate(body.endDate) ? body.endDate : body.startDate;
  if (endDate < body.startDate) fail(400, 'The last day has to be on or after the first day.');
  const allDay = bool(body.allDay, true);
  if (!allDay && (!isTime(body.start) || !isTime(body.end) || toMin(body.end) <= toMin(body.start))) {
    fail(400, 'Pick a start and end time, with the end after the start.');
  }
  const block = {
    id: uid('bk'),
    startDate: body.startDate,
    endDate,
    allDay,
    start: allDay ? '' : body.start,
    end: allDay ? '' : body.end,
    note: str(body.note, 120),
    createdAt: new Date().toISOString(),
  };
  await mutateDoc(
    'blocks',
    { items: [] },
    (doc) => {
      if (!Array.isArray(doc.items)) doc.items = [];
      if (!doc.items.some((b) => b.id === block.id)) doc.items.push(block);
    },
    { verify: docHas(block.id) },
  );
  return json({ block });
}

async function deleteBlock({ params }) {
  const [id] = params;
  await mutateDoc(
    'blocks',
    { items: [] },
    (doc) => {
      doc.items = (doc.items || []).filter((b) => b.id !== id);
    },
    { verify: docLacks(id) },
  );
  return json({ ok: true });
}

const IMAGE_TYPES = ['image/jpeg', 'image/webp', 'image/png'];

async function uploadMedia({ req, url }) {
  const type = (req.headers.get('content-type') || '').split(';')[0].trim();
  if (!IMAGE_TYPES.includes(type)) fail(415, 'Upload a JPG, PNG or WebP photo.');
  const kind = ['hero', 'about', 'gallery'].includes(url.searchParams.get('kind')) ? url.searchParams.get('kind') : 'gallery';
  const buf = await req.arrayBuffer();
  if (buf.byteLength > 4.5 * 1024 * 1024) fail(413, 'That photo is too large. Try one under 4 MB.');
  if (buf.byteLength < 100) fail(400, 'That file looks empty.');
  const id = uid('md');
  await store().set(`media-file/${id}`, buf, { metadata: { type } });
  const item = {
    id,
    kind,
    alt: str(url.searchParams.get('alt'), 150),
    w: int(url.searchParams.get('w'), 0, 10000, 0),
    h: int(url.searchParams.get('h'), 0, 10000, 0),
    type,
    size: buf.byteLength,
    order: Date.now(),
    createdAt: new Date().toISOString(),
  };
  const removed = new Set();
  try {
    await mutateDoc(
      'media',
      { items: [] },
      (doc) => {
        if (!Array.isArray(doc.items)) doc.items = [];
        if (doc.items.some((x) => x.id === id)) return;
        if (kind !== 'gallery') {
          for (const m of doc.items.filter((x) => x.kind === kind)) removed.add(m.id);
          doc.items = doc.items.filter((x) => x.kind !== kind);
        }
        if (kind === 'gallery' && doc.items.filter((x) => x.kind === 'gallery').length >= 24) {
          throw new HttpError(400, 'The gallery holds up to 24 photos. Remove one first.');
        }
        doc.items.push(item);
      },
      { verify: docHas(id) },
    );
  } catch (err) {
    await store().delete(`media-file/${id}`);
    throw err;
  }
  await Promise.all([...removed].map((rid) => store().delete(`media-file/${rid}`)));
  await refreshSiteCache([...removed].map((rid) => `media-${rid}`));
  return json({ media: mediaUrl(item) });
}

async function updateMedia({ req }) {
  const body = await readJson(req, 20_000);
  const updates = Array.isArray(body.items) ? body.items : [];
  const { data } = await mutateDoc('media', { items: [] }, (doc) => {
    for (const u of updates) {
      const m = (doc.items || []).find((x) => x.id === u.id);
      if (!m) continue;
      if (u.alt !== undefined) m.alt = str(u.alt, 150);
      if (u.order !== undefined) m.order = Number(u.order) || 0;
    }
  });
  await refreshSiteCache();
  return json({ media: data.items.map(mediaUrl) });
}

async function deleteMedia({ params }) {
  const [id] = params;
  await mutateDoc(
    'media',
    { items: [] },
    (doc) => {
      doc.items = (doc.items || []).filter((x) => x.id !== id);
    },
    { verify: docLacks(id) },
  );
  await store().delete(`media-file/${id}`);
  await refreshSiteCache([`media-${id}`]);
  return json({ ok: true });
}

async function changePassword({ req }) {
  const body = await readJson(req, 2000);
  const password = String(body.password || '');
  if (password.length < 8) fail(400, 'Use at least 8 characters.');
  if (password.length > 200) fail(400, 'That password is too long.');
  if (password !== password.trim()) fail(400, "Leave out spaces at the start or end. They're easy to miss when you sign in.");
  // Other devices are signed out; this one gets a fresh session.
  const auth = await setOwnerPassword(password);
  return json({ ok: true, token: issueToken(auth) });
}

async function resetFeed({ origin }) {
  const auth = await updateAuth((doc) => {
    doc.feedKey = randomToken(18);
  });
  return json({ feedUrl: `${origin}/api/calendar.ics?key=${auth.feedKey}` });
}

async function signOutAll() {
  const auth = await updateAuth((doc) => {
    doc.sessionVersion = (Number(doc.sessionVersion) || 1) + 1;
  });
  return json({ token: issueToken(auth) });
}

async function backup() {
  const [settings, services, clients, blocks, media, keys] = await Promise.all([
    getSettings(),
    getServices(),
    getClients(),
    getBlocks(),
    getMedia(),
    monthKeys(),
  ]);
  const appointments = await readMonths(keys);
  const stamp = new Date().toISOString().slice(0, 10);
  return json(
    {
      kind: 'bare-beauty-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      services,
      clients: clients.items || [],
      blocks: blocks.items || [],
      media: media.items || [],
      appointments,
    },
    200,
    { 'Content-Disposition': `attachment; filename="bare-beauty-backup-${stamp}.json"` },
  );
}

async function restore({ req }) {
  const body = await readJson(req, 8_000_000);
  if (body.kind !== 'bare-beauty-backup') fail(400, 'That file is not a studio backup.');
  const current = await getSettings();
  const settings = cleanSettings(body.settings || {}, current);
  const services = cleanServices(body.services || { categories: [] });
  const clients = (Array.isArray(body.clients) ? body.clients : []).filter(
    (c) => c && typeof c === 'object' && typeof c.id === 'string' && /^[a-z0-9_]{3,40}$/.test(c.id) && typeof c.name === 'string',
  );
  const blocks = (Array.isArray(body.blocks) ? body.blocks : []).filter(
    (b) =>
      b &&
      typeof b.id === 'string' &&
      isDate(b.startDate) &&
      (b.endDate === undefined || b.endDate === '' || isDate(b.endDate)) &&
      (b.allDay === true || (isTime(b.start) && isTime(b.end) && toMin(b.end) > toMin(b.start))),
  );
  const appointments = dedupe(
    (Array.isArray(body.appointments) ? body.appointments : []).filter(
      (a) =>
        a &&
        typeof a.id === 'string' &&
        /^[a-z0-9_]{3,40}$/.test(a.id) &&
        isDate(a.date) &&
        isTime(a.start) &&
        STATUSES.includes(a.status) &&
        Number.isFinite(Number(a.duration)) &&
        Number(a.duration) > 0 &&
        Number(a.duration) <= 720 &&
        Array.isArray(a.services) &&
        typeof a.name === 'string',
    ),
  );
  const byMonth = new Map();
  for (const a of appointments) {
    const ym = monthKey(a.date);
    if (!byMonth.has(ym)) byMonth.set(ym, []);
    byMonth.get(ym).push(a);
  }
  const existing = await monthKeys();
  await Promise.all([
    writeDoc('settings', settings),
    writeDoc('services', services),
    writeDoc('clients', { items: clients }),
    writeDoc('blocks', { items: blocks }),
    ...[...byMonth.entries()].map(([ym, items]) => writeDoc(`appts/${ym}`, { items })),
    ...existing.filter((ym) => !byMonth.has(ym)).map((ym) => store().delete(`appts/${ym}`)),
  ]);
  await refreshSiteCache();
  return json({ ok: true, appointments: appointments.length, clients: clients.length });
}

async function sendTestEmail() {
  const settings = await getSettings();
  if (!mailEnabled()) fail(400, 'Email is not set up yet. Add RESEND_API_KEY and MAIL_FROM in Netlify.');
  const to = ownerEmail(settings);
  if (!to) fail(400, 'Add the studio email in Settings first.');
  const result = await sendMail({ to, ...testEmail(settings) });
  if (!result.ok) fail(502, 'Resend did not accept the email. Check the API key and that your domain is verified.');
  return json({ ok: true, to });
}

// ------------------------------------------------------------------ client privacy

async function exportClient({ params }) {
  const [id] = params;
  const settings = await getSettings();
  const { client, appts } = await privacy.clientRecords(id);
  const stamp = nowIn(settings.business.timezone).date;
  return json(privacy.exportPayload(client, appts, settings), 200, {
    'Content-Disposition': `attachment; filename="client-record-${slug(client.name) || 'client'}-${stamp}.json"`,
  });
}

async function eraseClient({ params }) {
  const [id] = params;
  const result = await privacy.eraseClient(id, await getSettings());
  return json({ ok: true, ...result });
}

async function listOldRecords() {
  const found = await privacy.findOldRecords(await getSettings());
  await privacy.saveCheck(found);
  return json(privacy.summary(found));
}

async function eraseOldRecords() {
  return json({ ok: true, ...(await privacy.eraseOld(await getSettings())) });
}

// ------------------------------------------------------------------ Instagram

async function igStatus() {
  return json({ instagram: await instagram.status() });
}

async function igConnect({ req }) {
  const body = await readJson(req, 4000);
  const result = await instagram.connect(body.token);
  await refreshSiteCache();
  return json({ instagram: result });
}

async function igPrefs({ req }) {
  const body = await readJson(req, 2000);
  await instagram.setPrefs({ show: typeof body.show === 'boolean' ? body.show : undefined, count: body.count });
  await refreshSiteCache();
  return json({ instagram: await instagram.status() });
}

async function igDisconnect() {
  await instagram.disconnect();
  await refreshSiteCache();
  return json({ instagram: await instagram.status() });
}

async function igSync() {
  const result = await instagram.sync({ force: true });
  if (result.changed) await refreshSiteCache();
  return json({ instagram: await instagram.status(), ok: result.ok, error: result.error || '' });
}
