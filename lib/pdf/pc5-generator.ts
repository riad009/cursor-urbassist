/**
 * PC5 — Plans des Façades (Facades & Elevations)
 *
 *   PC5.1 — État Initial (2 pages: existing building or empty plot, 4 directions)
 *   PC5.2 — État Projeté (2 pages: proposed building elevations, 4 directions)
 *
 * Generates 4 pages of A3 landscape PDF with professional
 * 2D technical elevation drawings matching French Mairie submission standards.
 *
 * ARCHITECTURE: Uses shared elevation-layout.ts engine for all geometry.
 * The jsPDF renderer here is a thin translation layer.
 *
 * Features:
 *   - Facade differentiation (door placement varies per direction)
 *   - Setback dimensions (distance from building to boundary)
 *   - Roof overhang (0.3m eave extension)
 *   - Foundation indication below ground
 *   - Window lintel + sill details
 *   - Fascia/eave line at wall-roof junction
 *   - Material annotation leader lines
 *   - Professional dimension callouts
 *
 * No captured images needed — generates entirely from project data.
 */

import { jsPDF } from "jspdf";
import {
  DossierProjectData,
  GeneratorResult,
} from "./types";
import { A3L, drawFooter } from "./shared";
import { extractProjectData } from "./extract-project-data";
import {
  computeMultiBuildingLayout,
  DIRECTION_CONFIGS,
  type ElevationLayout,
  type ViewportConfig,
  type SecondaryBuildingLayout,
} from "./elevation-layout";

// ─── Drawing palette ───────────────────────────────────────────────────────

const C = {
  BOUNDARY: [220, 0, 0] as [number, number, number],
  GROUND: [0, 0, 0] as [number, number, number],
  WALLS: [245, 240, 220] as [number, number, number],
  WALLS_STROKE: [51, 51, 51] as [number, number, number],
  ROOF: [100, 90, 80] as [number, number, number],
  ROOF_STROKE: [60, 55, 50] as [number, number, number],
  HATCH: [80, 80, 80] as [number, number, number],
  DIM_BOX: [30, 58, 138] as [number, number, number],
  DIM_TEXT: [255, 255, 255] as [number, number, number],
  TN_MARKER: [249, 115, 22] as [number, number, number],
  TF_MARKER: [34, 139, 34] as [number, number, number],
  LABEL: [100, 116, 139] as [number, number, number],
  MUTED: [148, 163, 184] as [number, number, number],
  SECTION_BG: [248, 250, 252] as [number, number, number],
  HEADER_EXIST: [91, 33, 182] as [number, number, number],
  HEADER_PROJ: [159, 18, 57] as [number, number, number],
  MAT_LEADER: [30, 58, 138] as [number, number, number],
  GRASS: [120, 180, 80] as [number, number, number],
  WINDOW: [176, 216, 240] as [number, number, number],
  WINDOW_FRAME: [51, 65, 85] as [number, number, number],
  DOOR: [110, 70, 40] as [number, number, number],
  CHIMNEY: [140, 120, 100] as [number, number, number],
  FASCIA: [74, 64, 64] as [number, number, number],
  FOUNDATION: [160, 160, 160] as [number, number, number],
  PROJECTED_BG: [5, 150, 105] as [number, number, number],
};

// ═══════════════════════════════════════════════════════════════════════════
// Main entry point
// ═══════════════════════════════════════════════════════════════════════════

export async function generatePC5(
  doc: jsPDF,
  project: DossierProjectData,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _capturedImages?: Record<string, string | undefined>
): Promise<GeneratorResult> {
  const extracted = extractProjectData(project);
  const parcel = extracted.parcel;
  const ngf = extracted.ngfAltitude;
  const materials = extracted.materials;
  const terrain = extracted.terrain;
  const initialBuildings = extracted.initialBuildings;
  const projectedBuildings = extracted.projectedBuildings;
  const setbacks = {
    front: extracted.regulatory.setbacks?.front ?? null,
    side: extracted.regulatory.setbacks?.side ?? null,
    rear: extracted.regulatory.setbacks?.rear ?? null,
  };
  const { W, M, H, FOOTER_H } = A3L;
  const cW = W - M * 2;
  const startY = M + 18;
  const halfH = (H - startY - FOOTER_H - 10) / 2;

  // The viewport for jsPDF uses mm coordinates
  // Each panel occupies (cW × halfH-2) mm space, starting at some boxX/boxY
  // We'll compute the layout in mm directly.

  // ═════════════════════════════════════════════════════════════════════════
  // PC5.1 — PAGE 1: WEST & EAST Initial
  // ═════════════════════════════════════════════════════════════════════════
  drawPageHeaderBar(doc, M, cW, "PC5.1 — FAÇADES ET TOITURES EXISTANTES", C.HEADER_EXIST, "1/4");

  for (let i = 0; i < 2; i++) {
    const panelY = startY + i * (halfH + 2);
    const panelH = halfH - 2;
    const suffix = "initiale";
    const vp = makePdfViewport(cW, panelH);
    const layout = computeMultiBuildingLayout(
      parcel, initialBuildings, ngf, materials,
      DIRECTION_CONFIGS[i], suffix, vp, terrain, setbacks,
    );
    drawLayoutOnPdf(doc, layout, M, panelY, cW, panelH);
  }

  drawScaleBadge(doc, W - M - 28, startY + 1);
  drawDisclaimerText(doc, M, H - FOOTER_H - 6, cW);
  drawFooter(doc, {
    docTitle: "FAÇADES ET TOITURES EXISTANTES",
    pcmiNumber: "PCMI 5.1",
    address: project.address || undefined,
    parcelRef: project.parcelIds || undefined,
    scale: "1 : 100",
    pageNum: 1,
    totalPages: 4,
  });

  // ═════════════════════════════════════════════════════════════════════════
  // PC5.1 — PAGE 2: NORTH & SOUTH Initial
  // ═════════════════════════════════════════════════════════════════════════
  doc.addPage([420, 297], "landscape");
  drawPageHeaderBar(doc, M, cW, "PC5.1 — FAÇADES ET TOITURES EXISTANTES", C.HEADER_EXIST, "2/4");

  for (let i = 2; i < 4; i++) {
    const panelIdx = i - 2;
    const panelY = startY + panelIdx * (halfH + 2);
    const panelH = halfH - 2;
    const suffix = "initiale";
    const vp = makePdfViewport(cW, panelH);
    const layout = computeMultiBuildingLayout(
      parcel, initialBuildings, ngf, materials,
      DIRECTION_CONFIGS[i], suffix, vp, terrain, setbacks,
    );
    drawLayoutOnPdf(doc, layout, M, panelY, cW, panelH);
  }

  drawScaleBadge(doc, W - M - 28, startY + 1);
  drawDisclaimerText(doc, M, H - FOOTER_H - 6, cW);
  drawFooter(doc, {
    docTitle: "FAÇADES ET TOITURES EXISTANTES",
    pcmiNumber: "PCMI 5.1",
    address: project.address || undefined,
    parcelRef: project.parcelIds || undefined,
    scale: "1 : 100",
    pageNum: 2,
    totalPages: 4,
  });

  // ═════════════════════════════════════════════════════════════════════════
  // PC5.2 — PAGE 3: WEST & EAST Projected
  // ═════════════════════════════════════════════════════════════════════════
  doc.addPage([420, 297], "landscape");
  drawPageHeaderBar(doc, M, cW, "PC5.2 — FAÇADES ET TOITURES PROJETÉES", C.HEADER_PROJ, "3/4");

  for (let i = 0; i < 2; i++) {
    const panelY = startY + i * (halfH + 2);
    const panelH = halfH - 2;
    const suffix = "projetée";
    const vp = makePdfViewport(cW, panelH);
    const layout = computeMultiBuildingLayout(
      parcel, projectedBuildings, ngf, materials,
      DIRECTION_CONFIGS[i], suffix, vp, terrain, setbacks,
    );
    drawLayoutOnPdf(doc, layout, M, panelY, cW, panelH);
  }

  drawScaleBadge(doc, W - M - 28, startY + 1);
  drawDisclaimerText(doc, M, H - FOOTER_H - 6, cW);
  drawFooter(doc, {
    docTitle: "FAÇADES ET TOITURES PROJETÉES",
    pcmiNumber: "PCMI 5.2",
    address: project.address || undefined,
    parcelRef: project.parcelIds || undefined,
    scale: "1 : 100",
    pageNum: 3,
    totalPages: 4,
  });

  // ═════════════════════════════════════════════════════════════════════════
  // PC5.2 — PAGE 4: NORTH & SOUTH Projected
  // ═════════════════════════════════════════════════════════════════════════
  doc.addPage([420, 297], "landscape");
  drawPageHeaderBar(doc, M, cW, "PC5.2 — FAÇADES ET TOITURES PROJETÉES", C.HEADER_PROJ, "4/4");

  for (let i = 2; i < 4; i++) {
    const panelIdx = i - 2;
    const panelY = startY + panelIdx * (halfH + 2);
    const panelH = halfH - 2;
    const suffix = "projetée";
    const vp = makePdfViewport(cW, panelH);
    const layout = computeMultiBuildingLayout(
      parcel, projectedBuildings, ngf, materials,
      DIRECTION_CONFIGS[i], suffix, vp, terrain, setbacks,
    );
    drawLayoutOnPdf(doc, layout, M, panelY, cW, panelH);
  }

  drawScaleBadge(doc, W - M - 28, startY + 1);
  drawDisclaimerText(doc, M, H - FOOTER_H - 6, cW);
  drawFooter(doc, {
    docTitle: "FAÇADES ET TOITURES PROJETÉES",
    pcmiNumber: "PCMI 5.2",
    address: project.address || undefined,
    parcelRef: project.parcelIds || undefined,
    scale: "1 : 100",
    pageNum: 4,
    totalPages: 4,
  });

  return { pageCount: 4, label: "Plans des Façades", code: "PC5" };
}

// ═══════════════════════════════════════════════════════════════════════════
// PDF Viewport Constructor
// ═══════════════════════════════════════════════════════════════════════════

function makePdfViewport(cW: number, panelH: number): ViewportConfig {
  return {
    w: cW,
    h: panelH - 8, // account for section label bar
    marginL: 35,
    marginR: 35,
    groundRatio: 0.72,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Layout → jsPDF Translation Layer
// ═══════════════════════════════════════════════════════════════════════════

function drawLayoutOnPdf(
  doc: jsPDF,
  layout: ElevationLayout,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
) {
  // ── Section label bar ──
  doc.setFillColor(...C.SECTION_BG);
  doc.rect(boxX, boxY, boxW, 7, "F");
  doc.setTextColor(30, 41, 59);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text(layout.direction, boxX + 5, boxY + 5);

  const drawY = boxY + 8;
  const drawH = boxH - 9;

  // Panel border
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.3);
  doc.rect(boxX, drawY, boxW, drawH, "S");

  // Coordinate offset: layout positions are relative to viewport (0,0),
  // but PDF coordinates are absolute (boxX + ..., drawY + ...)
  const oX = boxX;
  const oY = drawY;

  // ── Hatch underground ──
  const { hatch, ground } = layout;
  doc.setDrawColor(...C.HATCH);
  doc.setLineWidth(0.25);
  const hatchH = hatch.bottomY - hatch.topY;
  const spacing = 3;
  for (let i = 0; i < (boxW + hatchH) / spacing; i++) {
    const sx = oX + hatch.leftX + i * spacing;
    const ex = sx - hatchH;
    if (sx > oX && ex < oX + boxW) {
      doc.line(
        Math.max(oX, Math.min(oX + boxW, sx)), oY + hatch.topY,
        Math.max(oX, Math.min(oX + boxW, ex)), oY + hatch.bottomY,
      );
    }
  }

  // ── Ground line ──
  doc.setDrawColor(...C.GROUND);
  doc.setLineWidth(1.8);
  doc.line(oX + ground.leftX, oY + ground.leftY, oX + ground.rightX, oY + ground.rightY);

  // ── Grass vegetation ──
  drawGrassVegetation(doc, oX + 5, oY + ground.y, boxW - 10);

  // ── Property boundaries (red dashed) ──
  doc.setDrawColor(...C.BOUNDARY);
  doc.setLineWidth(1.2);
  for (const b of [layout.boundaries.left, layout.boundaries.right]) {
    if (!b.visible) continue;
    let cy = oY + b.topY;
    while (cy < oY + b.bottomY - 2) {
      doc.line(oX + b.x, cy, oX + b.x, Math.min(cy + 5, oY + b.bottomY - 2));
      cy += 8;
    }
    // Label
    doc.setTextColor(...C.BOUNDARY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5);
    doc.text(b.label, oX + b.labelX, oY + b.labelY, { angle: 90 });
  }

  // ── TN/TF markers ──
  for (const m of layout.tnMarkers) {
    const mx = oX + m.x;
    const my = oY + m.y;

    doc.setFillColor(...C.TN_MARKER);
    doc.roundedRect(oX + m.tnLabel.x, oY + m.tnLabel.y, 4, 4, 0.5, 0.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(3);
    doc.text("TN", oX + m.tnLabel.x + 2, oY + m.tnLabel.y + 2.8, { align: "center" });

    doc.setFillColor(...C.TF_MARKER);
    doc.roundedRect(oX + m.tfLabel.x, oY + m.tfLabel.y, 3.5, 4, 0.5, 0.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.text("TF", oX + m.tfLabel.x + 1.75, oY + m.tfLabel.y + 2.8, { align: "center" });

    doc.setTextColor(...C.GROUND);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(4.5);
    doc.text(m.groundLabel.text, oX + m.groundLabel.x, oY + m.groundLabel.y);

    doc.setTextColor(...C.LABEL);
    doc.setFontSize(4);
    doc.text(m.ngfLabel.text, oX + m.ngfLabel.x, oY + m.ngfLabel.y, { align: "center" });
  }

  // ── Plot dimension ──
  const pd = layout.plotDim;
  doc.setDrawColor(...C.GROUND);
  doc.setLineWidth(0.3);
  doc.line(oX + pd.x1, oY + pd.y1, oX + pd.x2, oY + pd.y2);
  doc.line(oX + pd.x1, oY + pd.y1 - pd.tickLen, oX + pd.x1, oY + pd.y1 + pd.tickLen);
  doc.line(oX + pd.x2, oY + pd.y2 - pd.tickLen, oX + pd.x2, oY + pd.y2 + pd.tickLen);
  const plW = pd.label.length * 1.8 + 4;
  doc.setFillColor(255, 255, 255);
  doc.rect(oX + pd.labelX - plW / 2, oY + pd.labelY - 2, plW, 4, "F");
  doc.setTextColor(...C.GROUND);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5);
  doc.text(pd.label, oX + pd.labelX, oY + pd.labelY + 1, { align: "center" });

  // ═══ Building ═══
  if (layout.building) {
    drawBuildingFromLayout(doc, layout, oX, oY);
  } else {
    // Empty plot
    doc.setTextColor(...C.MUTED);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.text(layout.emptyPlotText, oX + layout.viewport.w / 2, oY + ground.y - layout.viewport.h * 0.22, { align: "center" });
    doc.setFontSize(6);
    doc.text(layout.emptyPlotSub, oX + layout.viewport.w / 2, oY + ground.y - layout.viewport.h * 0.15, { align: "center" });
  }

  // ═══ Secondary Buildings ═══
  for (const sec of layout.secondaryBuildings) {
    drawSecondaryBuildingOnPdf(doc, sec, oX, oY);
  }

  // Panel caption
  doc.setTextColor(80, 80, 80);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5);
  doc.text(layout.direction, oX + layout.viewport.w / 2, boxY + boxH + 1, { align: "center" });
}

// ═══════════════════════════════════════════════════════════════════════════
// Building Drawing (from layout coordinates)
// ═══════════════════════════════════════════════════════════════════════════

function drawBuildingFromLayout(
  doc: jsPDF,
  layout: ElevationLayout,
  oX: number,
  oY: number,
) {
  const b = layout.building!;

  // ── Foundation ──
  doc.setFillColor(...C.FOUNDATION);
  doc.setGState(new (doc as unknown as { GState: new (opts: { opacity: number }) => unknown }).GState({ opacity: 0.3 }));
  doc.rect(oX + b.foundation.x, oY + b.foundation.y, b.foundation.w, b.foundation.h, "F");
  doc.setGState(new (doc as unknown as { GState: new (opts: { opacity: number }) => unknown }).GState({ opacity: 1 }));

  // ── Walls ──
  doc.setFillColor(...C.WALLS);
  doc.setDrawColor(...C.WALLS_STROKE);
  doc.setLineWidth(0.7);
  doc.rect(oX + b.rect.x, oY + b.rect.y, b.rect.w, b.rect.h, "FD");

  // ── Fascia line ──
  doc.setDrawColor(...C.FASCIA);
  doc.setLineWidth(b.fascia.thickness * 1.5);
  doc.line(oX + b.fascia.x1, oY + b.fascia.y1, oX + b.fascia.x2, oY + b.fascia.y2);

  // ── Roof ──
  doc.setFillColor(...C.ROOF);
  doc.setDrawColor(...C.ROOF_STROKE);
  doc.setLineWidth(0.7);

  const roofPts = b.roof.points;
  if (b.roof.type === "flat") {
    doc.rect(
      oX + roofPts[0].x, oY + roofPts[3].y,
      roofPts[1].x - roofPts[0].x, roofPts[0].y - roofPts[3].y, "FD",
    );
  } else if (b.roof.type === "hip" && roofPts.length === 4) {
    doc.triangle(
      oX + roofPts[0].x, oY + roofPts[0].y,
      oX + roofPts[1].x, oY + roofPts[1].y,
      oX + roofPts[2].x, oY + roofPts[2].y, "FD",
    );
    doc.triangle(
      oX + roofPts[2].x, oY + roofPts[2].y,
      oX + roofPts[3].x, oY + roofPts[3].y,
      oX + roofPts[1].x, oY + roofPts[1].y, "FD",
    );
  } else {
    // Gable
    doc.triangle(
      oX + roofPts[0].x, oY + roofPts[0].y,
      oX + roofPts[1].x, oY + roofPts[1].y,
      oX + roofPts[2].x, oY + roofPts[2].y, "FD",
    );
  }

  // Roof texture rows
  doc.setDrawColor(130, 120, 110);
  doc.setLineWidth(0.15);
  for (const row of b.roof.textureRows) {
    doc.line(oX + row.x1, oY + row.y, oX + row.x2, oY + row.y);
  }

  // ── Windows ──
  for (const win of b.windows) {
    // Lintel
    doc.setFillColor(136, 136, 136);
    doc.setGState(new (doc as unknown as { GState: new (opts: { opacity: number }) => unknown }).GState({ opacity: 0.4 }));
    doc.rect(oX + win.x - 0.5, oY + win.lintelY, win.w + 1, win.y - win.lintelY, "F");
    doc.setGState(new (doc as unknown as { GState: new (opts: { opacity: number }) => unknown }).GState({ opacity: 1 }));

    // Window
    doc.setFillColor(...C.WINDOW);
    doc.setDrawColor(...C.WINDOW_FRAME);
    doc.setLineWidth(0.3);
    doc.rect(oX + win.x, oY + win.y, win.w, win.h, "FD");
    // Mullion
    doc.setLineWidth(0.2);
    doc.line(oX + win.mullionX, oY + win.y, oX + win.mullionX, oY + win.y + win.h);
    doc.line(oX + win.x, oY + win.mullionY, oX + win.x + win.w, oY + win.mullionY);
    // Sill
    doc.setDrawColor(...C.WALLS_STROKE);
    doc.setLineWidth(0.4);
    doc.line(oX + win.x - 0.5, oY + win.sillY, oX + win.x + win.w + 0.5, oY + win.sillY);
  }

  // ── Door ──
  if (b.door) {
    doc.setFillColor(...C.DOOR);
    doc.setDrawColor(60, 40, 20);
    doc.setLineWidth(0.4);
    doc.rect(oX + b.door.x, oY + b.door.y, b.door.w, b.door.h, "FD");
    doc.setFillColor(200, 180, 100);
    doc.circle(oX + b.door.handleX, oY + b.door.handleY, 0.5, "F");
  }

  // ── Chimney ──
  if (b.chimney) {
    doc.setFillColor(...C.CHIMNEY);
    doc.setDrawColor(...C.WALLS_STROKE);
    doc.setLineWidth(0.4);
    doc.rect(oX + b.chimney.x, oY + b.chimney.y, b.chimney.w, b.chimney.h, "FD");
    doc.setFillColor(80, 70, 60);
    doc.rect(oX + b.chimney.x - 0.5, oY + b.chimney.capY, b.chimney.w + 1, b.chimney.capH, "F");
  }

  // ── Building label ──
  const lbl = b.label;
  const textW = lbl.text.length * 1.5 + 6;
  doc.setFillColor(...C.PROJECTED_BG);
  doc.roundedRect(oX + lbl.x - textW / 2, oY + lbl.y - 2, textW, 4, 0.5, 0.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(4);
  doc.text(lbl.text, oX + lbl.x, oY + lbl.y + 0.5, { align: "center" });

  // ═══ Dimensions ═══

  // Wall height (left)
  drawDimLine(doc, b.wallHeightDim, oX, oY, true);

  // Ridge height (right)
  drawDimLine(doc, b.ridgeHeightDim, oX, oY, false);

  // Building width (bottom)
  drawDimLine(doc, b.buildingWidthDim, oX, oY, false);

  // Setback dimensions
  drawSetback(doc, b.setbackLeft, oX, oY);
  drawSetback(doc, b.setbackRight, oX, oY);

  // ═══ NGF Labels ═══
  const ngl = b.ngfLabels;
  doc.setTextColor(...C.LABEL);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(4);
  doc.text(ngl.ground.text, oX + ngl.ground.x, oY + ngl.ground.y);
  doc.text(ngl.wall.text, oX + ngl.wall.x, oY + ngl.wall.y);
  doc.text(ngl.ridge.text, oX + ngl.ridge.x, oY + ngl.ridge.y, { align: "center" });
  doc.setTextColor(...C.DIM_BOX);
  doc.text(ngl.eave.text, oX + ngl.eave.x, oY + ngl.eave.y);
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(3.5);
  doc.text(ngl.floor.text, oX + ngl.floor.x, oY + ngl.floor.y);

  // ═══ Material Annotations ═══
  if (b.wallAnnotation) drawMaterialAnnotation(doc, b.wallAnnotation, oX, oY);
  if (b.roofAnnotation) drawMaterialAnnotation(doc, b.roofAnnotation, oX, oY);
}

// ═══════════════════════════════════════════════════════════════════════════
// Secondary Building Drawing (from layout coordinates)
// ═══════════════════════════════════════════════════════════════════════════

function drawSecondaryBuildingOnPdf(
  doc: jsPDF,
  sec: SecondaryBuildingLayout,
  oX: number,
  oY: number,
) {
  // Parse hex color to RGB
  const hexToRgb = (hex: string): [number, number, number] => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
  };

  // Walls
  const wallRgb = hexToRgb(sec.color);
  doc.setFillColor(wallRgb[0], wallRgb[1], wallRgb[2]);
  doc.setDrawColor(...C.WALLS_STROKE);
  doc.setLineWidth(0.5);
  doc.rect(oX + sec.rect.x, oY + sec.rect.y, sec.rect.w, sec.rect.h, "FD");

  // Fascia
  doc.setDrawColor(...C.FASCIA);
  doc.setLineWidth(sec.fascia.thickness * 1.5);
  doc.line(oX + sec.fascia.x1, oY + sec.fascia.y1, oX + sec.fascia.x2, oY + sec.fascia.y2);

  // Roof
  const roofColors: Record<string, [number, number, number]> = {
    garage: [139, 115, 85],
    parking: [123, 143, 160],
    carport: [107, 142, 90],
    shed: [155, 139, 123],
  };
  const rc = roofColors[sec.buildingType] || [100, 89, 78];
  doc.setFillColor(rc[0], rc[1], rc[2]);
  doc.setDrawColor(60, 53, 48);
  doc.setLineWidth(0.5);

  const pts = sec.roof.points;
  if (sec.roof.type === "flat" && pts.length >= 4) {
    doc.rect(oX + pts[0].x, oY + pts[3].y, pts[1].x - pts[0].x, pts[0].y - pts[3].y, "FD");
  } else if (pts.length >= 3) {
    doc.triangle(
      oX + pts[0].x, oY + pts[0].y,
      oX + pts[1].x, oY + pts[1].y,
      oX + pts[2].x, oY + pts[2].y, "FD",
    );
  }

  // Roof texture rows
  doc.setDrawColor(130, 120, 110);
  doc.setLineWidth(0.1);
  for (const row of sec.roof.textureRows) {
    doc.line(oX + row.x1, oY + row.y, oX + row.x2, oY + row.y);
  }

  // Label
  const lbl = sec.label;
  const textW = lbl.text.length * 1.3 + 4;
  const lblColors: Record<string, [number, number, number]> = {
    garage: [139, 92, 246],
    parking: [107, 114, 128],
    carport: [5, 150, 105],
    shed: [146, 64, 14],
  };
  const lc = lblColors[sec.buildingType] || [71, 85, 105];
  doc.setFillColor(lc[0], lc[1], lc[2]);
  doc.roundedRect(oX + lbl.x - textW / 2, oY + lbl.y - 1.5, textW, 3.5, 0.5, 0.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(3.5);
  doc.text(lbl.text, oX + lbl.x, oY + lbl.y + 0.5, { align: "center" });

  // Dimensions
  drawDimLine(doc, sec.heightDim, oX, oY, true);
  drawDimLine(doc, sec.widthDim, oX, oY, false);
}

// ═══════════════════════════════════════════════════════════════════════════
// Drawing Helpers
// ═══════════════════════════════════════════════════════════════════════════

function drawDimLine(
  doc: jsPDF,
  dim: ElevationLayout["plotDim"],
  oX: number,
  oY: number,
  isLeft: boolean,
) {
  doc.setDrawColor(...C.DIM_BOX);
  doc.setLineWidth(0.3);

  if (dim.vertical) {
    doc.line(oX + dim.x1, oY + dim.y1, oX + dim.x2, oY + dim.y2);
    doc.line(oX + dim.x1 - dim.tickLen, oY + dim.y1, oX + dim.x1 + dim.tickLen, oY + dim.y1);
    doc.line(oX + dim.x2 - dim.tickLen, oY + dim.y2, oX + dim.x2 + dim.tickLen, oY + dim.y2);
    const textW = dim.label.length * 1.5 + 3;
    const bx = isLeft ? oX + dim.labelX - textW : oX + dim.labelX;
    doc.setFillColor(...C.DIM_BOX);
    doc.roundedRect(bx, oY + dim.labelY - 2.5, textW, 5, 0.5, 0.5, "F");
    doc.setTextColor(...C.DIM_TEXT);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(4.5);
    doc.text(dim.label, bx + textW / 2, oY + dim.labelY + 0.8, { align: "center" });
  } else {
    doc.setDrawColor(...C.GROUND);
    doc.line(oX + dim.x1, oY + dim.y1, oX + dim.x2, oY + dim.y2);
    doc.line(oX + dim.x1, oY + dim.y1 - dim.tickLen, oX + dim.x1, oY + dim.y1 + dim.tickLen);
    doc.line(oX + dim.x2, oY + dim.y2 - dim.tickLen, oX + dim.x2, oY + dim.y2 + dim.tickLen);
    const dlW = dim.label.length * 1.8 + 3;
    doc.setFillColor(...C.DIM_BOX);
    doc.roundedRect(oX + dim.labelX - dlW / 2, oY + dim.labelY - 2, dlW, 4, 0.5, 0.5, "F");
    doc.setTextColor(...C.DIM_TEXT);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(4.5);
    doc.text(dim.label, oX + dim.labelX, oY + dim.labelY + 0.5, { align: "center" });
  }
}

function drawSetback(
  doc: jsPDF,
  dim: ElevationLayout extends { building: infer B } ? B extends { setbackLeft: infer S } ? S : never : never,
  oX: number,
  oY: number,
) {
  if (!dim || !dim.visible) return;
  doc.setDrawColor(...C.LABEL);
  doc.setLineWidth(0.3);
  // Dashed line
  let cx = oX + dim.x1;
  while (cx < oX + dim.x2 - 1) {
    doc.line(cx, oY + dim.y, Math.min(cx + 2, oX + dim.x2), oY + dim.y);
    cx += 4;
  }
  doc.line(oX + dim.x1, oY + dim.y - 1.5, oX + dim.x1, oY + dim.y + 1.5);
  doc.line(oX + dim.x2, oY + dim.y - 1.5, oX + dim.x2, oY + dim.y + 1.5);
  doc.setTextColor(...C.LABEL);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(3.5);
  const midX = (dim.x1 + dim.x2) / 2;
  doc.text(dim.label, oX + midX, oY + dim.y - 1.5, { align: "center" });
}

function drawMaterialAnnotation(
  doc: jsPDF,
  annot: NonNullable<NonNullable<ElevationLayout["building"]>["wallAnnotation"]>,
  oX: number,
  oY: number,
) {
  doc.setDrawColor(...C.MAT_LEADER);
  doc.setLineWidth(0.3);
  doc.line(oX + annot.anchorX, oY + annot.anchorY, oX + annot.labelX - 2, oY + annot.labelY);
  doc.setFillColor(...C.MAT_LEADER);
  doc.circle(oX + annot.anchorX, oY + annot.anchorY, 0.6, "F");
  doc.setTextColor(...C.MAT_LEADER);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(4);
  for (let i = 0; i < annot.lines.length; i++) {
    doc.text(annot.lines[i], oX + annot.labelX, oY + annot.labelY - 1 + i * 3);
  }
}

// ── Page-level helpers (unchanged) ──

function drawPageHeaderBar(
  doc: jsPDF,
  m: number,
  cW: number,
  title: string,
  color: [number, number, number],
  pageLabel: string,
) {
  doc.setFillColor(...color);
  doc.rect(m, m, cW, 14, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(title, m + 6, m + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Échelle 1/100", m + 6, m + 12);
  doc.text(`Page ${pageLabel}`, m + cW - 6, m + 9, { align: "right" });
}

function drawScaleBadge(doc: jsPDF, x: number, y: number) {
  doc.setFillColor(26, 26, 26);
  doc.roundedRect(x, y, 24, 18, 1, 1, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  doc.text("ECHELLE", x + 12, y + 5, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("1/100", x + 12, y + 12, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(4);
  doc.text("ème", x + 12, y + 16, { align: "center" });
}

function drawDisclaimerText(doc: jsPDF, x: number, y: number, w: number) {
  doc.setTextColor(140, 140, 140);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(4);
  doc.text(
    "Document ne pouvant servir à l'exécution des travaux - Il appartient au maître d'œuvre de réaliser toutes les études et les contrôles nécessaires par des organismes agréés afin d'édifier ce bâtiment dans les règles de l'art et la réglementation en vigueur (DTU, PLU,...). Ce dessin est réalisé d'après les documents fournis par le maître d'ouvrage.",
    x + w / 2, y, { align: "center", maxWidth: w - 4 },
  );
}

function drawGrassVegetation(doc: jsPDF, startX: number, groundY: number, width: number) {
  doc.setDrawColor(...C.GRASS);
  doc.setLineWidth(0.4);
  const count = Math.floor(width / 5);
  for (let i = 0; i < count; i++) {
    const x = startX + i * (width / count) + (i % 3) * 0.7;
    const h = 1 + (i % 3) * 0.4;
    doc.line(x, groundY, x - 0.3, groundY - h);
    doc.line(x + 0.8, groundY, x + 1.1, groundY - h * 0.7);
  }
}
