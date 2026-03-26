import { NextRequest, NextResponse } from "next/server";
import { detectPlaceholderPdf } from "@/lib/pdf-placeholder-detector";

/**
 * PLU PDF Proxy — Server-side download proxy for geoportail-urbanisme PDFs.
 *
 * PURPOSE:
 * The French Geoportail de l'Urbanisme (GPU) serves PDFs from servers that
 * sometimes reject client-side requests (CORS, TLS issues). This proxy:
 *   1. Downloads the PDF server-side using the same multi-strategy approach as analyze-plu
 *   2. Streams the PDF back to the browser for viewing/download
 *   3. Validates the response is actually a PDF (not HTML error page)
 *   4. Detects placeholder/redirect PDFs that contain no actual regulation
 *
 * USAGE:
 *   GET /api/plu-proxy-pdf?url=<encoded-gpu-url>
 *   Returns: application/pdf with Content-Disposition attachment header
 */

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url?.trim()) {
    return NextResponse.json({ error: "Missing 'url' parameter" }, { status: 400 });
  }

  // Validate it's a geoportail or geopf URL to prevent open proxy abuse
  const allowed = [
    "geoportail-urbanisme.gouv.fr",
    "data.geopf.fr",
    "wxs.ign.fr",
  ];
  try {
    const parsed = new URL(url);
    if (!allowed.some(d => parsed.hostname.endsWith(d))) {
      return NextResponse.json({ error: "URL domain not allowed" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Browser-like headers — GPU servers respond better to these
  const browserHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/pdf,*/*",
  };

  // ── Step 1: Quick HEAD check to verify the URL is reachable ──
  try {
    const headRes = await fetch(url, {
      method: "HEAD",
      headers: browserHeaders,
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!headRes.ok) {
      console.warn(`[plu-proxy-pdf] HEAD returned ${headRes.status} for ${url}`);
      return NextResponse.json(
        { error: `Le serveur GPU a retourné une erreur (HTTP ${headRes.status}). Le document n'est peut-être pas disponible.` },
        { status: 502 }
      );
    }
  } catch (headErr) {
    // Some GPU servers reject HEAD → fall through to GET
    console.warn(`[plu-proxy-pdf] HEAD failed (${(headErr as Error).message}), falling through to GET`);
  }

  // ── Step 2: Full GET download ──
  let res: Response;
  try {
    res = await fetch(url, {
      headers: browserHeaders,
      redirect: "follow",
      signal: AbortSignal.timeout(120_000),
    });
  } catch (fetchErr) {
    const msg = (fetchErr as Error).message;
    console.error(`[plu-proxy-pdf] Fetch failed: ${msg}`);
    const isTimeout = msg.includes("abort") || msg.includes("timeout");
    return NextResponse.json(
      { error: isTimeout
          ? "Le serveur GPU n'a pas répondu dans le délai imparti (timeout). Veuillez réessayer ou importer le document manuellement."
          : `Erreur réseau lors du téléchargement (${msg}). Veuillez réessayer.`
      },
      { status: 502 }
    );
  }

  if (!res.ok) {
    console.warn(`[plu-proxy-pdf] Upstream returned ${res.status} for ${url}`);
    return NextResponse.json(
      { error: `Le serveur GPU a retourné une erreur (HTTP ${res.status}). Le document n'est peut-être pas disponible.` },
      { status: 502 }
    );
  }

  // ── Step 3: Download body safely ──
  let buf: Buffer;
  try {
    const arrayBuf = await res.arrayBuffer();
    buf = Buffer.from(arrayBuf);
  } catch (dlErr) {
    console.error(`[plu-proxy-pdf] Body download failed: ${(dlErr as Error).message}`);
    return NextResponse.json(
      { error: "Le téléchargement du document a échoué en cours de route. Veuillez réessayer." },
      { status: 502 }
    );
  }

  // Validate it's actually a PDF
  const first4 = buf.slice(0, 4).toString();
  if (first4 !== "%PDF") {
    console.warn(`[plu-proxy-pdf] Upstream returned non-PDF content (${buf.byteLength} bytes, starts: "${first4}")`);
    return NextResponse.json(
      { error: "Le fichier téléchargé n'est pas un PDF valide. Il s'agit peut-être d'une page d'erreur du serveur GPU." },
      { status: 502 }
    );
  }

  // Detect placeholder/redirect PDFs (small PDFs that just say "visit our website")
  try {
    const placeholderCheck = await detectPlaceholderPdf(buf);
    if (placeholderCheck.isPlaceholder) {
      console.warn(`[plu-proxy-pdf] ⚠ Placeholder PDF detected: ${placeholderCheck.reason}`);
      return NextResponse.json(
        {
          error: "Ce fichier est un document d'orientation (placeholder) et non le règlement PLU complet. " +
            (placeholderCheck.suggestedUrl
              ? `Les documents sont disponibles sur : ${placeholderCheck.suggestedUrl}`
              : "Veuillez télécharger le règlement directement depuis le site de votre collectivité."),
          isPlaceholder: true,
          suggestedUrl: placeholderCheck.suggestedUrl,
        },
        { status: 502 }
      );
    }
  } catch (placeholderErr) {
    // Non-fatal: if placeholder detection crashes, still serve the PDF
    console.warn(`[plu-proxy-pdf] Placeholder detection failed (non-fatal): ${(placeholderErr as Error).message}`);
  }

  // Extract filename from URL
  let filename = "reglement_plu.pdf";
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split("/").pop();
    if (last && last.length > 3 && last.toLowerCase().endsWith(".pdf")) {
      filename = decodeURIComponent(last);
    }
  } catch { /* use default */ }

  console.log(`[plu-proxy-pdf] ✓ Proxied ${buf.byteLength} bytes (${filename})`);

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buf.byteLength),
      "Cache-Control": "public, max-age=86400", // Cache for 24h
    },
  });
}

/** HEAD support for fast URL validation without downloading the full PDF */
export async function HEAD(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url?.trim()) {
    return new NextResponse(null, { status: 400 });
  }

  const allowed = ["geoportail-urbanisme.gouv.fr", "data.geopf.fr", "wxs.ign.fr"];
  try {
    const parsed = new URL(url);
    if (!allowed.some(d => parsed.hostname.endsWith(d))) {
      return new NextResponse(null, { status: 403 });
    }
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/pdf,*/*",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return new NextResponse(null, { status: 502 });
    }

    return new NextResponse(null, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("content-type") || "application/pdf",
        "Content-Length": res.headers.get("content-length") || "0",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
