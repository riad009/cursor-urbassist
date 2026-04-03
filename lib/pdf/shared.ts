/**
 * Shared PDF drawing utilities for all PC document generators.
 * Professional cartouche, scale bar, north arrow, and page setup
 * matching French government submission standards.
 */

import { jsPDF } from "jspdf";

// ─── Design tokens ─────────────────────────────────────────────────────────

export const COLORS = {
  FOOTER_BG: [26, 26, 46] as [number, number, number],     // #1a1a2e dark navy
  FOOTER_TEXT: [255, 255, 255] as [number, number, number], // white
  HEADER_BG: [31, 41, 55] as [number, number, number],     // #1f2937 dark grey
  WHITE: [255, 255, 255] as [number, number, number],
  BLACK: [0, 0, 0] as [number, number, number],
  MUTED: [107, 114, 128] as [number, number, number],      // #6b7280
  BORDER: [229, 231, 235] as [number, number, number],     // #e5e7eb
  INDIGO: [79, 70, 229] as [number, number, number],       // #4f46e5
  RED_PARCEL: [239, 68, 68] as [number, number, number],   // #ef4444
  SECTION_NUM: [67, 56, 202] as [number, number, number],  // #4338ca
};

// ─── Page dimensions (A3 Landscape) ────────────────────────────────────────

export const A3L = {
  W: 420,
  H: 297,
  M: 10, // margin
  FOOTER_H: 22,
};

// ─── Date formatting ───────────────────────────────────────────────────────

export function formatDateFR(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// ─── Create new A3 landscape PDF ───────────────────────────────────────────

export function createA3Doc(): jsPDF {
  return new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [420, 297],
  });
}

// ─── Draw professional footer cartouche ────────────────────────────────────
/**
 * Draws the dark professional footer at the bottom of each page.
 * Format: "INDICE 0 | DD/MM/YYYY | [docTitle] | PCMI [N]"
 */
export function drawFooter(
  doc: jsPDF,
  opts: {
    docTitle: string;
    pcmiNumber: string;
    address?: string;
    parcelRef?: string;
    authType?: string;
    scale?: string;
    pageNum?: number;
    totalPages?: number;
  }
) {
  const { W, H, M, FOOTER_H } = A3L;
  const y = H - FOOTER_H;

  // Footer background
  doc.setFillColor(...COLORS.FOOTER_BG);
  doc.rect(0, y, W, FOOTER_H, "F");

  // Top line — INDICE | Date | Doc Title | PCMI number
  doc.setTextColor(...COLORS.FOOTER_TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);

  const topLine = `INDICE 0  |  ${formatDateFR()}  |  ${opts.docTitle}  |  ${opts.pcmiNumber}`;
  doc.text(topLine, W / 2, y + 7, { align: "center" });

  // Bottom line — Address | Parcel | Scale | Page
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  const parts: string[] = [];
  if (opts.address) parts.push(opts.address);
  if (opts.parcelRef) parts.push(`Parcelle: ${opts.parcelRef}`);
  if (opts.authType) parts.push(opts.authType === "DP" ? "Déclaration Préalable" : "Permis de Construire");
  if (opts.scale) parts.push(`Échelle: ${opts.scale}`);
  if (opts.pageNum && opts.totalPages) parts.push(`Page ${opts.pageNum}/${opts.totalPages}`);
  doc.text(parts.join("  •  "), W / 2, y + 14, { align: "center" });

  // Thin top border line
  doc.setDrawColor(...COLORS.FOOTER_TEXT);
  doc.setLineWidth(0.3);
  doc.line(M, y, W - M, y);
}

// ─── Draw graphic scale bar ────────────────────────────────────────────────

export function drawScaleBar(
  doc: jsPDF,
  x: number,
  y: number,
  scaleStr: string
) {
  // Parse scale factor
  const match = scaleStr.match(/1\s*:\s*(\d+)/);
  const scaleFactor = match ? parseInt(match[1]) : 100;

  // At given scale, 1mm on paper = scaleFactor mm in reality
  // We draw a 60mm bar showing real-world measurements
  const barTotalMM = 60;
  const realMeters = (barTotalMM / 1000) * scaleFactor;

  // Round to nice number
  const niceMeters = getNiceRound(realMeters);
  const niceMM = (niceMeters * 1000) / scaleFactor;

  doc.setDrawColor(60, 60, 60);
  doc.setFillColor(60, 60, 60);

  // Main bar
  const segments = 5;
  const segW = niceMM / segments;
  for (let i = 0; i < segments; i++) {
    if (i % 2 === 0) {
      doc.rect(x + i * segW, y, segW, 2, "F");
    } else {
      doc.setFillColor(200, 200, 200);
      doc.rect(x + i * segW, y, segW, 2, "F");
      doc.setFillColor(60, 60, 60);
    }
  }

  // Ticks and labels
  doc.setFontSize(5);
  doc.setTextColor(60, 60, 60);
  doc.text("0", x, y + 6, { align: "center" });
  doc.text(`${niceMeters}m`, x + niceMM, y + 6, { align: "center" });

  // Scale text
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text(`ÉCHELLE ${scaleStr}`, x + niceMM + 8, y + 2);
  doc.setFont("helvetica", "normal");
}

function getNiceRound(value: number): number {
  const candidates = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  for (const c of candidates) {
    if (c >= value * 0.6) return c;
  }
  return Math.ceil(value / 100) * 100;
}

// ─── Draw north arrow ──────────────────────────────────────────────────────

export function drawNorthArrow(doc: jsPDF, cx: number, cy: number) {
  // North filled triangle
  doc.setFillColor(31, 41, 55);
  doc.triangle(cx, cy - 8, cx - 3.5, cy + 2, cx + 3.5, cy + 2, "F");

  // South empty triangle
  doc.setFillColor(180, 180, 180);
  doc.triangle(cx, cy + 10, cx - 3.5, cy + 2, cx + 3.5, cy + 2, "F");

  // "N" letter
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(31, 41, 55);
  doc.text("N", cx, cy - 11, { align: "center" });
}

// ─── Draw page header bar ──────────────────────────────────────────────────

export function drawPageHeader(
  doc: jsPDF,
  title: string,
  subtitle: string,
  rightText?: string,
  bgColor?: [number, number, number]
) {
  const { W, M } = A3L;
  const headerH = 16;
  const color = bgColor || COLORS.HEADER_BG;

  doc.setFillColor(...color);
  doc.rect(M, M, W - M * 2, headerH, "F");

  doc.setTextColor(...COLORS.WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(title, M + 6, M + 7);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(subtitle, M + 6, M + 13);

  if (rightText) {
    doc.setFontSize(7);
    doc.text(rightText, W - M - 6, M + 10, { align: "right" });
  }

  return M + headerH + 4; // return Y position after header
}

// ─── Draw info box ─────────────────────────────────────────────────────────

export function drawInfoBox(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string
) {
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(...COLORS.BORDER);
  doc.roundedRect(x, y, w, h, 2, 2, "FD");

  doc.setTextColor(...COLORS.MUTED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5);
  doc.text(label.toUpperCase(), x + 3, y + 5);

  doc.setTextColor(30, 41, 59); // slate-800
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(value || "—", x + 3, y + 11, { maxWidth: w - 6 });
}

// ─── Draw image with border ────────────────────────────────────────────────

export function drawImageWithBorder(
  doc: jsPDF,
  imageData: string,
  x: number,
  y: number,
  w: number,
  h: number,
  format: "JPEG" | "PNG" = "JPEG"
) {
  // Light border
  doc.setDrawColor(...COLORS.BORDER);
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, h, "S");

  // Image
  try {
    doc.addImage(imageData, format, x + 0.5, y + 0.5, w - 1, h - 1);
  } catch (err) {
    // If image fails, draw a placeholder
    doc.setFillColor(248, 250, 252);
    doc.rect(x + 0.5, y + 0.5, w - 1, h - 1, "F");
    doc.setTextColor(...COLORS.MUTED);
    doc.setFontSize(8);
    doc.text("Image non disponible", x + w / 2, y + h / 2, { align: "center" });
    console.error("[PDF] Image embedding failed:", err);
  }
}

// ─── Sanitize filename ─────────────────────────────────────────────────────

export function sanitizeFilename(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9àâäéèêëïîôùûüçÀÂÄÉÈÊËÏÎÔÙÛÜÇ_\- ]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}
