// Client privacy tools for the studio panel:
//   - a copy of everything kept about one client (for "what do you have on me?")
//   - erasing a client (for "please delete my information")
//   - finding and erasing records past the retention period set in Settings
// Erasing keeps what bookkeeping needs (date, services, price, status) and blanks
// the rest: name, phone, email, Instagram, the client's notes and Ionee's notes.
import { ACTIVE_STATUSES } from './defaults.mjs';
import { monthKey, nowIn } from './time.mjs';
import { getClients, monthKeys, mutateDoc, mutateMonth, readDoc, readMonths, writeDoc } from './store.mjs';
import { HttpError, phoneDigits } from './util.mjs';

// Is this the same person? When both have a phone number, the phone decides, so two
// people who share an email (a mother and daughter, say) stay separate. Email only
// decides when one side has no phone.
export function contactMatch(client, contact) {
  const a = phoneDigits(client.phone);
  const b = phoneDigits(contact.phone);
  if (a.length >= 10 && b.length >= 10) return a === b;
  const e1 = String(client.email || '').toLowerCase();
  const e2 = String(contact.email || '').toLowerCase();
  return Boolean(e1 && e2 && e1 === e2);
}

// Each appointment belongs to at most one client: the one it's linked to, or for older
// and walk-in appointments without a link, the first client whose contact details match.
export function ownerMap(clients, appts) {
  const ids = new Set(clients.map((c) => c.id));
  const map = new Map();
  for (const a of appts) {
    if (a.clientId && ids.has(a.clientId)) {
      map.set(a.id, a.clientId);
      continue;
    }
    if (a.erasedAt) continue;
    const c = clients.find((x) => contactMatch(x, a));
    if (c) map.set(a.id, c.id);
  }
  return map;
}

const byTime = (a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`);

async function everything() {
  const [clientsDoc, keys] = await Promise.all([getClients(), monthKeys()]);
  return { clients: clientsDoc.items || [], appts: await readMonths(keys) };
}

export async function clientRecords(clientId) {
  const { clients, appts } = await everything();
  const client = clients.find((c) => c.id === clientId);
  if (!client) throw new HttpError(404, 'That client was not found.');
  const owners = ownerMap(clients, appts);
  return { client, appts: appts.filter((a) => owners.get(a.id) === client.id).sort(byTime) };
}

export function exportPayload(client, appts, settings) {
  return {
    kind: 'client-record',
    business: settings.business.name,
    exportedAt: new Date().toISOString(),
    client: {
      name: client.name,
      phone: client.phone || '',
      email: client.email || '',
      instagram: client.instagram || '',
      studioNotes: client.notes || '',
      offerTexts: client.marketing ? { optedIn: Boolean(client.marketing.sms), recordedAt: client.marketing.at, source: client.marketing.source } : null,
      clientSince: client.createdAt || '',
    },
    appointments: appts.map((a) => ({
      date: a.date,
      start: a.start,
      minutes: a.duration,
      services: (a.services || []).map((s) => ({ name: s.name, price: s.price })),
      total: a.total,
      status: a.status,
      nameGiven: a.name || '',
      phoneGiven: a.phone || '',
      emailGiven: a.email || '',
      instagramGiven: a.instagram || '',
      firstVisit: Boolean(a.firstVisit),
      notesFromClient: a.notes || '',
      studioNotes: a.staffNotes || '',
      bookedAt: a.createdAt || '',
      bookedVia: a.source === 'online' ? 'Website' : 'Studio',
      bookingTermsAgreed: a.terms || null,
      history: (a.log || []).map((l) => ({ at: l.at, what: l.text })),
    })),
  };
}

function scrub(a, now, why) {
  return {
    ...a,
    name: 'Erased client',
    phone: '',
    email: '',
    instagram: '',
    notes: '',
    staffNotes: '',
    clientId: '',
    firstVisit: false,
    manageUrl: undefined,
    erasedAt: now,
    updatedAt: now,
    log: [{ at: now, text: why }],
  };
}

async function scrubAppointments(list, why) {
  const now = new Date().toISOString();
  const byMonth = new Map();
  for (const a of list) {
    const ym = monthKey(a.date);
    if (!byMonth.has(ym)) byMonth.set(ym, new Set());
    byMonth.get(ym).add(a.id);
  }
  for (const [ym, ids] of byMonth) {
    await mutateMonth(
      ym,
      (items) => {
        for (let i = 0; i < items.length; i++) {
          if (ids.has(items[i].id) && !items[i].erasedAt) items[i] = scrub(items[i], now, why);
        }
      },
      (items) => items.every((x) => !ids.has(x.id) || x.erasedAt),
    );
  }
}

async function removeClients(ids) {
  if (!ids.length) return;
  const set = new Set(ids);
  await mutateDoc(
    'clients',
    { items: [] },
    (doc) => {
      doc.items = (doc.items || []).filter((c) => !set.has(c.id));
    },
    { verify: (doc) => !(doc.items || []).some((c) => set.has(c.id)) },
  );
}

const upcomingOf = (appts, today) => appts.filter((a) => ACTIVE_STATUSES.includes(a.status) && a.date >= today);

export async function eraseClient(clientId, settings) {
  const today = nowIn(settings.business.timezone).date;
  const { client, appts } = await clientRecords(clientId);
  const upcoming = upcomingOf(appts, today);
  if (upcoming.length) {
    const n = upcoming.length;
    throw new HttpError(409, `${client.name} has ${n} upcoming appointment${n === 1 ? '' : 's'}. Cancel ${n === 1 ? 'it' : 'them'} first, then erase.`, 'upcoming');
  }
  await scrubAppointments(appts, 'Client details erased on request');
  await removeClients([client.id]);
  return { name: client.name, appointments: appts.length };
}

// ---- retention

function cutoffFor(today, years) {
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y - years, m - 1, d)).toISOString().slice(0, 10);
}

export async function findOldRecords(settings) {
  const years = Number(settings.privacy && settings.privacy.retentionYears) || 0;
  const today = nowIn(settings.business.timezone).date;
  if (!years) return { years: 0, cutoff: '', clients: [], loose: [], targets: [] };
  const cutoff = cutoffFor(today, years);
  const { clients, appts } = await everything();
  const owners = ownerMap(clients, appts);
  const owned = new Set(owners.keys());
  const oldClients = [];
  const oldOwned = [];
  for (const c of clients) {
    const mine = appts.filter((a) => owners.get(a.id) === c.id);
    const last = mine.reduce((max, a) => (a.date > max ? a.date : max), String(c.createdAt || '').slice(0, 10));
    if (upcomingOf(mine, today).length || !last || last >= cutoff) continue;
    oldClients.push({ id: c.id, name: c.name, lastVisit: last, appointments: mine.length });
    oldOwned.push(...mine);
  }
  // An appointment filed under an old record but carrying the details of a client who is
  // still active (a family member booked under the wrong record, say) is kept.
  const oldIds = new Set(oldClients.map((c) => c.id));
  const kept = clients.filter((c) => !oldIds.has(c.id));
  const targets = oldOwned.filter((a) => !kept.some((k) => contactMatch(k, a)));
  // Appointments with personal details that belong to no client (walk-ins saved without a phone or email).
  const loose = appts.filter((a) => !owned.has(a.id) && !a.erasedAt && a.date < cutoff && (a.name || a.phone || a.email));
  targets.push(...loose);
  return { years, cutoff, clients: oldClients, loose, targets };
}

export function summary(found) {
  return {
    years: found.years,
    cutoff: found.cutoff,
    clients: found.clients,
    looseAppointments: found.loose.length,
    checkedAt: new Date().toISOString(),
  };
}

// The Today screen and Settings read this small note instead of scanning every month.
export async function saveCheck(found, lastErase) {
  const prev = (await readDoc('privacy-check', null)) || {};
  await writeDoc('privacy-check', {
    checkedAt: new Date().toISOString(),
    years: found.years,
    clients: found.clients.length,
    looseAppointments: found.loose.length,
    lastErase: lastErase || prev.lastErase || null,
  });
}

// Erases every record past the retention period. `auto` marks the monthly clean-up.
export async function eraseOld(settings, { auto = false } = {}) {
  const found = await findOldRecords(settings);
  if (!found.years) return { clients: 0, appointments: 0 };
  if (found.targets.length || found.clients.length) {
    await scrubAppointments(found.targets, `Erased after ${found.years} year${found.years === 1 ? '' : 's'} without a visit`);
    await removeClients(found.clients.map((c) => c.id));
  }
  const result = { clients: found.clients.length, appointments: found.targets.length };
  await saveCheck({ ...found, clients: [], loose: [] }, { at: new Date().toISOString(), auto, ...result });
  return result;
}
