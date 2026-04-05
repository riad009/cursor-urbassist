/**
 * PC3 — Plan en Coupe du Terrain et de la Construction
 *        COUPE GÉNÉRALE AA
 *
 * Professional French building permit cross-section drawing.
 * Single A3 landscape page with two stacked panels:
 *
 *   TOP:    "COUPE GÉNÉRALE AA - Existant"    — existing building(s)
 *   BOTTOM: "COUPE GÉNÉRALE AA - Projeté"     — existing + new construction
 *
 * KEY DESIGN RULES (matching official reference):
 *   1. Building fills ~55% of horizontal space between boundaries
 *   2. Underground hatch is a THIN strip (≤15% of panel)
 *   3. Red dashed "Limite de propriété" stays WITHIN each panel
 *   4. All text must be readable (≥5pt in jsPDF units)
 *   5. Dimension boxes sit ON dimension lines (white boxes for horizontal,
 *      blue pills for vertical)
 *   6. Both panels show the main house. Projeté may show additional structure.
 */

import { jsPDF } from "jspdf";
import { DossierProjectData, GeneratorResult, JobEntry } from "./types";
import { A3L, drawFooter } from "./shared";
import { getBuildingData, getParcelDimensions, getNGFValue } from "./svg-helpers";
import { extractProjectData } from "./extract-project-data";

/* ═══════════════════════════════════════════════════════════════════════════
   PUBLIC
   ═══════════════════════════════════════════════════════════════════════════ */

export async function generatePC3(
  doc: jsPDF,
  project: DossierProjectData,
  _capturedImages?: Record<string, string | undefined>,
): Promise<GeneratorResult> {
  const extracted = extractProjectData(project);
  const building = extracted.building;
  const parcel   = extracted.parcel;
  const ngf      = extracted.ngfAltitude;
  const jobs     = extracted.jobs;
  const terrain  = extracted.terrain;

  const { W, M, H, FOOTER_H } = A3L;
  const cW = W - M * 2; // 400 mm

  // ── header strip ───────────────────────────────────────────────────────
  const hdrH = 10;
  doc.setFillColor(31, 41, 55);
  doc.rect(M, M, cW, hdrH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("PC3 — PLAN EN COUPE DU TERRAIN ET DE LA CONSTRUCTION", M + 4, M + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Échelle : 1 : 100", W - M - 4, M + 7, { align: "right" });

  // ── layout constants ───────────────────────────────────────────────────
  const topY   = M + hdrH + 2;
  const footY  = H - FOOTER_H;
  const availH = footY - topY - 2;
  const gap    = 4;
  const panelH = (availH - gap) / 2;

  // ── scale ruler ────────────────────────────────────────────────────────
  drawScaleRuler(doc, W - M - 82, topY);

  // ── PANEL 1: Existant (always show main building) ─────────────────────
  drawCrossPanel(doc, M, topY, cW, panelH,
    "COUPE GÉNÉRALE AA - Existant", parcel, building, ngf, false, jobs, terrain);

  // ── PANEL 2: Projeté (main building + any additions) ──────────────────
  drawCrossPanel(doc, M, topY + panelH + gap, cW, panelH,
    "COUPE GÉNÉRALE AA - Projeté", parcel, building, ngf, true, jobs, terrain);

  // ── footer ─────────────────────────────────────────────────────────────
  drawFooter(doc, {
    docTitle: "COUPE GÉNÉRALE AA",
    pcmiNumber: "PCMI 3",
    address: project.address || undefined,
    parcelRef: project.parcelIds || undefined,
    authType: project.authorizationType || undefined,
    scale: "1 : 100",
  });

  return { pageCount: 1, label: "Plan en Coupe", code: "PC3" };
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCALE RULER (top-right box)
   ═══════════════════════════════════════════════════════════════════════════ */

function drawScaleRuler(doc: jsPDF, x: number, y: number) {
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.rect(x, y, 78, 20, "FD");

  // Bar segments (0–10m at 1:100 = 100mm → but squeezed into ruler)
  const barX = x + 3, barY = y + 8, segW = 3.5;
  doc.setLineWidth(0.25);
  for (let i = 0; i < 10; i++) {
    doc.setFillColor(i % 2 === 0 ? 0 : 255, i % 2 === 0 ? 0 : 255, i % 2 === 0 ? 0 : 255);
    doc.rect(barX + i * segW, barY, segW, 1.8, "FD");
  }
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(3.8);
  doc.text("0", barX, barY + 4.5, { align: "center" });
  for (let n = 2; n <= 10; n += 2)
    doc.text(`${n}`, barX + n * segW, barY + 4.5, { align: "center" });
  doc.text("m", barX + 10 * segW + 3, barY + 4.5);

  // Scale label
  doc.setFont("helvetica", "bold");
  doc.setFontSize(4.5);
  doc.text("ECHELLE", x + 52, y + 5);
  doc.setFontSize(13);
  doc.text("1/100", x + 52, y + 13);
  doc.setFontSize(4);
  doc.setFont("helvetica", "normal");
  doc.text("ème", x + 72, y + 13);
}

/* ═══════════════════════════════════════════════════════════════════════════
   SINGLE CROSS-SECTION PANEL
   ═══════════════════════════════════════════════════════════════════════════ */

interface ParcelDims { widthM: number; depthM: number }
interface BuildingDims {
  width: number; depth: number; wallHeight: number; ridgeHeight: number;
  roofType: string; roofPitch: number; roofMaterial: string; roofColor: string;
  wallMaterial: string; wallColor: string;
}

function drawCrossPanel(
  doc: jsPDF,
  bx: number,                           // panel left X
  by: number,                           // panel top Y
  bw: number,                           // panel width (~400 mm)
  bh: number,                           // panel height (~128 mm)
  label: string,
  parcel: ParcelDims,
  building: BuildingDims,
  ngf: number,
  isProjected: boolean,
  jobs: JobEntry[],
  terrain: { slopeDeg: number; hasRealData: boolean },
) {
  /* ┌─────────────────────────────────────────────────────────────────┐
   * │  0 –  8% : dimension lines above building                     │
   * │  8 – 75% : main drawing area (building + sky)                 │
   * │ 75 – 77% : ground line + grass                                │
   * │ 77 – 87% : underground hatch (thin)                           │
   * │ 87 –100% : section label                                      │
   * └─────────────────────────────────────────────────────────────────┘ */

  const groundY  = by + bh * 0.76;
  const hatchBot = by + bh * 0.87;
  const labelY   = by + bh * 0.93;

  // Property boundary X positions (8% inset so red lines don't clip edge)
  const leftBx  = bx + bw * 0.08;
  const rightBx = bx + bw * 0.92;
  const plotPx  = rightBx - leftBx;     // ~336 mm

  // ── thin panel border ──
  doc.setDrawColor(190, 195, 200);
  doc.setLineWidth(0.2);
  doc.rect(bx, by, bw, bh * 0.87, "S");

  // ── underground hatch strip ──
  drawHatchStrip(doc, bx, groundY, bw, hatchBot - groundY);

  // ── ground line (thick) ──
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(1.6);
  doc.line(bx, groundY, bx + bw, groundY);

  // ── green grass tufts ──
  doc.setDrawColor(100, 170, 60);
  doc.setLineWidth(0.5);
  for (let gx = bx + 2; gx < bx + bw - 2; gx += 2.5) {
    doc.line(gx, groundY, gx - 0.7, groundY - 1.2);
    doc.line(gx + 1.0, groundY, gx + 0.4, groundY - 1.0);
  }

  // ── terrain slope annotation (from real elevation data when available) ──
  doc.setFont("helvetica", "italic");
  doc.setFontSize(5);
  doc.setTextColor(100, 116, 139);
  if (terrain.hasRealData && terrain.slopeDeg > 0.5) {
    doc.text(`Pente TN ≈ ${terrain.slopeDeg.toFixed(1)}°`, bx + bw * 0.5, groundY + 3, { align: "center" });
  } else if (!terrain.hasRealData) {
    doc.text("(Profil terrain estimé — valider sur site)", bx + bw * 0.5, groundY + 3, { align: "center" });
  }

  // ── red dashed property boundaries (CLIPPED to this panel only) ──
  const bndTop = by + 3;
  const bndBot = hatchBot - 1;
  drawRedBoundary(doc, leftBx, bndTop, bndBot);
  drawRedBoundary(doc, rightBx, bndTop, bndBot);

  // ── "Limite de propriété" labels (rotated, inside panel) ──
  doc.setTextColor(220, 0, 0);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(6);
  const midY = (bndTop + groundY) / 2;
  // Left label — positioned just right of the boundary
  doc.text("Limite de propriété", leftBx + 4, midY, { angle: 90 });
  // Right label — positioned just left of the boundary
  doc.text("Limite de propriété", rightBx - 2, midY, { angle: 90 });

  // ── TN markers ──
  drawTNMarker(doc, leftBx, groundY, ngf, true);
  drawTNMarker(doc, rightBx, groundY, ngf, false);

  // ══════════════════════════════════════════════════════════════════════
  // BUILDING (always drawn — both Existant and Projeté show main house)
  // ══════════════════════════════════════════════════════════════════════

  /* FIGURE-CENTRIC SCALING:
   * The building should visually dominate the drawing.
   * We target the building filling ~55% of horizontal space
   * between boundaries, then derive all px dimensions from that.
   */
  const targetPx = plotPx * 0.50;
  const pxPerM   = targetPx / building.width;

  // Clamp pxPerM so building doesn't overflow vertically
  const maxWallPx = (groundY - by - 16) * 0.55;
  const clampedPxM = Math.min(pxPerM, maxWallPx / building.wallHeight);

  const bWidthPx = building.width * clampedPxM;
  const wallHPx  = building.wallHeight * clampedPxM;
  const ridgeHPx = building.ridgeHeight * clampedPxM;

  // Center building between boundaries
  const centerX = (leftBx + rightBx) / 2;
  const bLeft   = centerX - bWidthPx / 2;
  const bRight  = centerX + bWidthPx / 2;
  const wallTop = groundY - wallHPx;
  const ridgeTop = groundY - ridgeHPx;

  // ── Walls ──
  doc.setFillColor(240, 228, 196);       // warm beige (#F0E4C4)
  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.6);
  doc.rect(bLeft, wallTop, bWidthPx, wallHPx, "FD");

  // ── Windows ──
  const winW = Math.max(bWidthPx * 0.06, 3);
  const winH = Math.max(wallHPx * 0.45, 5);
  const numWin = Math.min(Math.max(Math.floor(bWidthPx / (winW * 4)), 2), 6);
  const winGap = bWidthPx / (numWin + 1);
  const winTopY = wallTop + (wallHPx - winH) * 0.28;

  doc.setFillColor(180, 215, 240);
  doc.setDrawColor(50, 55, 80);
  doc.setLineWidth(0.3);
  for (let w = 1; w <= numWin; w++) {
    const wx = bLeft + w * winGap - winW / 2;
    // Skip the window right where the door is
    if (Math.abs(wx + winW / 2 - centerX) < winW * 1.5) continue;
    doc.rect(wx, winTopY, winW, winH, "FD");
    // Mullion cross
    doc.line(wx + winW / 2, winTopY, wx + winW / 2, winTopY + winH);
    doc.line(wx, winTopY + winH * 0.45, wx + winW, winTopY + winH * 0.45);
  }

  // ── Door ──
  const doorW = Math.max(bWidthPx * 0.04, 2.5);
  const doorH = Math.max(wallHPx * 0.55, 6);
  doc.setFillColor(105, 65, 35);
  doc.setDrawColor(60, 40, 20);
  doc.setLineWidth(0.35);
  doc.rect(centerX - doorW / 2, groundY - doorH, doorW, doorH, "FD");
  // Door handle
  doc.setFillColor(200, 180, 120);
  doc.circle(centerX + doorW * 0.2, groundY - doorH * 0.45, 0.4, "F");

  // ── Roof ──
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.7);
  if (building.roofType === "flat") {
    doc.setFillColor(115, 115, 115);
    doc.rect(bLeft - 1.5, wallTop - 2.5, bWidthPx + 3, 2.5, "FD");
  } else if (building.roofType === "hip") {
    doc.setFillColor(115, 115, 115);
    const inset = bWidthPx * 0.18;
    const pts = [
      bLeft - 2, wallTop,
      bLeft + inset, ridgeTop,
      bRight - inset, ridgeTop,
      bRight + 2, wallTop,
    ];
    drawPoly(doc, pts, "FD");
  } else {
    // Gable (default French residential)
    doc.setFillColor(115, 115, 115);
    doc.triangle(bLeft - 2, wallTop, centerX, ridgeTop, bRight + 2, wallTop, "FD");
  }

  // ── Roof vent / chimney detail ──
  if (building.roofType !== "flat") {
    const ventX = centerX + bWidthPx * 0.14;
    const ventBaseY = wallTop - (ridgeHPx - wallHPx) * 0.35;
    doc.setFillColor(100, 100, 100);
    doc.triangle(ventX - 1.2, ventBaseY, ventX, ventBaseY - 2.5, ventX + 1.2, ventBaseY, "FD");
  }

  // ══════════════════════════════════════════════════════════════════════
  // DIMENSIONS
  // ══════════════════════════════════════════════════════════════════════

  // Calculate setbacks in meters
  const leftSetbackM  = Math.max(0, (bLeft - leftBx) / clampedPxM);
  const rightSetbackM = Math.max(0, (rightBx - bRight) / clampedPxM);

  // ── 1. Overall plot width (top line) ──
  const dimY1 = by + 5;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.line(leftBx, dimY1, rightBx, dimY1);
  tick(doc, leftBx, dimY1);
  tick(doc, rightBx, dimY1);
  hDimBox(doc, (leftBx + rightBx) / 2, dimY1, parcel.widthM.toFixed(2));

  // ── 2. Segment dimensions (second line) ──
  const dimY2 = by + 11;

  // Left setback
  if (leftSetbackM > 0.1) {
    doc.line(leftBx, dimY2, bLeft, dimY2);
    tick(doc, leftBx, dimY2); tick(doc, bLeft, dimY2);
    hDimBox(doc, (leftBx + bLeft) / 2, dimY2, leftSetbackM.toFixed(2));
  }

  // Building width
  doc.line(bLeft, dimY2, bRight, dimY2);
  tick(doc, bLeft, dimY2); tick(doc, bRight, dimY2);
  hDimBox(doc, centerX, dimY2, building.width.toFixed(2));

  // Right setback
  if (rightSetbackM > 0.1) {
    doc.line(bRight, dimY2, rightBx, dimY2);
    tick(doc, bRight, dimY2); tick(doc, rightBx, dimY2);
    hDimBox(doc, (bRight + rightBx) / 2, dimY2, rightSetbackM.toFixed(2));
  }

  // ── 3. Vertical: wall height (blue box, left of building) ──
  const vDimX = bLeft - 6;
  doc.setDrawColor(30, 100, 200);
  doc.setLineWidth(0.3);
  doc.line(vDimX, groundY, vDimX, wallTop);
  doc.line(vDimX - 1.5, groundY, vDimX + 1.5, groundY);
  doc.line(vDimX - 1.5, wallTop, vDimX + 1.5, wallTop);
  vDimBox(doc, vDimX, (groundY + wallTop) / 2, building.wallHeight.toFixed(2));

  // ── 4. NGF / altitude annotations ──
  doc.setTextColor(60, 60, 60);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(4.5);

  if (isProjected) {
    // Eave
    const eaveNGF = ngf + building.wallHeight;
    doc.text(`Égout +${building.wallHeight.toFixed(2)}`, bLeft - 18, wallTop - 1);
    doc.text(`+${eaveNGF.toFixed(2)} NGF`, bLeft - 18, wallTop + 2.5);

    // Floor level
    doc.text("Niveau RDC", centerX + bWidthPx * 0.2, groundY - 2);
    doc.text(`+0.00 / +${ngf.toFixed(2)} NGF`, centerX + bWidthPx * 0.2, groundY + 1.5);
  }

  // Ridge annotation
  const ridgeNGF = ngf + building.ridgeHeight;
  doc.text(`Faîtage +${building.ridgeHeight.toFixed(2)}`, centerX - 8, ridgeTop - 3.5);
  doc.text(`+${ridgeNGF.toFixed(2)} NGF`, centerX - 8, ridgeTop - 0.5);

  // Roof pitch
  if (building.roofType !== "flat" && building.roofPitch) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(4);
    doc.text(`Pente ${building.roofPitch}°`, bLeft + bWidthPx * 0.2, (wallTop + ridgeTop) / 2 + 2);
  }

  // ── section label (below hatch) ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(0, 0, 0);
  doc.text(label, bx + bw / 2, labelY + 3, { align: "center" });
  const tw = doc.getTextWidth(label);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(bx + bw / 2 - tw / 2, labelY + 4.5, bx + bw / 2 + tw / 2, labelY + 4.5);
}

/* ═══════════════════════════════════════════════════════════════════════════
   DRAWING PRIMITIVES
   ═══════════════════════════════════════════════════════════════════════════ */

/** Diagonal hatch strip */
function drawHatchStrip(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(130, 130, 130);
  doc.setLineWidth(0.15);
  const step = 2;
  for (let i = 0; i < (w + h * 2) / step; i++) {
    const sx = x + i * step;
    const ex = sx - h;
    const clampSx = Math.max(x, Math.min(x + w, sx));
    const clampEx = Math.max(x, Math.min(x + w, ex));
    if (clampSx !== clampEx || (sx >= x && sx <= x + w))
      doc.line(clampSx, y, clampEx, y + h);
  }
}

/** Red dashed boundary line, confined vertically */
function drawRedBoundary(doc: jsPDF, px: number, top: number, bot: number) {
  doc.setDrawColor(220, 0, 0);
  doc.setLineWidth(0.9);
  let cy = top;
  while (cy < bot) {
    const end = Math.min(cy + 4, bot);
    doc.line(px, cy, px, end);
    cy += 6.5;
  }
}

/** TN marker square at ground/boundary intersection */
function drawTNMarker(doc: jsPDF, px: number, groundY: number, ngf: number, isLeft: boolean) {
  doc.setFillColor(249, 115, 22);
  doc.rect(px - 1, groundY - 1, 2, 2, "F");
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(4.2);
  const tx = isLeft ? px - 14 : px + 3;
  doc.text("TN -0.00", tx, groundY + 4);
  doc.text(`+${ngf.toFixed(2)} NGF`, tx, groundY + 7);
}

/** Horizontal tick at dimension line */
function tick(doc: jsPDF, x: number, y: number) {
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.line(x, y - 1.5, x, y + 1.5);
}

/** White box with dimension label on horizontal line */
function hDimBox(doc: jsPDF, cx: number, cy: number, label: string) {
  const tw = label.length * 1.6 + 3.5;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.15);
  doc.rect(cx - tw / 2, cy - 2.5, tw, 5, "FD");
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(4.5);
  doc.text(label, cx, cy + 1, { align: "center" });
}

/** Blue pill (vertical dimension) */
function vDimBox(doc: jsPDF, cx: number, cy: number, label: string) {
  const tw = label.length * 1.7 + 3;
  doc.setFillColor(30, 100, 200);
  doc.roundedRect(cx - tw / 2 - 0.5, cy - 2.5, tw + 1, 5, 0.7, 0.7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(4.5);
  doc.text(label, cx, cy + 1, { align: "center" });
}

/** Draw polygon from flat [x1,y1,x2,y2,...] array */
function drawPoly(doc: jsPDF, pts: number[], style: "F" | "FD" | "S") {
  if (pts.length < 6) return;
  const path: { op: string; c: number[] }[] = [];
  path.push({ op: "m", c: [pts[0], pts[1]] });
  for (let i = 2; i < pts.length; i += 2)
    path.push({ op: "l", c: [pts[i], pts[i + 1]] });
  path.push({ op: "h", c: [] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).path(path, style);
}
