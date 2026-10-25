// Small helpers shared by every function.
import { randomBytes } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || null;
  }
}

export const fail = (status, message, code) => {
  throw new HttpError(status, message, code);
};

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export async function readJson(req, maxBytes = 200_000) {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > maxBytes) fail(413, 'That request is too large.');
  const text = await req.text();
  if (text.length > maxBytes) fail(413, 'That request is too large.');
  if (!text) return {};
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    fail(400, 'The request could not be read.');
  }
  // Every endpoint expects an object. null, numbers and lists are turned away.
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, 'The request could not be read.');
  return data;
}

export function uid(prefix) {
  return `${prefix}_${randomBytes(9).toString('base64url').replace(/[-_]/g, '').slice(0, 10).toLowerCase()}`;
}

export function randomToken(bytes = 24) {
  return randomBytes(bytes).toString('base64url');
}

// Trim, collapse odd whitespace, cap length. Returns '' for non-strings.
export function str(value, max = 200) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\u0000/g, '').trim().slice(0, max);
}

export function text(value, max = 2000) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

export function int(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function money(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n * 100) / 100;
}

export function bool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

export function phoneDigits(value) {
  const d = String(value || '').replace(/\D/g, '');
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
}

export function normEmail(value) {
  return str(value, 160).toLowerCase();
}

export function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function formatMoney(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? `$${v}` : `$${v.toFixed(2)}`;
}

export function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

export function siteOrigin(req) {
  if (req) {
    try {
      return new URL(req.url).origin;
    } catch {}
  }
  return (process.env.URL || '').replace(/\/$/, '');
}
