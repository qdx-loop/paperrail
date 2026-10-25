# PaperRail — Notices & Modifications

PaperRail (https://paperrail.pages.dev) is a redeployment of the open-source
project **BentoPDF** (v2.8.10) by alam00000 — https://github.com/alam00000/bentopdf
— dual-licensed under AGPL-3.0-only and a commercial option. This fork is
published under **AGPL-3.0-only** in accordance with that license.

## Modifications made in this fork

1. `src/js/utils/libreoffice-loader.ts`
   - Default engine root changed from `BASE_URL + libreoffice-wasm/` to a
     cross-origin worker URL (`https://paperrail-libs.qdx19qdx-324.workers.dev/libreoffice-wasm/`),
     because Cloudflare Pages enforces a 25MiB per-file static limit and the
     LibreOffice WASM engine (soffice.wasm.gz ≈ 47 MB) cannot be uploaded as a
     single static file. *(Note: at deploy time of this build, the engine files
     are additionally served as `.p0`, `.p1`, … split archives within the same
     Pages root; `fetchAsDecompressedUrl` transparently fetches, concatenates
     and gunzips the parts client-side.)*
   - `fetchAsDecompressedUrl` now prefers part URLs (`<file>.p0`, `.p1`, …),
     concatenates them into one Blob, and applies the existing gzip
     DecompressionStream path.
   - `initialize()` now also fetches `soffice.js`, `soffice.worker.js` and
     `browser.worker.global.js` with CORS and mints blob: URLs for them, so the
     strict Content-Security-Policy (`worker-src 'self' blob:`) of the static
     deployment is honoured.

2. `vite.config.ts` — NOT modified; branding is applied entirely through
   build-time environment variables provided by the project:
   `SIMPLE_MODE=true`, `SITE_URL=https://paperrail.pages.dev`,
   `VITE_BRAND_NAME=PaperRail`, `VITE_BRAND_LOGO=assets/brand/logo.svg`,
   `VITE_FOOTER_TEXT=…`, `VITE_USE_CDN=true`.

3. `brand/pages/` — new static pages deployed alongside the app:
   - `about.html`, `privacy.html` (privacy policy, analytics description)
   - `guides/compress-pdf-to-100kb.html`, `guides/heic-to-pdf.html`,
     `guides/merge-pdf-no-upload.html` — SEO/how-to landing content
   - `robots.txt`, `sitemap.xml` (regenerated with `SITE_URL` = our domain)
   - `_headers`: same policies as upstream's generate-security-headers output,
     plus our worker origin added to `connect-src` (for the LibreOffice engine)
   - `assets/brand/{logo.svg,og.png,favicon.ico}` + regenerated favicon set in
     `images/` — own brand artwork (see brand/README if present)

4. `scripts/postprocess.mjs` (in this fork's tooling, also at
   `/tmp/opencode/postprocess.mjs`)
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
