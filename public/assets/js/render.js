// Turns studio data into HTML. Used in the browser (site.js) and by
// scripts/render-static.mjs, which bakes the default menu into index.html.
import { categoryIcon, faqIcon, icon } from './icons.js';

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function money(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? `$${v}` : `$${v.toFixed(2)}`;
}

export function formatTime(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')}\u00a0${suffix}` : `${h12}\u00a0${suffix}`;
}

export function formatDuration(min) {
  const n = Number(min) || 0;
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (!h) return `${m} min`;
  if (!m) return `${h} hr`;
  return `${h} hr ${m} min`;
}

export function igUrl(handle) {
  return `https://www.instagram.com/${encodeURIComponent(handle || 'barebeautybyionee')}/`;
}

export function telHref(phone) {
  const d = String(phone || '').replace(/[^\d+]/g, '');
  return d ? `tel:${d}` : '';
}

export function smsHref(phone) {
  const d = String(phone || '').replace(/[^\d+]/g, '');
  return d ? `sms:${d}` : '';
}

function serviceRow(s) {
  const meta = [s.durationLabel, s.badge].filter(Boolean).map(esc).join('<span class="svc-sep" aria-hidden="true"></span>');
  const inner = `<span class="svc-line"><span class="svc-name">${esc(s.name)}</span><span class="svc-dots" aria-hidden="true"></span><span class="svc-price">${money(s.price)}</span></span>${
    meta ? `<span class="svc-meta">${meta}</span>` : ''
  }${s.description ? `<span class="svc-desc">${esc(s.description)}</span>` : ''}`;
  if (s.online === false) {
    return `<li><div class="svc svc-offline">${inner}<span class="svc-meta">Text to book this one</span></div></li>`;
  }
  return `<li><a class="svc" href="/book/?s=${encodeURIComponent(s.id)}"><span class="visually-hidden">Book </span>${inner}</a></li>`;
}

// Consecutive categories that share a `group` (for example Waxing: Face, Body)
// print under one heading. A category without a group is its own heading.
export function groupCategories(categories) {
  const blocks = [];
  for (const c of categories) {
    const services = (c.services || []).filter((s) => s.visible !== false);
    if (!services.length) continue;
    const cat = { ...c, services };
    const last = blocks[blocks.length - 1];
    if (c.group && last && last.group === c.group) last.cats.push(cat);
    else blocks.push({ group: c.group || '', title: c.group || c.name, cats: [cat] });
  }
  return blocks;
}

function catList(c) {
  return `<ul class="svc-list">
    ${c.services.map(serviceRow).join('\n    ')}
  </ul>`;
}

// A section heading with its icon in a small ring: Facials, Waxing, Lashes.
function catHead(id, title) {
  return `<div class="cat-head"><span class="icon-ring cat-icon" aria-hidden="true">${icon(categoryIcon(`${id} ${title}`))}</span><h3 class="cat-name">${esc(title)}</h3></div>`;
}

function renderBlock(block, featured) {
  const single = block.cats.length === 1 && (!block.group || block.group === block.cats[0].name);
  const id = `cat-${esc(block.cats[0].id)}`;
  if (single) {
    const c = block.cats[0];
    return `<article class="cat${featured ? ' is-featured' : ''}" id="${id}">
  ${catHead(c.id, c.name)}${c.note ? `\n  <p class="cat-note">${esc(c.note)}</p>` : ''}
  ${catList(c)}
</article>`;
  }
  return `<article class="cat${featured ? ' is-featured' : ''}" id="${id}">
  ${catHead(block.cats[0].id, block.title)}
  ${block.cats
    .map(
      (c) => `<section class="sub">
    <h4 class="sub-name">${esc(c.name)}</h4>${c.note ? `\n    <p class="cat-note">${esc(c.note)}</p>` : ''}
    ${catList(c)}
  </section>`,
    )
    .join('\n  ')}
</article>`;
}

// Blocks where most services have a description get a full-width row;
// short price lists flow into two columns, like the printed menu.
export function renderMenu(categories) {
  const blocks = groupCategories(categories);
  const out = [];
  let compact = [];
  const flush = () => {
    if (compact.length) out.push(`<div class="menu-flow">\n${compact.join('\n')}\n</div>`);
    compact = [];
  };
  for (const block of blocks) {
    const all = block.cats.flatMap((c) => c.services);
    const described = all.filter((s) => s.description).length;
    const featured = all.length >= 2 && all.length <= 4 && described / all.length >= 0.6;
    if (featured) {
      flush();
      out.push(renderBlock(block, true));
    } else {
      compact.push(renderBlock(block, false));
    }
  }
  flush();
  return out.join('\n');
}

// Words for the sliding band under the hero: the menu's sections, woven with the tagline.
export function ribbonWords(categories, tagline) {
  const sections = groupCategories(categories || []).map((b) => b.title);
  const phrases = String(tagline || '')
    .split(/[,.;!]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  const out = [];
  for (let i = 0; i < Math.max(sections.length, phrases.length); i++) {
    if (sections[i]) out.push(sections[i]);
    if (phrases[i]) out.push(phrases[i]);
  }
  return out.slice(0, 12);
}

const STAR =
  '<svg class="ribbon-star" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 0C12.9 7 17 11.1 24 12 17 12.9 12.9 17 12 24 11.1 17 7 12.9 0 12 7 11.1 11.1 7 12 0Z"/></svg>';

export function renderRibbon(words) {
  const list = words.length % 2 ? [...words, ...words] : words;
  return list.map((w, i) => `<span class="ribbon-word${i % 2 ? ' is-outline' : ''}">${esc(w)}</span>${STAR}`).join('');
}

const DAY_ORDER = [
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday'],
];

export function renderHours(hours) {
  return DAY_ORDER.map(([key, label]) => {
    const h = hours[key] || { open: false };
    const value = h.open ? `${formatTime(h.start)} to ${formatTime(h.end)}` : 'Closed';
    return `<tr${h.open ? '' : ' class="closed"'}><th scope="row">${label}</th><td>${value}</td></tr>`;
  }).join('');
}

export function renderFaq(faq) {
  return faq
    .map(
      (f) => `<details class="faq-item">
  <summary><span class="faq-icon" aria-hidden="true">${icon(faqIcon(f))}</span><span class="faq-q">${esc(f.q)}</span></summary>
  <div class="faq-answer">${esc(f.a)
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('')}</div>
</details>`,
    )
    .join('\n');
}

export function renderContact(b) {
  const items = [];
  if (b.phone) {
    items.push(`<li><span class="contact-label">${icon('phone')}Text or call</span><a href="${esc(smsHref(b.phone))}">${esc(b.phone)}</a></li>`);
  }
  if (b.instagram) {
    items.push(`<li><span class="contact-label">${icon('instagram')}Instagram</span><a href="${esc(igUrl(b.instagram))}" rel="noopener">@${esc(b.instagram)}</a></li>`);
  }
  if (b.email) {
    items.push(`<li><span class="contact-label">${icon('mail')}Email</span><a href="mailto:${esc(b.email)}">${esc(b.email)}</a></li>`);
  }
  return items.join('');
}

// Stand-ins for "Recent work" until her Instagram is connected or she uploads photos:
// one tile per signature service, each linking to her Instagram. No photos, so nothing
// pretends to be her work. Real posts or uploads replace them on their own.
const SAMPLES = [
  ['Classic Glow Facial', 'facial', false],
  ['Hybrid full set', 'lashes', true],
  ['Full face wax', 'wax', false],
  ['Korean lash lift', 'lashes', false],
  ['Advanced Hydro-Facial', 'facial', false],
  ['Glow Renewal Facial', 'sparkles', true],
];

export function renderSampleWork(b) {
  const href = esc(igUrl(b && b.instagram));
  const handle = esc((b && b.instagram) || 'barebeautybyionee');
  return SAMPLES.map(
    ([name, ico, light]) =>
      `<a class="work-tile is-sample${light ? ' is-light' : ''}" href="${href}" target="_blank" rel="noopener"><span class="sample-inner"><span class="icon-ring sample-ring" aria-hidden="true">${icon(ico)}</span><span class="sample-name">${esc(name)}</span><span class="sample-handle">@${handle}</span></span><span class="visually-hidden"> (opens Instagram)</span></a>`,
  ).join('');
}
