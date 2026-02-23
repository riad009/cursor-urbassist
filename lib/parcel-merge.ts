/**
 * Parcel geometric merge utility.
 * Uses Turf.js to compute the geometric union of multiple parcel polygons.
 */
import * as turf from "@turf/turf";
import type { Feature, Polygon, MultiPolygon, GeoJsonProperties } from "geojson";

export interface ParcelGeometry {
  id: string;
  section: string;
  number: string;
  area: number;
  geometry?: {
    type: string;
    coordinates: number[][][] | number[][][][];
  };
  commune?: string;
}

/**
 * Merge multiple parcel geometries into a single polygon/multipolygon.
 * Uses Turf.js union for robust polygon boolean operations.
 *
 * @param parcels - Array of parcels with GeoJSON geometry
 * @returns Merged feature, or null if no valid geometries
 */
export function mergeParcelGeometries(
  parcels: ParcelGeometry[]
): Feature<Polygon | MultiPolygon, GeoJsonProperties> | null {
  // Filter to parcels with valid polygon geometry
  const validFeatures: Feature<Polygon | MultiPolygon>[] = [];

  for (const p of parcels) {
    if (!p.geometry) continue;
    const { type, coordinates } = p.geometry;
    if (type === "Polygon" && coordinates) {
      validFeatures.push(turf.polygon(coordinates as number[][][], { id: p.id }));
    } else if (type === "MultiPolygon" && coordinates) {
      validFeatures.push(turf.multiPolygon(coordinates as number[][][][], { id: p.id }));
    }
  }

  if (validFeatures.length === 0) return null;
  if (validFeatures.length === 1) return validFeatures[0];

  // Progressive union of all features
  let merged: Feature<Polygon | MultiPolygon> = validFeatures[0];
  for (let i = 1; i < validFeatures.length; i++) {
    try {
      const result = turf.union(
        turf.featureCollection([merged, validFeatures[i]])
      );
      if (result) {
        merged = result as Feature<Polygon | MultiPolygon>;
      }
    } catch (e) {
      console.warn(`Failed to merge parcel ${parcels[i]?.id}:`, e);
      // Skip this parcel but continue with others
    }
  }

  // Compute merged area and assign properties
  const mergedArea = turf.area(merged);
  merged.properties = {
    id: parcels.map((p) => p.id).join("+"),
    section: parcels.map((p) => p.section).filter(Boolean).join("+"),
    number: "merged",
    area: Math.round(mergedArea),
    merged: true,
    sourceParcelIds: parcels.map((p) => p.id),
    sourceCount: parcels.length,
  };

  return merged;
}

/**
 * Compute the total area of selected parcels (sum of individual areas).
 */
export function computeTotalArea(parcels: ParcelGeometry[]): number {
  return parcels.reduce((sum, p) => sum + (p.area || 0), 0);
}

/**
 * Check if parcels are adjacent (share a boundary or overlap).
 * Uses Turf.js booleanOverlap and booleanTouches.
 */
export function areAdjacent(a: ParcelGeometry, b: ParcelGeometry): boolean {
  if (!a.geometry || !b.geometry) return false;
  try {
    const fa = a.geometry.type === "Polygon"
      ? turf.polygon(a.geometry.coordinates as number[][][])
      : turf.multiPolygon(a.geometry.coordinates as number[][][][]);
    const fb = b.geometry.type === "Polygon"
      ? turf.polygon(b.geometry.coordinates as number[][][])
      : turf.multiPolygon(b.geometry.coordinates as number[][][][]);

    // Check for intersection (shared boundary or overlap)
    const inter = turf.intersect(turf.featureCollection([fa, fb]));
    return inter !== null;
  } catch {
    return false;
  }
}

/**
 * Classify parcel boundary edges relative to roads and neighboring parcels.
 * Returns categorized edges: front (road-facing), side, rear.
 */
export interface BoundaryEdge {
  type: "front" | "side-left" | "side-right" | "rear";
  startPoint: [number, number];
  endPoint: [number, number];
  length: number; // in meters
}

export function classifyBoundaryEdges(
  parcelGeometry: { type: string; coordinates: number[][][] | number[][][][] },
  roadBearing?: number // bearing from parcel center to nearest road in degrees
): BoundaryEdge[] {
  if (!parcelGeometry || parcelGeometry.type !== "Polygon") return [];

  const coords = parcelGeometry.coordinates[0] as number[][];
  if (coords.length < 4) return []; // Need at least 3 points + closing point

  const edges: BoundaryEdge[] = [];
  const center = turf.centroid(turf.polygon(parcelGeometry.coordinates as number[][][]));
  const [cx, cy] = center.geometry.coordinates;

  // Default road direction: south (bearing ~180°)
  const roadDir = roadBearing ?? 180;

  for (let i = 0; i < coords.length - 1; i++) {
    const start = coords[i] as [number, number];
    const end = coords[i + 1] as [number, number];
    const midLng = (start[0] + end[0]) / 2;
    const midLat = (start[1] + end[1]) / 2;

    // Bearing from center to edge midpoint
    const edgeBearing = turf.bearing(turf.point([cx, cy]), turf.point([midLng, midLat]));
    const length = turf.distance(turf.point(start), turf.point(end), { units: "meters" });

    // Classify based on bearing difference from road direction
    const diff = Math.abs(((edgeBearing - roadDir + 540) % 360) - 180);

    let type: BoundaryEdge["type"];
    if (diff < 45) {
      type = "front";
    } else if (diff > 135) {
      type = "rear";
    } else {
      // Determine left/right based on cross product
      const crossProduct = (end[0] - start[0]) * (cy - start[1]) - (end[1] - start[1]) * (cx - start[0]);
      type = crossProduct > 0 ? "side-left" : "side-right";
    }

    edges.push({ type, startPoint: start, endPoint: end, length });
  }

  return edges;
}
