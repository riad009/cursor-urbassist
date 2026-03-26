/**
 * useVrdDrawing.ts — VRD (Voirie et Réseaux Divers) Drawing State Machine
 *
 * PURPOSE:
 *   Provides Fabric.js multi-vertex Polyline (network pipes/cables) and
 *   Polygon (driveway/access) drawing on the cadastral 2D canvas.
 *   Required for French Building Permit PC2 compliance.
 *
 * DRAWING STATE MACHINE:
 *   1. startDrawing(type) → enter drawing mode, disable object selection
 *   2. mouse:down → add a vertex
 *   3. mouse:move → rubber-band trailing line from last vertex to cursor
 *   4. mouse:dblclick OR Escape → finalize shape, tag, re-enable selection
 *
 * TAGGING CONTRACT:
 *   All finalized objects are tagged with:
 *     - isVrd: true
 *     - vrdType: 'water' | 'electricity' | 'wastewater' | 'stormwater' | 'telecom' | 'gas' | 'access'
 *     - surfaceType: 'vrd' (networks) | 'access' (driveways)
 *     - elementName: human-readable label for the layer panel
 *
 * MEMORY SAFETY:
 *   All Fabric event listeners are removed on unmount and tool switch.
 *   Temporary objects (dots, trailing line) are cleaned up on cancel/finalize.
 */

"use client";

import { useRef, useCallback, useEffect } from "react";
import * as fabric from "fabric";

// ─── VRD Type Definitions ───────────────────────────────────────────────────

export type VrdNetworkId =
  | "water"
  | "electricity"
  | "wastewater"
  | "stormwater"
  | "telecom"
  | "gas"
  | "access";

export interface VrdTypeConfig {
  id: VrdNetworkId;
  label: string;
  /** Stroke/fill color */
  color: string;
  /** Dash pattern for polyline strokes. Null = solid line. */
  dash: number[] | null;
  /** Whether this type creates a Polygon (true) or Polyline (false). */
  isPolygon: boolean;
  /** Fill color for polygon types. Null for polylines. */
  fill: string | null;
}

export const VRD_TYPE_CONFIGS: VrdTypeConfig[] = [
  { id: "water", label: "Water Pipe (Eau)", color: "#3b82f6", dash: [10, 6], isPolygon: false, fill: null },
  { id: "electricity", label: "Electrical Line (Élec)", color: "#ef4444", dash: null, isPolygon: false, fill: null },
  { id: "wastewater", label: "Wastewater (EU)", color: "#78716c", dash: [8, 4], isPolygon: false, fill: null },
  { id: "stormwater", label: "Stormwater (EP)", color: "#0ea5e9", dash: [12, 4, 4, 4], isPolygon: false, fill: null },
  { id: "telecom", label: "Telecom", color: "#22c55e", dash: null, isPolygon: false, fill: null },
  { id: "gas", label: "Gas (Gaz)", color: "#f97316", dash: [6, 6], isPolygon: false, fill: null },
  { id: "access", label: "Driveway / Access (Accès)", color: "#9ca3af", dash: null, isPolygon: true, fill: "rgba(156, 163, 175, 0.35)" },
];

// ─── Internal State (never triggers React re-render) ────────────────────────

interface DrawingState {
  /** Currently active VRD type, or null if not drawing */
  activeType: VrdTypeConfig | null;
  /** Accumulated vertex coordinates [{x, y}, ...] */
  vertices: Array<{ x: number; y: number }>;
  /** The rubber-band trailing line from last vertex to cursor */
  trailingLine: fabric.Line | null;
  /** Small circles marking each placed vertex */
  vertexDots: fabric.Circle[];
  /** Preview polyline/polygon showing the shape so far */
  previewShape: fabric.FabricObject | null;
  /** Whether selection was enabled before we started drawing */
  prevSelectionState: boolean;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export interface UseVrdDrawingReturn {
  /** Start drawing a specific VRD type. Call this from toolbar buttons. */
  startDrawing: (typeId: VrdNetworkId) => void;
  /** Cancel the current drawing without finalizing. */
  cancelDrawing: () => void;
  /** Returns the currently active VRD type id, or null. */
  getActiveType: () => VrdNetworkId | null;
}

export function useVrdDrawing(
  fabricCanvasRef: React.RefObject<fabric.Canvas | null>,
  options?: {
    /** Called when a shape is finalized. Use for pushUndoState, updateLayers, etc. */
    onShapeFinalized?: (obj: fabric.FabricObject) => void;
    /** Stroke width in px. Default: 3. */
    strokeWidth?: number;
  }
): UseVrdDrawingReturn {
  const stateRef = useRef<DrawingState>({
    activeType: null,
    vertices: [],
    trailingLine: null,
    vertexDots: [],
    previewShape: null,
    prevSelectionState: true,
  });

  // Keep options in a ref to avoid stale closures
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // ── Cleanup temporary canvas objects ──

  const cleanupTemporaries = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const s = stateRef.current;

    // Remove trailing line
    if (s.trailingLine) {
      canvas.remove(s.trailingLine);
      s.trailingLine = null;
    }

    // Remove vertex dots
    if (s.vertexDots.length > 0) {
      canvas.remove(...s.vertexDots);
      s.vertexDots = [];
    }

    // Remove preview shape
    if (s.previewShape) {
      canvas.remove(s.previewShape);
      s.previewShape = null;
    }

    canvas.requestRenderAll();
  }, [fabricCanvasRef]);

  // ── Update the preview shape (polyline or polygon outline) ──

  const updatePreviewShape = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    const s = stateRef.current;
    if (!canvas || !s.activeType || s.vertices.length < 2) return;

    // Remove old preview
    if (s.previewShape) {
      canvas.remove(s.previewShape);
    }

    const points = s.vertices.map((v) => ({ x: v.x, y: v.y }));

    if (s.activeType.isPolygon) {
      // Polygon preview — semi-transparent fill
      const poly = new fabric.Polygon(points, {
        fill: s.activeType.fill ?? "rgba(156,163,175,0.2)",
        stroke: s.activeType.color,
        strokeWidth: 2,
        strokeDashArray: [4, 4],
        selectable: false,
        evented: false,
        objectCaching: false,
      });
      (poly as any).excludeFromExport = true;
      (poly as any)._isVrdPreview = true;
      s.previewShape = poly;
      canvas.add(poly);
      canvas.sendObjectToBack(poly);
    } else {
      // Polyline preview — stroke only
      const polyline = new fabric.Polyline(points, {
        fill: "transparent",
        stroke: s.activeType.color,
        strokeWidth: optionsRef.current?.strokeWidth ?? 3,
        strokeDashArray: s.activeType.dash ?? undefined,
        selectable: false,
        evented: false,
        objectCaching: false,
      });
      (polyline as any).excludeFromExport = true;
      (polyline as any)._isVrdPreview = true;
      s.previewShape = polyline;
      canvas.add(polyline);
    }
  }, [fabricCanvasRef]);

  // ── Add a vertex dot ──

  const addVertexDot = useCallback(
    (x: number, y: number) => {
      const canvas = fabricCanvasRef.current;
      const s = stateRef.current;
      if (!canvas || !s.activeType) return;

      const dot = new fabric.Circle({
        left: x,
        top: y,
        radius: 4,
        fill: s.activeType.color,
        stroke: "#ffffff",
        strokeWidth: 1.5,
        originX: "center",
        originY: "center",
        selectable: false,
        evented: false,
        objectCaching: false,
      });
      (dot as any).excludeFromExport = true;
      (dot as any)._isVrdPreview = true;

      s.vertexDots.push(dot);
      canvas.add(dot);
    },
    [fabricCanvasRef]
  );

  // ── Finalize the shape ──

  const finalizeShape = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    const s = stateRef.current;
    if (!canvas || !s.activeType) return;

    const minVertices = s.activeType.isPolygon ? 3 : 2;
    if (s.vertices.length < minVertices) {
      // Not enough vertices — cancel instead
      cleanupTemporaries();
      s.vertices = [];
      s.activeType = null;
      canvas.selection = s.prevSelectionState;
      canvas.defaultCursor = "default";
      canvas.requestRenderAll();
      return;
    }

    // Clean up all temporary objects BEFORE adding the final shape
    cleanupTemporaries();

    const points = s.vertices.map((v) => ({ x: v.x, y: v.y }));
    const sw = optionsRef.current?.strokeWidth ?? 3;
    const shapeId = `vrd-${s.activeType.id}-${Date.now()}`;

    let finalObj: fabric.FabricObject;

    if (s.activeType.isPolygon) {
      // Driveway / Access — Polygon
      const polygon = new fabric.Polygon(points, {
        fill: s.activeType.fill ?? "rgba(156, 163, 175, 0.35)",
        stroke: s.activeType.color,
        strokeWidth: 2,
        selectable: true,
        evented: true,
      });
      // Tag the object
      (polygon as any).id = shapeId;
      (polygon as any).isVrd = true;
      (polygon as any).vrdType = s.activeType.id;
      (polygon as any).surfaceType = "access";
      (polygon as any).elementName = s.activeType.label;

      finalObj = polygon;
    } else {
      // Network pipe / cable — Polyline
      const polyline = new fabric.Polyline(points, {
        fill: "transparent",
        stroke: s.activeType.color,
        strokeWidth: sw,
        strokeDashArray: s.activeType.dash ?? undefined,
        strokeLineCap: "round",
        strokeLineJoin: "round",
        selectable: true,
        evented: true,
      });
      // Tag the object
      (polyline as any).id = shapeId;
      (polyline as any).isVrd = true;
      (polyline as any).vrdType = s.activeType.id;
      (polyline as any).surfaceType = "vrd";
      (polyline as any).elementName = s.activeType.label;

      finalObj = polyline;
    }

    canvas.add(finalObj);
    canvas.setActiveObject(finalObj);
    canvas.requestRenderAll();

    // Notify parent (undo, layers update, etc.)
    optionsRef.current?.onShapeFinalized?.(finalObj);

    // Reset state
    s.vertices = [];
    s.activeType = null;
    canvas.selection = s.prevSelectionState;
    canvas.defaultCursor = "default";
  }, [fabricCanvasRef, cleanupTemporaries]);

  // ── EVENT HANDLERS (bound to Fabric canvas) ───────────────────────────

  const handlersRef = useRef<{
    mouseDown: ((e: fabric.TPointerEventInfo) => void) | null;
    mouseMove: ((e: fabric.TPointerEventInfo) => void) | null;
    mouseDblClick: ((e: fabric.TPointerEventInfo) => void) | null;
    keyDown: ((e: KeyboardEvent) => void) | null;
  }>({
    mouseDown: null,
    mouseMove: null,
    mouseDblClick: null,
    keyDown: null,
  });

  const detachHandlers = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const h = handlersRef.current;

    if (h.mouseDown) canvas.off("mouse:down", h.mouseDown);
    if (h.mouseMove) canvas.off("mouse:move", h.mouseMove);
    if (h.mouseDblClick) canvas.off("mouse:dblclick", h.mouseDblClick);
    if (h.keyDown) document.removeEventListener("keydown", h.keyDown);

    h.mouseDown = null;
    h.mouseMove = null;
    h.mouseDblClick = null;
    h.keyDown = null;
  }, [fabricCanvasRef]);

  const attachHandlers = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // ── mouse:down — add a vertex ──
    const onMouseDown = (e: fabric.TPointerEventInfo) => {
      const s = stateRef.current;
      if (!s.activeType) return;

      const pointer = canvas.getScenePoint(e.e);
      const x = pointer.x;
      const y = pointer.y;

      s.vertices.push({ x, y });

      // Place a vertex dot
      addVertexDot(x, y);

      // Update the preview shape
      updatePreviewShape();

      // Create/update the trailing line
      if (s.trailingLine) {
        canvas.remove(s.trailingLine);
      }
      const trail = new fabric.Line([x, y, x, y], {
        stroke: s.activeType.color,
        strokeWidth: 1.5,
        strokeDashArray: [4, 3],
        selectable: false,
        evented: false,
        objectCaching: false,
      });
      (trail as any).excludeFromExport = true;
      (trail as any)._isVrdPreview = true;
      s.trailingLine = trail;
      canvas.add(trail);

      canvas.requestRenderAll();
    };

    // ── mouse:move — rubber-band trailing line ──
    const onMouseMove = (e: fabric.TPointerEventInfo) => {
      const s = stateRef.current;
      if (!s.activeType || s.vertices.length === 0 || !s.trailingLine) return;

      const pointer = canvas.getScenePoint(e.e);

      // Update trailing line endpoint
      s.trailingLine.set({ x2: pointer.x, y2: pointer.y });
      s.trailingLine.setCoords();
      canvas.requestRenderAll();
    };

    // ── mouse:dblclick — finalize shape ──
    const onMouseDblClick = (e: fabric.TPointerEventInfo) => {
      const s = stateRef.current;
      if (!s.activeType) return;

      // Double-click adds a vertex then finalizes — remove the duplicate
      // vertex that was just added by the preceding mouse:down
      if (s.vertices.length > 1) {
        const lastV = s.vertices[s.vertices.length - 1];
        const prevV = s.vertices[s.vertices.length - 2];
        const dist = Math.sqrt((lastV.x - prevV.x) ** 2 + (lastV.y - prevV.y) ** 2);
        if (dist < 5) {
          // Likely the dblclick duplicate — pop it
          s.vertices.pop();
          if (s.vertexDots.length > 0) {
            const lastDot = s.vertexDots.pop();
            if (lastDot) canvas.remove(lastDot);
          }
        }
      }

      finalizeShape();
    };

    // ── Escape key — cancel drawing ──
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const s = stateRef.current;
        if (s.activeType) {
          cleanupTemporaries();
          s.vertices = [];
          s.activeType = null;
          canvas.selection = s.prevSelectionState;
          canvas.defaultCursor = "default";
          canvas.requestRenderAll();
        }
      }
      // Enter key finalizes (alternative to dblclick)
      if (e.key === "Enter") {
        const s = stateRef.current;
        if (s.activeType && s.vertices.length >= 2) {
          finalizeShape();
        }
      }
    };

    // Store and attach
    handlersRef.current.mouseDown = onMouseDown;
    handlersRef.current.mouseMove = onMouseMove;
    handlersRef.current.mouseDblClick = onMouseDblClick;
    handlersRef.current.keyDown = onKeyDown;

    canvas.on("mouse:down", onMouseDown);
    canvas.on("mouse:move", onMouseMove);
    canvas.on("mouse:dblclick", onMouseDblClick);
    document.addEventListener("keydown", onKeyDown);
  }, [fabricCanvasRef, addVertexDot, updatePreviewShape, finalizeShape, cleanupTemporaries]);

  // ── PUBLIC API ────────────────────────────────────────────────────────

  const startDrawing = useCallback(
    (typeId: VrdNetworkId) => {
      const canvas = fabricCanvasRef.current;
      if (!canvas) return;

      const config = VRD_TYPE_CONFIGS.find((c) => c.id === typeId);
      if (!config) {
        console.warn(`[useVrdDrawing] Unknown VRD type: ${typeId}`);
        return;
      }

      // If already drawing, cancel first
      const s = stateRef.current;
      if (s.activeType) {
        cleanupTemporaries();
        detachHandlers();
        s.vertices = [];
      }

      // Save & disable selection
      s.prevSelectionState = canvas.selection ?? true;
      canvas.selection = false;
      canvas.discardActiveObject();
      canvas.defaultCursor = "crosshair";

      // Set the active type
      s.activeType = config;
      s.vertices = [];

      // Attach event handlers
      attachHandlers();

      canvas.requestRenderAll();
    },
    [fabricCanvasRef, cleanupTemporaries, detachHandlers, attachHandlers]
  );

  const cancelDrawing = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    const s = stateRef.current;

    cleanupTemporaries();
    detachHandlers();

    s.vertices = [];
    s.activeType = null;

    if (canvas) {
      canvas.selection = s.prevSelectionState;
      canvas.defaultCursor = "default";
      canvas.requestRenderAll();
    }
  }, [fabricCanvasRef, cleanupTemporaries, detachHandlers]);

  const getActiveType = useCallback((): VrdNetworkId | null => {
    return stateRef.current.activeType?.id ?? null;
  }, []);

  // ── Cleanup on unmount ──

  useEffect(() => {
    return () => {
      cleanupTemporaries();
      detachHandlers();
    };
  }, [cleanupTemporaries, detachHandlers]);

  return { startDrawing, cancelDrawing, getActiveType };
}
