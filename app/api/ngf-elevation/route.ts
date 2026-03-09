import { NextRequest, NextResponse } from "next/server";
import * as turf from "@turf/turf";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import { ignFetchWithRetry } from "@/lib/ign-fetch";

/**
 * POST /api/ngf-elevation
 *
 * Automatically retrieve NGF (Nivellement Général de la France) altitudes
 * from the IGN RGE Alti API for a set of sample points across a parcel polygon.
 *
 * Returns an elevation grid that can be used as a starting point for terrain data,
 * while remaining fully editable by the user.
 *
 * Body: { parcelGeometry: GeoJSON Polygon | MultiPolygon, gridSize?: number }
 * Response: { elevations: { lon, lat, z }[], stats: { min, max, mean }, source }
 */

const IGN_ALTI_BASE = "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json";

interface ElevationPoint {
  lon: number;
  lat: number;
  z: number;
}

interface AltiElevationEntry {
  lon: number;
  lat: number;
  z: number;
  acc: string;
}

interface AltiResponse {
  elevations: AltiElevationEntry[];
}

/**
 * Generate a grid of sample points within a polygon for elevation sampling.
 * Uses turf.pointGrid, filters to points inside the polygon.
 */
function generateSamplePoints(
  geometry: Feature<Polygon | MultiPolygon>,
  gridSize: number
): [number, number][] {
  const [minLng, minLat, maxLng, maxLat] = turf.bbox(geometry);
  // Calculate cell side based on bounding box and desired grid
  const diagKm = turf.distance([minLng, minLat], [maxLng, maxLat], { units: "kilometers" });
  const cellSide = Math.max(diagKm / gridSize, 0.005); // minimum 5m

  const grid = turf.pointGrid([minLng, minLat, maxLng, maxLat], cellSide, {
    units: "kilometers",
  });

  // Filter to points within the parcel
  const insidePoints: [number, number][] = [];
  for (const pt of grid.features) {
    try {
      if (turf.booleanPointInPolygon(pt, geometry)) {
        insidePoints.push(pt.geometry.coordinates as [number, number]);
      }
    } catch {
      // Skip invalid points
    }
  }

  // Always include corners and centroid for minimum coverage
  try {
    const centroid = turf.centroid(geometry);
    insidePoints.push(centroid.geometry.coordinates as [number, number]);
  } catch {
    // Skip
  }

  // Limit to 100 points max (IGN API limit per request)
  return insidePoints.slice(0, 100);
}

export async function POST(req: NextRequest) {
  let body: { parcelGeometry?: unknown; gridSize?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.parcelGeometry) {
    return NextResponse.json(
      { error: "parcelGeometry is required" },
      { status: 400 }
    );
  }

  // Normalize input to a Feature
  let feature: Feature<Polygon | MultiPolygon>;
  try {
    const geom = body.parcelGeometry as { type: string; coordinates?: unknown; geometry?: unknown };
    if (geom.type === "Feature") {
      feature = geom as unknown as Feature<Polygon | MultiPolygon>;
    } else if (geom.type === "Polygon" || geom.type === "MultiPolygon") {
      feature = {
        type: "Feature",
        geometry: geom as Polygon | MultiPolygon,
        properties: {},
      };
    } else {
      return NextResponse.json(
        { error: "parcelGeometry must be a Polygon, MultiPolygon, or Feature" },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to parse parcelGeometry" },
      { status: 400 }
    );
  }

  const gridSize = body.gridSize ?? 5; // 5x5 default grid
  const samplePoints = generateSamplePoints(feature, gridSize);

  if (samplePoints.length === 0) {
    return NextResponse.json({
      elevations: [],
      stats: { min: null, max: null, mean: null },
      source: "rge_alti",
      message: "No sample points could be generated within the parcel.",
    });
  }

  // IGN Alti API accepts lon/lat as pipe-separated pairs
  const lonStr = samplePoints.map((p) => p[0].toFixed(6)).join("|");
  const latStr = samplePoints.map((p) => p[1].toFixed(6)).join("|");

  const url = `${IGN_ALTI_BASE}?lon=${lonStr}&lat=${latStr}&zonly=false&resource=ign_rge_alti_wld&delimiter=|&indent=false&measures=false`;

  const result = await ignFetchWithRetry<AltiResponse>(url, {
    maxRetries: 2,
    timeoutMs: 15000,
    backoffBaseMs: 500,
  });

  if (!result.ok || !result.data?.elevations) {
    return NextResponse.json({
      elevations: [],
      stats: { min: null, max: null, mean: null },
      source: "rge_alti",
      error: result.error ?? "IGN RGE Alti API unavailable",
      message:
        "Impossible de récupérer les altitudes NGF depuis l'IGN. Vous pouvez saisir les altitudes manuellement.",
    });
  }

  // Map response elevations to point coordinates
  // IGN RGE Alti API returns objects { lon, lat, z, acc } — extract z from each
  const elevations: ElevationPoint[] = [];
  const rawElevations = result.data.elevations;

  for (let i = 0; i < rawElevations.length; i++) {
    const entry = rawElevations[i];
    const z = typeof entry === "number" ? entry : entry?.z;
    // IGN returns -99999 for unavailable elevations (sea, foreign territory)
    if (typeof z === "number" && z > -9999) {
      elevations.push({
        lon: samplePoints[i]?.[0] ?? entry?.lon ?? 0,
        lat: samplePoints[i]?.[1] ?? entry?.lat ?? 0,
        z: Math.round(z * 100) / 100, // 2 decimal places (cm precision)
      });
    }
  }

  // Compute stats
  const zValues = elevations.map((e) => e.z);
  const stats = {
    min: zValues.length > 0 ? Math.min(...zValues) : null,
    max: zValues.length > 0 ? Math.max(...zValues) : null,
    mean:
      zValues.length > 0
        ? Math.round((zValues.reduce((s, v) => s + v, 0) / zValues.length) * 100) / 100
        : null,
  };

  return NextResponse.json({
    elevations,
    stats,
    source: "rge_alti",
    pointCount: elevations.length,
    samplePointsRequested: samplePoints.length,
  });
}
