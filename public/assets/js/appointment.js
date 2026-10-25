// A client's own appointment: view, add to calendar, cancel.
import { esc, formatDuration, formatTime, money, smsHref } from './render.js';
import { googleCalendarUrl, icsFile, longDate } from './dates.js';

const $ = (sel, el = document) => el.querySelector(sel);
const params = new URLSearchParams(location.search);
const ids = { id: params.get('id') || '', t: params.get('t') || '', m: params.get('m') || '' };

const STATUS = {
  pending: 'Waiting for confirmation',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  declined: 'Not available',
  'no-show': 'Missed',
};

let current = null;

function notice(msg) {
  const el = $('[data-notice]');
  el.hidden = !msg;
  el.textContent = msg || '';
}

function render(data) {
  const { appointment: a, studio } = data;
  current = data;
  $('[data-loading]').hidden = true;
  $('[data-view]').hidden = false;
  $('[data-title]').textContent = a.past ? 'Past appointment' : 'Your appointment';
  const chip = $('[data-chip]');
  chip.textContent = STATUS[a.status] || a.status;
  chip.dataset.status = a.status;
  $('[data-receipt]').innerHTML = `
    <div><dt>When</dt><dd>${esc(longDate(a.date))} at ${esc(formatTime(a.start))}</dd></div>
    <div><dt>Services</dt><dd>${a.services.map((s) => esc(s.name)).join(', ')}</dd></div>
    <div><dt>Time needed</dt><dd>About ${esc(formatDuration(a.duration))}</dd></div>
    <div><dt>Total</dt><dd>${money(a.total)}</dd></div>
    ${a.address ? `<div><dt>Where</dt><dd>${esc(a.address)}</dd></div>` : ''}`;

  const notes = [];
  if (a.status === 'pending') notes.push("I'll confirm by text or email soon. The studio address comes with your confirmation.");
  if (a.status === 'confirmed' && !a.past && !a.canCancel && studio.phone) {
    notes.push(`It's less than ${a.cancelNoticeHours} hours before your appointment, so please text me if your plans change.`);
  }
  if (a.status === 'cancelled') notes.push('This appointment is cancelled. You can book a new time anytime.');
  if (a.status === 'declined') notes.push("This time didn't work out. Please pick another time.");
  $('[data-note]').textContent = notes.join(' ');

  const actions = [];
  const active = a.status === 'pending' || a.status === 'confirmed';
  if (active && !a.past) {
    const title = `${studio.name}: ${a.services.map((s) => s.name).join(', ')}`;
    const details = `${a.services.map((s) => s.name).join(', ')}\n${location.href}`;
    const gcal = googleCalendarUrl({ title, startsAt: a.startsAt, minutes: a.duration, details, location: a.address });
    const ics = icsFile({ uid: `${a.id}@barebeauty`, title, startsAt: a.startsAt, minutes: a.duration, details, location: a.address });
    const icsUrl = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    actions.push(`<a class="btn btn-ghost-light" href="${esc(gcal)}" target="_blank" rel="noopener">Add to Google Calendar</a>`);
    actions.push(`<a class="btn btn-ghost-light" href="${icsUrl}" download="bare-beauty-appointment.ics">Add to Apple or Outlook calendar</a>`);
  }
  if (a.canCancel) actions.push('<button type="button" class="btn btn-espresso" data-cancel>Cancel appointment</button>');
  if (studio.phone) actions.push(`<a class="btn-text" href="${esc(smsHref(studio.phone))}">Text ${esc(studio.phone)}</a>`);
  if (!active || a.past) actions.push('<a class="btn btn-espresso" href="/book/">Book a new time</a>');
  $('[data-actions]').innerHTML = actions.join('');
}

async function load() {
  if (!ids.id || !ids.t) {
    $('[data-loading]').hidden = true;
    notice('This link is missing some details. Please use the link from your confirmation.');
    return;
  }
  try {
    const res = await fetch(`/api/appointment?${new URLSearchParams(ids)}`, { headers: { accept: 'application/json' } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'This appointment could not be loaded.');
    render(data);
  } catch (err) {
    $('[data-loading]').hidden = true;
    notice(err.message);
  }
}

document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-cancel]')) {
    $('[data-confirm]').hidden = false;
    $('[data-cancel-yes]').focus();
  }
  if (e.target.closest('[data-cancel-no]')) {
    $('[data-confirm]').hidden = true;
  }
  if (e.target.closest('[data-cancel-yes]')) {
    const btn = e.target.closest('[data-cancel-yes]');
    btn.disabled = true;
    btn.textContent = 'Cancelling...';
    try {
      const res = await fetch('/api/appointment/cancel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(ids),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The appointment could not be cancelled.');
      $('[data-confirm]').hidden = true;
      render({ ...current, appointment: data.appointment });
      notice('');
      $('[data-title]').focus();
    } catch (err) {
      notice(err.message);
      btn.disabled = false;
      btn.textContent = 'Yes, cancel it';
    }
  }
});

load();
