import { NextRequest, NextResponse } from "next/server";
import * as turf from "@turf/turf";
import type {
  Feature,
  Polygon,
  MultiPolygon,
  FeatureCollection,
  GeoJsonProperties,
} from "geojson";
import { ignFetchWithRetry } from "@/lib/ign-fetch";
import type {
  ProcessedSiteData,
  ProcessedParcel,
  Vertex3D,
  EdgeMeasurement,
} from "@/types/processed-site-data";

/**
 * POST /api/projects/process-geometry
 *
 * The backend GIS processor: takes raw GeoJSON parcels and returns a fully
 * pre-processed `ProcessedSiteData` object ready for instant 2D + 3D rendering.
 *
 * Pipeline:
 *  1. Sanitize & validate each parcel geometry
 *  2. turf.union() → globalBoundary
 *  3. Extract boundary vertices & calculate edge lengths
 *  4. Fetch NGF elevations from IGN RGE Alti API
 *  5. Compute refPoint (bbox center) and stats
 *  6. Return unified ProcessedSiteData
 */

const IGN_ALTI_BASE =
  "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json";

/** Max points per IGN Alti API request */
const IGN_MAX_BATCH = 100;

// ─── Geometry Sanitisation (reusing patterns from lib/parcel-merge.ts) ───────

function closeRing(ring: number[][]): number[][] {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([...first]);
  }
  return ring;
}

function sanitizePolygon(
  coordinates: number[][][]
): Feature<Polygon> | null {
  if (!coordinates || coordinates.length === 0) return null;

  const sanitizedRings: number[][][] = [];
  for (const ring of coordinates) {
    const closed = closeRing([...ring.map((c) => [...c])]);
    if (closed.length < 4) return null;
    sanitizedRings.push(closed);
  }

  try {
    const feature = turf.polygon(sanitizedRings);
    return turf.rewind(feature, { reverse: false }) as Feature<Polygon>;
  } catch {
    return null;
  }
}

function repairSelfIntersections(
  feature: Feature<Polygon | MultiPolygon>
): Feature<Polygon | MultiPolygon> {
  try {
    if (feature.geometry.type === "Polygon") {
      const unkinked = turf.unkinkPolygon(feature as Feature<Polygon>);
      if (unkinked.features.length <= 1) return feature;
      let merged: Feature<Polygon | MultiPolygon> =
        unkinked.features[0] as Feature<Polygon>;
      for (let i = 1; i < unkinked.features.length; i++) {
        const result = turf.union(
          turf.featureCollection([merged, unkinked.features[i] as Feature<Polygon>])
        );
        if (result) merged = result as Feature<Polygon | MultiPolygon>;
      }
      return merged;
    }
  } catch {
    // Return original on failure
  }
  return feature;
}

// ─── Vertex & Edge Extraction ────────────────────────────────────────────────

/** Extract all unique outer-ring vertices from a Polygon or MultiPolygon */
function extractBoundaryVertices(
  geometry: Polygon | MultiPolygon
): [number, number][] {
  const rings: number[][][] = [];

  if (geometry.type === "Polygon") {
    rings.push(geometry.coordinates[0]);
  } else {
    for (const poly of geometry.coordinates) {
      rings.push(poly[0]);
    }
  }

  const vertices: [number, number][] = [];
  const seen = new Set<string>();

  for (const ring of rings) {
    // Exclude the closing vertex (same as first)
    const len = ring.length;
    const limit = len > 1 && ring[0][0] === ring[len - 1][0] && ring[0][1] === ring[len - 1][1]
      ? len - 1
      : len;

    for (let i = 0; i < limit; i++) {
      const key = `${ring[i][0].toFixed(8)},${ring[i][1].toFixed(8)}`;
      if (!seen.has(key)) {
        seen.add(key);
        vertices.push([ring[i][0], ring[i][1]]);
      }
    }
  }

  return vertices;
}

/** Calculate edges (consecutive vertex pairs) with geodesic lengths */
function calculateEdges(geometry: Polygon | MultiPolygon): {
  edges: Array<{ from: [number, number]; to: [number, number]; lengthMeters: number }>;
} {
  const rings: number[][][] = [];

  if (geometry.type === "Polygon") {
    rings.push(geometry.coordinates[0]);
  } else {
    for (const poly of geometry.coordinates) {
      rings.push(poly[0]);
    }
  }

  const edges: Array<{
    from: [number, number];
    to: [number, number];
    lengthMeters: number;
  }> = [];

  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const from: [number, number] = [ring[i][0], ring[i][1]];
      const to: [number, number] = [ring[i + 1][0], ring[i + 1][1]];
      const lengthMeters = turf.distance(turf.point(from), turf.point(to), {
        units: "meters",
      });
      edges.push({ from, to, lengthMeters: Math.round(lengthMeters * 100) / 100 });
    }
  }

  return { edges };
}

// ─── IGN Elevation Fetch ─────────────────────────────────────────────────────

interface AltiResponse {
  elevations: number[];
}

/**
 * Fetch NGF elevations for a list of [lng, lat] coordinates.
 * Handles batching if more than IGN_MAX_BATCH points.
 */
async function fetchElevations(
  coords: [number, number][]
): Promise<Map<string, number>> {
  const elevationMap = new Map<string, number>();

  // Batch into groups of IGN_MAX_BATCH
  for (let start = 0; start < coords.length; start += IGN_MAX_BATCH) {
    const batch = coords.slice(start, start + IGN_MAX_BATCH);

    const lonStr = batch.map((c) => c[0].toFixed(6)).join("|");
    const latStr = batch.map((c) => c[1].toFixed(6)).join("|");

    const url = `${IGN_ALTI_BASE}?lon=${lonStr}&lat=${latStr}&zonly=false&resource=ign_rge_alti_wld&delimiter=|&indent=false&measures=false`;

    const result = await ignFetchWithRetry<AltiResponse>(url, {
      maxRetries: 2,
      timeoutMs: 15000,
      backoffBaseMs: 500,
    });

    if (result.ok && result.data?.elevations) {
      for (let i = 0; i < batch.length; i++) {
        const z = result.data.elevations[i];
        // IGN returns -99999 for unavailable elevations
        if (typeof z === "number" && z > -9999) {
          const key = `${batch[i][0].toFixed(8)},${batch[i][1].toFixed(8)}`;
          elevationMap.set(key, Math.round(z * 100) / 100);
        }
      }
    } else {
      console.warn(
        `process-geometry: IGN Alti batch failed (offset ${start}):`,
        result.error
      );
    }
  }

  return elevationMap;
}

// ─── Route Handler ───────────────────────────────────────────────────────────

interface RequestBody {
  parcels?: Array<{
    type?: string;
    properties?: {
      id?: string;
      section?: string;
      number?: string;
      area?: number;
      [key: string]: unknown;
    };
    geometry?: {
      type: string;
      coordinates: number[][][] | number[][][][];
    };
  }>;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.parcels || !Array.isArray(body.parcels) || body.parcels.length === 0) {
    return NextResponse.json(
      { error: "parcels array is required and must not be empty" },
      { status: 400 }
    );
  }

  // ── Step 1: Sanitize parcels ──────────────────────────────────────────────
  const validFeatures: Feature<Polygon | MultiPolygon>[] = [];
  const processedParcels: ProcessedParcel[] = [];
  const failedIds: string[] = [];

  for (const parcel of body.parcels) {
    const geom = parcel.geometry;
    if (!geom) {
      failedIds.push(parcel.properties?.id ?? "unknown");
      continue;
    }

    let feature: Feature<Polygon | MultiPolygon> | null = null;

    if (geom.type === "Polygon") {
      feature = sanitizePolygon(geom.coordinates as number[][][]);
    } else if (geom.type === "MultiPolygon") {
      // For MultiPolygon, sanitize each polygon component
      const polys: Feature<Polygon>[] = [];
      for (const polyCoords of geom.coordinates as number[][][][]) {
        const sanitized = sanitizePolygon(polyCoords);
        if (sanitized) polys.push(sanitized);
      }
      if (polys.length === 1) {
        feature = polys[0];
      } else if (polys.length > 1) {
        try {
          const coords = polys.map((p) => p.geometry.coordinates);
          feature = turf.multiPolygon(coords) as Feature<MultiPolygon>;
        } catch {
          // Skip
        }
      }
    }

    if (!feature) {
      failedIds.push(parcel.properties?.id ?? "unknown");
      continue;
    }

    // Repair self-intersections
    feature = repairSelfIntersections(feature);

    // Tag with properties for union
    feature.properties = { id: parcel.properties?.id ?? "unknown" };
    validFeatures.push(feature);

    // Store as ProcessedParcel
    const coords =
      feature.geometry.type === "Polygon"
        ? feature.geometry.coordinates
        : feature.geometry.coordinates[0]; // Take first polygon for ProcessedParcel

    processedParcels.push({
      id: parcel.properties?.id ?? "unknown",
      section: parcel.properties?.section ?? "",
      number: parcel.properties?.number ?? "",
      area: parcel.properties?.area ?? 0,
      coordinates: coords,
    });
  }

  if (validFeatures.length === 0) {
    return NextResponse.json(
      {
        error: "No valid parcel geometries could be processed",
        failedIds,
      },
      { status: 400 }
    );
  }

  // ── Step 2: Merge via turf.union → globalBoundary ─────────────────────────
  let merged: Feature<Polygon | MultiPolygon>;

  if (validFeatures.length === 1) {
    merged = validFeatures[0];
  } else {
    merged = validFeatures[0];
    for (let i = 1; i < validFeatures.length; i++) {
      try {
        const result = turf.union(
          turf.featureCollection([
            merged,
            validFeatures[i],
          ] as Feature<Polygon | MultiPolygon>[])
        );
        if (result) {
          merged = result as Feature<Polygon | MultiPolygon>;
        } else {
          failedIds.push(
            (validFeatures[i].properties as GeoJsonProperties)?.id ?? `index-${i}`
          );
        }
      } catch (e) {
        console.warn(`process-geometry: union failed for parcel index ${i}:`, e);
        failedIds.push(
          (validFeatures[i].properties as GeoJsonProperties)?.id ?? `index-${i}`
        );
      }
    }
  }

  const globalBoundary: Feature<Polygon | MultiPolygon> = {
    type: "Feature",
    geometry: merged.geometry,
    properties: {
      isContiguous: merged.geometry.type === "Polygon",
      sourceCount: validFeatures.length,
      failedIds,
    },
  };

  // ── Step 3: Extract vertices & calculate edges ────────────────────────────
  const boundaryVertexCoords = extractBoundaryVertices(globalBoundary.geometry);
  const { edges: rawEdges } = calculateEdges(globalBoundary.geometry);

  // ── Step 4: Compute refPoint (bbox center — not centroid) ─────────────────
  const [bboxMinLng, bboxMinLat, bboxMaxLng, bboxMaxLat] = turf.bbox(globalBoundary);
  const refPoint = {
    lng: (bboxMinLng + bboxMaxLng) / 2,
    lat: (bboxMinLat + bboxMaxLat) / 2,
  };

  // ── Step 5: Fetch NGF elevations for all boundary vertices ────────────────
  const elevationMap = await fetchElevations(boundaryVertexCoords);

  // Build Vertex3D array
  const vertices3D: Vertex3D[] = boundaryVertexCoords.map(([lng, lat]) => {
    const key = `${lng.toFixed(8)},${lat.toFixed(8)}`;
    const elevation = elevationMap.get(key) ?? 0;
    return { lng, lat, elevation };
  });

  // Build EdgeMeasurement array with elevation data
  const edges: EdgeMeasurement[] = rawEdges.map((e) => {
    const fromKey = `${e.from[0].toFixed(8)},${e.from[1].toFixed(8)}`;
    const toKey = `${e.to[0].toFixed(8)},${e.to[1].toFixed(8)}`;
    return {
      from: {
        lng: e.from[0],
        lat: e.from[1],
        elevation: elevationMap.get(fromKey) ?? 0,
      },
      to: {
        lng: e.to[0],
        lat: e.to[1],
        elevation: elevationMap.get(toKey) ?? 0,
      },
      lengthMeters: e.lengthMeters,
    };
  });

  // ── Step 6: Compute elevation stats ───────────────────────────────────────
  const elevationValues = vertices3D.map((v) => v.elevation).filter((z) => z !== 0);
  const minElevation = elevationValues.length > 0 ? Math.min(...elevationValues) : 0;
  const maxElevation = elevationValues.length > 0 ? Math.max(...elevationValues) : 0;
  const meanElevation =
    elevationValues.length > 0
      ? Math.round(
          (elevationValues.reduce((s, v) => s + v, 0) / elevationValues.length) * 100
        ) / 100
      : 0;

  // Compute slope between min and max elevation vertices
  let slopePercent: number | null = null;
  if (elevationValues.length >= 2 && maxElevation !== minElevation) {
    const minVtx = vertices3D.find((v) => v.elevation === minElevation)!;
    const maxVtx = vertices3D.find((v) => v.elevation === maxElevation)!;
    const horizDist = turf.distance(
      turf.point([minVtx.lng, minVtx.lat]),
      turf.point([maxVtx.lng, maxVtx.lat]),
      { units: "meters" }
    );
    if (horizDist > 0) {
      slopePercent =
        Math.round(((maxElevation - minElevation) / horizDist) * 100 * 100) / 100;
    }
  }

  // ── Step 7: Assemble & return ProcessedSiteData ───────────────────────────
  const result: ProcessedSiteData = {
    parcels: processedParcels,
    globalBoundary,
    edges,
    vertices3D,
    refPoint,
    stats: {
      minElevation,
      maxElevation,
      meanElevation,
      slopePercent,
    },
  };

  return NextResponse.json(result);
}
