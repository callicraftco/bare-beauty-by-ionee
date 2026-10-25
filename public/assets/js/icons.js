// Line icons on a 24px grid: round caps, drawn in the current text color (stroke set in base.css).
// Most shapes are from Lucide (ISC license, see assets/fonts/LICENSES.txt). "facial" and "wax"
// are drawn for this site in the same style.

const SHAPES = {
  // A drop of moisture with a glint: facials
  facial:
    '<path d="M10 21a6 6 0 0 0 6-6c0-1.7-.9-3.3-2.6-4.7S10.4 6.9 10 4.7c-.4 2.2-1.7 4.2-3.4 5.6S4 13.3 4 15a6 6 0 0 0 6 6z"/><path d="M7.4 15.4a2.7 2.7 0 0 0 2.2 2.6"/><path d="M19 2.5v4"/><path d="M21 4.5h-4"/>',
  // A wax pot with a spatula and a drip over the rim: waxing
  wax: '<path d="M4 11h16"/><path d="M5.5 11v6.5A3.5 3.5 0 0 0 9 21h6a3.5 3.5 0 0 0 3.5-3.5V11"/><path d="M9 11v2.6a1.4 1.4 0 0 0 2.8 0V11"/><path d="m12.8 11 3.6-7.1a1.45 1.45 0 0 1 2.6 1.3L16.1 11"/>',
  // Closed lashed eye, like the logo: lashes
  lashes: '<path d="M2 8a10.645 10.645 0 0 0 20 0"/><path d="m4 15 1.726-2.05"/><path d="m9 18 .722-3.25"/><path d="m15 18-.722-3.25"/><path d="m20 15-1.726-2.05"/>',
  sparkles:
    '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
  list: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  calendar:
    '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>',
  'calendar-check': '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',
  'calendar-clock':
    '<path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h5"/><path d="M17.5 17.5 16 16.3V14"/><circle cx="16" cy="16" r="6"/>',
  'calendar-x': '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m14 14-4 4"/><path d="m10 14 4 4"/>',
  wallet:
    '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  pin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  'message-heart':
    '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M15.8 9.2a2.5 2.5 0 0 0-3.5 0l-.3.4-.35-.3a2.42 2.42 0 1 0-3.2 3.6l3.6 3.5 3.6-3.5c1.2-1.2 1.1-2.7.2-3.7"/>',
  phone:
    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  instagram: '<rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><path d="M17.5 6.5h.01"/>',
};

export const ICON_NAMES = Object.keys(SHAPES);

export function icon(name, cls = '') {
  const shape = SHAPES[name] || SHAPES.sparkles;
  return `<svg class="icon${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${shape}</svg>`;
}

// The menu's sections, by category id or heading: Facials, Waxing, Lashes.
export function categoryIcon(idOrTitle) {
  const key = String(idOrTitle || '').toLowerCase();
  if (key.includes('facial')) return 'facial';
  if (key.includes('wax')) return 'wax';
  if (key.includes('lash') || key.includes('brow')) return 'lashes';
  return 'sparkles';
}

// Questions in "Before you come". Ionee can add her own, so unknown ones get a sparkle.
export function faqIcon(f) {
  const key = `${f.id || ''} ${f.q || ''}`.toLowerCase();
  if (/cancel|late|resched/.test(key)) return 'calendar-x';
  if (/fill/.test(key)) return 'calendar-clock';
  if (/pay|price|deposit|cash/.test(key)) return 'wallet';
  if (/facial|skin/.test(key)) return 'facial';
  if (/wax/.test(key)) return 'wax';
  if (/lash|lift/.test(key)) return 'lashes';
  if (/book/.test(key)) return 'calendar-check';
  return 'sparkles';
}
