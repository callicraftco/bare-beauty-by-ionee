// Calendar feed (iCalendar) so appointments show up in Ionee's phone calendar.
import { zonedToDate } from './time.mjs';

const pad = (n) => String(n).padStart(2, '0');

function stamp(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

// "Jasmine Reyes" becomes "Jasmine R."
function shortName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || 'Client';
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

function esc(value) {
  return String(value ?? '')
    .replace(/\r/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

// Lines longer than 75 octets must be folded.
function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const len = Buffer.byteLength(ch, 'utf8');
    if (size + len > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += len;
  }
  out.push(current);
  return out.join('\r\n ');
}

export function buildCalendar({ name, appointments, tz, host }) {
  const now = stamp(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bare Beauty by Ionee//Studio calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`,
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];
  for (const a of appointments) {
    const start = zonedToDate(a.date, a.start, tz);
    const end = new Date(start.getTime() + Number(a.duration || 0) * 60000);
    const pending = a.status === 'pending';
    const services = (a.services || []).map((s) => s.name).join(', ');
    // Calendar apps copy the feed to their own servers, so it carries only what's needed
    // to see the day: a first name with last initial, and the services. Phone numbers,
    // emails and notes stay in the studio panel.
    const desc = [services, pending ? 'Not confirmed yet.' : '', 'Details are in your studio panel.'].filter(Boolean).join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${a.id}@${host}`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${esc(`${pending ? 'Request: ' : ''}${shortName(a.name)} (${services})`)}`,
      `DESCRIPTION:${esc(desc)}`,
      `STATUS:${pending ? 'TENTATIVE' : 'CONFIRMED'}`,
      `LAST-MODIFIED:${stamp(new Date(a.updatedAt || a.createdAt || Date.now()))}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
