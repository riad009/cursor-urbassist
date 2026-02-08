/**
 * Fetch a PDF from a URL and extract text using pdf-parse.
 * Used for automatic PLU document analysis when pdfUrl is available.
 */

export async function fetchPdfText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(30000),
      headers: {
        "User-Agent": "UrbAssist/1.0 (Construction project assistance; compliance)",
      },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("pdf") && !url.toLowerCase().endsWith(".pdf")) {
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(buffer);
    const text = data?.text?.trim();
    return text && text.length > 100 ? text : null;
  } catch {
    return null;
  }
}
