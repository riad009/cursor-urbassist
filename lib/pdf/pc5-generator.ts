/**
 * PC5 — Plans des Façades (Facades & Elevations)
 *
 *   PC5.1 — État Initial (2 pages: existing building or empty plot, 4 directions)
 *   PC5.2 — État Projeté (2 pages: proposed building elevations, 4 directions)
 *
 * Generates 4 pages of A3 landscape PDF with professional
 * 2D technical elevation drawings matching French Mairie submission standards.
 *
 * Features:
 *   - Ground line with hatched underground and grass vegetation
 *   - Red dashed property boundaries with rotated labels
 *   - TN/TF markers with NGF altitude labels
 *   - Building profiles with walls, windows, door, textured roof, chimney
 *   - Dimension callouts (wall height, ridge height, eave, building width)
 *   - Material annotation leader lines (wall material, roof material + RAL/pitch)
 *   - Disclaimer text per French permit standards
 *
 * No captured images needed — generates entirely from project data.
 */

import { jsPDF } from "jspdf";
import {
  DossierProjectData,
  GeneratorResult,
} from "./types";
import { A3L, drawFooter, formatDateFR } from "./shared";
import {
  BuildingDims,
  ParcelDims,
} from "./svg-helpers";
import { extractProjectData, type MergedMaterials } from "./extract-project-data";

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
  HEADER_EXIST: [91, 33, 182] as [number, number, number],   // violet-800
  HEADER_PROJ: [159, 18, 57] as [number, number, number],    // rose-800
  MAT_LEADER: [30, 58, 138] as [number, number, number],
  GRASS: [120, 180, 80] as [number, number, number],
  WINDOW: [176, 216, 240] as [number, number, number],
  WINDOW_FRAME: [51, 65, 85] as [number, number, number],
  DOOR: [110, 70, 40] as [number, number, number],
  CHIMNEY: [140, 120, 100] as [number, number, number],
};

const DIRECTIONS: Array<{ label: string; dimension: "width" | "depth" }> = [
  { label: "ÉLÉVATION OUEST", dimension: "depth" },
  { label: "ÉLÉVATION EST", dimension: "depth" },
  { label: "ÉLÉVATION NORD", dimension: "width" },
  { label: "ÉLÉVATION SUD", dimension: "width" },
];

export async function generatePC5(
  doc: jsPDF,
  project: DossierProjectData,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _capturedImages?: Record<string, string | undefined>
): Promise<GeneratorResult> {
  const extracted = extractProjectData(project);
  const building = extracted.building;
  const existingBuilding = extracted.existingBuilding;
  const parcel = extracted.parcel;
  const ngf = extracted.ngfAltitude;
  const materials = extracted.materials;
  const { W, M, H, FOOTER_H } = A3L;
  const cW = W - M * 2;

  // ═══════════════════════════════════════════════════════════════════════════
  // PC5.1 — PAGE 1: WEST & EAST Initial
  // ═══════════════════════════════════════════════════════════════════════════
  drawPageHeaderBar(doc, M, cW, "PC5.1 — FAÇADES ET TOITURES EXISTANTES", C.HEADER_EXIST, "1/4");
  const startY = M + 18;
  const halfH = (H - startY - FOOTER_H - 10) / 2;

  // WEST elevation (initial): show existing building or empty plot
  drawElevationPanel(doc, M, startY, cW, halfH - 2, DIRECTIONS[0].label + " initiale", parcel, existingBuilding, ngf, DIRECTIONS[0].dimension, materials);
  // EAST elevation (initial)
  drawElevationPanel(doc, M, startY + halfH + 2, cW, halfH - 2, DIRECTIONS[1].label + " initiale", parcel, existingBuilding, ngf, DIRECTIONS[1].dimension, materials);

  drawScaleBadge(doc, W - M - 28, startY + 1);
  drawDisclaimerText(doc, M, H - FOOTER_H - 6, cW);
  drawFooter(doc, {
    docTitle: "FAÇADES ET TOITURES EXISTANTES",
    pcmiNumber: "PCMI 5",
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
  drawPageHeaderBar(doc, M, cW, "PC5.1 — FAÇADES ET TOITURES EXISTANTES", C.HEADER_EXIST, "2/4");

  drawElevationPanel(doc, M, startY, cW, halfH - 2, DIRECTIONS[2].label + " initiale", parcel, existingBuilding, ngf, DIRECTIONS[2].dimension, materials);
  drawElevationPanel(doc, M, startY + halfH + 2, cW, halfH - 2, DIRECTIONS[3].label + " initiale", parcel, existingBuilding, ngf, DIRECTIONS[3].dimension, materials);

  drawScaleBadge(doc, W - M - 28, startY + 1);
  drawDisclaimerText(doc, M, H - FOOTER_H - 6, cW);
  drawFooter(doc, {
    docTitle: "FAÇADES ET TOITURES EXISTANTES",
    pcmiNumber: "PCMI 5",
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
  drawPageHeaderBar(doc, M, cW, "PC5.2 — FAÇADES ET TOITURES PROJETÉES", C.HEADER_PROJ, "3/4");

  drawElevationPanel(doc, M, startY, cW, halfH - 2, DIRECTIONS[0].label + " projetée", parcel, building, ngf, DIRECTIONS[0].dimension, materials);
  drawElevationPanel(doc, M, startY + halfH + 2, cW, halfH - 2, DIRECTIONS[1].label + " projetée", parcel, building, ngf, DIRECTIONS[1].dimension, materials);

  drawScaleBadge(doc, W - M - 28, startY + 1);
  drawDisclaimerText(doc, M, H - FOOTER_H - 6, cW);
  drawFooter(doc, {
    docTitle: "FAÇADES ET TOITURES PROJETÉES",
    pcmiNumber: "PCMI 5",
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
  drawPageHeaderBar(doc, M, cW, "PC5.2 — FAÇADES ET TOITURES PROJETÉES", C.HEADER_PROJ, "4/4");

  drawElevationPanel(doc, M, startY, cW, halfH - 2, DIRECTIONS[2].label + " projetée", parcel, building, ngf, DIRECTIONS[2].dimension, materials);
  drawElevationPanel(doc, M, startY + halfH + 2, cW, halfH - 2, DIRECTIONS[3].label + " projetée", parcel, building, ngf, DIRECTIONS[3].dimension, materials);

  drawScaleBadge(doc, W - M - 28, startY + 1);
  drawDisclaimerText(doc, M, H - FOOTER_H - 6, cW);
  drawFooter(doc, {
    docTitle: "FAÇADES ET TOITURES PROJETÉES",
    pcmiNumber: "PCMI 5",
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

// ─── Disclaimer text ───────────────────────────────────────────────────────

function drawDisclaimerText(doc: jsPDF, x: number, y: number, w: number) {
  doc.setTextColor(140, 140, 140);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(4);
  doc.text(
    "Document ne pouvant servir à l'exécution des travaux - Il appartient au maître d'œuvre de réaliser toutes les études et les contrôles nécessaires par des organismes agréés afin d'édifier ce bâtiment dans les règles de l'art et la réglementation en vigueur (DTU, PLU,...). Ce dessin est réalisé d'après les documents fournis par le maître d'ouvrage.",
    x + w / 2, y, { align: "center", maxWidth: w - 4 }
  );
}

// ─── Building-centric zoom scaling ─────────────────────────────────────────

function computeScalePdf(
  plotSpan: number,
  facadeLenM: number,
  buildingFacadeLenM: number,
  buildingHeightM: number,
  availH: number,
): { pxPerM: number; isZoomed: boolean } {
  const naturalPxPerM = plotSpan / facadeLenM;
  const naturalBldgPx = buildingFacadeLenM * naturalPxPerM;
  const minBldgPx = plotSpan * 0.35;
  const idealBldgPx = plotSpan * 0.45;

  let pxPerM = naturalPxPerM;
  let isZoomed = false;

  if (naturalBldgPx < minBldgPx && buildingFacadeLenM > 0) {
    pxPerM = idealBldgPx / buildingFacadeLenM;
    isZoomed = true;
  }

  // Ensure wall height is readable
  const wallHPx = buildingHeightM * pxPerM;
  if (wallHPx < 15 && buildingHeightM > 0) {
    const heightPxPerM = 20 / buildingHeightM;
    if (heightPxPerM > pxPerM) {
      pxPerM = Math.min(heightPxPerM, availH / buildingHeightM);
      isZoomed = true;
    }
  }

  // Cap building width
  const cappedBldgPx = buildingFacadeLenM * pxPerM;
  if (cappedBldgPx > plotSpan * 0.55) {
    pxPerM = (plotSpan * 0.55) / buildingFacadeLenM;
  }

  return { pxPerM, isZoomed };
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
  facadeDimension: "width" | "depth",
  materials: MergedMaterials
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

  // Ground at 72%
  const groundY = drawY + drawH * 0.72;
  const hatchDepth = drawY + drawH - groundY;

  // Property boundaries (natural position)
  const leftBXNatural = boxX + 35;
  const rightBXNatural = boxX + boxW - 35;
  const plotSpan = rightBXNatural - leftBXNatural;

  // Facade dimension in meters
  const facadeLenM = facadeDimension === "width" ? parcel.widthM : parcel.depthM;

  // Building facade length
  const buildingFacadeLen = building
    ? (facadeDimension === "width" ? building.width : building.depth)
    : 0;

  // ── Building-centric zoom ──
  const { pxPerM, isZoomed } = computeScalePdf(
    plotSpan, facadeLenM, buildingFacadeLen,
    building?.wallHeight ?? 0, (groundY - drawY - 20) * 0.6
  );

  // If zoomed, boundaries may extend beyond panel — clamp
  const plotWidthPx = facadeLenM * pxPerM;
  const centerPanel = (leftBXNatural + rightBXNatural) / 2;
  const leftBX = isZoomed ? Math.max(boxX + 5, centerPanel - plotWidthPx / 2) : leftBXNatural;
  const rightBX = isZoomed ? Math.min(boxX + boxW - 5, centerPanel + plotWidthPx / 2) : rightBXNatural;

  // ── Hatch underground ──
  doc.setDrawColor(...C.HATCH);
  doc.setLineWidth(0.25);
  const spacing = 3;
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

  // ── Grass vegetation on ground line ──
  drawGrassVegetation(doc, boxX + 5, groundY, boxW - 10);

  // ── Property boundaries (red dashed) ──
  doc.setDrawColor(...C.BOUNDARY);
  doc.setLineWidth(1.2);
  for (const bx of [leftBX, rightBX]) {
    // Only draw if within visible panel area
    if (bx > boxX + 2 && bx < boxX + boxW - 2) {
      let cy = drawY + 6;
      while (cy < groundY + hatchDepth - 2) {
        doc.line(bx, cy, bx, Math.min(cy + 5, groundY + hatchDepth - 2));
        cy += 8;
      }
    }
  }

  // Boundary labels (rotated) — only if visible
  doc.setTextColor(...C.BOUNDARY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5);
  if (leftBX > boxX + 10) {
    doc.text("Limite de propriété", leftBX - 2, (drawY + groundY) / 2, { angle: 90 });
  }
  if (rightBX < boxX + boxW - 10) {
    doc.text("Limite de propriété", rightBX + 5, (drawY + groundY) / 2, { angle: 90 });
  }

  // ── TN/TF markers ──
  for (const bx of [leftBX, rightBX]) {
    if (bx < boxX + 5 || bx > boxX + boxW - 5) continue;
    // TN marker (orange)
    doc.setFillColor(...C.TN_MARKER);
    doc.roundedRect(bx - 4, groundY + 1, 4, 4, 0.5, 0.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(3);
    doc.text("TN", bx - 2, groundY + 3.5, { align: "center" });

    // TF marker (green)
    doc.setFillColor(...C.TF_MARKER);
    doc.roundedRect(bx + 1, groundY + 1, 3.5, 4, 0.5, 0.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.text("TF", bx + 2.75, groundY + 3.5, { align: "center" });
  }

  // TN=TF labels with ground level values
  doc.setTextColor(...C.GROUND);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(4.5);
  if (leftBX > boxX + 10) {
    doc.text(`TN=TF`, leftBX - 8, groundY - 1.5);
    doc.text(`+0,00`, leftBX - 8, groundY + 2.5);
  }
  if (rightBX < boxX + boxW - 10) {
    doc.text(`TN=TF`, rightBX + 6, groundY - 1.5);
    doc.text(`+0,00`, rightBX + 6, groundY + 2.5);
  }

  // NGF labels under ground line
  doc.setTextColor(...C.LABEL);
  doc.setFontSize(4);
  doc.text(`+${ngf.toFixed(2)} NGF`, boxX + 10, groundY + 7);
  doc.text(`+${ngf.toFixed(2)} NGF`, boxX + boxW - 10, groundY + 7, { align: "right" });

  // ── Plot width dimension line ──
  doc.setDrawColor(...C.GROUND);
  doc.setLineWidth(0.3);
  if (leftBX > boxX + 5 && rightBX < boxX + boxW - 5) {
    doc.line(leftBX, drawY + 3, rightBX, drawY + 3);
    doc.line(leftBX, drawY + 1, leftBX, drawY + 5);
    doc.line(rightBX, drawY + 1, rightBX, drawY + 5);
  }
  const plotLabel = `${facadeLenM.toFixed(1)} m`;
  const plW = plotLabel.length * 1.8 + 4;
  doc.setFillColor(255, 255, 255);
  doc.rect(centerPanel - plW / 2, drawY + 1, plW, 4, "F");
  doc.setTextColor(...C.GROUND);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5);
  doc.text(plotLabel, centerPanel, drawY + 4, { align: "center" });

  if (building) {
    // ═══ Building ═══
    drawBuildingElevation(doc, building, leftBX, rightBX, groundY, plotSpan, pxPerM, facadeDimension, ngf, materials, drawY, boxX, boxW);
  } else {
    // Empty plot
    doc.setTextColor(...C.MUTED);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.text("Terrain vierge — aucune construction existante", boxX + boxW / 2, groundY - drawH * 0.22, { align: "center" });
    doc.setFontSize(6);
    doc.text("(Aucune élévation à représenter)", boxX + boxW / 2, groundY - drawH * 0.15, { align: "center" });
  }

  // Panel caption below
  doc.setTextColor(80, 80, 80);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5);
  doc.text(directionLabel, boxX + boxW / 2, boxY + boxH + 1, { align: "center" });
}

// ─── Building elevation drawing ────────────────────────────────────────────

function drawBuildingElevation(
  doc: jsPDF,
  building: BuildingDims,
  leftBX: number,
  rightBX: number,
  groundY: number,
  plotSpan: number,
  pxPerM: number,
  facadeDimension: "width" | "depth",
  ngf: number,
  materials: MergedMaterials,
  drawYTop: number,
  boxX: number,
  boxW: number
) {
  const buildingFacadeLen = facadeDimension === "width" ? building.width : building.depth;
  // Building-centric: enforce minimum readable sizes
  const bWidthPx = Math.max(buildingFacadeLen * pxPerM, 18);
  const wallHPx = Math.min(Math.max(building.wallHeight * pxPerM, 16), (groundY - drawYTop - 20) * 0.65);
  const ridgeHPx = Math.min(Math.max(building.ridgeHeight * pxPerM, wallHPx + 4), (groundY - drawYTop - 10) * 0.85);
  const centerX = (leftBX + rightBX) / 2;
  const bX = centerX - bWidthPx / 2;
  const wallTop = groundY - wallHPx;
  const ridgeTop = groundY - ridgeHPx;

  // ── Walls ──
  doc.setFillColor(...C.WALLS);
  doc.setDrawColor(...C.WALLS_STROKE);
  doc.setLineWidth(0.7);
  doc.rect(bX, wallTop, bWidthPx, wallHPx, "FD");

  // ── Windows ──
  const winW = Math.min(bWidthPx * 0.07, 5.5);
  const winH = wallHPx * 0.3;
  const numWin = Math.min(Math.floor(bWidthPx / (winW * 3.5)), 6);
  const winSpacing = bWidthPx / (numWin + 1);
  const doorW = Math.min(bWidthPx * 0.055, 4.5);

  for (let w = 1; w <= numWin; w++) {
    const wx = bX + w * winSpacing - winW / 2;
    const wy = wallTop + wallHPx * 0.2;
    // Skip if overlapping door
    if (Math.abs(wx + winW / 2 - centerX) < doorW * 2) continue;

    // Window fill
    doc.setFillColor(...C.WINDOW);
    doc.setDrawColor(...C.WINDOW_FRAME);
    doc.setLineWidth(0.3);
    doc.rect(wx, wy, winW, winH, "FD");

    // Window cross bars
    doc.setLineWidth(0.2);
    doc.line(wx + winW / 2, wy, wx + winW / 2, wy + winH);
    doc.line(wx, wy + winH / 2, wx + winW, wy + winH / 2);

    // Window sill
    doc.setDrawColor(...C.WALLS_STROKE);
    doc.setLineWidth(0.4);
    doc.line(wx - 0.5, wy + winH, wx + winW + 0.5, wy + winH);
  }

  // ── Door ──
  const doorH = wallHPx * 0.5;
  doc.setFillColor(...C.DOOR);
  doc.setDrawColor(60, 40, 20);
  doc.setLineWidth(0.4);
  doc.rect(centerX - doorW / 2, groundY - doorH, doorW, doorH, "FD");
  // Door handle
  doc.setFillColor(200, 180, 100);
  doc.circle(centerX + doorW / 3, groundY - doorH / 2, 0.5, "F");

  // ── Roof ──
  doc.setFillColor(...C.ROOF);
  doc.setDrawColor(...C.ROOF_STROKE);
  doc.setLineWidth(0.7);

  if (building.roofType === "flat") {
    doc.rect(bX - 1, wallTop - 2.5, bWidthPx + 2, 2.5, "FD");
  } else if (building.roofType === "hip") {
    const inset = bWidthPx * 0.2;
    doc.triangle(bX - 1, wallTop, bX + inset, ridgeTop, bX + bWidthPx - inset, wallTop, "FD");
    doc.triangle(bX + bWidthPx - inset, wallTop, bX + bWidthPx + 1, wallTop, bX + inset, ridgeTop, "FD");
    // Roof texture
    drawRoofTexture(doc, bX, wallTop, bWidthPx, ridgeTop, centerX, "hip");
  } else {
    // Gable / pitched
    doc.triangle(bX - 1, wallTop, centerX, ridgeTop, bX + bWidthPx + 1, wallTop, "FD");
    // Roof texture
    drawRoofTexture(doc, bX, wallTop, bWidthPx, ridgeTop, centerX, "gable");
  }

  // ── Chimney (gable/hip only) ──
  if (building.roofType !== "flat") {
    const chimX = centerX + bWidthPx * 0.18;
    const chimW = 2.5;
    const chimH = 4;
    // Calculate roof line height at chimney position
    const t = Math.abs(chimX - centerX) / (bWidthPx / 2 + 1);
    const roofYAtChim = ridgeTop + t * (wallTop - ridgeTop);
    if (roofYAtChim - chimH > drawYTop + 10) {
      doc.setFillColor(...C.CHIMNEY);
      doc.setDrawColor(...C.WALLS_STROKE);
      doc.setLineWidth(0.4);
      doc.rect(chimX - chimW / 2, roofYAtChim - chimH, chimW, chimH, "FD");
      // Chimney cap
      doc.setFillColor(80, 70, 60);
      doc.rect(chimX - chimW / 2 - 0.5, roofYAtChim - chimH - 0.8, chimW + 1, 0.8, "F");
    }
  }

  // ═══ Dimension Annotations ═══

  // Wall height (left of building)
  const dimLX = bX - 10;
  doc.setDrawColor(...C.DIM_BOX);
  doc.setLineWidth(0.3);
  doc.line(dimLX, groundY, dimLX, wallTop);
  doc.line(dimLX - 1.5, groundY, dimLX + 1.5, groundY);
  doc.line(dimLX - 1.5, wallTop, dimLX + 1.5, wallTop);
  drawDimLabel(doc, dimLX - 2, (groundY + wallTop) / 2, `${building.wallHeight.toFixed(1)} m`, true);

  // Ridge height (right of building)
  const dimRX = bX + bWidthPx + 10;
  doc.line(dimRX, groundY, dimRX, ridgeTop);
  doc.line(dimRX - 1.5, groundY, dimRX + 1.5, groundY);
  doc.line(dimRX - 1.5, ridgeTop, dimRX + 1.5, ridgeTop);
  drawDimLabel(doc, dimRX + 2, (groundY + ridgeTop) / 2, `${building.ridgeHeight.toFixed(1)} m`, false);

  // Eave height label (at wall top on right)
  doc.setTextColor(...C.DIM_BOX);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(4);
  doc.text(`Égout +${building.wallHeight.toFixed(2)}`, dimRX + 2, wallTop + 1);

  // Ridge label
  doc.text(`Faîtage +${building.ridgeHeight.toFixed(2)}`, centerX, ridgeTop - 3, { align: "center" });

  // Building width
  const bwY = groundY + 5;
  doc.setDrawColor(...C.GROUND);
  doc.setLineWidth(0.3);
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

  // ═══ NGF Altitude Labels ═══
  doc.setTextColor(...C.LABEL);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(4);
  doc.text(`+${(ngf + building.wallHeight).toFixed(2)} NGF`, bX - 14, wallTop + 1);
  doc.text(`+${(ngf + building.ridgeHeight).toFixed(2)} NGF`, centerX, ridgeTop - 6, { align: "center" });
  doc.text(`+${ngf.toFixed(2)} NGF`, bX - 14, groundY + 1);

  // Floor level
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(3.5);
  doc.text("Niveau RDC +0.00", bX + bWidthPx + 2, groundY - 1);

  // ═══ Material Annotations with Leader Lines ═══
  const matAnnotX = bX + bWidthPx + 25;
  if (matAnnotX < boxX + boxW - 15) {
    doc.setDrawColor(...C.MAT_LEADER);
    doc.setLineWidth(0.3);

    // Wall material leader
    const wallAnchorY = (wallTop + groundY) / 2;
    doc.line(bX + bWidthPx + 2, wallAnchorY, matAnnotX - 2, wallAnchorY);
    doc.setFillColor(...C.MAT_LEADER);
    doc.circle(bX + bWidthPx + 2, wallAnchorY, 0.6, "F");
    doc.setTextColor(...C.MAT_LEADER);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(4);
    const wallMatText = materials.wallMaterial || building.wallMaterial;
    const wallClrText = materials.wallColor || building.wallColor;
    doc.text(wallMatText, matAnnotX, wallAnchorY - 1);
    if (wallClrText) doc.text(`couleur ${wallClrText}`, matAnnotX, wallAnchorY + 2);

    // Roof material leader
    const roofAnchorY = building.roofType === "flat" ? wallTop - 3 : (wallTop + ridgeTop) / 2;
    doc.line(bX + bWidthPx + 2, roofAnchorY, matAnnotX - 2, roofAnchorY);
    doc.circle(bX + bWidthPx + 2, roofAnchorY, 0.6, "F");
    const roofMatText = materials.roofMaterial || building.roofMaterial;
    const roofClrText = materials.roofColor || building.roofColor;
    doc.text(`Toiture en ${roofMatText.toLowerCase()}`, matAnnotX, roofAnchorY - 1);
    if (roofClrText) doc.text(`couleur ${roofClrText}`, matAnnotX, roofAnchorY + 2);
    if (building.roofPitch > 0 && building.roofType !== "flat") {
      doc.text(`Pente ${building.roofPitch}%`, matAnnotX, roofAnchorY + 5);
    }

    // RAL label if available
    if (materials.roofRAL) {
      doc.text(`RAL ${materials.roofRAL}`, matAnnotX, roofAnchorY + 8);
    }
  }
}

// ─── Grass vegetation ──────────────────────────────────────────────────────

function drawGrassVegetation(doc: jsPDF, startX: number, groundY: number, width: number) {
  doc.setDrawColor(...C.GRASS);
  doc.setLineWidth(0.4);
  const count = Math.floor(width / 5);
  for (let i = 0; i < count; i++) {
    const x = startX + i * (width / count) + Math.random() * 2;
    const h = 1 + Math.random() * 1.2;
    // Main blade
    doc.line(x, groundY, x - 0.3, groundY - h);
    // Secondary blade
    doc.line(x + 0.8, groundY, x + 1.1, groundY - h * 0.7);
  }
}

// ─── Roof texture (diagonal tile lines) ────────────────────────────────────

function drawRoofTexture(
  doc: jsPDF,
  bX: number,
  wallTop: number,
  bWidthPx: number,
  ridgeTop: number,
  centerX: number,
  roofType: "gable" | "hip"
) {
  doc.setDrawColor(130, 120, 110);
  doc.setLineWidth(0.15);
  const roofH = wallTop - ridgeTop;
  const rows = Math.floor(roofH / 2.5);

  for (let r = 1; r < rows; r++) {
    const t = r / rows;
    const y = ridgeTop + t * roofH;

    // Width of roof at this row
    let halfW: number;
    if (roofType === "gable") {
      halfW = (1 - t) * 0 + t * (bWidthPx / 2 + 1);
    } else {
      halfW = t * (bWidthPx / 2 + 1);
    }

    const lx = centerX - halfW;
    const rx = centerX + halfW;
    doc.line(lx, y, rx, y);
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
