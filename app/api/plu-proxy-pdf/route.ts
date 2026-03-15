import { NextRequest, NextResponse } from "next/server";

/**
 * PLU PDF Proxy — Server-side download proxy for geoportail-urbanisme PDFs.
 *
 * PURPOSE:
 * The French Geoportail de l'Urbanisme (GPU) serves PDFs from servers that
 * sometimes reject client-side requests (CORS, TLS issues). This proxy:
 *   1. Downloads the PDF server-side using the same multi-strategy approach as analyze-plu
 *   2. Streams the PDF back to the browser for viewing/download
 *   3. Validates the response is actually a PDF (not HTML error page)
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

  try {
    // Use browser-like headers — GPU servers respond better to these
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/pdf,*/*",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      console.warn(`[plu-proxy-pdf] Upstream returned ${res.status} for ${url}`);
      return NextResponse.json(
        { error: `Le serveur GPU a retourné une erreur (HTTP ${res.status}). Le document n'est peut-être pas disponible.` },
        { status: 502 }
      );
    }

    const contentType = res.headers.get("content-type") || "";
    const arrayBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuf);

    // Validate it's actually a PDF
    const first4 = buf.slice(0, 4).toString();
    if (first4 !== "%PDF") {
      console.warn(`[plu-proxy-pdf] Upstream returned non-PDF content (${buf.byteLength} bytes, starts: "${first4}")`);
      return NextResponse.json(
        { error: "Le fichier téléchargé n'est pas un PDF valide. Il s'agit peut-être d'une page d'erreur du serveur GPU." },
        { status: 502 }
      );
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

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buf.byteLength),
        "Cache-Control": "public, max-age=86400", // Cache for 24h
      },
    });
  } catch (e) {
    console.error(`[plu-proxy-pdf] Download error:`, (e as Error).message);
    return NextResponse.json(
      { error: "Erreur lors du téléchargement du document. Veuillez réessayer." },
      { status: 500 }
    );
  }
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
