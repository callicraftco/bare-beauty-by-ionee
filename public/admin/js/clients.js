// Clients: everyone who has booked, with notes, history and quick contact.
import {
  $,
  S,
  api,
  clientStats,
  closeSheet,
  confirmInline,
  download,
  esc,
  fillTemplate,
  firstName,
  formatPhone,
  formatTime,
  icon,
  money,
  openSheet,
  phoneDigits,
  rebookDue,
  sheetHead,
  shortDate,
  smsHref,
  statusChip,
  telHref,
  toast,
  today,
} from './core.js';
import { openAppointment, openAppointmentForm } from './schedule.js';

const rerender = () => window.dispatchEvent(new Event('studio:render'));

const FILTERS = [
  ['all', 'All'],
  ['due', 'Due to come back'],
  ['new', 'New this month'],
  ['upcoming', 'Booked ahead'],
];

function rows() {
  const c = S.clients;
  const q = c.query.trim().toLowerCase();
  const qd = q.replace(/\D/g, '');
  const ym = today().slice(0, 7);
  const dueIds = new Set(rebookDue().map((d) => d.client.id));
  let list = S.data.clients.map((client) => ({ client, st: clientStats(client) }));
  if (c.filter === 'due') list = list.filter((x) => dueIds.has(x.client.id));
  if (c.filter === 'new') list = list.filter((x) => (x.client.createdAt || '').slice(0, 7) === ym);
  if (c.filter === 'upcoming') list = list.filter((x) => x.st.next);
  if (q) {
    list = list.filter(
      (x) =>
        x.client.name.toLowerCase().includes(q) ||
        (qd.length >= 3 && phoneDigits(x.client.phone).includes(qd)) ||
        (x.client.email || '').toLowerCase().includes(q) ||
        (x.client.instagram || '').toLowerCase().includes(q.replace('@', '')),
    );
  }
  const key = (x) => (x.st.next ? x.st.next.date : x.st.last ? x.st.last.date : x.client.createdAt || '');
  if (c.sort === 'name') list.sort((a, b) => a.client.name.localeCompare(b.client.name));
  else if (c.sort === 'visits') list.sort((a, b) => b.st.visits - a.st.visits || b.st.spent - a.st.spent);
  else list.sort((a, b) => String(key(b)).localeCompare(String(key(a))));
  return { list, dueIds };
}

function render(main) {
  const c = S.clients;
  const { list, dueIds } = rows();
  main.innerHTML = `
    <div class="page-head">
      <div><h1 class="page-title">Clients</h1><p class="page-sub">${S.data.clients.length} total. New clients are added when they book.</p></div>
      <button type="button" class="btn btn-quiet" data-new-client>${icon('plus', 18)} Add client</button>
    </div>
    <div class="toolbar">
      <label class="search"><span class="visually-hidden">Search clients</span><input type="search" data-search placeholder="Search name, phone, email or Instagram" value="${esc(c.query)}"></label>
      <label class="field" style="display:flex;align-items:center;gap:8px"><span class="hint">Sort</span>
        <select data-sort style="min-height:40px;width:auto">
          <option value="recent" ${c.sort === 'recent' ? 'selected' : ''}>Recent</option>
          <option value="name" ${c.sort === 'name' ? 'selected' : ''}>Name</option>
          <option value="visits" ${c.sort === 'visits' ? 'selected' : ''}>Most visits</option>
        </select>
      </label>
    </div>
    <div class="filter-chips" role="group" aria-label="Show" style="margin-bottom:16px">${FILTERS.map(([k, l]) => `<button type="button" data-filter="${k}" aria-pressed="${c.filter === k}">${l}</button>`).join('')}</div>
    ${
      list.length
        ? `<ul class="appt-list">${list
            .map(({ client, st }) => {
              const line = [formatPhone(client.phone), client.instagram ? `@${client.instagram}` : ''].filter(Boolean).join(', ');
              return `<li><button type="button" class="client-row" data-open-client="${esc(client.id)}">
              <span><span class="client-name">${esc(client.name)}</span><span class="client-meta" style="display:block">${esc(line || client.email || 'No contact info')}</span></span>
              <span class="client-side">
                ${st.next ? `<span>Next: ${esc(shortDate(st.next.date))}</span>` : st.last ? `<span>Last: ${esc(shortDate(st.last.date))}</span>` : '<span>No visits yet</span>'}
                <span>${st.visits} visit${st.visits === 1 ? '' : 's'}${st.spent ? `, ${money(st.spent)}` : ''}</span>
                ${dueIds.has(client.id) ? '<span class="chip chip-pending">Due back</span>' : ''}
              </span>
            </button></li>`;
            })
            .join('')}</ul>`
        : `<p class="empty">${c.query ? 'No matches.' : c.filter === 'due' ? 'Nobody is due right now. Rebook times come from each service on your Menu.' : 'No clients here yet.'}</p>`
    }`;
}

let searchTimer;
function input(e) {
  if (e.target.matches('[data-search]')) {
    S.clients.query = e.target.value;
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

function change(e) {
  if (e.target.matches('[data-sort]')) {
    S.clients.sort = e.target.value;
    rerender();
  }
}

function click(e) {
  const open = e.target.closest('[data-open-client]');
  if (open) return openClient(open.dataset.openClient);
  const f = e.target.closest('[data-filter]');
  if (f) {
    S.clients.filter = f.dataset.filter;
    return rerender();
  }
  if (e.target.closest('[data-new-client]')) return openClientForm();
}

export default { render, click, input, change };

// ---------- client sheet

export function openClient(id) {
  const client = S.data.clients.find((c) => c.id === id);
  if (!client) return toast('That client is no longer here.');
  const st = clientStats(client);
  const T = S.data.settings.templates;
  const lastService = st.last && st.last.services[0] ? st.last.services[0].name : '';
  const history = [...st.list].reverse();
  const m = client.marketing;
  const optedOut = Boolean(m && m.sms === false);
  const when = m && m.at ? new Date(m.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const offerLine = !m
    ? 'Not asked yet. Send offers and specials only to clients who said yes. A personal invite back is fine unless they opt out.'
    : m.sms
      ? `Said yes on ${when}${m.source ? ` (${m.source.toLowerCase()})` : ''}.`
      : `Opted out on ${when}. Don't send offer texts.`;
  const html = `${sheetHead(esc(client.name), `Client since ${esc(shortDate((client.createdAt || today()).slice(0, 10)))}`)}
  <div class="sheet-body">
    <div class="contact-actions">
      ${client.phone ? `<a href="${esc(smsHref(client.phone, ''))}">${icon('text', 18)} Text</a><a href="${esc(telHref(client.phone))}">${icon('call', 18)} Call</a>` : ''}
      ${client.email ? `<a href="mailto:${esc(client.email)}">${icon('mail', 18)} Email</a>` : ''}
      ${client.instagram ? `<a href="https://www.instagram.com/${esc(encodeURIComponent(client.instagram))}/" target="_blank" rel="noopener">${icon('insta', 18)} @${esc(client.instagram)}</a>` : ''}
      ${client.phone && lastService && !optedOut ? `<a href="${esc(smsHref(client.phone, fillTemplate(T.rebook, { client, service: lastService })))}">${icon('text', 18)} Invite back</a>` : ''}
    </div>
    <div class="stats">
      <div class="stat"><p class="stat-label">Visits</p><p class="stat-value">${st.visits}</p></div>
      <div class="stat"><p class="stat-label">Spent</p><p class="stat-value">${money(st.spent)}</p></div>
      <div class="stat"><p class="stat-label">${st.next ? 'Next' : 'Last'}</p><p class="stat-value" style="font-size:1.125rem">${st.next ? esc(shortDate(st.next.date)) : st.last ? esc(shortDate(st.last.date)) : 'None'}</p></div>
    </div>
    ${st.noShows ? `<p class="hint">${st.noShows} no-show${st.noShows === 1 ? '' : 's'} on record.</p>` : ''}
    <section class="sheet-section">
      <h3>Notes</h3>
      <div class="field"><label class="visually-hidden" for="client-notes">Notes</label><textarea id="client-notes" data-client-notes rows="4" placeholder="Skin type, allergies, lash style and mapping, what they like">${esc(client.notes || '')}</textarea></div>
      <div class="row-actions" style="margin-top:8px"><button type="button" class="btn btn-quiet btn-small" data-save-client-notes>Save notes</button></div>
    </section>
    <section class="sheet-section">
      <h3>Contact details</h3>
      <form class="form" data-client-form novalidate>
        <div class="form-grid">
          <div class="field"><label for="cl-name">Name</label><input id="cl-name" name="name" value="${esc(client.name)}" maxlength="80"></div>
          <div class="field"><label for="cl-phone">Phone</label><input id="cl-phone" name="phone" type="tel" value="${esc(client.phone || '')}" maxlength="30"></div>
          <div class="field"><label for="cl-email">Email</label><input id="cl-email" name="email" type="email" value="${esc(client.email || '')}" maxlength="160"></div>
          <div class="field"><label for="cl-ig">Instagram</label><input id="cl-ig" name="instagram" value="${esc(client.instagram || '')}" maxlength="60"></div>
        </div>
        <div class="row-actions"><button type="submit" class="btn btn-quiet btn-small">Save details</button></div>
      </form>
    </section>
    <section class="sheet-section">
      <h3>Offer texts</h3>
      <p class="hint">${esc(offerLine)}</p>
      <div class="row-actions" style="margin-top:8px">
        ${!m || !m.sms ? '<button type="button" class="btn btn-quiet btn-small" data-marketing="yes">Mark as said yes</button>' : ''}
        ${!optedOut ? '<button type="button" class="btn btn-quiet btn-small" data-marketing="no">Mark as opted out (STOP)</button>' : ''}
      </div>
    </section>
    <section class="sheet-section">
      <h3>Visits</h3>
      ${
        history.length
          ? `<ul class="appt-list">${history
              .map(
                (a) => `<li><button type="button" class="appt" data-open-appt="${esc(a.id)}"><span class="appt-time">${esc(shortDate(a.date))}<small>${esc(formatTime(a.start))}</small></span><span><span class="appt-services" style="margin:0">${esc(a.services.map((s) => s.name).join(', '))}</span></span><span class="appt-side">${statusChip(a.status)}<span class="appt-price">${money(a.total)}</span></span></button></li>`,
              )
              .join('')}</ul>`
          : '<p class="empty">No visits yet.</p>'
      }
    </section>
    <section class="sheet-section" data-privacy-box>
      <h3>Privacy</h3>
      <p class="hint">If ${esc(firstName(client.name))} asks what you keep about them, send them a copy. If they ask you to delete it, erase their details.</p>
      <div class="row-actions" style="margin-top:8px">
        <button type="button" class="btn btn-quiet btn-small" data-export-client>${icon('download', 16)} Download their data</button>
        <button type="button" class="btn btn-danger-quiet btn-small" data-erase-client>Erase their details</button>
      </div>
    </section>
    <div class="form-foot foot-static">
      <button type="button" class="btn btn-primary" data-book-client>${icon('plus', 18)} Book ${esc(firstName(client.name))}</button>
      <button type="button" class="btn btn-danger-quiet" data-delete-client>Remove from list</button>
    </div>
  </div>`;
  openSheet(html, {
    handlers: {
      click: async (e, sheet) => {
        const appt = e.target.closest('[data-open-appt]');
        if (appt) return openAppointment(appt.dataset.openAppt);
        if (e.target.closest('[data-book-client]')) return openAppointmentForm({ client });
        if (e.target.closest('[data-save-client-notes]')) return saveClient(client.id, { notes: $('[data-client-notes]', sheet).value }, 'Notes saved.');
        const mk = e.target.closest('[data-marketing]');
        if (mk) return saveClient(client.id, { marketing: mk.dataset.marketing === 'yes' }, mk.dataset.marketing === 'yes' ? 'Marked as said yes to offer texts.' : 'Marked as opted out.', true);
        if (e.target.closest('[data-export-client]')) {
          try {
            const data = await api('GET', `/admin/clients/${client.id}/export`);
            const name = client.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'client';
            download(`client-record-${name}-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
            toast('Downloaded. Send it to them by email or text.');
          } catch (err) {
            toast(err.message);
          }
          return;
        }
        if (e.target.closest('[data-erase-client]')) {
          const ok = await confirmInline(
            $('[data-privacy-box]', sheet),
            `Erase ${client.name}? Their name, phone, email and notes are removed from every appointment, and they leave your client list. Dates, services and prices stay for your records. This can't be undone.`,
            { yes: 'Erase for good', no: 'Keep', danger: true },
          );
          if (!ok) return;
          try {
            await api('POST', `/admin/clients/${client.id}/erase`);
            closeSheet();
            window.dispatchEvent(new Event('studio:refresh'));
            toast(`${client.name} was erased.`);
          } catch (err) {
            toast(err.message);
          }
          return;
        }
        if (e.target.closest('[data-delete-client]')) {
          const ok = await confirmInline(
            $('.form-foot', sheet),
            `Remove ${client.name} from your client list? Use this for duplicates and mistakes. Their appointments stay as they are. To delete their information, use Erase under Privacy.`,
            { yes: 'Remove', no: 'Keep', danger: true },
          );
          if (!ok) return;
          try {
            await api('DELETE', `/admin/clients/${client.id}`);
            S.data.clients = S.data.clients.filter((c) => c.id !== client.id);
            closeSheet();
            rerender();
            toast('Removed from your client list.');
          } catch (err) {
            toast(err.message);
          }
        }
      },
      submit: (e, sheet) => {
        e.preventDefault();
        const fd = new FormData($('[data-client-form]', sheet));
        saveClient(client.id, Object.fromEntries(fd.entries()), 'Details saved.');
      },
    },
  });
}

async function saveClient(id, body, message, reopen = false) {
  try {
    const res = await api('PATCH', `/admin/clients/${id}`, body);
    const i = S.data.clients.findIndex((c) => c.id === id);
    if (i >= 0) S.data.clients[i] = res.client;
    rerender();
    if (reopen) openClient(id);
    toast(message);
  } catch (err) {
    toast(err.message);
  }
}

export function openClientForm() {
  const html = `${sheetHead('Add a client')}
  <form class="sheet-body form" data-new-client-form novalidate>
    <div class="form-grid">
      <div class="field"><label for="nc-name">Name</label><input id="nc-name" name="name" maxlength="80" required data-autofocus></div>
      <div class="field"><label for="nc-phone">Phone</label><input id="nc-phone" name="phone" type="tel" maxlength="30"></div>
      <div class="field"><label for="nc-email">Email</label><input id="nc-email" name="email" type="email" maxlength="160"></div>
      <div class="field"><label for="nc-ig">Instagram</label><input id="nc-ig" name="instagram" maxlength="60"></div>
    </div>
    <div class="field"><label for="nc-notes">Notes</label><textarea id="nc-notes" name="notes" rows="3" placeholder="Skin type, allergies, lash style"></textarea></div>
    <div data-form-msg></div>
    <div class="form-foot"><button type="submit" class="btn btn-primary">Add client</button><button type="button" class="btn btn-quiet" data-close-sheet>Cancel</button></div>
  </form>`;
  openSheet(html, {
    handlers: {
      submit: async (e, sheet) => {
        e.preventDefault();
        const body = Object.fromEntries(new FormData($('[data-new-client-form]', sheet)).entries());
        try {
          const res = await api('POST', '/admin/clients', body);
          S.data.clients.push(res.client);
          rerender();
          openClient(res.client.id);
          toast('Client added.');
        } catch (err) {
          $('[data-form-msg]', sheet).innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
        }
      },
    },
  });
}
