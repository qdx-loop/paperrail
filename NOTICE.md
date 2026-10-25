# PaperRail — Notices & Modifications

PaperRail (https://paperrail.pages.dev) is a redeployment of the open-source
project **BentoPDF** (v2.8.10) by alam00000 — https://github.com/alam00000/bentopdf
— dual-licensed under AGPL-3.0-only and a commercial option. This fork is
published under **AGPL-3.0-only** in accordance with that license.

## Modifications made in this fork

1. `src/js/utils/libreoffice-loader.ts`
   - Default engine root kept local (`BASE_URL + libreoffice-wasm/`). Cloudflare
     Pages rejects files above 25 MiB, so the LibreOffice WASM engine
     (`soffice.wasm.gz` ≈ 47 MB, `soffice.data.gz` ≈ 28 MB) is deployed as
     `.p0`, `.p1`, … parts inside the same Pages root.
   - `fetchAsDecompressedUrl` prefers part URLs, concatenates them into one
     Blob, and applies the existing gzip DecompressionStream path.
   - `initialize()` now also fetches `soffice.js`, `soffice.worker.js` and
     `browser.worker.global.js` with CORS and mints blob: URLs for them, so the
     strict Content-Security-Policy (`worker-src 'self' blob:`) of the static
     deployment is honoured.

2. Branding is applied through the project's own build-time variables:
   `SIMPLE_MODE=true`, `SITE_URL=https://qdxil.qzz.io`,
   `VITE_BRAND_NAME=PaperRail`, `VITE_BRAND_LOGO=assets/brand/logo.svg`,
   `VITE_FOOTER_TEXT=…`, `VITE_USE_CDN=true`, plus one PaperRail addition:
   `VITE_ENABLE_SW` (unset = disabled). All 24 upstream languages are enabled:
   `scripts/generate-i18n-pages.mjs` generates the localized tool pages
   (≈3.2k files) after `vite build`, and `VITE_LANGUAGES` stays unset.

3. Runtime behaviour changes (small, surgical):
   - `src/js/main.ts` (SIMPLE_MODE block): the runtime `<title>` override now
     only fires when the document still carries a generic upstream title, so
     the per-tool SEO titles and the branded homepage title survive.
   - `src/js/i18n/i18n.ts`: supported languages can be restricted with
     `VITE_LANGUAGES`; PaperRail leaves it unset so all 24 languages are
     listed, and generates the matching `/zh/…`, `/ja/…` pages at build time.
   - `src/js/i18n/language-switcher.ts`: the simple-mode footer mounts a
     switcher before i18n is ready, which printed "undefined" as the placeholder
     and could not localize its labels. The switcher now falls back safely and
     is re-created (localized) once translations are loaded.
   - `src/js/sw-register.ts` + `public/sw.js`: the service worker is disabled
     unless `VITE_ENABLE_SW=true`. The upstream cache-first worker pinned
     hashed bundles across releases (mixed old/new `main-*.js` after a deploy,
     which broke grid rendering). The deployed `sw.js` is a kill switch that
     clears caches, unregisters itself and reloads controlled clients once.

4. `branding/pages/` — new static pages deployed alongside the app:
   - `about.html`, `privacy.html` (privacy policy, analytics description)
   - `guides/compress-pdf-to-100kb.html`, `guides/heic-to-pdf.html`,
     `guides/merge-pdf-no-upload.html` — SEO/how-to landing content
   - `robots.txt`, `sitemap.xml` (regenerated with `SITE_URL` = our domain)
   - `_headers`: same policies as upstream's generate-security-headers output,
     plus our worker origin added to `connect-src` (for the LibreOffice engine)
   - `assets/brand/{logo.svg,og.png,favicon.ico}` + regenerated favicon set in
     `images/` — own brand artwork (see brand/README if present)

5. `scripts/postprocess.mjs` — run after `vite build` (`PAPERRAIL_SRC`,
   `PAPERRAIL_DIST`, `PAPERRAIL_BRAND` override the defaults):
   - Strips stale pre-compressed `.br/.gz` duplicates after content rewrites
     (Cloudflare Pages re-compresses at the edge).
   - Batch-rewrites `https://www.bentopdf.com` → `https://paperrail.pages.dev`
     in built HTML/JSON/JS canonical/OG/JSON-LD strings, rewrites
     og:image/twitter:image to our artwork, and rewrites brand strings.
   - Splits oversized `libreoffice-wasm/*.gz` files into `.pN` parts (20 MB)
     suitable for the Pages per-file limit.
   - Generates the final `sitemap.xml` (tool pages, guides, about/privacy).

## License

BentoPDF © its respective authors — original code licensed AGPL-3.0-only.
This fork and all additions remain under AGPL-3.0-only (see LICENSE).
The AGPL processing engines (PyMuPDF, Ghostscript WASM, CoherentPDF,
LibreOffice WASM, Tesseract) are loaded from their respective distribution
URLs exactly as upstream configured them (`VITE_WASM_*` / engine paths);
their own AGPL notices apply to those components.

PaperRail is not affiliated with, and does not represent, the BentoPDF
upstream project; upstream and its commercial offering remain at
https://www.bentopdf.com.
