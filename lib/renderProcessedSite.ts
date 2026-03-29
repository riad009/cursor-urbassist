/**
 * renderProcessedSite — Fabric.js rendering of ProcessedSiteData (v5)
 *
 * KEY CHANGES in v5:
 *   - Each parcel is rendered as a single fabric.Group containing the polygon,
 *     all dimension labels, vertex markers, and "Limite de propriété" text.
 *     This means the ENTIRE parcel moves as one atomic unit when dragged.
 *   - Groups are non-selectable/non-evented (system overlays), tagged for clearing.
 *   - Auto-zoom is now driven by actual parcel absolutePoints, not merged boundary.
 *
 * AESTHETIC (French cadastral "Plan de masse"):
 *   - Light mint green fill per parcel
 *   - Red dashed border (#dc2626) — "Limite de propriété"
 *   - Red italic dimension labels along each edge
 *   - Small "+" vertex markers at each parcel corner
 *   - "Limite de propriété" text along outer edges (> 8m)
 *   - NGF elevation labels (subtle)
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

// ─── Image 3 Matching Styles ─────────────────────────────────────────────────

/** Parcel boundary: red dashed "Limite de propriété" */
const PARCEL_BORDER = {
  stroke: "#dc2626",             // Red-600 — exact French cadastral red
  strokeWidth: 2.5,
  strokeDashArray: [8, 4],
  strokeLineJoin: "miter" as const,
  strokeLineCap: "butt" as const,
  miterLimit: 12,
};

/** Parcel fill: light mint green */
const PARCEL_FILL = "rgba(134, 239, 172, 0.25)";

/** Per-parcel dimension label: red italic text */
const DIMENSION_LABEL = {
  fontSize: 11,
  fontFamily: "'Inter', system-ui, sans-serif",
  fontWeight: "600" as const,
  fontStyle: "italic" as const,
  fill: "#dc2626",
};

/** Vertex marker style */
const VERTEX_MARKER = {
  radius: 3.5,
  fill: "transparent",
  stroke: "#dc2626",
  strokeWidth: 1.5,
};

/** NGF elevation label */
const ELEVATION_LABEL = {
  fontSize: 9,
  fontFamily: "'Inter', system-ui, sans-serif",
  fontWeight: "600" as const,
  fill: "#64748b",
  backgroundColor: "rgba(15, 23, 42, 0.65)",
  padding: 3,
};

/** "Limite de propriété" edge text */
const BOUNDARY_LABEL = {
  fontSize: 8,
  fontFamily: "'Inter', system-ui, sans-serif",
  fontWeight: "400" as const,
  fontStyle: "italic" as const,
  fill: "#dc2626",
};

// ─── Tag names for selective clearing ────────────────────────────────────────

const TAG_PARCEL_GROUP = "processedParcelGroup";
const TAG_VERTEX_LABEL = "processedVertexLabel";

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
  Group: new (
    objects: FabricObject[],
    options: Record<string, unknown>
  ) => FabricObject;
}

// ─── Clear previously rendered processed layers ──────────────────────────────

export function clearProcessedLayers(canvas: FabricCanvas): void {
  const toRemove = canvas.getObjects().filter((obj) =>
    obj[TAG_PARCEL_GROUP] === true ||
    obj[TAG_VERTEX_LABEL] === true ||
    obj["isBoundaryOverlay"] === true ||
    obj["isMerged"] === true ||
    // Legacy tags from v4
    obj["processedBoundary"] === true ||
    obj["processedEdgeLabel"] === true ||
    obj["processedVertexDot"] === true ||
    obj["processedSetback"] === true ||
    obj["processedSetbackLabel"] === true ||
    obj["processedParcel"] === true ||
    obj["processedParcelDimension"] === true ||
    obj["processedBoundaryText"] === true
  );
  if (toRemove.length > 0) {
    canvas.remove(...toRemove);
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SetbackConfig {
  front: number;
  side: number;
  rear: number;
  roadEdgeIndices?: number[];
}

export interface RenderResult extends ProjectedSiteData {
  setbackSegments: SetbackSegment[];
  setbackResult: SetbackResult | null;
}

// ─── Main Render Function ────────────────────────────────────────────────────

/**
 * Render ONLY the user's selected parcels — matching Image 3 exactly.
 *
 * v5: Each parcel is a single fabric.Group so it moves as one atomic unit.
 *
 * RENDERS:
 *   1. Per-parcel Group: polygon + edge dimensions + vertex markers + "Limite" text
 *   2. NGF elevation labels (standalone, subtle)
 *
 * DOES NOT RENDER:
 *   ✗ Global boundary polygon
 *   ✗ Setback/buildable zone polygon
 *   ✗ Any decorations outside the parcel groups
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

  // ── Step 3: Build and add one Group per parcel ────────────────────────────
  projected.parcels.forEach((parcel, idx) => {
    if (parcel.points.length < 3) return;

    const groupObjects: FabricObject[] = [];

    // 3a: The parcel polygon (points are centroid-relative for Fabric)
    const parcelPoly = new fabric.Polygon(parcel.points, {
      left: 0,
      top: 0,
      originX: "center",
      originY: "center",
      fill: PARCEL_FILL,
      stroke: PARCEL_BORDER.stroke,
      strokeWidth: PARCEL_BORDER.strokeWidth,
      strokeDashArray: [...PARCEL_BORDER.strokeDashArray],
      strokeLineJoin: PARCEL_BORDER.strokeLineJoin,
      strokeLineCap: PARCEL_BORDER.strokeLineCap,
      miterLimit: PARCEL_BORDER.miterLimit,
      objectCaching: false,
      selectable: false,
      evented: false,
    });
    groupObjects.push(parcelPoly);

    // 3b: Per-parcel edge dimension labels
    if (parcel.edgeLabels && parcel.edgeLabels.length > 0) {
      parcel.edgeLabels.forEach((edgeLabel) => {
        // Convert absolute canvas coords to group-relative (centroid-relative)
        const localX = edgeLabel.position.x - parcel.left;
        const localY = edgeLabel.position.y - parcel.top;

        const textObj = new fabric.Text(edgeLabel.text, {
          left: localX,
          top: localY,
          ...DIMENSION_LABEL,
          angle: (edgeLabel.angle * 180) / Math.PI,
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
        });
        groupObjects.push(textObj);

        // 3c: "Limite de propriété" text — only on longer edges (> 8m)
        if (edgeLabel.lengthMeters >= 8) {
          const offsetFactor = 1.6;
          const midX = (edgeLabel.from.x + edgeLabel.to.x) / 2;
          const midY = (edgeLabel.from.y + edgeLabel.to.y) / 2;
          const dx = edgeLabel.position.x - midX;
          const dy = edgeLabel.position.y - midY;
          const outAbsX = midX + dx * offsetFactor;
          const outAbsY = midY + dy * offsetFactor;
          const outLocalX = outAbsX - parcel.left;
          const outLocalY = outAbsY - parcel.top;

          const limiteText = new fabric.Text("Limite de propriété", {
            left: outLocalX,
            top: outLocalY,
            ...BOUNDARY_LABEL,
            angle: (edgeLabel.angle * 180) / Math.PI,
            originX: "center",
            originY: "center",
            selectable: false,
            evented: false,
          });
          groupObjects.push(limiteText);
        }
      });
    }

    // 3d: Vertex markers at parcel corners
    if (parcel.absolutePoints && parcel.absolutePoints.length > 0) {
      const drawnKeys = new Set<string>();
      parcel.absolutePoints.forEach((pt) => {
        const key = `${Math.round(pt.x * 2)},${Math.round(pt.y * 2)}`;
        if (drawnKeys.has(key)) return;
        drawnKeys.add(key);

        const localX = pt.x - parcel.left;
        const localY = pt.y - parcel.top;
        const armLen = 5;

        const marker = new fabric.Circle({
          left: localX,
          top: localY,
          radius: VERTEX_MARKER.radius,
          fill: VERTEX_MARKER.fill,
          stroke: VERTEX_MARKER.stroke,
          strokeWidth: VERTEX_MARKER.strokeWidth,
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
        });
        groupObjects.push(marker);

        const hLine = new fabric.Line(
          [localX - armLen, localY, localX + armLen, localY],
          {
            stroke: VERTEX_MARKER.stroke,
            strokeWidth: 1,
            selectable: false,
            evented: false,
          }
        );
        const vLine = new fabric.Line(
          [localX, localY - armLen, localX, localY + armLen],
          {
            stroke: VERTEX_MARKER.stroke,
            strokeWidth: 1,
            selectable: false,
            evented: false,
          }
        );
        groupObjects.push(hLine, vLine);
      });
    }

    // 3e: Build the group — positioned at the parcel centroid
    if (groupObjects.length > 0) {
      const group = new fabric.Group(groupObjects, {
        left: parcel.left,
        top: parcel.top,
        originX: "center",
        originY: "center",
        selectable: false,
        evented: false,
        objectCaching: false,
        [TAG_PARCEL_GROUP]: true,
        excludeFromExport: true,
        isParcel: true,
        elementType: "parcel",
        elementName: parcel.section && parcel.number
          ? `Parcelle ${parcel.section} ${parcel.number}`
          : `Parcelle ${idx + 1}`,
      });
      canvas.add(group);
    }
  });

  // ── Step 4: Setback computation (for snap engine only — NOT drawn) ─────────
  let setbackSegments: SetbackSegment[] = [];
  let setbackResult: SetbackResult | null = null;

  if (setbackConfig && projected.boundary.points.length >= 3) {
    try {
      const absBoundaryPts: Point2D[] = projected.boundary.points.map((p) => ({
        x: p.x + projected.boundary.left,
        y: p.y + projected.boundary.top,
      }));

      const classified = classifyBoundaryEdges(
        absBoundaryPts,
        setbackConfig,
        options.pixelsPerMeter,
        setbackConfig.roadEdgeIndices
      );

      const edgeSetbacks = toEdgeSetbacks(classified, options.pixelsPerMeter);
      setbackResult = computePolygonOffset(absBoundaryPts, edgeSetbacks);

      if (setbackResult.points.length >= 3) {
        setbackSegments = polygonToSetbackSegments(
          setbackResult.points,
          setbackResult.edgeTypes
        );
      }
    } catch {
      // Setback computation failed — silently skip
    }
  }

  // ── Step 5: NGF elevation labels (standalone — subtle reference markers) ───
  projected.vertexLabels.forEach((label) => {
    const textObj = new fabric.Text(label.text, {
      left: label.position.x + 8,
      top: label.position.y - 14,
      ...ELEVATION_LABEL,
      originX: "left",
      originY: "bottom",
      selectable: false,
      evented: false,
      [TAG_VERTEX_LABEL]: true,
      excludeFromExport: true,
      isMeasurement: true,
    });
    canvas.add(textObj);
  });

  // ── Step 6: Render ────────────────────────────────────────────────────────
  canvas.requestRenderAll();

  return {
    ...projected,
    setbackSegments,
    setbackResult,
  };
}
