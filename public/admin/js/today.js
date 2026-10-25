// Today: what needs a decision, who is coming in, and who is due back.
import {
  $,
  ACTIVE,
  S,
  addDays,
  api,
  appts,
  esc,
  fillTemplate,
  firstName,
  formatTime,
  icon,
  longDate,
  money,
  nowParts,
  rebookDue,
  relativeDay,
  shortDate,
  smsHref,
  sortAppts,
  toast,
  today,
  upsertAppt,
  daysBetween,
} from './core.js';
import { apptRow, openAppointment, openAppointmentForm } from './schedule.js';

const rerender = () => window.dispatchEvent(new Event('studio:render'));

function greeting() {
  const h = Math.floor(nowParts().min / 60);
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function setupItems() {
  const d = S.data;
  const b = d.settings.business;
  return [
    { done: d.settings.setup.hoursReviewed, text: 'Set your hours and booking rules', go: '#settings', tab: 'hours' },
    { done: Boolean(b.phone && b.area), text: 'Add your phone number and the area you work in', go: '#settings', tab: 'business' },
    { done: d.settings.setup.menuReviewed, text: 'Check your menu, prices and times', go: '#menu' },
    { done: d.hasOwnPassword, text: 'Choose your own password', go: '#settings', tab: 'security' },
    { done: d.media.some((m) => m.kind === 'about'), text: 'Add a photo of you for the About section', go: '#settings', tab: 'photos' },
    { done: Boolean(d.settings.setup.policiesReviewed), text: 'Read your privacy policy and booking terms', go: '#settings', tab: 'privacy' },
    { done: Boolean(d.instagram && d.instagram.connected), text: 'Show your Instagram posts on the site (needs a one-time setup)', go: '#settings', tab: 'instagram', optional: true },
    { done: d.mail.enabled, text: 'Get booking emails (needs a one-time setup in Netlify)', go: '#settings', tab: 'calendar', optional: true },
  ];
}

// Things that need a look: Instagram trouble, records past the keep-for limit.
function noticesCard() {
  const d = S.data;
  const items = [];
  const ig = d.instagram;
  if (ig && ig.connected && ig.lastError) {
    items.push({ text: `Instagram needs a look: ${ig.lastError}`, tab: 'instagram', label: 'Open Instagram settings' });
  }
  const check = d.privacyCheck;
  const years = Number(d.settings.privacy && d.settings.privacy.retentionYears) || 0;
  if (check && years && (check.clients || check.looseAppointments)) {
    const n = check.clients;
    const what = n ? `${n} client${n === 1 ? ' has' : 's have'} not visited in over ${years} year${years === 1 ? '' : 's'}` : 'Some old appointments are past your keep-for limit';
    items.push({ text: `${what}. Their details will be erased on the 1st, as your privacy policy says.`, tab: 'privacy', label: 'Review' });
  }
  if (!items.length) return '';
  return `<section class="section"><ul class="notice-list">${items
    .map((i) => `<li class="notice-item"><span>${esc(i.text)}</span><a class="link-btn" href="#settings" data-setup-tab="${i.tab}">${esc(i.label)}</a></li>`)
    .join('')}</ul></section>`;
}

function setupCard() {
  if (S.data.settings.setup.dismissed) return '';
  const items = setupItems();
  const left = items.filter((i) => !i.done && !i.optional).length;
  return `<section class="setup section" aria-labelledby="setup-title">
    <div class="section-head"><h2 class="section-title" id="setup-title">${left ? `Finish setting up (${left} left)` : 'All set up'}</h2><button type="button" class="link-btn" data-dismiss-setup>Hide this</button></div>
    <ol>${items
      .map(
        (i) =>
          `<li class="${i.done ? 'is-done' : ''}"><span class="tick" aria-hidden="true">${i.done ? icon('check', 14) : ''}</span><span class="setup-text">${esc(i.text)}${i.optional ? ' <span class="hint">(optional)</span>' : ''}</span>${
            i.done ? '' : `<a class="link-btn" href="${i.go}" data-setup-tab="${i.tab || ''}">Open</a>`
          }</li>`,
      )
      .join('')}</ol>
  </section>`;
}

function requestCard(a) {
  const T = S.data.settings.templates;
  return `<li class="request">
    <div class="request-top">
      <div>
        <p class="request-when">${esc(relativeDay(a.date))}, ${esc(formatTime(a.start))}</p>
        <p class="appt-name">${esc(a.name)} ${a.firstVisit ? '<span class="chip chip-soft">First visit</span>' : ''}</p>
        <p class="request-meta">${esc(a.services.map((s) => s.name).join(', '))}, ${money(a.total)}</p>
      </div>
      <button type="button" class="link-btn" data-open-appt="${esc(a.id)}">Details</button>
    </div>
    ${a.notes ? `<p class="request-notes">${esc(a.notes)}</p>` : ''}
    <div class="row-actions">
      <button type="button" class="btn btn-primary btn-small" data-quick="confirm" data-id="${esc(a.id)}">${icon('check', 16)} Confirm</button>
      <button type="button" class="btn btn-quiet btn-small" data-quick="decline" data-id="${esc(a.id)}">Decline</button>
      ${a.phone ? `<a class="btn btn-quiet btn-small" href="${esc(smsHref(a.phone, fillTemplate(T.confirm, { appt: a })))}">${icon('text', 16)} Text</a>` : ''}
    </div>
  </li>`;
}

function stats() {
  const t = today();
  const list = appts();
  const weekEnd = addDays(t, 6);
  const week = list.filter((a) => a.date >= t && a.date <= weekEnd && ACTIVE.includes(a.status));
  const ym = t.slice(0, 7);
  const monthDone = list.filter((a) => a.date.startsWith(ym) && a.status === 'completed');
  const monthBooked = list.filter((a) => a.date.startsWith(ym) && (ACTIVE.includes(a.status) || a.status === 'completed'));
  const newClients = S.data.clients.filter((c) => (c.createdAt || '').slice(0, 7) === ym).length;
  const sum = (arr) => arr.reduce((s, a) => s + (Number(a.total) || 0), 0);
  return `<div class="stats">
    <div class="stat"><p class="stat-label">Next 7 days</p><p class="stat-value">${week.length}</p><p class="stat-foot">${money(sum(week))} booked</p></div>
    <div class="stat"><p class="stat-label">Earned this month</p><p class="stat-value">${money(sum(monthDone))}</p><p class="stat-foot">${monthDone.length} completed</p></div>
    <div class="stat"><p class="stat-label">Month on the books</p><p class="stat-value">${money(sum(monthBooked))}</p><p class="stat-foot">${monthBooked.length} visits</p></div>
    <div class="stat"><p class="stat-label">New clients</p><p class="stat-value">${newClients}</p><p class="stat-foot">this month</p></div>
  </div>`;
}

function tomorrowCard() {
  const tm = addDays(today(), 1);
  const list = sortAppts(appts().filter((a) => a.date === tm && a.status === 'confirmed'));
  if (!list.length) return '';
  const T = S.data.settings.templates;
  return `<section class="section">
    <div class="section-head"><h2 class="section-title">Reminders for tomorrow</h2><span class="section-note">${list.filter((a) => a.remindedAt).length} of ${list.length} sent</span></div>
    <ul class="appt-list">${list
      .map(
        (a) => `<li class="request">
        <div class="request-top"><div><p class="request-when">${esc(formatTime(a.start))}, ${esc(a.name)}</p><p class="request-meta">${esc(a.services.map((s) => s.name).join(', '))}</p></div>
        ${a.remindedAt ? `<span class="chip chip-confirmed">${icon('check', 14)} Sent</span>` : ''}</div>
        <div class="row-actions">${
          a.phone
            ? `<a class="btn ${a.remindedAt ? 'btn-quiet' : 'btn-primary'} btn-small" href="${esc(smsHref(a.phone, fillTemplate(T.reminder, { appt: a })))}" data-remind="${esc(a.id)}">${icon('text', 16)} Text reminder</a>`
            : '<span class="hint">No phone number</span>'
        }<button type="button" class="link-btn" data-open-appt="${esc(a.id)}">Details</button></div>
      </li>`,
      )
      .join('')}</ul>
  </section>`;
}

function rebookCard() {
  const due = rebookDue().slice(0, 6);
  if (!due.length) return '';
  const T = S.data.settings.templates;
  return `<section class="section">
    <div class="section-head"><h2 class="section-title">Due to come back</h2><a class="link-btn" href="#clients" data-clients-due>See all</a></div>
    <ul class="appt-list">${due
      .map(({ client, last, since }) => {
        const service = last.services[0] ? last.services[0].name : 'visit';
        // Someone who said STOP to offer texts doesn't get an invite-back text.
        const optedOut = client.marketing && client.marketing.sms === false;
        const action = optedOut
          ? '<span class="hint">No offer texts</span>'
          : client.phone
            ? `<a class="btn btn-quiet btn-small" href="${esc(smsHref(client.phone, fillTemplate(T.rebook, { client, service })))}">${icon('text', 16)} Text</a>`
            : '';
        return `<li class="request"><div class="request-top"><div><p class="appt-name">${esc(client.name)}</p><p class="request-meta">${esc(service)}, ${since} days ago</p></div>${action}</div></li>`;
      })
      .join('')}</ul>
  </section>`;
}

function render(main) {
  const t = today();
  const list = appts();
  const pending = sortAppts(list.filter((a) => a.status === 'pending'));
  const todays = sortAppts(list.filter((a) => a.date === t && a.status !== 'cancelled' && a.status !== 'declined'));
  const next = sortAppts(list.filter((a) => a.date > t && ACTIVE.includes(a.status)))[0];
  main.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title">${greeting()}, Ionee</h1>
        <p class="page-sub">${esc(longDate(t))}</p>
      </div>
      <button type="button" class="btn btn-primary" data-new>${icon('plus', 18)} New appointment</button>
    </div>
    ${setupCard()}
    ${noticesCard()}
    ${
      pending.length
        ? `<section class="section"><div class="section-head"><h2 class="section-title">Waiting for you (${pending.length})</h2><span class="section-note">Booked online, not confirmed yet</span></div><ul class="appt-list">${pending.map(requestCard).join('')}</ul></section>`
        : ''
    }
    <section class="section">
      <div class="section-head"><h2 class="section-title">Today</h2><a class="link-btn" href="#schedule" data-schedule-today>Open schedule</a></div>
      ${
        todays.length
          ? `<ul class="appt-list">${todays.map((a) => apptRow(a)).join('')}</ul>`
          : `<p class="empty">Nothing booked today.${next ? ` Next up: ${esc(next.name)}, ${esc(shortDate(next.date))} at ${esc(formatTime(next.start))}.` : ''}</p>`
      }
    </section>
    ${tomorrowCard()}
    <section class="section"><div class="section-head"><h2 class="section-title">At a glance</h2></div>${stats()}</section>
    ${rebookCard()}`;
}

async function quick(action, id, btn) {
  const a = appts().find((x) => x.id === id);
  if (!a) return;
  btn.disabled = true;
  try {
    const res = await api('PATCH', `/admin/appointments/${id}`, {
      action,
      month: a.date.slice(0, 7),
      notifyClient: Boolean(S.data.mail.enabled && a.email),
    });
    upsertAppt(res.appointment);
    rerender();
    const T = S.data.settings.templates;
    const key = action === 'confirm' ? 'confirm' : 'decline';
    toast(action === 'confirm' ? `Confirmed ${firstName(a.name)}.` : `Declined ${firstName(a.name)}'s request.`, a.phone ? { label: `Text ${firstName(a.name)}`, href: smsHref(a.phone, fillTemplate(T[key], { appt: res.appointment })), onClick: () => {} } : null);
  } catch (err) {
    btn.disabled = false;
    toast(err.message);
  }
}

async function click(e) {
  const t = e.target;
  const open = t.closest('[data-open-appt]');
  if (open) return openAppointment(open.dataset.openAppt);
  if (t.closest('[data-new]')) return openAppointmentForm({ date: today() });
  const q = t.closest('[data-quick]');
  if (q) return quick(q.dataset.quick, q.dataset.id, q);
  const remind = t.closest('[data-remind]');
  if (remind) {
    const a = appts().find((x) => x.id === remind.dataset.remind);
    if (a) {
      api('PATCH', `/admin/appointments/${a.id}`, { reminded: true, month: a.date.slice(0, 7) })
        .then((res) => {
          upsertAppt(res.appointment);
          setTimeout(rerender, 800);
        })
        .catch(() => {});
    }
    return;
  }
  if (t.closest('[data-schedule-today]')) {
    S.schedule.date = today();
    S.schedule.mode = 'day';
    return;
  }
  if (t.closest('[data-clients-due]')) {
    S.clients.filter = 'due';
    return;
  }
  const setupLink = t.closest('[data-setup-tab]');
  if (setupLink && setupLink.dataset.setupTab) S.settingsTab = setupLink.dataset.setupTab;
  if (t.closest('[data-dismiss-setup]')) {
    try {
      const next = { ...S.data.settings, setup: { ...S.data.settings.setup, dismissed: true } };
      const res = await api('PUT', '/admin/settings', next);
      S.data.settings = res.settings;
      rerender();
      toast('Hidden. You can find everything in Settings.');
    } catch (err) {
      toast(err.message);
    }
  }
}

export default { render, click };
