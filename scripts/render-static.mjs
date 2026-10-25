// Bakes the default menu, hours and FAQ into public/index.html so the page
// shows real content before JavaScript runs (and for search engines).
// Live edits from the studio panel replace it in the browser a moment later.
// Run after changing netlify/lib/defaults.mjs:  node scripts/render-static.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { DEFAULT_SERVICES, DEFAULT_SETTINGS } from '../netlify/lib/defaults.mjs';
import { renderFaq, renderHours, renderMenu, renderRibbon, ribbonWords } from '../public/assets/js/render.js';

const file = new URL('../public/index.html', import.meta.url);
let html = await readFile(file, 'utf8');

function fill(name, content) {
  const re = new RegExp(`(<!-- generated:${name} -->)[\\s\\S]*?(<!-- /generated:${name} -->)`);
  if (!re.test(html)) throw new Error(`Marker for ${name} not found`);
  // A function replacer, so "$10" in a price is never read as a capture group.
  html = html.replace(re, (_, open, close) => `${open}\n${content}\n${close}`);
}

fill('ribbon', renderRibbon(ribbonWords(DEFAULT_SERVICES.categories, DEFAULT_SETTINGS.business.tagline)));
fill('menu', renderMenu(DEFAULT_SERVICES.categories));
fill('faq', renderFaq(DEFAULT_SETTINGS.faq));
fill('hours', renderHours(DEFAULT_SETTINGS.hours));

await writeFile(file, html);
console.log('index.html updated from defaults.');
