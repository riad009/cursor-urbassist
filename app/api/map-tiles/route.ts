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

        const tileUrl = config.url
            .replace("{z}", z)
            .replace("{y}", y)
            .replace("{x}", x);

        try {
            const res = await fetch(tileUrl, {
                signal: AbortSignal.timeout(5_000),
                headers: { Accept: "image/png,image/jpeg,image/*" },
            });

            if (!res.ok) {
                console.error(`[map-tiles] Upstream ${res.status} for ${tileUrl}`);
                return new NextResponse(null, { status: res.status });
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
            console.error(`[map-tiles] Fetch failed for ${tileUrl}:`, err);
            return new NextResponse(null, { status: 502 });
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
