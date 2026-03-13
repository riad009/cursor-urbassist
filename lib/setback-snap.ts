/**
 * setback-snap.ts — Magnetic Snapping to Setback Lines
 *
 * When the user drags a building/footprint near a dashed setback line,
 * this engine snaps the building's bounding box edge to the line and
 * auto-rotates it to sit parallel using Math.atan2.
 */

import type { Point2D } from "./polygon-offset";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SetbackSegment {
  /** Start point of the setback segment (canvas coords) */
  p1: Point2D;
  /** End point of the setback segment (canvas coords) */
  p2: Point2D;
  /** Edge classification */
  type: "front" | "side" | "rear";
  /** Index of this segment in the setback polygon */
  segmentIndex: number;
}

export interface SnapResult {
  /** Corrected X position for the object */
  snapLeft: number;
  /** Corrected Y position for the object */
  snapTop: number;
  /** Rotation angle in degrees (Fabric.js uses degrees) */
  angle: number;
  /** Which setback segment was snapped to */
  segment: SetbackSegment;
  /** Distance from object to the snapped segment (in pixels) */
  distance: number;
}

export interface BoundingBox {
  /** Center X of the object (Fabric.js left with originX=center) */
  cx: number;
  /** Center Y of the object (Fabric.js top with originY=center) */
  cy: number;
  /** Object width in pixels */
  width: number;
  /** Object height in pixels */
  height: number;
  /** Current rotation in degrees */
  angle: number;
}

// ─── Core Geometry ──────────────────────────────────────────────────────────

/**
 * Compute the shortest distance from a point to a line segment.
 * Returns the distance AND the closest point on the segment.
 */
function pointToSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): { distance: number; closest: Point2D; t: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq < 1e-10) {
    // Degenerate segment (a == b)
    const d = Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
    return { distance: d, closest: { x: ax, y: ay }, t: 0 };
  }

  // Parameter t along the segment: 0 = at a, 1 = at b
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const d = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);

  return { distance: d, closest: { x: cx, y: cy }, t };
}

/**
 * Compute the four corners of a rotated bounding box.
 */
function getBBoxCorners(bbox: BoundingBox): Point2D[] {
  const rad = (bbox.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = bbox.width / 2;
  const hh = bbox.height / 2;

  // Local corners before rotation
  const local: [number, number][] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];

  return local.map(([lx, ly]) => ({
    x: bbox.cx + lx * cos - ly * sin,
    y: bbox.cy + lx * sin + ly * cos,
  }));
}

/**
 * Get the four edges of the bounding box as segment pairs.
 */
function getBBoxEdges(bbox: BoundingBox): Array<{ p1: Point2D; p2: Point2D }> {
  const corners = getBBoxCorners(bbox);
  return [
    { p1: corners[0], p2: corners[1] }, // top
    { p1: corners[1], p2: corners[2] }, // right
    { p1: corners[2], p2: corners[3] }, // bottom
    { p1: corners[3], p2: corners[0] }, // left
  ];
}

// ─── Main Snap Function ────────────────────────────────────────────────────

/**
 * Find the nearest setback segment to snap to, if within threshold.
 *
 * Algorithm:
 *   1. For each setback segment, compute nearest distance from the building's
 *      bounding box edges
 *   2. If the closest distance < threshold, compute snap corrections:
 *      - Move the building so its nearest edge sits ON the setback line
 *      - Rotate the building to be parallel to the setback segment
 *
 * @param bbox          Building bounding box in canvas coords
 * @param segments      All setback line segments
 * @param thresholdPx   Snap activation distance in pixels (default: 15)
 * @returns SnapResult or null if nothing is close enough
 */
export function findNearestSetbackSnap(
  bbox: BoundingBox,
  segments: SetbackSegment[],
  thresholdPx: number = 15
): SnapResult | null {
  if (segments.length === 0) return null;

  let bestDist = Infinity;
  let bestResult: SnapResult | null = null;

  const bboxEdges = getBBoxEdges(bbox);

  for (const seg of segments) {
    // For each bbox edge, find its distance to this setback segment
    for (const bEdge of bboxEdges) {
      // Sample several points along the bbox edge
      const samples = 5;
      for (let s = 0; s <= samples; s++) {
        const t = s / samples;
        const px = bEdge.p1.x + t * (bEdge.p2.x - bEdge.p1.x);
        const py = bEdge.p1.y + t * (bEdge.p2.y - bEdge.p1.y);

        const { distance, closest } = pointToSegmentDistance(
          px, py,
          seg.p1.x, seg.p1.y,
          seg.p2.x, seg.p2.y
        );

        if (distance < bestDist && distance < thresholdPx) {
          bestDist = distance;

          // ── Compute snap angle ──
          // Angle of the setback segment
          const segAngleRad = Math.atan2(
            seg.p2.y - seg.p1.y,
            seg.p2.x - seg.p1.x
          );
          let segAngleDeg = (segAngleRad * 180) / Math.PI;

          // Normalize to [0, 360)
          while (segAngleDeg < 0) segAngleDeg += 360;

          // Snap to nearest 90° multiple relative to segment
          // (building can be parallel or perpendicular)
          const currentAngle = ((bbox.angle % 360) + 360) % 360;
          const relAngle = currentAngle - segAngleDeg;
          const normRel = ((relAngle % 180) + 180) % 180;
          const snapAngle =
            normRel < 45 || normRel > 135
              ? segAngleDeg
              : segAngleDeg + 90;

          // ── Compute snap position ──
          // Move the building center so its nearest edge sits ON the setback line
          const dx = closest.x - px;
          const dy = closest.y - py;

          bestResult = {
            snapLeft: bbox.cx + dx,
            snapTop: bbox.cy + dy,
            angle: snapAngle % 360,
            segment: seg,
            distance,
          };
        }
      }
    }
  }

  return bestResult;
}

/**
 * Convert inset polygon points to SetbackSegment array.
 */
export function polygonToSetbackSegments(
  insetPoints: Point2D[],
  edgeTypes: ("front" | "side" | "rear")[]
): SetbackSegment[] {
  const segments: SetbackSegment[] = [];
  const n = insetPoints.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    segments.push({
      p1: insetPoints[i],
      p2: insetPoints[j],
      type: edgeTypes[i] || "side",
      segmentIndex: i,
    });
  }

  return segments;
}
