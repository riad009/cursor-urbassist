/**
 * PDF Placeholder Detector — Identifies fake/redirect PLU PDFs
 *
 * Some municipalities upload placeholder PDFs to the GPU that contain only
 * a redirect message like "Visit our website to download PLUi documents".
 * These are technically valid PDFs but have no regulatory content.
 *
 * Uses pdf-lib (pure JS, no native deps) for text extraction to stay
 * consistent with the existing pdf-zone-extractor approach.
 */

import { PDFDocument } from "pdf-lib";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PlaceholderDetectionResult {
  isPlaceholder: boolean;
  suggestedUrl: string | null;
  reason: string | null;
}

// ── Detection Patterns ──────────────────────────────────────────────────────

/**
 * French-language patterns that indicate a redirect/placeholder PDF.
 * These phrases are characteristic of municipality placeholder documents.
 */
const REDIRECT_PATTERNS = [
  "veuillez vous rendre",          // "please go to"
  "rendez-vous sur",               // "go to"
  "pour télécharger",              // "to download"
  "pièces écrites",                // "written documents" (context: "download written documents")
  "page internet dédiée",          // "dedicated web page"
  "documents-du-plui",             // PLUi document portal URL fragment
  "documents-du-plu",              // PLU document portal URL fragment
  "consulter le document",         // "consult the document"
  "consulter les pièces",          // "consult the documents"
  "télécharger les pièces",        // "download the documents"
  "disponible sur le site",        // "available on the website"
  "disponible en ligne",           // "available online"
  "document non disponible",       // "document not available"
];

/**
 * Maximum size for a PDF to be considered potentially a placeholder.
 * Real PLU regulation PDFs are typically 1MB+ (often 10-200MB).
 * Placeholder PDFs are usually < 100KB.
 */
const PLACEHOLDER_MAX_SIZE_BYTES = 200 * 1024; // 200KB

/** Maximum page count for placeholder detection. Real PLU regs have 10+ pages. */
const PLACEHOLDER_MAX_PAGES = 3;

// ── Main Detection Function ─────────────────────────────────────────────────

/**
 * Detects whether a PDF buffer is a placeholder/redirect document.
 *
 * A PDF is considered a placeholder if:
 *   1. It has very few pages (≤ 3)
 *   2. Its text content matches known redirect patterns
 *
 * The size check is done by the caller to avoid loading large PDFs unnecessarily.
 */
export async function detectPlaceholderPdf(
  pdfBuffer: Buffer,
): Promise<PlaceholderDetectionResult> {
  const noResult: PlaceholderDetectionResult = {
    isPlaceholder: false,
    suggestedUrl: null,
    reason: null,
  };

  // Quick size pre-check — real regulation PDFs are much larger
  if (pdfBuffer.byteLength > PLACEHOLDER_MAX_SIZE_BYTES) {
    return noResult;
  }

  try {
    const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const pageCount = doc.getPageCount();

    // Real PLU regulations have many pages
    if (pageCount > PLACEHOLDER_MAX_PAGES) {
      return noResult;
    }

    // Extract text from all pages (it's a tiny document, so extracting all is fine)
    const allText = await extractAllText(doc);
    const textLower = allText.toLowerCase();

    // Check for redirect patterns
    const matchedPatterns = REDIRECT_PATTERNS.filter(p => textLower.includes(p));

    if (matchedPatterns.length === 0) {
      return noResult;
    }

    // Extract embedded URLs from the text
    const suggestedUrl = extractUrlFromText(allText);

    const reason = `PDF placeholder détecté (${pageCount} page${pageCount > 1 ? "s" : ""}, ${(pdfBuffer.byteLength / 1024).toFixed(0)}Ko). ` +
      `Motifs trouvés: ${matchedPatterns.slice(0, 3).map(p => `"${p}"`).join(", ")}`;

    console.log(`[pdf-placeholder-detector] ⚠ ${reason}${suggestedUrl ? `. URL extraite: ${suggestedUrl}` : ""}`);

    return {
      isPlaceholder: true,
      suggestedUrl,
      reason,
    };
  } catch (err) {
    console.warn(`[pdf-placeholder-detector] Detection failed:`, (err as Error).message);
    // If we can't parse it, assume it's not a placeholder (benefit of the doubt)
    return noResult;
  }
}

// ── Text Extraction ─────────────────────────────────────────────────────────

/**
 * Extracts text from all pages of a small PDF using pdf-lib.
 * Uses the same stream-parsing approach as pdf-zone-extractor.
 */
async function extractAllText(doc: PDFDocument): Promise<string> {
  const totalPages = doc.getPageCount();
  const textChunks: string[] = [];

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    try {
      const page = doc.getPage(pageIdx);
      const contents = page.node.Contents();
      if (!contents) continue;

      let streamText = "";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contentsAny = contents as any;
      const refs: unknown[] = typeof contentsAny.asArray === "function"
        ? contentsAny.asArray()
        : [contents];

      for (const ref of refs) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const refAny = ref as any;
          const streamObj = refAny?.constructor?.name === "PDFRef"
            ? doc.context.lookup(refAny)
            : refAny;

          if (streamObj && typeof (streamObj as { getContents?: () => Uint8Array }).getContents === "function") {
            const bytes = (streamObj as { getContents: () => Uint8Array }).getContents();
            const rawStr = new TextDecoder("latin1").decode(bytes);

            // Extract text from Tj operators
            const tjMatches = rawStr.matchAll(/\(([^)]*)\)\s*(?:Tj|'|")/g);
            for (const m of tjMatches) {
              streamText += decodeStreamText(m[1]) + " ";
            }

            // Extract text from TJ arrays
            const tjArrayMatches = rawStr.matchAll(/\[((?:\([^)]*\)|[^[\]])*)]\s*TJ/g);
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

      const cleaned = streamText.replace(/\s+/g, " ").trim();
      if (cleaned.length > 0) {
        textChunks.push(cleaned);
      }
    } catch { /* skip page errors */ }
  }

  return textChunks.join(" ");
}

/**
 * Decode PDF content stream text — handles basic PDF escape sequences.
 */
function decodeStreamText(raw: string): string {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\(\d{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

// ── URL Extraction ──────────────────────────────────────────────────────────

/**
 * Extracts the first HTTP(S) URL from text content.
 * Looks for municipality / government domains specifically.
 */
function extractUrlFromText(text: string): string | null {
  // Match HTTP(S) URLs — generous pattern to catch most formats
  const urlRegex = /https?:\/\/[^\s"'<>)\]]+/gi;
  const matches = text.match(urlRegex);

  if (!matches || matches.length === 0) return null;

  // Prefer URLs from government/municipality domains
  const govDomains = [".gouv.fr", ".metropole.", ".ville-", ".mairie-", ".communaute", ".agglo"];
  const govUrl = matches.find(u => govDomains.some(d => u.toLowerCase().includes(d)));

  // Clean trailing punctuation
  const cleanUrl = (url: string) => url.replace(/[.,;:!?)]+$/, "");

  return cleanUrl(govUrl || matches[0]);
}
