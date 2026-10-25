// Date helpers for "YYYY-MM-DD" strings (studio wall-clock dates).
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function parts(date) {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d };
}

export function iso(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}

export function addDays(date, n) {
  const { y, m, d } = parts(date);
  return iso(y, m, d + n);
}

export function weekdayIndex(date) {
  const { y, m, d } = parts(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function longDate(date) {
  const { m, d } = parts(date);
  return `${DAYS[weekdayIndex(date)]}, ${MONTHS[m - 1]} ${d}`;
}

export function shortDate(date) {
  const { m, d } = parts(date);
  return `${DAYS_SHORT[weekdayIndex(date)]}, ${MONTHS[m - 1].slice(0, 3)} ${d}`;
}

export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

export function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// Calendar files and links for a booked appointment.
function stamp(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function googleCalendarUrl({ title, startsAt, minutes, details, location }) {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + minutes * 60000);
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: details || '',
    location: location || '',
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export function icsFile({ uid, title, startsAt, minutes, details, location }) {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + minutes * 60000);
  const esc = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bare Beauty by Ionee//Booking//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(details)}`,
    location ? `LOCATION:${esc(location)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}
