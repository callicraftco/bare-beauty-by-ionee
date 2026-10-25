// Points the site's absolute links (social preview, sitemap, robots) at your real domain.
// Usage:  node scripts/set-domain.mjs yourdomain.com
import { readFile, writeFile } from 'node:fs/promises';

const domain = (process.argv[2] || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) {
  console.error('Give the domain, like: node scripts/set-domain.mjs barebeautybyionee.com');
  process.exit(1);
}
const files = ['public/index.html', 'public/privacy/index.html', 'public/terms/index.html', 'public/accessibility/index.html', 'public/robots.txt', 'public/sitemap.xml'];
for (const f of files) {
  const url = new URL(`../${f}`, import.meta.url);
  const text = await readFile(url, 'utf8');
  const next = text.replace(/https:\/\/[a-z0-9.-]+\.[a-z]{2,}(?=\/)/g, (m) => (m.includes('instagram.com') || m.includes('schema.org') || m.includes('sitemaps.org') ? m : `https://${domain}`));
  await writeFile(url, next);
  console.log(`${f}: updated`);
}
