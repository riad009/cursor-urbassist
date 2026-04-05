import { NextRequest, NextResponse } from "next/server";
import { fetchThreeMapViews } from "@/lib/fetchStaticMap";

/**
 * GET /api/map-tiles
 *
 * Mode 1 — Individual tile proxy (for React-Leaflet TileLayer):
 *   ?layer=AERIAL|IGN|CADASTRE&z=16&x=123&y=456
 *   Returns raw image bytes with proper Content-Type.
 *
 * Mode 2 — Legacy bulk base64 fetch:
 *   ?lat=...&lng=...&zoom=...
 *   Returns JSON { views } with base64 strings.
 */

/** 1×1 transparent PNG — returned on upstream failure so Leaflet shows blank tiles */
function transparentPngResponse(): NextResponse {
    // Minimal valid PNG: 1×1 pixel, fully transparent
    const PNG_1x1 = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
        0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, // IDAT chunk
        0x54, 0x78, 0x9c, 0x62, 0x00, 0x00, 0x00, 0x02,
        0x00, 0x01, 0xe5, 0x27, 0xde, 0xfc, 0x00, 0x00, // IEND chunk
        0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
        0x60, 0x82,
    ]);
    return new NextResponse(PNG_1x1, {
        status: 200,
        headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=60",
            "Access-Control-Allow-Origin": "*",
        },
    });
}

const TILE_LAYERS: Record<string, { url: string; contentType: string }> = {
    AERIAL: {
        url: "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fjpeg",
        contentType: "image/jpeg",
    },
    IGN: {
        url: "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fpng",
        contentType: "image/png",
    },
    CADASTRE: {
        url: "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fpng",
        contentType: "image/png",
    },
};

export async function GET(request: NextRequest) {
    const sp = request.nextUrl.searchParams;

    // ── Mode 1: Individual tile proxy for Leaflet ──────────────────────
    const layer = sp.get("layer");
    if (layer) {
        const z = sp.get("z");
        const x = sp.get("x");
        const y = sp.get("y");

        if (!z || !x || !y) {
            return NextResponse.json({ error: "z, x, y required" }, { status: 400 });
        }

        const config = TILE_LAYERS[layer.toUpperCase()];
        if (!config) {
            return NextResponse.json(
                { error: `Unknown layer: ${layer}. Use AERIAL, IGN, or CADASTRE.` },
                { status: 400 }
            );
        }

        const upstreamUrl = config.url
            .replace("{z}", z)
            .replace("{y}", y)
            .replace("{x}", x);

        try {
            const res = await fetch(upstreamUrl, {
                signal: AbortSignal.timeout(8_000),
                headers: {
                    Accept: "image/png,image/jpeg,image/*",
                    "User-Agent": "UrbAssist/1.0 (urbassist.com)",
                    Referer: "https://urbassist.com",
                },
            });

            if (!res.ok) {
                console.error("[map-tiles] upstream error:", upstreamUrl, res.status);
                return transparentPngResponse();
            }

            const buf = await res.arrayBuffer();
            return new NextResponse(buf, {
                headers: {
                    "Content-Type": config.contentType,
                    "Cache-Control": "public, max-age=86400, s-maxage=86400",
                    "Access-Control-Allow-Origin": "*",
                },
            });
        } catch (err) {
            console.error("[map-tiles] fetch error:", upstreamUrl, err);
            return transparentPngResponse();
        }
    }

    // ── Mode 2: Legacy bulk base64 fetch ───────────────────────────────
    const lat = parseFloat(sp.get("lat") || "");
    const lng = parseFloat(sp.get("lng") || "");
    const zoom = parseInt(sp.get("zoom") || "16", 10);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
    }

    try {
        const views = await fetchThreeMapViews(lat, lng, zoom);
        return NextResponse.json({ views });
    } catch (error) {
        console.error("Map tiles fetch error:", error);
        return NextResponse.json({ error: "Failed to fetch map tiles" }, { status: 500 });
    }
}
