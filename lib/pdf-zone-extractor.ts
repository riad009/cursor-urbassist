/**
 * PDF Zone Extractor — Smart PLU document splitter
 *
 * French PLU regulation PDFs can be 100MB+ / 400+ pages covering ALL zones
 * in a municipality. This utility extracts a SUBSET of pages that fits
 * within Gemini's inline limit (~15MB / ~50 pages).
 *
 * STRATEGY:
 *   Uses ONLY pdf-lib (pure JS, no native deps, no canvas/DOMMatrix).
 *   Does NOT use pdf-parse (v2 requires DOMMatrix which crashes in Node.js).
 *
 *   1. Load PDF with pdf-lib to get page count
 *   2. Select pages using positional strategy:
 *      - First 5 pages (cover + TOC + general provisions)
 *      - Evenly spaced pages throughout the document
 *      - Cap at 50 pages or 15MB
 *   3. Build a new slim PDF with selected pages
 */

import { PDFDocument } from "pdf-lib";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ZoneExtractionResult {
  buffer: Buffer;
  extractedPageCount: number;
  totalPageCount: number;
  extractedPages: number[];
  zoneFound: boolean;
  summary: string;
}

export interface TextExtractionResult {
  text: string;
  pageCount: number;
  totalPageCount: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Max pages to extract — keeps PDF under ~15MB for most documents */
const MAX_EXTRACT_PAGES = 50;

/** Maximum output PDF size (Gemini inline limit ~20MB base64 ≈ 15MB raw) */
const MAX_EXTRACTED_PDF_BYTES = 14 * 1024 * 1024;

// ── Main Extraction Function ─────────────────────────────────────────────────

/**
 * Extracts a representative subset of pages from a large PLU PDF.
 *
 * For a 426-page PLU document, this typically produces a 30-50 page extract
 * that covers the general provisions and zone-specific sections.
 */
export async function extractZonePages(
  pdfBuffer: Buffer,
  zone: string,
): Promise<ZoneExtractionResult> {
  const startTime = Date.now();
  const sizeMB = (pdfBuffer.byteLength / 1024 / 1024).toFixed(1);

  // Step 1: Load PDF with pdf-lib
  console.log(`[pdf-zone-extractor] Loading ${sizeMB}MB PDF...`);
  let srcDoc: PDFDocument;
  try {
    srcDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  } catch (err) {
    console.error(`[pdf-zone-extractor] Failed to load PDF:`, (err as Error).message);
    return {
      buffer: pdfBuffer, extractedPageCount: 0, totalPageCount: 0,
      extractedPages: [], zoneFound: false,
      summary: `Failed to load PDF: ${(err as Error).message}`,
    };
  }

  const totalPages = srcDoc.getPageCount();
  console.log(`[pdf-zone-extractor] PDF has ${totalPages} pages, zone: "${zone}"`);

  if (totalPages <= MAX_EXTRACT_PAGES) {
    // Small enough — no splitting needed
    console.log(`[pdf-zone-extractor] ✓ Only ${totalPages} pages — no splitting needed`);
    return {
      buffer: pdfBuffer, extractedPageCount: totalPages, totalPageCount: totalPages,
      extractedPages: Array.from({ length: totalPages }, (_, i) => i),
      zoneFound: true, summary: `PDF has only ${totalPages} pages — sent as-is`,
    };
  }

  // Step 2: Select pages using positional strategy
  // PLU documents follow a standard structure:
  //   - Pages 1-10: Cover, TOC, general provisions (apply to ALL zones)
  //   - Pages 10-end: Zone-specific rules (roughly alphabetical: A, AU, N, U, UA, UB...)
  //   - Zone A is typically in the first 30-40% of the document
  //   - Zone U/UA/UB etc. tend to be in the latter half
  const selectedPages = selectPagesForZone(totalPages, zone);

  console.log(`[pdf-zone-extractor] Selected ${selectedPages.length} pages: [${selectedPages.slice(0, 20).map(p => p + 1).join(", ")}${selectedPages.length > 20 ? "..." : ""}]`);

  // Step 3: Extract selected pages into a new PDF
  try {
    let newBuffer = await buildSubPdf(srcDoc, selectedPages);

    // Step 4: If still too large, reduce progressively
    if (newBuffer.byteLength > MAX_EXTRACTED_PDF_BYTES) {
      console.log(`[pdf-zone-extractor] ⚠ Extract is ${(newBuffer.byteLength / 1024 / 1024).toFixed(1)}MB — reducing pages`);
      // Cut to half the pages
      const reduced = selectedPages.filter((_, i) => i < 5 || i % 2 === 0);
      newBuffer = await buildSubPdf(srcDoc, reduced);

      if (newBuffer.byteLength > MAX_EXTRACTED_PDF_BYTES) {
        // Still too large — cut more aggressively
        const minimal = reduced.filter((_, i) => i < 5 || i % 2 === 0);
        newBuffer = await buildSubPdf(srcDoc, minimal);

        const summary = `Split ${sizeMB}MB (${totalPages}p) → ${(newBuffer.byteLength / 1024 / 1024).toFixed(1)}MB (${minimal.length}p) for zone "${zone}" in ${Date.now() - startTime}ms (minimal)`;
        console.log(`[pdf-zone-extractor] ✓ ${summary}`);
        return {
          buffer: newBuffer, extractedPageCount: minimal.length, totalPageCount: totalPages,
          extractedPages: minimal, zoneFound: true, summary,
        };
      }

      const summary = `Split ${sizeMB}MB (${totalPages}p) → ${(newBuffer.byteLength / 1024 / 1024).toFixed(1)}MB (${reduced.length}p) for zone "${zone}" in ${Date.now() - startTime}ms (reduced)`;
      console.log(`[pdf-zone-extractor] ✓ ${summary}`);
      return {
        buffer: newBuffer, extractedPageCount: reduced.length, totalPageCount: totalPages,
        extractedPages: reduced, zoneFound: true, summary,
      };
    }

    const summary = `Split ${sizeMB}MB (${totalPages}p) → ${(newBuffer.byteLength / 1024 / 1024).toFixed(1)}MB (${selectedPages.length}p) for zone "${zone}" in ${Date.now() - startTime}ms`;
    console.log(`[pdf-zone-extractor] ✓ ${summary}`);
    return {
      buffer: newBuffer, extractedPageCount: selectedPages.length, totalPageCount: totalPages,
      extractedPages: selectedPages, zoneFound: true, summary,
    };
  } catch (err) {
    console.error(`[pdf-zone-extractor] ✗ Page extraction failed:`, (err as Error).message);
    return {
      buffer: pdfBuffer, extractedPageCount: 0, totalPageCount: totalPages,
      extractedPages: [], zoneFound: false,
      summary: `Page extraction failed: ${(err as Error).message}`,
    };
  }
}

// ── Page Selection Strategy ──────────────────────────────────────────────────

/**
 * Selects which pages to extract based on the zone code and document structure.
 *
 * French PLU documents follow a predictable structure. Zone codes indicate
 * position: A (agricultural) is early, U (urban) zones are later.
 */
function selectPagesForZone(totalPages: number, zone: string): number[] {
  const z = zone.toUpperCase().trim();
  const pageSet = new Set<number>();

  // Always include first 8 pages (cover, TOC, general dispositions)
  for (let i = 0; i < Math.min(8, totalPages); i++) {
    pageSet.add(i);
  }

  // Estimate where zone-specific rules are in the document
  // Standard PLU order: Dispositions Générales → Zone A → Zone AU → Zone N → Zone U (with sub-zones)
  let startRatio = 0.1; // Default: start at 10% into document
  let endRatio = 0.5;   // Default: cover up to 50%

  if (z.startsWith("A") && !z.startsWith("AU")) {
    // Zone A (agricole) — typically in first 20-40%
    startRatio = 0.08;
    endRatio = 0.40;
  } else if (z.startsWith("AU")) {
    // Zone AU (à urbaniser) — typically 25-50%
    startRatio = 0.20;
    endRatio = 0.50;
  } else if (z.startsWith("N")) {
    // Zone N (naturelle) — typically 40-65%
    startRatio = 0.35;
    endRatio = 0.65;
  } else if (z.startsWith("U")) {
    // Zone U (urbaine, UA, UB, UC, UD, UE...) — typically 50-90%
    startRatio = 0.45;
    endRatio = 0.90;
  }

  const startPage = Math.floor(totalPages * startRatio);
  const endPage = Math.min(Math.ceil(totalPages * endRatio), totalPages - 1);
  const rangeLength = endPage - startPage;

  // Select pages from the estimated zone section
  const budgetForZone = MAX_EXTRACT_PAGES - pageSet.size - 5; // Reserve 5 for end pages
  const step = Math.max(1, Math.floor(rangeLength / budgetForZone));

  for (let p = startPage; p <= endPage && pageSet.size < MAX_EXTRACT_PAGES - 5; p += step) {
    pageSet.add(p);
  }

  // Include last few pages (sometimes contain annexes, parking rules)
  for (let i = Math.max(0, totalPages - 5); i < totalPages; i++) {
    pageSet.add(i);
  }

  return Array.from(pageSet).sort((a, b) => a - b);
}

// ── PDF Builder ──────────────────────────────────────────────────────────────

async function buildSubPdf(srcDoc: PDFDocument, pages: number[]): Promise<Buffer> {
  const newDoc = await PDFDocument.create();
  const copiedPages = await newDoc.copyPages(srcDoc, pages);
  for (const page of copiedPages) {
    newDoc.addPage(page);
  }
  return Buffer.from(await newDoc.save());
}

// ── Text Extraction Fallback ─────────────────────────────────────────────────

/**
 * Text extraction fallback — extracts raw text content from PDF pages
 * using pdf-lib's content stream parsing.
 *
 * pdf-parse v2 requires DOMMatrix which crashes in Node.js server runtime,
 * so we use pdf-lib directly to read page content streams and extract
 * human-readable text via regex.
 *
 * This produces ROUGH text (not perfect formatting) but is good enough
 * for Gemini to analyze regulatory content.
 */
export async function extractZoneText(
  pdfBuffer: Buffer,
  zone: string,
): Promise<TextExtractionResult> {
  const startTime = Date.now();
  try {
    const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const totalPages = doc.getPageCount();
    const zoneUpper = zone.toUpperCase().trim();

    // Select pages to extract text from (same strategy as zone splitting)
    const pagesToExtract = totalPages <= 80
      ? Array.from({ length: totalPages }, (_, i) => i)
      : selectPagesForZone(totalPages, zone);

    const textChunks: string[] = [];
    let extractedPageCount = 0;
    const MAX_TEXT_LENGTH = 120_000; // ~120K chars to stay within Gemini prompt limits

    for (const pageIdx of pagesToExtract) {
      if (pageIdx >= totalPages) continue;
      try {
        const page = doc.getPage(pageIdx);
        // Get raw content stream bytes
        const contents = page.node.Contents();
        if (!contents) continue;

        let streamText = "";

        // Handle single stream or array of streams
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const contentsAny = contents as any;
        const refs: unknown[] = typeof contentsAny.asArray === 'function'
          ? contentsAny.asArray()
          : [contents];

        for (const ref of refs) {
          try {
            // Dereference PDFRef to get the actual stream object
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const refAny = ref as any;
            const streamObj = refAny?.constructor?.name === 'PDFRef'
              ? doc.context.lookup(refAny)
              : refAny;

            if (streamObj && typeof (streamObj as { getContents?: () => Uint8Array }).getContents === 'function') {
              const bytes = (streamObj as { getContents: () => Uint8Array }).getContents();
              const rawStr = new TextDecoder('latin1').decode(bytes);

              // Extract text from PDF content stream operators:
              // Tj = show text string, TJ = show text with kerning, ' = move to next line and show text
              // BT...ET blocks contain text operations

              // Match text inside parentheses after Tj, ', " operators and inside TJ arrays
              const tjMatches = rawStr.matchAll(/\(([^)]*)\)\s*(?:Tj|'|")/g);
              for (const m of tjMatches) {
                streamText += decodeStreamText(m[1]) + " ";
              }

              // Match TJ arrays: [(text) kern (text) kern ...]
              const tjArrayMatches = rawStr.matchAll(/\[((?:\([^)]*\)|[^[\]])*)\]\s*TJ/g);
              for (const m of tjArrayMatches) {
                const innerMatches = m[1].matchAll(/\(([^)]*)\)/g);
                for (const inner of innerMatches) {
                  streamText += decodeStreamText(inner[1]);
                }
                streamText += " ";
              }
            }
          } catch { /* skip individual stream errors */ }
        }

        const cleaned = streamText
          .replace(/\s+/g, ' ')
          .trim();

        if (cleaned.length > 10) {
          textChunks.push(`--- Page ${pageIdx + 1} ---\n${cleaned}`);
          extractedPageCount++;
        }

        // Check total length
        const totalLen = textChunks.reduce((s, c) => s + c.length, 0);
        if (totalLen >= MAX_TEXT_LENGTH) break;
      } catch {
        // Skip pages that fail to extract
        continue;
      }
    }

    const fullText = textChunks.join("\n\n");

    // If zone-specific content exists, try to prioritize it
    if (zoneUpper && fullText.length > 0) {
      // Check if zone name appears in extracted text
      const zoneAppears = fullText.toUpperCase().includes(zoneUpper);
      if (zoneAppears) {
        console.log(`[pdf-zone-extractor] ✓ Zone "${zone}" found in extracted text`);
      } else {
        console.log(`[pdf-zone-extractor] ⚠ Zone "${zone}" NOT found in extracted text — sending all extracted text`);
      }
    }

    console.log(`[pdf-zone-extractor] Text extraction: ${extractedPageCount}/${pagesToExtract.length} pages, ${fullText.length} chars in ${Date.now() - startTime}ms`);
    return {
      text: fullText,
      pageCount: extractedPageCount,
      totalPageCount: totalPages,
    };
  } catch (err) {
    console.error(`[pdf-zone-extractor] Text extraction failed:`, (err as Error).message);
    return { text: "", pageCount: 0, totalPageCount: 0 };
  }
}

/**
 * Decode PDF content stream text — handles basic PDF escape sequences.
 * PDF uses octal escapes (\nnn), named escapes (\n, \r, \t), and hex.
 */
function decodeStreamText(raw: string): string {
  return raw
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

