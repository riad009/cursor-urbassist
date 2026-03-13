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
  stats: {
    minElevation: number;
    maxElevation: number;
    avgElevation: number;
    totalArea: number;
    isContiguous: boolean;
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
 *  6. Return the assembled ProcessedSiteData
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

  // ── Step 6: Compute stats ──
  const validElevations = elevations.filter((e) => e !== 0 && Number.isFinite(e));
  const minE = validElevations.length > 0 ? Math.min(...validElevations) : 0;
  const maxE = validElevations.length > 0 ? Math.max(...validElevations) : 0;
  const avgE =
    validElevations.length > 0
      ? validElevations.reduce((a, b) => a + b, 0) / validElevations.length
      : 0;

  const totalArea = turf.area(merged);

  const data: ProcessedSiteData = {
    vertices3D,
    edges,
    mergedBoundary: merged,
    parcels,
    stats: {
      minElevation: Math.round(minE * 100) / 100,
      maxElevation: Math.round(maxE * 100) / 100,
      avgElevation: Math.round(avgE * 100) / 100,
      totalArea: Math.round(totalArea),
      isContiguous: merged.properties?.isContiguous ?? true,
    },
  };

  return { data };
}
