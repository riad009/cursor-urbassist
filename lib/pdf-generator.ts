/**
 * Professional PDF Generator - Permis de Construire / DP style
 * Matches reference design: blue/teal project boxes, dark grey headers/footers,
 * tables with blue headers, image grids with caption bars, compass, scale bar.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// Design tokens from reference
export const PDF_DESIGN = {
  blue: "#0e7490", // Teal/cyan for project details
  blueLight: "#e0f2fe",
  darkGrey: "#374151",
  darkGreyHeader: "#1f2937",
  white: "#ffffff",
  textDark: "#1f2937",
  textMuted: "#6b7280",
  border: "#e5e7eb",
  red: "#dc2626",
  green: "#059669",
} as const;

export interface PDFProjectInfo {
  projectName: string;
  clientName?: string;
  address?: string;
  municipality?: string;
  parcelRef?: string;
  totalSurface?: string;
  architect?: string;
  date: string;
  contactPhone?: string;
  contactEmail?: string;
  contactWebsite?: string;
}

export interface PDFExportOptions {
  paperSize?: "A3" | "A4" | "A2";
  scale?: string;
  documentType: string;
  pcmNumber?: string; // e.g. "PCMI 1", "PCML 1"
}

const PAPER_SIZES_MM = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
  A2: { w: 420, h: 594 },
};

/** Draw professional footer on page */
function drawFooter(
  doc: jsPDF,
  pageWidth: number,
  pageHeight: number,
  leftText: string,
  rightTitle: string,
  rightRef: string
) {
  const footerH = 18;
  const y = pageHeight - footerH;

  doc.setFillColor(31, 41, 55); // dark grey
  doc.rect(0, y, pageWidth, footerH, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(leftText, 15, y + 12);
  doc.setFont("helvetica", "bold");
  doc.text(rightTitle, pageWidth / 2 - doc.getTextWidth(rightTitle) / 2, y + 12);
  doc.setFont("helvetica", "normal");
  doc.text(rightRef, pageWidth - 25, y + 12, { align: "right" });
}

/** Draw scale bar */
function drawScaleBar(doc: jsPDF, x: number, y: number, scale: string) {
  const barW = 80;
  const barH = 4;
  doc.setFillColor(80, 80, 80);
  doc.rect(x, y, barW, barH, "F");
  doc.setDrawColor(80, 80, 80);
  for (let i = 0; i <= 10; i += 2) {
    doc.setLineWidth(0.5);
    doc.line(x + (barW * i) / 10, y, x + (barW * i) / 10, y + barH + 3);
  }
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(8);
  doc.text("0", x, y + barH + 8);
  doc.text("10 m", x + barW - 12, y + barH + 8);
  doc.text(`ÉCHELLE ${scale}`, x + barW + 8, y + barH / 2 + 4);
}

/** Draw compass rose */
function drawCompass(doc: jsPDF, cx: number, cy: number, r: number = 12) {
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.circle(cx, cy, r, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("N", cx, cy - r - 2, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("O", cx - r - 2, cy, { align: "right" });
  doc.text("E", cx + r + 2, cy, { align: "left" });
  doc.text("S", cx, cy + r + 6, { align: "center" });
  // North arrow
  doc.setFillColor(0, 0, 0);
  const tip = cy - r + 2;
  doc.triangle(cx, tip - 8, cx - 4, tip + 4, cx + 4, tip + 4, "F");
}

/** Create cover page (PERMIS DE CONSTRUIRE style) - draws on current page */
export function createCoverPage(
  doc: jsPDF,
  project: PDFProjectInfo,
  options: PDFExportOptions,
  mainImageBase64?: string
) {
  const { w, h } = PAPER_SIZES_MM[options.paperSize || "A3"];

  const margin = 15;
  const contentW = w - margin * 2;

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(31, 41, 55);
  doc.text("PERMIS DE CONSTRUIRE", margin, 25);
  doc.setFontSize(14);
  doc.text(project.projectName.toUpperCase(), margin, 35);

  // Blue divider line
  doc.setDrawColor(14, 116, 144);
  doc.setLineWidth(1);
  doc.line(margin, 42, margin + 150, 42);

  // Blue project details box (rounded corners simulated)
  const boxY = 50;
  const boxW = contentW * 0.45;
  const boxH = 85;
  doc.setFillColor(14, 116, 144);
  doc.roundedRect(margin, boxY, boxW, boxH, 3, 3, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Détails du projet :", margin + 8, boxY + 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  let ty = boxY + 22;
  if (project.clientName) {
    doc.text(`Maître d'ouvrage:`, margin + 8, ty);
    doc.text(project.address || "-", margin + 8, ty + 6);
    doc.text(project.municipality || "", margin + 8, ty + 12);
    ty += 22;
  }
  doc.text(`Adresse du projet: ${project.address || "-"}`, margin + 8, ty);
  ty += 8;
  doc.text(`Référence cadastrale: ${project.parcelRef || "-"}`, margin + 8, ty);
  ty += 8;
  doc.text(`Surface totale: ${project.totalSurface || "-"}`, margin + 8, ty);

  // Dark grey table of contents box
  const tocY = boxY + boxH - 15;
  const tocW = contentW * 0.42;
  const tocH = 100;
  doc.setFillColor(31, 41, 55);
  doc.roundedRect(margin, tocY, tocW, tocH, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Sommaire :", margin + 8, tocY + 12);
  doc.setFont("helvetica", "normal");
  const tocItems = [
    "Plan de situation",
    "Plans de masse",
    "Coupes",
    "Façades",
    "Notice descriptive",
    "Documents graphiques",
    "Reportage photos",
  ];
  tocItems.forEach((item, i) => {
    doc.text(`PCMI ${String(i + 1).padStart(2, "0")} - ${item}`, margin + 8, tocY + 24 + i * 10);
  });

  // Main image (right side)
  if (mainImageBase64) {
    try {
      const imgW = contentW * 0.5;
      const imgH = 140;
      const imgX = w - margin - imgW;
      const imgY = 55;
      doc.addImage(mainImageBase64, "JPEG", imgX, imgY, imgW, imgH);
    } catch {
      // Placeholder if image fails
      doc.setFillColor(229, 231, 235);
      doc.rect(w - margin - 150, 55, 150, 120, "F");
      doc.setTextColor(107, 114, 128);
      doc.setFontSize(10);
      doc.text("Image du projet", w - margin - 75, 115, { align: "center" });
    }
  } else {
    doc.setFillColor(229, 231, 235);
    doc.roundedRect(w - margin - 160, 55, 150, 120, 4, 4, "F");
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(10);
    doc.text("Image du projet", w - margin - 75, 115, { align: "center" });
  }

  // Contact block
  const contactY = 200;
  doc.setTextColor(31, 41, 55);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("BESOIN D'INFORMATIONS SUR LES PLANS?", margin, contactY);
  doc.setFontSize(14);
  doc.text(project.contactPhone || "06 00 00 00 00", margin, contactY + 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `${project.contactWebsite || "www.urbassist.fr"} | ${project.contactEmail || "contact@urbassist.fr"}`,
    margin,
    contactY + 20
  );

  // Modification log table
  autoTable(doc, {
    startY: contactY + 35,
    head: [["Indice", "Date", "Objet de la modification"]],
    body: [["0", project.date, "Première diffusion"]],
    headStyles: {
      fillColor: [55, 65, 81],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
    },
    bodyStyles: { fontSize: 9, textColor: [31, 41, 55] },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    margin: { left: margin },
    tableWidth: contentW * 0.5,
  });

  // Footer
  const dateStr = new Date(project.date).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  drawFooter(
    doc,
    w,
    h,
    `INDICE 0 - ${dateStr}`,
    options.documentType,
    options.pcmNumber || "PCMI 1"
  );
}

/** Create plan de situation page with map panels */
export function createPlanSituationPage(
  doc: jsPDF,
  project: PDFProjectInfo,
  options: PDFExportOptions,
  mapImageBase64?: string
) {
  const { w, h } = PAPER_SIZES_MM[options.paperSize || "A3"];
  doc.addPage([w, h], "portrait");

  const margin = 15;
  const headerH = 25;
  const panelHeaderBg: [number, number, number] = [55, 65, 81];

  // Compass at top center
  drawCompass(doc, w / 2, margin + 15, 14);

  // Map panel
  const panelY = 45;
  doc.setFillColor(panelHeaderBg[0], panelHeaderBg[1], panelHeaderBg[2]);
  doc.rect(0, panelY - headerH, w, headerH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("PLAN DE SITUATION - PLAN IGN 1/5000ème", w / 2, panelY - 8, { align: "center" });

  const mapH = h - panelY - 50;
  if (mapImageBase64) {
    try {
      doc.addImage(mapImageBase64, "PNG", margin, panelY, w - margin * 2, mapH);
    } catch {
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, panelY, w - margin * 2, mapH, "F");
      doc.setTextColor(156, 163, 175);
      doc.setFontSize(12);
      doc.text("Carte de situation", w / 2, panelY + mapH / 2 - 4, { align: "center" });
    }
  } else {
    doc.setFillColor(245, 245, 245);
    doc.rect(margin, panelY, w - margin * 2, mapH, "F");
    doc.setTextColor(156, 163, 175);
    doc.setFontSize(12);
    doc.text("Carte de situation", w / 2, panelY + mapH / 2 - 4, { align: "center" });
  }

  const dateStr = new Date(project.date).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  drawFooter(
    doc,
    w,
    h,
    `INDICE 0 - ${dateStr}`,
    "PLAN DE SITUATION",
    options.pcmNumber || "PCML 1"
  );
}

/** Create surface summary table (RÉCAPITULATIF DES SURFACES) */
export function createSurfaceTablePage(
  doc: jsPDF,
  project: PDFProjectInfo,
  options: PDFExportOptions,
  surfaceData: Array<{ description: string; surface: string }>,
  title: string
) {
  const { w, h } = PAPER_SIZES_MM[options.paperSize || "A3"];
  doc.addPage([w, h], "landscape");

  const margin = 15;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(31, 41, 55);
  doc.text(title, w / 2, 25, { align: "center" });
  doc.setFontSize(10);
  doc.text(options.pcmNumber || "PCMI 2", w - margin - 20, 25, { align: "right" });

  autoTable(doc, {
    startY: 40,
    head: [["DESCRIPTION", "SURFACES"]],
    body: surfaceData.map((r) => [r.description, r.surface]),
    headStyles: {
      fillColor: [14, 116, 144],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 10,
    },
    bodyStyles: { fontSize: 9, textColor: [31, 41, 55] },
    alternateRowStyles: { fillColor: [224, 242, 254] },
    margin: { left: margin, right: margin },
    tableWidth: w - margin * 2,
  });

  const tblEnd = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? 150;

  // Compass and scale bar
  drawCompass(doc, w / 2 - 60, tblEnd + 35, 12);
  drawScaleBar(doc, w / 2 + 20, tblEnd + 30, options.scale || "1/100");

  const dateStr = new Date(project.date).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  drawFooter(
    doc,
    w,
    h,
    `INDICE 0 - ${dateStr}`,
    title,
    options.pcmNumber || "PCMI 2"
  );
}

/** Create notice descriptive page (two-column with tables and image) */
export function createNoticeDescriptivePage(
  doc: jsPDF,
  project: PDFProjectInfo,
  options: PDFExportOptions,
  textContent: string,
  surfaceExistant: Array<{ description: string; surface: string }>,
  surfaceProjet: Array<{ description: string; surface: string }>,
  imageBase64?: string
) {
  const { w, h } = PAPER_SIZES_MM[options.paperSize || "A3"];
  doc.addPage([w, h], "portrait");

  const margin = 15;
  const colW = (w - margin * 3) / 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(31, 41, 55);
  doc.text("NOTICE DESCRIPTIVE", margin, 25);

  // Left column - text
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const split = doc.splitTextToSize(textContent || "Contenu de la notice descriptive.", colW - 5);
  doc.text(split, margin, 40, { maxWidth: colW - 5 });

  // Right column - tables
  const tableStartY = 40;
  const rightColX = margin + colW + margin;
  autoTable(doc, {
    startY: tableStartY,
    margin: { left: rightColX },
    head: [["DESCRIPTION", "SURFACES"]],
    body: surfaceExistant.map((r) => [r.description, r.surface]),
    headStyles: {
      fillColor: [14, 116, 144],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    bodyStyles: { fontSize: 8, textColor: [31, 41, 55] },
    tableWidth: colW,
  });

  const tbl1End = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? 80;

  autoTable(doc, {
    startY: tbl1End + 10,
    margin: { left: rightColX },
    head: [["DESCRIPTION", "SURFACES"]],
    body: surfaceProjet.map((r) => [r.description, r.surface]),
    headStyles: {
      fillColor: [14, 116, 144],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    bodyStyles: { fontSize: 8, textColor: [31, 41, 55] },
    tableWidth: colW,
  });

  const tbl2End = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? 130;

  // Image
  const imgY = tbl2End + 15;
  const imgH = 90;
  if (imageBase64) {
    try {
      doc.addImage(imageBase64, "JPEG", margin + colW + margin, imgY, colW, imgH);
    } catch {
      doc.setFillColor(229, 231, 235);
      doc.rect(margin + colW + margin, imgY, colW, imgH, "F");
    }
  } else {
    doc.setFillColor(229, 231, 235);
    doc.rect(margin + colW + margin, imgY, colW, imgH, "F");
    doc.setTextColor(156, 163, 175);
    doc.setFontSize(9);
    doc.text("Vue du projet", margin + colW + margin + colW / 2 - 15, imgY + imgH / 2 - 4, {
      align: "center",
    });
  }

  const dateStr = new Date(project.date).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  drawFooter(
    doc,
    w,
    h,
    `INDICE 0 - ${dateStr}`,
    "NOTICE DESCRIPTIVE PCMI 4",
    options.pcmNumber || "PCMI 4"
  );
}

/** Create image grid page (2x2 with grey caption bars) */
export function createImageGridPage(
  doc: jsPDF,
  project: PDFProjectInfo,
  options: PDFExportOptions,
  images: Array<{ src: string; caption: string }>,
  pageTitle: string
) {
  const { w, h } = PAPER_SIZES_MM[options.paperSize || "A3"];
  doc.addPage([w, h], "portrait");

  const margin = 15;
  const gap = 10;
  const captionH = 12;
  const availableH = h - margin * 2 - 40;
  const cellW = (w - margin * 2 - gap) / 2;
  const cellH = (availableH - gap - captionH * 2) / 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(31, 41, 55);
  doc.text(pageTitle, margin, 25);

  const positions = [
    { x: margin, y: 35 },
    { x: margin + cellW + gap, y: 35 },
    { x: margin, y: 35 + cellH + captionH + gap },
    { x: margin + cellW + gap, y: 35 + cellH + captionH + gap },
  ];

  images.slice(0, 4).forEach((img, i) => {
    const pos = positions[i];
    if (img.src) {
      try {
        doc.addImage(img.src, "JPEG", pos.x, pos.y, cellW, cellH);
      } catch {
        doc.setFillColor(229, 231, 235);
        doc.rect(pos.x, pos.y, cellW, cellH, "F");
      }
    } else {
      doc.setFillColor(229, 231, 235);
      doc.rect(pos.x, pos.y, cellW, cellH, "F");
    }
    doc.setFillColor(107, 114, 128);
    doc.rect(pos.x, pos.y + cellH, cellW, captionH, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(img.caption || `Vue n° ${i + 1}`, pos.x + cellW / 2, pos.y + cellH + captionH / 2 + 2, {
      align: "center",
    });
  });

  const dateStr = new Date(project.date).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  drawFooter(
    doc,
    w,
    h,
    `INDICE 0 - ${dateStr}`,
    pageTitle,
    options.pcmNumber || "PCMI 7 ET 8"
  );
}

/** Main entry: generate full PDF based on document type */
export async function generateStyledPDF(
  project: PDFProjectInfo,
  options: PDFExportOptions,
  content: {
    type: string;
    text?: string;
    surfaceData?: Array<{ description: string; surface: string }>;
    surfaceExistant?: Array<{ description: string; surface: string }>;
    surfaceProjet?: Array<{ description: string; surface: string }>;
    mainImage?: string;
    mapImage?: string;
    images?: Array<{ src: string; caption: string }>;
  }
): Promise<Buffer> {
  const paperSize = options.paperSize || "A3";
  const { w, h } = PAPER_SIZES_MM[paperSize];

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [w, h],
  });

  const defaultSurfaces = [
    { description: "Surface de la parcelle", surface: "1211 m²" },
    { description: "Emprise au sol de la maison d'habitation", surface: "142.37 m²" },
    { description: "Emprise au sol totale", surface: "142.37 m²" },
    { description: "Coefficient d'emprise au sol totale", surface: "11.76%" },
    { description: "Surface de pleine terre végétalisée", surface: "841.57 m²" },
    { description: "Surface semi perméable", surface: "135.60 m²" },
    { description: "Surface de pleine terre totale (SOIT 80.69%)", surface: "977.17 m²" },
    { description: "Surface libre imperméable (SOIT 7.55%)", surface: "91.46 m²" },
    { description: "Total des espaces libres (SOIT 88.24%)", surface: "1068.63 m²" },
    { description: "Places de stationnement extérieures", surface: "2" },
  ];

  const surfaces = content.surfaceData ?? content.surfaceExistant ?? defaultSurfaces;
  const surfacesProjet = content.surfaceProjet ?? defaultSurfaces;

  switch (content.type) {
    case "LOCATION_PLAN":
      createCoverPage(doc, project, { ...options, pcmNumber: "PCMI 1" }, content.mainImage);
      createPlanSituationPage(doc, project, { ...options, pcmNumber: "PCML 1" }, content.mapImage);
      break;

    case "SITE_PLAN":
      createCoverPage(doc, project, { ...options, pcmNumber: "PCMI 1" }, content.mainImage);
      createSurfaceTablePage(
        doc,
        project,
        { ...options, pcmNumber: "PCMI 2" },
        surfaces,
        "PLAN DE MASSE EXISTANT"
      );
      break;

    case "DESCRIPTIVE_STATEMENT":
      createCoverPage(doc, project, { ...options, pcmNumber: "PCMI 1" }, content.mainImage);
      createNoticeDescriptivePage(
        doc,
        project,
        { ...options, pcmNumber: "PCMI 4" },
        content.text ?? "Notice descriptive du projet.",
        surfaces,
        surfacesProjet,
        content.mainImage
      );
      break;

    case "FULL_PACKAGE":
      createCoverPage(doc, project, { ...options, pcmNumber: "PCMI 1" }, content.mainImage);
      createPlanSituationPage(doc, project, { ...options, pcmNumber: "PCML 1" }, content.mapImage);
      createSurfaceTablePage(
        doc,
        project,
        { ...options, pcmNumber: "PCMI 2" },
        surfaces,
        "PLAN DE MASSE EXISTANT"
      );
      createNoticeDescriptivePage(
        doc,
        project,
        { ...options, pcmNumber: "PCMI 4" },
        content.text ?? "Notice descriptive du projet.",
        surfaces,
        surfacesProjet,
        content.mainImage
      );
      if (content.images?.length) {
        createImageGridPage(
          doc,
          project,
          { ...options, pcmNumber: "PCMI 7 ET 8" },
          content.images,
          "REPORTAGE PHOTOS"
        );
      }
      break;

    default:
      createCoverPage(doc, project, options, content.mainImage);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(31, 41, 55);
      const defMargin = 15;
      doc.text(
        `Document: ${options.documentType}`,
        defMargin,
        PAPER_SIZES_MM[paperSize].h / 2 - 10
      );
      doc.text(
        content.text || "Contenu du document.",
        defMargin,
        PAPER_SIZES_MM[paperSize].h / 2
      );
  }

  return Buffer.from(doc.output("arraybuffer"));
}
