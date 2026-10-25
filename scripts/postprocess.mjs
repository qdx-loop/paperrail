// PaperRail post-processing for BentoPDF dist/
// idempotent — safe to rerun after every vite build
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const SITE = (process.env.SITE_URL || 'https://qdxil.qzz.io').replace(/\/+$/, '');
const OG = `${SITE}/assets/brand/og.png`;
// Paths are overridable so the script works from a checkout as well as from
// the build sandbox used for the paperrail.pages.dev deployment.
const SRC = process.env.PAPERRAIL_SRC || '/tmp/opencode/bentopdf-src';
const DIST = process.env.PAPERRAIL_DIST || path.join(SRC, 'dist');
const BRAND = process.env.PAPERRAIL_BRAND || '/tmp/opencode/brand';

const rm = (p) => fs.rmSync(p, { recursive: true, force: true });
const cp = (s, d) => fs.cpSync(s, d, { recursive: true });
const exists = (p) => fs.existsSync(p);

// 0) copy our site pages + brand assets + license
cp(path.join(BRAND, 'pages', 'guides'), path.join(DIST, 'guides'));
for (const f of ['about.html', 'privacy.html', 'robots.txt', 'sitemap.xml'])
  cp(path.join(BRAND, 'pages', f), path.join(DIST, f));
fs.mkdirSync(path.join(DIST, 'assets', 'brand'), { recursive: true });
for (const f of ['logo.svg', 'og.png', 'favicon.ico', 'brand.css'])
  cp(path.join(BRAND, f), path.join(DIST, 'assets', 'brand', f));
cp(path.join(BRAND, 'favicon.ico'), path.join(DIST, 'favicon.ico'));
fs.mkdirSync(path.join(DIST, 'images'), { recursive: true });
cp(path.join(BRAND, 'logo.svg'), path.join(DIST, 'images', 'favicon.svg'));
cp(path.join(BRAND, 'logo.svg'), path.join(DIST, 'images', 'favicon-no-bg.svg'));
execSync(
  `magick ${BRAND}/logo.svg -resize 192x192 ${DIST}/images/favicon-192x192.png && magick ${BRAND}/logo.svg -resize 512x512 ${DIST}/images/favicon-512x512.png && magick ${BRAND}/logo.svg -resize 180x180 ${DIST}/images/apple-touch-icon.png`
);
rm(path.join(DIST, 'libreoffice-wasm')); // PaperRail note: LO files are re-added and split below
for (const f of ['LICENSE', 'CCLA.md', 'ICLA.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md'])
  if (exists(path.join(SRC, f)) && !exists(path.join(DIST, f)))
    cp(path.join(SRC, f), path.join(DIST, f));

// 0.5) restore LibreOffice engine files fresh from public/, then split
rm(path.join(DIST, 'libreoffice-wasm'));
cp(path.join(SRC, 'public', 'libreoffice-wasm'), path.join(DIST, 'libreoffice-wasm'));

// 1) rm precompressed duplicates (stale after our edits; Pages compresses at edge)
let removed = 0;
(function rmDups(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['.git', 'node_modules'].includes(e.name)) rmDups(p); continue; }
    if (/libreoffice-wasm/.test(dir)) continue; // keep .gz engine files (split later)
    if (/\.(br|gz)$/.test(e.name)) { fs.unlinkSync(p); removed++; }
  }
})(DIST);

// 2) brand + domain + og rewrite
// Files authored by us are already branded and contain legitimate upstream
// attribution ("built on BentoPDF", links to the original repo). Never run the
// blanket BentoPDF->PaperRail substitution over them.
const OURS = new Set(
  ['about.html', 'privacy.html', 'robots.txt', 'sitemap.xml'].map((f) => path.join(DIST, f))
);
for (const f of ['logo.svg', 'og.png', 'favicon.ico'])
  OURS.add(path.join(DIST, 'assets', 'brand', f));
for (const f of ['favicon.svg', 'favicon-no-bg.svg'])
  OURS.add(path.join(DIST, 'images', f));
let rewritten = 0;
function rewrite(dir, exts) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['.git', 'node_modules'].includes(e.name)) continue;
      if (p === path.join(DIST, 'guides')) continue;
      rewrite(p, exts);
      continue;
    }
    if (OURS.has(p)) continue;
    if (!exts.some((x) => e.name.endsWith(x))) continue;
    let s = fs.readFileSync(p, 'utf8');
    const o = s;
    s = s.split('https://www.bentopdf.com').join(SITE);
    s = s.split('BentoPDF').join('PaperRail');
    s = s.split('Bento PDF').join('PaperRail');
    // never rewrite attribution statements into a self-reference
    s = s.split('Built on PaperRail').join('Built on BentoPDF');
    s = s.split('Built on Bento PDF').join('Built on BentoPDF');
    s = s.split('upstream PaperRail author').join('upstream BentoPDF author');
    s = s
      .split('<a href="https://github.com/alam00000/bentopdf" rel="noopener">PaperRail</a>')
      .join('<a href="https://github.com/alam00000/bentopdf" rel="noopener">BentoPDF</a>');
    s = s.replace(/(og:image[^>]*content=")[^"]*(")/g, `$1${OG}$2`);
    s = s.replace(/(twitter:image[^>]*content=")[^"]*(")/g, `$1${OG}$2`);
    if (s !== o) { fs.writeFileSync(p, s); rewritten++; }
  }
}
rewrite(DIST, ['.html', '.json', '.js', '.xml', '.txt', '.svg']);

// 2a) the site was previously deployed on paperrail.pages.dev; authored pages
// and robots.txt carry that hostname. Keep every absolute URL on SITE.
(function replaceOldHost(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['.git', 'node_modules'].includes(e.name)) continue;
      replaceOldHost(p);
      continue;
    }
    if (!/\.(html|txt|xml|json)$/.test(e.name)) continue;
    let s = fs.readFileSync(p, 'utf8');
    const o = s;
    s = s.split('https://paperrail.pages.dev').join(SITE);
    if (s !== o) fs.writeFileSync(p, s);
  }
})(DIST);

// 2b) Guides are English-only: undo the /<lang>/guides/ prefix that the i18n
// generator adds to every internal link, otherwise those links 404.
for (const lang of fs.readdirSync(DIST)) {
  if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(lang)) continue;
  const dir = path.join(DIST, lang);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.html')) continue;
    const p = path.join(dir, f);
    let s = fs.readFileSync(p, 'utf8');
    const o = s;
    s = s.split(`href="/${lang}/guides/`).join('href="/guides/');
    if (f === 'index.html') {
      // directory URL: keep canonical/og:url consistent with the trailing slash
      s = s.split(`rel="canonical" href="${SITE}/${lang}"`).join(`rel="canonical" href="${SITE}/${lang}/"`);
      s = s.split(`property="og:url" content="${SITE}/${lang}"`).join(`property="og:url" content="${SITE}/${lang}/"`);
    }
    if (s !== o) fs.writeFileSync(p, s);
  }
}

// 3) index.html head + hero (replace whole primary meta block & inject hero)
const idx = path.join(DIST, 'index.html');
let h = fs.readFileSync(idx, 'utf8');
const TITLE = 'PaperRail — Free Online PDF Tools (100% In-Browser, No Uploads)';
const DESC = 'Merge, split, compress, convert and OCR PDFs in your browser. Files never leave your device — no uploads, no signup, no watermarks. 100+ free tools powered by WebAssembly.';
if (!h.includes('content="PaperRail"') || !h.includes('og:site_name')) {
  // formatting-agnostic: the build's HTML prettifier wraps long attributes
  h = h.replace(/<title>[^<]*<\/title>/, `<title>${TITLE}</title>`);
  h = h.replace(/(<meta\s+name="title"\s+content=")[^"]*(")/, `$1${TITLE}$2`);
  h = h.replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${DESC}$2`);
  h = h.replace(/(<meta\s+name="apple-mobile-web-app-title"\s+content=")[^"]*(")/, `$1PaperRail$2`);
  const metaBlock =
    `    <link rel="canonical" href="${SITE}/" />\n` +
    `    <meta property="og:type" content="website" />\n` +
    `    <meta property="og:url" content="${SITE}/" />\n` +
    `    <meta property="og:site_name" content="PaperRail" />\n` +
    `    <meta property="og:title" content="PaperRail — Free Online PDF Tools (No Uploads)" />\n` +
    `    <meta property="og:description" content="100+ PDF tools that run entirely in your browser. Your files are never uploaded." />\n` +
    `    <meta property="og:image" content="${OG}" />\n` +
    `    <meta name="twitter:card" content="summary_large_image" />\n` +
    `    <meta name="twitter:title" content="PaperRail — Free Online PDF Tools (No Uploads)" />\n` +
    `    <meta name="twitter:description" content="100+ PDF tools that run entirely in your browser. Your files are never uploaded." />\n` +
    `    <meta name="twitter:image" content="${OG}" />\n\n` +
    `    <!-- Mobile Web App -->`;
  if (!h.includes('og:site_name')) h = h.replace('<!-- Mobile Web App -->', metaBlock);
}
const heroAnchor = `<div id="tools-header" class="text-center mb-12 pt-8">`;
const heroBlock =
  `      <!-- PaperRail hero -->\n` +
  `      <div id="pf-hero" class="text-center mb-8 pt-4">\n` +
  `        <p class="text-gray-300 max-w-3xl mx-auto text-base md:text-lg">\n` +
  `          Every tool on this site runs <strong class="text-white">100% in your browser</strong> — powered by WebAssembly.\n` +
  `          Your documents never touch a server: no uploads, no queues, no accounts.\n` +
  `        </p>\n` +
  `        <p class="mt-3 flex flex-wrap justify-center gap-2">\n` +
  `          <a href="/guides/compress-pdf-to-100kb" class="bg-gray-700 text-gray-100 hover:bg-gray-600 rounded-lg px-3 py-1.5 text-sm">Shrink a PDF to 100KB</a>\n` +
  `          <a href="/guides/heic-to-pdf" class="bg-gray-700 text-gray-100 hover:bg-gray-600 rounded-lg px-3 py-1.5 text-sm">HEIC photo → PDF</a>\n` +
  `          <a href="/guides/merge-pdf-no-upload" class="bg-gray-700 text-gray-100 hover:bg-gray-600 rounded-lg px-3 py-1.5 text-sm">Merge without uploading</a>\n` +
  `          <a href="/about" class="text-gray-400 hover:text-gray-200 rounded-lg px-3 py-1.5 text-sm underline">About &amp; privacy →</a>\n` +
  `        </p>\n` +
  `      </div>\n\n` +
  `      ${heroAnchor}`;
if (h.includes(heroAnchor) && !h.includes('PaperRail hero'))
  h = h.replace(heroAnchor, heroBlock);
fs.writeFileSync(idx, h);

// 4) _headers: append our CORS-proxy origin for LibreOffice (repeat-safe)
const hd = path.join(DIST, '_headers');
if (exists(hd)) {
  let s = fs.readFileSync(hd, 'utf8');
  const loOrigin = 'https://paperrail-libs.qdx19qdx-324.workers.dev';
  if (!s.includes(loOrigin)) s = s.replace(/connect-src ([^\n]*)/, (m, rest, off, str) => 'connect-src ' + loOrigin + ' ' + (rest.startsWith('blob:') ? loOrigin + ' ' : '') + rest);
  fs.writeFileSync(hd, s);
}

// 5) fresh sitemap (tools extensionless + our pages)
const skip = new Set(['404.html', 'wasm-settings.html'].map((x) => path.join(DIST, x)));
const urls = new Map();
urls.set(SITE + '/', '1.0|daily');
urls.set(SITE + '/about', '0.5|monthly');
urls.set(SITE + '/privacy', '0.5|monthly');
urls.set(SITE + '/guides/compress-pdf-to-100kb', '0.8|monthly');
urls.set(SITE + '/guides/heic-to-pdf', '0.8|monthly');
urls.set(SITE + '/guides/merge-pdf-no-upload', '0.8|monthly');
urls.add; // noop
for (const f of fs.readdirSync(DIST)) {
  if (!f.endsWith('.html') || f === 'index.html' || skip.has(path.join(DIST, f))) continue;
  const loc = `${SITE}/${f.replace(/\.html$/, '')}`;
  if (!urls.has(loc)) urls.set(loc, '0.9|weekly');
}
// localized pages generated by scripts/generate-i18n-pages.mjs
for (const lang of fs.readdirSync(DIST)) {
  if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(lang)) continue;
  const dir = path.join(DIST, lang);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.html')) continue;
    const loc = f === 'index.html'
      ? `${SITE}/${lang}/`
      : `${SITE}/${lang}/${f.replace(/\.html$/, '')}`;
    if (!urls.has(loc)) urls.set(loc, '0.7|monthly');
  }
}
let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
for (const [loc, meta] of urls) {
  const [p, f] = meta.split('|');
  xml += `  <url>\n    <loc>${loc}</loc>\n    <lastmod>2026-10-25</lastmod>\n    <changefreq>${f}</changefreq>\n    <priority>${p}</priority>\n  </url>\n`;
}
xml += '</urlset>\n';
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), xml);

// 6) split >25MB files into parts for Pages upload
const splitInto = (file, partBytes) => {
  if (!exists(file)) return;
  const buf = fs.readFileSync(file);
  const parts = Math.ceil(buf.length / partBytes);
  for (let i = 0; i < parts; i++) {
    fs.writeFileSync(`${file}.p${i}`, buf.subarray(i * partBytes, Math.min((i + 1) * partBytes, buf.length)));
  }
  fs.unlinkSync(file);
};
const PART = 20 * 1024 * 1024;
splitInto(path.join(DIST, 'libreoffice-wasm', 'soffice.wasm.gz'), PART);
splitInto(path.join(DIST, 'libreoffice-wasm', 'soffice.data.gz'), PART);

console.log(`postprocess done: removed=${removed} rewritten=${rewritten} sitemap=${urls.size}`);
