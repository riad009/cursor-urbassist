/**
 * projectToCanvas — The "No Offset" Fix
 *
 * Projects ProcessedSiteData from WGS84 (lng/lat) to canvas pixel coordinates.
 *
 * THE KEY INSIGHT:
 *   A single refPoint (bbox center of globalBoundary) serves as the master
 *   anchor mapped to canvas center (0,0). EVERY point of EVERY parcel is
 *   projected relative to this single anchor, mathematically guaranteeing
 *   zero offset and perfect puzzle-piece alignment.
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
} from "@/types/processed-site-data";

// ─── Constants ───────────────────────────────────────────────────────────────

const METERS_PER_DEGREE_LAT = 111320;
const DEG_TO_RAD = Math.PI / 180;

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
 * Returns points relative to the polygon's centroid (for Fabric.js positioning).
 */
function projectRing(
  ring: number[][],
  refLng: number,
  refLat: number,
  centerCanvasX: number,
  centerCanvasY: number,
  pixelsPerMeter: number
): ProjectedPolygon {
  // Project all vertices to absolute canvas coords
  const absPoints: CanvasPoint[] = ring.map(([lng, lat]) =>
    lngLatToCanvas(lng, lat, refLng, refLat, centerCanvasX, centerCanvasY, pixelsPerMeter)
  );

  // Remove the closing vertex if it duplicates the first
  if (absPoints.length >= 2) {
    const first = absPoints[0];
    const last = absPoints[absPoints.length - 1];
    if (
      Math.abs(first.x - last.x) < 0.001 &&
      Math.abs(first.y - last.y) < 0.001
    ) {
      absPoints.pop();
    }
  }

  // Compute centroid of the projected points (for Fabric.js left/top)
  const n = absPoints.length;
  const centroidX = absPoints.reduce((s, p) => s + p.x, 0) / n;
  const centroidY = absPoints.reduce((s, p) => s + p.y, 0) / n;

  // Fabric.js polygon points are relative to the centroid
  const relativePoints = absPoints.map((p) => ({
    x: p.x - centroidX,
    y: p.y - centroidY,
  }));

  return {
    points: relativePoints,
    left: centroidX,
    top: centroidY,
  };
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

  // Compute refPoint from globalBoundary bbox center if not provided
  let refPoint = data.refPoint;
  if (!refPoint) {
    const geom = data.globalBoundary?.geometry;
    if (geom) {
      // Extract all coordinates to find bbox center
      const allCoords: number[][] =
        geom.type === "Polygon"
          ? geom.coordinates[0]
          : geom.coordinates.flatMap((p: number[][][]) => p[0]);
      if (allCoords.length > 0) {
        let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
        for (const [lng, lat] of allCoords) {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
        refPoint = { lng: (minLng + maxLng) / 2, lat: (minLat + maxLat) / 2 };
      }
    }
    // Ultimate fallback: first vertex
    if (!refPoint && data.vertices3D?.length > 0) {
      refPoint = { lng: data.vertices3D[0].lng, lat: data.vertices3D[0].lat };
    }
    // If still nothing, bail
    if (!refPoint) {
      throw new Error("projectToCanvas: cannot determine refPoint — no globalBoundary or vertices3D");
    }
  }
  const { lng: refLng, lat: refLat } = refPoint;

  // ── Project globalBoundary ────────────────────────────────────────────────
  const boundaryGeom = data.globalBoundary.geometry;
  let boundaryPoly: ProjectedPolygon;

  if (boundaryGeom.type === "Polygon") {
    boundaryPoly = projectRing(
      boundaryGeom.coordinates[0],
      refLng, refLat, centerCanvasX, centerCanvasY, pixelsPerMeter
    );
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
    boundaryPoly = projectRing(
      largestRing,
      refLng, refLat, centerCanvasX, centerCanvasY, pixelsPerMeter
    );
  }

  // ── Project individual parcels ────────────────────────────────────────────
  const projectedParcels: ProjectedParcel[] = data.parcels.map((parcel) => {
    const outerRing = parcel.coordinates[0]; // First ring = outer
    const projected = projectRing(
      outerRing,
      refLng, refLat, centerCanvasX, centerCanvasY, pixelsPerMeter
    );
    return {
      ...projected,
      id: parcel.id,
      section: parcel.section,
      number: parcel.number,
      area: parcel.area,
    };
  });

  // ── Project edge measurement labels ───────────────────────────────────────
  const edgeLabels: ProjectedEdgeLabel[] = data.edges.map((edge) => {
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
  const vertexLabels: ProjectedVertexLabel[] = data.vertices3D
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
