import { NextRequest, NextResponse } from "next/server";
import * as turf from "@turf/turf";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import { ignFetchWithRetry } from "@/lib/ign-fetch";

/**
 * POST /api/terrain-elevation
 *
 * Generate a grid of sample points inside a parcel polygon and fetch
 * NGF (Nivellement Général de la France) elevations from the IGN RGE Alti API.
 *
 * Each returned point has a deterministic `pointId` so the client-side
 * TerrainStore can track user overrides by ID.
 *
 * Body: { polygon: GeoJSON Polygon|MultiPolygon|Feature, gridSpacing?: number }
 *   - gridSpacing: number of grid divisions along the diagonal (default: 6)
 *
 * Response: {
 *   points:        TerrainElevationPoint[],  // each with pointId, lon, lat, z
 *   stats:         { min, max, mean, slopePercent },
 *   gridMetadata:  { requestedDivisions, cellSideKm, totalSampled, insideCount },
 *   source:        "ign_rge_alti"
 * }
 */

const IGN_ALTI_BASE =
  "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json";

/** Maximum number of points the IGN Alti API accepts in a single request */
const IGN_MAX_POINTS_PER_REQUEST = 100;

// ─── Types ───────────────────────────────────────────────────────────────

export interface TerrainElevationPoint {
  /** Deterministic ID: `elev-{index}-{lon6}-{lat6}` */
  pointId: string;
  lon: number;
  lat: number;
  /** Elevation in metres NGF (2 decimal places = cm precision) */
  z: number;
  /** Original unmodified elevation from IGN (same as z on first fetch) */
  originalZ: number;
  /** Always false from the API — becomes true in the client store on override */
  isOverridden: boolean;
  source: "ign_rge_alti";
}

interface AltiElevationEntry {
  lon: number;
  lat: number;
  z: number;
  acc: string;
}

interface AltiApiResponse {
  elevations: AltiElevationEntry[];
}

// ─── Grid generation ─────────────────────────────────────────────────────

/**
 * Generate a grid of sample points within a polygon for elevation sampling.
 * Uses turf.pointGrid, filters to points strictly inside the polygon,
 * and always includes the centroid + bbox corners for minimum coverage.
 */
function generateSampleGrid(
  feature: Feature<Polygon | MultiPolygon>,
  gridDivisions: number
): [number, number][] {
  const [minLng, minLat, maxLng, maxLat] = turf.bbox(feature);

  // Compute cell side from the diagonal and desired divisions
  const diagKm = turf.distance([minLng, minLat], [maxLng, maxLat], {
    units: "kilometers",
  });
  const cellSide = Math.max(diagKm / gridDivisions, 0.005); // minimum 5m

  const grid = turf.pointGrid([minLng, minLat, maxLng, maxLat], cellSide, {
    units: "kilometers",
  });

  // Filter to points inside the polygon
  const insidePoints: [number, number][] = [];
  for (const pt of grid.features) {
    try {
      if (turf.booleanPointInPolygon(pt, feature)) {
        insidePoints.push(pt.geometry.coordinates as [number, number]);
      }
    } catch {
      // Skip invalid points
    }
  }

  // Always include centroid for minimum coverage even on very small parcels
  try {
    const centroid = turf.centroid(feature);
    const [cx, cy] = centroid.geometry.coordinates;
    // Avoid duplicates
    if (!insidePoints.some(([x, y]) => Math.abs(x - cx) < 1e-8 && Math.abs(y - cy) < 1e-8)) {
      insidePoints.push([cx, cy]);
    }
  } catch {
    // Skip
  }

  // Include bbox corners that fall inside the polygon
  const corners: [number, number][] = [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
  ];
  for (const corner of corners) {
    try {
      if (turf.booleanPointInPolygon(turf.point(corner), feature)) {
        if (!insidePoints.some(([x, y]) => Math.abs(x - corner[0]) < 1e-8 && Math.abs(y - corner[1]) < 1e-8)) {
          insidePoints.push(corner);
        }
      }
    } catch {
      // Skip
    }
  }

  // Cap at IGN API limit
  return insidePoints.slice(0, IGN_MAX_POINTS_PER_REQUEST);
}

// ─── Feature normalisation ──────────────────────────────────────────────

function normaliseToFeature(
  geom: unknown
): Feature<Polygon | MultiPolygon> | null {
  if (!geom || typeof geom !== "object") return null;
  const g = geom as { type?: string; geometry?: unknown; coordinates?: unknown };

  if (g.type === "Feature" && g.geometry) {
    const gt = (g.geometry as { type?: string }).type;
    if (gt === "Polygon" || gt === "MultiPolygon") {
      return g as unknown as Feature<Polygon | MultiPolygon>;
    }
  }

  if (g.type === "Polygon" || g.type === "MultiPolygon") {
    return {
      type: "Feature",
      geometry: g as Polygon | MultiPolygon,
      properties: {},
    };
  }

  return null;
}

// ─── Route handler ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: { polygon?: unknown; gridSpacing?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.polygon) {
    return NextResponse.json(
      { error: "polygon is required (GeoJSON Polygon, MultiPolygon, or Feature)" },
      { status: 400 }
    );
  }

  const feature = normaliseToFeature(body.polygon);
  if (!feature) {
    return NextResponse.json(
      { error: "polygon must be a valid GeoJSON Polygon, MultiPolygon, or Feature wrapping one" },
      { status: 400 }
    );
  }

  const gridDivisions = body.gridSpacing ?? 6;
  const samplePoints = generateSampleGrid(feature, gridDivisions);

  if (samplePoints.length === 0) {
    return NextResponse.json({
      points: [],
      stats: { min: null, max: null, mean: null, slopePercent: null },
      gridMetadata: {
        requestedDivisions: gridDivisions,
        cellSideKm: 0,
        totalSampled: 0,
        insideCount: 0,
      },
      source: "ign_rge_alti",
      message: "No sample points could be generated within the polygon.",
    });
  }

  // ── Build IGN Alti API request ────────────────────────────────────────
  // The API accepts lon/lat as pipe-separated pairs
  const lonStr = samplePoints.map((p) => p[0].toFixed(6)).join("|");
  const latStr = samplePoints.map((p) => p[1].toFixed(6)).join("|");

  const url = `${IGN_ALTI_BASE}?lon=${lonStr}&lat=${latStr}&zonly=false&resource=ign_rge_alti_wld&delimiter=|&indent=false&measures=false`;

  const result = await ignFetchWithRetry<AltiApiResponse>(url, {
    maxRetries: 2,
    timeoutMs: 15000,
    backoffBaseMs: 500,
  });

  if (!result.ok || !result.data?.elevations) {
    return NextResponse.json({
      points: [],
      stats: { min: null, max: null, mean: null, slopePercent: null },
      gridMetadata: {
        requestedDivisions: gridDivisions,
        cellSideKm: 0,
        totalSampled: samplePoints.length,
        insideCount: 0,
      },
      source: "ign_rge_alti",
      error: result.error ?? "IGN RGE Alti API unavailable",
      attempts: result.attempts,
      message:
        "Impossible de récupérer les altitudes NGF depuis l'IGN. Vous pouvez saisir les altitudes manuellement.",
    });
  }

  // ── Map response elevations to typed points ───────────────────────────
  // IGN RGE Alti API returns objects { lon, lat, z, acc } — extract z from each
  const rawElevations = result.data.elevations;
  const points: TerrainElevationPoint[] = [];

  for (let i = 0; i < rawElevations.length; i++) {
    const entry = rawElevations[i];
    const z = typeof entry === "number" ? entry : entry?.z;
    // IGN returns -99999 for unavailable elevations (sea, foreign territory)
    if (typeof z === "number" && z > -9999) {
      const lon = samplePoints[i]?.[0] ?? entry?.lon ?? 0;
      const lat = samplePoints[i]?.[1] ?? entry?.lat ?? 0;
      const roundedZ = Math.round(z * 100) / 100; // cm precision
      points.push({
        pointId: `elev-${i}-${lon.toFixed(6)}-${lat.toFixed(6)}`,
        lon,
        lat,
        z: roundedZ,
        originalZ: roundedZ,
        isOverridden: false,
        source: "ign_rge_alti",
      });
    }
  }

  // ── Compute statistics ────────────────────────────────────────────────
  const zValues = points.map((p) => p.z);
  const min = zValues.length > 0 ? Math.min(...zValues) : null;
  const max = zValues.length > 0 ? Math.max(...zValues) : null;
  const mean =
    zValues.length > 0
      ? Math.round(
        (zValues.reduce((s, v) => s + v, 0) / zValues.length) * 100
      ) / 100
      : null;

  // Compute approximate slope: max elevation difference / horizontal distance
  let slopePercent: number | null = null;
  if (points.length >= 2 && min !== null && max !== null) {
    // Find the two points with min and max elevation
    const minPt = points.find((p) => p.z === min)!;
    const maxPt = points.find((p) => p.z === max)!;
    const horizontalDist = turf.distance(
      [minPt.lon, minPt.lat],
      [maxPt.lon, maxPt.lat],
      { units: "meters" }
    );
    if (horizontalDist > 0) {
      slopePercent =
        Math.round(((max - min) / horizontalDist) * 100 * 100) / 100;
    }
  }

  // Compute cell side for metadata
  const [bMinLng, bMinLat, bMaxLng, bMaxLat] = turf.bbox(feature);
  const diagKm = turf.distance([bMinLng, bMinLat], [bMaxLng, bMaxLat], {
    units: "kilometers",
  });
  const cellSideKm = Math.max(diagKm / gridDivisions, 0.005);

  return NextResponse.json({
    points,
    stats: { min, max, mean, slopePercent },
    gridMetadata: {
      requestedDivisions: gridDivisions,
      cellSideKm: Math.round(cellSideKm * 1000) / 1000,
      totalSampled: samplePoints.length,
      insideCount: points.length,
    },
    source: "ign_rge_alti",
  });
}
