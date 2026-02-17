import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/cadastre/viewport
 *
 * Fetches cadastral parcels visible in the current map viewport from the
 * IGN Apicarto API.  Called on map moveend / zoomend so surrounding parcels
 * appear progressively as the user pans & zooms.
 *
 * Body: { bbox: [west, south, east, north] }
 * Returns: { parcels: ParcelItem[] }
 */

const MAX_BBOX_DEG = 0.05; // ~5 km — allow larger viewport fetches
const APICARTO_TIMEOUT = 8000;

interface ParcelFeature {
    properties: Record<string, unknown>;
    geometry: unknown;
}

interface ParcelItem {
    id: string;
    section: string;
    number: string;
    area: number;
    geometry?: unknown;
    commune?: string;
}

function ensureUniqueIds<T extends { id: string; section: string; number: string }>(items: T[]): T[] {
    const seen = new Set<string>();
    return items.map((p, i) => {
        let id = (p.id || "").trim();
        const base = `${p.section}-${p.number}`;
        if (!id || seen.has(id)) id = `${base}-${i}`;
        let j = 0;
        while (seen.has(id)) id = `${base}-${i}-${++j}`;
        seen.add(id);
        return { ...p, id };
    });
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const bbox = body?.bbox;

        if (
            !Array.isArray(bbox) ||
            bbox.length !== 4 ||
            bbox.some((v: unknown) => typeof v !== "number" || !Number.isFinite(v))
        ) {
            return NextResponse.json(
                { error: "bbox must be [west, south, east, north]" },
                { status: 400 }
            );
        }

        const [west, south, east, north] = bbox as [number, number, number, number];

        // Reject viewport too large (user zoomed out too far)
        if (east - west > MAX_BBOX_DEG || north - south > MAX_BBOX_DEG) {
            return NextResponse.json({ parcels: [], skipped: true });
        }

        const bboxGeom = JSON.stringify({
            type: "Polygon",
            coordinates: [[
                [west, south],
                [east, south],
                [east, north],
                [west, north],
                [west, south],
            ]],
        });

        const url = `https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(bboxGeom)}`;

        const res = await fetch(url, { signal: AbortSignal.timeout(APICARTO_TIMEOUT) });

        if (!res.ok) {
            // IGN may return 400/500 for oversize — degrade gracefully
            return NextResponse.json({ parcels: [] });
        }

        const data = await res.json();
        const features: ParcelFeature[] = data?.features ?? [];

        const parcels: ParcelItem[] = ensureUniqueIds(
            features.map((f) => ({
                id: String(f.properties?.id ?? ""),
                section: String(f.properties?.section ?? ""),
                number: String(f.properties?.numero ?? ""),
                area: Number(f.properties?.contenance ?? 0),
                geometry: f.geometry,
                commune: String(f.properties?.commune ?? f.properties?.code_commune ?? ""),
            }))
        );

        return NextResponse.json({ parcels });
    } catch (error) {
        console.error("Viewport cadastre error:", error);
        return NextResponse.json({ parcels: [] });
    }
}
