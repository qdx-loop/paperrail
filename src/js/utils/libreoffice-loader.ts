/**
 * LibreOffice WASM Converter Wrapper
 *
 * Uses @matbee/libreoffice-converter package for document conversion.
 * Handles progress tracking and provides simpler API.
 */

import { WorkerBrowserConverter } from '@matbee/libreoffice-converter/browser';
import type { InputFormat } from '@matbee/libreoffice-converter/browser';

const LIBREOFFICE_LOCAL_PATH = import.meta.env.BASE_URL + 'libreoffice-wasm/';

// PaperRail change: LibreOffice WASM (47MB+) cannot be served by Cloudflare Pages'
// 25MB per-file static limit, so the five engine files live in an R2 bucket fronted
// by paperrail-libs.qdx19qdx-324.workers.dev (CORS enabled, immutable cache).
const LIBREOFFICE_CDN_PATH =
  'https://paperrail-libs.qdx19qdx-324.workers.dev/libreoffice-wasm/';

export interface LoadProgress {
  phase: 'loading' | 'initializing' | 'converting' | 'complete' | 'ready';
  percent: number;
  message: string;
}

export type ProgressCallback = (progress: LoadProgress) => void;

// Singleton for converter instance
let converterInstance: LibreOfficeConverter | null = null;

const GZIP_MAGIC_FIRST = 0x1f;
const GZIP_MAGIC_SECOND = 0x8b;

async function fetchAsDecompressedUrl(
  url: string,
  mimeType: string
): Promise<string> {
  // PaperRail change: files larger than Cloudflare Pages' 25MB per-file limit
  // are uploaded as binary parts (${url}.p0, .p1, ...) and stitched here.
  let response: Response | null = null;
  try {
    const first = await fetch(`${url}.p0`);
    if (first.ok) {
      const chunks: ArrayBuffer[] = [await first.arrayBuffer()];
      for (let i = 1; ; i++) {
        const next = await fetch(`${url}.p${i}`);
        if (!next.ok) break;
        chunks.push(await next.arrayBuffer());
      }
      const total = chunks.reduce((n, c) => n + c.byteLength, 0);
      const merged = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) {
        merged.set(new Uint8Array(c), off);
        off += c.byteLength;
      }
      const mergedBlob = new Blob([merged.buffer as ArrayBuffer], {
        type: mimeType,
      });
      return await maybeDecompress(mergedBlob, mimeType);
    }
  } catch (err) {
    console.warn('[LibreOffice] part fetch failed, trying whole file', url, err);
  }

  response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }
  return await maybeDecompress(await response.blob(), mimeType);
}

async function maybeDecompress(blob: Blob, mimeType: string): Promise<string> {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (head[0] === GZIP_MAGIC_FIRST && head[1] === GZIP_MAGIC_SECOND) {
    const decompressed = blob
      .stream()
      .pipeThrough(new DecompressionStream('gzip'));
    blob = await new Response(decompressed).blob();
  }

  return URL.createObjectURL(new Blob([blob], { type: mimeType }));
}

export class LibreOfficeConverter {
  private converter: WorkerBrowserConverter | null = null;
  private initialized = false;
  private initializing = false;
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || LIBREOFFICE_CDN_PATH;
  }

  async initialize(onProgress?: ProgressCallback): Promise<void> {
    if (this.initialized) return;

    if (this.initializing) {
      while (this.initializing) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return;
    }

    this.initializing = true;
    let progressCallback = onProgress; // Store original callback

    try {
      progressCallback?.({
        phase: 'loading',
        percent: 0,
        message: 'Loading conversion engine...',
      });

      const [sofficeWasmUrl, sofficeDataUrl] = await Promise.all([
        fetchAsDecompressedUrl(
          `${this.basePath}soffice.wasm.gz`,
          'application/wasm'
        ),
        fetchAsDecompressedUrl(
          `${this.basePath}soffice.data.gz`,
          'application/octet-stream'
        ),
      ]);

      // PaperRail change: the CSP on the Pages deployment only allows blob:
      // scripts (worker-src 'self' blob:), and Workers break on cross-origin
      // URLs. Fetch the glue/worker scripts with CORS and mint blob URLs.
      const pageOrigin =
        typeof self !== 'undefined' ? self.location.origin : '';
      const blobifyScript = async (url: string): Promise<string> => {
        if (pageOrigin && url.startsWith(pageOrigin)) return url;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
        const text = await res.text();
        return URL.createObjectURL(
          new Blob([text], { type: 'text/javascript' })
        );
      };

      let sofficeJsUrl = `${this.basePath}soffice.js`;
      try {
        sofficeJsUrl = await blobifyScript(sofficeJsUrl);
      } catch (err) {
        console.warn('[LibreOffice] glue blob fetch failed, using direct URL', err);
      }

      let sofficeWorkerUrl = `${this.basePath}soffice.worker.js`;
      let browserWorkerUrl = `${this.basePath}browser.worker.global.js`;
      try {
        [sofficeWorkerUrl, browserWorkerUrl] = await Promise.all([
          blobifyScript(sofficeWorkerUrl),
          blobifyScript(browserWorkerUrl),
        ]);
      } catch (err) {
        console.warn('[LibreOffice] worker blob fetch failed, using direct URLs', err);
      }

      this.converter = new WorkerBrowserConverter({
        sofficeJs: sofficeJsUrl,
        sofficeWasm: sofficeWasmUrl,
        sofficeData: sofficeDataUrl,
        sofficeWorkerJs: sofficeWorkerUrl,
        browserWorkerJs: browserWorkerUrl,
        verbose: false,
        onProgress: (info: {
          phase: string;
          percent: number;
          message: string;
        }) => {
          if (progressCallback && !this.initialized) {
            const simplifiedMessage = `Loading conversion engine (${Math.round(info.percent)}%)...`;
            progressCallback({
              phase: info.phase as LoadProgress['phase'],
              percent: info.percent,
              message: simplifiedMessage,
            });
          }
        },
        onReady: () => {
          console.log('[LibreOffice] Ready!');
        },
        onError: (error: Error) => {
          console.error('[LibreOffice] Error:', error);
        },
      });

      await this.converter.initialize();
      this.initialized = true;

      // Call completion message
      progressCallback?.({
        phase: 'ready',
        percent: 100,
        message: 'Conversion engine ready!',
      });

      // Null out the callback to prevent any late-firing progress updates
      progressCallback = undefined;
    } finally {
      this.initializing = false;
    }
  }

  isReady(): boolean {
    return this.initialized && this.converter !== null;
  }

  async convertToPdf(file: File): Promise<Blob> {
    if (!this.converter) {
      throw new Error('Converter not initialized');
    }

    console.log(`[LibreOffice] Converting ${file.name} to PDF...`);
    console.log(
      `[LibreOffice] File type: ${file.type}, Size: ${file.size} bytes`
    );

    try {
      console.log(`[LibreOffice] Reading file as ArrayBuffer...`);
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      console.log(`[LibreOffice] File loaded, ${uint8Array.length} bytes`);

      console.log(`[LibreOffice] Calling converter.convert() with buffer...`);
      const startTime = Date.now();

      // Detect input format - critical for CSV to apply import filters
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      console.log(`[LibreOffice] Detected format from extension: ${ext}`);

      const result = await this.converter.convert(
        uint8Array,
        {
          outputFormat: 'pdf',
          inputFormat: ext as InputFormat,
        },
        file.name
      );

      const duration = Date.now() - startTime;
      console.log(
        `[LibreOffice] Conversion complete! Duration: ${duration}ms, Size: ${result.data.length} bytes`
      );

      // Create a copy to avoid SharedArrayBuffer type issues
      const data = new Uint8Array(result.data);
      return new Blob([data], { type: result.mimeType });
    } catch (error) {
      console.error(`[LibreOffice] Conversion FAILED for ${file.name}:`, error);
      console.error(`[LibreOffice] Error details:`, {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  async wordToPdf(file: File): Promise<Blob> {
    return this.convertToPdf(file);
  }

  async pptToPdf(file: File): Promise<Blob> {
    return this.convertToPdf(file);
  }

  async excelToPdf(file: File): Promise<Blob> {
    return this.convertToPdf(file);
  }

  async destroy(): Promise<void> {
    if (this.converter) {
      await this.converter.destroy();
    }
    this.converter = null;
    this.initialized = false;
  }
}

export function getLibreOfficeConverter(
  basePath?: string
): LibreOfficeConverter {
  if (!converterInstance) {
    converterInstance = new LibreOfficeConverter(basePath);
  }
  return converterInstance;
}
