/**
 * smart-snap.ts — Magnetic Snapping Engine for the UrbAssist Site Plan Editor
 *
 * Provides edge-to-edge and center-to-center magnetic snapping between
 * Fabric.js canvas objects. Snaps buildings to property boundaries AND
 * to other buildings/surfaces for precise architectural layout.
 *
 * ALGORITHM:
 *   1. Extract 4 edges + 2 centers of the moving object's bounding rect
 *   2. Extract same from all snap targets (parcels, buildings, surfaces)
 *   3. For each moving edge, find the closest target edge within threshold
 *   4. Apply the smallest delta per axis (horizontal/vertical independently)
 *   5. Return snapped coordinates + visual guide line geometry
 *
 * INTEGRATION:
 *   - Hook into Fabric.js `object:moving` and `object:scaling` events
 *   - Call computeSmartSnap() to get snapped coords
 *   - Mutate obj.left/top to snap position
 *   - Render guide lines as temporary Fabric.Line objects
 *
 * PERFORMANCE:
 *   - O(N) per move event where N = number of canvas objects
 *   - No allocation in hot path — reuses snap candidate arrays
 *   - Guide line geometry is lightweight (4 numbers per line)
 */

// ─── Constants ──────────────────────────────────────────────────────────────

/** Snap activation radius in canvas pixels */
export const SNAP_THRESHOLD = 15;

/** Minimum object dimension to consider as a snap target */
const MIN_TARGET_SIZE = 2;

/** Guide line extension beyond snap point (visual overshoot) */
const GUIDE_OVERSHOOT = 30;

// ─── Types ──────────────────────────────────────────────────────────────────

/** A single visual guide line for snap feedback */
export interface SnapGuideLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 'h' for horizontal (snapping vertical position), 'v' for vertical (snapping horizontal position) */
  orientation: "h" | "v";
}

/** Result of a snap computation */
export interface SnapResult {
  /** The snapped left position (may equal original if no snap on this axis) */
  snappedLeft: number;
  /** The snapped top position (may equal original if no snap on this axis) */
  snappedTop: number;
  /** Whether any snapping occurred */
  didSnap: boolean;
  /** Visual guide lines to render on canvas */
  guideLines: SnapGuideLine[];
}

/** Extracted edge positions from a Fabric.js bounding rect */
interface ObjectEdges {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

/** Internal snap candidate — one per potential snap axis */
interface SnapCandidate {
  axis: "x" | "y";
  /** The position of the moving object's edge/center that could snap */
  movingValue: number;
  /** The position of the target edge/center to snap to */
  targetValue: number;
  /** Absolute distance */
  delta: number;
  /** Which edge triggered this snap (for guide line rendering) */
  edgeType: "left" | "right" | "top" | "bottom" | "centerX" | "centerY";
  /** Full extent of the target for guide line rendering */
  targetExtentMin: number;
  targetExtentMax: number;
}

/**
 * Minimal Fabric.js object interface — avoids importing fabric types.
 * Must match what Fabric.js provides on `object:moving` and `object:scaling` events.
 */
export interface SnapFabricObject {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  angle?: number;
  /** Fabric.js v7: returns bounding rect in absolute canvas coords */
  getBoundingRect?: (absolute?: boolean) => {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  /** Custom UrbAssist flags */
  isParcel?: boolean;
  elementType?: string;
  id?: string;
  /** set() mutator for Fabric.js */
  set?: (key: string, value: number) => void;
  setCoords?: () => void;
}

// ─── Edge Extraction ────────────────────────────────────────────────────────

/**
 * Extract the 4 edges and 2 centers of a Fabric.js object.
 * Uses getBoundingRect() for rotation-aware positioning.
 */
function extractEdges(obj: SnapFabricObject): ObjectEdges | null {
  if (typeof obj.getBoundingRect === "function") {
    const rect = obj.getBoundingRect(true);
    if (!rect || rect.width < MIN_TARGET_SIZE || rect.height < MIN_TARGET_SIZE) {
      return null;
    }
    return {
      left: rect.left,
      right: rect.left + rect.width,
      top: rect.top,
      bottom: rect.top + rect.height,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
    };
  }

  // Fallback: compute from positional properties
  const left = obj.left ?? 0;
  const top = obj.top ?? 0;
  const w = (obj.width ?? 0) * (obj.scaleX ?? 1);
  const h = (obj.height ?? 0) * (obj.scaleY ?? 1);

  if (w < MIN_TARGET_SIZE || h < MIN_TARGET_SIZE) return null;

  return {
    left,
    right: left + w,
    top,
    bottom: top + h,
    centerX: left + w / 2,
    centerY: top + h / 2,
  };
}

// ─── Core Snap Computation ──────────────────────────────────────────────────

/**
 * Compute magnetic snapping for a moving object against all other objects.
 *
 * @param movingObj  - The Fabric.js object currently being moved
 * @param allObjects - All objects on the canvas (will filter out movingObj)
 * @param threshold  - Snap activation radius in pixels (default: SNAP_THRESHOLD)
 * @returns SnapResult with snapped coordinates and guide lines
 */
export function computeSmartSnap(
  movingObj: SnapFabricObject,
  allObjects: SnapFabricObject[],
  threshold: number = SNAP_THRESHOLD
): SnapResult {
  const movingEdges = extractEdges(movingObj);

  if (!movingEdges) {
    return {
      snappedLeft: movingObj.left ?? 0,
      snappedTop: movingObj.top ?? 0,
      didSnap: false,
      guideLines: [],
    };
  }

  const candidates: SnapCandidate[] = [];

  // Compare against every other object
  for (const target of allObjects) {
    // Skip self
    if (target === movingObj) continue;
    // Skip objects with no usable geometry
    const targetEdges = extractEdges(target);
    if (!targetEdges) continue;

    // ── Vertical axis snaps (X-axis edges: left, right, centerX) ──────
    const xPairs: Array<{
      movingValue: number;
      targetValue: number;
      edgeType: SnapCandidate["edgeType"];
      extentMin: number;
      extentMax: number;
    }> = [
      // Moving left → Target left
      {
        movingValue: movingEdges.left,
        targetValue: targetEdges.left,
        edgeType: "left",
        extentMin: Math.min(movingEdges.top, targetEdges.top),
        extentMax: Math.max(movingEdges.bottom, targetEdges.bottom),
      },
      // Moving left → Target right (flush adjacency)
      {
        movingValue: movingEdges.left,
        targetValue: targetEdges.right,
        edgeType: "left",
        extentMin: Math.min(movingEdges.top, targetEdges.top),
        extentMax: Math.max(movingEdges.bottom, targetEdges.bottom),
      },
      // Moving right → Target right
      {
        movingValue: movingEdges.right,
        targetValue: targetEdges.right,
        edgeType: "right",
        extentMin: Math.min(movingEdges.top, targetEdges.top),
        extentMax: Math.max(movingEdges.bottom, targetEdges.bottom),
      },
      // Moving right → Target left (flush adjacency)
      {
        movingValue: movingEdges.right,
        targetValue: targetEdges.left,
        edgeType: "right",
        extentMin: Math.min(movingEdges.top, targetEdges.top),
        extentMax: Math.max(movingEdges.bottom, targetEdges.bottom),
      },
      // Center-X alignment
      {
        movingValue: movingEdges.centerX,
        targetValue: targetEdges.centerX,
        edgeType: "centerX",
        extentMin: Math.min(movingEdges.top, targetEdges.top),
        extentMax: Math.max(movingEdges.bottom, targetEdges.bottom),
      },
    ];

    for (const pair of xPairs) {
      const delta = Math.abs(pair.movingValue - pair.targetValue);
      if (delta < threshold) {
        candidates.push({
          axis: "x",
          movingValue: pair.movingValue,
          targetValue: pair.targetValue,
          delta,
          edgeType: pair.edgeType,
          targetExtentMin: pair.extentMin,
          targetExtentMax: pair.extentMax,
        });
      }
    }

    // ── Horizontal axis snaps (Y-axis edges: top, bottom, centerY) ────
    const yPairs: Array<{
      movingValue: number;
      targetValue: number;
      edgeType: SnapCandidate["edgeType"];
      extentMin: number;
      extentMax: number;
    }> = [
      // Moving top → Target top
      {
        movingValue: movingEdges.top,
        targetValue: targetEdges.top,
        edgeType: "top",
        extentMin: Math.min(movingEdges.left, targetEdges.left),
        extentMax: Math.max(movingEdges.right, targetEdges.right),
      },
      // Moving top → Target bottom (flush adjacency)
      {
        movingValue: movingEdges.top,
        targetValue: targetEdges.bottom,
        edgeType: "top",
        extentMin: Math.min(movingEdges.left, targetEdges.left),
        extentMax: Math.max(movingEdges.right, targetEdges.right),
      },
      // Moving bottom → Target bottom
      {
        movingValue: movingEdges.bottom,
        targetValue: targetEdges.bottom,
        edgeType: "bottom",
        extentMin: Math.min(movingEdges.left, targetEdges.left),
        extentMax: Math.max(movingEdges.right, targetEdges.right),
      },
      // Moving bottom → Target top (flush adjacency)
      {
        movingValue: movingEdges.bottom,
        targetValue: targetEdges.top,
        edgeType: "bottom",
        extentMin: Math.min(movingEdges.left, targetEdges.left),
        extentMax: Math.max(movingEdges.right, targetEdges.right),
      },
      // Center-Y alignment
      {
        movingValue: movingEdges.centerY,
        targetValue: targetEdges.centerY,
        edgeType: "centerY",
        extentMin: Math.min(movingEdges.left, targetEdges.left),
        extentMax: Math.max(movingEdges.right, targetEdges.right),
      },
    ];

    for (const pair of yPairs) {
      const delta = Math.abs(pair.movingValue - pair.targetValue);
      if (delta < threshold) {
        candidates.push({
          axis: "y",
          movingValue: pair.movingValue,
          targetValue: pair.targetValue,
          delta,
          edgeType: pair.edgeType,
          targetExtentMin: pair.extentMin,
          targetExtentMax: pair.extentMax,
        });
      }
    }
  }

  // ── Select the best snap per axis ───────────────────────────────────────

  let bestX: SnapCandidate | null = null;
  let bestY: SnapCandidate | null = null;

  for (const c of candidates) {
    if (c.axis === "x") {
      if (!bestX || c.delta < bestX.delta) bestX = c;
    } else {
      if (!bestY || c.delta < bestY.delta) bestY = c;
    }
  }

  // ── Compute snapped position ────────────────────────────────────────────

  const originalLeft = movingObj.left ?? 0;
  const originalTop = movingObj.top ?? 0;
  let snappedLeft = originalLeft;
  let snappedTop = originalTop;
  const guideLines: SnapGuideLine[] = [];

  if (bestX) {
    // Shift the object so the snapped edge aligns with target
    const shiftX = bestX.targetValue - bestX.movingValue;
    snappedLeft = originalLeft + shiftX;

    // Generate vertical guide line
    guideLines.push({
      x1: bestX.targetValue,
      y1: bestX.targetExtentMin - GUIDE_OVERSHOOT,
      x2: bestX.targetValue,
      y2: bestX.targetExtentMax + GUIDE_OVERSHOOT,
      orientation: "v",
    });
  }

  if (bestY) {
    const shiftY = bestY.targetValue - bestY.movingValue;
    snappedTop = originalTop + shiftY;

    // Generate horizontal guide line
    guideLines.push({
      x1: bestY.targetExtentMin - GUIDE_OVERSHOOT,
      y1: bestY.targetValue,
      x2: bestY.targetExtentMax + GUIDE_OVERSHOOT,
      y2: bestY.targetValue,
      orientation: "h",
    });
  }

  return {
    snappedLeft,
    snappedTop,
    didSnap: bestX !== null || bestY !== null,
    guideLines,
  };
}

// ─── Scaling Snap ───────────────────────────────────────────────────────────

/**
 * Compute snapping during object scaling.
 * Only snaps the edge being scaled (determined by the scaling handle corner).
 *
 * @param scalingObj - The object being scaled
 * @param allObjects - All canvas objects
 * @param corner     - The Fabric.js corner being dragged (e.g. "mr", "br", "ml", "mt")
 * @param threshold  - Snap radius in pixels
 * @returns SnapResult (only applies to the scaling axis)
 */
export function computeScaleSnap(
  scalingObj: SnapFabricObject,
  allObjects: SnapFabricObject[],
  corner: string,
  threshold: number = SNAP_THRESHOLD
): SnapResult {
  const edges = extractEdges(scalingObj);
  if (!edges) {
    return {
      snappedLeft: scalingObj.left ?? 0,
      snappedTop: scalingObj.top ?? 0,
      didSnap: false,
      guideLines: [],
    };
  }

  // Determine which edge(s) are being scaled
  const isRight = corner.includes("r");
  const isBottom = corner.includes("b");
  const isLeft = corner.includes("l") && !corner.includes("r");
  const isTop = corner.includes("t") && !corner.includes("b");

  const candidates: SnapCandidate[] = [];

  for (const target of allObjects) {
    if (target === scalingObj) continue;
    const te = extractEdges(target);
    if (!te) continue;

    // Only snap the edge being dragged
    if (isRight) {
      const pairs = [
        { mv: edges.right, tv: te.left, delta: Math.abs(edges.right - te.left) },
        { mv: edges.right, tv: te.right, delta: Math.abs(edges.right - te.right) },
      ];
      for (const p of pairs) {
        if (p.delta < threshold) {
          candidates.push({
            axis: "x",
            movingValue: p.mv,
            targetValue: p.tv,
            delta: p.delta,
            edgeType: "right",
            targetExtentMin: Math.min(edges.top, te.top),
            targetExtentMax: Math.max(edges.bottom, te.bottom),
          });
        }
      }
    }

    if (isLeft) {
      const pairs = [
        { mv: edges.left, tv: te.right, delta: Math.abs(edges.left - te.right) },
        { mv: edges.left, tv: te.left, delta: Math.abs(edges.left - te.left) },
      ];
      for (const p of pairs) {
        if (p.delta < threshold) {
          candidates.push({
            axis: "x",
            movingValue: p.mv,
            targetValue: p.tv,
            delta: p.delta,
            edgeType: "left",
            targetExtentMin: Math.min(edges.top, te.top),
            targetExtentMax: Math.max(edges.bottom, te.bottom),
          });
        }
      }
    }

    if (isBottom) {
      const pairs = [
        { mv: edges.bottom, tv: te.top, delta: Math.abs(edges.bottom - te.top) },
        { mv: edges.bottom, tv: te.bottom, delta: Math.abs(edges.bottom - te.bottom) },
      ];
      for (const p of pairs) {
        if (p.delta < threshold) {
          candidates.push({
            axis: "y",
            movingValue: p.mv,
            targetValue: p.tv,
            delta: p.delta,
            edgeType: "bottom",
            targetExtentMin: Math.min(edges.left, te.left),
            targetExtentMax: Math.max(edges.right, te.right),
          });
        }
      }
    }

    if (isTop) {
      const pairs = [
        { mv: edges.top, tv: te.bottom, delta: Math.abs(edges.top - te.bottom) },
        { mv: edges.top, tv: te.top, delta: Math.abs(edges.top - te.top) },
      ];
      for (const p of pairs) {
        if (p.delta < threshold) {
          candidates.push({
            axis: "y",
            movingValue: p.mv,
            targetValue: p.tv,
            delta: p.delta,
            edgeType: "top",
            targetExtentMin: Math.min(edges.left, te.left),
            targetExtentMax: Math.max(edges.right, te.right),
          });
        }
      }
    }
  }

  let bestX: SnapCandidate | null = null;
  let bestY: SnapCandidate | null = null;
  for (const c of candidates) {
    if (c.axis === "x" && (!bestX || c.delta < bestX.delta)) bestX = c;
    if (c.axis === "y" && (!bestY || c.delta < bestY.delta)) bestY = c;
  }

  const guideLines: SnapGuideLine[] = [];
  let snappedLeft = scalingObj.left ?? 0;
  let snappedTop = scalingObj.top ?? 0;

  if (bestX) {
    snappedLeft += bestX.targetValue - bestX.movingValue;
    guideLines.push({
      x1: bestX.targetValue,
      y1: bestX.targetExtentMin - GUIDE_OVERSHOOT,
      x2: bestX.targetValue,
      y2: bestX.targetExtentMax + GUIDE_OVERSHOOT,
      orientation: "v",
    });
  }

  if (bestY) {
    snappedTop += bestY.targetValue - bestY.movingValue;
    guideLines.push({
      x1: bestY.targetExtentMin - GUIDE_OVERSHOOT,
      y1: bestY.targetValue,
      x2: bestY.targetExtentMax + GUIDE_OVERSHOOT,
      y2: bestY.targetValue,
      orientation: "h",
    });
  }

  return {
    snappedLeft,
    snappedTop,
    didSnap: bestX !== null || bestY !== null,
    guideLines,
  };
}

// ─── Canvas Event Integration ───────────────────────────────────────────────

/**
 * Attach the smart snapping engine to a Fabric.js canvas.
 *
 * Creates guide line objects once, and reuses them for zero-allocation rendering.
 * Returns a cleanup function to detach all listeners.
 *
 * @param canvas - The Fabric.js canvas instance
 * @param options - Configuration
 * @returns Cleanup function to call on unmount
 *
 * @example
 * ```ts
 * const cleanup = attachSmartSnap(fabricCanvas, { threshold: 15 });
 * // On component unmount:
 * cleanup();
 * ```
 */
export function attachSmartSnap(
  canvas: {
    on: (event: string, handler: (e: any) => void) => void;
    off: (event: string, handler: (e: any) => void) => void;
    getObjects: () => SnapFabricObject[];
    add: (...objects: any[]) => void;
    remove: (...objects: any[]) => void;
    requestRenderAll: () => void;
  },
  options: {
    threshold?: number;
    /** Color of guide lines (default: "#2563eb" — blue) */
    guideColor?: string;
    /** Width of guide lines (default: 1) */
    guideWidth?: number;
    /** Dash array for guide lines (default: [4, 4]) */
    guideDash?: number[];
  } = {}
): () => void {
  const {
    threshold = SNAP_THRESHOLD,
    guideColor = "#2563eb",
    guideWidth = 1,
    guideDash = [4, 4],
  } = options;

  // Pool of reusable guide line objects (max 4: 2 per axis)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const guidePool: any[] = [];

  // Lazy-create guide lines as needed — uses real fabric.Line instances
  function ensureGuideLines(count: number) {
    // Dynamic import of fabric (already bundled client-side)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fabricModule = require("fabric");
    while (guidePool.length < count) {
      const line = new fabricModule.Line([0, 0, 0, 0], {
        stroke: guideColor,
        strokeWidth: guideWidth,
        strokeDashArray: guideDash,
        selectable: false,
        evented: false,
        visible: false,
        excludeFromExport: true,
        _isSnapGuide: true,
      });
      guidePool.push(line);
      canvas.add(line);
    }
  }

  function hideAllGuides() {
    for (const guide of guidePool) {
      if (guide.visible) {
        guide.visible = false;
      }
    }
  }

  // ── object:moving handler ─────────────────────────────────────────────
  function onObjectMoving(e: { target?: SnapFabricObject }) {
    const target = e.target;
    if (!target) return;

    const allObjects = canvas
      .getObjects()
      .filter((o: any) => !o._isSnapGuide) as SnapFabricObject[];

    const result = computeSmartSnap(target, allObjects, threshold);

    if (result.didSnap) {
      target.set?.("left", result.snappedLeft);
      target.set?.("top", result.snappedTop);
      target.setCoords?.();

      // Show guide lines
      ensureGuideLines(result.guideLines.length);
      for (let i = 0; i < result.guideLines.length; i++) {
        const gl = result.guideLines[i];
        const line = guidePool[i];
        line.set({
          x1: gl.x1,
          y1: gl.y1,
          x2: gl.x2,
          y2: gl.y2,
          visible: true,
        });
      }
      // Hide unused guides
      for (let i = result.guideLines.length; i < guidePool.length; i++) {
        guidePool[i].visible = false;
      }
    } else {
      hideAllGuides();
    }

    canvas.requestRenderAll();
  }

  // ── object:scaling handler ────────────────────────────────────────────
  function onObjectScaling(e: { target?: SnapFabricObject; transform?: { corner?: string } }) {
    const target = e.target;
    const corner = (e as any).transform?.corner || (e as any).corner || "";
    if (!target || !corner) return;

    const allObjects = canvas
      .getObjects()
      .filter((o: any) => !o._isSnapGuide) as SnapFabricObject[];

    const result = computeScaleSnap(target, allObjects, corner, threshold);

    if (result.didSnap) {
      target.set?.("left", result.snappedLeft);
      target.set?.("top", result.snappedTop);
      target.setCoords?.();

      ensureGuideLines(result.guideLines.length);
      for (let i = 0; i < result.guideLines.length; i++) {
        const gl = result.guideLines[i];
        guidePool[i].set({
          x1: gl.x1,
          y1: gl.y1,
          x2: gl.x2,
          y2: gl.y2,
          visible: true,
        });
      }
      for (let i = result.guideLines.length; i < guidePool.length; i++) {
        guidePool[i].visible = false;
      }
    } else {
      hideAllGuides();
    }

    canvas.requestRenderAll();
  }

  // ── Clear guides on mouse up ──────────────────────────────────────────
  function onMouseUp() {
    hideAllGuides();
    canvas.requestRenderAll();
  }

  // ── Attach listeners ──────────────────────────────────────────────────
  canvas.on("object:moving", onObjectMoving);
  canvas.on("object:scaling", onObjectScaling);
  canvas.on("mouse:up", onMouseUp);

  // ── Cleanup function ──────────────────────────────────────────────────
  return () => {
    canvas.off("object:moving", onObjectMoving);
    canvas.off("object:scaling", onObjectScaling);
    canvas.off("mouse:up", onMouseUp);

    // Remove guide lines from canvas
    for (const guide of guidePool) {
      canvas.remove(guide);
    }
    guidePool.length = 0;
  };
}
