// Policy pages: fills in the studio's live details (name, contact, cancellation notice,
// how long records are kept) from the same data the home page uses.
// The page already reads correctly without this; it only makes it specific.
import { esc, igUrl, smsHref } from './render.js';

const $$ = (sel) => [...document.querySelectorAll(sel)];

function contactSentence(b) {
  const ways = [];
  if (b.email) ways.push(`email <a href="mailto:${esc(b.email)}">${esc(b.email)}</a>`);
  if (b.phone) ways.push(`text or call <a href="${esc(smsHref(b.phone))}">${esc(b.phone)}</a>`);
  if (b.instagram) ways.push(`message <a href="${esc(igUrl(b.instagram))}" rel="noopener">@${esc(b.instagram)}</a> on Instagram`);
  if (!ways.length) return '';
  const list = ways.length === 1 ? ways[0] : `${ways.slice(0, -1).join(', ')} or ${ways[ways.length - 1]}`;
  return `To reach me, ${list}.`;
}

function retentionSentence(years) {
  if (!years) {
    return 'I keep client records until you ask me to erase them. When I erase a record, I keep only bookkeeping details like the date, service and price, without your name.';
  }
  return `I keep client records for ${years} year${years === 1 ? '' : 's'} after your last visit. Then I erase your name, contact details and notes, and keep only bookkeeping details like the date, service and price.`;
}

function set(key, value, html = false) {
  if (value === undefined || value === null || value === '') return;
  $$(`[data-bind="${key}"]`).forEach((n) => {
    if (html) n.innerHTML = value;
    else n.textContent = value;
  });
}

async function main() {
  $$('[data-year]').forEach((n) => {
    n.textContent = String(new Date().getFullYear());
  });
  let data;
  try {
    const res = await fetch('/api/site', { headers: { accept: 'application/json' } });
    if (!res.ok) return;
    data = await res.json();
  } catch {
    return;
  }
  const b = data.business || {};
  set('name', b.name);
  set('contact', contactSentence(b), true);
  if (data.booking) {
    set('cancel-hours', String(Number(data.booking.cancelNoticeHours) || 0));
    // Ionee's own payment note. If it already says when payment is due, it replaces
    // the default sentence; otherwise it's added after it.
    const note = String(data.booking.paymentNote || '').trim();
    const line = document.querySelector('[data-payment]');
    if (line && note) line.textContent = /\bdue\b/i.test(note) ? note : `Payment is due at your appointment. ${note}`;
  }
  if (data.privacy) set('retention', retentionSentence(Number(data.privacy.retentionYears) || 0));
}

main();
