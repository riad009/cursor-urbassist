/**
 * GIS Processing Pipeline
 *
 * Server-side module that processes parcel geometries into a unified site data
 * structure with merged boundaries, classified edges, and 3D elevation data
 * from IGN RGE Alti API.
 *
 * Used by:
 *  - POST /api/projects       (inline processing during project creation)
 *  - POST /api/projects/process-geometry (standalone endpoint)
 */
import * as turf from "@turf/turf";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import { mergeParcelGeometries, classifyBoundaryEdges, type ParcelGeometry } from "./parcel-merge";

// ─── Public Types ────────────────────────────────────────────────────────────

export interface ParcelInput {
  type: string; // "Feature"
  properties: {
    id: string;
    section?: string;
    number?: string;
    area?: number;
    [key: string]: unknown;
  };
  geometry: {
    type: string; // "Polygon" | "MultiPolygon"
    coordinates: number[][][] | number[][][][];
  };
}

export interface Vertex3D {
  lng: number;
  lat: number;
  elevation: number; // NGF meters
}

export interface Edge {
  from: number; // index into vertices3D
  to: number;
  length: number; // meters
  type: "front" | "side-left" | "side-right" | "rear" | "unknown";
}

export interface ProcessedSiteData {
  vertices3D: Vertex3D[];
  edges: Edge[];
  mergedBoundary: Feature<Polygon | MultiPolygon>;
  parcels: ParcelInput[];
  /** Master anchor = bbox center of merged boundary */
  refPoint: { lng: number; lat: number };
  /** Dense elevation grid inside the boundary for realistic 3D terrain */
  topographyGrid: Vertex3D[];
  stats: {
    minElevation: number;
    maxElevation: number;
    avgElevation: number;
    totalArea: number;
    isContiguous: boolean;
    slopePercent: number | null;
  };
}

// ─── IGN Elevation API ─────────────────────────────────────────────────────

const IGN_ALTI_URL = "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json";

/**
 * Fetch elevations from IGN RGE Alti for a batch of coordinates.
 * Falls back to 0 if the API is unreachable.
 */
async function fetchElevations(
  coords: [number, number][]
): Promise<number[]> {
  if (coords.length === 0) return [];

  // IGN API accepts max ~100 points per request; chunk if needed
  const CHUNK = 80;
  const allElevations: number[] = [];

  for (let i = 0; i < coords.length; i += CHUNK) {
    const chunk = coords.slice(i, i + CHUNK);
    const lons = chunk.map((c) => c[0]).join("|");
    const lats = chunk.map((c) => c[1]).join("|");
    const url = `${IGN_ALTI_URL}?lon=${lons}&lat=${lats}&resource=ign_rge_alti_wld&delimiter=|&measures=false&zonly=true`;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        const elev: number[] = Array.isArray(data.elevations)
          ? data.elevations.map((e: { z?: number }) => (typeof e.z === "number" ? e.z : 0))
          : chunk.map(() => 0);
        allElevations.push(...elev);
      } else {
        allElevations.push(...chunk.map(() => 0));
      }
    } catch {
      // API unreachable — graceful fallback
      allElevations.push(...chunk.map(() => 0));
    }
  }

  return allElevations;
}

// ─── Dense Topography Grid ──────────────────────────────────────────────────

/**
 * Generate a dense grid of elevation points inside the boundary polygon.
 *
 * Creates a regular ~spacingM-spaced grid, filters to points inside the
 * boundary, and fetches IGN RGE Alti elevations for all grid points.
 *
 * @param boundary - The merged boundary polygon
 * @param spacingM - Grid spacing in meters (default: 5m)
 * @returns Array of Vertex3D with real elevations
 */
async function generateTopographyGrid(
  boundary: Feature<Polygon | MultiPolygon>,
  spacingM: number = 5
): Promise<Vertex3D[]> {
  try {
    const bbox = turf.bbox(boundary); // [minLng, minLat, maxLng, maxLat]

    // Convert spacing from meters to approximate degrees
    const centerLat = (bbox[1] + bbox[3]) / 2;
    const METERS_PER_DEG_LAT = 111320;
    const METERS_PER_DEG_LNG = METERS_PER_DEG_LAT * Math.cos(centerLat * Math.PI / 180);
    const dLng = spacingM / METERS_PER_DEG_LNG;
    const dLat = spacingM / METERS_PER_DEG_LAT;

    // Generate regular grid points within bbox
    const gridPoints: [number, number][] = [];
    for (let lng = bbox[0]; lng <= bbox[2]; lng += dLng) {
      for (let lat = bbox[1]; lat <= bbox[3]; lat += dLat) {
        // Only include points inside the boundary
        const pt = turf.point([lng, lat]);
        if (turf.booleanPointInPolygon(pt, boundary)) {
          gridPoints.push([lng, lat]);
        }
      }
    }

    // Cap at ~500 points to stay within API limits (6-7 requests at 80/chunk)
    let sampledPoints = gridPoints;
    if (gridPoints.length > 500) {
      // Increase spacing and regenerate
      const factor = Math.sqrt(gridPoints.length / 500);
      const newSpacing = spacingM * factor;
      return generateTopographyGrid(boundary, newSpacing);
    }

    if (sampledPoints.length === 0) return [];

    console.log(`[gis-pipeline] Fetching elevations for ${sampledPoints.length} grid points (~${spacingM}m spacing)`);

    // Fetch elevations for all grid points
    const elevations = await fetchElevations(sampledPoints);

    return sampledPoints.map((coord, i) => ({
      lng: coord[0],
      lat: coord[1],
      elevation: elevations[i] ?? 0,
    }));
  } catch (err) {
    console.warn("[gis-pipeline] topography grid generation failed:", err);
    return [];
  }
}

// ─── Core Pipeline ──────────────────────────────────────────────────────────

/**
 * Process an array of parcel GeoJSON features into a unified site data structure.
 *
 * Steps:
 *  1. Convert ParcelInput[] → ParcelGeometry[] for parcel-merge
 *  2. Merge parcels into a single boundary
 *  3. Extract boundary vertices
 *  4. Fetch IGN elevations for all vertices
 *  5. Classify boundary edges (front/side/rear)
 *  6. Generate dense topography grid (NEW)
 *  7. Return the assembled ProcessedSiteData
 *
 * Returns null if no valid geometries could be processed.
 */
export async function processParcelGeometries(
  parcels: ParcelInput[]
): Promise<{ data: ProcessedSiteData } | null> {
  if (!parcels || parcels.length === 0) return null;

  // ── Step 1: Convert to ParcelGeometry ──
  const parcelGeoms: ParcelGeometry[] = parcels.map((p) => ({
    id: p.properties.id || "unknown",
    section: (p.properties.section as string) || "",
    number: (p.properties.number as string) || "",
    area: (p.properties.area as number) || 0,
    geometry: p.geometry as ParcelGeometry["geometry"],
  }));

  // ── Step 2: Merge ──
  const merged = mergeParcelGeometries(parcelGeoms);
  if (!merged) return null;

  // ── Step 3: Extract boundary vertices ──
  let boundaryCoords: number[][];
  if (merged.geometry.type === "Polygon") {
    boundaryCoords = merged.geometry.coordinates[0];
  } else {
    // MultiPolygon — concatenate all outer rings
    boundaryCoords = merged.geometry.coordinates.flatMap((poly) => poly[0]);
  }

  // Deduplicate closing vertex
  if (
    boundaryCoords.length > 1 &&
    boundaryCoords[0][0] === boundaryCoords[boundaryCoords.length - 1][0] &&
    boundaryCoords[0][1] === boundaryCoords[boundaryCoords.length - 1][1]
  ) {
    boundaryCoords = boundaryCoords.slice(0, -1);
  }

  const lngLats: [number, number][] = boundaryCoords.map(
    (c) => [c[0], c[1]] as [number, number]
  );

  // ── Step 4: Fetch elevations ──
  const elevations = await fetchElevations(lngLats);

  const vertices3D: Vertex3D[] = lngLats.map((c, i) => ({
    lng: c[0],
    lat: c[1],
    elevation: elevations[i] ?? 0,
  }));

  // ── Step 5: Classify edges ──
  const classifiedEdges = classifyBoundaryEdges(
    merged.geometry as { type: string; coordinates: number[][][] | number[][][][] }
  );

  const edges: Edge[] = [];
  for (let i = 0; i < vertices3D.length; i++) {
    const next = (i + 1) % vertices3D.length;
    const length = turf.distance(
      turf.point([vertices3D[i].lng, vertices3D[i].lat]),
      turf.point([vertices3D[next].lng, vertices3D[next].lat]),
      { units: "meters" }
    );
    const classified = classifiedEdges[i];
    edges.push({
      from: i,
      to: next,
      length: Math.round(length * 100) / 100,
      type: classified?.type ?? "unknown",
    });
  }

  // ── Step 6: Generate dense topography grid ──
  const topographyGrid = await generateTopographyGrid(merged);

  // ── Step 7: Compute refPoint from bbox center ──
  const bboxArr = turf.bbox(merged);
  const refPoint = {
    lng: (bboxArr[0] + bboxArr[2]) / 2,
    lat: (bboxArr[1] + bboxArr[3]) / 2,
  };

  // ── Step 8: Compute stats ──
  const allElevations = [
    ...elevations,
    ...topographyGrid.map((v) => v.elevation),
  ].filter((e) => e !== 0 && Number.isFinite(e));

  const minE = allElevations.length > 0 ? Math.min(...allElevations) : 0;
  const maxE = allElevations.length > 0 ? Math.max(...allElevations) : 0;
  const avgE =
    allElevations.length > 0
      ? allElevations.reduce((a, b) => a + b, 0) / allElevations.length
      : 0;

  // Slope: rise/run as percentage
  let slopePercent: number | null = null;
  if (maxE > 0 && minE > 0) {
    const rise = maxE - minE;
    const bboxWidthM = turf.distance(
      turf.point([bboxArr[0], bboxArr[1]]),
      turf.point([bboxArr[2], bboxArr[1]]),
      { units: "meters" }
    );
    const bboxHeightM = turf.distance(
      turf.point([bboxArr[0], bboxArr[1]]),
      turf.point([bboxArr[0], bboxArr[3]]),
      { units: "meters" }
    );
    const run = Math.sqrt(bboxWidthM ** 2 + bboxHeightM ** 2);
    if (run > 0) slopePercent = Math.round((rise / run) * 100 * 100) / 100;
  }

  const totalArea = turf.area(merged);

  const data: ProcessedSiteData = {
    vertices3D,
    edges,
    mergedBoundary: merged,
    parcels,
    refPoint,
    topographyGrid,
    stats: {
      minElevation: Math.round(minE * 100) / 100,
      maxElevation: Math.round(maxE * 100) / 100,
      avgElevation: Math.round(avgE * 100) / 100,
      totalArea: Math.round(totalArea),
      isContiguous: merged.properties?.isContiguous ?? true,
      slopePercent,
    },
  };

  return { data };
}
