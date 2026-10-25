// A stand-in for Instagram's API, for testing the feed locally without a real account.
// It answers the three calls the site makes and serves simple placeholder images.
//
//   node scripts/mock-instagram.mjs            (listens on http://localhost:9911)
//   INSTAGRAM_API_BASE=http://localhost:9911 ADMIN_PASSWORD=... netlify dev
//
// Then connect in the panel with any token that starts with "mock-".
// Never set INSTAGRAM_API_BASE on the live site.
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT) || 9911;
const ORIGIN = `http://localhost:${PORT}`;
const TONES = ['#e8b898', '#c29b6c', '#a27f55', '#ecd9c8', '#6e4a2e', '#f4d3bb', '#3a2c1f', '#e3cbb8', '#bfa88e', '#f1e6d8', '#8f7560', '#d8bfa9'];
const KINDS = ['IMAGE', 'CAROUSEL_ALBUM', 'IMAGE', 'VIDEO', 'IMAGE', 'IMAGE', 'CAROUSEL_ALBUM', 'IMAGE', 'VIDEO', 'IMAGE', 'IMAGE', 'IMAGE'];
const CAPTIONS = [
  'Sample post one. A glowing finish after a classic facial. #skincare',
  'Sample post two. Before and after a hybrid lash set.',
  'Sample post three. Fresh brows for the weekend.',
  'Sample post four. A quick look at the hydro-facial steps.',
  'Sample post five. New openings this week.',
  'Sample post six. Korean lash lift with tint.',
  'Sample post seven.',
  'Sample post eight. Studio corner.',
  'Sample post nine. Lash fill day.',
  'Sample post ten.',
  'Sample post eleven.',
  'Sample post twelve.',
];

function svg(i) {
  const bg = TONES[i % TONES.length];
  const fg = i % 3 === 1 ? '#f7eee5' : '#261c13';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
<defs><radialGradient id="g" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
<rect width="1080" height="1350" fill="${bg}"/><rect width="1080" height="1350" fill="url(#g)"/>
<circle cx="540" cy="600" r="300" fill="none" stroke="${fg}" stroke-opacity=".5" stroke-width="6"/>
<text x="540" y="625" text-anchor="middle" font-family="Georgia, serif" font-size="88" fill="${fg}">Sample ${i + 1}</text>
</svg>`;
}

function media() {
  const now = Date.now();
  return KINDS.map((type, i) => {
    const id = `1790000000000${String(i).padStart(4, '0')}`;
    const image = `${ORIGIN}/img/${i}.svg`;
    const base = {
      id,
      caption: CAPTIONS[i],
      media_type: type,
      permalink: `https://www.instagram.com/p/SAMPLE${i}/`,
      timestamp: new Date(now - i * 86400000 * 2).toISOString(),
    };
    if (type === 'VIDEO') return { ...base, media_url: `${ORIGIN}/video/${i}.mp4`, thumbnail_url: image };
    if (type === 'CAROUSEL_ALBUM') return { ...base, media_url: image, children: { data: [{ media_type: 'IMAGE', media_url: image }] } };
    return { ...base, media_url: image };
  });
}

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'content-type': type, 'access-control-allow-origin': '*' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};

createServer((req, res) => {
  const url = new URL(req.url, ORIGIN);
  const token = url.searchParams.get('access_token') || '';
  const img = url.pathname.match(/^\/img\/(\d+)\.svg$/);
  if (img) return send(res, 200, svg(Number(img[1])), 'image/svg+xml');
  if (!token.startsWith('mock-')) {
    return send(res, 400, { error: { message: 'Invalid OAuth access token - Cannot parse access token', type: 'OAuthException', code: 190 } });
  }
  if (/^\/v\d+\.\d+\/me$/.test(url.pathname)) {
    if (token.includes('personal')) return send(res, 200, { id: '1', user_id: '1', username: 'sample.personal', account_type: 'PERSONAL', media_count: 3 });
    return send(res, 200, { id: '17841400000000000', user_id: '17841400000000000', username: 'barebeautybyionee', account_type: 'BUSINESS', media_count: 12 });
  }
  if (/^\/v\d+\.\d+\/me\/media$/.test(url.pathname)) return send(res, 200, { data: media(), paging: {} });
  if (url.pathname === '/refresh_access_token') return send(res, 200, { access_token: `${token}-r`, token_type: 'bearer', expires_in: 5184000 });
  send(res, 404, { error: { message: 'Unknown path', code: 100 } });
}).listen(PORT, () => console.log(`Mock Instagram API on ${ORIGIN}`));
