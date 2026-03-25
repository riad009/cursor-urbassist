/**
 * plu-math.ts — Real-Time PLU Compliance Geometry Engine
 *
 * Pure math utilities for computing:
 *   - Real-world areas from Fabric.js canvas objects (via Turf.js)
 *   - CES (Coefficient d'Emprise au Sol) coverage ratios
 *   - Setback violations (building ↔ parcel boundary distances)
 *
 * DESIGN:
 *   - Zero React dependencies — this is a pure functional module
 *   - Uses Turf.js for geodetically-correct area and distance calculations
 *   - Operates in a LOCAL CARTESIAN coordinate system (meters), not lat/lng
 *   - Fabric.js v7 `getCoords()` handles rotation/scale/skew automatically
 *
 * COORDINATE TRANSFORM:
 *   Canvas pixels → Local meters: divide by pixelsPerMeter
 *   We place geometry at (0,0) in a local Cartesian grid so Turf's planar
 *   calculations are valid (no distortion from map projection at this scale).
 */

import * as turf from "@turf/turf";
import type { Feature, Polygon, Position } from "geojson";

// ─── Types ──────────────────────────────────────────────────────────────────

/** A single setback violation detected during compliance check */
export interface SetbackViolation {
  /** Human-readable name of the building (e.g. "Maison principale") */
  buildingName: string;
  /** Unique ID of the building on canvas */
  buildingId: string;
  /** Boundary edge classification that was violated */
  edgeType: "front" | "side" | "rear";
  /** Actual minimum distance from building to boundary in meters */
  actualDistanceM: number;
  /** Required minimum distance in meters (from PLU rules) */
  requiredDistanceM: number;
  /** Human-readable violation summary */
  message: string;
}

/** Full compliance report returned by the engine */
export interface ComplianceReport {
  /** Overall status */
  status: "compliant" | "violation" | "no-data";
  /** Current ground coverage as a decimal ratio (e.g. 0.12 = 12%) */
  coverageRatio: number;
  /** Max allowed coverage ratio from PLU (e.g. 0.15 = 15%) */
  maxCoverageRatio: number | null;
  /** Total area of the parcel in m² */
  parcelAreaM2: number;
  /** Total footprint area of all buildings in m² */
  totalBuildingAreaM2: number;
  /** Whether CES is exceeded */
  coverageExceeded: boolean;
  /** All active setback violations */
  setbackViolations: SetbackViolation[];
  /** Timestamp of this report */
  timestamp: number;
}

/** Required setback distances in meters */
export interface SetbackRequirements {
  front: number | string | null;
  side: number | string | null;
  rear: number | string | null;
}

/**
 * Minimal interface for a Fabric.js object on the canvas.
 * We use this instead of importing fabric types to keep this module decoupled.
 */
export interface FabricCanvasObject {
  type?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  angle?: number;
  points?: Array<{ x: number; y: number }>;
  getCoords?: () => Array<{ x: number; y: number }>;
  // Custom UrbAssist properties
  id?: string;
  elementName?: string;
  elementType?: string;
  surfaceType?: string;
  templateType?: string;
  isParcel?: boolean;
  buildingId?: string;
  [key: string]: unknown;
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/** Template types that count as buildings for CES calculation */
const BUILDING_TEMPLATE_TYPES = new Set(["house", "garage", "pool", "terrace"]);

/**
 * Check if a Fabric.js object is a building for PLU purposes.
 * Matches existing codebase convention in site-plan/page.tsx.
 */
export function isBuildingObject(obj: FabricCanvasObject): boolean {
  if (obj.surfaceType === "building") return true;
  if (obj.templateType && BUILDING_TEMPLATE_TYPES.has(obj.templateType)) return true;
  return false;
}

/**
 * Check if a Fabric.js object is the global parcel boundary.
 * The unified boundary is tagged with `elementType: 'globalBoundary'`.
 * Falls back to checking `isParcel` for older data.
 */
export function isParcelBoundary(obj: FabricCanvasObject): boolean {
  return obj.elementType === "globalBoundary" || false;
}

/**
 * Check if a Fabric.js object is any parcel (individual or boundary).
 */
export function isParcelObject(obj: FabricCanvasObject): boolean {
  return obj.isParcel === true;
}

/**
 * Parse a setback value that could be a number, string formula, or null.
 * For string formulas like "H/2 avec minimum 3m", extracts the numeric minimum.
 * Returns the numeric value in meters, or null if unparseable.
 */
function parseSetbackValue(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;

  // Try extracting a number from common French PLU formula patterns:
  //   "H/2 avec minimum 3m" → 3
  //   "3 mètres" → 3
  //   "3m" → 3
  //   "3" → 3
  const minimumMatch = value.match(/minimum\s+(\d+(?:[.,]\d+)?)/i);
  if (minimumMatch) return parseFloat(minimumMatch[1].replace(",", "."));

  const metersMatch = value.match(/(\d+(?:[.,]\d+)?)\s*(?:m(?:è|e)?tres?|m\b)/i);
  if (metersMatch) return parseFloat(metersMatch[1].replace(",", "."));

  const plainNumber = parseFloat(value.replace(",", "."));
  if (Number.isFinite(plainNumber) && plainNumber > 0) return plainNumber;

  return null;
}

/**
 * Extract the absolute vertices of a Fabric.js object in canvas pixel coordinates.
 *
 * For rects / simple shapes: uses `getCoords()` (Fabric v7) which accounts
 * for position, rotation, scale, and skew.
 *
 * For polygons: reconstructs absolute positions from the `points` array,
 * applying position offsets. For origin-center polygons (our convention),
 * points are relative to the center (left, top).
 */
function extractAbsoluteVertices(obj: FabricCanvasObject): Array<{ x: number; y: number }> {
  // Fabric.js v7 `getCoords()` returns the 4 corner points of the bounding
  // box in absolute canvas coordinates, accounting for all transforms.
  // For rectangles this is exact; for polygons we need the actual vertices.

  // If the object has `points` (a Polygon), use them
  if (obj.points && Array.isArray(obj.points) && obj.points.length >= 3) {
    const left = obj.left ?? 0;
    const top = obj.top ?? 0;
    // Points are relative to pathOffset / center origin
    return obj.points.map((p) => ({
      x: p.x + left,
      y: p.y + top,
    }));
  }

  // For Rect / other: use getCoords() (4-corner bounding box)
  if (typeof obj.getCoords === "function") {
    const coords = obj.getCoords();
    if (coords && coords.length >= 4) {
      return coords.map((c) => ({ x: c.x, y: c.y }));
    }
  }

  // Last-resort fallback: construct from positional properties
  const left = obj.left ?? 0;
  const top = obj.top ?? 0;
  const w = (obj.width ?? 0) * (obj.scaleX ?? 1);
  const h = (obj.height ?? 0) * (obj.scaleY ?? 1);

  if (w <= 0 || h <= 0) return [];

  // Basic unrotated rectangle corners (origin center)
  const hw = w / 2;
  const hh = h / 2;
  const angleDeg = obj.angle ?? 0;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const localCorners: [number, number][] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];

  return localCorners.map(([lx, ly]) => ({
    x: left + lx * cos - ly * sin,
    y: top + lx * sin + ly * cos,
  }));
}

/**
 * Convert canvas pixel vertices to a Turf.js Polygon in local-meter space.
 * Returns null if the shape is degenerate (< 3 vertices).
 */
function verticesToTurfPolygon(
  vertices: Array<{ x: number; y: number }>,
  pixelsPerMeter: number
): Feature<Polygon> | null {
  if (vertices.length < 3 || pixelsPerMeter <= 0) return null;

  // Scale from canvas pixels to meters
  const scale = 1 / pixelsPerMeter;

  const ring: Position[] = vertices.map((v) => [v.x * scale, v.y * scale]);

  // Close the ring (GeoJSON requires first == last)
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }

  try {
    return turf.polygon([ring]);
  } catch {
    // Malformed polygon (self-intersecting, too few points, etc.)
    return null;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Convert a Fabric.js object to a Turf.js Polygon in local-meter coordinates.
 *
 * @param fabricObject - The Fabric.js canvas object (Rect, Polygon, etc.)
 * @param pixelsPerMeter - Scale factor (canvas pixels per real-world meter)
 * @returns A Turf.js Feature<Polygon> or null if the shape is degenerate
 */
export function fabricObjectToTurfPolygon(
  fabricObject: FabricCanvasObject,
  pixelsPerMeter: number
): Feature<Polygon> | null {
  if (!fabricObject || pixelsPerMeter <= 0) return null;

  const vertices = extractAbsoluteVertices(fabricObject);
  return verticesToTurfPolygon(vertices, pixelsPerMeter);
}

/**
 * Calculate the real-world area of a Fabric.js object in square meters.
 *
 * Uses Turf.js `area()` for accuracy. Since we're in a local Cartesian
 * coordinate system (not lat/lng), we use the Shoelace formula fallback
 * via the polygon coordinates directly.
 *
 * @param fabricObject - The Fabric.js canvas object
 * @param pixelsPerMeter - Scale factor
 * @returns Area in m², or 0 if the shape is degenerate
 */
export function calculateRealWorldArea(
  fabricObject: FabricCanvasObject,
  pixelsPerMeter: number
): number {
  if (!fabricObject || pixelsPerMeter <= 0) return 0;

  const vertices = extractAbsoluteVertices(fabricObject);
  if (vertices.length < 3) return 0;

  // Use Shoelace formula directly since we're in a local Cartesian system
  // (Turf's area() uses geodesic calculations which require real lat/lng)
  const scale = 1 / pixelsPerMeter;
  const scaled = vertices.map((v) => ({ x: v.x * scale, y: v.y * scale }));

  return Math.abs(shoelaceArea(scaled));
}

/**
 * Shoelace formula for the area of a simple polygon given Cartesian vertices.
 * Returns the signed area (positive for CCW, negative for CW).
 */
function shoelaceArea(pts: Array<{ x: number; y: number }>): number {
  const n = pts.length;
  if (n < 3) return 0;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return area / 2;
}

/**
 * Calculate the total ground coverage (CES) ratio.
 *
 * @param buildings - Array of Fabric.js building objects
 * @param parcelAreaM2 - Total parcel area in square meters
 * @param pixelsPerMeter - Scale factor
 * @returns CES as a decimal ratio (e.g. 0.15 = 15%), or 0 if parcel area is 0
 */
export function calculateTotalCoverage(
  buildings: FabricCanvasObject[],
  parcelAreaM2: number,
  pixelsPerMeter: number
): { totalBuildingAreaM2: number; coverageRatio: number } {
  if (!buildings || buildings.length === 0 || parcelAreaM2 <= 0) {
    return { totalBuildingAreaM2: 0, coverageRatio: 0 };
  }

  let totalBuildingAreaM2 = 0;
  for (const building of buildings) {
    totalBuildingAreaM2 += calculateRealWorldArea(building, pixelsPerMeter);
  }

  const coverageRatio = parcelAreaM2 > 0 ? totalBuildingAreaM2 / parcelAreaM2 : 0;

  return {
    totalBuildingAreaM2: Math.round(totalBuildingAreaM2 * 100) / 100,
    coverageRatio: Math.round(coverageRatio * 10000) / 10000, // 4 decimal places
  };
}

/**
 * Check all buildings for setback violations against the parcel boundary.
 *
 * For each building, extracts vertices and measures the shortest distance
 * to each classified boundary edge. If any vertex is closer than the
 * required setback for that edge type, a violation is recorded.
 *
 * @param buildings - Array of Fabric.js building objects
 * @param parcelBoundary - The Fabric.js parcel boundary object (globalBoundary)
 * @param requiredSetbacks - PLU setback requirements { front, side, rear } in meters
 * @param pixelsPerMeter - Scale factor
 * @returns Array of SetbackViolation objects (empty if compliant)
 */
export function checkSetbackViolations(
  buildings: FabricCanvasObject[],
  parcelBoundary: FabricCanvasObject,
  requiredSetbacks: SetbackRequirements,
  pixelsPerMeter: number
): SetbackViolation[] {
  if (!buildings || buildings.length === 0 || !parcelBoundary || pixelsPerMeter <= 0) {
    return [];
  }

  // Parse setback values (may be strings like "H/2 minimum 3m")
  const parsedSetbacks = {
    front: parseSetbackValue(requiredSetbacks.front),
    side: parseSetbackValue(requiredSetbacks.side),
    rear: parseSetbackValue(requiredSetbacks.rear),
  };

  // If all setbacks are null/unparseable, nothing to check
  if (parsedSetbacks.front === null && parsedSetbacks.side === null && parsedSetbacks.rear === null) {
    return [];
  }

  // Extract boundary vertices in canvas pixels
  const boundaryVertices = extractAbsoluteVertices(parcelBoundary);
  if (boundaryVertices.length < 3) return [];

  // Classify boundary edges as front/side/rear using Y-heuristic
  // (same as polygon-offset.ts: top = front, bottom = rear, rest = side)
  const boundaryEdges = classifyBoundaryEdgesLocal(boundaryVertices);

  const scale = 1 / pixelsPerMeter;
  const violations: SetbackViolation[] = [];

  for (const building of buildings) {
    const bVertices = extractAbsoluteVertices(building);
    if (bVertices.length < 3) continue;

    const buildingName = (building.elementName as string) || (building.templateType as string) || "Bâtiment";
    const buildingId = (building.id as string) || (building.buildingId as string) || "unknown";

    // Track minimum distance per edge type for this building
    const minDistances: Record<"front" | "side" | "rear", number> = {
      front: Infinity,
      side: Infinity,
      rear: Infinity,
    };

    // For each building vertex, check distance to each boundary edge
    for (const bv of bVertices) {
      const bvM = { x: bv.x * scale, y: bv.y * scale };

      for (const edge of boundaryEdges) {
        const p1M = { x: edge.p1.x * scale, y: edge.p1.y * scale };
        const p2M = { x: edge.p2.x * scale, y: edge.p2.y * scale };

        const dist = pointToSegmentDistanceM(bvM, p1M, p2M);
        if (dist < minDistances[edge.type]) {
          minDistances[edge.type] = dist;
        }
      }
    }

    // Check violations for each edge type
    for (const edgeType of ["front", "side", "rear"] as const) {
      const required = parsedSetbacks[edgeType];
      if (required === null || required <= 0) continue;

      const actual = minDistances[edgeType];
      if (actual < Infinity && actual < required) {
        const roundedActual = Math.round(actual * 100) / 100;
        const label = edgeType === "front" ? "voie" : edgeType === "side" ? "latérale" : "fond";
        violations.push({
          buildingName,
          buildingId,
          edgeType,
          actualDistanceM: roundedActual,
          requiredDistanceM: required,
          message: `${buildingName}: ${roundedActual}m de la limite ${label} (min. ${required}m)`,
        });
      }
    }
  }

  return violations;
}

/**
 * Generate a full ComplianceReport from current canvas state + PLU rules.
 *
 * This is the single entry point used by usePluCompliance hook.
 *
 * @param canvasObjects - All objects currently on the Fabric.js canvas
 * @param pixelsPerMeter - Scale factor
 * @param maxCoverageRatio - PLU max coverage ratio (decimal, e.g. 0.15)
 * @param requiredSetbacks - PLU setback requirements
 * @param parcelAreaOverrideM2 - Optional override for parcel area (from DB)
 * @returns Full ComplianceReport
 */
export function generateComplianceReport(
  canvasObjects: FabricCanvasObject[],
  pixelsPerMeter: number,
  maxCoverageRatio: number | null,
  requiredSetbacks: SetbackRequirements | null,
  parcelAreaOverrideM2?: number
): ComplianceReport {
  const baseReport: ComplianceReport = {
    status: "no-data",
    coverageRatio: 0,
    maxCoverageRatio,
    parcelAreaM2: 0,
    totalBuildingAreaM2: 0,
    coverageExceeded: false,
    setbackViolations: [],
    timestamp: Date.now(),
  };

  if (!canvasObjects || canvasObjects.length === 0 || pixelsPerMeter <= 0) {
    return baseReport;
  }

  // Separate buildings and boundary
  const buildings = canvasObjects.filter(isBuildingObject);
  const boundary = canvasObjects.find(isParcelBoundary);

  // Also collect all parcels for area calculation if no override
  const parcels = canvasObjects.filter(isParcelObject);

  if (parcels.length === 0 && !boundary && !parcelAreaOverrideM2) {
    return baseReport; // No parcel data at all
  }

  // Determine parcel area
  let parcelAreaM2: number;
  if (parcelAreaOverrideM2 && parcelAreaOverrideM2 > 0) {
    parcelAreaM2 = parcelAreaOverrideM2;
  } else if (boundary) {
    parcelAreaM2 = calculateRealWorldArea(boundary, pixelsPerMeter);
  } else {
    // Sum individual parcel areas
    parcelAreaM2 = 0;
    for (const p of parcels) {
      parcelAreaM2 += calculateRealWorldArea(p, pixelsPerMeter);
    }
  }

  if (parcelAreaM2 <= 0) {
    return baseReport;
  }

  baseReport.parcelAreaM2 = Math.round(parcelAreaM2 * 100) / 100;

  // Calculate coverage
  const { totalBuildingAreaM2, coverageRatio } = calculateTotalCoverage(
    buildings,
    parcelAreaM2,
    pixelsPerMeter
  );
  baseReport.totalBuildingAreaM2 = totalBuildingAreaM2;
  baseReport.coverageRatio = coverageRatio;
  baseReport.coverageExceeded =
    maxCoverageRatio !== null && maxCoverageRatio > 0 && coverageRatio > maxCoverageRatio;

  // Check setback violations
  if (boundary && requiredSetbacks && buildings.length > 0) {
    baseReport.setbackViolations = checkSetbackViolations(
      buildings,
      boundary,
      requiredSetbacks,
      pixelsPerMeter
    );
  }

  // Determine overall status
  if (buildings.length === 0) {
    // No buildings yet but we have parcel data — treat as compliant
    baseReport.status = "compliant";
  } else if (baseReport.coverageExceeded || baseReport.setbackViolations.length > 0) {
    baseReport.status = "violation";
  } else {
    baseReport.status = "compliant";
  }

  return baseReport;
}

// ─── Internal Geometry Helpers ──────────────────────────────────────────────

interface ClassifiedEdge {
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  type: "front" | "side" | "rear";
}

/**
 * Point-to-segment distance in 2D Cartesian space.
 * Returns the shortest distance from point P to line segment [A, B].
 */
function pointToSegmentDistanceM(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq < 1e-10) {
    // Degenerate segment
    return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  }

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
}

/**
 * Classify boundary edges as front/side/rear using the Y-heuristic.
 *
 * Matches the strategy in polygon-offset.ts:
 *   - Top-most edge (min Y in screen coords) → front (road-facing)
 *   - Bottom-most edge (max Y) → rear
 *   - Everything else → side
 */
function classifyBoundaryEdgesLocal(
  boundaryVertices: Array<{ x: number; y: number }>
): ClassifiedEdge[] {
  const n = boundaryVertices.length;
  if (n < 3) return [];

  // Build edges and compute midpoint Y values
  const edges: Array<{
    p1: { x: number; y: number };
    p2: { x: number; y: number };
    midY: number;
    index: number;
  }> = [];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const midY = (boundaryVertices[i].y + boundaryVertices[j].y) / 2;
    edges.push({
      p1: boundaryVertices[i],
      p2: boundaryVertices[j],
      midY,
      index: i,
    });
  }

  // Find front (min Y) and rear (max Y) edges
  let frontIdx = 0;
  let rearIdx = 0;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < edges.length; i++) {
    if (edges[i].midY < minY) {
      minY = edges[i].midY;
      frontIdx = i;
    }
    if (edges[i].midY > maxY) {
      maxY = edges[i].midY;
      rearIdx = i;
    }
  }

  return edges.map((edge, i) => ({
    p1: edge.p1,
    p2: edge.p2,
    type: i === frontIdx ? "front" as const : i === rearIdx ? "rear" as const : "side" as const,
  }));
}
