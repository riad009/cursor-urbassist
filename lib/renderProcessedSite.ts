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

// ─── Tag names for selective clearing ────────────────────────────────────────

const TAG_BOUNDARY = "processedBoundary";
const TAG_EDGE_LABEL = "processedEdgeLabel";
const TAG_VERTEX_LABEL = "processedVertexLabel";
const TAG_VERTEX_DOT = "processedVertexDot";

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
}

// ─── Clear previously rendered processed layers ──────────────────────────────

export function clearProcessedLayers(canvas: FabricCanvas): void {
  const tags = [TAG_BOUNDARY, TAG_PARCEL, TAG_EDGE_LABEL, TAG_VERTEX_LABEL, TAG_VERTEX_DOT];
  const toRemove = canvas.getObjects().filter((obj) =>
    tags.some((tag) => obj[tag] === true)
  );
  if (toRemove.length > 0) {
    canvas.remove(...toRemove);
  }
}

// ─── Main Render Function ────────────────────────────────────────────────────

/**
 * Render the fully processed site data onto a Fabric.js canvas.
 *
 * RENDERS ONLY:
 *   1. Global boundary polygon (unified, CAD-styled)
 *   2. Edge measurement labels ("14.5m")
 *   3. NGF elevation labels at vertices ("NGF: 12.3m")
 *
 * DOES NOT RENDER:
 *   - Individual parcels (FORBIDDEN per client mandate)
 */
export function renderProcessedSite(
  fabric: FabricStatic,
  canvas: FabricCanvas,
  data: ProcessedSiteData,
  options: CanvasProjectionOptions
): ProjectedSiteData {
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

  return projected;
}
