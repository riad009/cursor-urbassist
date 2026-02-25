/**
 * Phase 7 — Building Canvas Overlay Utilities
 * Pure functions that draw Fabric.js objects for:
 *   1. Roof overhang dashed outline
 *   2. Exterior envelope (PLU setback preview)
 *   3. Interior layout room dividers
 *   4. Window / door / sliding-door edge markers
 *
 * All created objects carry tag properties for safe cleanup:
 *   isBuildingOverhang, isInteriorLayout, isBuildingOpening
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { BuildingDetail, BuildingOpening } from "@/components/site-plan/BuildingDetailPanel";

const RAD = Math.PI / 180;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Get the world-space axis-aligned bounding box of a Fabric rect object.
 * Works for both originX="center" and originX="left" rects.
 */
export function getBuildingRect(obj: any): { left: number; top: number; width: number; height: number } | null {
  if (!obj || obj.type !== "rect") return null;
  const w = (obj.width || 0) * (obj.scaleX || 1);
  const h = (obj.height || 0) * (obj.scaleY || 1);
  let left = obj.left || 0;
  let top = obj.top || 0;
  if (obj.originX === "center") left -= w / 2;
  if (obj.originY === "center") top -= h / 2;
  return { left, top, width: w, height: h };
}

/** Remove all tagged overlay objects from canvas for a given buildingId. */
export function clearBuildingOverlays(
  canvas: any,
  buildingId: string,
  tags: string[] = ["isBuildingOverhang", "isInteriorLayout", "isBuildingOpening"]
) {
  const toRemove = canvas.getObjects().filter((o: any) =>
    o._overlayBuildingId === buildingId && tags.some((t) => o[t])
  );
  toRemove.forEach((o: any) => canvas.remove(o));
}

// ─── 1. Roof Overhang ─────────────────────────────────────────────────────────

/**
 * Draw a dashed rectangle around the building representing the roof overhang projection.
 * - Pitched roof → orange dashed
 * - Flat roof with fascia → slate-blue dotted
 */
export function drawOverhangOverlay(
  canvas: any,
  fabric: any,
  obj: any,
  building: BuildingDetail
): void {
  const overhangM = building.roof.overhang || 0;
  if (overhangM <= 0) return;
  const rect = getBuildingRect(obj);
  if (!rect) return;

  const ppm: number = (canvas as any)._pixelsPerMeter || 20;
  const ovPx = overhangM * ppm;

  const isFlat = building.roof.type === "flat";
  const stroke = isFlat ? "#64748b" : "#f97316"; // slate-blue for flat, orange for pitched
  const dashArray = isFlat ? [3, 4] : [8, 5];
  const opacity = 0.75;

  const overlay = new fabric.Rect({
    left: rect.left - ovPx,
    top: rect.top - ovPx,
    width: rect.width + 2 * ovPx,
    height: rect.height + 2 * ovPx,
    fill: "transparent",
    stroke,
    strokeWidth: 1.5,
    strokeDashArray: dashArray,
    selectable: false,
    evented: false,
    opacity,
    originX: "left",
    originY: "top",
  });
  (overlay as any).isBuildingOverhang = true;
  (overlay as any)._overlayBuildingId = building.id;
  canvas.add(overlay);
  canvas.sendObjectToBack(overlay);
}

// ─── 2. Exterior Envelope ─────────────────────────────────────────────────────

/**
 * Draw a green dashed envelope at `setbackM` meters outside the building.
 * Represents the closest a wall can legally sit (from PLU setback data).
 */
export function drawExteriorEnvelope(
  canvas: any,
  fabric: any,
  obj: any,
  building: BuildingDetail,
  setbackM: number
): void {
  if (setbackM <= 0) return;
  const rect = getBuildingRect(obj);
  if (!rect) return;
  const ppm: number = (canvas as any)._pixelsPerMeter || 20;
  const sbPx = setbackM * ppm;

  const envelope = new fabric.Rect({
    left: rect.left - sbPx,
    top: rect.top - sbPx,
    width: rect.width + 2 * sbPx,
    height: rect.height + 2 * sbPx,
    fill: "transparent",
    stroke: "#22c55e",
    strokeWidth: 1,
    strokeDashArray: [10, 6],
    selectable: false,
    evented: false,
    opacity: 0.5,
    originX: "left",
    originY: "top",
  });
  (envelope as any).isExteriorEnvelope = true;
  (envelope as any)._overlayBuildingId = building.id;
  canvas.add(envelope);
  canvas.sendObjectToBack(envelope);
}

// ─── 3. Interior Layout ───────────────────────────────────────────────────────

type LayoutPreset = "open_plan" | "corridor" | "room_per_floor" | null;

/**
 * Draw simplified interior room dividers on a building based on its layout preset.
 * open_plan  → nothing
 * corridor   → 1 horizontal line at 30% of depth from front (top)
 * room_per_floor → 2 vertical dividers + 1 horizontal mid-line
 */
export function drawInteriorLayout(
  canvas: any,
  fabric: any,
  obj: any,
  building: BuildingDetail & { layoutPreset?: LayoutPreset }
): void {
  const layout = building.layoutPreset;
  if (!layout || layout === "open_plan") return;
  const rect = getBuildingRect(obj);
  if (!rect) return;

  const { left, top, width, height } = rect;
  const lineStyle = {
    stroke: "#94a3b8",
    strokeWidth: 1,
    strokeDashArray: [5, 3],
    selectable: false,
    evented: false,
    opacity: 0.6,
  };

  const addLine = (x1: number, y1: number, x2: number, y2: number) => {
    const line = new fabric.Line([x1, y1, x2, y2], lineStyle);
    (line as any).isInteriorLayout = true;
    (line as any)._overlayBuildingId = building.id;
    canvas.add(line);
  };

  if (layout === "corridor") {
    // One horizontal corridor line at 30% of depth
    const y = top + height * 0.3;
    addLine(left, y, left + width, y);
  } else if (layout === "room_per_floor") {
    // Two vertical dividers, one horizontal mid-line
    addLine(left + width / 3, top, left + width / 3, top + height);
    addLine(left + (width * 2) / 3, top, left + (width * 2) / 3, top + height);
    addLine(left, top + height / 2, left + width, top + height / 2);
  }
}

// ─── 4. Opening Visualization ─────────────────────────────────────────────────

/**
 * Colour and symbol per opening type.
 */
const OPENING_STYLE: Record<string, { fill: string; stroke: string; symbol?: string }> = {
  window:         { fill: "rgba(147,197,253,0.5)", stroke: "#3b82f6" },
  door:           { fill: "rgba(180,120,60,0.4)",  stroke: "#92400e" },
  sliding_door:   { fill: "rgba(96,165,250,0.4)",  stroke: "#2563eb" },
  french_window:  { fill: "rgba(167,243,208,0.4)", stroke: "#059669" },
  garage_door:    { fill: "rgba(200,200,200,0.4)", stroke: "#64748b" },
  skylight:       { fill: "rgba(253,230,138,0.5)", stroke: "#d97706" },
};

/**
 * Map a facade name to the edge of the building rect.
 * Returns start/end canvas points for the edge and a perpendicular inset direction.
 * `northAngle` rotates north to match canvas orientation (0° = canvas up).
 */
function facadeEdge(
  rect: { left: number; top: number; width: number; height: number },
  facade: BuildingOpening["facade"]
): { axis: "h" | "v"; edgeX?: number; edgeY?: number; from: number; to: number } {
  const { left, top, width, height } = rect;
  switch (facade) {
    case "south": return { axis: "h", edgeY: top + height, from: left, to: left + width };
    case "north": return { axis: "h", edgeY: top,          from: left, to: left + width };
    case "west":  return { axis: "v", edgeX: left,         from: top,  to: top + height };
    case "east":  return { axis: "v", edgeX: left + width, from: top,  to: top + height };
  }
}

/**
 * Draw opening markers on building edges (Windows, Doors, Sliding doors, etc.)
 * Each opening is a small coloured rectangle on the corresponding facade edge.
 * Sliding doors get a diagonal "track" line inside.
 */
export function drawBuildingOpenings(
  canvas: any,
  fabric: any,
  obj: any,
  building: BuildingDetail & { layoutPreset?: LayoutPreset },
  pixelsPerMeter: number
): void {
  const rect = getBuildingRect(obj);
  if (!rect) return;
  const openings = building.openings || [];
  if (openings.length === 0) return;

  // Group openings per facade
  const byFacade: Record<string, BuildingOpening[]> = {};
  for (const op of openings) {
    (byFacade[op.facade] ??= []).push(op);
  }

  for (const [facade, ops] of Object.entries(byFacade)) {
    const edge = facadeEdge(rect, facade as BuildingOpening["facade"]);
    const edgeLen = edge.axis === "h" ? rect.width : rect.height;
    const thickness = 6; // px — visual thickness of the opening marker
    const gap = 4;       // px between multiple openings

    // Distribute openings evenly along the edge
    let totalW = 0;
    const widths = ops.map((op) => Math.max(op.width * pixelsPerMeter * op.count, 10));
    totalW = widths.reduce((a, b) => a + b, 0) + gap * (ops.length - 1);
    let cursor = edge.from + (edgeLen - totalW) / 2;

    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      const style = OPENING_STYLE[op.type] || OPENING_STYLE.window;
      const w = widths[i];

      let rectLeft: number, rectTop: number, rectWidth: number, rectHeight: number;

      if (edge.axis === "h") {
        rectLeft = cursor;
        rectTop = (edge.edgeY as number) - (facade === "south" ? thickness : -1);
        rectWidth = w;
        rectHeight = thickness;
      } else {
        rectLeft = (edge.edgeX as number) - (facade === "east" ? thickness : -1);
        rectTop = cursor;
        rectWidth = thickness;
        rectHeight = w;
      }

      const openingRect = new fabric.Rect({
        left: rectLeft,
        top: rectTop,
        width: rectWidth,
        height: rectHeight,
        fill: style.fill,
        stroke: style.stroke,
        strokeWidth: 1.5,
        selectable: false,
        evented: false,
        originX: "left",
        originY: "top",
      });
      (openingRect as any).isBuildingOpening = true;
      (openingRect as any)._overlayBuildingId = building.id;
      canvas.add(openingRect);

      // Shutter graphics
      if (op.shutter && op.shutter !== "none") {
        const isHinged = op.shutter === "hinged" || op.shutter === "traditional_shutter";
        if (isHinged) {
          const shutterW = w / 2;
          if (edge.axis === "h") {
            const yStart = rectTop + (facade === "south" ? thickness : 0);
            const yEnd = facade === "south" ? rectTop + thickness + shutterW : rectTop - shutterW;
            const leftShutter = new fabric.Line([rectLeft, yStart, rectLeft - shutterW * 0.5, yEnd], { stroke: style.stroke, strokeWidth: 1.5, selectable: false, evented: false });
            const rightShutter = new fabric.Line([rectLeft + w, yStart, rectLeft + w + shutterW * 0.5, yEnd], { stroke: style.stroke, strokeWidth: 1.5, selectable: false, evented: false });
            (leftShutter as any).isBuildingOpening = true; (leftShutter as any)._overlayBuildingId = building.id;
            (rightShutter as any).isBuildingOpening = true; (rightShutter as any)._overlayBuildingId = building.id;
            canvas.add(leftShutter); canvas.add(rightShutter);
          } else {
            const xStart = rectLeft + (facade === "east" ? thickness : 0);
            const xEnd = facade === "east" ? rectLeft + thickness + shutterW : rectLeft - shutterW;
            const topShutter = new fabric.Line([xStart, rectTop, xEnd, rectTop - shutterW * 0.5], { stroke: style.stroke, strokeWidth: 1.5, selectable: false, evented: false });
            const bottomShutter = new fabric.Line([xStart, rectTop + w, xEnd, rectTop + w + shutterW * 0.5], { stroke: style.stroke, strokeWidth: 1.5, selectable: false, evented: false });
            (topShutter as any).isBuildingOpening = true; (topShutter as any)._overlayBuildingId = building.id;
            (bottomShutter as any).isBuildingOpening = true; (bottomShutter as any)._overlayBuildingId = building.id;
            canvas.add(topShutter); canvas.add(bottomShutter);
          }
        } else {
          // Roller/venetian: draw a thicker line on outside edge
          const rRect = new fabric.Rect({
            left: edge.axis === "h" ? rectLeft : (facade === "east" ? rectLeft + thickness : rectLeft - 2),
            top: edge.axis === "h" ? (facade === "south" ? rectTop + thickness : rectTop - 2) : rectTop,
            width: edge.axis === "h" ? w : 2,
            height: edge.axis === "h" ? 2 : w,
            fill: style.stroke,
            selectable: false, evented: false
          });
          (rRect as any).isBuildingOpening = true; (rRect as any)._overlayBuildingId = building.id;
          canvas.add(rRect);
        }
      }

      // Sliding door: draw a diagonal "track" line
      if (op.type === "sliding_door") {
        const trackLine = new fabric.Line(
          [rectLeft, rectTop, rectLeft + rectWidth, rectTop + rectHeight],
          {
            stroke: style.stroke,
            strokeWidth: 1,
            strokeDashArray: [3, 2],
            selectable: false, evented: false,
          }
        );
        (trackLine as any).isBuildingOpening = true;
        (trackLine as any)._overlayBuildingId = building.id;
        canvas.add(trackLine);
      }

      cursor += w + gap;
    }
  }
}
