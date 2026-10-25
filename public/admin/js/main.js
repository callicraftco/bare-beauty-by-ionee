// Studio panel entry: sign in, load data, route between views, keep fresh.
import {
  $,
  $$,
  S,
  api,
  closeSheet,
  esc,
  getSheetHandlers,
  icon,
  loadToken,
  saveToken,
  setAuthLostHandler,
  sheetOpen,
  toast,
  today,
} from './core.js';
import todayView from './today.js';
import scheduleView, { openAppointment, openAppointmentForm } from './schedule.js';
import clientsView from './clients.js';
import menuView from './menu.js';
import settingsView from './settings.js';

const VIEWS = {
  today: todayView,
  schedule: scheduleView,
  clients: clientsView,
  menu: menuView,
  settings: settingsView,
};

const NAV = [
  ['today', 'Today'],
  ['schedule', 'Schedule'],
  ['clients', 'Clients'],
  ['menu', 'Menu'],
  ['settings', 'Settings'],
];

// ---------- rendering

export function render() {
  if (!S.data) return;
  const pending = S.data.appointments.filter((a) => a.status === 'pending').length;
  $('[data-nav]').innerHTML = NAV.map(
    ([key, label]) =>
      `<li><a class="nav-item" href="#${key}" ${S.view === key ? 'aria-current="page"' : ''}>${icon(key, 22)}<span>${label}</span>${
        key === 'today' && pending ? `<span class="nav-badge" aria-label="${pending} waiting">${pending}</span>` : ''
      }</a></li>`,
  ).join('');
  const view = VIEWS[S.view] || VIEWS.today;
  view.render($('[data-main]'));
  document.title = `${NAV.find(([k]) => k === S.view)?.[1] || 'Studio'} | Studio`;
}

window.addEventListener('studio:render', render);

function routeFromHash() {
  const key = location.hash.replace('#', '').split('/')[0];
  const next = VIEWS[key] ? key : 'today';
  const changed = next !== S.view;
  S.view = next;
  render();
  if (changed) {
    window.scrollTo(0, 0);
    $('[data-main]').focus({ preventScroll: true });
  }
}

// ---------- data

async function loadData({ quiet = false } = {}) {
  const prevPending = S.data ? new Set(S.data.appointments.filter((a) => a.status === 'pending').map((a) => a.id)) : null;
  const data = await api('GET', '/admin/bootstrap');
  S.data = data;
  S.pulse = data.pulse;
  if (!S.schedule.date) S.schedule.date = today();
  if (prevPending && quiet) {
    const fresh = data.appointments.filter((a) => a.status === 'pending' && !prevPending.has(a.id));
    if (fresh.length === 1) {
      toast(`New request from ${fresh[0].name}`, { label: 'Open', onClick: () => openAppointment(fresh[0].id) });
    } else if (fresh.length > 1) {
      toast(`${fresh.length} new requests`, { label: 'See them', onClick: () => (location.hash = '#today') });
    }
  }
}

export async function refresh({ quiet = true } = {}) {
  try {
    await loadData({ quiet });
    render();
    if (!quiet) toast('Up to date.');
  } catch (err) {
    if (!quiet) toast(err.message);
  }
}
window.addEventListener('studio:refresh', () => refresh({ quiet: true }));

let polling = false;
async function checkPulse() {
  if (polling || !S.token || !S.data || document.visibilityState !== 'visible') return;
  polling = true;
  try {
    const { pulse } = await api('GET', '/admin/pulse');
    if (pulse !== S.pulse) {
      await loadData({ quiet: true });
      if (!S.menuDraft && !S.settingsDraft) render();
      else window.dispatchEvent(new Event('studio:data-updated'));
    }
  } catch {
    // Quiet: the next check will try again.
  } finally {
    polling = false;
  }
}

// ---------- screens

function showLogin(message = '') {
  closeSheet();
  $('[data-app]').hidden = true;
  $('[data-login]').hidden = false;
  $('[data-login-error]').textContent = message;
  setTimeout(() => $('#login-password').focus(), 50);
}

async function showApp() {
  $('[data-login]').hidden = true;
  $('[data-app]').hidden = false;
  $('[data-site-link]').innerHTML = `${icon('site')}<span>View the website</span>`;
  $('[data-signout]').innerHTML = `${icon('out')}<span>Sign out</span>`;
  $('[data-refresh]').innerHTML = icon('refresh', 22);
  routeFromHash();
}

setAuthLostHandler(() => {
  saveToken(null);
  S.data = null;
  showLogin('Please sign in again.');
});

// ---------- events

$('[data-login-form]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#login-password');
  const btn = $('[data-login-form] button[type="submit"]');
  $('[data-login-error]').textContent = '';
  if (!input.value) {
    $('[data-login-error]').textContent = 'Enter your password.';
    input.focus();
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Signing in...';
  try {
    const { token } = await api('POST', '/admin/login', { password: input.value });
    saveToken(token);
    input.value = '';
    await loadData();
    showApp();
  } catch (err) {
    $('[data-login-error]').textContent = err.message;
    input.select();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
});

$('[data-signout]').addEventListener('click', () => {
  saveToken(null);
  S.data = null;
  location.hash = '';
  showLogin('');
});

$('[data-refresh]').addEventListener('click', () => refresh({ quiet: false }));
$('[data-new-appt]').addEventListener('click', () => openAppointmentForm({ date: S.view === 'schedule' ? S.schedule.date : today() }));

// Views handle their own clicks and inputs through one delegated listener.
for (const type of ['click', 'input', 'change', 'submit', 'keydown']) {
  $('[data-main]').addEventListener(type, (e) => {
    const view = VIEWS[S.view];
    if (view && typeof view[type] === 'function') view[type](e);
  });
  $('[data-sheet]').addEventListener(type, (e) => {
    if (type === 'click' && e.target.closest('[data-close-sheet]')) {
      closeSheet();
      return;
    }
    const h = getSheetHandlers();
    if (h && typeof h[type] === 'function') h[type](e, $('[data-sheet]'));
  });
}
$('[data-sheet-root]').addEventListener('click', (e) => {
  if (e.target.matches('.sheet-backdrop')) closeSheet();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetOpen()) closeSheet();
});
window.addEventListener('hashchange', routeFromHash);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkPulse();
});
setInterval(checkPulse, 60000);

window.addEventListener('beforeunload', (e) => {
  if (S.menuDraft || S.settingsDraft) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ---------- start

(async function start() {
  if (!loadToken()) {
    showLogin('');
    return;
  }
  try {
    await loadData();
    showApp();
  } catch (err) {
    if (err.status !== 401) showLogin(err.message);
  }
})();

