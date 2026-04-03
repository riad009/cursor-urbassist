/**
 * PC5 — Plans des Façades (Facades & Elevations)
 *
 *   PC5.1 — État Initial (2 pages: empty plot, 4 directions)
 *   PC5.2 — État Projeté (2 pages: building elevations, 4 directions)
 *
 * Generates 4 pages of A3 landscape PDF with professional
 * 2D technical elevation drawings:
 *   - Ground line with hatched underground
 *   - Red dashed property boundaries
 *   - TN/TF and NGF labels
 *   - Building profiles with walls, roof, dimension callouts
 *   - Material annotations with leader lines
 *
 * No captured images needed — generates entirely from project data.
 */

import { jsPDF } from "jspdf";
import {
  DossierProjectData,
  GeneratorResult,
} from "./types";
import { A3L, drawFooter } from "./shared";
import {
  BuildingDims,
  ParcelDims,
  getBuildingData,
  getParcelDimensions,
  getNGFValue,
} from "./svg-helpers";

// ─── Drawing palette ───────────────────────────────────────────────────────

const C = {
  BOUNDARY: [220, 0, 0] as [number, number, number],
  GROUND: [0, 0, 0] as [number, number, number],
  WALLS: [245, 240, 220] as [number, number, number],
  WALLS_STROKE: [51, 51, 51] as [number, number, number],
  ROOF: [85, 85, 85] as [number, number, number],
  HATCH: [51, 51, 51] as [number, number, number],
  DIM_BOX: [30, 58, 138] as [number, number, number],
  DIM_TEXT: [255, 255, 255] as [number, number, number],
  TN_MARKER: [249, 115, 22] as [number, number, number],
  LABEL: [100, 116, 139] as [number, number, number],
  MUTED: [148, 163, 184] as [number, number, number],
  SECTION_BG: [248, 250, 252] as [number, number, number],
  HEADER_EXIST: [91, 33, 182] as [number, number, number],   // violet-800
  HEADER_PROJ: [159, 18, 57] as [number, number, number],    // rose-800
  MAT_LEADER: [79, 70, 229] as [number, number, number],
};

const DIRECTIONS: Array<{ label: string; dimension: "width" | "depth" }> = [
  { label: "ÉLÉVATION OUEST", dimension: "width" },
  { label: "ÉLÉVATION EST", dimension: "width" },
  { label: "ÉLÉVATION NORD", dimension: "depth" },
  { label: "ÉLÉVATION SUD", dimension: "depth" },
];

export async function generatePC5(
  doc: jsPDF,
  project: DossierProjectData,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _capturedImages?: Record<string, string | undefined>
): Promise<GeneratorResult> {
  const building = getBuildingData(project);
  const parcel = getParcelDimensions(project.parcelGeometry, project.parcelArea);
  const ngf = getNGFValue(project);
  const { W, M, H, FOOTER_H } = A3L;
  const cW = W - M * 2;

  // ═══════════════════════════════════════════════════════════════════════════
  // PC5.1 — PAGE 1: WEST & EAST Initial
  // ═══════════════════════════════════════════════════════════════════════════
  drawPageHeaderBar(doc, M, cW, "PC5.1 — PLAN DES FAÇADES — ÉTAT INITIAL", C.HEADER_EXIST, "1/4");
  const startY = M + 18;
  const halfH = (H - startY - FOOTER_H - 6) / 2;

  // WEST elevation (initial)
  drawElevationPanel(doc, M, startY, cW, halfH - 2, DIRECTIONS[0].label, parcel, null, ngf, DIRECTIONS[0].dimension);
  // EAST elevation (initial)
  drawElevationPanel(doc, M, startY + halfH + 2, cW, halfH - 2, DIRECTIONS[1].label, parcel, null, ngf, DIRECTIONS[1].dimension);

  drawScaleBadge(doc, W - M - 28, startY + 1);
  drawFooter(doc, {
    docTitle: "PLAN DES FAÇADES — ÉTAT INITIAL",
    pcmiNumber: "PCMI 5.1",
    address: project.address || undefined,
    parcelRef: project.parcelIds || undefined,
    scale: "1 : 100",
    pageNum: 1,
    totalPages: 4,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PC5.1 — PAGE 2: NORTH & SOUTH Initial
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage([420, 297], "landscape");
  drawPageHeaderBar(doc, M, cW, "PC5.1 — PLAN DES FAÇADES — ÉTAT INITIAL", C.HEADER_EXIST, "2/4");

  drawElevationPanel(doc, M, startY, cW, halfH - 2, DIRECTIONS[2].label, parcel, null, ngf, DIRECTIONS[2].dimension);
  drawElevationPanel(doc, M, startY + halfH + 2, cW, halfH - 2, DIRECTIONS[3].label, parcel, null, ngf, DIRECTIONS[3].dimension);

  drawScaleBadge(doc, W - M - 28, startY + 1);
  drawFooter(doc, {
    docTitle: "PLAN DES FAÇADES — ÉTAT INITIAL",
    pcmiNumber: "PCMI 5.1",
    address: project.address || undefined,
    parcelRef: project.parcelIds || undefined,
    scale: "1 : 100",
    pageNum: 2,
    totalPages: 4,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PC5.2 — PAGE 3: WEST & EAST Projected
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage([420, 297], "landscape");
  drawPageHeaderBar(doc, M, cW, "PC5.2 — PLAN DES FAÇADES — ÉTAT PROJETÉ", C.HEADER_PROJ, "3/4");

  drawElevationPanel(doc, M, startY, cW, halfH - 2, DIRECTIONS[0].label, parcel, building, ngf, DIRECTIONS[0].dimension);
  drawElevationPanel(doc, M, startY + halfH + 2, cW, halfH - 2, DIRECTIONS[1].label, parcel, building, ngf, DIRECTIONS[1].dimension);

  drawScaleBadge(doc, W - M - 28, startY + 1);
  drawFooter(doc, {
    docTitle: "PLAN DES FAÇADES — ÉTAT PROJETÉ",
    pcmiNumber: "PCMI 5.2",
    address: project.address || undefined,
    parcelRef: project.parcelIds || undefined,
    scale: "1 : 100",
    pageNum: 3,
    totalPages: 4,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PC5.2 — PAGE 4: NORTH & SOUTH Projected
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage([420, 297], "landscape");
  drawPageHeaderBar(doc, M, cW, "PC5.2 — PLAN DES FAÇADES — ÉTAT PROJETÉ", C.HEADER_PROJ, "4/4");

  drawElevationPanel(doc, M, startY, cW, halfH - 2, DIRECTIONS[2].label, parcel, building, ngf, DIRECTIONS[2].dimension);
  drawElevationPanel(doc, M, startY + halfH + 2, cW, halfH - 2, DIRECTIONS[3].label, parcel, building, ngf, DIRECTIONS[3].dimension);

  drawScaleBadge(doc, W - M - 28, startY + 1);
  drawFooter(doc, {
    docTitle: "PLAN DES FAÇADES — ÉTAT PROJETÉ",
    pcmiNumber: "PCMI 5.2",
    address: project.address || undefined,
    parcelRef: project.parcelIds || undefined,
    scale: "1 : 100",
    pageNum: 4,
    totalPages: 4,
  });

  return { pageCount: 4, label: "Plans des Façades", code: "PC5" };
}

// ─── Page header bar ───────────────────────────────────────────────────────

function drawPageHeaderBar(
  doc: jsPDF,
  m: number,
  cW: number,
  title: string,
  color: [number, number, number],
  pageLabel: string
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

// ─── Scale badge ───────────────────────────────────────────────────────────

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

// ─── Single elevation panel ────────────────────────────────────────────────

function drawElevationPanel(
  doc: jsPDF,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  directionLabel: string,
  parcel: ParcelDims,
  building: BuildingDims | null,
  ngf: number,
  facadeDimension: "width" | "depth"
) {
  // Section label
  doc.setFillColor(...C.SECTION_BG);
  doc.rect(boxX, boxY, boxW, 7, "F");
  doc.setTextColor(30, 41, 59);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text(directionLabel, boxX + 5, boxY + 5);

  const drawY = boxY + 8;
  const drawH = boxH - 9;

  // Box border
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.3);
  doc.rect(boxX, drawY, boxW, drawH, "S");

  // Ground at 70%
  const groundY = drawY + drawH * 0.72;
  const hatchDepth = drawY + drawH - groundY;

  // Property boundaries
  const leftBX = boxX + 30;
  const rightBX = boxX + boxW - 30;
  const plotSpan = rightBX - leftBX;

  // Facade dimension in meters
  const facadeLenM = facadeDimension === "width" ? parcel.widthM : parcel.depthM;
  const pxPerM = plotSpan / facadeLenM;

  // ── Hatch underground ──
  doc.setDrawColor(...C.HATCH);
  doc.setLineWidth(0.25);
  const spacing = 3.5;
  for (let i = 0; i < (boxW + hatchDepth) / spacing; i++) {
    const sx = boxX + i * spacing;
    const ex = sx - hatchDepth;
    if (sx > boxX && ex < boxX + boxW) {
      doc.line(
        Math.max(boxX, Math.min(boxX + boxW, sx)), groundY,
        Math.max(boxX, Math.min(boxX + boxW, ex)), groundY + hatchDepth
      );
    }
  }

  // ── Ground line ──
  doc.setDrawColor(...C.GROUND);
  doc.setLineWidth(1.8);
  doc.line(boxX, groundY, boxX + boxW, groundY);

  // ── Property boundaries ──
  doc.setDrawColor(...C.BOUNDARY);
  doc.setLineWidth(1.2);
  for (const bx of [leftBX, rightBX]) {
    let cy = drawY + 6;
    while (cy < groundY + hatchDepth - 2) {
      doc.line(bx, cy, bx, Math.min(cy + 5, groundY + hatchDepth - 2));
      cy += 8;
    }
  }

  // Boundary labels
  doc.setTextColor(...C.BOUNDARY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5);
  doc.text("Limite de propriété", leftBX - 2, (drawY + groundY) / 2, { angle: 90 });
  doc.text("Limite de propriété", rightBX + 5, (drawY + groundY) / 2, { angle: 90 });

  // ── TN markers ──
  for (const bx of [leftBX, rightBX]) {
    doc.setFillColor(...C.TN_MARKER);
    doc.rect(bx - 1.5, groundY - 1.5, 3, 3, "F");
  }
  doc.setTextColor(...C.GROUND);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  doc.text(`TN=TF / +${ngf.toFixed(2)} NGF`, leftBX + 5, groundY + 2);
  doc.text(`TN=TF / +${ngf.toFixed(2)} NGF`, rightBX - 5, groundY + 2, { align: "right" });

  // ── TN label centered ──
  doc.setTextColor(...C.LABEL);
  doc.setFontSize(5.5);
  doc.text("TN (Terrain Naturel)", boxX + boxW / 2, groundY - 2, { align: "center" });

  if (building) {
    // ═══ Building ═══
    const buildingFacadeLen = facadeDimension === "width" ? building.width : building.depth;
    const bWidthPx = Math.min(buildingFacadeLen * pxPerM, plotSpan * 0.55);
    const wallHPx = building.wallHeight * pxPerM;
    const ridgeHPx = building.ridgeHeight * pxPerM;
    const centerX = (leftBX + rightBX) / 2;
    const bX = centerX - bWidthPx / 2;
    const wallTop = groundY - wallHPx;
    const ridgeTop = groundY - ridgeHPx;

    // Walls
    doc.setFillColor(...C.WALLS);
    doc.setDrawColor(...C.WALLS_STROKE);
    doc.setLineWidth(0.7);
    doc.rect(bX, wallTop, bWidthPx, wallHPx, "FD");

    // Window openings
    const winW = Math.min(bWidthPx * 0.08, 6);
    const winH = wallHPx * 0.35;
    const numWin = Math.min(Math.floor(bWidthPx / (winW * 3)), 5);
    const winSpacing = bWidthPx / (numWin + 1);
    doc.setFillColor(186, 230, 253);
    doc.setDrawColor(51, 65, 85);
    doc.setLineWidth(0.3);
    for (let w = 1; w <= numWin; w++) {
      const wx = bX + w * winSpacing - winW / 2;
      const wy = wallTop + wallHPx * 0.25;
      doc.rect(wx, wy, winW, winH, "FD");
    }

    // Door
    const doorW = Math.min(bWidthPx * 0.06, 5);
    const doorH = wallHPx * 0.55;
    doc.setFillColor(120, 53, 15);
    doc.rect(centerX - doorW / 2, groundY - doorH, doorW, doorH, "F");

    // Roof
    doc.setFillColor(...C.ROOF);
    doc.setDrawColor(...C.WALLS_STROKE);
    doc.setLineWidth(0.7);
    if (building.roofType === "flat") {
      doc.rect(bX - 1, wallTop - 2.5, bWidthPx + 2, 2.5, "FD");
    } else if (building.roofType === "hip") {
      const inset = bWidthPx * 0.2;
      doc.triangle(bX - 1, wallTop, bX + inset, ridgeTop, bX + bWidthPx + 1, wallTop, "FD");
    } else {
      doc.triangle(bX - 1, wallTop, centerX, ridgeTop, bX + bWidthPx + 1, wallTop, "FD");
    }

    // ── Dimension annotations ──

    // Wall height (left)
    const dimLX = bX - 8;
    doc.setDrawColor(...C.DIM_BOX);
    doc.setLineWidth(0.3);
    doc.line(dimLX, groundY, dimLX, wallTop);
    doc.line(dimLX - 1.5, groundY, dimLX + 1.5, groundY);
    doc.line(dimLX - 1.5, wallTop, dimLX + 1.5, wallTop);
    drawDimLabel(doc, dimLX - 2, (groundY + wallTop) / 2, `${building.wallHeight.toFixed(1)} m`, true);

    // Ridge height (right)
    const dimRX = bX + bWidthPx + 8;
    doc.line(dimRX, groundY, dimRX, ridgeTop);
    doc.line(dimRX - 1.5, groundY, dimRX + 1.5, groundY);
    doc.line(dimRX - 1.5, ridgeTop, dimRX + 1.5, ridgeTop);
    drawDimLabel(doc, dimRX + 2, (groundY + ridgeTop) / 2, `${building.ridgeHeight.toFixed(1)} m`, false);

    // Building width
    const bwY = groundY + 4;
    doc.line(bX, bwY, bX + bWidthPx, bwY);
    doc.line(bX, bwY - 1.5, bX, bwY + 1.5);
    doc.line(bX + bWidthPx, bwY - 1.5, bX + bWidthPx, bwY + 1.5);
    const dimLabel = `${buildingFacadeLen.toFixed(1)} m`;
    const dlW = dimLabel.length * 1.8 + 3;
    doc.setFillColor(...C.DIM_BOX);
    doc.roundedRect(centerX - dlW / 2, bwY - 2, dlW, 4, 0.5, 0.5, "F");
    doc.setTextColor(...C.DIM_TEXT);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(4.5);
    doc.text(dimLabel, centerX, bwY + 0.5, { align: "center" });

    // NGF labels
    doc.setTextColor(...C.LABEL);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(4.5);
    doc.text(`+${(ngf + building.wallHeight).toFixed(2)} NGF`, bX - 14, wallTop + 1);
    doc.text(`+${(ngf + building.ridgeHeight).toFixed(2)} NGF`, centerX, ridgeTop - 2, { align: "center" });
    doc.text(`+${ngf.toFixed(2)} NGF`, bX - 14, groundY + 1);

    // ── Material annotations with leader lines ──
    const matAnnotX = bX + bWidthPx + 28;
    if (matAnnotX < boxX + boxW - 30) {
      doc.setDrawColor(...C.MAT_LEADER);
      doc.setLineWidth(0.3);

      // Wall material
      const wallAnchorY = (wallTop + groundY) / 2;
      doc.line(bX + bWidthPx + 2, wallAnchorY, matAnnotX - 2, wallAnchorY);
      doc.circle(bX + bWidthPx + 2, wallAnchorY, 0.8, "F");
      doc.setTextColor(...C.MAT_LEADER);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(4.5);
      doc.text(`${building.wallMaterial}`, matAnnotX, wallAnchorY - 1);
      doc.text(`${building.wallColor}`, matAnnotX, wallAnchorY + 2.5);

      // Roof material
      const roofAnchorY = building.roofType === "flat" ? wallTop - 2 : (wallTop + ridgeTop) / 2;
      doc.line(bX + bWidthPx + 2, roofAnchorY, matAnnotX - 2, roofAnchorY);
      doc.circle(bX + bWidthPx + 2, roofAnchorY, 0.8, "F");
      doc.text(`${building.roofMaterial}`, matAnnotX, roofAnchorY - 1);
      doc.text(`${building.roofColor}`, matAnnotX, roofAnchorY + 2.5);
    }
  } else {
    // Empty plot
    doc.setTextColor(...C.MUTED);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.text("Terrain vierge — aucune construction existante", boxX + boxW / 2, groundY - drawH * 0.22, { align: "center" });
    doc.setFontSize(6);
    doc.text("(Aucune élévation à représenter)", boxX + boxW / 2, groundY - drawH * 0.15, { align: "center" });
  }
}

// ─── Dimension label box ───────────────────────────────────────────────────

function drawDimLabel(
  doc: jsPDF,
  x: number,
  y: number,
  label: string,
  isLeft: boolean
) {
  const textW = label.length * 1.5 + 3;
  const bx = isLeft ? x - textW : x;
  doc.setFillColor(...C.DIM_BOX);
  doc.roundedRect(bx, y - 2.5, textW, 5, 0.5, 0.5, "F");
  doc.setTextColor(...C.DIM_TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(4.5);
  doc.text(label, bx + textW / 2, y + 0.8, { align: "center" });
}
