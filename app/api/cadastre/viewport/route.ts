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
const APICARTO_TIMEOUT = 5000; // Reduced from 8s — IGN rarely needs >3s

// ── In-memory viewport cache (TTL 60s, max 50 entries) ──────────────────────
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_SIZE = 50;
const viewportCache = new Map<string, { data: ParcelItem[]; ts: number }>();

function getCacheKey(bbox: [number, number, number, number]): string {
  // Round to 5 decimal places to cluster nearby requests
  return bbox.map(v => v.toFixed(5)).join(',');
}

function getCachedResult(key: string): ParcelItem[] | null {
  const entry = viewportCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    viewportCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedResult(key: string, data: ParcelItem[]): void {
  // Evict oldest entries if cache is full
  if (viewportCache.size >= CACHE_MAX_SIZE) {
    const oldest = viewportCache.keys().next().value;
    if (oldest) viewportCache.delete(oldest);
  }
  viewportCache.set(key, { data, ts: Date.now() });
}

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

        // ── Check cache first ──────────────────────────────────────────────
        const cacheKey = getCacheKey([west, south, east, north]);
        const cached = getCachedResult(cacheKey);
        if (cached) {
            return NextResponse.json({ parcels: cached, cached: true });
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

        // ── Store in cache ─────────────────────────────────────────────────
        setCachedResult(cacheKey, parcels);

        return NextResponse.json({ parcels });
    } catch (error) {
        console.error("Viewport cadastre error:", error);
        return NextResponse.json({ parcels: [] });
    }
}
