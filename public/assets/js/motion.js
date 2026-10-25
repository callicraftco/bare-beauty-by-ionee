// Motion for the landing page: the ring light, the scrolling ribbon, scroll reveals
// and smooth FAQ answers. All of it is decoration. When someone has reduced motion
// turned on, none of it runs and the page stays still.
import { renderRibbon } from './render.js';

const root = document.documentElement;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

export const motionOn = () => !reduced.matches && 'IntersectionObserver' in window;

// ---------------------------------------------------------------- reveals

// What animates in, and how. Each kind has its own look in site.css.
const REVEALS = [
  ['.menu-head', 'rise'],
  ['.cat', 'menu'],
  ['.about-photo', 'frame'],
  ['.about-copy', 'rise'],
  ['.work-head', 'rise'],
  ['.work-grid > *', 'tile'],
  ['.before-head', 'rise'],
  ['.faq-item', 'faq'],
  ['.visit h2', 'rise'],
  ['.visit-block', 'rise'],
  ['.visit-cta', 'rise'],
  ['.signoff', 'write'],
];

let observer;

function reveal(entries) {
  // Things that come into view together arrive one after another.
  const arriving = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
  arriving.forEach((entry, i) => {
    entry.target.style.setProperty('--d', `${Math.min(i, 6) * 90}ms`);
    entry.target.classList.add('is-in');
    observer.unobserve(entry.target);
  });
}

// Marks elements below the fold so they animate in when scrolled to.
// Anything already on screen is left exactly as it is.
export function prepareReveals(scope = document) {
  if (!motionOn()) return;
  if (!observer) observer = new IntersectionObserver(reveal, { rootMargin: '0px 0px -10% 0px', threshold: 0.01 });
  const fold = window.innerHeight * 0.95;
  for (const [selector, kind] of REVEALS) {
    const found = [...scope.querySelectorAll(selector)];
    for (const el of found) {
      // Hidden sections (the gallery before it loads) are prepared once they show.
      if (el.dataset.rv || !el.getClientRects().length) continue;
      el.dataset.rv = kind;
      if (kind === 'menu') {
        el.querySelectorAll('.svc-list > li').forEach((li, i) => li.style.setProperty('--r', String(Math.min(i, 9))));
      }
      if (el.getBoundingClientRect().top < fold) {
        el.classList.add('is-in');
        continue;
      }
      observer.observe(el);
    }
  }
}

// ---------------------------------------------------------------- FAQ answers open smoothly

function bindFaq() {
  document.addEventListener('click', (e) => {
    const summary = e.target.closest('.faq-item > summary');
    if (!summary || !motionOn()) return;
    const item = summary.parentElement;
    const answer = item.querySelector('.faq-answer');
    if (!answer || typeof answer.animate !== 'function') return;
    e.preventDefault();
    if (item.dataset.moving) return;
    item.dataset.moving = '1';
    const pad = getComputedStyle(answer).paddingBottom;
    const done = () => {
      delete item.dataset.moving;
      item.classList.remove('is-closing');
    };
    if (!item.open) {
      item.open = true;
      const h = answer.offsetHeight;
      const run = answer.animate(
        [
          { height: '0px', paddingBottom: '0px', opacity: 0, transform: 'translateY(-6px)' },
          { height: `${h}px`, paddingBottom: pad, opacity: 1, transform: 'none' },
        ],
        { duration: 380, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' },
      );
      run.onfinish = done;
      run.oncancel = done;
    } else {
      item.classList.add('is-closing');
      const h = answer.offsetHeight;
      const run = answer.animate(
        [
          { height: `${h}px`, paddingBottom: pad, opacity: 1 },
          { height: '0px', paddingBottom: '0px', opacity: 0 },
        ],
        { duration: 280, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
      );
      run.onfinish = () => {
        item.open = false;
        done();
      };
      run.oncancel = done;
    }
  });
}

// ---------------------------------------------------------------- the ring light

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function addSpecks(hero) {
  const ring = hero.querySelector('.hero-ring');
  if (!ring || ring.querySelector('.hero-specks')) return;
  const box = document.createElement('div');
  box.className = 'hero-specks';
  const count = window.innerWidth < 640 ? 11 : 20;
  const intro = root.classList.contains('intro-seen') ? 0.4 : 2;
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    const angle = rand(0, Math.PI * 2);
    const dist = rand(30, 58);
    s.style.setProperty('--x', `${(50 + Math.cos(angle) * dist).toFixed(2)}%`);
    s.style.setProperty('--y', `${(50 + Math.sin(angle) * dist).toFixed(2)}%`);
    s.style.setProperty('--s', `${rand(2, 4.6).toFixed(1)}px`);
    s.style.setProperty('--o', rand(0.35, 0.85).toFixed(2));
    s.style.setProperty('--dx', `${rand(-26, 26).toFixed(0)}px`);
    s.style.setProperty('--dy', `${rand(-150, -50).toFixed(0)}px`);
    s.style.setProperty('--t', `${rand(7, 14).toFixed(1)}s`);
    s.style.setProperty('--dl', `${(intro + rand(0, 7)).toFixed(1)}s`);
    box.append(s);
  }
  ring.append(box);
}

function followPointer(hero) {
  if (!finePointer.matches) return;
  let tx = 0;
  let ty = 0;
  let x = 0;
  let y = 0;
  let frame = 0;
  const tick = () => {
    x += (tx - x) * 0.07;
    y += (ty - y) * 0.07;
    const w = hero.clientWidth;
    const h = hero.clientHeight;
    hero.style.setProperty('--mx', x.toFixed(4));
    hero.style.setProperty('--my', y.toFixed(4));
    hero.style.setProperty('--cx', `${(((x + 1) / 2) * w).toFixed(1)}px`);
    hero.style.setProperty('--cy', `${(((y + 1) / 2) * h).toFixed(1)}px`);
    frame = Math.abs(tx - x) > 0.0008 || Math.abs(ty - y) > 0.0008 ? requestAnimationFrame(tick) : 0;
  };
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    hero.classList.add('has-pointer');
    if (!frame) frame = requestAnimationFrame(tick);
  });
  hero.addEventListener('pointerleave', () => {
    tx = 0;
    ty = 0;
    hero.classList.remove('has-pointer');
    if (!frame) frame = requestAnimationFrame(tick);
  });
}

// ---------------------------------------------------------------- ribbon

let ribbonSet = 0;

// Fills the band with enough copies to cover the screen while it slides.
export function fillRibbon(words) {
  const track = document.querySelector('[data-ribbon]');
  if (!track) return;
  const set = words && words.length ? renderRibbon(words) : track.firstElementChild ? track.firstElementChild.innerHTML : '';
  if (!set) return;
  track.innerHTML = `<span class="ribbon-set">${set}</span>`;
  if (!motionOn()) return;
  const width = track.firstElementChild.getBoundingClientRect().width;
  if (!width) return;
  ribbonSet = width;
  const copies = Math.ceil((window.innerWidth * 1.6) / width) + 1;
  track.innerHTML = Array.from({ length: copies }, () => `<span class="ribbon-set">${set}</span>`).join('');
  moveRibbon();
}

function moveRibbon() {
  const track = document.querySelector('[data-ribbon]');
  if (!track || !ribbonSet) return;
  const y = window.scrollY;
  const offset = (y * 0.42) % ribbonSet;
  track.style.transform = `translate3d(${(-offset).toFixed(1)}px, 0, 0)`;
  track.style.setProperty('--spin', `${(y * 0.25).toFixed(1)}deg`);
}

// ---------------------------------------------------------------- scroll

function onScroll(hero) {
  let ticking = false;
  let last = -1;
  const frame = () => {
    ticking = false;
    if (hero) {
      const p = Math.min(1, Math.max(0, window.scrollY / (hero.offsetHeight || 1)));
      if (Math.abs(p - last) > 0.001) {
        hero.style.setProperty('--p', p.toFixed(4));
        last = p;
      }
    }
    moveRibbon();
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(frame);
      }
    },
    { passive: true },
  );
  frame();
}

// ---------------------------------------------------------------- start

export function initMotion() {
  if (!motionOn()) return;
  root.classList.add('motion');
  const hero = document.querySelector('.hero');
  if (hero) {
    addSpecks(hero);
    followPointer(hero);
    // Rest the ambient light while the hero is off screen.
    new IntersectionObserver(([e]) => hero.classList.toggle('is-off', !e.isIntersecting)).observe(hero);
  }
  onScroll(hero);
  prepareReveals();
  bindFaq();
  const settle = () => fillRibbon();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(settle);
  else settle();
  let width = window.innerWidth;
  window.addEventListener('resize', () => {
    if (Math.abs(window.innerWidth - width) < 40) return;
    width = window.innerWidth;
    settle();
  });
}
