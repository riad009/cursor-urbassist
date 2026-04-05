/**
 * PC2 — Plan de Masse (Site Layout Plan)
 *
 * Generates a 1-page A3 landscape PDF showing:
 *   - Captured site plan image from the 2D/3D editor
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

  const hasCapturedImage = !!capturedImages?.PC2;

  if (hasCapturedImage) {
    // ── Main captured image ──
    const imgW = 260;
    const imgH = A3L.H - contentY - A3L.FOOTER_H - 8;
    drawImageWithBorder(doc, capturedImages.PC2!, A3L.M, contentY, imgW, imgH);

    // North arrow on the map image
    drawNorthArrow(doc, A3L.M + imgW - 15, contentY + 18);

    // Scale bar
    drawScaleBar(doc, A3L.M + 8, contentY + imgH - 12, project.scale);

    // ── Right panel — summary data ──
    const panelX = A3L.M + imgW + 6;
    const panelW = A3L.W - A3L.M * 2 - imgW - 6;
    let py = contentY;

    // Project info boxes
    drawInfoBox(doc, panelX, py, panelW, 16, "Adresse", project.address || "—");
    py += 19;
    drawInfoBox(doc, panelX, py, panelW, 16, "Parcelle", project.parcelIds || "—");
    py += 19;
    drawInfoBox(
      doc,
      panelX,
      py,
      panelW,
      16,
      "Surface parcelle",
      project.parcelArea ? `${project.parcelArea.toFixed(0)} m²` : "—"
    );
    py += 22;

    // ── Building summary table ──
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
          j.nature === "new_construction"
            ? "Construction neuve"
            : j.nature === "existing_extension"
              ? "Extension"
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

    // ── Surface breakdown ──
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
  } else {
    // ── No captured image — draw placeholder ──
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
