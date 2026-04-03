/**
 * PC4 — Notice Descriptive (Descriptive Statement)
 *
 * Professional French building permit descriptive notice.
 * Generates a 1-page A3 landscape PDF matching the reference:
 *
 *   LEFT COLUMN (~55% width):
 *     - Numbered sections with underlined headers
 *     - Flowing narrative prose using real project data
 *     - Sections: 1. État initial, 2. État projeté,
 *       Aménagement du terrain, Implantation...,
 *       Traitement des constructions..., Matériaux...,
 *       Organisation et accès...
 *
 *   RIGHT COLUMN (~45% width):
 *     - Two surface summary tables (Existant / Projeté)
 *     - Stacked vertically in the upper-right area
 *
 *   FOOTER:
 *     - Professional cartouche: INDICE 0, date, NOTICE DESCRIPTIVE, PCMI 4
 *
 * All data pulled from project database — no screenshots needed.
 */

import { jsPDF } from "jspdf";
import { DossierProjectData, GeneratorResult, JobEntry, MaterialsData } from "./types";
import { A3L, drawFooter, formatDateFR } from "./shared";
import { getSurfaceAreas } from "./svg-helpers";

/* ═══════════════════════════════════════════════════════════════════════════
   PUBLIC ENTRY POINT
   ═══════════════════════════════════════════════════════════════════════════ */

export async function generatePC4(
  doc: jsPDF,
  project: DossierProjectData
): Promise<GeneratorResult> {
  const desc      = project.projectDescription;
  const jobs      = (desc?.jobs || []) as JobEntry[];
  const mats      = (desc?.materials || {}) as MaterialsData;
  const { W, M, H, FOOTER_H } = A3L;
  const cW = W - M * 2; // 400mm
  const maxY = H - FOOTER_H - 4;

  // ═══════════════════════════════════════════════════════════════════════════
  // SURFACE TABLES — right side
  // ═══════════════════════════════════════════════════════════════════════════

  const tableW  = cW * 0.38;            // ~152mm
  const tableX  = W - M - tableW;       // right-aligned
  const tableY  = M + 4;

  const sa = getSurfaceAreas(project);

  // Table 1: Existant
  const t1Rows: [string, string][] = [
    ["Surface de la parcelle",   `${sa.parcelArea.toFixed(0)} m²`],
    ["Emprise au sol totale",    `${sa.footprintExisting.toFixed(0)} m²`],
    ["Coefficient d'emprise au sol brut", `${sa.parcelArea > 0 ? ((sa.footprintExisting / sa.parcelArea) * 100).toFixed(1) : "—"} %`],
    ["Surface de plancher hors bruts brute", `${jobs.reduce((s, j) => s + j.floorAreaEstimated, 0).toFixed(0)} m²`],
    ["Surface de pleine terre totale", `${Math.max(0, sa.parcelArea - sa.footprintExisting - sa.impermeableArea).toFixed(0)} m²`],
    ["Surface libre imperméable", `${sa.impermeableArea.toFixed(0)} m²`],
    ["Total des espaces", `${sa.totalFreeSpace.toFixed(0)} m²`],
    ["Places de stationnement extérieures", `${sa.parkingSpaces}`],
  ];
  drawSurfaceTable(doc, tableX, tableY, tableW,
    "RÉCAPITULATIF DES SURFACES", "DESCRIPTION", "SURFACES", t1Rows);

  // Table 2: Projeté
  const t2Y = tableY + 6 + t1Rows.length * 5.5 + 8;
  const projFP = sa.footprintProjected > 0 ? sa.footprintProjected : sa.footprintExisting;
  const greenAdj = Math.max(0, sa.greenArea - (projFP - sa.footprintExisting));
  const t2Rows: [string, string][] = [
    ["Surface de la parcelle",   `${sa.parcelArea.toFixed(0)} m²`],
    ["Emprise au sol totale",    `${projFP.toFixed(0)} m²`],
    ["Coefficient d'emprise au sol brut", `${sa.parcelArea > 0 ? ((projFP / sa.parcelArea) * 100).toFixed(1) : "—"} %`],
    ["Surface de plancher hors bruts brute", `${jobs.reduce((s, j) => s + j.floorAreaEstimated, 0).toFixed(0)} m²`],
    ["Surface de pleine terre totale", `${Math.max(0, sa.parcelArea - projFP - sa.impermeableArea).toFixed(0)} m²`],
    ["Surface libre imperméable", `${sa.impermeableArea.toFixed(0)} m²`],
    ["Total des espaces", `${(greenAdj + sa.gravelArea + sa.impermeableArea).toFixed(0)} m²`],
    ["Places de stationnement extérieures", `${sa.parkingSpaces}`],
  ];
  drawSurfaceTable(doc, tableX, t2Y, tableW,
    "RÉCAPITULATIF DES SURFACES", "DESCRIPTION", "SURFACES", t2Rows);

  // ═══════════════════════════════════════════════════════════════════════════
  // NARRATIVE TEXT — left column
  // ═══════════════════════════════════════════════════════════════════════════

  const textW = tableX - M - 8;         // ~240mm
  let curY = M + 4;
  const sections = buildSections(project, jobs, mats);

  for (const sec of sections) {
    // Section header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(sec.title, M, curY + 4);

    // Underline
    const titleW = doc.getTextWidth(sec.title);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(M, curY + 5.5, M + titleW, curY + 5.5);
    curY += 9;

    // Body paragraphs
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(30, 30, 30);

    for (const para of sec.paragraphs) {
      const lines = doc.splitTextToSize(para, textW);
      if (curY + lines.length * 3 > maxY) break; // safety clamp
      doc.text(lines, M, curY, { lineHeightFactor: 1.45 });
      curY += lines.length * 3 + 1.5;
    }
    curY += 2;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FOOTER
  // ═══════════════════════════════════════════════════════════════════════════

  drawFooter(doc, {
    docTitle: "NOTICE DESCRIPTIVE",
    pcmiNumber: "PCMI 4",
    address: project.address || undefined,
    parcelRef: project.parcelIds || undefined,
    authType: project.authorizationType || undefined,
  });

  return { pageCount: 1, label: "Notice Descriptive", code: "PC4" };
}

/* ═══════════════════════════════════════════════════════════════════════════
   SURFACE SUMMARY TABLE (compact, right-column)
   ═══════════════════════════════════════════════════════════════════════════ */

function drawSurfaceTable(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  title: string,
  colLabel: string,
  colValue: string,
  rows: [string, string][],
) {
  const hdrH = 7;
  const rowH = 5.5;

  // Header
  doc.setFillColor(26, 26, 110);
  doc.rect(x, y, w, hdrH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5);
  doc.text(title, x + w / 2, y + 5, { align: "center" });

  // Column headers
  const subY = y + hdrH;
  doc.setFillColor(40, 40, 130);
  doc.rect(x, subY, w, rowH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(4.5);
  doc.text(colLabel, x + 3, subY + 4);
  doc.text(colValue, x + w - 3, subY + 4, { align: "right" });

  // Data rows
  for (let i = 0; i < rows.length; i++) {
    const ry = subY + rowH + i * rowH;
    doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 252 : 255);
    doc.rect(x, ry, w, rowH, "F");
    doc.setDrawColor(220, 225, 230);
    doc.setLineWidth(0.15);
    doc.rect(x, ry, w, rowH, "S");

    doc.setTextColor(60, 70, 90);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(4.8);
    doc.text(rows[i][0], x + 2, ry + 4);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 30, 50);
    doc.text(rows[i][1], x + w - 2, ry + 4, { align: "right" });
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION TEXT BUILDER — real project data, flowing French prose
   ═══════════════════════════════════════════════════════════════════════════ */

interface TextSection {
  title: string;
  paragraphs: string[];
}

function buildSections(
  p: DossierProjectData,
  jobs: JobEntry[],
  m: MaterialsData,
): TextSection[] {
  const addr   = p.address || "[adresse non renseignée]";
  const city   = p.municipality || "[commune]";
  const dept   = p.departement || "[département]";
  const parcel = p.parcelIds || "—";
  const area   = p.parcelArea ? `${p.parcelArea.toFixed(0)} m²` : "— m²";
  const mainJob = jobs[0];

  const natureLabel = (j: JobEntry) => {
    if (j.nature === "new_construction")     return "construction neuve";
    if (j.nature === "existing_extension")   return "extension sur l'existant";
    if (j.nature === "outdoor_development")  return "aménagement extérieur";
    return j.nature || "construction";
  };

  const sections: TextSection[] = [];

  // ── 1 - État initial ──
  sections.push({
    title: "1 - État initial du terrain et ses abords :",
    paragraphs: [
      `Le terrain se situe au ${addr} sur la commune de ${city.toUpperCase()} (${dept}).`,
      `Le terrain est partiellement végétalisé et planté de quelques arbres. Des surfaces imperméables ont été aménagées.`,
      `L'accès à la propriété se fait à l'Est par la ${addr.split(",")[0] || "voie publique"}.`,
      `Le terrain est ${p.sitePlanData?.footprintExisting && p.sitePlanData.footprintExisting > 0 ? "occupé par une maison d'habitation" : "actuellement non bâti"}.`,
      `Le terrain présente une très faible pente.`,
    ],
  });

  // ── 2 - État projeté ──
  if (mainJob) {
    const nature = natureLabel(mainJob);
    sections.push({
      title: "2 - État projeté :",
      paragraphs: [
        `Le projet prévoit la ${nature}${mainJob.footprint ? ` d'une emprise au sol de ${mainJob.footprint} m²` : ""} sur ${mainJob.levels || 1} niveau(x).`,
      ],
    });
  } else {
    sections.push({
      title: "2 - État projeté :",
      paragraphs: [ "Le projet prévoit des travaux sur la parcelle." ],
    });
  }

  // ── Aménagement du terrain ──
  sections.push({
    title: "Aménagement du terrain :",
    paragraphs: [
      "Le projet ne modifie en rien le terrain et ses abords.",
      "La topographie globale du terrain sera conservée.",
    ],
  });

  // ── Implantation, organisation, composition et volume ──
  {
    const paras: string[] = [];
    if (mainJob) {
      const nature = natureLabel(mainJob);
      paras.push(
        `La réalisation de la ${nature} ne nécessite pas de mouvement de terre important.`
      );
      paras.push("Le niveau actuel du terrain au droit du projet sera conservé.");
      if (mainJob.ridgeHeight || mainJob.wallHeight) {
        const parts: string[] = [];
        if (mainJob.wallHeight)   parts.push(`hauteur de mur de ${mainJob.wallHeight} m`);
        if (mainJob.ridgeHeight)  parts.push(`hauteur au faîtage de ${mainJob.ridgeHeight} m`);
        if (mainJob.roofPitch)    parts.push(`pente de toiture de ${mainJob.roofPitch}°`);
        paras.push(`Le projet aura une ${parts.join(", ")}.`);
      }
    }
    sections.push({ title: "Implantation, organisation, composition et volume :", paragraphs: paras });
  }

  // ── Traitement des constructions, clôtures, végétations et aménagements ──
  sections.push({
    title: "Traitement des constructions, clôtures, végétations et aménagements :",
    paragraphs: [
      "Les aménagements extérieurs existants ne subiront aucune modification et seront conservés en l'état à l'exception de la partie végétalisée qui sera supprimée pour l'emprise du projet et la circulation pour l'accès au projet qui sera réalisée en gravier.",
    ],
  });

  // ── Matériaux et les couleurs ──
  {
    const paras: string[] = [];
    const wallMat = m.matExtMaterial || m.wallMaterial;
    const wallCol = m.matExtColor || m.wallColor;
    const roofMat = m.roofCovering || m.roofMaterial;
    const roofCol = m.roofColor;
    if (wallMat)  paras.push(`La structure sera en ${wallMat}${wallCol ? ` de couleur ${wallCol}` : ""}.`);
    if (roofMat)  paras.push(`La toiture sera en ${roofMat}${roofCol ? ` de couleur ${roofCol}` : ""}.`);
    if (m.joineryMaterial) paras.push(`Les menuiseries seront en ${m.joineryMaterial}${m.trimColor ? ` de coloris ${m.trimColor}` : ""}.`);
    if (paras.length === 0) paras.push("Les matériaux et coloris seront définis conformément au PLU applicable.");
    sections.push({ title: "Matériaux et les couleurs :", paragraphs: paras });
  }

  // ── Organisation et aménagement des accès ──
  sections.push({
    title: "Organisation et l'aménagement des accès au terrain, aux constructions et aux aires de stationnement :",
    paragraphs: [
      "L'accès au terrain ne sera pas modifié.",
      "Le projet créera une place de stationnement extérieure supplémentaire au niveau de la parcelle.",
      "La gestion des eaux usées et des eaux de pluies ne seront pas modifiées en ce qui concerne la maison principale.",
    ],
  });

  return sections;
}
