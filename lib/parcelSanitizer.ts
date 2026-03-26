/**
 * parcelSanitizer.ts — Production-Grade GeoJSON Parcel Sanitizer
 *
 * Extracts ONLY the primary parcel boundary from noisy cadastral data.
 * Guarantees exactly ONE clean Polygon ring — no neighboring plots, road
 * LineStrings, Point markers, or auxiliary features bleed through.
 *
 * Mandate 1: Kill the "Trash Lines"
 * Mandate 3: All objects tagged with surfaceType for PLU engine compliance.
 */

import * as fabric from "fabric";
import type {
  Feature,
  FeatureCollection,
  Geometry,
  Polygon,
  MultiPolygon,
  GeoJsonProperties,
} from "geojson";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedParcel {
  /** Closed [lng, lat] ring of the primary boundary exterior shell */
  ring: [number, number][];
  /** Approximate area in square degrees (for debug / sanity check) */
  approxAreaDeg2: number;
  /** Centroid [lng, lat] */
  centroid: [number, number];
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/** Minimum bounding-box area in deg² to consider a ring valid (≈ 1 m²) */
const MIN_AREA_DEG2 = 1e-12;

/** Minimum number of vertices for a valid polygon ring (GeoJSON spec) */
const MIN_RING_VERTICES = 4; // first == last → 3 unique points

/**
 * Compute bbox area in deg² as a fast proxy for ring size.
 * Much cheaper than Shoelace, and sufficient for ranking rings.
 */
function bboxAreaDeg2(ring: [number, number][]): number {
  let minLng = Infinity, maxLng = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return (maxLng - minLng) * (maxLat - minLat);
}

/**
 * Validate and normalize a ring:
 * - Must have ≥ MIN_RING_VERTICES points
 * - Must have finite coordinates
 * - Closes the ring if not already (first == last)
 */
function normalizeRing(raw: number[][]): [number, number][] | null {
  if (!raw || raw.length < 3) return null;

  const ring: [number, number][] = [];
  for (const c of raw) {
    const lng = Number(c[0]);
    const lat = Number(c[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    ring.push([lng, lat]);
  }

  if (ring.length < 3) return null;

  // Ensure closure (first == last)
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }

  if (ring.length < MIN_RING_VERTICES) return null;
  return ring;
}

/**
 * Extract exterior rings from a Polygon or MultiPolygon geometry ONLY.
 * Explicitly rejects LineString, Point, GeometryCollection, and any
 * other non-polygon geometry type.
 */
function collectPolygonRings(geom: Geometry): [number, number][][] {
  const rings: [number, number][][] = [];

  if (geom.type === "Polygon") {
    const ring = normalizeRing(geom.coordinates[0] as number[][]);
    if (ring) rings.push(ring);
  } else if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates) {
      const ring = normalizeRing(poly[0] as number[][]);
      if (ring) rings.push(ring);
    }
  }
  // LineString, MultiLineString, Point, MultiPoint, GeometryCollection
  // → silently rejected (no rings collected)

  return rings;
}

// ─── Core Sanitizer ──────────────────────────────────────────────────────────

/**
 * parsePrimaryParcel — Extract the single largest parcel boundary.
 *
 * Handles any GeoJSON shape: Feature, FeatureCollection, bare Polygon/MultiPolygon.
 *
 * Algorithm:
 *  1. Normalize input → collect all valid exterior rings from Polygon/MultiPolygon only.
 *  2. Reject LineString, Point, GeometryCollection features entirely.
 *  3. Filter out rings below minimum area threshold (noise polygons).
 *  4. Select the ring with the LARGEST bbox area → primary parcel.
 *  5. Compute centroid from the winning ring.
 */
export function parsePrimaryParcel(raw: unknown): ParsedParcel | null {
  if (!raw || typeof raw !== "object") return null;

  const geo = raw as Record<string, unknown>;
  const rings: [number, number][][] = [];

  // Dispatch based on GeoJSON type
  if (geo.type === "FeatureCollection") {
    const features = (geo as unknown as FeatureCollection).features;
    if (Array.isArray(features)) {
      for (const f of features) {
        if (f.geometry) rings.push(...collectPolygonRings(f.geometry));
      }
    }
  } else if (geo.type === "Feature") {
    const f = geo as unknown as Feature;
    if (f.geometry) rings.push(...collectPolygonRings(f.geometry));
  } else if (geo.type === "Polygon" || geo.type === "MultiPolygon") {
    rings.push(...collectPolygonRings(geo as unknown as Polygon | MultiPolygon));
  }

  if (rings.length === 0) return null;

  // Score each ring by bbox area and filter noise
  const scored = rings
    .map((ring) => ({ ring, area: bboxAreaDeg2(ring) }))
    .filter((r) => r.area > MIN_AREA_DEG2);

  if (scored.length === 0) return null;

  // Pick the largest ring — this is the primary parcel boundary
  scored.sort((a, b) => b.area - a.area);
  const primary = scored[0];

  // Compute centroid
  const n = primary.ring.length - 1; // exclude closing vertex
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) {
    cx += primary.ring[i][0];
    cy += primary.ring[i][1];
  }
  cx /= n;
  cy /= n;

  return {
    ring: primary.ring,
    approxAreaDeg2: primary.area,
    centroid: [cx, cy],
  };
}

// ─── Fabric.js Adapter ────────────────────────────────────────────────────────

interface FabricAdapterOptions {
  /** Pixels per metre (current 2D scale) */
  pixelsPerMeter: number;
  /** Canvas centre as an absolute canvas coordinate anchor */
  canvasCenterX: number;
  canvasCenterY: number;
  /** Metres per degree longitude at the parcel's latitude */
  metersPerDegLng: number;
  /** Metres per degree latitude (constant ≈ 111 320) */
  metersPerDegLat: number;
  /** Stroke colour for the boundary ring */
  strokeColor?: string;
}

/**
 * createFabricParcelBoundary — Single clean fabric.Polygon
 *
 * Converts a ParsedParcel to a SINGLE `fabric.Polygon` tagged strictly
 * as a non-selectable, non-evented boundary layer. The PLU engine finds
 * it via `elementType === 'globalBoundary'` and `isParcel === true`.
 *
 * Uses bbox-centered points so `left`/`top` anchor the polygon correctly
 * without Fabric.js pathOffset drift.
 */
export function createFabricParcelBoundary(
  parcel: ParsedParcel,
  opts: FabricAdapterOptions
): fabric.Polygon {
  const {
    pixelsPerMeter,
    canvasCenterX,
    canvasCenterY,
    metersPerDegLng,
    metersPerDegLat,
    strokeColor = "#10b981",
  } = opts;

  const [refLng, refLat] = parcel.centroid;

  // Project each ring point from (lng, lat) → absolute canvas (px, py)
  const absPoints = parcel.ring.map(([lng, lat]) => {
    const dx = (lng - refLng) * metersPerDegLng * pixelsPerMeter;
    const dy = -(lat - refLat) * metersPerDegLat * pixelsPerMeter;
    return { x: canvasCenterX + dx, y: canvasCenterY + dy };
  });

  // Compute bbox center — Fabric.js uses this as the internal pathOffset
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of absPoints) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const bboxCenterX = (minX + maxX) / 2;
  const bboxCenterY = (minY + maxY) / 2;

  // Center points around bbox center so Fabric.js left/top = bbox center
  const points = absPoints.map((p) => ({
    x: p.x - bboxCenterX,
    y: p.y - bboxCenterY,
  }));

  const poly = new fabric.Polygon(points, {
    left: bboxCenterX,
    top: bboxCenterY,
    fill: "rgba(16, 185, 129, 0.06)",
    stroke: strokeColor,
    strokeWidth: 2,
    strokeDashArray: [6, 4],
    selectable: false,
    evented: false,
    hasBorders: false,
    hasControls: false,
    originX: "center",
    originY: "center",
  });

  // Mandatory tags (Mandate 3: PLU engine + parcel detection)
  poly.set({
    id: "parcel_boundary",
    surfaceType: "boundary",
    excludeFromExport: false,
    isParcel: true,
    elementType: "globalBoundary",
    elementName: "Limite de propriété",
  } as any);

  return poly;
}
