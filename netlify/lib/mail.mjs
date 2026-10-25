// Optional email through Resend (free tier: 100 emails a day, 3,000 a month).
// Turned on by setting RESEND_API_KEY and MAIL_FROM in Netlify. Without them,
// nothing is sent and the site works the same.
import { escapeHtml as e, firstName, formatMoney } from './util.mjs';
import { formatDateLong, formatDuration, formatTime } from './time.mjs';

export function mailEnabled() {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export function ownerEmail(settings) {
  return process.env.NOTIFY_EMAIL || settings.business.email || '';
}

export async function sendMail({ to, subject, html, text, replyTo }) {
  if (!mailEnabled() || !to) return { skipped: true };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!res.ok) {
      console.error('Email failed', res.status, await res.text());
      return { ok: false, status: res.status };
    }
    return { ok: true };
  } catch (err) {
    console.error('Email error', err);
    return { ok: false };
  }
}

const C = {
  bg: '#F7EEE5',
  ink: '#261C13',
  soft: '#6B5848',
  line: '#E3CBB8',
  accent: '#6E4A2E',
  band: '#261C13',
  gold: '#E8B898',
};

// Links to the booking terms and privacy policy, when the site address is known.
function policyLinks() {
  const origin = (process.env.URL || '').replace(/\/$/, '');
  if (!/^https?:\/\//.test(origin)) return '';
  const link = (path, label) => `<a href="${e(origin + path)}" style="color:${C.soft};">${label}</a>`;
  return `<br><span style="display:inline-block;margin-top:6px;">${link('/terms/', 'Booking terms')} &nbsp;|&nbsp; ${link('/privacy/', 'Privacy policy')}</span>`;
}

function layout(settings, title, bodyHtml) {
  const name = e(settings.business.name || 'Bare Beauty by Ionee');
  return `<!doctype html><html><body style="margin:0;padding:0;background:${C.bg};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${C.line};">
<tr><td style="background:${C.band};padding:22px 28px;text-align:center;font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:.5px;color:${C.gold};">${name}</td></tr>
<tr><td style="padding:28px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${C.ink};">
<h1 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:24px;line-height:1.25;color:${C.ink};">${e(title)}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:16px 28px 24px;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${C.soft};border-top:1px solid ${C.line};">${name}${settings.business.instagram ? ` &nbsp;|&nbsp; @${e(settings.business.instagram)}` : ''}${settings.business.phone ? ` &nbsp;|&nbsp; ${e(settings.business.phone)}` : ''}${policyLinks()}</td></tr>
</table></td></tr></table></body></html>`;
}

function detailsTable(appt, { showAddress, settings }) {
  const rows = [
    ['When', `${formatDateLong(appt.date)} at ${formatTime(appt.start)}`],
    ['Services', appt.services.map((s) => s.name).join(', ')],
    ['Time', `About ${formatDuration(appt.duration)}`],
    ['Total', formatMoney(appt.total)],
  ];
  if (showAddress && settings.business.address) rows.push(['Where', settings.business.address]);
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:6px 0 18px;border-top:1px solid ${C.line};">
${rows
  .map(
    ([k, v]) =>
      `<tr><td style="padding:9px 12px 9px 0;border-bottom:1px solid ${C.line};color:${C.soft};width:90px;vertical-align:top;">${e(k)}</td><td style="padding:9px 0;border-bottom:1px solid ${C.line};">${e(v)}</td></tr>`,
  )
  .join('')}
</table>`;
}

const button = (href, label) =>
  `<p style="margin:20px 0;"><a href="${e(href)}" style="display:inline-block;background:${C.band};color:${C.gold};text-decoration:none;padding:12px 20px;font-family:Helvetica,Arial,sans-serif;font-size:14px;">${e(label)}</a></p>`;

const para = (t) => `<p style="margin:0 0 12px;">${e(t)}</p>`;

function plain(lines) {
  return lines.filter(Boolean).join('\n');
}

function plainDetails(appt, showAddress, settings) {
  return plain([
    `When: ${formatDateLong(appt.date)} at ${formatTime(appt.start)}`,
    `Services: ${appt.services.map((s) => s.name).join(', ')}`,
    `Total: ${formatMoney(appt.total)}`,
    showAddress && settings.business.address ? `Where: ${settings.business.address}` : '',
  ]);
}

// ---- messages to clients

export function clientBookedEmail(appt, settings, manageUrl) {
  const confirmed = appt.status === 'confirmed';
  const title = confirmed ? "You're booked" : 'Request received';
  const intro = confirmed
    ? `Hi ${firstName(appt.name)}, your appointment is confirmed. Here are the details.`
    : `Hi ${firstName(appt.name)}, thank you for booking. I'll confirm your appointment soon. Here's what you asked for.`;
  const pay = settings.booking.paymentNote ? para(settings.booking.paymentNote) : '';
  return {
    subject: `${title}: ${formatDateLong(appt.date)} at ${formatTime(appt.start)}`,
    html: layout(settings, title, para(intro) + detailsTable(appt, { showAddress: confirmed, settings }) + pay + button(manageUrl, 'View or cancel your appointment')),
    text: plain([intro, '', plainDetails(appt, confirmed, settings), settings.booking.paymentNote, '', `View or cancel: ${manageUrl}`]),
  };
}

export function clientConfirmedEmail(appt, settings, manageUrl) {
  const title = "You're confirmed";
  const intro = `Hi ${firstName(appt.name)}, your appointment is confirmed. See you soon!`;
  const pay = settings.booking.paymentNote ? para(settings.booking.paymentNote) : '';
  return {
    subject: `Confirmed: ${formatDateLong(appt.date)} at ${formatTime(appt.start)}`,
    html: layout(settings, title, para(intro) + detailsTable(appt, { showAddress: true, settings }) + pay + button(manageUrl, 'View or cancel your appointment')),
    text: plain([intro, '', plainDetails(appt, true, settings), settings.booking.paymentNote, '', `View or cancel: ${manageUrl}`]),
  };
}

export function clientDeclinedEmail(appt, settings, bookUrl) {
  const title = 'About your booking request';
  const intro = `Hi ${firstName(appt.name)}, thank you for booking. Unfortunately ${formatDateLong(appt.date)} at ${formatTime(appt.start)} isn't available. Please pick another time that works for you.`;
  return {
    subject: `About your request for ${formatDateLong(appt.date)}`,
    html: layout(settings, title, para(intro) + button(bookUrl, 'Choose another time')),
    text: plain([intro, '', `Choose another time: ${bookUrl}`]),
  };
}

export function clientCancelledEmail(appt, settings, bookUrl, byClient) {
  const title = 'Appointment cancelled';
  const intro = byClient
    ? `Hi ${firstName(appt.name)}, your appointment on ${formatDateLong(appt.date)} at ${formatTime(appt.start)} is cancelled.`
    : `Hi ${firstName(appt.name)}, your appointment on ${formatDateLong(appt.date)} at ${formatTime(appt.start)} has been cancelled. Reply to this email or text me if you have questions.`;
  return {
    subject: `Cancelled: ${formatDateLong(appt.date)} at ${formatTime(appt.start)}`,
    html: layout(settings, title, para(intro) + button(bookUrl, 'Book a new time')),
    text: plain([intro, '', `Book a new time: ${bookUrl}`]),
  };
}

export function clientReminderEmail(appt, settings, manageUrl) {
  const title = 'See you tomorrow';
  const intro = `Hi ${firstName(appt.name)}, a quick reminder about your appointment tomorrow.`;
  return {
    subject: `Reminder: tomorrow at ${formatTime(appt.start)}`,
    html: layout(settings, title, para(intro) + detailsTable(appt, { showAddress: true, settings }) + button(manageUrl, 'View or cancel your appointment')),
    text: plain([intro, '', plainDetails(appt, true, settings), '', `View or cancel: ${manageUrl}`]),
  };
}

// ---- messages to Ionee

export function ownerNewBookingEmail(appt, settings, adminUrl) {
  const pending = appt.status === 'pending';
  const title = pending ? 'New booking request' : 'New booking';
  const extra = [
    appt.phone ? `Phone: ${appt.phone}` : '',
    appt.email ? `Email: ${appt.email}` : '',
    appt.instagram ? `Instagram: @${appt.instagram}` : '',
    appt.firstVisit ? 'First visit' : 'Returning client',
    appt.notes ? `Notes: ${appt.notes}` : '',
  ].filter(Boolean);
  return {
    subject: `${title}: ${appt.name}, ${formatDateLong(appt.date)} at ${formatTime(appt.start)}`,
    html: layout(
      settings,
      title,
      para(`${appt.name} booked online.`) +
        detailsTable(appt, { showAddress: false, settings }) +
        extra.map(para).join('') +
        button(adminUrl, pending ? 'Review the request' : 'Open the studio panel'),
    ),
    text: plain([`${appt.name} booked online.`, '', plainDetails(appt, false, settings), ...extra, '', adminUrl]),
  };
}

export function ownerCancelledEmail(appt, settings, adminUrl) {
  const title = 'A client cancelled';
  const intro = `${appt.name} cancelled ${formatDateLong(appt.date)} at ${formatTime(appt.start)}. The time is open again.`;
  return {
    subject: `Cancelled by client: ${appt.name}, ${formatDateLong(appt.date)}`,
    html: layout(settings, title, para(intro) + detailsTable(appt, { showAddress: false, settings }) + button(adminUrl, 'Open the studio panel')),
    text: plain([intro, '', plainDetails(appt, false, settings), '', adminUrl]),
  };
}

export function ownerDigestEmail(dateLabel, appts, settings, adminUrl) {
  const title = `Tomorrow: ${appts.length} appointment${appts.length === 1 ? '' : 's'}`;
  const list = appts
    .map(
      (a) =>
        `<tr><td style="padding:8px 12px 8px 0;border-bottom:1px solid ${C.line};white-space:nowrap;vertical-align:top;">${e(formatTime(a.start))}</td><td style="padding:8px 0;border-bottom:1px solid ${C.line};">${e(a.name)}<br><span style="color:${C.soft};">${e(a.services.map((s) => s.name).join(', '))}${a.status === 'pending' ? ' (not confirmed yet)' : ''}</span></td></tr>`,
    )
    .join('');
  return {
    subject: `${title} (${dateLabel})`,
    html: layout(settings, title, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.line};">${list}</table>` + button(adminUrl, 'Open the studio panel')),
    text: plain([title, ...appts.map((a) => `${formatTime(a.start)}  ${a.name}: ${a.services.map((s) => s.name).join(', ')}`), '', adminUrl]),
  };
}

export function testEmail(settings) {
  const title = 'Email is working';
  const intro = 'This is a test from your studio panel. Booking emails will look like this.';
  return { subject: 'Test email from your studio panel', html: layout(settings, title, para(intro)), text: intro };
}
