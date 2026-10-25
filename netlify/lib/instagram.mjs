// Instagram posts for the "Recent work" section.
//
// Uses the Instagram API with Instagram Login (graph.instagram.com) and a long-lived
// access token pasted into the studio panel once. The token stays in Blobs and is never
// sent to a browser. Posts are cached in Blobs and refreshed by a scheduled function,
// and the token renews itself well before its 60 days run out.
import { HttpError, str, text } from './util.mjs';
import { mutateDoc, readDoc, store, writeDoc } from './store.mjs';

const API = (process.env.INSTAGRAM_API_BASE || 'https://graph.instagram.com').replace(/\/$/, '');
const VERSION = 'v26.0';
const ACCOUNT_KEY = 'instagram'; // token, account and sync status (private)
const FEED_KEY = 'instagram-feed'; // posts and display choices (what the site reads)

export const FRESH_HOURS = 72; // the site hides posts this long after the last good sync (their image links expire)
const REFRESH_AFTER_DAYS = 3; // renew the token once it's this old (it must be at least a day old)
const KEEP = 12; // posts kept in the cache
export const COUNTS = [3, 6, 9, 12];

// Where Instagram serves images from. Only these are passed to the site.
const MEDIA_HOSTS = [/^https:\/\/([a-z0-9-]+\.)*cdninstagram\.com\//i, /^https:\/\/([a-z0-9-]+\.)*fbcdn\.net\//i];
// Local testing only: a stand-in API may serve its own images.
const TEST_ORIGIN = process.env.INSTAGRAM_API_BASE ? new URL(process.env.INSTAGRAM_API_BASE).origin : '';

export function allowedImage(url) {
  if (typeof url !== 'string') return false;
  if (TEST_ORIGIN && url.startsWith(`${TEST_ORIGIN}/`)) return true;
  return MEDIA_HOSTS.some((re) => re.test(url));
}

// Post links look like https://www.instagram.com/p/ABC123/ or /reel/ABC123/. Nothing else passes.
const allowedPermalink = (url) => typeof url === 'string' && /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9_\-./]+$/.test(url);

// ------------------------------------------------------------------ Instagram calls

class Stale extends Error {}

class InstagramError extends Error {
  constructor(message, code, kind) {
    super(message);
    this.code = code;
    this.kind = kind; // 'token' | 'account' | 'limit' | 'network' | 'other'
  }
}

async function call(path, params) {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let res;
  try {
    res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  } catch {
    throw new InstagramError("Instagram didn't answer. Try again in a few minutes.", 0, 'network');
  }
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok || data.error) {
    const err = data.error || {};
    const code = Number(err.code) || res.status;
    if (code === 190 || code === 102 || res.status === 401) {
      throw new InstagramError('Instagram says this token is not valid or has expired. Make a new token and connect again.', code, 'token');
    }
    if ([4, 17, 32, 613].includes(code) || res.status === 429) {
      throw new InstagramError('Instagram is limiting requests right now. It will try again later.', code, 'limit');
    }
    throw new InstagramError(`Instagram returned an error: ${str(err.message, 160) || `status ${res.status}`}`, code, 'other');
  }
  return data;
}

async function fetchAccount(token) {
  const me = await call(`/${VERSION}/me`, { fields: 'user_id,username,account_type,media_count', access_token: token });
  const type = String(me.account_type || '').toUpperCase();
  if (type && !['BUSINESS', 'MEDIA_CREATOR', 'CREATOR'].includes(type)) {
    throw new InstagramError(
      'This is a personal Instagram account. Switch it to a professional account (Creator or Business) in the Instagram app, then make a new token.',
      0,
      'account',
    );
  }
  return { userId: str(me.user_id || me.id, 40), username: str(me.username, 40), accountType: type };
}

const FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';

async function fetchMedia(token) {
  const params = { fields: `${FIELDS},alt_text,children{media_type,media_url,thumbnail_url}`, limit: String(KEEP + 6), access_token: token };
  try {
    return await call(`/${VERSION}/me/media`, params);
  } catch (err) {
    // Older API versions don't know alt_text. Ask again without it.
    if (err.kind === 'other' && Number(err.code) === 100) {
      return call(`/${VERSION}/me/media`, { ...params, fields: `${FIELDS},children{media_type,media_url,thumbnail_url}` });
    }
    throw err;
  }
}

async function refreshToken(token) {
  const data = await call('/refresh_access_token', { grant_type: 'ig_refresh_token', access_token: token });
  if (!data.access_token) throw new InstagramError('Instagram did not return a new token.', 0, 'other');
  return { token: String(data.access_token), expiresIn: Number(data.expires_in) || 60 * 86400 };
}

// ------------------------------------------------------------------ turning posts into tiles

function captionAlt(caption, timestamp) {
  const first = String(caption || '')
    .replace(/#[\p{L}\p{N}_]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s/)[0];
  if (first && first.length >= 8) return first.length > 140 ? `${first.slice(0, 137).trim()}...` : first;
  const day = timestamp ? new Date(timestamp).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  return day ? `Instagram post from ${day}` : 'Instagram post';
}

function pickImage(m) {
  const type = String(m.media_type || '');
  if (type === 'IMAGE' && allowedImage(m.media_url)) return m.media_url;
  if (type === 'VIDEO') return allowedImage(m.thumbnail_url) ? m.thumbnail_url : '';
  if (type === 'CAROUSEL_ALBUM') {
    // The album's own media_url is its first item, which can be a video, so the
    // children decide: the first photo, or a video's cover image.
    const children = (m.children && m.children.data) || [];
    for (const c of children) {
      if (c.media_type === 'IMAGE' && allowedImage(c.media_url)) return c.media_url;
      if (c.media_type === 'VIDEO' && allowedImage(c.thumbnail_url)) return c.thumbnail_url;
    }
    if (!children.length && allowedImage(m.media_url) && !/\.mp4(\?|$)/i.test(m.media_url)) return m.media_url;
  }
  return '';
}

export function toPosts(items) {
  const out = [];
  for (const m of items || []) {
    const image = pickImage(m);
    if (!image || !allowedPermalink(m.permalink)) continue;
    const caption = text(m.caption, 2200);
    out.push({
      id: str(m.id, 40),
      type: ['IMAGE', 'VIDEO', 'CAROUSEL_ALBUM'].includes(m.media_type) ? m.media_type : 'IMAGE',
      image,
      permalink: m.permalink,
      timestamp: str(m.timestamp, 40),
      caption: caption.length > 220 ? `${caption.slice(0, 217).trim()}...` : caption,
      alt: str(m.alt_text, 300) || captionAlt(caption, m.timestamp),
    });
    if (out.length >= KEEP) break;
  }
  return out;
}

// ------------------------------------------------------------------ stored state

export const getAccount = () => readDoc(ACCOUNT_KEY, null);
export const getFeed = () => readDoc(FEED_KEY, { show: true, count: 6, posts: [], syncedAt: '', username: '' });

const hoursSince = (iso) => (iso ? (Date.now() - Date.parse(iso)) / 3600000 : Infinity);

// What the public site gets. Nothing at all unless Instagram is connected and the
// posts are fresh and switched on.
export function publicFeed(feed, account) {
  if (!account || !account.token) return null;
  if (!feed || !feed.show || !Array.isArray(feed.posts) || !feed.posts.length) return null;
  if (hoursSince(feed.syncedAt) > FRESH_HOURS) return null;
  return {
    username: feed.username || '',
    posts: feed.posts.slice(0, COUNTS.includes(feed.count) ? feed.count : 6).map((p) => ({
      id: p.id,
      type: p.type,
      image: p.image,
      permalink: p.permalink,
      caption: p.caption,
      alt: p.alt,
    })),
  };
}

// What the studio panel gets. Never the token.
export async function status() {
  const [account, feed] = await Promise.all([getAccount(), getFeed()]);
  if (!account || !account.token) return { connected: false, show: feed.show, count: feed.count };
  return {
    connected: true,
    username: account.username,
    accountType: account.accountType,
    connectedAt: account.connectedAt,
    refreshedAt: account.refreshedAt || '',
    expiresAt: account.expiresAt || '',
    expiresEstimated: Boolean(account.expiresEstimated),
    lastSyncAt: account.lastSyncAt || '',
    lastSyncOk: account.lastSyncOk || '',
    lastError: account.lastError || '',
    lastErrorKind: account.lastErrorKind || '',
    show: feed.show,
    count: feed.count,
    fresh: hoursSince(feed.syncedAt) <= FRESH_HOURS,
    posts: (feed.posts || []).map((p) => ({ id: p.id, type: p.type, image: p.image, permalink: p.permalink, alt: p.alt })),
  };
}

async function saveAccount(change) {
  return mutateDoc(ACCOUNT_KEY, null, (doc) => {
    if (!doc) throw new HttpError(409, 'Instagram was disconnected.');
    change(doc);
  });
}

// ------------------------------------------------------------------ actions

export async function connect(rawToken) {
  const token = String(rawToken || '').trim();
  if (token.length < 20 || /\s/.test(token)) throw new HttpError(400, 'That doesn\'t look like an Instagram access token. Copy the whole token and try again.');
  let account;
  try {
    account = await fetchAccount(token);
  } catch (err) {
    if (err instanceof InstagramError) throw new HttpError(400, err.message, 'instagram');
    throw err;
  }
  const now = new Date().toISOString();
  await writeDoc(ACCOUNT_KEY, {
    token,
    ...account,
    connectedAt: now,
    refreshedAt: now,
    // Tokens made in the Meta dashboard last 60 days. The first renewal replaces this guess.
    expiresAt: new Date(Date.now() + 60 * 86400000).toISOString(),
    expiresEstimated: true,
    lastSyncAt: '',
    lastSyncOk: '',
    lastError: '',
    lastErrorKind: '',
  });
  await mutateDoc(FEED_KEY, EMPTY_FEED, (doc) => {
    doc.username = account.username;
    doc.posts = [];
    doc.syncedAt = '';
  });
  await sync({ force: true });
  return status();
}

export async function disconnect() {
  await Promise.all([store().delete(ACCOUNT_KEY), store().delete(FEED_KEY)]);
}

const EMPTY_FEED = { show: true, count: 6, posts: [], syncedAt: '', username: '' };

// Changes only the display choices, so a sync landing at the same moment can't undo them.
export async function setPrefs({ show, count }) {
  const { data } = await mutateDoc(FEED_KEY, EMPTY_FEED, (doc) => {
    if (typeof show === 'boolean') doc.show = show;
    if (count !== undefined && COUNTS.includes(Number(count))) doc.count = Number(count);
  });
  return data;
}

// Renews the token when it's due, then pulls the latest posts.
// Returns { ok, changed, error }. Never throws for Instagram problems; they're recorded.
export async function sync({ force = false } = {}) {
  const account = await getAccount();
  if (!account || !account.token) return { ok: false, changed: false, error: 'not connected' };
  if (!force && hoursSince(account.lastSyncAt) < 0.01) return { ok: true, changed: false };

  let token = account.token;
  const notes = {};
  const ageDays = hoursSince(account.refreshedAt || account.connectedAt) / 24;
  if (ageDays >= REFRESH_AFTER_DAYS) {
    try {
      const fresh = await refreshToken(token);
      token = fresh.token;
      Object.assign(notes, {
        token,
        refreshedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + fresh.expiresIn * 1000).toISOString(),
        expiresEstimated: false,
      });
    } catch (err) {
      // A failed renewal isn't fatal while the old token still works; the next run tries again.
      if (!(err instanceof InstagramError)) throw err;
      if (err.kind === 'token') {
        await saveAccount((doc) => Object.assign(doc, { lastSyncAt: new Date().toISOString(), lastError: err.message, lastErrorKind: err.kind }));
        return { ok: false, changed: false, error: err.message };
      }
    }
  }

  const now = new Date().toISOString();
  try {
    const media = await fetchMedia(token);
    const posts = toPosts(media.data);
    const before = await getFeed();
    const changed = JSON.stringify(posts) !== JSON.stringify(before.posts || []) || !before.syncedAt || hoursSince(before.syncedAt) > FRESH_HOURS / 2;
    await saveAccount((doc) => {
      if (doc.token !== account.token && doc.token !== token) return; // reconnected meanwhile; leave it
      Object.assign(doc, notes, { lastSyncAt: now, lastSyncOk: now, lastError: '', lastErrorKind: '' });
    });
    // Only the posts change here, never the display choices, and nothing is written if
    // Instagram was disconnected or reconnected while this ran.
    let stale = false;
    await mutateDoc(FEED_KEY, EMPTY_FEED, async (doc) => {
      const current = await getAccount();
      stale = !current || (current.token !== token && current.token !== account.token);
      if (stale) throw new Stale();
      doc.posts = posts;
      doc.syncedAt = now;
      doc.username = account.username;
    }).catch((err) => {
      if (!(err instanceof Stale)) throw err;
    });
    if (stale) return { ok: false, changed: false, error: 'Instagram was disconnected.' };
    return { ok: true, changed };
  } catch (err) {
    if (!(err instanceof InstagramError) && !(err instanceof HttpError)) throw err;
    await saveAccount((doc) => Object.assign(doc, notes, { lastSyncAt: now, lastError: err.message, lastErrorKind: err.kind || 'other' })).catch(() => {});
    return { ok: false, changed: false, error: err.message };
  }
}
