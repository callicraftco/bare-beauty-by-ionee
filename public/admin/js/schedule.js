// Schedule view, appointment details, the appointment form and time off.
import {
  $,
  $$,
  ACTIVE,
  S,
  addDays,
  allServices,
  api,
  appts,
  blocksOn,
  closeSheet,
  confirmInline,
  esc,
  fillTemplate,
  firstName,
  formatDuration,
  formatPhone,
  formatTime,
  icon,
  longDate,
  money,
  openSheet,
  openSlots,
  phoneDigits,
  relativeDay,
  removeAppt,
  sheetHead,
  shortDate,
  smsHref,
  sortAppts,
  statusChip,
  telHref,
  timeRange,
  toast,
  today,
  toMin,
  upsertAppt,
  weekdayIndex,
  WEEKDAY_KEYS,
  WEEKDAY_NAMES,
  copyText,
} from './core.js';

const rerender = () => window.dispatchEvent(new Event('studio:render'));

// ---------- shared row markup

export function apptRow(a, { showDate = false } = {}) {
  const active = ACTIVE.includes(a.status) || a.status === 'completed';
  return `<li><button type="button" class="appt${active ? '' : ' is-off'}" data-open-appt="${esc(a.id)}">
    <span class="appt-time">${showDate ? `${esc(shortDate(a.date))}<small>${esc(formatTime(a.start))}</small>` : `${esc(formatTime(a.start))}<small>to ${esc(formatTime(endOf(a)))}</small>`}</span>
    <span><span class="appt-name">${esc(a.name)}</span><span class="appt-services">${esc(a.services.map((s) => s.name).join(', '))}</span></span>
    <span class="appt-side">${statusChip(a.status)}<span class="appt-price">${money(a.total)}</span></span>
  </button></li>`;
}

function endOf(a) {
  const m = toMin(a.start) + Number(a.duration || 0);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function blockRow(b) {
  const when = b.allDay ? 'All day' : `${formatTime(b.start)}<small>to ${formatTime(b.end)}</small>`;
  const range = b.endDate && b.endDate !== b.startDate ? ` (${shortDate(b.startDate)} to ${shortDate(b.endDate)})` : '';
  return `<li class="block-row"><span class="appt-time">${when}</span><span>${icon('block', 16)} ${esc(b.note || 'Time off')}${esc(range)}</span><button type="button" class="link-btn" data-delete-block="${esc(b.id)}">Remove</button></li>`;
}

function hoursText(date) {
  const h = S.data.settings.hours[WEEKDAY_KEYS[weekdayIndex(date)]];
  if (!h || !h.open) return `Closed on ${WEEKDAY_NAMES[weekdayIndex(date)]}s`;
  return `Open ${formatTime(h.start)} to ${formatTime(h.end)}`;
}

// ---------- the view

function weekStart(date) {
  return addDays(date, -weekdayIndex(date));
}

function renderDay() {
  const s = S.schedule;
  const t = today();
  const start = weekStart(s.date);
  const pills = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const dayAppts = appts().filter((a) => a.date === d && ACTIVE.includes(a.status));
    const pending = dayAppts.filter((a) => a.status === 'pending').length;
    const h = S.data.settings.hours[WEEKDAY_KEYS[i]];
    const closed = !h || !h.open;
    const dots = dayAppts
      .slice(0, 5)
      .map((a) => `<span class="dot${a.status === 'pending' ? ' pending' : ''}"></span>`)
      .join('');
    pills.push(`<button type="button" class="day-pill${closed ? ' is-closed' : ''}${d === t ? ' is-today' : ''}" data-day="${d}" aria-pressed="${d === s.date}" aria-label="${esc(longDate(d))}, ${dayAppts.length} booked${pending ? `, ${pending} waiting` : ''}">
      <span class="dow">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i]}</span>
      <span class="dnum">${Number(d.slice(8))}</span>
      <span class="dots">${dots}</span>
    </button>`);
  }
  const list = sortAppts(appts().filter((a) => a.date === s.date));
  const live = list.filter((a) => a.status !== 'cancelled' && a.status !== 'declined');
  const gone = list.filter((a) => a.status === 'cancelled' || a.status === 'declined');
  const blocks = blocksOn(s.date);
  const items = [
    ...live.map((a) => ({ start: a.start, html: apptRow(a) })),
    ...blocks.map((b) => ({ start: b.allDay ? '00:00' : b.start, html: blockRow(b) })),
  ].sort((x, y) => x.start.localeCompare(y.start));
  const total = live.filter((a) => a.status !== 'no-show').reduce((sum, a) => sum + (Number(a.total) || 0), 0);
  const count = live.filter((a) => ACTIVE.includes(a.status) || a.status === 'completed').length;

  const upcomingBlocks = S.data.blocks.filter((b) => (b.endDate || b.startDate) >= t).sort((a, b) => a.startDate.localeCompare(b.startDate));

  return `
    <div class="week">
      <button type="button" class="icon-btn" data-week="-1" aria-label="Previous week">${icon('left')}</button>
      ${pills.join('')}
      <button type="button" class="icon-btn" data-week="1" aria-label="Next week">${icon('right')}</button>
    </div>
    <div class="day-head">
      <div>
        <h2 class="day-title">${esc(relativeDay(s.date) === shortDate(s.date) ? longDate(s.date) : `${relativeDay(s.date)}, ${longDate(s.date)}`)}</h2>
        <p class="page-sub">${esc(hoursText(s.date))}${count ? `. ${count} booked, ${money(total)}` : ''}</p>
      </div>
      <div class="row-actions">
        ${s.date !== t ? '<button type="button" class="btn btn-quiet btn-small" data-go-today>Today</button>' : ''}
        <button type="button" class="btn btn-quiet btn-small" data-new-block>Block time</button>
        <button type="button" class="btn btn-primary btn-small" data-new-appt-day>${icon('plus', 18)} Appointment</button>
      </div>
    </div>
    ${items.length ? `<ul class="appt-list">${items.map((x) => x.html).join('')}</ul>` : `<p class="empty">Nothing booked. ${openSlots(s.date, 60).length ? `Open from ${esc(formatTime(openSlots(s.date, 60)[0]))}.` : ''}</p>`}
    ${gone.length ? `<p class="group-label">Cancelled or declined</p><ul class="appt-list">${gone.map((a) => apptRow(a)).join('')}</ul>` : ''}
    <section class="section">
      <div class="section-head"><h3 class="section-title">Time off coming up</h3><button type="button" class="link-btn" data-new-block>Add time off</button></div>
      ${
        upcomingBlocks.length
          ? `<ul class="appt-list">${upcomingBlocks
              .map(
                (b) =>
                  `<li class="block-row"><span class="appt-time">${esc(shortDate(b.startDate))}</span><span>${esc(b.note || 'Time off')}${
                    b.endDate && b.endDate !== b.startDate ? ` to ${esc(shortDate(b.endDate))}` : ''
                  }${b.allDay ? '' : `, ${esc(formatTime(b.start))} to ${esc(formatTime(b.end))}`}</span><button type="button" class="link-btn" data-delete-block="${esc(b.id)}">Remove</button></li>`,
              )
              .join('')}</ul>`
          : '<p class="empty">No time off planned. Block a day or a few hours so clients can\'t book it.</p>'
      }
    </section>`;
}

const FILTERS = [
  ['pending', 'Requests'],
  ['upcoming', 'Upcoming'],
  ['past', 'Past'],
  ['cancelled', 'Cancelled'],
  ['all', 'All'],
];

function renderList() {
  const s = S.schedule;
  const t = today();
  const q = s.query.trim().toLowerCase();
  let list = appts();
  if (s.filter === 'pending') list = list.filter((a) => a.status === 'pending');
  if (s.filter === 'upcoming') list = list.filter((a) => a.date >= t && ACTIVE.includes(a.status));
  if (s.filter === 'past') list = list.filter((a) => a.date < t && !['cancelled', 'declined'].includes(a.status));
  if (s.filter === 'cancelled') list = list.filter((a) => ['cancelled', 'declined', 'no-show'].includes(a.status));
  if (q) {
    const qd = q.replace(/\D/g, '');
    list = list.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (qd.length >= 3 && phoneDigits(a.phone).includes(qd)) ||
        (a.email || '').toLowerCase().includes(q) ||
        a.services.some((x) => x.name.toLowerCase().includes(q)),
    );
  }
  const desc = s.filter === 'past' || s.filter === 'cancelled' || s.filter === 'all';
  list = sortAppts(list, desc ? -1 : 1);
  const groups = new Map();
  for (const a of list) {
    if (!groups.has(a.date)) groups.set(a.date, []);
    groups.get(a.date).push(a);
  }
  const body = list.length
    ? [...groups.entries()]
        .map(([date, items]) => `<p class="group-label">${esc(relativeDay(date) === shortDate(date) ? longDate(date) : `${relativeDay(date)}, ${longDate(date)}`)}</p><ul class="appt-list">${items.map((a) => apptRow(a)).join('')}</ul>`)
        .join('')
    : `<p class="empty">${q ? 'No matches.' : s.filter === 'pending' ? 'No requests waiting.' : 'Nothing here yet.'}</p>`;
  return `
    <div class="toolbar">
      <div class="filter-chips" role="group" aria-label="Show">${FILTERS.map(([k, l]) => `<button type="button" data-filter="${k}" aria-pressed="${s.filter === k}">${l}</button>`).join('')}</div>
      <label class="search"><span class="visually-hidden">Search appointments</span><input type="search" data-search placeholder="Search name, phone or service" value="${esc(s.query)}"></label>
    </div>
    ${body}
    ${S.data.olderMonths && S.data.olderMonths.length && (s.filter === 'past' || s.filter === 'all') ? '<p class="hint" style="margin-top:16px">Showing the last 12 months. Older visits are in your backup file (Settings, Backup).</p>' : ''}`;
}

function render(main) {
  const s = S.schedule;
  if (!s.date) s.date = today();
  main.innerHTML = `
    <div class="page-head">
      <div><h1 class="page-title">Schedule</h1></div>
      <div class="seg" role="group" aria-label="View">
        <button type="button" data-mode="day" aria-pressed="${s.mode === 'day'}">Day</button>
        <button type="button" data-mode="list" aria-pressed="${s.mode === 'list'}">List</button>
      </div>
    </div>
    ${s.mode === 'day' ? renderDay() : renderList()}`;
}

async function deleteBlock(id, container) {
  const ok = await confirmInline(container, 'Remove this time off? Those times open up for booking again.', { yes: 'Remove', no: 'Keep it' });
  if (!ok) return;
  try {
    await api('DELETE', `/admin/blocks/${id}`);
    S.data.blocks = S.data.blocks.filter((b) => b.id !== id);
    toast('Time off removed.');
    rerender();
  } catch (err) {
    toast(err.message);
  }
}

function click(e) {
  const s = S.schedule;
  const t = e.target;
  const open = t.closest('[data-open-appt]');
  if (open) return openAppointment(open.dataset.openAppt);
  const day = t.closest('[data-day]');
  if (day) {
    s.date = day.dataset.day;
    return rerender();
  }
  const week = t.closest('[data-week]');
  if (week) {
    s.date = addDays(s.date, 7 * Number(week.dataset.week));
    return rerender();
  }
  if (t.closest('[data-go-today]')) {
    s.date = today();
    return rerender();
  }
  const mode = t.closest('[data-mode]');
  if (mode) {
    s.mode = mode.dataset.mode;
    return rerender();
  }
  const filter = t.closest('[data-filter]');
  if (filter) {
    s.filter = filter.dataset.filter;
    return rerender();
  }
  if (t.closest('[data-new-appt-day]')) return openAppointmentForm({ date: s.date });
  if (t.closest('[data-new-block]')) return openBlockForm({ date: s.date });
  const del = t.closest('[data-delete-block]');
  if (del) return deleteBlock(del.dataset.deleteBlock, del.closest('section, .main') || $('[data-main]'));
}

let searchTimer;
function input(e) {
  if (e.target.matches('[data-search]')) {
    S.schedule.query = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const pos = e.target.selectionStart;
      rerender();
      const box = $('[data-search]');
      if (box) {
        box.focus();
        box.setSelectionRange(pos, pos);
      }
    }, 250);
  }
}

export default { render, click, input };

// ---------- appointment details

function contactButtons(a, smsBody) {
  const out = [];
  if (a.phone) {
    out.push(`<a href="${esc(smsHref(a.phone, smsBody))}">${icon('text', 18)} Text</a>`);
    out.push(`<a href="${esc(telHref(a.phone))}">${icon('call', 18)} Call</a>`);
  }
  if (a.email) out.push(`<a href="mailto:${esc(a.email)}">${icon('mail', 18)} Email</a>`);
  if (a.instagram) out.push(`<a href="https://www.instagram.com/${esc(encodeURIComponent(a.instagram))}/" target="_blank" rel="noopener">${icon('insta', 18)} @${esc(a.instagram)}</a>`);
  return out.join('');
}

function messageButtons(a) {
  const T = S.data.settings.templates;
  const items = [];
  if (a.status === 'confirmed' || a.status === 'pending') items.push(['confirm', 'Confirmation']);
  if (ACTIVE.includes(a.status) && a.date >= today()) items.push(['reminder', 'Reminder']);
  if (a.status === 'pending') items.push(['decline', 'Ask to pick another time']);
  if (a.status === 'completed') items.push(['thanks', 'Thank-you']);
  if (!a.phone) return '<p class="hint">Add a phone number to send texts.</p>';
  return `<div class="contact-actions">${items
    .map(([key, label]) => `<a href="${esc(smsHref(a.phone, fillTemplate(T[key], { appt: a })))}" data-sent="${key}">${icon('text', 18)} ${label}</a>`)
    .join('')}<button type="button" data-copy-reminder>${icon('copy', 18)} Copy reminder</button></div>
    ${a.remindedAt ? `<p class="hint" style="margin-top:8px">Reminder texted ${esc(relativeDay(a.remindedAt.slice(0, 10)).toLowerCase())}.</p>` : ''}`;
}

function primaryActions(a) {
  const b = [];
  if (a.status === 'pending') {
    b.push(`<button type="button" class="btn btn-primary" data-act="confirm">${icon('check', 18)} Confirm</button>`);
    b.push('<button type="button" class="btn btn-quiet" data-act="decline">Decline</button>');
  }
  if (a.status === 'confirmed') {
    b.push(`<button type="button" class="btn btn-primary" data-act="complete">${icon('check', 18)} Mark completed</button>`);
    b.push('<button type="button" class="btn btn-quiet" data-act="no-show">No-show</button>');
    b.push('<button type="button" class="btn btn-quiet" data-act="cancel">Cancel</button>');
  }
  if (['completed', 'no-show', 'cancelled', 'declined'].includes(a.status)) {
    b.push('<button type="button" class="btn btn-quiet" data-act="reopen">Reopen</button>');
  }
  return b.join('');
}

export function openAppointment(id) {
  const a = appts().find((x) => x.id === id);
  if (!a) return toast('That appointment is no longer here.');
  const mail = S.data.mail.enabled && a.email;
  const client = S.data.clients.find((c) => c.id === a.clientId);
  const html = `${sheetHead(esc(a.name), `${esc(relativeDay(a.date) === shortDate(a.date) ? longDate(a.date) : `${relativeDay(a.date)}, ${longDate(a.date)}`)}, ${esc(timeRange(a))}`)}
  <div class="sheet-body">
    <div class="chips">${statusChip(a.status)}${a.firstVisit ? '<span class="chip chip-soft">First visit</span>' : ''}<span class="chip chip-soft">${a.source === 'online' ? 'Booked online' : 'Added by you'}</span></div>
    ${primaryActions(a) ? `<div class="row-actions" data-actions>${primaryActions(a)}</div>` : ''}
    ${mail && ACTIVE.includes(a.status) ? `<label class="check-row"><input type="checkbox" data-notify checked> Email ${esc(firstName(a.name))} about changes I make here</label>` : ''}
    <section class="sheet-section">
      <h3>Visit</h3>
      <ul class="line-items">
        ${a.services.map((s) => `<li><span>${esc(s.name)}</span><span>${money(s.price)}</span></li>`).join('')}
        <li class="total"><span>Total, about ${esc(formatDuration(a.duration))}</span><span>${money(a.total)}</span></li>
      </ul>
    </section>
    <section class="sheet-section">
      <h3>Client</h3>
      <dl class="kv">
        <div><dt>Name</dt><dd>${client ? `<button type="button" class="link-btn" data-open-client="${esc(client.id)}">${esc(a.name)}</button>` : esc(a.name)}</dd></div>
        ${a.phone ? `<div><dt>Phone</dt><dd>${esc(formatPhone(a.phone))}</dd></div>` : ''}
        ${a.email ? `<div><dt>Email</dt><dd>${esc(a.email)}</dd></div>` : ''}
      </dl>
      <div class="contact-actions" style="margin-top:12px">${contactButtons(a, '')}</div>
      ${a.notes ? `<p class="note-box" style="margin-top:12px">${esc(a.notes)}</p>` : ''}
      ${client && client.notes ? `<p class="hint" style="margin-top:10px">Client notes: ${esc(client.notes)}</p>` : ''}
    </section>
    <section class="sheet-section">
      <h3>Text messages</h3>
      ${messageButtons(a)}
    </section>
    <section class="sheet-section">
      <h3>Your notes</h3>
      <div class="field"><label class="visually-hidden" for="staff-notes">Your notes</label><textarea id="staff-notes" data-staff-notes rows="3" placeholder="Only you see these">${esc(a.staffNotes || '')}</textarea></div>
      <div class="row-actions" style="margin-top:8px"><button type="button" class="btn btn-quiet btn-small" data-save-notes>Save notes</button></div>
    </section>
    <section class="sheet-section">
      <h3>History</h3>
      <ul class="log">${(a.log || [])
        .slice()
        .reverse()
        .map((l) => `<li>${esc(new Date(l.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}: ${esc(l.text)}</li>`)
        .join('')}</ul>
    </section>
    <div class="form-foot foot-static">
      <button type="button" class="btn btn-quiet" data-edit>${icon('edit', 18)} Change time or details</button>
      <button type="button" class="btn-danger-quiet btn" data-delete>Delete</button>
    </div>
  </div>`;
  openSheet(html, { handlers: { click: (e, sheet) => apptSheetClick(e, sheet, a.id) } });
}

async function runAction(a, action, sheet) {
  const notifyBox = $('[data-notify]', sheet);
  const notifyClient = Boolean(notifyBox && notifyBox.checked);
  const needsConfirm = { decline: 'Decline this request?', cancel: 'Cancel this appointment?', 'no-show': 'Mark as a no-show?' };
  if (needsConfirm[action]) {
    const ok = await confirmInline($('[data-actions]', sheet) || $('.sheet-body', sheet), needsConfirm[action], {
      yes: action === 'decline' ? 'Decline' : action === 'cancel' ? 'Cancel appointment' : 'Mark no-show',
      no: 'Go back',
      danger: action !== 'no-show',
    });
    if (!ok) return;
  }
  await patchAppt(a, { action, notifyClient }, sheet);
}

async function patchAppt(a, body, sheet, { force = false } = {}) {
  try {
    const res = await api('PATCH', `/admin/appointments/${a.id}`, { ...body, month: a.date.slice(0, 7), force });
    upsertAppt(res.appointment);
    afterAction(res.appointment, body.action);
  } catch (err) {
    if (err.code === 'conflict') {
      const ok = await confirmInline($('.sheet-body', sheet), `${err.message} Do it anyway?`, { yes: 'Yes, overlap is fine', no: 'Go back' });
      if (ok) return patchAppt(a, body, sheet, { force: true });
      return;
    }
    toast(err.message);
  }
}

function afterAction(a, action) {
  const T = S.data.settings.templates;
  const first = firstName(a.name);
  rerender();
  openAppointment(a.id);
  const textAction = (key, label) => (a.phone ? { label, href: smsHref(a.phone, fillTemplate(T[key], { appt: a })), onClick: () => {} } : null);
  if (action === 'confirm') toast('Confirmed.', textAction('confirm', `Text ${first}`));
  else if (action === 'decline') toast('Declined. The time is open again.', textAction('decline', `Text ${first}`));
  else if (action === 'complete') toast('Marked completed.', textAction('thanks', 'Send a thank-you'));
  else if (action === 'cancel') toast('Cancelled. The time is open again.');
  else if (action === 'no-show') toast('Marked as a no-show.');
  else if (action === 'reopen') toast('Reopened and confirmed.');
  else toast('Saved.');
}

async function apptSheetClick(e, sheet, id) {
  const a = appts().find((x) => x.id === id);
  if (!a) return;
  const act = e.target.closest('[data-act]');
  if (act) return runAction(a, act.dataset.act, sheet);
  if (e.target.closest('[data-edit]')) return openAppointmentForm({ appt: a });
  const openClient = e.target.closest('[data-open-client]');
  if (openClient) {
    const mod = await import('./clients.js');
    return mod.openClient(openClient.dataset.openClient);
  }
  if (e.target.closest('[data-save-notes]')) {
    try {
      const res = await api('PATCH', `/admin/appointments/${a.id}`, { staffNotes: $('[data-staff-notes]', sheet).value, month: a.date.slice(0, 7) });
      upsertAppt(res.appointment);
      toast('Notes saved.');
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  if (e.target.closest('[data-copy-reminder]')) {
    const ok = await copyText(fillTemplate(S.data.settings.templates.reminder, { appt: a }));
    toast(ok ? 'Reminder copied. Paste it into Instagram or anywhere.' : 'Could not copy on this device.');
    return;
  }
  const sent = e.target.closest('[data-sent]');
  if (sent && (sent.dataset.sent === 'reminder' || sent.dataset.sent === 'thanks')) {
    // Remember that a text went out; the link itself opens Messages.
    const flag = sent.dataset.sent === 'reminder' ? { reminded: true } : { thanked: true };
    api('PATCH', `/admin/appointments/${a.id}`, { ...flag, month: a.date.slice(0, 7) })
      .then((res) => upsertAppt(res.appointment))
      .catch(() => {});
    return;
  }
  if (e.target.closest('[data-delete]')) {
    const ok = await confirmInline($('.form-foot', sheet), 'Delete this appointment for good? Use Cancel instead if you want to keep a record.', {
      yes: 'Delete',
      no: 'Keep it',
      danger: true,
    });
    if (!ok) return;
    try {
      await api('DELETE', `/admin/appointments/${a.id}?month=${a.date.slice(0, 7)}`);
      removeAppt(a.id);
      closeSheet();
      rerender();
      toast('Appointment deleted.');
    } catch (err) {
      toast(err.message);
    }
  }
}

// ---------- new and edit appointment

function servicePicker(selected) {
  const blocks = [];
  for (const c of S.data.services.categories) {
    const label = c.group && c.group !== c.name ? `${c.group}: ${c.name}` : c.name;
    blocks.push(
      `<div class="grp">${esc(label)}</div>${c.services
        .map(
          (s) =>
            `<label><input type="checkbox" value="${esc(s.id)}" ${selected.includes(s.id) ? 'checked' : ''} data-svc><span>${esc(s.name)} <span class="hint">${esc(formatDuration(s.duration))}</span></span><span>${money(s.price)}</span></label>`,
        )
        .join('')}`,
    );
  }
  return `<div class="svc-picker" role="group" aria-label="Services">${blocks.join('')}</div>`;
}

function readPicked(sheet) {
  return $$('[data-svc]:checked', sheet).map((i) => i.value);
}

function pickedTotals(ids) {
  const list = ids.map((id) => allServices().find((s) => s.id === id)).filter(Boolean);
  return { minutes: list.reduce((s, x) => s + (Number(x.duration) || 0), 0), price: list.reduce((s, x) => s + (Number(x.price) || 0), 0) };
}

export function openAppointmentForm({ appt = null, date = null, start = '', client = null } = {}) {
  const editing = Boolean(appt);
  const f = {
    name: appt ? appt.name : client ? client.name : '',
    phone: appt ? appt.phone : client ? client.phone : '',
    email: appt ? appt.email : client ? client.email : '',
    instagram: appt ? appt.instagram : client ? client.instagram : '',
    clientId: appt ? appt.clientId : client ? client.id : '',
    services: appt ? appt.services.map((s) => s.id) : [],
    date: appt ? appt.date : date || today(),
    start: appt ? appt.start : start,
    duration: appt ? appt.duration : '',
    total: appt ? appt.total : '',
    notes: appt ? appt.notes || '' : '',
    staffNotes: appt ? appt.staffNotes || '' : '',
  };
  const manual = { duration: editing, total: editing };
  const missing = appt ? appt.services.filter((s) => !allServices().some((x) => x.id === s.id)) : [];
  const mail = S.data.mail.enabled;

  const html = `${sheetHead(editing ? 'Change appointment' : 'New appointment', editing ? esc(appt.name) : 'For walk-ins, texts and DMs')}
  <form class="sheet-body form" data-appt-form novalidate>
    <fieldset class="field">
      <legend>Client</legend>
      ${editing ? '' : `<div class="field"><label for="client-find" class="visually-hidden">Find a client</label><input id="client-find" type="search" data-client-find placeholder="Search your clients, or type a new one below" autocomplete="off" data-autofocus><ul class="suggest-list" data-client-suggest hidden></ul></div>`}
      <div class="form-grid">
        <div class="field"><label for="ap-name">Name</label><input id="ap-name" name="name" value="${esc(f.name)}" required maxlength="80"></div>
        <div class="field"><label for="ap-phone">Phone</label><input id="ap-phone" name="phone" type="tel" value="${esc(f.phone)}" maxlength="30"></div>
        <div class="field"><label for="ap-email">Email</label><input id="ap-email" name="email" type="email" value="${esc(f.email)}" maxlength="160"></div>
        <div class="field"><label for="ap-ig">Instagram</label><input id="ap-ig" name="instagram" value="${esc(f.instagram)}" maxlength="60"></div>
      </div>
      <input type="hidden" name="clientId" value="${esc(f.clientId)}">
    </fieldset>
    <div class="field">
      <span class="label">Services</span>
      ${servicePicker(f.services)}
      ${missing.length ? `<p class="hint">Also on this visit, no longer on your menu: ${esc(missing.map((s) => s.name).join(', '))}. They stay unless you change the services.</p>` : ''}
    </div>
    <div class="form-grid">
      <div class="field"><label for="ap-date">Day</label><input id="ap-date" name="date" type="date" value="${esc(f.date)}" required></div>
      <div class="field"><label for="ap-start">Start time</label><input id="ap-start" name="start" type="time" step="300" value="${esc(f.start)}" required></div>
    </div>
    <div class="field">
      <span class="label">Open times that day</span>
      <div class="slot-suggest" data-slots></div>
    </div>
    <div class="form-grid">
      <div class="field"><label for="ap-duration">Length (minutes)</label><input id="ap-duration" name="duration" type="number" min="5" max="720" step="5" value="${esc(f.duration)}" inputmode="numeric"></div>
      <div class="field"><label for="ap-total">Price ($)</label><input id="ap-total" name="total" type="number" min="0" step="1" value="${esc(f.total)}" inputmode="decimal"></div>
    </div>
    ${
      editing
        ? ''
        : `<div class="field"><label for="ap-status">Status</label><select id="ap-status" name="status"><option value="confirmed">Confirmed</option><option value="pending">Request, I'll confirm later</option></select></div>`
    }
    <div class="field"><label for="ap-notes">Client's notes</label><textarea id="ap-notes" name="notes" rows="2" maxlength="800">${esc(f.notes)}</textarea></div>
    <div class="field"><label for="ap-staff">Your notes</label><textarea id="ap-staff" name="staffNotes" rows="2" maxlength="2000" placeholder="Only you see these">${esc(f.staffNotes)}</textarea></div>
    ${mail ? `<label class="check-row"><input type="checkbox" name="notifyClient" ${editing ? '' : 'checked'}> ${editing ? 'Email the client if the time changes' : 'Email the client a confirmation'} (needs an email above)</label>` : ''}
    <div data-form-msg></div>
    <div class="form-foot">
      <button type="submit" class="btn btn-primary">${editing ? 'Save changes' : 'Add appointment'}</button>
      <button type="button" class="btn btn-quiet" data-close-sheet>Cancel</button>
    </div>
  </form>`;

  const sheet = openSheet(html, {
    wide: true,
    handlers: {
      input: (e, sh) => formInput(e, sh, manual),
      change: (e, sh) => formInput(e, sh, manual),
      click: (e, sh) => formClick(e, sh),
      submit: (e, sh) => {
        e.preventDefault();
        submitAppt(sh, appt, manual);
      },
    },
  });
  if (!editing) syncTotals(sheet, manual);
  renderSlots(sheet, appt);
}

function syncTotals(sheet, manual) {
  const t = pickedTotals(readPicked(sheet));
  if (!manual.duration) $('#ap-duration', sheet).value = t.minutes || '';
  if (!manual.total) $('#ap-total', sheet).value = t.price || '';
}

function renderSlots(sheet, appt) {
  const date = $('#ap-date', sheet).value;
  const dur = Number($('#ap-duration', sheet).value) || pickedTotals(readPicked(sheet)).minutes || 30;
  const box = $('[data-slots]', sheet);
  if (!date) {
    box.innerHTML = '<p class="hint">Pick a day.</p>';
    return;
  }
  const slots = openSlots(date, dur, appt ? appt.id : undefined);
  const current = $('#ap-start', sheet).value;
  const blocks = blocksOn(date);
  const h = S.data.settings.hours[WEEKDAY_KEYS[weekdayIndex(date)]];
  let note = '';
  if (!h || !h.open) note = `You're normally closed on ${WEEKDAY_NAMES[weekdayIndex(date)]}s. You can still type any time.`;
  else if (blocks.some((b) => b.allDay)) note = 'This day is blocked as time off. You can still type any time.';
  box.innerHTML = slots.length
    ? slots.map((t) => `<button type="button" data-slot="${t}" aria-pressed="${t === current}">${esc(formatTime(t))}</button>`).join('')
    : `<p class="hint">${note || 'No open times left that day for this length. You can still type any time.'}</p>`;
}

let findTimer;
function formInput(e, sheet, manual) {
  const t = e.target;
  if (t.matches('[data-svc]')) {
    syncTotals(sheet, manual);
    renderSlots(sheet);
  }
  if (t.id === 'ap-duration') {
    manual.duration = t.value !== '';
    renderSlots(sheet);
  }
  if (t.id === 'ap-total') manual.total = t.value !== '';
  if (t.id === 'ap-date') renderSlots(sheet);
  if (t.id === 'ap-start') $$('[data-slot]', sheet).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.slot === t.value)));
  if (t.matches('[data-client-find]')) {
    clearTimeout(findTimer);
    findTimer = setTimeout(() => showClientSuggestions(sheet, t.value), 150);
  }
  if (['ap-name', 'ap-phone', 'ap-email'].includes(t.id) && e.type === 'input') {
    // Typing new details unlinks a picked client.
    const hidden = $('[name="clientId"]', sheet);
    if (hidden.value && t.dataset.filled === '1') hidden.value = '';
  }
}

function showClientSuggestions(sheet, q) {
  const box = $('[data-client-suggest]', sheet);
  const query = q.trim().toLowerCase();
  if (query.length < 2) {
    box.hidden = true;
    return;
  }
  const qd = query.replace(/\D/g, '');
  const matches = S.data.clients
    .filter((c) => c.name.toLowerCase().includes(query) || (qd.length >= 3 && phoneDigits(c.phone).includes(qd)) || (c.email || '').toLowerCase().includes(query))
    .slice(0, 6);
  box.innerHTML = matches.length
    ? matches.map((c) => `<li><button type="button" data-pick-client="${esc(c.id)}">${esc(c.name)} <span class="hint">${esc(formatPhone(c.phone) || c.email || '')}</span></button></li>`).join('')
    : '<li><p class="hint" style="padding:9px 12px">No match. Fill in the details below for a new client.</p></li>';
  box.hidden = false;
}

function formClick(e, sheet) {
  const slot = e.target.closest('[data-slot]');
  if (slot) {
    $('#ap-start', sheet).value = slot.dataset.slot;
    $$('[data-slot]', sheet).forEach((b) => b.setAttribute('aria-pressed', String(b === slot)));
    return;
  }
  const pick = e.target.closest('[data-pick-client]');
  if (pick) {
    const c = S.data.clients.find((x) => x.id === pick.dataset.pickClient);
    if (!c) return;
    $('#ap-name', sheet).value = c.name;
    $('#ap-phone', sheet).value = c.phone || '';
    $('#ap-email', sheet).value = c.email || '';
    $('#ap-ig', sheet).value = c.instagram || '';
    $('[name="clientId"]', sheet).value = c.id;
    ['#ap-name', '#ap-phone', '#ap-email'].forEach((sel) => {
      $(sel, sheet).dataset.filled = '1';
    });
    $('[data-client-suggest]', sheet).hidden = true;
    $('[data-client-find]', sheet).value = '';
  }
}

async function submitAppt(sheet, appt, manual, force = false) {
  const form = $('[data-appt-form]', sheet);
  const fd = new FormData(form);
  const msg = $('[data-form-msg]', sheet);
  msg.innerHTML = '';
  const picked = readPicked(sheet);
  const name = String(fd.get('name') || '').trim();
  const date = String(fd.get('date') || '');
  const start = String(fd.get('start') || '');
  const problems = [];
  if (name.length < 2) problems.push('Add the client\'s name.');
  if (!appt && !picked.length) problems.push('Pick at least one service.');
  if (!date) problems.push('Pick a day.');
  if (!/^\d{2}:\d{2}$/.test(start)) problems.push('Pick a start time.');
  if (problems.length) {
    msg.innerHTML = `<p class="form-error">${esc(problems.join(' '))}</p>`;
    return;
  }
  const body = {
    name,
    phone: String(fd.get('phone') || '').trim(),
    email: String(fd.get('email') || '').trim(),
    instagram: String(fd.get('instagram') || '').trim(),
    notes: String(fd.get('notes') || ''),
    staffNotes: String(fd.get('staffNotes') || ''),
    notifyClient: fd.get('notifyClient') === 'on',
    force,
  };
  const btn = $('button[type="submit"]', sheet);
  btn.disabled = true;
  try {
    let res;
    if (appt) {
      const sameServices = picked.length === appt.services.length && picked.every((id, i) => id === appt.services[i].id);
      const patch = { ...body, month: appt.date.slice(0, 7) };
      if (date !== appt.date || start !== appt.start) {
        patch.date = date;
        patch.start = start;
      }
      if (!sameServices && picked.length) patch.services = picked;
      const dur = String(fd.get('duration') || '');
      const tot = String(fd.get('total') || '');
      if (dur !== '' && Number(dur) !== Number(appt.duration)) patch.duration = Number(dur);
      if (tot !== '' && Number(tot) !== Number(appt.total)) patch.total = Number(tot);
      res = await api('PATCH', `/admin/appointments/${appt.id}`, patch);
    } else {
      const dur = String(fd.get('duration') || '');
      const tot = String(fd.get('total') || '');
      res = await api('POST', '/admin/appointments', {
        ...body,
        clientId: String(fd.get('clientId') || ''),
        services: picked,
        date,
        start,
        status: String(fd.get('status') || 'confirmed'),
        duration: manual.duration && dur !== '' ? Number(dur) : undefined,
        total: manual.total && tot !== '' ? Number(tot) : undefined,
      });
    }
    upsertAppt(res.appointment);
    const created = res.appointment;
    if (!appt) {
      // Pick up a client record the server may have created.
      window.dispatchEvent(new Event('studio:refresh'));
    }
    S.schedule.date = created.date;
    closeSheet();
    rerender();
    toast(appt ? 'Changes saved.' : `Added ${created.name}, ${shortDate(created.date)} at ${formatTime(created.start)}.`, {
      label: 'Open',
      onClick: () => openAppointment(created.id),
    });
  } catch (err) {
    if (err.code === 'conflict') {
      msg.innerHTML = `<div class="confirm-inline"><p>${esc(err.message)}</p><div class="row-actions"><button type="button" class="btn btn-primary" data-force>Save anyway</button><button type="button" class="btn btn-quiet" data-unforce>Pick another time</button></div></div>`;
      $('[data-force]', msg).addEventListener('click', () => submitAppt(sheet, appt, manual, true));
      $('[data-unforce]', msg).addEventListener('click', () => {
        msg.innerHTML = '';
        $('#ap-start', sheet).focus();
      });
      msg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      msg.innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
    }
  } finally {
    btn.disabled = false;
  }
}

// ---------- time off

export function openBlockForm({ date = null } = {}) {
  const d = date || today();
  const html = `${sheetHead('Block time', 'Clients can\'t book blocked times')}
  <form class="sheet-body form" data-block-form novalidate>
    <div class="form-grid">
      <div class="field"><label for="bk-start">First day</label><input id="bk-start" name="startDate" type="date" value="${esc(d)}" required data-autofocus></div>
      <div class="field"><label for="bk-end">Last day</label><input id="bk-end" name="endDate" type="date" value="${esc(d)}"></div>
    </div>
    <label class="toggle"><input type="checkbox" name="allDay" checked data-allday><span class="track"></span> All day</label>
    <div class="form-grid" data-times hidden>
      <div class="field"><label for="bk-from">From</label><input id="bk-from" name="start" type="time" step="300" value="12:00"></div>
      <div class="field"><label for="bk-to">To</label><input id="bk-to" name="end" type="time" step="300" value="13:00"></div>
    </div>
    <p class="hint" data-times-hint hidden>Times repeat on each day in the range. Good for a standing lunch break.</p>
    <div class="field"><label for="bk-note">Note</label><input id="bk-note" name="note" maxlength="120" placeholder="Vacation, appointment, lunch"></div>
    <div data-form-msg></div>
    <div class="form-foot">
      <button type="submit" class="btn btn-primary">Block it</button>
      <button type="button" class="btn btn-quiet" data-close-sheet>Cancel</button>
    </div>
  </form>`;
  openSheet(html, {
    handlers: {
      change: (e, sheet) => {
        if (e.target.matches('[data-allday]')) {
          $('[data-times]', sheet).hidden = e.target.checked;
          $('[data-times-hint]', sheet).hidden = e.target.checked;
        }
        if (e.target.id === 'bk-start') {
          const end = $('#bk-end', sheet);
          if (!end.value || end.value < e.target.value) end.value = e.target.value;
        }
      },
      submit: async (e, sheet) => {
        e.preventDefault();
        const fd = new FormData($('[data-block-form]', sheet));
        const body = {
          startDate: fd.get('startDate'),
          endDate: fd.get('endDate') || fd.get('startDate'),
          allDay: fd.get('allDay') === 'on',
          start: fd.get('start'),
          end: fd.get('end'),
          note: fd.get('note'),
        };
        const msg = $('[data-form-msg]', sheet);
        try {
          const res = await api('POST', '/admin/blocks', body);
          S.data.blocks.push(res.block);
          const clashing = appts().filter(
            (a) =>
              ACTIVE.includes(a.status) &&
              a.date >= res.block.startDate &&
              a.date <= res.block.endDate &&
              (res.block.allDay || (toMin(a.start) < toMin(res.block.end) && toMin(res.block.start) < toMin(a.start) + a.duration)),
          );
          closeSheet();
          rerender();
          toast(clashing.length ? `Blocked. Heads up: ${clashing.length} booking${clashing.length === 1 ? ' is' : 's are'} already in that time.` : 'Time blocked.');
        } catch (err) {
          msg.innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
        }
      },
    },
  });
}
