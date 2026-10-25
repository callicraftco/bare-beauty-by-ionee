// End-to-end check of the booking API against a local `netlify dev` server.
// Usage:  ADMIN_PASSWORD=yourpass npm test
// It creates test bookings, so it refuses to run against a live site.
const BASE = (process.env.BASE_URL || 'http://localhost:8888').replace(/\/$/, '');
const PASSWORD = process.env.ADMIN_PASSWORD;

if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error(`Refusing to run against ${BASE}. This test writes data. Use a local netlify dev server.`);
  process.exit(1);
}
if (!PASSWORD) {
  console.error('Set ADMIN_PASSWORD to the same value the dev server uses.');
  process.exit(1);
}

let passed = 0;
let failed = 0;
const check = (name, ok, detail) => {
  if (ok) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail ? `: ${detail}` : ''}`);
  }
};

async function api(method, path, body, token) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data };
}

const addDays = (date, n) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

console.log(`Testing ${BASE}`);

// Names and numbers unique to this run, so the test can run again on the same data.
const RUN = Date.now().toString(36).slice(-5);
const phone = () => `86355${String(10000 + Math.floor(Math.random() * 89999))}`;

const site = await api('GET', '/site');
check('site data loads', site.status === 200 && site.data.services.categories.length > 0);

const avail = await api('GET', '/availability?services=classic-glow-facial&days=21');
const dates = Object.keys(avail.data.days || {});
check('availability returns open days', avail.status === 200 && dates.length > 0, JSON.stringify(avail.data).slice(0, 200));
const date = dates[1] || dates[0];
const slot = avail.data.days[date][0];

const booking = {
  services: ['classic-glow-facial'],
  date,
  start: slot,
  name: 'Test Client',
  phone: '(863) 555-0100',
  email: 'test.client@example.com',
  notes: 'Smoke test booking',
  firstVisit: true,
  agree: true,
  elapsed: 60000,
};
const booked = await api('POST', '/book', booking);
check('client can book an open time', booked.status === 200 && booked.data.appointment?.id, JSON.stringify(booked.data));
const appt = booked.data.appointment;

const again = await api('POST', '/book', { ...booking, name: 'Second Client', phone: '8635550101' });
check('the same time cannot be booked twice', again.status === 409 && again.data.code === 'slot');

const noAgree = await api('POST', '/book', { ...booking, start: avail.data.days[date][4], agree: false });
check('booking needs the terms checkbox', noAgree.status === 400 && noAgree.data.code === 'agree');

const badDate = await api('POST', '/book', { ...booking, date: `${date.slice(0, 4)}-02-30`, name: 'Phantom Date', phone: '8635550188' });
check('impossible dates are refused', badDate.status === 400, JSON.stringify(badDate.data));

const nullBody = await fetch(`${BASE}/api/book`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'null' });
check('an empty request body gets a clear error, not a crash', nullBody.status === 400);

const past = await api('GET', `/availability?services=classic-glow-facial&from=${addDays(date, -120)}&days=70`);
check('availability from an early date still hides taken times', past.status === 200 && !(past.data.days[date] || []).includes(slot));

const bot = await api('POST', '/book', { ...booking, website: 'spam.example' });
check('hidden bot field is ignored quietly', bot.status === 200 && bot.data.appointment === null);

const after = await api('GET', '/availability?services=classic-glow-facial&days=21');
check('booked time disappears from availability', !(after.data.days[date] || []).includes(slot));

// Client manage link
const link = new URL(booked.data.manageUrl);
const view = await api('GET', `/appointment${link.search}`);
check('manage link shows the appointment', view.status === 200 && view.data.appointment.id === appt.id);
const forged = await api('GET', `/appointment?id=${appt.id}&t=wrongtoken`);
check('manage link with a wrong token is rejected', forged.status === 404);

// Studio login
const bad = await api('POST', '/admin/login', { password: 'definitely-wrong' });
check('wrong password is rejected', bad.status === 401);
const login = await api('POST', '/admin/login', { password: PASSWORD });
check('studio login works', login.status === 200 && login.data.token);
const token = login.data.token;
const noAuth = await api('GET', '/admin/bootstrap');
check('studio data needs login', noAuth.status === 401);

const boot = await api('GET', '/admin/bootstrap', null, token);
check('studio data loads', boot.status === 200 && boot.data.appointments.some((a) => a.id === appt.id));
check('client record was created', boot.data.clients.some((c) => c.name === 'Test Client'));
const savedAppt = boot.data.appointments.find((a) => a.id === appt.id);
check(
  'the booking records which terms were agreed to',
  savedAppt && savedAppt.terms && savedAppt.terms.version === site.data.policyVersion && savedAppt.log.some((l) => l.text.startsWith('Agreed to the booking terms')),
);
const testClient = boot.data.clients.find((c) => c.name === 'Test Client');
check('no offer-text consent unless asked', testClient && !testClient.marketing);

const spaced = await api('POST', '/admin/password', { password: '  spaced-password  ' }, token);
check('a password with spaces at the ends is refused', spaced.status === 400);

const confirm = await api('PATCH', `/admin/appointments/${appt.id}`, { action: 'confirm', month: date.slice(0, 7) }, token);
check('studio can confirm a request', confirm.status === 200 && confirm.data.appointment.status === 'confirmed', JSON.stringify(confirm.data));
const confirmAgain = await api('PATCH', `/admin/appointments/${appt.id}`, { action: 'confirm' }, token);
check('confirming twice is refused', confirmAgain.status === 400);

// Overlap protection on studio bookings
const overlap = await api('POST', '/admin/appointments', { name: 'Walk In', phone: '8635550102', services: ['wax-chin'], date, start: slot }, token);
check('studio booking warns about overlaps', overlap.status === 409 && overlap.data.code === 'conflict');
const forced = await api('POST', '/admin/appointments', { name: 'Walk In', phone: '8635550102', services: ['wax-chin'], date, start: slot, force: true }, token);
check('studio can book anyway', forced.status === 200);

// Move to next month and back
const nextMonth = addDays(`${date.slice(0, 7)}-01`, 40);
const moved = await api('PATCH', `/admin/appointments/${appt.id}`, { date: nextMonth, start: '11:00', month: date.slice(0, 7), force: true }, token);
check('appointment can move to another month', moved.status === 200 && moved.data.appointment.date === nextMonth, JSON.stringify(moved.data));
const boot2 = await api('GET', '/admin/bootstrap', null, token);
const copies = boot2.data.appointments.filter((a) => a.id === appt.id);
check('moved appointment exists once', copies.length === 1 && copies[0].date === nextMonth);
const linkAfterMove = await api('GET', `/appointment${link.search}`);
check('old manage link still finds the moved appointment', linkAfterMove.status === 200 && linkAfterMove.data.appointment.date === nextMonth);

// Time off removes availability
const offDay = dates[dates.length - 1];
const block = await api('POST', '/admin/blocks', { startDate: offDay, allDay: true, note: 'Test day off' }, token);
check('time off can be added', block.status === 200);
const afterBlock = await api('GET', '/availability?services=classic-glow-facial&days=21');
check('time off closes that day', !afterBlock.data.days[offDay]);
await api('DELETE', `/admin/blocks/${block.data.block.id}`, null, token);

// Client cancels with the link
const cancel = await api('POST', '/appointment/cancel', { id: appt.id, t: link.searchParams.get('t'), m: link.searchParams.get('m') });
check('client can cancel online', cancel.status === 200 && cancel.data.appointment.status === 'cancelled', JSON.stringify(cancel.data));

// Calendar feed
const feedUrl = new URL(boot.data.feedUrl);
const feed = await fetch(`${BASE}${feedUrl.pathname}${feedUrl.search}`);
const feedText = await feed.text();
check('calendar feed works', feed.status === 200 && feedText.startsWith('BEGIN:VCALENDAR'));
const badFeed = await fetch(`${BASE}/api/calendar.ics?key=wrong-key-123`);
check('calendar feed needs the secret link', badFeed.status === 404);

// Settings and menu round trip
const settings = boot.data.settings;
const saved = await api('PUT', '/admin/settings', { ...settings, business: { ...settings.business, area: 'Lakeland, FL' } }, token);
check('settings save', saved.status === 200 && saved.data.settings.business.area === 'Lakeland, FL');
const services = boot.data.services;
services.categories[0].services[0].price = 65;
const menu = await api('PUT', '/admin/services', services, token);
check('menu saves', menu.status === 200 && menu.data.services.categories[0].services[0].price === 65);
const site2 = await api('GET', '/site');
check('site shows the new price', site2.data.services.categories[0].services[0].price === 65);
services.categories[0].services[0].price = 60;
await api('PUT', '/admin/services', services, token);
await api('PUT', '/admin/settings', settings, token);

// Many people booking at the same moment
const raceDay = dates[2] || dates[0];
const raceSlots = (await api('GET', '/availability?services=wax-upper-lip&days=21')).data.days[raceDay];
const sameSlot = await Promise.all(
  Array.from({ length: 6 }, (_, i) =>
    api('POST', '/book', { ...booking, services: ['wax-upper-lip'], date: raceDay, start: raceSlots[0], name: `Racer ${RUN} ${i}`, phone: phone(), email: '' }),
  ),
);
check('six people racing for one time: exactly one gets it', sameSlot.filter((r) => r.status === 200).length === 1, sameSlot.map((r) => r.status).join(','));
const free = raceSlots.slice(4, 9);
const spread = await Promise.all(
  free.map((start, i) => api('POST', '/book', { ...booking, services: ['wax-upper-lip'], date: raceDay, start, name: `Parallel ${RUN} ${i}`, phone: phone(), email: '' })),
);
const boot3 = await api('GET', '/admin/bootstrap', null, token);
const savedParallel = boot3.data.appointments.filter((a) => a.name.startsWith(`Parallel ${RUN} `)).length;
check(
  `${free.length} bookings at once on different times: all saved`,
  free.length >= 2 && spread.every((r) => r.status === 200) && savedParallel === free.length,
  `${spread.map((r) => r.status).join(',')} saved=${savedParallel}`,
);

// The panel's light "anything new?" check changes when a booking comes in
const pulse1 = await api('GET', '/admin/pulse', null, token);
const extra = (await api('GET', '/availability?services=wax-chin&days=21')).data;
const extraDay = Object.keys(extra.days)[3] || Object.keys(extra.days)[0];
await api('POST', '/book', { ...booking, services: ['wax-chin'], date: extraDay, start: extra.days[extraDay][0], name: `Pulse Check ${RUN}`, phone: phone(), email: `pulse.${RUN}@example.com`, offers: true });
const pulse2 = await api('GET', '/admin/pulse', null, token);
check('new bookings change the pulse', pulse1.status === 200 && pulse1.data.pulse && pulse1.data.pulse !== pulse2.data.pulse);

// Offer texts: opt-in at booking, opt-out from the studio
const bootOffers = await api('GET', '/admin/bootstrap', null, token);
const pulseClient = bootOffers.data.clients.find((c) => c.name === `Pulse Check ${RUN}`);
check('opting in to offer texts is recorded with a date', pulseClient && pulseClient.marketing && pulseClient.marketing.sms === true && Boolean(pulseClient.marketing.at));
const optOut = await api('PATCH', `/admin/clients/${pulseClient.id}`, { marketing: false }, token);
check('the studio can record a STOP', optOut.status === 200 && optOut.data.client.marketing.sms === false && optOut.data.client.marketing.source === 'Studio');

// A client's own data: download, then erase
const exp = await api('GET', `/admin/clients/${pulseClient.id}/export`, null, token);
check('a client record downloads', exp.status === 200 && exp.data.kind === 'client-record' && exp.data.appointments.length === 1);
const eraseUpcoming = await api('POST', `/admin/clients/${pulseClient.id}/erase`, null, token);
check('erasing waits until upcoming visits are cancelled', eraseUpcoming.status === 409 && eraseUpcoming.data.code === 'upcoming');
const pulseAppt = bootOffers.data.appointments.find((a) => a.name === `Pulse Check ${RUN}`);
await api('PATCH', `/admin/appointments/${pulseAppt.id}`, { action: 'cancel', month: pulseAppt.date.slice(0, 7) }, token);
const erase = await api('POST', `/admin/clients/${pulseClient.id}/erase`, null, token);
const bootErased = await api('GET', '/admin/bootstrap', null, token);
const erasedAppt = bootErased.data.appointments.find((a) => a.id === pulseAppt.id);
check(
  'erasing removes the client and blanks their appointments',
  erase.status === 200 &&
    !bootErased.data.clients.some((c) => c.id === pulseClient.id) &&
    erasedAppt &&
    erasedAppt.name === 'Erased client' &&
    !erasedAppt.phone &&
    !erasedAppt.email &&
    erasedAppt.total === pulseAppt.total,
  JSON.stringify(erase.data),
);

// Records past the keep-for limit. Old records can't be made through the API,
// so this restores a backup with an old client and an old walk-in added, then puts
// the original back.
const snap = (await api('GET', '/admin/backup', null, token)).data;
const ancient = addDays(date, -900);
const oldPhone = phone();
const stamp = `${ancient}T15:00:00.000Z`;
const oldAppt = (id, name, extra) => ({
  id,
  date: ancient,
  start: '10:00',
  duration: 10,
  services: [{ id: 'wax-chin', name: 'Chin', price: 10, duration: 10 }],
  total: 10,
  status: 'completed',
  name,
  phone: '',
  email: '',
  instagram: '',
  notes: '',
  staffNotes: 'Old note',
  source: 'studio',
  createdAt: stamp,
  updatedAt: stamp,
  log: [],
  ...extra,
});
const withOld = {
  ...snap,
  settings: { ...snap.settings, privacy: { retentionYears: 1 } },
  clients: [...snap.clients, { id: `cl_old${RUN}`, name: `Long Gone ${RUN}`, phone: oldPhone, email: '', instagram: '', notes: 'Old notes', createdAt: stamp, updatedAt: stamp }],
  appointments: [
    ...snap.appointments,
    oldAppt(`ap_old${RUN}`, `Long Gone ${RUN}`, { clientId: `cl_old${RUN}`, phone: oldPhone }),
    oldAppt(`ap_walk${RUN}`, `Walk-in ${RUN}`, { clientId: '' }),
  ],
};
const restored = await api('POST', '/admin/restore', withOld, token);
const oldList = await api('GET', '/admin/privacy/old-records', null, token);
check(
  'records past the keep-for limit are found',
  restored.status === 200 && oldList.status === 200 && oldList.data.clients.some((c) => c.name === `Long Gone ${RUN}`) && oldList.data.looseAppointments >= 1,
  JSON.stringify(oldList.data),
);
const eraseOld = await api('POST', '/admin/privacy/old-records', null, token);
const bootOld = await api('GET', '/admin/backup', null, token);
const oldOnes = bootOld.data.appointments.filter((a) => a.id === `ap_old${RUN}` || a.id === `ap_walk${RUN}`);
check(
  'old records can be erased, keeping only bookkeeping details',
  eraseOld.status === 200 &&
    !bootOld.data.clients.some((c) => c.name === `Long Gone ${RUN}`) &&
    oldOnes.length === 2 &&
    oldOnes.every((a) => a.name === 'Erased client' && !a.staffNotes && a.total === 10),
  JSON.stringify(eraseOld.data),
);
await api('POST', '/admin/restore', snap, token);
const siteAfter = await api('GET', '/site');
check('the site shares the keep-for limit with the privacy page', siteAfter.data.privacy && siteAfter.data.privacy.retentionYears === 3);

// Instagram, against the stand-in API (scripts/mock-instagram.mjs) when it's running
const igToken = process.env.IG_TEST_TOKEN;
if (igToken) {
  const badIg = await api('POST', '/admin/instagram', { token: 'not-a-real-token-1234567890' }, token);
  check('a bad Instagram token is refused with a clear message', badIg.status === 400 && /token/i.test(badIg.data.error));
  const ig = await api('POST', '/admin/instagram', { token: igToken }, token);
  check('Instagram connects and pulls posts', ig.status === 200 && ig.data.instagram.connected && ig.data.instagram.posts.length >= 6, JSON.stringify(ig.data).slice(0, 300));
  check('the token never reaches the browser', !JSON.stringify(ig.data).includes(igToken));
  const siteIg = await api('GET', '/site');
  check('the site gets the latest posts', siteIg.data.instagram && siteIg.data.instagram.posts.length === 6 && siteIg.data.instagram.posts[0].permalink.startsWith('https://www.instagram.com/'));
  await api('PATCH', '/admin/instagram', { count: 3 }, token);
  const siteThree = await api('GET', '/site');
  check('the number of posts shown follows the setting', siteThree.data.instagram && siteThree.data.instagram.posts.length === 3);
  await api('PATCH', '/admin/instagram', { show: false }, token);
  const siteOff = await api('GET', '/site');
  check('posts can be switched off', siteOff.data.instagram === null);
  const off = await api('DELETE', '/admin/instagram', null, token);
  check('Instagram disconnects', off.status === 200 && off.data.instagram.connected === false);
} else {
  console.log('  skip Instagram checks (start scripts/mock-instagram.mjs and set IG_TEST_TOKEN=mock-test to run them)');
}

// Marking a reminder as texted
const boot4 = await api('GET', '/admin/bootstrap', null, token);
const someAppt = boot4.data.appointments.find((a) => a.status === 'pending');
const reminded = await api('PATCH', `/admin/appointments/${someAppt.id}`, { reminded: true, month: someAppt.date.slice(0, 7) }, token);
check('reminder texts are tracked', reminded.status === 200 && Boolean(reminded.data.appointment.remindedAt));

const backup = await api('GET', '/admin/backup', null, token);
check('backup downloads', backup.status === 200 && backup.data.kind === 'bare-beauty-backup');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
