// Booking flow: services, then a day and time, then details.
import { esc, formatDuration, formatTime, groupCategories, money } from './render.js';
import { addMonths, daysInMonth, googleCalendarUrl, icsFile, longDate, monthLabel, shortDate, weekdayIndex, DAYS_SHORT } from './dates.js';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const state = {
  site: null,
  services: new Map(),
  selected: [],
  avail: null,
  availKey: '',
  loadingAvail: false,
  date: null,
  time: null,
  month: null,
  step: 1,
  submitting: false,
  startedAt: Date.now(),
  // What the screen last showed, so only new things animate in.
  shownServices: new Set(),
  shownTotal: 0,
  shownMonth: '',
  shownTimesFor: '',
};

const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- data

async function getJson(url, options) {
  const res = await fetch(url, { headers: { accept: 'application/json', 'content-type': 'application/json' }, ...options });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong. Please try again.');
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

function selectedServices() {
  return state.selected.map((id) => state.services.get(id)).filter(Boolean);
}

function totals() {
  const list = selectedServices();
  return {
    count: list.length,
    minutes: list.reduce((s, x) => s + (Number(x.duration) || 0), 0),
    price: list.reduce((s, x) => s + (Number(x.price) || 0), 0),
  };
}

// ---------- notices

function notice(message) {
  const el = $('[data-notice]');
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.textContent = message;
  el.hidden = false;
}

// ---------- step 1: services

function renderServices() {
  const blocks = groupCategories(state.site.services.categories);
  const html = blocks
    .map((block) => {
      const grouped = !(block.cats.length === 1 && (!block.group || block.group === block.cats[0].name));
      const cats = block.cats
        .map((c) => {
          const rows = c.services
            .map((s) => {
              const meta = [s.durationLabel || formatDuration(s.duration), s.badge].filter(Boolean).join(', ');
              if (s.online === false) {
                return `<div class="pick is-offline"><span class="pick-box" aria-hidden="true"></span><span class="pick-text"><span class="pick-name">${esc(s.name)}</span><span class="pick-meta">Text the studio to book this one</span></span><span class="pick-price">${money(s.price)}</span></div>`;
              }
              const checked = state.selected.includes(s.id) ? ' checked' : '';
              return `<label class="pick"><input type="checkbox" value="${esc(s.id)}"${checked}><span class="pick-box" aria-hidden="true"></span><span class="pick-text"><span class="pick-name">${esc(s.name)}</span><span class="pick-meta">${esc(meta)}</span></span><span class="pick-price">${money(s.price)}</span></label>`;
            })
            .join('');
          return `${grouped ? `<h3 class="pick-sub">${esc(c.name)}</h3>` : ''}${c.note ? `<p class="pick-note">${esc(c.note)}</p>` : ''}<div class="pick-rows">${rows}</div>`;
        })
        .join('');
      return `<fieldset class="pick-group"><legend class="pick-group-title">${esc(block.title)}</legend>${cats}</fieldset>`;
    })
    .join('');
  $('[data-services]').innerHTML = html;
}

function onServiceToggle(e) {
  const input = e.target.closest('input[type="checkbox"]');
  if (!input || !input.closest('[data-services]')) return;
  const id = input.value;
  if (input.checked && !state.selected.includes(id)) state.selected.push(id);
  if (!input.checked) state.selected = state.selected.filter((x) => x !== id);
  // A new set of services can change which times fit.
  state.time = null;
  updateSummary();
}

// ---------- step 2: day and time

async function loadAvailability() {
  const key = [...state.selected].sort().join(',');
  if (state.avail && state.availKey === key) return;
  state.loadingAvail = true;
  state.avail = null;
  $('[data-calendar]').innerHTML = '<p class="loading">Finding open times...</p>';
  $('[data-times]').innerHTML = '';
  try {
    const days = Math.min(370, Number(state.site.booking.maxDaysAhead) + 2 || 62);
    const data = await getJson(`/api/availability?services=${encodeURIComponent(state.selected.join(','))}&days=${days}`);
    state.avail = data;
    state.availKey = key;
    const open = Object.keys(data.days).sort();
    if (state.date && !data.days[state.date]) {
      state.date = null;
      state.time = null;
    }
    if (state.time && state.date && !data.days[state.date].includes(state.time)) state.time = null;
    state.month = (state.date || open[0] || data.today).slice(0, 7);
  } catch (err) {
    $('[data-calendar]').innerHTML = `<p class="loading">${esc(err.message)}</p>`;
    return;
  } finally {
    state.loadingAvail = false;
  }
  renderCalendar();
  renderTimes();
  updateSummary();
}

function renderCalendar() {
  const a = state.avail;
  if (!a) return;
  const open = Object.keys(a.days);
  const firstMonth = a.today.slice(0, 7);
  const lastMonth = a.lastDate.slice(0, 7);
  const ym = state.month;
  if (!open.length) {
    $('[data-calendar]').innerHTML = `<p class="empty-state">No open times in the next few weeks for this combination. Try fewer services, or text the studio and I'll find you a spot.</p>`;
    return;
  }
  const first = `${ym}-01`;
  const lead = weekdayIndex(first);
  const total = daysInMonth(ym);
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<span class="cal-pad" aria-hidden="true"></span>';
  for (let d = 1; d <= total; d++) {
    const date = `${ym}-${String(d).padStart(2, '0')}`;
    const slots = a.days[date];
    const isSel = state.date === date;
    const isToday = date === a.today;
    if (slots) {
      cells += `<button type="button" class="cal-day is-open${isSel ? ' is-selected' : ''}${isToday ? ' is-today' : ''}" style="--i:${d}" data-date="${date}" aria-pressed="${isSel}" aria-label="${longDate(date)}, ${slots.length} open time${slots.length === 1 ? '' : 's'}">${d}</button>`;
    } else {
      cells += `<span class="cal-day${isToday ? ' is-today' : ''}" aria-hidden="true">${d}</span>`;
    }
  }
  const openThisMonth = open.filter((d) => d.startsWith(ym)).length;
  const entering = state.shownMonth !== ym;
  state.shownMonth = ym;
  $('[data-calendar]').innerHTML = `
    <div class="cal-head">
      <button type="button" class="cal-nav" data-month="-1" aria-label="Previous month" ${ym <= firstMonth ? 'disabled' : ''}><span aria-hidden="true">&lsaquo;</span></button>
      <h3 class="cal-title" aria-live="polite">${monthLabel(ym)}</h3>
      <button type="button" class="cal-nav" data-month="1" aria-label="Next month" ${ym >= lastMonth ? 'disabled' : ''}><span aria-hidden="true">&rsaquo;</span></button>
    </div>
    <div class="cal-grid${entering ? ' is-entering' : ''}" role="group" aria-label="${monthLabel(ym)}">
      ${DAYS_SHORT.map((d) => `<span class="cal-dow" aria-hidden="true">${d.slice(0, 2)}</span>`).join('')}
      ${cells}
    </div>
    ${openThisMonth ? '' : '<p class="cal-empty">Nothing open this month. Try the next one.</p>'}`;
}

function renderTimes() {
  const box = $('[data-times]');
  if (!state.avail || !state.date) {
    box.innerHTML = state.avail && Object.keys(state.avail.days).length ? '<p class="times-hint">Pick a day to see open times.</p>' : '';
    return;
  }
  const slots = state.avail.days[state.date] || [];
  box.classList.toggle('is-entering', state.shownTimesFor !== state.date);
  state.shownTimesFor = state.date;
  let n = 0;
  const groups = [
    ['Morning', slots.filter((t) => t < '12:00')],
    ['Afternoon', slots.filter((t) => t >= '12:00' && t < '17:00')],
    ['Evening', slots.filter((t) => t >= '17:00')],
  ].filter(([, list]) => list.length);
  box.innerHTML = `<h3 class="times-title">${longDate(state.date)}</h3>${groups
    .map(
      ([label, list]) => `<div class="time-group"><p class="time-label">${label}</p><div class="time-grid">${list
        .map((t) => `<button type="button" class="time${state.time === t ? ' is-selected' : ''}" style="--i:${n++}" data-time="${t}" aria-pressed="${state.time === t}">${formatTime(t)}</button>`)
        .join('')}</div></div>`,
    )
    .join('')}`;
}

// ---------- summary and steps

function whenText() {
  if (state.date && state.time) return `${longDate(state.date)} at ${formatTime(state.time)}`;
  if (state.date) return `${longDate(state.date)}, pick a time`;
  return 'Not picked yet';
}

function updateSummary() {
  const list = selectedServices();
  const t = totals();
  $('[data-summary-list]').innerHTML = list.length
    ? list.map((s) => `<li${state.shownServices.has(s.id) ? '' : ' class="is-new"'}><span>${esc(s.name)}</span><span>${money(s.price)}</span></li>`).join('')
    : '<li class="summary-empty">No services yet.</li>';
  state.shownServices = new Set(list.map((s) => s.id));
  $('[data-summary-when]').textContent = whenText();
  $('[data-summary-duration]').textContent = t.minutes ? `About ${formatDuration(t.minutes)}` : '0 min';
  countTo($('[data-summary-total]'), t.price);

  let compact = 'Pick at least one service';
  if (t.count) {
    compact = `${t.count} service${t.count === 1 ? '' : 's'}, ${formatDuration(t.minutes)}, ${money(t.price)}`;
    if (state.step >= 2 && state.date && state.time) compact = `${shortDate(state.date)}, ${formatTime(state.time)}, ${money(t.price)}`;
  }
  $('[data-summary-compact]').textContent = compact;

  const next = $('[data-next]');
  const back = $('[data-back]');
  back.hidden = state.step === 1 || state.step === 4;
  if (state.step === 1) {
    next.textContent = 'Choose a time';
    next.disabled = t.count === 0;
  } else if (state.step === 2) {
    next.textContent = 'Continue';
    next.disabled = !(state.date && state.time);
  } else if (state.step === 3) {
    next.textContent = state.site.booking.mode === 'instant' ? 'Book appointment' : 'Request appointment';
    next.disabled = state.submitting;
    if (state.submitting) next.textContent = 'Sending...';
  }
  $('[data-summary]').classList.toggle('is-done', state.step === 4);
}

// The total counts up or down to its new amount, then gives a little bump.
let counting = 0;
function countTo(el, target) {
  const from = state.shownTotal;
  state.shownTotal = target;
  cancelAnimationFrame(counting);
  if (from === target || still()) {
    el.textContent = money(target);
    return;
  }
  const start = performance.now();
  const ms = 450;
  const tick = (now) => {
    const k = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - k, 3);
    const v = from + (target - from) * eased;
    el.textContent = money(k < 1 ? Math.round(v) : target);
    if (k < 1) counting = requestAnimationFrame(tick);
    else {
      el.classList.remove('is-bumped');
      void el.offsetWidth;
      el.classList.add('is-bumped');
    }
  };
  counting = requestAnimationFrame(tick);
}

function goTo(step, { focus = true } = {}) {
  const dir = step < state.step ? 'back' : 'fwd';
  const changed = step !== state.step;
  state.step = step;
  $$('[data-step]').forEach((s) => {
    const on = Number(s.dataset.step) === step;
    s.hidden = !on;
    s.classList.remove('step-in');
    if (on && changed) {
      s.dataset.dir = dir;
      void s.offsetWidth;
      s.classList.add('step-in');
    }
  });
  $$('[data-step-tab]').forEach((li) => {
    const n = Number(li.dataset.stepTab);
    if (n === step) li.setAttribute('aria-current', 'step');
    else li.removeAttribute('aria-current');
    li.classList.toggle('is-done', n < step);
  });
  $('.book-head').hidden = step === 4;
  notice('');
  updateSummary();
  if (step === 2) loadAvailability();
  if (focus) {
    const title = $(`[data-step="${step}"] .step-title`);
    if (title) title.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// ---------- step 3: details and submit

function fieldError(name, message) {
  const el = $(`[data-error-for="${name}"]`);
  const input = $(`[name="${name}"]`);
  if (el) el.textContent = message || '';
  if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function readForm() {
  const f = $('[data-form]');
  const data = Object.fromEntries(new FormData(f).entries());
  return {
    name: (data.name || '').trim(),
    phone: (data.phone || '').trim(),
    email: (data.email || '').trim(),
    instagram: (data.instagram || '').trim(),
    notes: (data.notes || '').trim(),
    firstVisit: data.firstVisit === 'yes',
    agree: Boolean($('[data-agree]').checked),
    offers: Boolean($('[data-offers]').checked),
    website: data.website || '',
  };
}

function validate(d) {
  let ok = true;
  const first = [];
  const set = (name, msg) => {
    fieldError(name, msg);
    if (msg) {
      ok = false;
      first.push(name);
    }
  };
  set('name', d.name.length < 2 ? 'Add your name.' : '');
  set('phone', d.phone.replace(/\D/g, '').length < 10 ? 'Add a mobile number with area code.' : '');
  set('email', d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email) ? 'That email looks incomplete.' : '');
  set('agree', d.agree ? '' : 'Please agree to the booking terms to continue.');
  if (!ok) {
    const input = $(`[name="${first[0]}"]`);
    if (input) input.focus();
  }
  return ok;
}

async function submit() {
  if (state.submitting) return;
  const d = readForm();
  if (!validate(d)) return;
  state.submitting = true;
  updateSummary();
  notice('');
  try {
    const result = await getJson('/api/book', {
      method: 'POST',
      body: JSON.stringify({
        ...d,
        services: state.selected,
        date: state.date,
        start: state.time,
        elapsed: Date.now() - state.startedAt,
      }),
    });
    if (!result.appointment) throw new Error('Something went wrong. Please try again.');
    showDone(result, d);
  } catch (err) {
    if (err.code === 'slot') {
      state.avail = null;
      state.time = null;
      goTo(2);
      notice('That time was just taken. Please pick another time.');
    } else if (err.code && ['name', 'phone', 'email', 'agree'].includes(err.code)) {
      fieldError(err.code, err.message);
    } else {
      notice(err.message || 'Something went wrong. Please try again.');
    }
  } finally {
    state.submitting = false;
    updateSummary();
  }
}

function showDone(result, form) {
  const a = result.appointment;
  const b = state.site.business;
  const confirmed = a.status === 'confirmed';
  const first = (form.name || '').split(/\s+/)[0];
  $('[data-done-title]').textContent = confirmed ? "You're booked" : 'Request sent';
  const sparks = [0, 45, 90, 135, 180, 225, 270, 315]
    .map((a, i) => `<i style="--a:${a + 12}deg;--r:${i % 2 ? 44 : 60}px"></i>`)
    .join('');
  const mark = $('[data-done-mark]');
  if (mark) {
    mark.innerHTML = `<svg viewBox="0 0 64 64" focusable="false"><circle cx="32" cy="32" r="29" pathLength="1"/><path d="M20.5 33.5l7.5 7.5 15.5-16" pathLength="1"/></svg>${sparks}`;
  }
  $('[data-done-lead]').textContent = confirmed
    ? `Thank you, ${first}. See you ${longDate(a.date)} at ${formatTime(a.start)}.`
    : `Thank you, ${first}. I'll confirm your appointment by text${form.email ? ' or email' : ''} soon.`;
  $('[data-receipt]').innerHTML = `
    <div><dt>When</dt><dd>${esc(longDate(a.date))} at ${esc(formatTime(a.start))}</dd></div>
    <div><dt>Services</dt><dd>${a.services.map((s) => esc(s.name)).join(', ')}</dd></div>
    <div><dt>Time needed</dt><dd>About ${esc(formatDuration(a.duration))}</dd></div>
    <div><dt>Total</dt><dd>${money(a.total)}</dd></div>
    <div><dt>Status</dt><dd>${confirmed ? 'Confirmed' : 'Waiting for confirmation'}</dd></div>
    ${a.address ? `<div><dt>Where</dt><dd>${esc(a.address)}</dd></div>` : ''}`;
  const notes = [];
  if (result.emailSent) notes.push(`A copy is on its way to ${form.email}.`);
  if (state.site.booking.paymentNote) notes.push(state.site.booking.paymentNote);
  if (!a.address) notes.push('The studio address comes with your confirmation.');
  $('[data-done-note]').textContent = notes.join(' ');

  const title = `${b.name || 'Bare Beauty by Ionee'}: ${a.services.map((s) => s.name).join(', ')}`;
  const details = `${a.services.map((s) => s.name).join(', ')}\nManage your appointment: ${result.manageUrl}`;
  const gcal = googleCalendarUrl({ title, startsAt: a.startsAt, minutes: a.duration, details, location: a.address });
  const ics = icsFile({ uid: `${a.id}@barebeauty`, title, startsAt: a.startsAt, minutes: a.duration, details, location: a.address });
  const icsUrl = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  $('[data-done-actions]').innerHTML = `
    <a class="btn btn-espresso" href="${esc(result.manageUrl)}">View or cancel</a>
    <a class="btn btn-ghost-light" href="${esc(gcal)}" target="_blank" rel="noopener">Add to Google Calendar</a>
    <a class="btn btn-ghost-light" href="${icsUrl}" download="bare-beauty-appointment.ics">Add to Apple or Outlook calendar</a>
    <a class="btn-text" href="/">Back to the site</a>`;
  goTo(4);
}

// ---------- wiring

function bind() {
  $('[data-services]').addEventListener('change', onServiceToggle);

  $('[data-calendar]').addEventListener('click', (e) => {
    const nav = e.target.closest('[data-month]');
    if (nav && !nav.disabled) {
      state.month = addMonths(state.month, Number(nav.dataset.month));
      renderCalendar();
      return;
    }
    const day = e.target.closest('[data-date]');
    if (day) {
      state.date = day.dataset.date;
      state.time = null;
      renderCalendar();
      renderTimes();
      updateSummary();
      const times = $('[data-times]');
      if (window.matchMedia('(max-width: 899px)').matches) times.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  $('[data-times]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-time]');
    if (!btn) return;
    state.time = btn.dataset.time;
    renderTimes();
    updateSummary();
  });

  $('[data-next]').addEventListener('click', () => {
    if (state.step === 1 && totals().count) goTo(2);
    else if (state.step === 2 && state.date && state.time) goTo(3);
    else if (state.step === 3) submit();
  });
  $('[data-back]').addEventListener('click', () => {
    if (state.step > 1 && state.step < 4) goTo(state.step - 1);
  });
  $('[data-form]').addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });
  $('[data-form]').addEventListener('input', (e) => {
    if (e.target.name) fieldError(e.target.name, '');
  });
  $('[data-stepper]').addEventListener('click', (e) => {
    const li = e.target.closest('[data-step-tab]');
    if (!li) return;
    const n = Number(li.dataset.stepTab);
    if (n < state.step && state.step < 4) goTo(n);
  });
}

async function init() {
  bind();
  try {
    state.site = await getJson('/api/site');
  } catch {
    $('[data-services]').innerHTML =
      '<p class="empty-state">Online booking is not available right now. Please text or DM the studio on Instagram to book.</p>';
    return;
  }
  const site = state.site;
  for (const c of site.services.categories) for (const s of c.services) state.services.set(s.id, s);
  const wanted = new URLSearchParams(location.search).get('s');
  if (wanted) {
    for (const id of wanted.split(',')) {
      const s = state.services.get(id);
      if (s && s.online !== false && !state.selected.includes(id)) state.selected.push(id);
    }
  }
  $('[data-intro]').textContent =
    site.booking.mode === 'instant'
      ? 'Pick your services, choose a time, then add your details. Your appointment is confirmed right away.'
      : "Pick your services, choose a time, then add your details. I'll confirm your appointment by text or email.";
  const policy = [];
  if (Number(site.booking.cancelNoticeHours) > 0) policy.push(`Need to cancel? Please give at least ${site.booking.cancelNoticeHours} hours' notice.`);
  if (site.booking.paymentNote) policy.push(site.booking.paymentNote);
  $('[data-policy]').innerHTML = policy.map((p) => `<p>${esc(p)}</p>`).join('');
  if (site.booking.paymentNote) {
    $('[data-summary-fine]').textContent = site.booking.paymentNote;
    $('[data-summary-fine]').hidden = false;
  }
  renderServices();
  updateSummary();
}

init();
