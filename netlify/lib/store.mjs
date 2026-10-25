// Data lives in one Netlify Blobs store, as a few JSON documents:
//   settings, services, clients, blocks, media, auth
//   appts/YYYY-MM   one document per month of appointments
//   media-file/<id> uploaded photos
// Writes use ETags (onlyIfMatch / onlyIfNew) so two bookings at the same
// moment can never overwrite each other.
import { getStore } from '@netlify/blobs';
import { DEFAULT_SETTINGS, DEFAULT_SERVICES } from './defaults.mjs';
import { HttpError, sleep } from './util.mjs';
import { addMonths } from './time.mjs';

const STORE_NAME = 'bare-beauty';

let cached;
export function store() {
  if (!cached) cached = getStore({ name: STORE_NAME, consistency: 'strong' });
  return cached;
}

const clone = (v) => JSON.parse(JSON.stringify(v));

export async function readDoc(key, fallback) {
  const data = await store().get(key, { type: 'json' });
  return data ?? clone(fallback);
}

export async function writeDoc(key, data) {
  await store().setJSON(key, data);
  return data;
}

async function listedEtag(s, key) {
  try {
    const { blobs } = await s.list({ prefix: key });
    const hit = blobs.find((b) => b.key === key);
    return hit ? hit.etag : undefined;
  } catch {
    return undefined;
  }
}

// Read, change, write back only if nobody else wrote in between. Retries on a race.
// `verify` re-reads after the write and confirms the change stuck; if it did not,
// the whole change runs again. Changes must be safe to repeat (check before you add).
export async function mutateDoc(key, fallback, change, options = {}) {
  const { verify, tries = 10 } = options;
  const s = store();
  for (let attempt = 0; attempt < tries; attempt++) {
    let current = await s.getWithMetadata(key, { type: 'json' });
    let etag = current ? current.etag : undefined;
    if (current && !etag) {
      // Some environments (the local dev sandbox) leave the ETag off reads.
      // Take it from a listing first, then read again, so a write in between still fails the check.
      etag = await listedEtag(s, key);
      current = await s.getWithMetadata(key, { type: 'json' });
    }
    const exists = Boolean(current && current.data != null);
    const data = exists ? current.data : clone(fallback);
    const result = await change(data);
    let write;
    if (!exists) write = await s.setJSON(key, data, { onlyIfNew: true });
    else if (etag) write = await s.setJSON(key, data, { onlyIfMatch: etag });
    else write = await s.setJSON(key, data);
    if (write.modified) {
      if (!verify) return { data, result };
      const check = await s.get(key, { type: 'json' });
      if (check && verify(check, result)) return { data: check, result };
    }
    await sleep(25 * (attempt + 1) + Math.random() * 80);
  }
  throw new HttpError(409, 'The studio calendar is busy right now. Please try again.');
}

// ---- settings and services (merged over defaults so new fields always exist)

function mergeDeep(base, over) {
  if (Array.isArray(base) || Array.isArray(over)) return over === undefined ? base : over;
  if (base && typeof base === 'object') {
    const out = { ...base };
    for (const k of Object.keys(over || {})) out[k] = mergeDeep(base[k], over[k]);
    return out;
  }
  return over === undefined ? base : over;
}

export async function getSettings() {
  const saved = await store().get('settings', { type: 'json' });
  return mergeDeep(clone(DEFAULT_SETTINGS), saved || {});
}

export async function getServices() {
  const saved = await store().get('services', { type: 'json' });
  return saved && Array.isArray(saved.categories) ? saved : clone(DEFAULT_SERVICES);
}

export function flatServices(services) {
  const out = [];
  for (const cat of services.categories || []) {
    for (const s of cat.services || []) out.push({ ...s, categoryId: cat.id, categoryName: cat.name });
  }
  return out;
}

// ---- appointments, sharded by month

export const apptKey = (ym) => `appts/${ym}`;

export async function monthKeys() {
  const { blobs } = await store().list({ prefix: 'appts/' });
  return blobs
    .map((b) => b.key.slice('appts/'.length))
    .filter((k) => /^\d{4}-\d{2}$/.test(k))
    .sort();
}

export async function readMonth(ym) {
  const doc = await store().get(apptKey(ym), { type: 'json' });
  return doc && Array.isArray(doc.items) ? doc.items : [];
}

export async function readMonths(yms) {
  const lists = await Promise.all(yms.map((ym) => readMonth(ym)));
  return dedupe(lists.flat());
}

export function dedupe(items) {
  const byId = new Map();
  for (const a of items) {
    const prev = byId.get(a.id);
    if (!prev || String(a.updatedAt || '') > String(prev.updatedAt || '')) byId.set(a.id, a);
  }
  return [...byId.values()];
}

export function monthsBetween(fromYm, toYm) {
  const out = [];
  let ym = fromYm;
  let guard = 0;
  while (ym <= toYm && guard++ < 240) {
    out.push(ym);
    ym = addMonths(ym, 1);
  }
  return out;
}

export async function mutateMonth(ym, change, verify) {
  return mutateDoc(
    apptKey(ym),
    { items: [] },
    async (doc) => {
      if (!Array.isArray(doc.items)) doc.items = [];
      return change(doc.items, doc);
    },
    verify ? { verify: (doc, result) => verify(Array.isArray(doc.items) ? doc.items : [], result) } : {},
  );
}

// Find an appointment by id. Tries the hinted month first, then every month.
export async function findAppointment(id, hintYm) {
  if (hintYm && /^\d{4}-\d{2}$/.test(hintYm)) {
    const items = await readMonth(hintYm);
    const hit = items.find((a) => a.id === id);
    if (hit) return { appt: hit, ym: hintYm };
  }
  const keys = await monthKeys();
  for (const ym of keys.reverse()) {
    if (ym === hintYm) continue;
    const items = await readMonth(ym);
    const hit = items.find((a) => a.id === id);
    if (hit) return { appt: hit, ym };
  }
  return null;
}

// ---- small documents

export const getClients = () => readDoc('clients', { items: [] });
export const getBlocks = () => readDoc('blocks', { items: [] });
export const getMedia = () => readDoc('media', { items: [] });
