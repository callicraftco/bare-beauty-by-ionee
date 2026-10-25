// Menu editor: prices, times and descriptions. Saved changes go live on the site.
import { $, S, api, esc, formatDuration, icon, money, toast } from './core.js';

const rerender = () => window.dispatchEvent(new Event('studio:render'));
const open = new Set();

const clone = (v) => JSON.parse(JSON.stringify(v));
const menu = () => S.menuDraft || S.data.services;

function draft() {
  if (!S.menuDraft) S.menuDraft = clone(S.data.services);
  return S.menuDraft;
}

function svcRow(s, ci, si, count) {
  const isOpen = open.has(s.id);
  const flags = [s.online === false ? 'Not bookable online' : '', s.visible === false ? 'Hidden on site' : ''].filter(Boolean);
  const f = (field, label, value, attrs = '') =>
    `<div class="field"><label for="f-${ci}-${si}-${field}">${label}</label><input id="f-${ci}-${si}-${field}" data-c="${ci}" data-s="${si}" data-f="${field}" value="${esc(value ?? '')}" ${attrs}></div>`;
  return `<div class="svc-edit">
    <button type="button" class="svc-summary" data-toggle="${esc(s.id)}" aria-expanded="${isOpen}">
      <span><span class="name">${esc(s.name || 'Untitled service')}</span><span class="meta" style="display:block">${esc(formatDuration(Number(s.duration) || 0))}${flags.length ? `, ${esc(flags.join(', '))}` : ''}</span></span>
      <span>${money(s.price)}</span>
      ${icon(isOpen ? 'up' : 'down', 18)}
    </button>
    ${
      isOpen
        ? `<div class="svc-fields">
      <div class="form-grid">
        ${f('name', 'Name', s.name, 'maxlength="80"')}
        ${f('price', 'Price ($)', s.price, 'type="number" min="0" step="1" inputmode="decimal"')}
        ${f('duration', 'Length for booking (minutes)', s.duration, 'type="number" min="5" max="720" step="5" inputmode="numeric"')}
      </div>
      <div class="form-grid">
        ${f('durationLabel', 'Time shown on the site', s.durationLabel, 'maxlength="40" placeholder="45 to 60 min"')}
        ${f('badge', 'Small note', s.badge, 'maxlength="40" placeholder="Tint included"')}
        ${f('rebookDays', 'Remind to rebook after (days)', s.rebookDays || 0, 'type="number" min="0" max="365" inputmode="numeric"')}
      </div>
      <div class="field"><label for="f-${ci}-${si}-description">Description</label><textarea id="f-${ci}-${si}-description" data-c="${ci}" data-s="${si}" data-f="description" rows="2" maxlength="600">${esc(s.description || '')}</textarea></div>
      <div class="row-actions">
        <label class="toggle"><input type="checkbox" data-c="${ci}" data-s="${si}" data-f="online" ${s.online !== false ? 'checked' : ''}><span class="track"></span> Clients can book it online</label>
        <label class="toggle"><input type="checkbox" data-c="${ci}" data-s="${si}" data-f="visible" ${s.visible !== false ? 'checked' : ''}><span class="track"></span> Show on the website</label>
      </div>
      <div class="row-actions">
        <button type="button" class="btn btn-quiet btn-small" data-move-svc="-1" data-c="${ci}" data-s="${si}" ${si === 0 ? 'disabled' : ''}>${icon('up', 16)} Move up</button>
        <button type="button" class="btn btn-quiet btn-small" data-move-svc="1" data-c="${ci}" data-s="${si}" ${si === count - 1 ? 'disabled' : ''}>${icon('down', 16)} Move down</button>
        <button type="button" class="btn btn-danger-quiet btn-small" data-del-svc data-c="${ci}" data-s="${si}">Remove service</button>
      </div>
    </div>`
        : ''
    }
  </div>`;
}

function render(main) {
  const m = menu();
  const groups = [...new Set(m.categories.map((c) => c.group).filter(Boolean))];
  main.innerHTML = `
    <div class="page-head">
      <div><h1 class="page-title">Menu</h1><p class="page-sub">Prices and times here are what clients see and book. Changes go live when you save.</p></div>
      <a class="btn btn-quiet" href="/#menu" target="_blank" rel="noopener">${icon('site', 18)} See it on the site</a>
    </div>
    <datalist id="group-names">${groups.map((g) => `<option value="${esc(g)}">`).join('')}</datalist>
    ${m.categories
      .map(
        (c, ci) => `<section class="cat-card" aria-label="${esc(c.name)}">
      <div class="cat-card-head">
        <div class="form-grid">
          <div class="field"><label for="c-${ci}-name">Section name</label><input id="c-${ci}-name" data-c="${ci}" data-f="name" value="${esc(c.name)}" maxlength="60"></div>
          <div class="field"><label for="c-${ci}-group">Heading on the site (optional)</label><input id="c-${ci}-group" data-c="${ci}" data-f="group" value="${esc(c.group || '')}" maxlength="60" list="group-names" placeholder="Optional"></div>
        </div>
        <div class="field"><label for="c-${ci}-note">Note under the name</label><textarea id="c-${ci}-note" data-c="${ci}" data-f="note" rows="2" maxlength="400">${esc(c.note || '')}</textarea></div>
        <div class="cat-card-tools">
          <button type="button" class="icon-btn" data-move-cat="-1" data-c="${ci}" aria-label="Move section up" ${ci === 0 ? 'disabled' : ''}>${icon('up')}</button>
          <button type="button" class="icon-btn" data-move-cat="1" data-c="${ci}" aria-label="Move section down" ${ci === m.categories.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
          <button type="button" class="icon-btn" data-del-cat data-c="${ci}" aria-label="Remove section">${icon('trash')}</button>
        </div>
      </div>
      ${c.services.map((s, si) => svcRow(s, ci, si, c.services.length)).join('')}
      <div style="padding:12px 16px"><button type="button" class="link-btn" data-add-svc data-c="${ci}">${icon('plus', 16)} Add a service to ${esc(c.name || 'this section')}</button></div>
    </section>`,
      )
      .join('')}
    <button type="button" class="btn btn-quiet" data-add-cat>${icon('plus', 18)} Add a section</button>
    <p class="hint" style="margin-top:12px">Sections with the same heading show together on the site, like Waxing: Face and Body.</p>
    <div class="save-bar" data-save-bar ${S.menuDraft ? '' : 'hidden'}>
      <span>You have unsaved changes.</span>
      <div class="row-actions"><button type="button" class="btn btn-quiet btn-small" data-discard>Discard</button><button type="button" class="btn btn-primary btn-small" data-save>Save menu</button></div>
    </div>`;
}

function showSaveBar() {
  const bar = $('[data-save-bar]');
  if (bar) bar.hidden = !S.menuDraft;
}

const NUMERIC = ['price', 'duration', 'rebookDays'];

function input(e) {
  const t = e.target;
  if (!t.dataset.f || t.dataset.c === undefined) return;
  const d = draft();
  const cat = d.categories[Number(t.dataset.c)];
  const target = t.dataset.s !== undefined ? cat.services[Number(t.dataset.s)] : cat;
  let value = t.type === 'checkbox' ? t.checked : t.value;
  if (NUMERIC.includes(t.dataset.f)) value = value === '' ? '' : Number(value);
  target[t.dataset.f] = value;
  showSaveBar();
}

function change(e) {
  if (e.target.type === 'checkbox') {
    input(e);
    rerender();
  }
}

async function save() {
  const d = draft();
  for (const c of d.categories) {
    if (!String(c.name || '').trim()) return toast('Every section needs a name.');
    for (const s of c.services) {
      if (!String(s.name || '').trim()) return toast(`A service in ${c.name} needs a name.`);
      if (s.price === '' || Number(s.price) < 0) return toast(`Add a price for ${s.name}.`);
      if (!Number(s.duration) || Number(s.duration) < 5) return toast(`Add a length in minutes for ${s.name}.`);
    }
  }
  const payload = clone(d);
  for (const c of payload.categories) {
    if (String(c.id || '').startsWith('new-')) c.id = '';
    for (const s of c.services) if (String(s.id || '').startsWith('new-')) s.id = '';
  }
  const btn = $('[data-save]');
  if (btn) btn.disabled = true;
  try {
    const res = await api('PUT', '/admin/services', payload);
    S.data.services = res.services;
    S.menuDraft = null;
    open.clear();
    if (!S.data.settings.setup.menuReviewed) {
      const r2 = await api('PUT', '/admin/settings', { ...S.data.settings, setup: { ...S.data.settings.setup, menuReviewed: true } });
      S.data.settings = r2.settings;
    }
    rerender();
    toast('Menu saved. The website shows it within a few minutes.');
  } catch (err) {
    toast(err.message);
    if (btn) btn.disabled = false;
  }
}

function click(e) {
  const t = e.target;
  const tg = t.closest('[data-toggle]');
  if (tg) {
    const id = tg.dataset.toggle;
    if (open.has(id)) open.delete(id);
    else open.add(id);
    return rerender();
  }
  if (t.closest('[data-save]')) return save();
  if (t.closest('[data-discard]')) {
    S.menuDraft = null;
    open.clear();
    rerender();
    return toast('Changes discarded.');
  }
  const ci = Number((t.closest('[data-c]') || {}).dataset?.c);
  const si = Number((t.closest('[data-s]') || {}).dataset?.s);
  if (t.closest('[data-add-svc]')) {
    const id = `new-${Math.random().toString(36).slice(2, 8)}`;
    draft().categories[ci].services.push({ id, name: '', price: 0, duration: 30, durationLabel: '', badge: '', description: '', rebookDays: 0, online: true, visible: true });
    open.add(id);
    rerender();
    const inputEl = document.getElementById(`f-${ci}-${draft().categories[ci].services.length - 1}-name`);
    if (inputEl) inputEl.focus();
    return;
  }
  const mv = t.closest('[data-move-svc]');
  if (mv) {
    const list = draft().categories[ci].services;
    const to = si + Number(mv.dataset.moveSvc);
    if (to < 0 || to >= list.length) return;
    [list[si], list[to]] = [list[to], list[si]];
    return rerender();
  }
  if (t.closest('[data-del-svc]')) {
    const list = draft().categories[ci].services;
    const [gone] = list.splice(si, 1);
    rerender();
    return toast(`Removed ${gone.name || 'the service'}. Save to make it final, or discard.`);
  }
  if (t.closest('[data-add-cat]')) {
    draft().categories.push({ id: `new-${Math.random().toString(36).slice(2, 8)}`, name: 'New section', group: '', note: '', services: [] });
    rerender();
    const el = document.getElementById(`c-${draft().categories.length - 1}-name`);
    if (el) {
      el.focus();
      el.select();
    }
    return;
  }
  const mc = t.closest('[data-move-cat]');
  if (mc) {
    const list = draft().categories;
    const to = ci + Number(mc.dataset.moveCat);
    if (to < 0 || to >= list.length) return;
    [list[ci], list[to]] = [list[to], list[ci]];
    return rerender();
  }
  if (t.closest('[data-del-cat]')) {
    const list = draft().categories;
    const [gone] = list.splice(ci, 1);
    rerender();
    return toast(`Removed ${gone.name}${gone.services.length ? ` and its ${gone.services.length} services` : ''}. Save to make it final, or discard.`);
  }
}

export default { render, click, input, change };
