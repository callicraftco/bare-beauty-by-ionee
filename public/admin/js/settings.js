// Settings: business details, hours, policies, messages, photos, Instagram, calendar,
// privacy, backup, password.
import {
  $,
  $$,
  S,
  addDays,
  api,
  confirmInline,
  copyText,
  download,
  esc,
  fillTemplate,
  formatTime,
  icon,
  saveToken,
  toCsv,
  toast,
  today,
  WEEKDAY_KEYS,
  WEEKDAY_NAMES,
} from './core.js';

const rerender = () => window.dispatchEvent(new Event('studio:render'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const settings = () => S.settingsDraft || S.data.settings;
function draft() {
  if (!S.settingsDraft) S.settingsDraft = clone(S.data.settings);
  return S.settingsDraft;
}

const TABS = [
  ['business', 'Business'],
  ['hours', 'Booking'],
  ['policies', 'Policies'],
  ['messages', 'Texts'],
  ['photos', 'Photos'],
  ['instagram', 'Instagram'],
  ['calendar', 'Calendar'],
  ['privacy', 'Privacy'],
  ['backup', 'Backup'],
  ['security', 'Password'],
];

const ZONES = [
  ['America/New_York', 'Eastern'],
  ['America/Chicago', 'Central'],
  ['America/Denver', 'Mountain'],
  ['America/Phoenix', 'Arizona'],
  ['America/Los_Angeles', 'Pacific'],
  ['America/Anchorage', 'Alaska'],
  ['Pacific/Honolulu', 'Hawaii'],
  ['America/Puerto_Rico', 'Atlantic (Puerto Rico)'],
];

const field = (id, label, value, attrs = '', hint = '') =>
  `<div class="field"><label for="${id}">${label}</label><input id="${id}" value="${esc(value ?? '')}" ${attrs}>${hint ? `<p class="hint">${hint}</p>` : ''}</div>`;
const area = (id, label, value, attrs = '', hint = '') =>
  `<div class="field"><label for="${id}">${label}</label><textarea id="${id}" ${attrs}>${esc(value ?? '')}</textarea>${hint ? `<p class="hint">${hint}</p>` : ''}</div>`;

// ---------- tabs

function tabBusiness() {
  const b = settings().business;
  const zones = ZONES.some(([z]) => z === b.timezone) ? ZONES : [...ZONES, [b.timezone, b.timezone]];
  return `<div class="stack">
    <div class="form-grid">
      ${field('b-name', 'Business name', b.name, 'data-path="business.name" maxlength="80"')}
      ${field('b-tagline', 'Tagline', b.tagline, 'data-path="business.tagline" maxlength="140"')}
    </div>
    <div class="form-grid">
      ${field('b-phone', 'Phone for texts and calls', b.phone, 'data-path="business.phone" type="tel" maxlength="30"', 'Shown on the site.')}
      ${field('b-email', 'Studio email', b.email, 'data-path="business.email" type="email" maxlength="160"', 'Shown on the site. Booking emails go here too.')}
      ${field('b-ig', 'Instagram handle', b.instagram, 'data-path="business.instagram" maxlength="60"')}
    </div>
    <div class="form-grid">
      ${field('b-area', 'Area you work in', b.area, 'data-path="business.area" maxlength="80" placeholder="Lakeland, FL"', 'Public. Shown on the site.')}
      ${area('b-address', 'Studio address', b.address, 'data-path="business.address" rows="2" maxlength="200"', 'Private. Only sent to clients once their appointment is confirmed.')}
    </div>
    ${area('b-about', 'About you', b.about, 'data-path="business.about" rows="5" maxlength="1500"', 'Shown under "Hi, I\'m Ionee". Leave a blank line between paragraphs.')}
    ${field('b-announce', 'Announcement bar', b.announcement, 'data-path="business.announcement" maxlength="160" placeholder="Booked through Nov 15. New openings every Monday."', 'Shows across the top of the site. Leave empty to hide it.')}
    <div class="field"><label for="b-tz">Time zone</label><select id="b-tz" data-path="business.timezone">${zones
      .map(([z, l]) => `<option value="${esc(z)}" ${z === b.timezone ? 'selected' : ''}>${esc(l)}</option>`)
      .join('')}</select></div>
  </div>`;
}

function tabHours() {
  const s = settings();
  const k = s.booking;
  const order = [1, 2, 3, 4, 5, 6, 0];
  return `<div class="stack">
    <section>
      <h2 class="section-title" style="margin-bottom:10px">Weekly hours</h2>
      <div class="hours-grid">${order
        .map((i) => {
          const key = WEEKDAY_KEYS[i];
          const h = s.hours[key];
          return `<div class="hours-row">
            <span>${WEEKDAY_NAMES[i]}</span>
            <label class="toggle"><input type="checkbox" data-path="hours.${key}.open" ${h.open ? 'checked' : ''}><span class="track"></span><span class="visually-hidden">Open on ${WEEKDAY_NAMES[i]}</span></label>
            <div class="hours-times field">${
              h.open
                ? `<input type="time" step="900" aria-label="${WEEKDAY_NAMES[i]} opens" data-path="hours.${key}.start" value="${esc(h.start)}"><span class="hint">to</span><input type="time" step="900" aria-label="${WEEKDAY_NAMES[i]} closes" data-path="hours.${key}.end" value="${esc(h.end)}">`
                : '<span class="hint">Closed</span>'
            }</div>
          </div>`;
        })
        .join('')}</div>
      <p class="hint" style="margin-top:8px">For a lunch break or a day off, use Block time on the Schedule.</p>
    </section>
    <section class="stack">
      <h2 class="section-title">Booking rules</h2>
      <fieldset class="field">
        <legend>When someone books online</legend>
        <label class="check-row"><input type="radio" name="mode" value="request" data-path="booking.mode" ${k.mode !== 'instant' ? 'checked' : ''}> I confirm each request first</label>
        <label class="check-row"><input type="radio" name="mode" value="instant" data-path="booking.mode" ${k.mode === 'instant' ? 'checked' : ''}> Confirm it right away</label>
      </fieldset>
      <div class="form-grid">
        <div class="field"><label for="k-step">Start times every</label><select id="k-step" data-path="booking.step">${[15, 30, 45, 60]
          .map((n) => `<option value="${n}" ${Number(k.step) === n ? 'selected' : ''}>${n} minutes</option>`)
          .join('')}</select></div>
        ${field('k-buffer', 'Cleanup time after each visit (minutes)', k.buffer, 'type="number" min="0" max="120" step="5" data-path="booking.buffer" data-num')}
        ${field('k-notice', 'Shortest notice (hours)', k.minNoticeHours, 'type="number" min="0" max="336" data-path="booking.minNoticeHours" data-num', 'How soon before a time it can still be booked online.')}
        ${field('k-ahead', 'Book up to (days ahead)', k.maxDaysAhead, 'type="number" min="7" max="365" data-path="booking.maxDaysAhead" data-num')}
        ${field('k-cancel', 'Online cancel cutoff (hours)', k.cancelNoticeHours, 'type="number" min="0" max="168" data-path="booking.cancelNoticeHours" data-num', 'Clients can cancel with their link up to this many hours before. Your booking terms page updates by itself. Change the cancel answer in Policies to match.')}
      </div>
      ${area('k-pay', 'Payment and deposit note', k.paymentNote, 'rows="2" maxlength="400" data-path="booking.paymentNote" placeholder="Payment is due at your appointment. Cash, Zelle and Cash App accepted."', 'Shown when clients book and in confirmations.')}
    </section>
  </div>`;
}

function tabPolicies() {
  const faq = settings().faq;
  return `<div class="stack">
    <p class="page-sub">These show in "Before you come" on the site. Keep each answer short.</p>
    <div>${faq
      .map(
        (f, i) => `<div class="faq-edit">
        <div class="field"><label for="q-${i}">Question</label><input id="q-${i}" data-faq="${i}" data-k="q" value="${esc(f.q)}" maxlength="160"></div>
        <div class="field"><label for="a-${i}">Answer</label><textarea id="a-${i}" data-faq="${i}" data-k="a" rows="3" maxlength="1500">${esc(f.a)}</textarea></div>
        <div class="row-actions">
          <button type="button" class="btn btn-quiet btn-small" data-faq-move="-1" data-i="${i}" ${i === 0 ? 'disabled' : ''}>${icon('up', 16)} Up</button>
          <button type="button" class="btn btn-quiet btn-small" data-faq-move="1" data-i="${i}" ${i === faq.length - 1 ? 'disabled' : ''}>${icon('down', 16)} Down</button>
          <button type="button" class="btn btn-danger-quiet btn-small" data-faq-del data-i="${i}">Remove</button>
        </div>
      </div>`,
      )
      .join('')}</div>
    <div><button type="button" class="btn btn-quiet" data-faq-add>${icon('plus', 18)} Add a question</button></div>
  </div>`;
}

const TEMPLATE_INFO = [
  ['confirm', 'Confirmation', 'Sent after you confirm a booking.'],
  ['reminder', 'Reminder', 'For the day before.'],
  ['decline', 'Ask to pick another time', 'When a requested time does not work.'],
  ['thanks', 'Thank-you', 'After a visit.'],
  ['rebook', 'Invite back', 'For clients who are due for their next visit.'],
];

function sampleAppt() {
  let d = addDays(today(), 1);
  return {
    name: 'Jasmine Reyes',
    services: [{ id: 'classic-glow-facial', name: 'Classic Glow Facial', price: 60 }],
    date: d,
    start: '10:30',
    total: 60,
    manageUrl: `${location.origin}/appointment/?id=sample`,
  };
}

function tabMessages() {
  const t = settings().templates;
  const sample = sampleAppt();
  return `<div class="stack">
    <p class="page-sub">The Text buttons open Messages on your phone with these filled in. You can edit before sending.</p>
    <p class="hint">Fill-ins: {first} first name, {services}, {date}, {time}, {total}, {address}, {book} booking page, {link} their own appointment link, {service} last service, {instagram}.</p>
    ${TEMPLATE_INFO.map(
      ([key, label, help]) => `<div class="faq-edit">
        <div class="field"><label for="t-${key}">${label}</label><textarea id="t-${key}" rows="3" maxlength="700" data-path="templates.${key}">${esc(t[key] || '')}</textarea><p class="hint">${help}</p></div>
        <p class="tpl-preview" data-preview="${key}">${esc(fillTemplate(t[key], { appt: sample, client: { name: sample.name }, service: 'Classic Glow Facial' }))}</p>
      </div>`,
    ).join('')}
  </div>`;
}

function photoCard(m, i, count) {
  return `<div class="photo-card">
    <img src="${esc(m.url)}" alt="${esc(m.alt || '')}" loading="lazy">
    <div class="photo-tools">
      <button type="button" class="icon-btn" data-photo-move="-1" data-id="${esc(m.id)}" aria-label="Move earlier" ${i === 0 ? 'disabled' : ''}>${icon('left', 18)}</button>
      <button type="button" class="icon-btn" data-photo-del="${esc(m.id)}" aria-label="Remove photo">${icon('trash', 18)}</button>
      <button type="button" class="icon-btn" data-photo-move="1" data-id="${esc(m.id)}" aria-label="Move later" ${i === count - 1 ? 'disabled' : ''}>${icon('right', 18)}</button>
    </div>
    <label class="visually-hidden" for="alt-${esc(m.id)}">Describe this photo</label>
    <input id="alt-${esc(m.id)}" data-alt="${esc(m.id)}" value="${esc(m.alt || '')}" placeholder="Describe it, e.g. hybrid lash set" maxlength="150">
  </div>`;
}

function tabPhotos() {
  const media = S.data.media;
  const portrait = media.find((m) => m.kind === 'about');
  const gallery = media.filter((m) => m.kind === 'gallery').sort((a, b) => (a.order || 0) - (b.order || 0));
  return `<div class="stack">
    <section class="stack">
      <h2 class="section-title">Your photo</h2>
      <div class="portrait">
        ${portrait ? `<img src="${esc(portrait.url)}" alt="${esc(portrait.alt || 'Ionee')}">` : '<div class="ph" aria-hidden="true"></div>'}
        <div class="stack">
          <p class="hint">Shown next to "Hi, I'm Ionee". A portrait photo works best.</p>
          <div class="row-actions">
            <label class="btn btn-quiet btn-small">${icon('photo', 18)} ${portrait ? 'Replace photo' : 'Add photo'}<input type="file" accept="image/*" data-upload="about" class="visually-hidden"></label>
            ${portrait ? `<button type="button" class="btn btn-danger-quiet btn-small" data-photo-del="${esc(portrait.id)}">Remove</button>` : ''}
          </div>
        </div>
      </div>
    </section>
    <section class="stack">
      <div class="section-head"><h2 class="section-title">Your work (${gallery.length} of 24)</h2>
        <label class="btn btn-primary btn-small">${icon('plus', 18)} Add photos<input type="file" accept="image/*" multiple data-upload="gallery" class="visually-hidden"></label></div>
      <p class="hint">Shows as "Recent work" on the site. Photos are resized before upload so the site stays fast.</p>
      <div data-upload-status></div>
      ${gallery.length ? `<div class="photo-grid">${gallery.map((m, i) => photoCard(m, i, gallery.length)).join('')}</div>` : '<p class="empty">No photos yet. The section stays hidden on the site until you add some.</p>'}
    </section>
  </div>`;
}

// ---------- Instagram

function ago(iso) {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 36) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} days ago`;
}

const thumb = (url) => `/.netlify/images?url=${encodeURIComponent(url)}&w=200&h=250&fit=cover`;

function tabInstagram() {
  const ig = S.data.instagram || { connected: false };
  if (!ig.connected) {
    return `<div class="stack">
      <section class="panel panel-pad stack">
        <h2 class="section-title">Show your Instagram posts on your site</h2>
        <p class="hint">Your latest posts fill "Recent work" on the home page and update by themselves every few hours. Each one links to the post on Instagram.</p>
        <form class="form" data-ig-form novalidate>
          <div class="field"><label for="ig-token">Instagram access token</label><input id="ig-token" type="password" autocomplete="off" spellcheck="false" placeholder="Paste the whole token here"></div>
          <p class="form-error" data-ig-error role="alert"></p>
          <div class="row-actions"><button type="submit" class="btn btn-primary btn-small">Connect Instagram</button></div>
        </form>
        <p class="hint">Getting the token is a one-time, 15-minute job in Meta's developer site. The setup guide that came with the site has the steps ("Instagram feed"). Your Instagram has to be a professional account (Creator or Business). Switching is free in the Instagram app.</p>
      </section>
    </div>`;
  }
  const soon = ig.expiresAt && Date.parse(ig.expiresAt) - Date.now() < 7 * 86400000;
  const line = ig.lastError
    ? `<p class="status-line"><span class="dot-off"></span> ${esc(ig.lastError)}</p>`
    : `<p class="status-line"><span class="dot-ok"></span> Connected to @${esc(ig.username)}. Updated ${esc(ago(ig.lastSyncOk))}.</p>`;
  const posts = ig.posts || [];
  return `<div class="stack">
    <section class="panel panel-pad stack">
      <h2 class="section-title">Instagram feed</h2>
      ${line}
      ${soon && !ig.lastError ? '<p class="hint">The connection renews by itself. If this message stays for more than a day, connect again with a new token.</p>' : ''}
      ${!ig.fresh && posts.length ? '<p class="hint">Posts are hidden on the site until the next good update, because Instagram photo links expire after a few days.</p>' : ''}
      <div class="row-actions">
        <button type="button" class="btn btn-quiet btn-small" data-ig-sync>${icon('refresh', 16)} Update now</button>
        <a class="btn btn-quiet btn-small" href="https://www.instagram.com/${esc(encodeURIComponent(ig.username || ''))}/" target="_blank" rel="noopener">${icon('insta', 16)} Open Instagram</a>
      </div>
    </section>
    <section class="stack">
      <h2 class="section-title">On your website</h2>
      <label class="check-row"><input type="checkbox" data-ig-show ${ig.show ? 'checked' : ''}> Show my Instagram posts in "Recent work"</label>
      <div class="field" style="max-width:260px"><label for="ig-count">How many posts</label><select id="ig-count" data-ig-count>${[3, 6, 9, 12]
        .map((n) => `<option value="${n}" ${Number(ig.count) === n ? 'selected' : ''}>${n} posts</option>`)
        .join('')}</select></div>
      <p class="hint">When this is off, or Instagram can't be reached for 3 days, the site shows your own photos from the Photos tab instead.</p>
    </section>
    <section class="stack">
      <h2 class="section-title">Latest posts (${posts.length})</h2>
      ${
        posts.length
          ? `<div class="ig-grid">${posts
              .slice(0, 12)
              .map((p, i) => `<a class="ig-thumb${i >= Number(ig.count) ? ' is-extra' : ''}" href="${esc(p.permalink)}" target="_blank" rel="noopener"><img src="${esc(thumb(p.image))}" alt="${esc(p.alt || 'Instagram post')}" loading="lazy" width="200" height="250"></a>`)
              .join('')}</div><p class="hint">Faded posts are saved but not shown, because of the number you picked.</p>`
          : '<p class="empty">No posts yet. Tap Update now after you post.</p>'
      }
    </section>
    <section class="stack">
      <h2 class="section-title">Disconnect</h2>
      <p class="hint">Stops showing posts and deletes the saved token and posts from your site.</p>
      <div class="row-actions" data-ig-disconnect-box><button type="button" class="btn btn-danger-quiet btn-small" data-ig-disconnect>Disconnect Instagram</button></div>
    </section>
  </div>`;
}

// ---------- privacy

const KEEP = [
  [1, '1 year'],
  [2, '2 years'],
  [3, '3 years'],
  [4, '4 years'],
  [5, '5 years'],
  [7, '7 years'],
  [0, "Keep until I erase them"],
];

function checkLine(check, years) {
  if (!years) return 'Records are kept until you erase them. Turn on a limit above to have old records cleared each month.';
  if (!check) return 'Not checked yet.';
  const parts = [];
  if (check.clients) parts.push(`${check.clients} client${check.clients === 1 ? '' : 's'} with no visit in over ${years} year${years === 1 ? '' : 's'}`);
  if (check.looseAppointments) parts.push(`${check.looseAppointments} older appointment${check.looseAppointments === 1 ? '' : 's'} with a name but no client record`);
  const last = check.lastErase ? ` Last clean-up: ${new Date(check.lastErase.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, ${check.lastErase.clients} client${check.lastErase.clients === 1 ? '' : 's'} erased.` : '';
  return `${parts.length ? `${parts.join(' and ')}. They'll be erased on the 1st.` : 'Nothing past the limit.'}${last}`;
}

function tabPrivacy() {
  const s = settings();
  const years = Number(s.privacy && s.privacy.retentionYears) || 0;
  const reviewed = Boolean(S.data.settings.setup.policiesReviewed);
  return `<div class="stack">
    <section class="panel panel-pad stack">
      <h2 class="section-title">Your policy pages</h2>
      <p class="hint">Linked at the bottom of every page and in the booking form. They fill in your business name, contact details, cancel cutoff and keep-for limit by themselves.</p>
      <div class="row-actions">
        <a class="btn btn-quiet btn-small" href="/privacy/" target="_blank" rel="noopener">Privacy policy</a>
        <a class="btn btn-quiet btn-small" href="/terms/" target="_blank" rel="noopener">Booking terms</a>
        <a class="btn btn-quiet btn-small" href="/accessibility/" target="_blank" rel="noopener">Accessibility</a>
      </div>
      <p class="hint">They're a careful starting point, not legal advice. Read them, and have someone who knows your state's rules look them over before you share the site.</p>
      <div class="row-actions">${
        reviewed
          ? `<span class="status-line"><span class="dot-ok"></span> Marked as read</span>`
          : '<button type="button" class="btn btn-primary btn-small" data-policies-read>I\'ve read them</button>'
      }</div>
    </section>
    <section class="stack">
      <h2 class="section-title">How long to keep client records</h2>
      <div class="field" style="max-width:320px"><label for="pv-years">Erase a client's details after no visit for</label><select id="pv-years" data-path="privacy.retentionYears" data-num>${KEEP.map(
        ([n, l]) => `<option value="${n}" ${years === n ? 'selected' : ''}>${l}</option>`,
      ).join('')}</select></div>
      <p class="hint">On the 1st of each month, clients past this limit are erased: name, contact details and notes. Dates, services and prices stay for your bookkeeping. Your privacy policy says the same thing, and updates when you change this. If your state board asks you to keep client records for a set time, don't go below it.</p>
    </section>
    <section class="panel panel-pad stack" data-old-box>
      <h2 class="section-title">Records past the limit</h2>
      <p class="hint" data-old-line>${esc(checkLine(S.data.privacyCheck, Number(S.data.settings.privacy && S.data.settings.privacy.retentionYears) || 0))}</p>
      <div data-old-list></div>
      <div class="row-actions">
        <button type="button" class="btn btn-quiet btn-small" data-old-check>Check now</button>
      </div>
    </section>
    <section class="panel panel-pad stack">
      <h2 class="section-title">When a client asks about their information</h2>
      <ol class="help-steps">
        <li>Open Clients and tap their name.</li>
        <li>Under Privacy, tap Download their data to send them a copy, or Erase their details to delete it.</li>
        <li>Anyone who replies STOP to an offer text: mark them as opted out in the same place.</li>
      </ol>
    </section>
  </div>`;
}

function tabCalendar() {
  const d = S.data;
  return `<div class="stack">
    <section class="panel panel-pad stack">
      <h2 class="section-title">See bookings in your phone's calendar</h2>
      <p class="hint">This private link lists your appointments. Add it once and new bookings show up in your calendar app.</p>
      <div class="code-line field"><input value="${esc(d.feedUrl)}" readonly aria-label="Calendar link" data-feed><button type="button" class="btn btn-quiet btn-small" data-copy-feed>${icon('copy', 16)} Copy</button></div>
      <div>
        <p class="hint"><strong>iPhone:</strong></p>
        <ol class="help-steps"><li>Copy the link.</li><li>Open Settings, then Calendar, then Calendar Accounts.</li><li>Tap Add Account, then Other, then Add Subscribed Calendar.</li><li>Paste the link and tap Next, then Save.</li></ol>
        <p class="hint" style="margin-top:10px"><strong>Google Calendar</strong> (on a computer):</p>
        <ol class="help-steps"><li>Next to "Other calendars", click the plus sign, then From URL.</li><li>Paste the link and click Add calendar.</li><li>Google can take several hours to pick up changes. iPhone checks more often.</li></ol>
      </div>
      <div><button type="button" class="link-btn" data-reset-feed>Make a new link</button> <span class="hint">Use this if the link was shared by mistake. The old one stops working.</span></div>
    </section>
    <section class="panel panel-pad stack">
      <h2 class="section-title">Booking emails</h2>
      ${
        d.mail.enabled
          ? `<p class="status-line"><span class="dot-ok"></span> Email is on. New bookings and cancellations go to ${esc(d.mail.ownerEmail || 'your studio email')}. Clients who give an email get confirmations and a reminder the day before.</p>
             <div><button type="button" class="btn btn-quiet btn-small" data-test-email>${icon('mail', 16)} Send me a test email</button></div>`
          : `<p class="status-line"><span class="dot-off"></span> Email is off.</p>
             <p class="hint">Bookings still show up here, in the calendar link above, and as a badge on Today. To also get an email for each booking, the site needs a free Resend account connected in Netlify. The setup guide that came with the site walks through it in about 10 minutes.</p>`
      }
    </section>
  </div>`;
}

function tabBackup() {
  return `<div class="stack">
    <section class="panel panel-pad stack">
      <h2 class="section-title">Download a backup</h2>
      <p class="hint">One file with your settings, menu, clients and every appointment. Keep a copy somewhere safe, like Google Drive, once a month.</p>
      <div class="row-actions"><button type="button" class="btn btn-primary btn-small" data-backup>Download backup</button></div>
    </section>
    <section class="panel panel-pad stack">
      <h2 class="section-title">Spreadsheets</h2>
      <p class="hint">Open these in Excel, Numbers or Google Sheets.</p>
      <div class="row-actions"><button type="button" class="btn btn-quiet btn-small" data-csv="appointments">Appointments (CSV)</button><button type="button" class="btn btn-quiet btn-small" data-csv="clients">Clients (CSV)</button></div>
    </section>
    <section class="panel panel-pad stack" data-restore-box>
      <h2 class="section-title">Restore from a backup</h2>
      <p class="hint">Replaces everything here with what's in the file. Photos are not included in backups and stay as they are.</p>
      <div class="row-actions"><label class="btn btn-quiet btn-small">Choose backup file<input type="file" accept="application/json,.json" data-restore class="visually-hidden"></label></div>
    </section>
  </div>`;
}

function tabSecurity() {
  return `<div class="stack">
    <section class="panel panel-pad stack">
      <h2 class="section-title">${S.data.hasOwnPassword ? 'Change your password' : 'Choose your own password'}</h2>
      <p class="hint">At least 8 characters. Saving signs out your other phones and computers. Your web person's setup password keeps working too, as a backup way in.</p>
      <form class="form" data-password-form novalidate>
        <div class="form-grid">
          <div class="field"><label for="pw1">New password</label><input id="pw1" type="password" autocomplete="new-password" minlength="8"></div>
          <div class="field"><label for="pw2">Type it again</label><input id="pw2" type="password" autocomplete="new-password" minlength="8"></div>
        </div>
        <p class="form-error" data-pw-error></p>
        <div class="row-actions"><button type="submit" class="btn btn-primary btn-small">Save password</button></div>
      </form>
    </section>
    <section class="panel panel-pad stack">
      <h2 class="section-title">Signed in somewhere you shouldn't be?</h2>
      <p class="hint">Signs out every phone and computer except this one.</p>
      <div class="row-actions"><button type="button" class="btn btn-quiet btn-small" data-signout-all>Sign out everywhere else</button></div>
    </section>
  </div>`;
}

const DRAFT_TABS = ['business', 'hours', 'policies', 'messages', 'privacy'];

function render(main) {
  const tab = TABS.some(([k]) => k === S.settingsTab) ? S.settingsTab : 'business';
  const body = {
    business: tabBusiness,
    hours: tabHours,
    policies: tabPolicies,
    messages: tabMessages,
    photos: tabPhotos,
    instagram: tabInstagram,
    calendar: tabCalendar,
    privacy: tabPrivacy,
    backup: tabBackup,
    security: tabSecurity,
  }[tab]();
  main.innerHTML = `
    <div class="page-head"><div><h1 class="page-title">Settings</h1></div></div>
    <div class="tabs" role="tablist" aria-label="Settings">${TABS.map(
      ([k, l]) => `<button type="button" role="tab" aria-selected="${k === tab}" data-tab="${k}">${l}</button>`,
    ).join('')}</div>
    <div role="tabpanel">${body}</div>
    ${
      DRAFT_TABS.includes(tab)
        ? `<div class="save-bar" data-save-bar ${S.settingsDraft ? '' : 'hidden'}><span>You have unsaved changes.</span><div class="row-actions"><button type="button" class="btn btn-quiet btn-small" data-discard>Discard</button><button type="button" class="btn btn-primary btn-small" data-save>Save</button></div></div>`
        : ''
    }`;
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = value;
}

function showSaveBar() {
  const bar = $('[data-save-bar]');
  if (bar) bar.hidden = !S.settingsDraft;
}

function input(e) {
  const t = e.target;
  if (t.dataset.path) {
    let value = t.type === 'checkbox' ? t.checked : t.value;
    if (t.dataset.num !== undefined || t.dataset.path === 'booking.step') value = value === '' ? '' : Number(value);
    if (t.type === 'radio' && !t.checked) return;
    setPath(draft(), t.dataset.path, value);
    showSaveBar();
    if (t.dataset.path.startsWith('templates.')) {
      const key = t.dataset.path.split('.')[1];
      const sample = sampleAppt();
      const box = $(`[data-preview="${key}"]`);
      if (box) box.textContent = fillTemplate(value, { appt: sample, client: { name: sample.name }, service: 'Classic Glow Facial' });
    }
    return;
  }
  if (t.dataset.faq !== undefined) {
    draft().faq[Number(t.dataset.faq)][t.dataset.k] = t.value;
    showSaveBar();
  }
}

async function change(e) {
  const t = e.target;
  if (t.dataset.path && (t.type === 'checkbox' || t.type === 'radio' || t.tagName === 'SELECT')) {
    input(e);
    if (t.dataset.path.endsWith('.open')) rerender();
    return;
  }
  if (t.matches('[data-ig-show]') || t.matches('[data-ig-count]')) {
    const body = t.matches('[data-ig-show]') ? { show: t.checked } : { count: Number(t.value) };
    try {
      const res = await api('PATCH', '/admin/instagram', body);
      S.data.instagram = res.instagram;
      rerender();
      toast('Saved. The website shows it within a few minutes.');
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  if (t.matches('[data-upload]')) return upload(t);
  if (t.matches('[data-alt]')) {
    try {
      const res = await api('PATCH', '/admin/media', { items: [{ id: t.dataset.alt, alt: t.value }] });
      S.data.media = res.media;
      toast('Description saved.');
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  if (t.matches('[data-restore]')) return restore(t);
}

async function save() {
  const d = draft();
  for (const key of WEEKDAY_KEYS) {
    const h = d.hours[key];
    if (h.open && h.end <= h.start) return toast(`Closing time has to be after opening time on ${WEEKDAY_NAMES[WEEKDAY_KEYS.indexOf(key)]}.`);
  }
  if (S.settingsTab === 'hours') d.setup = { ...d.setup, hoursReviewed: true };
  d.faq = d.faq.filter((f) => String(f.q).trim() && String(f.a).trim());
  const btn = $('[data-save]');
  if (btn) btn.disabled = true;
  try {
    const res = await api('PUT', '/admin/settings', d);
    S.data.settings = res.settings;
    S.settingsDraft = null;
    rerender();
    toast('Saved. The website shows it within a few minutes.');
  } catch (err) {
    toast(err.message);
    if (btn) btn.disabled = false;
  }
}

// ---------- photos

async function shrink(file, max = 1600) {
  let source;
  let w;
  let h;
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
    w = source.width;
    h = source.height;
  } catch {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    source = img;
    w = img.naturalWidth;
    h = img.naturalHeight;
  }
  const scale = Math.min(1, max / Math.max(w, h));
  const cw = Math.round(w * scale);
  const ch = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  canvas.getContext('2d').drawImage(source, 0, 0, cw, ch);
  let blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.82));
  if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  return { blob, w: cw, h: ch };
}

async function upload(inputEl) {
  const kind = inputEl.dataset.upload;
  const files = [...inputEl.files];
  inputEl.value = '';
  if (!files.length) return;
  const status = $('[data-upload-status]');
  let done = 0;
  for (const file of files) {
    if (status) status.innerHTML = `<p class="hint">Uploading ${done + 1} of ${files.length}...</p>`;
    try {
      const { blob, w, h } = await shrink(file, kind === 'gallery' ? 1200 : 1400);
      const qs = new URLSearchParams({ kind, w: String(w), h: String(h), alt: kind === 'about' ? 'Ionee' : '' });
      const res = await api('POST', `/admin/media?${qs}`, blob, { contentType: blob.type });
      if (kind === 'about') S.data.media = S.data.media.filter((m) => m.kind !== 'about');
      S.data.media.push(res.media);
      done++;
    } catch (err) {
      toast(`${file.name}: ${err.message}`);
    }
  }
  rerender();
  if (done) toast(done === 1 ? 'Photo added.' : `${done} photos added.`);
}

async function movePhoto(id, dir) {
  const gallery = S.data.media.filter((m) => m.kind === 'gallery').sort((a, b) => (a.order || 0) - (b.order || 0));
  const i = gallery.findIndex((m) => m.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= gallery.length) return;
  [gallery[i], gallery[j]] = [gallery[j], gallery[i]];
  const items = gallery.map((m, n) => ({ id: m.id, order: n + 1 }));
  try {
    const res = await api('PATCH', '/admin/media', { items });
    S.data.media = res.media;
    rerender();
  } catch (err) {
    toast(err.message);
  }
}

// ---------- backup

async function fetchBackup() {
  return api('GET', '/admin/backup');
}

async function exportCsv(kind) {
  try {
    const b = await fetchBackup();
    const stamp = today();
    if (kind === 'appointments') {
      const rows = [['Date', 'Start', 'Length (min)', 'Status', 'Client', 'Phone', 'Email', 'Instagram', 'Services', 'Total', 'Booked', 'First visit', 'Client notes', 'Your notes', 'Created']];
      for (const a of [...b.appointments].sort((x, y) => x.date.localeCompare(y.date) || x.start.localeCompare(y.start))) {
        rows.push([a.date, formatTime(a.start), a.duration, a.status, a.name, a.phone, a.email, a.instagram, a.services.map((s) => s.name).join('; '), a.total, a.source === 'online' ? 'Online' : 'Studio', a.firstVisit ? 'Yes' : '', a.notes, a.staffNotes, (a.createdAt || '').slice(0, 10)]);
      }
      download(`appointments-${stamp}.csv`, toCsv(rows));
    } else {
      const rows = [['Name', 'Phone', 'Email', 'Instagram', 'Visits', 'Spent', 'Last visit', 'Notes', 'Client since']];
      for (const c of b.clients) {
        const mine = b.appointments.filter((a) => a.clientId === c.id && a.status === 'completed').sort((x, y) => x.date.localeCompare(y.date));
        rows.push([c.name, c.phone, c.email, c.instagram, mine.length, mine.reduce((s, a) => s + (Number(a.total) || 0), 0), mine.length ? mine[mine.length - 1].date : '', c.notes, (c.createdAt || '').slice(0, 10)]);
      }
      download(`clients-${stamp}.csv`, toCsv(rows));
    }
  } catch (err) {
    toast(err.message);
  }
}

async function restore(inputEl) {
  const file = inputEl.files[0];
  inputEl.value = '';
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return toast('That file could not be read.');
  }
  if (data.kind !== 'bare-beauty-backup') return toast('That file is not a studio backup.');
  const box = $('[data-restore-box]');
  const ok = await confirmInline(box, `Replace everything with the backup from ${String(data.exportedAt || '').slice(0, 10)}? It has ${data.appointments?.length || 0} appointments and ${data.clients?.length || 0} clients.`, {
    yes: 'Restore',
    no: 'Cancel',
    danger: true,
  });
  if (!ok) return;
  try {
    await api('POST', '/admin/restore', data);
    S.settingsDraft = null;
    S.menuDraft = null;
    window.dispatchEvent(new Event('studio:refresh'));
    toast('Backup restored.');
  } catch (err) {
    toast(err.message);
  }
}

// ---------- clicks

async function click(e) {
  const t = e.target;
  const tab = t.closest('[data-tab]');
  if (tab) {
    S.settingsTab = tab.dataset.tab;
    return rerender();
  }
  if (t.closest('[data-save]')) return save();
  if (t.closest('[data-discard]')) {
    S.settingsDraft = null;
    rerender();
    return toast('Changes discarded.');
  }
  if (t.closest('[data-faq-add]')) {
    draft().faq.push({ id: `faq-${Math.random().toString(36).slice(2, 8)}`, q: '', a: '' });
    rerender();
    const last = $$('[data-faq][data-k="q"]').pop();
    if (last) last.focus();
    return;
  }
  const fm = t.closest('[data-faq-move]');
  if (fm) {
    const list = draft().faq;
    const i = Number(fm.dataset.i);
    const j = i + Number(fm.dataset.faqMove);
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    return rerender();
  }
  const fd = t.closest('[data-faq-del]');
  if (fd) {
    draft().faq.splice(Number(fd.dataset.i), 1);
    return rerender();
  }
  const pm = t.closest('[data-photo-move]');
  if (pm) return movePhoto(pm.dataset.id, Number(pm.dataset.photoMove));
  const pd = t.closest('[data-photo-del]');
  if (pd) {
    const ok = await confirmInline(pd.closest('.photo-card, .portrait, section') || $('[data-main]'), 'Remove this photo from the site?', { yes: 'Remove', no: 'Keep', danger: true });
    if (!ok) return;
    try {
      await api('DELETE', `/admin/media/${pd.dataset.photoDel}`);
      S.data.media = S.data.media.filter((m) => m.id !== pd.dataset.photoDel);
      rerender();
      toast('Photo removed.');
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  if (t.closest('[data-copy-feed]')) {
    const ok = await copyText(S.data.feedUrl);
    return toast(ok ? 'Calendar link copied.' : 'Select the link and copy it.');
  }
  if (t.closest('[data-reset-feed]')) {
    const ok = await confirmInline(t.closest('section'), 'Make a new calendar link? Calendars using the old one stop updating.', { yes: 'Make a new link', no: 'Keep the old one' });
    if (!ok) return;
    try {
      const res = await api('POST', '/admin/feed-reset');
      S.data.feedUrl = res.feedUrl;
      rerender();
      toast('New link ready. Add it to your calendar again.');
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  if (t.closest('[data-test-email]')) {
    try {
      const res = await api('POST', '/admin/test-email');
      toast(`Test email sent to ${res.to}.`);
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  if (t.closest('[data-backup]')) {
    try {
      const b = await fetchBackup();
      download(`bare-beauty-backup-${today()}.json`, JSON.stringify(b, null, 2), 'application/json');
      toast('Backup downloaded.');
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  const csv = t.closest('[data-csv]');
  if (csv) return exportCsv(csv.dataset.csv);
  if (t.closest('[data-ig-sync]')) {
    const btn = t.closest('[data-ig-sync]');
    btn.disabled = true;
    try {
      const res = await api('POST', '/admin/instagram/sync');
      S.data.instagram = res.instagram;
      rerender();
      toast(res.ok ? 'Instagram posts updated.' : res.error || 'Instagram could not be updated.');
    } catch (err) {
      btn.disabled = false;
      toast(err.message);
    }
    return;
  }
  if (t.closest('[data-ig-disconnect]')) {
    const ok = await confirmInline($('[data-ig-disconnect-box]'), 'Disconnect Instagram? Posts disappear from your site. You can connect again any time with a new token.', {
      yes: 'Disconnect',
      no: 'Keep it',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await api('DELETE', '/admin/instagram');
      S.data.instagram = res.instagram;
      rerender();
      toast('Instagram disconnected.');
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  if (t.closest('[data-policies-read]')) {
    try {
      const next = { ...S.data.settings, setup: { ...S.data.settings.setup, policiesReviewed: true } };
      const res = await api('PUT', '/admin/settings', next);
      S.data.settings = res.settings;
      if (S.settingsDraft) S.settingsDraft.setup = { ...S.settingsDraft.setup, policiesReviewed: true };
      rerender();
      toast('Marked as read.');
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  if (t.closest('[data-old-check]')) return checkOld();
  if (t.closest('[data-old-erase]')) return eraseOld();
  if (t.closest('[data-signout-all]')) {
    try {
      const res = await api('POST', '/admin/signout-all');
      saveToken(res.token);
      toast('Signed out everywhere else.');
    } catch (err) {
      toast(err.message);
    }
  }
}

// ---------- privacy actions

async function checkOld() {
  const box = $('[data-old-list]');
  try {
    const res = await api('GET', '/admin/privacy/old-records');
    S.data.privacyCheck = { ...(S.data.privacyCheck || {}), checkedAt: res.checkedAt, years: res.years, clients: res.clients.length, looseAppointments: res.looseAppointments };
    $('[data-old-line]').textContent = checkLine(S.data.privacyCheck, res.years);
    if (!box) return;
    if (!res.clients.length && !res.looseAppointments) {
      box.innerHTML = '';
      return;
    }
    box.innerHTML = `${
      res.clients.length
        ? `<ul class="plain-list">${res.clients
            .map((c) => `<li>${esc(c.name)} <span class="hint">last visit ${esc(c.lastVisit)}, ${c.appointments} appointment${c.appointments === 1 ? '' : 's'}</span></li>`)
            .join('')}</ul>`
        : ''
    }<div class="row-actions" data-old-erase-box><button type="button" class="btn btn-danger-quiet btn-small" data-old-erase>Erase these now</button></div>`;
  } catch (err) {
    toast(err.message);
  }
}

async function eraseOld() {
  const ok = await confirmInline($('[data-old-erase-box]'), 'Erase these records now? Names, contact details and notes are removed for good. Dates, services and prices stay.', {
    yes: 'Erase now',
    no: 'Not now',
    danger: true,
  });
  if (!ok) return;
  try {
    const res = await api('POST', '/admin/privacy/old-records');
    toast(`Erased ${res.clients} client${res.clients === 1 ? '' : 's'}.`);
    window.dispatchEvent(new Event('studio:refresh'));
  } catch (err) {
    toast(err.message);
  }
}

async function submit(e) {
  if (e.target.matches('[data-ig-form]')) {
    e.preventDefault();
    const input = $('#ig-token');
    const err = $('[data-ig-error]');
    const btn = e.target.querySelector('[type="submit"]');
    err.textContent = '';
    if (!input.value.trim()) {
      err.textContent = 'Paste the access token first.';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Connecting...';
    try {
      const res = await api('POST', '/admin/instagram', { token: input.value.trim() });
      S.data.instagram = res.instagram;
      rerender();
      toast(`Connected to @${res.instagram.username}.`);
    } catch (er) {
      err.textContent = er.message;
      btn.disabled = false;
      btn.textContent = 'Connect Instagram';
    }
    return;
  }
  if (!e.target.matches('[data-password-form]')) return;
  e.preventDefault();
  const a = $('#pw1').value;
  const b = $('#pw2').value;
  const err = $('[data-pw-error]');
  err.textContent = '';
  if (a.length < 8) return (err.textContent = 'Use at least 8 characters.');
  if (a !== b) return (err.textContent = "Those don't match.");
  try {
    const res = await api('POST', '/admin/password', { password: a });
    // A new password signs out other devices. This one keeps working with a fresh session.
    if (res.token) saveToken(res.token);
    S.data.hasOwnPassword = true;
    rerender();
    toast('Password saved. Other phones and computers are signed out.');
  } catch (er) {
    err.textContent = er.message;
  }
}

export default { render, click, input, change, submit };
