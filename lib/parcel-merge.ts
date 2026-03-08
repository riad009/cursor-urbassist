/**
 * Parcel geometric merge utility.
 * Uses Turf.js to compute the geometric union of multiple parcel polygons.
 *
 * Production-hardened:
 *  - Ring closure guard (coords[0] ≡ coords[last])
 *  - Minimum coordinate validation (≥ 4 for polygons)
 *  - Winding order normalization via turf.rewind (RFC 7946)
 *  - Self-intersection repair via turf.unkinkPolygon
 *  - Contiguity flag on merged result
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

export interface MergeResult extends Feature<Polygon | MultiPolygon, GeoJsonProperties> {
  properties: GeoJsonProperties & {
    /** true if all parcels share a boundary, false if any are disjointed */
    isContiguous?: boolean;
    /** IDs of parcels that could not be merged due to geometry errors */
    failedParcelIds?: string[];
  };
}

// ─── GeoJSON Sanitization ────────────────────────────────────────────────────

/**
 * Ensure a coordinate ring is closed (first point === last point).
 * Mutates the array in place for performance.
 */
function closeRing(ring: number[][]): number[][] {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([...first]);
  }
  return ring;
}

/**
 * Sanitize a polygon's coordinates:
 *  1. Close all rings
 *  2. Validate minimum coordinate count (≥ 4 per ring)
 *  3. Normalize winding order (RFC 7946: outer=CCW, holes=CW)
 *
 * Returns null if the polygon is degenerate and cannot be repaired.
 */
function sanitizePolygonCoords(coordinates: number[][][]): Feature<Polygon> | null {
  if (!coordinates || coordinates.length === 0) return null;

  const sanitizedRings: number[][][] = [];
  for (const ring of coordinates) {
    const closed = closeRing([...ring.map((c) => [...c])]);
    // A valid polygon ring needs at least 4 coordinates (3 unique + closing)
    if (closed.length < 4) return null;
    sanitizedRings.push(closed);
  }

  try {
    const feature = turf.polygon(sanitizedRings);
    // Normalize winding order per RFC 7946
    return turf.rewind(feature, { reverse: false }) as Feature<Polygon>;
  } catch (e) {
    console.warn("sanitizePolygonCoords: failed to create/rewind polygon:", e);
    return null;
  }
}

/**
 * Sanitize a MultiPolygon's coordinates.
 */
function sanitizeMultiPolygonCoords(coordinates: number[][][][]): Feature<MultiPolygon> | null {
  if (!coordinates || coordinates.length === 0) return null;

  const polygons: Feature<Polygon>[] = [];
  for (const polyCoords of coordinates) {
    const sanitized = sanitizePolygonCoords(polyCoords);
    if (sanitized) polygons.push(sanitized);
  }

  if (polygons.length === 0) return null;
  if (polygons.length === 1) {
    // Return as MultiPolygon for consistency
    return turf.multiPolygon([polygons[0].geometry.coordinates]);
  }

  try {
    const coords = polygons.map((p) => p.geometry.coordinates);
    const feature = turf.multiPolygon(coords);
    return turf.rewind(feature, { reverse: false }) as Feature<MultiPolygon>;
  } catch (e) {
    console.warn("sanitizeMultiPolygonCoords: failed:", e);
    return null;
  }
}

/**
 * Attempt to repair self-intersecting polygons using turf.unkinkPolygon.
 * Returns the original feature if no self-intersections found or repair fails.
 */
function repairSelfIntersections(
  feature: Feature<Polygon | MultiPolygon>
): Feature<Polygon | MultiPolygon> {
  try {
    if (feature.geometry.type === "Polygon") {
      const unkinked = turf.unkinkPolygon(feature as Feature<Polygon>);
      if (unkinked.features.length <= 1) return feature; // No self-intersections
      // Merge the unkinked fragments back together
      let merged: Feature<Polygon | MultiPolygon> = unkinked.features[0] as Feature<Polygon>;
      for (let i = 1; i < unkinked.features.length; i++) {
        const result = turf.union(
          turf.featureCollection([merged, unkinked.features[i] as Feature<Polygon>])
        );
        if (result) merged = result as Feature<Polygon | MultiPolygon>;
      }
      return merged;
    }
    // For MultiPolygon, repair each polygon individually
    if (feature.geometry.type === "MultiPolygon") {
      const repaired: Feature<Polygon>[] = [];
      for (const coords of feature.geometry.coordinates) {
        const poly = turf.polygon(coords);
        const fixed = repairSelfIntersections(poly);
        if (fixed.geometry.type === "Polygon") {
          repaired.push(fixed as Feature<Polygon>);
        } else {
          for (const c of (fixed as Feature<MultiPolygon>).geometry.coordinates) {
            repaired.push(turf.polygon(c));
          }
        }
      }
      if (repaired.length === 1) return repaired[0];
      let result: Feature<Polygon | MultiPolygon> = repaired[0];
      for (let i = 1; i < repaired.length; i++) {
        const u = turf.union(turf.featureCollection([result, repaired[i]]));
        if (u) result = u as Feature<Polygon | MultiPolygon>;
      }
      return result;
    }
  } catch {
    // Repair failed — return original
  }
  return feature;
}

/**
 * Convert a ParcelGeometry to a sanitized, repair-ready Turf feature.
 * Returns null if the geometry is invalid or degenerate.
 */
function parcelToFeature(p: ParcelGeometry): Feature<Polygon | MultiPolygon> | null {
  if (!p.geometry) return null;
  const { type, coordinates } = p.geometry;

  let feature: Feature<Polygon | MultiPolygon> | null = null;

  if (type === "Polygon" && coordinates) {
    feature = sanitizePolygonCoords(coordinates as number[][][]);
  } else if (type === "MultiPolygon" && coordinates) {
    feature = sanitizeMultiPolygonCoords(coordinates as number[][][][]);
  }

  if (!feature) return null;

  // Attempt self-intersection repair (French cadastral data can have bowties)
  feature = repairSelfIntersections(feature);
  feature.properties = { id: p.id };

  return feature;
}

// ─── Core Merge Logic ────────────────────────────────────────────────────────

/**
 * Merge multiple parcel geometries into a single polygon/multipolygon.
 * Uses Turf.js union for robust polygon boolean operations.
 *
 * Production-hardened:
 *  - Sanitizes all input geometries (ring closure, winding, min coords)
 *  - Repairs self-intersecting cadastral polygons
 *  - Tracks failed parcels and contiguity
 *
 * @param parcels - Array of parcels with GeoJSON geometry
 * @returns Merged feature with metadata, or null if no valid geometries
 */
export function mergeParcelGeometries(
  parcels: ParcelGeometry[]
): MergeResult | null {
  const validFeatures: Feature<Polygon | MultiPolygon>[] = [];
  const failedParcelIds: string[] = [];

  for (const p of parcels) {
    const feature = parcelToFeature(p);
    if (feature) {
      validFeatures.push(feature);
    } else if (p.geometry) {
      // Had geometry but it was invalid/degenerate
      failedParcelIds.push(p.id);
      console.warn(`Parcel ${p.id}: geometry rejected (degenerate or invalid GeoJSON)`);
    }
  }

  if (validFeatures.length === 0) return null;
  if (validFeatures.length === 1) {
    const single = validFeatures[0] as MergeResult;
    const mergedArea = turf.area(single);
    single.properties = {
      id: parcels[0]?.id ?? "unknown",
      section: parcels[0]?.section ?? "",
      number: parcels[0]?.number ?? "",
      area: Math.round(mergedArea),
      merged: false,
      sourceParcelIds: [parcels[0]?.id].filter(Boolean),
      sourceCount: 1,
      isContiguous: true,
      failedParcelIds,
    };
    return single;
  }

  // Progressive union of all features
  let merged: Feature<Polygon | MultiPolygon> = validFeatures[0];
  for (let i = 1; i < validFeatures.length; i++) {
    try {
      const result = turf.union(
        turf.featureCollection([merged, validFeatures[i]])
      );
      if (result) {
        merged = result as Feature<Polygon | MultiPolygon>;
      } else {
        // union returned null — geometry incompatibility
        failedParcelIds.push(parcels[i]?.id ?? `index-${i}`);
        console.warn(`Parcel ${parcels[i]?.id}: turf.union returned null`);
      }
    } catch (e) {
      failedParcelIds.push(parcels[i]?.id ?? `index-${i}`);
      console.warn(`Failed to merge parcel ${parcels[i]?.id}:`, e);
      // Skip this parcel but continue with others
    }
  }

  // Determine contiguity: if result is a single Polygon, parcels are contiguous
  // If MultiPolygon, some parcels are disjointed
  const isContiguous = merged.geometry.type === "Polygon";

  // Compute merged area and assign properties
  const mergedArea = turf.area(merged);
  const mergeResult = merged as MergeResult;
  mergeResult.properties = {
    id: parcels.map((p) => p.id).join("+"),
    section: parcels.map((p) => p.section).filter(Boolean).join("+"),
    number: "merged",
    area: Math.round(mergedArea),
    merged: true,
    sourceParcelIds: parcels.map((p) => p.id),
    sourceCount: parcels.length,
    isContiguous,
    failedParcelIds,
  };

  return mergeResult;
}

/**
 * Compute the total area of selected parcels (sum of individual areas).
 */
export function computeTotalArea(parcels: ParcelGeometry[]): number {
  return parcels.reduce((sum, p) => sum + (p.area || 0), 0);
}

/**
 * Check if parcels are adjacent (share a boundary or overlap).
 * Uses sanitized features and Turf.js intersect.
 */
export function areAdjacent(a: ParcelGeometry, b: ParcelGeometry): boolean {
  if (!a.geometry || !b.geometry) return false;
  try {
    const fa = parcelToFeature(a);
    const fb = parcelToFeature(b);
    if (!fa || !fb) return false;

    // Check for intersection (shared boundary or overlap)
    const inter = turf.intersect(
      turf.featureCollection([fa, fb])
    );
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
  try {
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
  } catch (e) {
    console.warn("classifyBoundaryEdges: Turf operation failed:", e);
    return [];
  }

  return edges;
}
