// Shared state and helpers for the studio panel.
import { esc, formatDuration, formatTime, money } from '/assets/js/render.js';
import { addDays, longDate, shortDate, weekdayIndex, MONTHS } from '/assets/js/dates.js';

export { esc, formatDuration, formatTime, money, addDays, longDate, shortDate, weekdayIndex, MONTHS };

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const TOKEN_KEY = 'bbi-studio-token';

export const S = {
  token: null,
  data: null,
  view: 'today',
  schedule: { date: null, mode: 'day', filter: 'upcoming', query: '' },
  clients: { query: '', filter: 'all', sort: 'recent' },
  settingsTab: 'business',
  menuDraft: null,
  settingsDraft: null,
  pulse: null,
};

// ---------- storage

export function loadToken() {
  try {
    S.token = localStorage.getItem(TOKEN_KEY);
  } catch {
    S.token = null;
  }
  return S.token;
}

export function saveToken(token) {
  S.token = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

// ---------- API

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data || {};
    this.code = this.data.code;
  }
}

let onAuthLost = () => {};
export function setAuthLostHandler(fn) {
  onAuthLost = fn;
}

export async function api(method, path, body, options = {}) {
  const headers = { accept: 'application/json' };
  if (S.token) headers.authorization = `Bearer ${S.token}`;
  let payload;
  if (body instanceof Blob || body instanceof ArrayBuffer) {
    payload = body;
    headers['content-type'] = options.contentType || 'application/octet-stream';
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['content-type'] = 'application/json';
  }
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload });
  } catch {
    throw new ApiError('No connection. Check your internet and try again.', 0);
  }
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (res.status === 401 && path !== '/admin/login') {
    onAuthLost();
    throw new ApiError(data.error || 'Please sign in again.', 401, data);
  }
  if (!res.ok) throw new ApiError(data.error || 'Something went wrong. Please try again.', res.status, data);
  return data;
}

// ---------- dates and time in the studio's time zone

export function tz() {
  return (S.data && S.data.settings.business.timezone) || 'America/New_York';
}

export function nowParts() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}

export const today = () => nowParts().date;

export function toMin(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

export function fromMin(min) {
  const m = Math.max(0, Math.min(1439, Math.round(min)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function endTime(a) {
  return fromMin(toMin(a.start) + Number(a.duration || 0));
}

export function timeRange(a) {
  return `${formatTime(a.start)} to ${formatTime(endTime(a))}`;
}

export function daysBetween(a, b) {
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}

export function relativeDay(date) {
  const diff = daysBetween(today(), date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return shortDate(date);
}

export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ---------- data helpers

export const ACTIVE = ['pending', 'confirmed'];
export const STATUS_LABEL = {
  pending: 'Request',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  declined: 'Declined',
  'no-show': 'No-show',
};

export function statusChip(status) {
  return `<span class="chip chip-${esc(status)}">${esc(STATUS_LABEL[status] || status)}</span>`;
}

export function appts() {
  return S.data ? S.data.appointments : [];
}

export function sortAppts(list, dir = 1) {
  return [...list].sort((a, b) => dir * (a.date.localeCompare(b.date) || a.start.localeCompare(b.start)));
}

export function upsertAppt(appt) {
  const list = S.data.appointments;
  const i = list.findIndex((a) => a.id === appt.id);
  if (i >= 0) list[i] = appt;
  else list.push(appt);
}

export function removeAppt(id) {
  S.data.appointments = S.data.appointments.filter((a) => a.id !== id);
}

export function allServices() {
  const out = [];
  for (const c of S.data.services.categories) {
    for (const s of c.services) out.push({ ...s, categoryName: c.name, groupName: c.group || c.name });
  }
  return out;
}

export function serviceById(id) {
  return allServices().find((s) => s.id === id);
}

export function phoneDigits(v) {
  const d = String(v || '').replace(/\D/g, '');
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
}

export function formatPhone(v) {
  const d = phoneDigits(v);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return v || '';
}

export function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

// Same person? When both have a phone number, the phone decides, so two people who
// share an email stay separate. Same rule as the server.
export function contactMatch(client, contact) {
  const a = phoneDigits(client.phone);
  const b = phoneDigits(contact.phone);
  if (a.length >= 10 && b.length >= 10) return a === b;
  const e1 = String(client.email || '').toLowerCase();
  const e2 = String(contact.email || '').toLowerCase();
  return Boolean(e1 && e2 && e1 === e2);
}

// Appointments that belong to a client. Each appointment has one owner: the client it's
// linked to, or for older and walk-in appointments, the first client whose details match.
export function clientAppts(client) {
  const ids = new Set(S.data.clients.map((c) => c.id));
  return appts().filter((a) => {
    if (a.clientId && ids.has(a.clientId)) return a.clientId === client.id;
    if (a.erasedAt || !contactMatch(client, a)) return false;
    return S.data.clients.find((x) => contactMatch(x, a)) === client;
  });
}

export function clientStats(client) {
  const list = sortAppts(clientAppts(client));
  const done = list.filter((a) => a.status === 'completed');
  const t = today();
  const upcoming = list.filter((a) => ACTIVE.includes(a.status) && a.date >= t);
  return {
    list,
    visits: done.length,
    spent: done.reduce((s, a) => s + (Number(a.total) || 0), 0),
    last: done.length ? done[done.length - 1] : null,
    next: upcoming[0] || null,
    noShows: list.filter((a) => a.status === 'no-show').length,
  };
}

// Clients whose last service is due again (lash fills, facials, waxing...).
export function rebookDue() {
  const t = today();
  const out = [];
  for (const c of S.data.clients) {
    const st = clientStats(c);
    if (!st.last || st.next) continue;
    const days = Math.max(
      0,
      ...st.last.services.map((s) => {
        const live = serviceById(s.id);
        return Number(live ? live.rebookDays : 0) || 0;
      }),
    );
    if (!days) continue;
    const since = daysBetween(st.last.date, t);
    if (since >= days - 2 && since <= days + 45) out.push({ client: c, last: st.last, since, days });
  }
  return out.sort((a, b) => b.since - b.days - (a.since - a.days));
}

// ---------- open times (same rules as the server, but no notice window)

export function openSlots(date, duration, ignoreId) {
  const s = S.data.settings;
  const hours = s.hours[WEEKDAY_KEYS[weekdayIndex(date)]];
  if (!hours || !hours.open) return [];
  const open = toMin(hours.start);
  const close = toMin(hours.end);
  const step = Number(s.booking.step) || 30;
  const buffer = Number(s.booking.buffer) || 0;
  const busy = appts()
    .filter((a) => a.date === date && a.id !== ignoreId && ACTIVE.includes(a.status))
    .map((a) => [toMin(a.start), toMin(a.start) + Number(a.duration || 0) + buffer]);
  const off = S.data.blocks
    .filter((b) => date >= b.startDate && date <= (b.endDate || b.startDate))
    .map((b) => (b.allDay ? [0, 1440] : [toMin(b.start), toMin(b.end)]));
  const isToday = date === today();
  const nowMin = nowParts().min;
  const out = [];
  for (let t = open; t + duration <= close; t += step) {
    if (isToday && t < nowMin) continue;
    const end = t + duration;
    if (busy.some(([a, b]) => t < b && a < end + buffer)) continue;
    if (off.some(([a, b]) => t < b && a < end)) continue;
    out.push(fromMin(t));
  }
  return out;
}

export function blocksOn(date) {
  return S.data.blocks.filter((b) => date >= b.startDate && date <= (b.endDate || b.startDate));
}

// ---------- message templates

export function fillTemplate(template, { appt, client, service } = {}) {
  const s = S.data.settings;
  const name = (appt && appt.name) || (client && client.name) || '';
  const vars = {
    first: firstName(name),
    name,
    services: appt ? appt.services.map((x) => x.name).join(', ') : '',
    service: service || (appt && appt.services[0] ? appt.services[0].name : ''),
    date: appt ? longDate(appt.date) : '',
    time: appt ? formatTime(appt.start) : '',
    total: appt ? money(appt.total) : '',
    address: s.business.address ? `Address: ${s.business.address}.` : '',
    book: `${location.origin}/book/`,
    link: (appt && appt.manageUrl) || '',
    studio: s.business.name || 'Bare Beauty by Ionee',
    instagram: s.business.instagram || 'barebeautybyionee',
  };
  return String(template || '')
    .replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,!?])/g, '$1')
    .trim();
}

export function smsHref(phone, body) {
  const num = String(phone || '').replace(/[^\d+]/g, '');
  if (!num) return '';
  const apple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
  return `sms:${num}${body ? `${apple ? '&' : '?'}body=${encodeURIComponent(body)}` : ''}`;
}

export function telHref(phone) {
  const num = String(phone || '').replace(/[^\d+]/g, '');
  return num ? `tel:${num}` : '';
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {}
    ta.remove();
    return ok;
  }
}

// ---------- toast

let toastTimer;
export function toast(message, action) {
  const box = $('[data-toast]');
  box.innerHTML = `<p>${esc(message)}</p>${action ? `<a class="toast-action" href="${esc(action.href || '#')}" data-toast-action>${esc(action.label)}</a>` : ''}`;
  box.hidden = false;
  box.classList.remove('is-out');
  if (action && action.onClick) {
    $('[data-toast-action]', box).addEventListener('click', (e) => {
      if (!action.href) e.preventDefault();
      action.onClick();
      box.hidden = true;
    });
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    box.hidden = true;
  }, action ? 9000 : 4500);
}

// ---------- sheets (side panel on desktop, bottom sheet on phones)

let sheetCleanup = null;
let lastFocus = null;
let sheetHandlers = {};

export function getSheetHandlers() {
  return sheetHandlers;
}

// handlers: { click(e, sheet), input(e, sheet), change(e, sheet), submit(e, sheet) }
export function openSheet(html, { wide = false, onClose, handlers = {} } = {}) {
  const root = $('[data-sheet-root]');
  const sheet = $('[data-sheet]');
  if (root.hidden) lastFocus = document.activeElement;
  sheet.classList.toggle('is-wide', wide);
  sheet.innerHTML = html;
  sheet.scrollTop = 0;
  const title = $('.sheet-title', sheet);
  if (title) {
    title.id = 'sheet-title';
    sheet.setAttribute('aria-labelledby', 'sheet-title');
  } else {
    sheet.removeAttribute('aria-labelledby');
  }
  root.hidden = false;
  document.body.classList.add('sheet-open');
  sheetCleanup = onClose || null;
  sheetHandlers = handlers;
  requestAnimationFrame(() => {
    const focusable = $('[data-autofocus]', sheet) || $('.sheet-title', sheet);
    if (focusable) focusable.focus();
  });
  return sheet;
}

export function closeSheet() {
  const root = $('[data-sheet-root]');
  if (root.hidden) return;
  root.hidden = true;
  $('[data-sheet]').innerHTML = '';
  document.body.classList.remove('sheet-open');
  const fn = sheetCleanup;
  sheetCleanup = null;
  sheetHandlers = {};
  if (fn) fn();
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}

export function sheetOpen() {
  return !$('[data-sheet-root]').hidden;
}

export function sheetHead(title, sub = '') {
  return `<div class="sheet-head">
    <div><h2 class="sheet-title" tabindex="-1">${title}</h2>${sub ? `<p class="sheet-sub">${sub}</p>` : ''}</div>
    <button type="button" class="icon-btn" data-close-sheet aria-label="Close">${icon('close')}</button>
  </div>`;
}

// Inline confirm inside the current sheet or page, never a browser dialog.
export function confirmInline(container, message, { yes = 'Yes', no = 'Keep it', danger = false } = {}) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'confirm-inline';
    box.innerHTML = `<p>${esc(message)}</p><div class="row-actions"><button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(yes)}</button><button type="button" class="btn btn-quiet" data-no>${esc(no)}</button></div>`;
    container.appendChild(box);
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    $('[data-yes]', box).focus();
    box.addEventListener('click', (e) => {
      if (e.target.closest('[data-yes]')) {
        box.remove();
        resolve(true);
      } else if (e.target.closest('[data-no]')) {
        box.remove();
        resolve(false);
      }
    });
  });
}

// ---------- icons (simple line icons, drawn here)

const ICONS = {
  today: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2.5"/>',
  schedule: '<rect x="4" y="5" width="16" height="15" rx="1.5"/><path d="M4 9.5h16M9 3v4M15 3v4"/>',
  clients: '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="8" r="2.4"/><path d="M15.5 13.2c2.4-.3 4.4 1.2 5 4.3"/>',
  menu: '<path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  left: '<path d="M14.5 6l-6 6 6 6"/>',
  right: '<path d="M9.5 6l6 6-6 6"/>',
  up: '<path d="M6 14.5l6-6 6 6"/>',
  down: '<path d="M6 9.5l6 6 6-6"/>',
  text: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z"/>',
  call: '<path d="M6.5 4h3l1.5 4-2 1.3a10 10 0 0 0 5.7 5.7L16 13l4 1.5v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4z"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><path d="M4 7l8 6 8-6"/>',
  insta: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="12" cy="12" r="3.6"/><circle cx="17" cy="7" r=".8" fill="currentColor"/>',
  copy: '<rect x="8" y="8" width="11" height="12" rx="1.5"/><path d="M5 15V5.5A1.5 1.5 0 0 1 6.5 4H15"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>',
  edit: '<path d="M5 19l1-4L16 5l3 3L9 18z"/><path d="M14 7l3 3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  refresh: '<path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M19 4.5V8h-3.5"/>',
  download: '<path d="M12 4.5v10.5"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19h14"/>',
  out: '<path d="M10 5H6a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 6 19h4"/><path d="M14 8l4 4-4 4M18 12H9"/>',
  site: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  photo: '<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><circle cx="9" cy="10" r="1.8"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/>',
  block: '<circle cx="12" cy="12" r="8"/><path d="M6.5 6.5l11 11"/>',
};

export function icon(name, size = 20) {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// ---------- CSV

export function toCsv(rows) {
  const escCell = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(escCell).join(',')).join('\n');
}

export function download(filename, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
