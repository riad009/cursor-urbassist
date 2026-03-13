/**
 * polygon-offset.ts — Straight-Edge Polygon Inward Offset
 *
 * Computes the legal "buildable zone" by offsetting each boundary edge
 * inward by its specific setback distance (in pixels).
 *
 * Algorithm: Miter-join inward offset
 *   1. For each edge, compute the inward-facing unit normal
 *   2. Offset each edge line by its specific setback distance
 *   3. Find intersections of consecutive offset edges (miter join)
 *   4. Handle degenerate cases (collinear, near-parallel) with bisector fallback
 *
 * This does NOT use turf.buffer — corners stay sharp, edges stay straight.
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface EdgeSetback {
  /** Index of the edge in the polygon (edge i goes from vertex[i] to vertex[i+1]) */
  edgeIndex: number;
  /** Setback distance in pixels */
  distancePx: number;
  /** Classification for styling */
  type: "front" | "side" | "rear";
  /** Optional label (e.g. "Recul 5m") */
  label?: string;
}

export interface SetbackResult {
  /** The inset polygon vertices (buildable zone) */
  points: Point2D[];
  /** Per-edge metadata for styling */
  edgeTypes: ("front" | "side" | "rear")[];
  /** Edge midpoints + labels for dimension annotations */
  labels: Array<{ position: Point2D; text: string; angle: number }>;
}

// ─── Geometry Helpers ──────────────────────────────────────────────────────

/** Cross product of 2D vectors (a→b) × (a→c) */
function cross2D(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/** Compute the inward-facing unit normal for a polygon edge.
 *  Assumes the polygon is wound CLOCKWISE in screen space (Y-down).
 *  Inward normal = rotate edge direction 90° to the LEFT. */
function edgeInwardNormal(
  p1: Point2D,
  p2: Point2D,
  _polygonWinding: "cw" | "ccw"
): { nx: number; ny: number } {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-10) return { nx: 0, ny: -1 };

  // For CW winding in screen space (Y-down), inward normal = (-dy, dx) / len
  // For CCW winding, inward normal = (dy, -dx) / len
  if (_polygonWinding === "cw") {
    return { nx: -dy / len, ny: dx / len };
  }
  return { nx: dy / len, ny: -dx / len };
}

/** Determine polygon winding order (CW or CCW) using signed area.
 *  Positive signed area = CCW in math coords, but CW in screen coords (Y-down). */
function getWinding(pts: Point2D[]): "cw" | "ccw" {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += (pts[j].x - pts[i].x) * (pts[j].y + pts[i].y);
  }
  // In screen coordinates (Y-down): positive = CW, negative = CCW
  return area > 0 ? "cw" : "ccw";
}

/** Find intersection of two lines, each defined by a point + direction.
 *  Returns null if lines are (nearly) parallel. */
function lineLineIntersection(
  p1: Point2D,
  d1: Point2D,
  p2: Point2D,
  d2: Point2D
): Point2D | null {
  const denom = cross2D(d1.x, d1.y, d2.x, d2.y);
  if (Math.abs(denom) < 1e-10) return null; // Parallel or coincident

  const t = cross2D(p2.x - p1.x, p2.y - p1.y, d2.x, d2.y) / denom;
  return {
    x: p1.x + t * d1.x,
    y: p1.y + t * d1.y,
  };
}

// ─── Main Offset Function ──────────────────────────────────────────────────

/**
 * Compute the inward offset of a polygon with per-edge setback distances.
 *
 * @param polygon  - Closed polygon vertices (NO duplicate closing vertex)
 * @param setbacks - Per-edge setback specifications. Edges without a setback entry get `defaultSetbackPx`.
 * @param defaultSetbackPx - Default setback in pixels for edges not in `setbacks` array
 * @returns SetbackResult with inset polygon, edge types, and labels
 */
export function computePolygonOffset(
  polygon: Point2D[],
  setbacks: EdgeSetback[],
  defaultSetbackPx: number = 0
): SetbackResult {
  const n = polygon.length;
  if (n < 3) {
    return { points: [], edgeTypes: [], labels: [] };
  }

  const winding = getWinding(polygon);

  // Build a lookup: edgeIndex → { distancePx, type }
  const setbackMap = new Map<number, EdgeSetback>();
  for (const s of setbacks) {
    setbackMap.set(s.edgeIndex, s);
  }

  // For each edge, compute the offset line (point on offset line + edge direction)
  interface OffsetEdge {
    /** A point on the offset edge */
    point: Point2D;
    /** Direction of the offset edge (same as original edge) */
    dir: Point2D;
    /** Setback type */
    type: "front" | "side" | "rear";
    /** Setback distance in px */
    distPx: number;
  }

  const offsetEdges: OffsetEdge[] = [];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const p1 = polygon[i];
    const p2 = polygon[j];

    const sb = setbackMap.get(i);
    const distPx = sb?.distancePx ?? defaultSetbackPx;
    const type = sb?.type ?? "side";

    const { nx, ny } = edgeInwardNormal(p1, p2, winding);

    // Offset the edge by moving it along the inward normal
    const offsetPoint: Point2D = {
      x: p1.x + nx * distPx,
      y: p1.y + ny * distPx,
    };
    const dir: Point2D = {
      x: p2.x - p1.x,
      y: p2.y - p1.y,
    };

    offsetEdges.push({ point: offsetPoint, dir, type, distPx });
  }

  // Find miter-join intersections of consecutive offset edges
  const insetPoints: Point2D[] = [];
  const edgeTypes: ("front" | "side" | "rear")[] = [];
  const labels: SetbackResult["labels"] = [];

  for (let i = 0; i < n; i++) {
    const curr = offsetEdges[i];
    const next = offsetEdges[(i + 1) % n];

    const intersection = lineLineIntersection(
      curr.point,
      curr.dir,
      next.point,
      next.dir
    );

    if (intersection) {
      insetPoints.push(intersection);
    } else {
      // Parallel edges — use bisector fallback
      // Average the offset points as approximation
      insetPoints.push({
        x: (curr.point.x + next.point.x) / 2,
        y: (curr.point.y + next.point.y) / 2,
      });
    }

    // Edge type for the segment FROM this intersection to the next
    edgeTypes.push(next.type);
  }

  // Generate labels for each offset edge
  for (let i = 0; i < insetPoints.length; i++) {
    const j = (i + 1) % insetPoints.length;
    const oe = offsetEdges[(i + 1) % n]; // The edge this inset segment corresponds to
    if (oe.distPx <= 0) continue;

    const mid: Point2D = {
      x: (insetPoints[i].x + insetPoints[j].x) / 2,
      y: (insetPoints[i].y + insetPoints[j].y) / 2,
    };

    const dx = insetPoints[j].x - insetPoints[i].x;
    const dy = insetPoints[j].y - insetPoints[i].y;
    let angle = Math.atan2(dy, dx);
    // Keep text readable
    if (angle > Math.PI / 2) angle -= Math.PI;
    if (angle < -Math.PI / 2) angle += Math.PI;

    // Find matching setback for label text
    const sb = setbackMap.get((i + 1) % n);
    const labelText = sb?.label || `Recul ${Math.round(oe.distPx)}px`;

    labels.push({ position: mid, text: labelText, angle });
  }

  return { points: insetPoints, edgeTypes, labels };
}

// ─── Edge Classification Helper ──────────────────────────────────────────────

export interface ClassifiedEdge {
  edgeIndex: number;
  type: "front" | "side" | "rear";
  /** Setback in metres */
  setbackM: number;
}

/**
 * Classify boundary edges as front/side/rear based on road proximity.
 *
 * Strategy:
 *   - Edges facing roads (closest to top of canvas / road-adjacent) → "front"
 *   - Bottom-most edge → "rear"
 *   - Everything else → "side"
 *
 * If `roadEdgeIndices` is provided (from the parcelRoads classification system),
 * those edges are marked as "front". Otherwise, heuristic: top-most edge = front.
 */
export function classifyBoundaryEdges(
  boundaryPoints: Point2D[],
  setbacks: { front: number; side: number; rear: number },
  pixelsPerMeter: number,
  roadEdgeIndices?: number[]
): ClassifiedEdge[] {
  const n = boundaryPoints.length;
  if (n < 3) return [];

  const result: ClassifiedEdge[] = [];

  if (roadEdgeIndices && roadEdgeIndices.length > 0) {
    // Use provided road classification
    const roadSet = new Set(roadEdgeIndices);

    // Find the "rear" edge — farthest from road edges (bottom-most Y for screen coords)
    let rearIdx = 0;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      if (roadSet.has(i)) continue;
      const j = (i + 1) % n;
      const midY = (boundaryPoints[i].y + boundaryPoints[j].y) / 2;
      if (midY > maxY) {
        maxY = midY;
        rearIdx = i;
      }
    }

    for (let i = 0; i < n; i++) {
      if (roadSet.has(i)) {
        result.push({ edgeIndex: i, type: "front", setbackM: setbacks.front });
      } else if (i === rearIdx) {
        result.push({ edgeIndex: i, type: "rear", setbackM: setbacks.rear });
      } else {
        result.push({ edgeIndex: i, type: "side", setbackM: setbacks.side });
      }
    }
  } else {
    // Heuristic: top-most edge = front (closest to road in typical cadastral orientation)
    let frontIdx = 0;
    let minY = Infinity;
    let rearIdx = 0;
    let maxY = -Infinity;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const midY = (boundaryPoints[i].y + boundaryPoints[j].y) / 2;
      if (midY < minY) { minY = midY; frontIdx = i; }
      if (midY > maxY) { maxY = midY; rearIdx = i; }
    }

    for (let i = 0; i < n; i++) {
      if (i === frontIdx) {
        result.push({ edgeIndex: i, type: "front", setbackM: setbacks.front });
      } else if (i === rearIdx) {
        result.push({ edgeIndex: i, type: "rear", setbackM: setbacks.rear });
      } else {
        result.push({ edgeIndex: i, type: "side", setbackM: setbacks.side });
      }
    }
  }

  return result;
}

/**
 * Convert classified edges to EdgeSetback array with pixel distances.
 */
export function toEdgeSetbacks(
  classified: ClassifiedEdge[],
  pixelsPerMeter: number
): EdgeSetback[] {
  return classified.map((e) => ({
    edgeIndex: e.edgeIndex,
    distancePx: e.setbackM * pixelsPerMeter,
    type: e.type,
    label: `Recul ${e.setbackM}m`,
  }));
}
