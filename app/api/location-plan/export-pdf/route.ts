import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

/**
 * POST /api/location-plan/export-pdf
 *
 * Server-side tile composition for PC1 PDF export.
 * Fetches WMTS tiles from data.geopf.fr, stitches them with sharp,
 * draws the parcel polygon, returns a base64 JPEG image.
 *
 * Body: { lat, lng, zoom?, layer, parcelGeoJson? }
 * Returns: { image: "data:image/jpeg;base64,..." }
 */

const TILE_LAYERS: Record<string, { url: string; format: "jpeg" | "png" }> = {
    AERIAL: {
        url: "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fjpeg",
        format: "jpeg",
    },
    IGN: {
        url: "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fpng",
        format: "png",
    },
    CADASTRE: {
        url: "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fpng",
        format: "png",
    },
};

// ─── Tile math ──────────────────────────────────────────────────────────────

function lngToGlobalPx(lng: number, zoom: number): number {
    return ((lng + 180) / 360) * Math.pow(2, zoom) * 256;
}

function latToGlobalPx(lat: number, zoom: number): number {
    const latRad = (lat * Math.PI) / 180;
    return (
        ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
        Math.pow(2, zoom) *
        256
    );
}

// ─── Route handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { lat, lng, layer, parcelGeoJson } = body;
        const zoom = body.zoom ?? 14;

        if (typeof lat !== "number" || typeof lng !== "number") {
            return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
        }

        const layerKey = (layer || "AERIAL").toUpperCase();
        const config = TILE_LAYERS[layerKey];
        if (!config) {
            return NextResponse.json({ error: `Unknown layer: ${layerKey}` }, { status: 400 });
        }

        // ── Calculate tile grid for ~900m × 600m area ───────────────────
        // At zoom 14, meters/pixel ≈ 156543.03 * cos(lat) / 2^14
        // For latitude ~47°N: ≈ 6.5 m/px
        // 900m → ~138px, 600m → ~92px (but we want a high-res image)
        // We use a target image size of 1536×1024 pixels
        const TARGET_W = 1536;
        const TARGET_H = 1024;

        const centerXPx = lngToGlobalPx(lng, zoom);
        const centerYPx = latToGlobalPx(lat, zoom);

        const left = centerXPx - TARGET_W / 2;
        const top = centerYPx - TARGET_H / 2;

        const tileXMin = Math.floor(left / 256);
        const tileXMax = Math.floor((left + TARGET_W - 1) / 256);
        const tileYMin = Math.floor(top / 256);
        const tileYMax = Math.floor((top + TARGET_H - 1) / 256);

        const gridW = (tileXMax - tileXMin + 1) * 256;
        const gridH = (tileYMax - tileYMin + 1) * 256;

        // ── Fetch all tiles ─────────────────────────────────────────────
        const tileBuffers: { x: number; y: number; buf: Buffer }[] = [];

        const fetchTile = async (tx: number, ty: number) => {
            const tileUrl = config.url
                .replace("{z}", String(zoom))
                .replace("{y}", String(ty))
                .replace("{x}", String(tx));

            try {
                const res = await fetch(tileUrl, {
                    signal: AbortSignal.timeout(8_000),
                });
                if (res.ok) {
                    const ab = await res.arrayBuffer();
                    tileBuffers.push({
                        x: (tx - tileXMin) * 256,
                        y: (ty - tileYMin) * 256,
                        buf: Buffer.from(ab),
                    });
                } else {
                    console.warn(`[export-pdf] tile ${tx},${ty} returned ${res.status}`);
                }
            } catch (err) {
                console.warn(`[export-pdf] tile ${tx},${ty} fetch failed:`, err);
            }
        };

        // Fetch in parallel batches of 6
        const tilesToFetch: { tx: number; ty: number }[] = [];
        for (let ty = tileYMin; ty <= tileYMax; ty++) {
            for (let tx = tileXMin; tx <= tileXMax; tx++) {
                tilesToFetch.push({ tx, ty });
            }
        }

        const BATCH = 6;
        for (let i = 0; i < tilesToFetch.length; i += BATCH) {
            await Promise.all(
                tilesToFetch.slice(i, i + BATCH).map((t) => fetchTile(t.tx, t.ty))
            );
        }

        if (tileBuffers.length === 0) {
            return NextResponse.json({ error: "No tiles could be fetched" }, { status: 502 });
        }

        // ── Compose tiles with sharp ────────────────────────────────────
        const compositeInputs = tileBuffers.map((t) => ({
            input: t.buf,
            left: t.x,
            top: t.y,
        }));

        let composed = sharp({
            create: {
                width: gridW,
                height: gridH,
                channels: 3 as const,
                background: { r: 255, g: 255, b: 255 },
            },
        }).composite(compositeInputs);

        // ── Draw parcel polygon using SVG overlay ───────────────────────
        if (parcelGeoJson) {
            const svgOverlay = renderParcelSVG(
                parcelGeoJson,
                zoom,
                left,
                top,
                gridW,
                gridH
            );
            if (svgOverlay) {
                composed = composed.composite([
                    ...compositeInputs,
                    { input: Buffer.from(svgOverlay), left: 0, top: 0 },
                ]);
            }
        }

        // ── Crop to exact target dimensions and encode ──────────────────
        const offsetX = Math.round(left - tileXMin * 256);
        const offsetY = Math.round(top - tileYMin * 256);

        const finalBuf = await composed
            .extract({
                left: Math.max(0, offsetX),
                top: Math.max(0, offsetY),
                width: Math.min(TARGET_W, gridW - offsetX),
                height: Math.min(TARGET_H, gridH - offsetY),
            })
            .jpeg({ quality: 92 })
            .toBuffer();

        const b64 = `data:image/jpeg;base64,${finalBuf.toString("base64")}`;

        return NextResponse.json({ image: b64 });
    } catch (err) {
        console.error("[export-pdf] Error:", err);
        return NextResponse.json(
            { error: "Failed to compose map image" },
            { status: 500 }
        );
    }
}

// ─── SVG parcel overlay generator ───────────────────────────────────────────

function renderParcelSVG(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    geoJson: any,
    zoom: number,
    originXPx: number,
    originYPx: number,
    width: number,
    height: number
): string | null {
    try {
        const geom = extractGeometry(geoJson);
        if (!geom) return null;

        const rings: number[][][] =
            geom.type === "Polygon"
                ? geom.coordinates
                : geom.type === "MultiPolygon"
                    ? geom.coordinates.flat()
                    : [];

        if (rings.length === 0) return null;

        let paths = "";
        for (const ring of rings) {
            const points = ring
                .map((coord: number[]) => {
                    const px = lngToGlobalPx(coord[0], zoom) - originXPx;
                    const py = latToGlobalPx(coord[1], zoom) - originYPx;
                    return `${px.toFixed(1)},${py.toFixed(1)}`;
                })
                .join(" ");
            paths += `<polygon points="${points}" fill="rgba(249,115,22,0.15)" stroke="#ef4444" stroke-width="3" stroke-dasharray="8,5" />`;
        }

        return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${paths}</svg>`;
    } catch {
        return null;
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractGeometry(geoJson: any): any | null {
    if (!geoJson) return null;
    if (typeof geoJson === "string") {
        try {
            geoJson = JSON.parse(geoJson);
        } catch {
            return null;
        }
    }
    if (geoJson.type === "FeatureCollection") return geoJson.features?.[0]?.geometry;
    if (geoJson.type === "Feature") return geoJson.geometry;
    if (geoJson.type === "Polygon" || geoJson.type === "MultiPolygon") return geoJson;
    return null;
}
