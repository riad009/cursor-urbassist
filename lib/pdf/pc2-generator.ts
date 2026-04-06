/**
 * PC2 — Plan de Masse (Site Layout Plan)
 *
 * Generates a 1-page A3 landscape PDF showing:
 *   - Captured site plan image from the 2D/3D editor
 *   - OR a rendered version from the stored canvas data (fallback)
 *   - Building footprint summary table
 *   - Surface area breakdown
 *   - Professional cartouche footer
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  DossierProjectData,
  GeneratorResult,
  CapturedImages,
  JobEntry,
} from "./types";
import {
  A3L,
  COLORS,
  drawFooter,
  drawPageHeader,
  drawNorthArrow,
  drawScaleBar,
  drawImageWithBorder,
  drawInfoBox,
} from "./shared";

export async function generatePC2(
  doc: jsPDF,
  project: DossierProjectData,
  capturedImages: CapturedImages
): Promise<GeneratorResult> {
  const desc = project.projectDescription;
  const jobs: JobEntry[] = desc?.jobs || [];

  // ── Header ──
  const contentY = drawPageHeader(
    doc,
    "PC2 — PLAN DE MASSE DES CONSTRUCTIONS",
    "Implantation détaillée des constructions, surfaces et réseaux",
    `Échelle: ${project.scale}  •  ${new Date().toLocaleDateString("fr-FR")}`,
    [5, 102, 68] // emerald-800
  );

  // Check for captured image (blob URL or DB-persisted base64)
  const pc2Image = capturedImages?.PC2 || null;
  const hasCapturedImage = !!pc2Image;

  // Check if we can render from canvas data as fallback
  const canvasData = project.sitePlanData?.canvasData as { objects?: FabricObject[] } | null;
  const hasCanvasData = canvasData && Array.isArray(canvasData.objects) && canvasData.objects.length > 0;

  if (hasCapturedImage) {
    // ── Main captured image ──
    const imgW = 260;
    const imgH = A3L.H - contentY - A3L.FOOTER_H - 8;
    drawImageWithBorder(doc, pc2Image!, A3L.M, contentY, imgW, imgH);

    drawNorthArrow(doc, A3L.M + imgW - 15, contentY + 18);
    drawScaleBar(doc, A3L.M + 8, contentY + imgH - 12, project.scale);

    drawRightPanel(doc, project, jobs, contentY, imgW);
  } else if (hasCanvasData) {
    // ── Render from stored canvas data (fallback) ──
    const imgW = 260;
    const imgH = A3L.H - contentY - A3L.FOOTER_H - 8;

    renderCanvasDataToPdf(doc, canvasData!, A3L.M, contentY, imgW, imgH);

    drawNorthArrow(doc, A3L.M + imgW - 15, contentY + 18);
    drawScaleBar(doc, A3L.M + 8, contentY + imgH - 12, project.scale);

    drawRightPanel(doc, project, jobs, contentY, imgW);
  } else {
    // ── No data at all — draw placeholder ──
    const placeholderH = A3L.H - contentY - A3L.FOOTER_H - 8;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...COLORS.BORDER);
    doc.rect(A3L.M, contentY, A3L.W - A3L.M * 2, placeholderH, "FD");

    doc.setTextColor(...COLORS.MUTED);
    doc.setFontSize(14);
    doc.text(
      "Plan de masse non disponible",
      A3L.W / 2,
      contentY + placeholderH / 2 - 5,
      { align: "center" }
    );
    doc.setFontSize(9);
    doc.text(
      "Retournez à l'éditeur de plan de masse pour capturer cette vue.",
      A3L.W / 2,
      contentY + placeholderH / 2 + 5,
      { align: "center" }
    );
  }

  // ── Footer ──
  drawFooter(doc, {
    docTitle: "PLAN DE MASSE DES CONSTRUCTIONS",
    pcmiNumber: "PCMI 2",
    address: project.address || undefined,
    parcelRef: project.parcelIds || undefined,
    authType: project.authorizationType || undefined,
    scale: project.scale,
  });

  return { pageCount: 1, label: "Plan de Masse", code: "PC2" };
}

// ─── Right panel (shared between captured image and canvas render) ──────────

function drawRightPanel(
  doc: jsPDF,
  project: DossierProjectData,
  jobs: JobEntry[],
  contentY: number,
  imgW: number
) {
  const panelX = A3L.M + imgW + 6;
  const panelW = A3L.W - A3L.M * 2 - imgW - 6;
  let py = contentY;

  drawInfoBox(doc, panelX, py, panelW, 16, "Adresse", project.address || "—");
  py += 19;
  drawInfoBox(doc, panelX, py, panelW, 16, "Parcelle", project.parcelIds || "—");
  py += 19;
  drawInfoBox(
    doc, panelX, py, panelW, 16, "Surface parcelle",
    project.parcelArea ? `${project.parcelArea.toFixed(0)} m²` : "—"
  );
  py += 22;

  if (jobs.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text("BÂTIMENTS PROJETÉS", panelX, py + 4);
    py += 7;

    autoTable(doc, {
      startY: py,
      margin: { left: panelX, right: A3L.W - panelX - panelW },
      head: [["Nature", "Emprise", "Niveaux", "SdP"]],
      body: jobs.map((j) => [
        j.nature === "new_construction" ? "Construction neuve"
          : j.nature === "existing_extension" ? "Extension"
          : "Aménagement",
        `${j.footprint} m²`,
        String(j.levels),
        `${j.floorAreaEstimated.toFixed(1)} m²`,
      ]),
      styles: { fontSize: 6.5, cellPadding: 2 },
      headStyles: {
        fillColor: [5, 102, 68],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 6,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      tableWidth: panelW,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    py = (doc as any).lastAutoTable?.finalY ?? py + 30;
    py += 6;
  }

  const sitePlan = project.sitePlanData;
  const fpExisting = sitePlan?.footprintExisting;
  const fpProjected = sitePlan?.footprintProjected;
  const fpMax = sitePlan?.footprintMax;

  if (fpExisting || fpProjected || fpMax) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text("SURFACES", panelX, py + 4);
    py += 7;

    autoTable(doc, {
      startY: py,
      margin: { left: panelX, right: A3L.W - panelX - panelW },
      body: [
        ...(fpExisting ? [["Emprise existante", `${fpExisting.toFixed(1)} m²`]] : []),
        ...(fpProjected ? [["Emprise projetée", `${fpProjected.toFixed(1)} m²`]] : []),
        ...(fpMax ? [["Emprise maximale", `${fpMax.toFixed(1)} m²`]] : []),
        ...(project.parcelArea
          ? [["Surface parcelle", `${project.parcelArea.toFixed(0)} m²`]]
          : []),
      ],
      styles: { fontSize: 6.5, cellPadding: 2 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: panelW * 0.55 },
        1: { halign: "right" as const },
      },
      tableWidth: panelW,
    });
  }
}

// ─── Canvas Data → jsPDF Renderer ──────────────────────────────────────────
// Parses Fabric.js canvas JSON and renders objects using jsPDF drawing primitives.
// This provides a meaningful site plan even when no screenshot capture exists.

interface FabricObject {
  type?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  angle?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  visible?: boolean;
  text?: string;
  fontSize?: number;
  points?: { x: number; y: number }[];
  radius?: number;
  rx?: number;
  ry?: number;
  x1?: number; y1?: number; x2?: number; y2?: number;
  objects?: FabricObject[];
  // Custom properties
  isGrid?: boolean;
  isMeasurement?: boolean;
  isPolygonPreview?: boolean;
  isBoundaryOverlay?: boolean;
  isBoundaryDimension?: boolean;
  isNorthArrow?: boolean;
  isElevationPoint?: boolean;
  isAnnotation?: boolean;
  excludeFromExport?: boolean;
  surfaceType?: string;
  isExisting?: boolean;
  isParcel?: boolean;
  constructionType?: string;
}

/** Parse a CSS/hex color string → [R, G, B] tuple */
function parseColor(color: string | undefined | null): [number, number, number] | null {
  if (!color || color === "transparent" || color === "none") return null;

  // hex
  const hexMatch = color.match(/^#([0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  // short hex
  const shortHex = color.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) {
    const h = shortHex[1];
    return [parseInt(h[0]+h[0], 16), parseInt(h[1]+h[1], 16), parseInt(h[2]+h[2], 16)];
  }
  // rgba/rgb
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbaMatch) {
    return [parseInt(rgbaMatch[1]), parseInt(rgbaMatch[2]), parseInt(rgbaMatch[3])];
  }

  // Named colors fallback
  const named: Record<string, [number, number, number]> = {
    red: [255, 0, 0], blue: [0, 0, 255], green: [0, 128, 0],
    white: [255, 255, 255], black: [0, 0, 0], gray: [128, 128, 128],
    grey: [128, 128, 128], yellow: [255, 255, 0], orange: [255, 165, 0],
  };
  return named[color.toLowerCase()] || [100, 100, 100];
}

function renderCanvasDataToPdf(
  doc: jsPDF,
  canvasData: { objects?: FabricObject[] },
  pdfX: number,
  pdfY: number,
  pdfW: number,
  pdfH: number
) {
  const objects = canvasData.objects || [];

  // White background
  doc.setFillColor(255, 255, 255);
  doc.rect(pdfX, pdfY, pdfW, pdfH, "F");

  // Light border
  doc.setDrawColor(...COLORS.BORDER);
  doc.setLineWidth(0.3);
  doc.rect(pdfX, pdfY, pdfW, pdfH, "S");

  // Compute bounding box of all visible objects to determine scale
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const visibleObjects = objects.filter(obj => {
    if (obj.visible === false) return false;
    if (obj.isGrid || obj.isMeasurement || obj.isPolygonPreview) return false;
    if (obj.isBoundaryDimension || obj.isNorthArrow) return false;
    if (obj.isElevationPoint || obj.excludeFromExport) return false;
    return true;
  });

  for (const obj of visibleObjects) {
    const l = obj.left ?? 0;
    const t = obj.top ?? 0;
    const w = (obj.width ?? 0) * (obj.scaleX ?? 1);
    const h = (obj.height ?? 0) * (obj.scaleY ?? 1);
    const r = obj.radius ?? 0;

    if (obj.type === "polygon" && obj.points) {
      for (const pt of obj.points) {
        minX = Math.min(minX, l + pt.x);
        minY = Math.min(minY, t + pt.y);
        maxX = Math.max(maxX, l + pt.x);
        maxY = Math.max(maxY, t + pt.y);
      }
    } else if (obj.type === "circle") {
      minX = Math.min(minX, l - r); minY = Math.min(minY, t - r);
      maxX = Math.max(maxX, l + r); maxY = Math.max(maxY, t + r);
    } else if (obj.type === "line") {
      minX = Math.min(minX, l + (obj.x1 ?? 0), l + (obj.x2 ?? 0));
      minY = Math.min(minY, t + (obj.y1 ?? 0), t + (obj.y2 ?? 0));
      maxX = Math.max(maxX, l + (obj.x1 ?? 0), l + (obj.x2 ?? 0));
      maxY = Math.max(maxY, t + (obj.y1 ?? 0), t + (obj.y2 ?? 0));
    } else {
      minX = Math.min(minX, l); minY = Math.min(minY, t);
      maxX = Math.max(maxX, l + w); maxY = Math.max(maxY, t + h);
    }
  }

  if (!isFinite(minX) || visibleObjects.length === 0) {
    // No visible objects — draw empty placeholder text
    doc.setTextColor(...COLORS.MUTED);
    doc.setFontSize(10);
    doc.text("Aucun élément de plan disponible", pdfX + pdfW / 2, pdfY + pdfH / 2, { align: "center" });
    return;
  }

  // Compute scale + offset to fit canvas content into PDF rect with padding
  const canvasW = maxX - minX || 1;
  const canvasH = maxY - minY || 1;
  const padPx = 10; // mm padding inside PDF rect
  const availW = pdfW - padPx * 2;
  const availH = pdfH - padPx * 2;
  const scale = Math.min(availW / canvasW, availH / canvasH);
  const offsetX = pdfX + padPx + (availW - canvasW * scale) / 2;
  const offsetY = pdfY + padPx + (availH - canvasH * scale) / 2;

  // Transform canvas coords → PDF coords
  const tx = (cx: number) => offsetX + (cx - minX) * scale;
  const ty = (cy: number) => offsetY + (cy - minY) * scale;

  // Render each visible object
  for (const obj of visibleObjects) {
    const l = obj.left ?? 0;
    const t = obj.top ?? 0;
    const w = (obj.width ?? 0) * (obj.scaleX ?? 1);
    const h = (obj.height ?? 0) * (obj.scaleY ?? 1);
    const fillColor = parseColor(obj.fill as string);
    const strokeColor = parseColor(obj.stroke as string);
    const sw = Math.max(0.1, (obj.strokeWidth ?? 1) * scale * 0.5);

    switch (obj.type) {
      case "rect": {
        if (fillColor) doc.setFillColor(...fillColor);
        if (strokeColor) { doc.setDrawColor(...strokeColor); doc.setLineWidth(sw); }
        const mode = fillColor && strokeColor ? "FD" : fillColor ? "F" : "S";
        doc.rect(tx(l), ty(t), w * scale, h * scale, mode);
        break;
      }

      case "polygon": {
        if (!obj.points || obj.points.length < 3) break;
        if (fillColor) doc.setFillColor(...fillColor);
        if (strokeColor) { doc.setDrawColor(...strokeColor); doc.setLineWidth(sw); }

        const pts = obj.points.map(p => [tx(l + p.x), ty(t + p.y)] as [number, number]);
        // jsPDF lines() method: array of [dx, dy] deltas from starting point
        const startPt = pts[0];
        const deltas = pts.slice(1).map((p, i) => {
          const prev = i === 0 ? startPt : pts[i];
          return [p[0] - prev[0], p[1] - prev[1]];
        });

        const mode = fillColor && strokeColor ? "FD" : fillColor ? "F" : "S";
        doc.lines(deltas, startPt[0], startPt[1], [1, 1], mode, true);
        break;
      }

      case "circle": {
        const r = (obj.radius ?? 0) * scale;
        if (r < 0.1) break;
        if (fillColor) doc.setFillColor(...fillColor);
        if (strokeColor) { doc.setDrawColor(...strokeColor); doc.setLineWidth(sw); }
        const mode = fillColor && strokeColor ? "FD" : fillColor ? "F" : "S";
        doc.circle(tx(l), ty(t), r, mode);
        break;
      }

      case "ellipse": {
        const rx = (obj.rx ?? 0) * scale;
        const ry = (obj.ry ?? 0) * scale;
        if (rx < 0.1 || ry < 0.1) break;
        if (fillColor) doc.setFillColor(...fillColor);
        if (strokeColor) { doc.setDrawColor(...strokeColor); doc.setLineWidth(sw); }
        const mode = fillColor && strokeColor ? "FD" : fillColor ? "F" : "S";
        doc.ellipse(tx(l), ty(t), rx, ry, mode);
        break;
      }

      case "line": {
        const lc = strokeColor || fillColor;
        if (!lc) break;
        doc.setDrawColor(...lc);
        doc.setLineWidth(sw);
        doc.line(
          tx(l + (obj.x1 ?? 0)), ty(t + (obj.y1 ?? 0)),
          tx(l + (obj.x2 ?? 0)), ty(t + (obj.y2 ?? 0))
        );
        break;
      }

      case "i-text":
      case "textbox":
      case "text": {
        if (!obj.text) break;
        const tc = fillColor || [30, 41, 59] as [number, number, number];
        doc.setTextColor(...tc);
        const fontSize = Math.max(3, (obj.fontSize ?? 12) * scale * 0.3);
        doc.setFontSize(fontSize);
        doc.setFont("helvetica", "normal");
        doc.text(obj.text, tx(l), ty(t) + fontSize * 0.35, { maxWidth: w * scale || 100 });
        break;
      }

      case "group": {
        // Render group children with offset
        if (obj.objects) {
          for (const child of obj.objects) {
            const childObj = { ...child, left: l + (child.left ?? 0), top: t + (child.top ?? 0) };
            // Re-process as individual object using same transform
            const cf = parseColor(child.fill as string);
            const cs = parseColor(child.stroke as string);
            const cw = (child.width ?? 0) * (child.scaleX ?? 1);
            const ch = (child.height ?? 0) * (child.scaleY ?? 1);
            const csw = Math.max(0.1, (child.strokeWidth ?? 1) * scale * 0.5);

            if (child.type === "rect") {
              if (cf) doc.setFillColor(...cf);
              if (cs) { doc.setDrawColor(...cs); doc.setLineWidth(csw); }
              const m = cf && cs ? "FD" : cf ? "F" : "S";
              doc.rect(tx(childObj.left), ty(childObj.top), cw * scale, ch * scale, m);
            } else if (child.type === "circle") {
              const cr = (child.radius ?? 0) * scale;
              if (cr > 0.1) {
                if (cf) doc.setFillColor(...cf);
                if (cs) { doc.setDrawColor(...cs); doc.setLineWidth(csw); }
                doc.circle(tx(childObj.left), ty(childObj.top), cr, cf ? "FD" : "S");
              }
            } else if (child.type === "line") {
              const lColor = cs || cf;
              if (lColor) {
                doc.setDrawColor(...lColor);
                doc.setLineWidth(csw);
                doc.line(
                  tx(childObj.left + (child.x1 ?? 0)), ty(childObj.top + (child.y1 ?? 0)),
                  tx(childObj.left + (child.x2 ?? 0)), ty(childObj.top + (child.y2 ?? 0))
                );
              }
            }
          }
        }
        break;
      }

      default:
        break;
    }
  }

  // Watermark: "Generated from canvas data"
  doc.setFontSize(5);
  doc.setTextColor(180, 180, 180);
  doc.text("Rendu depuis les données du plan", pdfX + pdfW - 4, pdfY + pdfH - 2, { align: "right" });
}

