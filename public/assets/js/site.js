// Landing page: pulls the live menu, hours and details Ionee edits in her panel.
import { esc, heroLine, igUrl, renderContact, renderFaq, renderHours, renderMenu, renderSampleWork, renderSignoff, renderSocial, ribbonWords, socialLinks } from './render.js';
import { fillRibbon, initMotion, prepareReveals } from './motion.js';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

// Swap in new HTML only when it actually differs from what the page already shows,
// so baked-in content that matches the live data never flickers or replays.
const normalize = (html) => String(html).replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();
const shown = new WeakMap();
function remember(el) {
  if (el) shown.set(el, normalize(el.innerHTML));
}
function swap(el, html) {
  if (!el || html == null) return false;
  const next = normalize(html);
  if (shown.get(el) === next) return false;
  el.innerHTML = html;
  shown.set(el, next);
  prepareReveals(el);
  return true;
}

function paragraphs(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function chrome() {
  $$('[data-year]').forEach((n) => {
    n.textContent = String(new Date().getFullYear());
  });
  const bar = $('[data-topbar]');
  const float = $('[data-float]');
  const hero = $('.hero');
  const footer = $('.footer');
  let ticking = false;
  const update = () => {
    ticking = false;
    const announce = $('[data-announce]');
    const offset = announce && !announce.hidden ? announce.offsetHeight : 0;
    bar.classList.toggle('is-solid', window.scrollY > Math.max(24, offset));
    if (float && hero && footer) {
      const pastHero = hero.getBoundingClientRect().bottom < 80;
      const beforeFooter = footer.getBoundingClientRect().top > window.innerHeight - 20;
      float.classList.toggle('is-shown', pastHero && beforeFooter);
    }
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  update();
}

function apply(data) {
  const b = data.business || {};

  const announce = $('[data-announce]');
  if (b.announcement) {
    $('[data-announce-text]').textContent = b.announcement;
    announce.hidden = false;
    document.body.classList.add('has-announce');
  } else {
    announce.hidden = true;
    document.body.classList.remove('has-announce');
  }

  const tagline = $('[data-bind="tagline"]');
  if (tagline && b.tagline) tagline.textContent = b.tagline;

  // Lines Ionee writes in Settings, Website (and the notes under Hours and Where).
  // An empty one is hidden.
  const w = data.website || {};
  const pick = (key, fallback) => (typeof w[key] === 'string' ? w[key] : fallback);
  setLine('[data-bind="services-line"]', heroLine(pick('servicesLine', BAKED.servicesLine), b.area));
  setLine('[data-bind="hours-note"]', pick('hoursNote', BAKED.hoursNote));
  setLine('[data-bind="where-note"]', pick('whereNote', BAKED.whereNote));
  const signoff = $('[data-signoff]');
  if (signoff && typeof w.signoff === 'string') {
    const html = renderSignoff(w.signoff);
    signoff.hidden = !html;
    if (html) swap(signoff, html);
  }

  const area = $('[data-bind="area"]');
  if (area) {
    area.textContent = b.area || '';
    area.hidden = !b.area;
  }

  const about = $('[data-about]');
  if (about && b.about) about.innerHTML = paragraphs(b.about);

  // Instagram links in About and Recent work. They hide if she removes her handle.
  $$('[data-ig]').forEach((a) => {
    if (b.instagram) a.href = igUrl(b.instagram);
    a.hidden = !b.instagram;
  });
  const handle = $('[data-bind="ig-handle"]');
  if (handle && b.instagram) handle.textContent = `@${b.instagram}`;

  $$('[data-bind="name"]').forEach((n) => {
    if (b.name) n.textContent = b.name;
  });

  swap($('[data-contact]'), renderContact(b));
  swap($('[data-social]'), renderSocial(b));
  updateSchema(b);

  // The last booking step says what happens next: a request she confirms, or booked right away.
  if (data.booking) {
    const instant = data.booking.mode === 'instant';
    const name = $('[data-how-name]');
    const text = $('[data-how-text]');
    if (name) name.textContent = instant ? "You're booked" : 'Get confirmed';
    if (text) text.textContent = instant ? 'Your time is confirmed right away.' : "I'll confirm your appointment by text or email.";
  }

  if (data.services && Array.isArray(data.services.categories)) {
    swap($('[data-menu]'), renderMenu(data.services.categories));
    fillRibbon(ribbonWords(data.services.categories, b.tagline));
  }

  if (data.hours) swap($('[data-hours]'), renderHours(data.hours));

  if (Array.isArray(data.faq) && data.faq.length) swap($('[data-faq]'), renderFaq(data.faq));

  const media = data.media || {};
  const photo = $('[data-about-photo]');
  if (photo && media.about) {
    photo.innerHTML = `<img src="${esc(media.about.url)}" alt="${esc(media.about.alt || 'Ionee')}" ${
      media.about.w ? `width="${media.about.w}" height="${media.about.h}"` : ''
    } loading="lazy" decoding="async">`;
  }

  renderWork(data, b);
}

function setLine(sel, text) {
  const el = $(sel);
  if (!el) return;
  el.textContent = text || '';
  el.hidden = !text;
}

// What the page says before the live data arrives, so an older API answer falls back to it.
const BAKED = {
  servicesLine: (($('[data-bind="services-line"]') || {}).textContent || '').trim(),
  hoursNote: (($('[data-bind="hours-note"]') || {}).textContent || '').trim(),
  whereNote: (($('[data-bind="where-note"]') || {}).textContent || '').trim(),
};

// The business details search engines read: name, tagline and her social accounts.
function updateSchema(b) {
  const tag = $('script[type="application/ld+json"]');
  if (!tag) return;
  try {
    const info = JSON.parse(tag.textContent);
    if (b.name) info.name = b.name;
    if (b.tagline) info.slogan = b.tagline;
    const same = socialLinks(b).map((s) => s.href);
    if (same.length) info.sameAs = same;
    else delete info.sameAs;
    tag.textContent = JSON.stringify(info);
  } catch {
    // Leave the baked-in details as they are.
  }
}

// Instagram's image servers, resized and served from this site by Netlify Image CDN.
function igImage(url, w) {
  return `/.netlify/images?url=${encodeURIComponent(url)}&w=${w}&h=${Math.round(w * 1.25)}&fit=cover`;
}

const KIND = { VIDEO: 'Reel', CAROUSEL_ALBUM: 'Album' };

function renderWork(data, b, { skipInstagram = false } = {}) {
  const section = $('[data-gallery]');
  const grid = $('[data-gallery-grid]');
  if (!section || !grid) return;
  const ig = skipInstagram ? null : data.instagram;
  const uploads = (data.media && data.media.gallery) || [];
  let html = '';
  if (ig && Array.isArray(ig.posts) && ig.posts.length) {
    html = ig.posts
      .map((p) => {
        const alt = p.alt || 'Instagram post from Bare Beauty by Ionee';
        const kind = KIND[p.type] ? `<span class="work-kind" aria-hidden="true">${KIND[p.type]}</span>` : '';
        const cap = p.caption ? `<span class="work-cap" aria-hidden="true"><span>${esc(p.caption)}</span></span>` : '';
        return `<a class="work-tile" href="${esc(p.permalink)}" target="_blank" rel="noopener"><img src="${esc(igImage(p.image, 480))}" srcset="${esc(
          igImage(p.image, 480),
        )} 480w, ${esc(igImage(p.image, 800))} 800w" sizes="(min-width: 1120px) 360px, (min-width: 760px) 31vw, 48vw" alt="${esc(alt)}" width="480" height="600" loading="lazy" decoding="async">${cap}${kind}<span class="visually-hidden"> (opens Instagram)</span></a>`;
      })
      .join('');
    const link = $('[data-work-link]');
    if (link && ig.username) link.textContent = `More on Instagram, @${ig.username}`;
  } else if (uploads.length) {
    html = uploads
      .map(
        (m) =>
          `<figure class="work-tile"><img src="${esc(m.url)}" alt="${esc(m.alt || `Work by ${b.name || 'Bare Beauty by Ionee'}`)}" ${
            m.w ? `width="${m.w}" height="${m.h}"` : ''
          } loading="lazy" decoding="async"></figure>`,
      )
      .join('');
  } else if (b.instagram) {
    html = renderSampleWork(b);
  }
  section.hidden = !html;
  if (!html) return;
  if (swap(grid, html)) {
    // A photo that fails to load (an expired Instagram link, say) leaves no gap.
    // If every Instagram photo fails, her uploaded photos (or the stand-in tiles) show instead.
    grid.querySelectorAll('img').forEach((img) => {
      img.addEventListener('error', () => {
        const tile = img.closest('.work-tile');
        if (tile) tile.remove();
        if (grid.querySelector('.work-tile')) return;
        if (ig) renderWork(data, b, { skipInstagram: true });
        else section.hidden = true;
      });
    });
    prepareReveals(section);
  }
}

async function hydrate() {
  try {
    const res = await fetch('/api/site', { headers: { accept: 'application/json' } });
    if (!res.ok) return;
    apply(await res.json());
  } catch {
    // The baked-in menu stays in place if the live data can't load.
  }
}

['[data-menu]', '[data-faq]', '[data-hours]', '[data-contact]', '[data-social]', '[data-signoff]'].forEach((sel) => remember($(sel)));
chrome();
initMotion();
hydrate();
