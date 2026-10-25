// Works out which start times are open on a given day.
import { ACTIVE_STATUSES } from './defaults.mjs';
import { addDays, daysBetween, fromMin, isTime, nowIn, toMin, weekday } from './time.mjs';

// Busy intervals for a date, in minutes from midnight.
// Appointments carry the cleanup buffer after them; time off does not.
export function busyIntervals(date, appointments, blocks, buffer, ignoreId) {
  const appts = [];
  const off = [];
  for (const a of appointments) {
    if (a.date !== date || a.id === ignoreId || !ACTIVE_STATUSES.includes(a.status)) continue;
    const s = toMin(a.start);
    appts.push([s, s + Number(a.duration || 0) + buffer]);
  }
  for (const b of blocks) {
    if (date < b.startDate || date > (b.endDate || b.startDate)) continue;
    // Timed blocks repeat on every day of their range. A block with unreadable times
    // (from a hand-edited backup, say) closes the whole day rather than nothing.
    off.push(wholeDay(b) ? [0, 24 * 60] : [toMin(b.start), toMin(b.end)]);
  }
  return { appts, off };
}

const wholeDay = (b) => b.allDay || !isTime(b.start) || !isTime(b.end) || toMin(b.end) <= toMin(b.start);

export function bookingWindow(settings, at = new Date()) {
  const tz = settings.business.timezone || 'America/New_York';
  const now = nowIn(tz, at);
  // Notice is counted in real hours, so a daylight saving change never shortens it.
  const noticeMs = Math.max(0, Number(settings.booking.minNoticeHours) || 0) * 3600000;
  const earliest = nowIn(tz, new Date(at.getTime() + noticeMs));
  const lastDate = addDays(now.date, Math.max(1, Number(settings.booking.maxDaysAhead) || 60));
  return { tz, now, earliest, lastDate };
}

// Open start times ("HH:MM") for one date and a total duration.
export function slotsForDate(date, duration, ctx) {
  const { settings, appointments, blocks, window, ignoreId } = ctx;
  if (date < window.earliest.date || date > window.lastDate) return [];
  const hours = settings.hours[weekday(date)];
  if (!hours || !hours.open) return [];
  const open = toMin(hours.start);
  const close = toMin(hours.end);
  const step = Math.max(5, Number(settings.booking.step) || 30);
  const buffer = Math.max(0, Number(settings.booking.buffer) || 0);
  const busy = busyIntervals(date, appointments, blocks, buffer, ignoreId);
  const out = [];
  for (let t = open; t + duration <= close; t += step) {
    if (date === window.earliest.date && t < window.earliest.min) continue;
    const end = t + duration;
    const clash =
      busy.appts.some(([s, e]) => t < e && s < end + buffer) || busy.off.some(([s, e]) => t < e && s < end);
    if (!clash) out.push(fromMin(t));
  }
  return out;
}

export function slotsForRange(from, days, duration, ctx) {
  const result = {};
  const start = from < ctx.window.earliest.date ? ctx.window.earliest.date : from;
  const total = Math.min(days, Math.max(0, daysBetween(start, ctx.window.lastDate) + 1));
  for (let i = 0; i < total; i++) {
    const date = addDays(start, i);
    const slots = slotsForDate(date, duration, ctx);
    if (slots.length) result[date] = slots;
  }
  return result;
}

// Does [start, start+duration) clash with anything? Used for studio-side warnings.
export function conflictsFor(date, start, duration, ctx) {
  const buffer = Math.max(0, Number(ctx.settings.booking.buffer) || 0);
  const s0 = toMin(start);
  const e0 = s0 + duration;
  const clashes = [];
  for (const a of ctx.appointments) {
    if (a.date !== date || a.id === ctx.ignoreId || !ACTIVE_STATUSES.includes(a.status)) continue;
    const s = toMin(a.start);
    const e = s + Number(a.duration || 0);
    if (s0 < e + buffer && s < e0 + buffer) clashes.push({ type: 'appointment', id: a.id, name: a.name, start: a.start });
  }
  for (const b of ctx.blocks) {
    if (date < b.startDate || date > (b.endDate || b.startDate)) continue;
    if (wholeDay(b) || (s0 < toMin(b.end) && toMin(b.start) < e0)) clashes.push({ type: 'block', id: b.id, note: b.note || 'Time off' });
  }
  return clashes;
}
