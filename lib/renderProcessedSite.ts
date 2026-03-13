/**
 * renderProcessedSite — Fabric.js rendering of ProcessedSiteData
 *
 * Renders:
 *   - Individual parcel polygons with distinct colors (matching 3D viewer palette)
 *   - Unified globalBoundary as dashed overlay on top
 *   - Edge measurement labels at midpoints ("14.5m")
 *   - NGF elevation labels at corner vertices ("NGF: 12.3m")
 *
 * All objects are tagged with metadata for selective clearing.
 */

import type {
  ProcessedSiteData,
  CanvasProjectionOptions,
  ProjectedSiteData,
} from "@/types/processed-site-data";
import { projectToCanvas } from "@/lib/projectToCanvas";
import {
  computePolygonOffset,
  classifyBoundaryEdges,
  toEdgeSetbacks,
  type Point2D,
  type EdgeSetback,
  type SetbackResult,
} from "@/lib/polygon-offset";
import { polygonToSetbackSegments, type SetbackSegment } from "@/lib/setback-snap";

// ─── CAD Styling Constants ───────────────────────────────────────────────────

const BOUNDARY_STYLE = {
  fill: "rgba(248, 250, 252, 0.35)",   // #f8fafc at 35% — subtle architectural
  stroke: "#1e293b",                    // Dark slate border
  strokeWidth: 3,
};

const EDGE_LABEL_STYLE = {
  fontSize: 11,
  fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
  fontWeight: "600" as const,
  fill: "#1e293b",
  backgroundColor: "rgba(255, 255, 255, 0.92)",
  padding: 4,
};

const VERTEX_LABEL_STYLE = {
  fontSize: 10,
  fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
  fontWeight: "bold" as const,
  fill: "#334155",                       // Slate-700
  backgroundColor: "rgba(241, 245, 249, 0.95)",  // Slate-100
  padding: 3,
};

const VERTEX_DOT_STYLE = {
  radius: 4,
  fill: "#334155",                       // Slate-700
  stroke: "#ffffff",
  strokeWidth: 1.5,
};

// ─── Setback Styling Constants ───────────────────────────────────────────────

const SETBACK_STYLE = {
  front: { stroke: "#ef4444", label: "#991b1b" },  // Red: road setback
  side:  { stroke: "#3b82f6", label: "#1e3a5f" },  // Blue: neighbor setback
  rear:  { stroke: "#8b5cf6", label: "#4c1d95" },  // Violet: rear setback
};

// ─── Tag names for selective clearing ────────────────────────────────────────

const TAG_BOUNDARY = "processedBoundary";
const TAG_EDGE_LABEL = "processedEdgeLabel";
const TAG_VERTEX_LABEL = "processedVertexLabel";
const TAG_VERTEX_DOT = "processedVertexDot";
const TAG_SETBACK = "processedSetback";
const TAG_SETBACK_LABEL = "processedSetbackLabel";

// For backwards-compat clearing: also clear old parcel tags
const TAG_PARCEL = "processedParcel";

// ─── Minimal Fabric.js interfaces ────────────────────────────────────────────

interface FabricCanvas {
  add(...objects: FabricObject[]): void;
  getObjects(): FabricObject[];
  remove(...objects: FabricObject[]): void;
  requestRenderAll(): void;
  setViewportTransform(matrix: number[]): void;
  getWidth(): number;
  getHeight(): number;
}

interface FabricObject {
  [key: string]: unknown;
}

interface FabricStatic {
  Polygon: new (
    points: Array<{ x: number; y: number }>,
    options: Record<string, unknown>
  ) => FabricObject;
  Text: new (text: string, options: Record<string, unknown>) => FabricObject;
  Circle: new (options: Record<string, unknown>) => FabricObject;
  Line: new (coords: number[], options: Record<string, unknown>) => FabricObject;
}

// ─── Clear previously rendered processed layers ──────────────────────────────

export function clearProcessedLayers(canvas: FabricCanvas): void {
  const tags = [TAG_BOUNDARY, TAG_PARCEL, TAG_EDGE_LABEL, TAG_VERTEX_LABEL, TAG_VERTEX_DOT, TAG_SETBACK, TAG_SETBACK_LABEL];
  const toRemove = canvas.getObjects().filter((obj) =>
    tags.some((tag) => obj[tag] === true)
  );
  if (toRemove.length > 0) {
    canvas.remove(...toRemove);
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SetbackConfig {
  /** PLU setback distances in metres */
  front: number;
  side: number;
  rear: number;
  /** Optional: indices of boundary edges that face a road */
  roadEdgeIndices?: number[];
}

export interface RenderResult extends ProjectedSiteData {
  /** Setback segments for the snap engine */
  setbackSegments: SetbackSegment[];
  /** Computed setback result for debugging */
  setbackResult: SetbackResult | null;
}

// ─── Main Render Function ────────────────────────────────────────────────────

/**
 * Render the fully processed site data onto a Fabric.js canvas.
 *
 * RENDERS:
 *   1. Individual parcel polygons with distinct colors
 *   2. Global boundary polygon (unified, CAD-styled)
 *   3. Parametric setback / buildable zone (dashed interior line)
 *   4. Edge measurement labels ("14.5m")
 *   5. NGF elevation labels at vertices ("NGF: 12.3m")
 */
export function renderProcessedSite(
  fabric: FabricStatic,
  canvas: FabricCanvas,
  data: ProcessedSiteData,
  options: CanvasProjectionOptions,
  setbackConfig?: SetbackConfig
): RenderResult {
  // ── Step 1: Project all data to canvas coordinates ────────────────────────
  const projected = projectToCanvas(data, options);

  // ── Step 2: Clear any previous processed layers ───────────────────────────
  clearProcessedLayers(canvas);

  // ── Step 3: Draw individual parcel polygons ────────────────────────────────
  // Each parcel gets a distinct color (matching the 3D viewer palette)
  const PARCEL_COLORS = [
    { fill: "rgba(96, 165, 250, 0.25)",  stroke: "#3b82f6" },   // Blue
    { fill: "rgba(52, 211, 153, 0.25)",  stroke: "#10b981" },   // Emerald
    { fill: "rgba(251, 191, 36, 0.20)",  stroke: "#f59e0b" },   // Amber
    { fill: "rgba(167, 139, 250, 0.25)", stroke: "#8b5cf6" },   // Violet
    { fill: "rgba(244, 114, 182, 0.20)", stroke: "#ec4899" },   // Pink
    { fill: "rgba(45, 212, 191, 0.25)",  stroke: "#14b8a6" },   // Teal
  ];

  projected.parcels.forEach((parcel, idx) => {
    if (parcel.points.length < 3) return;
    const pal = PARCEL_COLORS[idx % PARCEL_COLORS.length];
    const parcelPoly = new fabric.Polygon(parcel.points, {
      left: parcel.left,
      top: parcel.top,
      originX: "center",
      originY: "center",
      fill: pal.fill,
      stroke: pal.stroke,
      strokeWidth: 2,
      strokeLineJoin: "round",
      objectCaching: false,
      selectable: false,
      evented: false,
      [TAG_PARCEL]: true,
      isParcel: true,
      elementType: "parcel",
      elementName: parcel.section && parcel.number
        ? `Parcelle ${parcel.section} ${parcel.number}`
        : `Parcelle ${idx + 1}`,
    });
    canvas.add(parcelPoly);
  });

  // ── Step 3b: Draw global boundary as dashed overlay on top ────────────────
  const boundaryPoly = new fabric.Polygon(projected.boundary.points, {
    left: projected.boundary.left,
    top: projected.boundary.top,
    originX: "center",
    originY: "center",
    fill: BOUNDARY_STYLE.fill,
    stroke: BOUNDARY_STYLE.stroke,
    strokeWidth: BOUNDARY_STYLE.strokeWidth,
    strokeDashArray: [10, 5],                // Dashed line for property boundary
    strokeLineJoin: "miter",
    strokeLineCap: "square",
    objectCaching: false,
    selectable: false,
    evented: false,
    [TAG_BOUNDARY]: true,
    isParcel: true,  // Legacy compat: used by guards in page.tsx
    elementType: "globalBoundary",
    elementName: "Limite de propriété",
  });
  canvas.add(boundaryPoly);

  // ── Step 3c: Draw parametric setback / buildable zone ───────────────────
  let setbackSegments: SetbackSegment[] = [];
  let setbackResult: SetbackResult | null = null;

  if (setbackConfig && projected.boundary.points.length >= 3) {
    // Convert projected boundary from centroid-relative to absolute canvas coords
    const absBoundaryPts: Point2D[] = projected.boundary.points.map((p) => ({
      x: p.x + projected.boundary.left,
      y: p.y + projected.boundary.top,
    }));

    // Classify each edge as front/side/rear
    const classified = classifyBoundaryEdges(
      absBoundaryPts,
      setbackConfig,
      options.pixelsPerMeter,
      setbackConfig.roadEdgeIndices
    );

    // Convert to pixel-based setbacks
    const edgeSetbacks = toEdgeSetbacks(classified, options.pixelsPerMeter);

    // Compute the inset polygon
    setbackResult = computePolygonOffset(absBoundaryPts, edgeSetbacks);

    if (setbackResult.points.length >= 3) {
      // Compute centroid of inset polygon for Fabric.js positioning
      const n = setbackResult.points.length;
      const insetCx = setbackResult.points.reduce((s, p) => s + p.x, 0) / n;
      const insetCy = setbackResult.points.reduce((s, p) => s + p.y, 0) / n;
      const relativeInset = setbackResult.points.map((p) => ({
        x: p.x - insetCx,
        y: p.y - insetCy,
      }));

      // Draw the buildable zone polygon (dashed)
      const insetPoly = new fabric.Polygon(relativeInset, {
        left: insetCx,
        top: insetCy,
        originX: "center",
        originY: "center",
        fill: "rgba(59, 130, 246, 0.04)",
        stroke: "#3b82f6",
        strokeWidth: 2,
        strokeDashArray: [6, 4],
        strokeLineJoin: "miter",
        strokeLineCap: "butt",
        objectCaching: false,
        selectable: false,
        evented: false,
        [TAG_SETBACK]: true,
        elementType: "setbackZone",
        elementName: "Zone constructible",
      });
      canvas.add(insetPoly);

      // Draw individual setback edge lines with type-specific colors
      for (let i = 0; i < setbackResult.points.length; i++) {
        const j = (i + 1) % setbackResult.points.length;
        const edgeType = setbackResult.edgeTypes[i] || "side";
        const style = SETBACK_STYLE[edgeType];

        const line = new fabric.Line(
          [
            setbackResult.points[i].x,
            setbackResult.points[i].y,
            setbackResult.points[j].x,
            setbackResult.points[j].y,
          ],
          {
            stroke: style.stroke,
            strokeWidth: 2.5,
            strokeDashArray: [5, 5],
            selectable: false,
            evented: false,
            [TAG_SETBACK]: true,
          }
        );
        canvas.add(line);
      }

      // Draw setback labels ("Recul 5m")
      setbackResult.labels.forEach((label) => {
        const edgeType = setbackResult!.edgeTypes[0] || "side";
        const style = SETBACK_STYLE[edgeType];

        const textObj = new fabric.Text(label.text, {
          left: label.position.x,
          top: label.position.y,
          fontSize: 9,
          fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
          fontWeight: "600",
          fill: style.label,
          backgroundColor: "rgba(255, 255, 255, 0.85)",
          padding: 3,
          angle: (label.angle * 180) / Math.PI,
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
          [TAG_SETBACK_LABEL]: true,
        });
        canvas.add(textObj);
      });

      // Convert to segments for the snap engine
      setbackSegments = polygonToSetbackSegments(
        setbackResult.points,
        setbackResult.edgeTypes
      );
    }
  }

  // ── Step 4: Draw edge measurement labels ──────────────────────────────────
  projected.edgeLabels.forEach((label) => {
    const textObj = new fabric.Text(label.text, {
      left: label.position.x,
      top: label.position.y,
      ...EDGE_LABEL_STYLE,
      angle: (label.angle * 180) / Math.PI, // Fabric uses degrees
      originX: "center",
      originY: "center",
      selectable: false,
      evented: false,
      [TAG_EDGE_LABEL]: true,
    });
    canvas.add(textObj);
  });

  // ── Step 5: Draw NGF elevation labels + vertex dots ───────────────────────
  projected.vertexLabels.forEach((label) => {
    // Small circle at vertex position
    const dot = new fabric.Circle({
      left: label.position.x,
      top: label.position.y,
      radius: VERTEX_DOT_STYLE.radius,
      fill: VERTEX_DOT_STYLE.fill,
      stroke: VERTEX_DOT_STYLE.stroke,
      strokeWidth: VERTEX_DOT_STYLE.strokeWidth,
      originX: "center",
      originY: "center",
      selectable: false,
      evented: false,
      [TAG_VERTEX_DOT]: true,
    });
    canvas.add(dot);

    // Elevation text label (offset to avoid overlapping the dot)
    const textObj = new fabric.Text(label.text, {
      left: label.position.x + 8,
      top: label.position.y - 12,
      ...VERTEX_LABEL_STYLE,
      originX: "left",
      originY: "bottom",
      selectable: false,
      evented: false,
      [TAG_VERTEX_LABEL]: true,
    });
    canvas.add(textObj);
  });

  // ── Step 6: Request render ────────────────────────────────────────────────
  canvas.requestRenderAll();

  return {
    ...projected,
    setbackSegments,
    setbackResult,
  };
}
