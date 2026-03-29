/**
 * projectToCanvas — The "No Offset" Fix (v2 — with per-parcel edge labels)
 *
 * Projects ProcessedSiteData from WGS84 (lng/lat) to canvas pixel coordinates.
 *
 * THE KEY INSIGHT:
 *   A single refPoint (bbox center of globalBoundary) serves as the master
 *   anchor mapped to canvas center (0,0). EVERY point of EVERY parcel is
 *   projected relative to this single anchor, mathematically guaranteeing
 *   zero offset and perfect puzzle-piece alignment.
 *
 * v2 additions:
 *   - Per-parcel edge measurements (dimension labels for each parcel boundary)
 *   - Absolute canvas points stored in ProjectedParcel for dimension line rendering
 *   - Handles both Polygon and MultiPolygon parcel geometries
 *
 * Uses standard Mercator approximation (valid for cadastral-scale areas):
 *   mx = Δlng × 111320 × cos(refLat)
 *   my = Δlat × 111320
 */

import type {
  ProcessedSiteData,
  CanvasPoint,
  CanvasProjectionOptions,
  ProjectedPolygon,
  ProjectedParcel,
  ProjectedEdgeLabel,
  ProjectedVertexLabel,
  ProjectedSiteData,
  ProjectedParcelEdgeLabel,
} from "@/types/processed-site-data";

// ─── Constants ───────────────────────────────────────────────────────────────

const METERS_PER_DEGREE_LAT = 111320;
const DEG_TO_RAD = Math.PI / 180;

/** Minimum edge length (in meters) to display a dimension label */
const MIN_EDGE_LENGTH_M = 0.3;

/** Offset in pixels for dimension labels from the edge midpoint */
const DIMENSION_LABEL_OFFSET_PX = 14;

// ─── Core Projection Function ────────────────────────────────────────────────

/**
 * Project a single (lng, lat) to canvas (x, y) relative to refPoint.
 *
 * Canvas coordinate system:
 *   - Origin at (centerCanvasX, centerCanvasY)
 *   - X increases rightward (east)
 *   - Y increases downward (south) — hence the negation on latitude
 */
function lngLatToCanvas(
  lng: number,
  lat: number,
  refLng: number,
  refLat: number,
  centerCanvasX: number,
  centerCanvasY: number,
  pixelsPerMeter: number
): CanvasPoint {
  const mx = (lng - refLng) * METERS_PER_DEGREE_LAT * Math.cos(refLat * DEG_TO_RAD);
  const my = (lat - refLat) * METERS_PER_DEGREE_LAT;

  const x = centerCanvasX + mx * pixelsPerMeter;
  const y = centerCanvasY - my * pixelsPerMeter; // Y-axis inversion

  return {
    x: Number.isFinite(x) ? x : centerCanvasX,
    y: Number.isFinite(y) ? y : centerCanvasY,
  };
}

// ─── Ring Projection ─────────────────────────────────────────────────────────

/**
 * Project an entire ring of coordinates to canvas space.
 *
 * CRITICAL FIX: Uses the BOUNDING BOX CENTER as the Fabric.js anchor (left/top),
 * NOT the arithmetic centroid. Fabric.js Polygon internally uses the bbox center
 * as its pathOffset origin. If you use the arithmetic centroid, non-symmetric
 * shapes (i.e. every real parcel) will be displaced from their correct position,
 * causing the "scattered parcels" bug.
 *
 * Returns points relative to the bbox center (for Fabric.js positioning),
 * plus the absolute canvas points for dimension line rendering.
 */
function projectRing(
  ring: number[][],
  refLng: number,
  refLat: number,
  centerCanvasX: number,
  centerCanvasY: number,
  pixelsPerMeter: number
): ProjectedPolygon & { absolutePoints: CanvasPoint[] } {
  // Project all vertices to absolute canvas coords
  const absPoints: CanvasPoint[] = ring.map(([lng, lat]) =>
    lngLatToCanvas(lng, lat, refLng, refLat, centerCanvasX, centerCanvasY, pixelsPerMeter)
  );

  // Remove the closing vertex if it duplicates the first
  if (absPoints.length >= 2) {
    const first = absPoints[0];
    const last = absPoints[absPoints.length - 1];
    if (
      Math.abs(first.x - last.x) < 0.5 &&
      Math.abs(first.y - last.y) < 0.5
    ) {
      absPoints.pop();
    }
  }

  const n = absPoints.length;
  if (n === 0) {
    return {
      points: [],
      left: centerCanvasX,
      top: centerCanvasY,
      absolutePoints: [],
    };
  }

  // ── USE BBOX CENTER (not arithmetic centroid) as the Fabric.js anchor ───────
  // Fabric.js Polygon internally calculates its bounding box and stores the
  // bbox center as pathOffset. When you set left/top + originX/Y:"center",
  // Fabric places the polygon so its bbox center is at (left, top).
  // Points must therefore be expressed relative to THAT bbox center.
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const p of absPoints) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const bboxCenterX = (minX + maxX) / 2;
  const bboxCenterY = (minY + maxY) / 2;

  // Points relative to bbox center
  const relativePoints = absPoints.map((p) => ({
    x: p.x - bboxCenterX,
    y: p.y - bboxCenterY,
  }));

  return {
    points: relativePoints,
    left: bboxCenterX,
    top: bboxCenterY,
    absolutePoints: [...absPoints], // Preserve for dimension line rendering
  };
}

// ─── Per-Parcel Edge Measurement Computation ────────────────────────────────

/**
 * Compute edge measurements for a single parcel's boundary ring.
 *
 * For each edge:
 *  1. Computes length in meters using Mercator approximation
 *  2. Projects both endpoints to absolute canvas coordinates
 *  3. Computes midpoint (offset outward from polygon centroid) for label placement
 *  4. Computes angle for label rotation (keeps text readable)
 *
 * The outward offset ensures dimension labels don't overlap the polygon stroke.
 */
function computeParcelEdgeLabels(
  ring: number[][],
  refLng: number,
  refLat: number,
  centerCanvasX: number,
  centerCanvasY: number,
  pixelsPerMeter: number,
): ProjectedParcelEdgeLabel[] {
  const labels: ProjectedParcelEdgeLabel[] = [];

  // Determine actual vertex count (strip closing vertex if present)
  let vertexCount = ring.length;
  if (vertexCount >= 2) {
    const first = ring[0];
    const last = ring[vertexCount - 1];
    if (
      Math.abs(first[0] - last[0]) < 1e-9 &&
      Math.abs(first[1] - last[1]) < 1e-9
    ) {
      vertexCount--; // Don't count the closing vertex
    }
  }

  if (vertexCount < 3) return labels;

  // Compute polygon centroid for outward offset direction
  let centLng = 0, centLat = 0;
  for (let i = 0; i < vertexCount; i++) {
    centLng += ring[i][0];
    centLat += ring[i][1];
  }
  centLng /= vertexCount;
  centLat /= vertexCount;
  const centroidCanvas = lngLatToCanvas(
    centLng, centLat, refLng, refLat, centerCanvasX, centerCanvasY, pixelsPerMeter
  );

  for (let i = 0; i < vertexCount; i++) {
    const j = (i + 1) % vertexCount;
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[j];

    // Compute edge length in meters (Mercator approximation)
    const dx_m = (lng2 - lng1) * METERS_PER_DEGREE_LAT * Math.cos(refLat * DEG_TO_RAD);
    const dy_m = (lat2 - lat1) * METERS_PER_DEGREE_LAT;
    const lengthMeters = Math.sqrt(dx_m * dx_m + dy_m * dy_m);

    // Skip very short edges (noise from cadastral data)
    if (lengthMeters < MIN_EDGE_LENGTH_M) continue;

    // Project endpoints to absolute canvas coordinates
    const from = lngLatToCanvas(lng1, lat1, refLng, refLat, centerCanvasX, centerCanvasY, pixelsPerMeter);
    const to = lngLatToCanvas(lng2, lat2, refLng, refLat, centerCanvasX, centerCanvasY, pixelsPerMeter);

    // Midpoint
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;

    // Edge direction and perpendicular (outward from centroid)
    const edgeDx = to.x - from.x;
    const edgeDy = to.y - from.y;
    const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
    if (edgeLen < 1) continue; // Skip zero-length edges in pixel space

    // Normal vector (perpendicular to edge)
    let normalX = -edgeDy / edgeLen;
    let normalY = edgeDx / edgeLen;

    // Ensure the normal points OUTWARD (away from polygon centroid)
    const toCentroidX = centroidCanvas.x - midX;
    const toCentroidY = centroidCanvas.y - midY;
    const dot = normalX * toCentroidX + normalY * toCentroidY;
    if (dot > 0) {
      // Normal points toward centroid — flip it
      normalX = -normalX;
      normalY = -normalY;
    }

    // Offset the label position outward
    const position: CanvasPoint = {
      x: midX + normalX * DIMENSION_LABEL_OFFSET_PX,
      y: midY + normalY * DIMENSION_LABEL_OFFSET_PX,
    };

    // Angle for label rotation (keep text readable)
    let angle = Math.atan2(edgeDy, edgeDx);
    if (angle > Math.PI / 2) angle -= Math.PI;
    if (angle < -Math.PI / 2) angle += Math.PI;

    // Format measurement text with appropriate precision
    let text: string;
    if (lengthMeters >= 100) {
      text = `${Math.round(lengthMeters)}m`;
    } else if (lengthMeters >= 10) {
      text = `${(Math.round(lengthMeters * 10) / 10).toFixed(1)}m`;
    } else {
      text = `${(Math.round(lengthMeters * 100) / 100).toFixed(2)}m`;
    }

    labels.push({ from, to, position, angle, text, lengthMeters });
  }

  return labels;
}

// ─── Main Projection Function ────────────────────────────────────────────────

/**
 * Project all elements of ProcessedSiteData to canvas coordinates.
 *
 * This is the core "No Offset" function: every coordinate is projected
 * through the same refPoint anchor, ensuring perfect alignment.
 */
export function projectToCanvas(
  data: ProcessedSiteData,
  options: CanvasProjectionOptions
): ProjectedSiteData {
  const { canvasWidth, canvasHeight, pixelsPerMeter } = options;
  const centerCanvasX = canvasWidth / 2;
  const centerCanvasY = canvasHeight / 2;

  // ── Compute refPoint from all available coordinate sources ────────────────
  // Priority: data.refPoint → globalBoundary bbox center → all parcel rings → vertices3D[0]
  let refPoint = data.refPoint;
  if (!refPoint) {
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;

    // Try globalBoundary first
    const geom = data.globalBoundary?.geometry;
    if (geom) {
      const allCoords: number[][] =
        geom.type === "Polygon"
          ? geom.coordinates[0]
          : (geom as any).coordinates.flatMap((p: number[][][]) => p[0]);
      for (const c of allCoords) {
        const lng = c[0], lat = c[1];
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
        if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
      }
    }

    // If still unknown, walk all parcel rings
    if (!Number.isFinite(minLng) && data.parcels?.length > 0) {
      for (const p of data.parcels) {
        const coords = p.coordinates;
        if (!Array.isArray(coords) || coords.length === 0) continue;
        // coords = [ring, ...holes] where ring = [[lng,lat],...]
        // OR coords = [[lng,lat],...] (flat ring, legacy)
        const firstEl = coords[0];
        let ring: number[][];
        if (Array.isArray(firstEl) && Array.isArray(firstEl[0])) {
          // [ring, ...holes] format
          ring = firstEl as unknown as number[][];
        } else if (Array.isArray(firstEl) && typeof firstEl[0] === "number") {
          // Flat [lng, lat] pairs — treat coords itself as a ring
          ring = coords as unknown as number[][];
        } else continue;
        for (const c of ring) {
          const lng = c[0], lat = c[1];
          if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
          if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
        }
      }
    }

    if (Number.isFinite(minLng)) {
      refPoint = { lng: (minLng + maxLng) / 2, lat: (minLat + maxLat) / 2 };
    } else if (data.vertices3D?.length > 0) {
      refPoint = { lng: data.vertices3D[0].lng, lat: data.vertices3D[0].lat };
    } else {
      throw new Error("projectToCanvas: cannot determine refPoint — no boundary, parcels, or vertices3D");
    }
  }
  const { lng: refLng, lat: refLat } = refPoint;

  // ── Project globalBoundary ────────────────────────────────────────────────
  const boundaryGeom = data.globalBoundary?.geometry;
  let boundaryPoly: ProjectedPolygon;

  if (!boundaryGeom) {
    // No boundary geometry available — use empty polygon at center
    boundaryPoly = { points: [], left: centerCanvasX, top: centerCanvasY };
  } else if (boundaryGeom.type === "Polygon") {
    const result = projectRing(
      boundaryGeom.coordinates[0],
      refLng, refLat, centerCanvasX, centerCanvasY, pixelsPerMeter
    );
    boundaryPoly = { points: result.points, left: result.left, top: result.top };
  } else {
    // MultiPolygon: project the largest polygon
    let largestRing = boundaryGeom.coordinates[0][0];
    let largestArea = 0;
    for (const poly of boundaryGeom.coordinates) {
      const area = Math.abs(
        poly[0].reduce((sum, [x, y], i) => {
          const [nx, ny] = poly[0][(i + 1) % poly[0].length];
          return sum + (x * ny - nx * y);
        }, 0) / 2
      );
      if (area > largestArea) {
        largestArea = area;
        largestRing = poly[0];
      }
    }
    const result = projectRing(
      largestRing,
      refLng, refLat, centerCanvasX, centerCanvasY, pixelsPerMeter
    );
    boundaryPoly = { points: result.points, left: result.left, top: result.top };
  }

  // ── Project individual parcels with per-parcel edge measurements ──────────
  const projectedParcels: ProjectedParcel[] = (data.parcels || [])
    .filter((p) => Array.isArray(p.coordinates) && p.coordinates.length > 0)
    .map((parcel) => {
      // Robustly extract the outer ring from any of these layouts:
      //  A) GeoJSON Polygon:     coordinates = [outerRing, ...holes]  where outerRing = [[lng,lat],...]
      //  B) GeoJSON MultiPolygon: coordinates = [polygon, ...]        where polygon = [ring, ...holes]
      //  C) Flat ring (legacy):  coordinates = [[lng,lat],...]  (the ring itself)
      let outerRing: number[][] | null = null;

      const coords = parcel.coordinates;
      const first = coords[0];

      if (!Array.isArray(first)) {
        // Completely degenerate — skip
        return null;
      }

      if (typeof first[0] === "number") {
        // Layout C: coords itself is [lng,lat] pairs → it IS the ring
        outerRing = coords as unknown as number[][];
      } else if (Array.isArray(first[0])) {
        if (typeof (first[0] as any[])[0] === "number") {
          // Layout A: coords = [ring, ...holes] — first is [[lng,lat],...]
          outerRing = first as unknown as number[][];
        } else if (Array.isArray((first[0] as any[])[0])) {
          // Layout B: coords = [polygon, ...] — polygon = [ring, ...holes]
          outerRing = (first as unknown as number[][][])[0];
        }
      }

      if (!outerRing || outerRing.length < 3) {
        return null;
      }

      // Validate that ring contains real WGS84 coordinates
      const validRing = outerRing.filter(
        (c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])
      );
      if (validRing.length < 3) return null;
      outerRing = validRing;

      const projected = projectRing(
        outerRing,
        refLng, refLat, centerCanvasX, centerCanvasY, pixelsPerMeter
      );

      // Compute per-parcel edge measurements
      const parcelEdgeLabels = computeParcelEdgeLabels(
        outerRing,
        refLng, refLat, centerCanvasX, centerCanvasY, pixelsPerMeter
      );

      return {
        points: projected.points,
        left: projected.left,
        top: projected.top,
        absolutePoints: projected.absolutePoints,
        id: parcel.id,
        section: parcel.section,
        number: parcel.number,
        area: parcel.area,
        edgeLabels: parcelEdgeLabels,
      } satisfies ProjectedParcel;
    })
    .filter((p): p is ProjectedParcel => p !== null);

  // ── Project edge measurement labels (global boundary) ─────────────────────
  const edgeLabels: ProjectedEdgeLabel[] = (data.edges || []).filter((edge) => edge.from && edge.to && typeof edge.from.lng === "number").map((edge) => {
    const fromCanvas = lngLatToCanvas(
      edge.from.lng, edge.from.lat,
      refLng, refLat, centerCanvasX, centerCanvasY, pixelsPerMeter
    );
    const toCanvas = lngLatToCanvas(
      edge.to.lng, edge.to.lat,
      refLng, refLat, centerCanvasX, centerCanvasY, pixelsPerMeter
    );

    // Midpoint for label position
    const midX = (fromCanvas.x + toCanvas.x) / 2;
    const midY = (fromCanvas.y + toCanvas.y) / 2;

    // Angle of the edge (for rotating the label to follow)
    const dx = toCanvas.x - fromCanvas.x;
    const dy = toCanvas.y - fromCanvas.y;
    let angle = Math.atan2(dy, dx);

    // Keep text readable (avoid upside-down labels)
    if (angle > Math.PI / 2) angle -= Math.PI;
    if (angle < -Math.PI / 2) angle += Math.PI;

    // Format length
    const meters = edge.lengthMeters;
    const text =
      meters >= 100
        ? `${Math.round(meters)}m`
        : `${(Math.round(meters * 10) / 10).toFixed(1)}m`;

    return {
      position: { x: midX, y: midY },
      angle,
      text,
    };
  });

  // ── Project vertex elevation labels ───────────────────────────────────────
  const vertexLabels: ProjectedVertexLabel[] = (data.vertices3D || [])
    .filter((v) => v.elevation > 0) // Skip vertices without elevation data
    .map((vertex) => {
      const canvasPos = lngLatToCanvas(
        vertex.lng, vertex.lat,
        refLng, refLat, centerCanvasX, centerCanvasY, pixelsPerMeter
      );

      return {
        position: canvasPos,
        text: `NGF: ${vertex.elevation.toFixed(1)}m`,
      };
    });

  return {
    boundary: boundaryPoly,
    parcels: projectedParcels,
    edgeLabels,
    vertexLabels,
    refCanvas: { x: centerCanvasX, y: centerCanvasY },
  };
}

/**
 * Utility: convert a single (lng, lat) to canvas coordinates using the same
 * refPoint anchor. Useful for placing buildings/objects in the correct position.
 */
export function geoToCanvas(
  lng: number,
  lat: number,
  refPoint: { lng: number; lat: number },
  options: CanvasProjectionOptions
): CanvasPoint {
  return lngLatToCanvas(
    lng, lat,
    refPoint.lng, refPoint.lat,
    options.canvasWidth / 2,
    options.canvasHeight / 2,
    options.pixelsPerMeter
  );
}
