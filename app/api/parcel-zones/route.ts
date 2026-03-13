import { NextRequest, NextResponse } from "next/server";
import * as turf from "@turf/turf";

/**
 * POST /api/parcel-zones
 *
 * Fast per-parcel PLU zone detection using centroid point queries.
 * For each parcel, computes its centroid coordinate, then queries
 * GPU zone-urba with that single point — much faster than polygon intersection.
 *
 * Input:
 *   { parcels: [{ id: string, geometry: GeoJSON Polygon/MultiPolygon }] }
 *
 * Output:
 *   { success: true, parcelZones: { [parcelId]: { zoneCode, zoneName } | null }, primaryZone, allZones }
 */

const APICARTO_GPU = "https://apicarto.ign.fr/api/gpu";
const API_HEADERS = { "User-Agent": "UrbAssist/1.0 (urbanisme)" };
const API_TIMEOUT = 8000;

// ---------------------------------------------------------------------------
// GPU fetch helper
// ---------------------------------------------------------------------------

async function gpuGet(path: string, geom: object): Promise<unknown[]> {
  const url = `${APICARTO_GPU}/${path}?geom=${encodeURIComponent(JSON.stringify(geom))}`;
  try {
    const res = await fetch(url, {
      headers: API_HEADERS,
      signal: AbortSignal.timeout(API_TIMEOUT),
    });
    if (res.ok) {
      const data = await res.json();
      return data?.features ?? [];
    }
    console.log(`[parcel-zones] ${path}: ${res.status}`);
  } catch (e) {
    console.log(`[parcel-zones] ${path} failed:`, (e as Error).message);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Zone label extraction
// ---------------------------------------------------------------------------

function getZoneLibelle(props: Record<string, unknown> | undefined): string | null {
  if (!props) return null;
  const v = (props.libelle ?? props.LIBELLE ?? props.code ?? props.zone ?? props.typezone ?? props.TYPEZONE) as string | undefined;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function getZoneLibelong(props: Record<string, unknown> | undefined): string | null {
  if (!props) return null;
  const v = (props.libelong ?? props.LIBELLONG ?? props.LIBELONG) as string | undefined;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// ---------------------------------------------------------------------------
// Centroid extraction from parcel geometry
// ---------------------------------------------------------------------------

interface GeoJSONGeometry {
  type: string;
  coordinates: unknown;
}

/**
 * Computes the centroid [lng, lat] of a parcel geometry.
 * Works with Polygon and MultiPolygon.
 */
function getParcelCentroid(geom: GeoJSONGeometry): [number, number] | null {
  if (!geom || !geom.type || !geom.coordinates) return null;

  try {
    if (geom.type === "Polygon" || geom.type === "MultiPolygon") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const feature = turf.feature(geom as any);
      const centroid = turf.centroid(feature);
      const [lng, lat] = centroid.geometry.coordinates;
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        return [lng, lat];
      }
    }
  } catch {
    // fallback below
  }

  return null;
}

// ---------------------------------------------------------------------------
// Per-parcel zone detection — fast centroid-based approach
// ---------------------------------------------------------------------------

interface ParcelZoneResult {
  zoneCode: string;
  zoneName: string;
}

/**
 * For a single parcel, computes its centroid and queries GPU zone-urba
 * with that point. The zone containing the centroid is the parcel's zone.
 * This is much faster than full polygon intersection.
 */
async function detectZoneForParcel(
  parcelGeom: GeoJSONGeometry,
): Promise<ParcelZoneResult | null> {
  const centroid = getParcelCentroid(parcelGeom);
  if (!centroid) return null;

  const [lng, lat] = centroid;

  // Create a minimal GeoJSON Point for the GPU query
  const pointGeom = { type: "Point", coordinates: [lng, lat] };

  // Query GPU zone-urba with the centroid point — fast point-in-polygon lookup
  const features = await gpuGet("zone-urba", pointGeom);

  if (!features || features.length === 0) return null;

  // With a point query, GPU returns the zone(s) containing that point.
  // Pick the most specific zone (prefer U* zones like UA/UB over generic U).
  let bestCode: string | null = null;
  let bestName: string | null = null;
  let bestSpecificity = 0;

  for (const f of features) {
    const feat = f as { properties?: Record<string, unknown> };
    if (!feat.properties) continue;

    const code = getZoneLibelle(feat.properties);
    if (!code) continue;

    const name = getZoneLibelong(feat.properties) || code;

    // Specificity: longer zone codes are more specific (UA > U, UBa > UB)
    const specificity = code.length;

    if (specificity > bestSpecificity) {
      bestSpecificity = specificity;
      bestCode = code;
      bestName = name;
    }
  }

  if (!bestCode) {
    // Fallback: use first zone feature
    const first = features[0] as { properties?: Record<string, unknown> };
    const code = getZoneLibelle(first?.properties);
    if (code) {
      return {
        zoneCode: code,
        zoneName: getZoneLibelong(first?.properties) || code,
      };
    }
    return null;
  }

  return { zoneCode: bestCode, zoneName: bestName || bestCode };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parcels = body?.parcels as Array<{ id: string; geometry?: unknown }> | undefined;

    if (!parcels || !Array.isArray(parcels) || parcels.length === 0) {
      return NextResponse.json({ error: "parcels[] array required" }, { status: 400 });
    }

    // Cap at 20 parcels to prevent abuse
    const toProcess = parcels.slice(0, 20);
    console.log(`[parcel-zones] Processing ${toProcess.length} parcels (centroid mode)`);

    // Run ALL parcel zone queries in parallel — very fast with point queries
    const results = await Promise.allSettled(
      toProcess.map(async (p) => {
        if (!p.geometry) return { id: p.id, zone: null };
        const zone = await detectZoneForParcel(p.geometry as GeoJSONGeometry);
        console.log(`[parcel-zones] Parcel ${p.id}: ${zone?.zoneCode ?? "no zone"}`);
        return { id: p.id, zone };
      })
    );

    // Build the response map
    const parcelZones: Record<string, ParcelZoneResult | null> = {};
    const allZoneCodes = new Set<string>();

    for (const result of results) {
      if (result.status === "fulfilled") {
        const { id, zone } = result.value;
        parcelZones[id] = zone;
        if (zone) allZoneCodes.add(zone.zoneCode);
      }
    }

    // Primary zone = first zone alphabetically (or we could pick most common)
    const allZones = Array.from(allZoneCodes).sort();
    const primaryZone = allZones[0] ?? null;

    console.log(`[parcel-zones] Result: primary=${primaryZone}, all=[${allZones.join(",")}]`);

    return NextResponse.json({
      success: true,
      parcelZones,
      primaryZone,
      allZones,
    });
  } catch (error) {
    console.error("[parcel-zones] Error:", error);
    return NextResponse.json({ error: "Per-parcel zone detection failed" }, { status: 500 });
  }
}
