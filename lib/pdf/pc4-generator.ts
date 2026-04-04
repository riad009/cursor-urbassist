/**
 * PC4 — Notice Descriptive (Descriptive Statement)
 *
 * Professional French building permit descriptive notice.
 * Generates a 1-page A3 landscape PDF matching the reference PCMI 4:
 *
 *   LEFT COLUMN (~55% width):
 *     - Numbered + underlined section headers
 *     - Flowing narrative prose using real project data
 *     - Sections: 1. État initial, 2. État projeté,
 *       Aménagement du terrain, Implantation...,
 *       Traitement des constructions..., Matériaux...,
 *       Organisation et accès...
 *
 *   RIGHT COLUMN (~45% width):
 *     - Two surface summary tables (Existant / Projet) side by side
 *     - 3D render image (if available)
 *
 *   FOOTER:
 *     - Professional cartouche: INDICE 0, date, NOTICE DESCRIPTIVE, PCMI 4
 *     - Disclaimer: "Document ne pouvant servir à l'exécution des travaux..."
 *
 * All data pulled from project database — no screenshots needed.
 */

import { jsPDF } from "jspdf";
import { DossierProjectData, GeneratorResult, JobEntry, MaterialsData } from "./types";
import { A3L, drawFooter, formatDateFR } from "./shared";
import { getSurfaceAreas } from "./svg-helpers";

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

/** Extract department number from postal code, citycode, or address */
function getDepartment(p: DossierProjectData): string {
  // 1. postalCode field (set by API from citycode or address parsing)
  if (p.postalCode && p.postalCode.length >= 2) {
    return p.postalCode.slice(0, 2);
  }
  // 2. citycode field
  if (p.citycode && p.citycode.length >= 2) {
    return p.citycode.slice(0, 2);
  }
  // 3. departement field if it's a number
  if (p.departement && /^\d{2,3}$/.test(p.departement)) {
    return p.departement;
  }
  // 4. Parse from address
  if (p.address) {
    const m = p.address.match(/\b(\d{5})\b/);
    if (m) return m[1].slice(0, 2);
  }
  return "";
}

/** Get postal code from available data */
function getPostalCode(p: DossierProjectData): string {
  if (p.postalCode) return p.postalCode;
  if (p.citycode && p.citycode.length === 5) return p.citycode;
  if (p.address) {
    const m = p.address.match(/\b(\d{5})\b/);
    if (m) return m[1];
  }
  return "";
}

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
  const maxY = H - FOOTER_H - 8;

  // ═══════════════════════════════════════════════════════════════════════════
  // RIGHT COLUMN — Surface tables + 3D render
  // ═══════════════════════════════════════════════════════════════════════════

  const rightColW = (W - M * 2) * 0.42;
  const rightColX = W - M - rightColW;
  const tableW    = rightColW;

  const sa = getSurfaceAreas(project);
  const projFP = sa.footprintProjected > 0 ? sa.footprintProjected : sa.footprintExisting;
  const projGreen = Math.max(0, sa.greenArea - Math.max(0, projFP - sa.footprintExisting));
  const projPleineTerre = projGreen + sa.semiPermeableArea;
  const projImperm = sa.impermeableArea;
  const projTotalFree = projGreen + sa.semiPermeableArea + projImperm;

  // Table 1: Existant
  let tableY = M + 4;
  const existRows = buildTableRows(
    sa.parcelArea,
    sa.footprintHabitation,
    sa.footprintExisting,
    sa.coefficientEmpriseExisting,
    sa.greenArea,
    sa.semiPermeableArea,
    sa.pleineTerreTotal,
    sa.parcelArea > 0 ? (sa.pleineTerreTotal / sa.parcelArea) * 100 : 0,
    sa.impermeableArea,
    sa.parcelArea > 0 ? (sa.impermeableArea / sa.parcelArea) * 100 : 0,
    sa.totalFreeSpace,
    sa.parcelArea > 0 ? (sa.totalFreeSpace / sa.parcelArea) * 100 : 0,
    sa.parkingSpacesExisting,
  );
  const t1H = drawSurfaceTable(doc, rightColX, tableY, tableW, "Existant", existRows);

  // Table 2: Projet
  tableY += t1H + 4;
  const projRows = buildTableRows(
    sa.parcelArea,
    sa.footprintHabitation,
    projFP,
    sa.coefficientEmpriseProject,
    projGreen,
    sa.semiPermeableArea,
    projPleineTerre,
    sa.parcelArea > 0 ? (projPleineTerre / sa.parcelArea) * 100 : 0,
    projImperm,
    sa.parcelArea > 0 ? (projImperm / sa.parcelArea) * 100 : 0,
    projTotalFree,
    sa.parcelArea > 0 ? (projTotalFree / sa.parcelArea) * 100 : 0,
    sa.parkingSpacesProject,
  );
  const t2H = drawSurfaceTable(doc, rightColX, tableY, tableW, "Projet", projRows);

  // 3D render image (if available)
  const imgUrl = desc?.projectImageUrl;
  if (imgUrl && typeof imgUrl === "string" && imgUrl.startsWith("http")) {
    try {
      const imgY = tableY + t2H + 4;
      const imgH = Math.min(60, maxY - imgY);
      if (imgH > 20) {
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.rect(rightColX, imgY, tableW, imgH, "S");
        doc.setFillColor(245, 245, 250);
        doc.rect(rightColX + 0.5, imgY + 0.5, tableW - 1, imgH - 1, "F");
        doc.setTextColor(150, 150, 160);
        doc.setFontSize(8);
        doc.text("Vue 3D du projet", rightColX + tableW / 2, imgY + imgH / 2, { align: "center" });
      }
    } catch { /* silent */ }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEFT COLUMN — Narrative text
  // ═══════════════════════════════════════════════════════════════════════════

  const textW = rightColX - M - 6;
  let curY = M + 4;
  const sections = buildSections(project, jobs, mats);

  for (const sec of sections) {
    if (curY > maxY - 8) break;

    // Section header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(sec.title, M, curY + 4);

    // Underline
    const titleW = doc.getTextWidth(sec.title);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    doc.line(M, curY + 5.5, M + titleW, curY + 5.5);
    curY += 10;

    // Body paragraphs
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);

    for (const para of sec.paragraphs) {
      const lines = doc.splitTextToSize(para, textW);
      if (curY + lines.length * 4.2 > maxY) break;
      doc.text(lines, M, curY, { lineHeightFactor: 1.4 });
      curY += lines.length * 4.2 + 1.5;
    }
    curY += 1.5;
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

  // Disclaimer text above footer
  const disclaimerY = H - FOOTER_H - 5;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(140, 140, 140);
  doc.text(
    "Document ne pouvant servir à l'exécution des travaux. Toute reproduction interdite sans autorisation préalable.",
    W / 2,
    disclaimerY,
    { align: "center" }
  );

  return { pageCount: 1, label: "Notice Descriptive", code: "PC4" };
}

/* ═══════════════════════════════════════════════════════════════════════════
   BUILD TABLE ROWS — matching the reference PDF schema
   ═══════════════════════════════════════════════════════════════════════════ */

interface TableRow {
  label: string;
  value: string;
  isBold?: boolean;
}

function buildTableRows(
  parcelArea: number,
  habitationFP: number,
  totalFP: number,
  coeffEmprise: number,
  greenArea: number,
  semiPerm: number,
  pleineTerreTotal: number,
  pleineTerrePercent: number,
  impermeableArea: number,
  impermeablePercent: number,
  totalFreeSpace: number,
  totalFreePercent: number,
  parkingSpaces: number,
): TableRow[] {
  return [
    { label: "Surface de la parcelle", value: `${parcelArea.toFixed(0)} m²` },
    { label: "Emprise au sol de la maison d'habitation", value: `${habitationFP.toFixed(0)} m²` },
    { label: "Emprise au sol totale", value: `${totalFP.toFixed(0)} m²` },
    { label: "Coefficient d'emprise au sol totale", value: `${coeffEmprise.toFixed(1)} %` },
    { label: "Surface de pleine terre végétalisée", value: `${greenArea.toFixed(0)} m²` },
    { label: "Surface semi perméable", value: `${semiPerm.toFixed(0)} m²` },
    { label: "Surface de pleine terre totale", value: `${pleineTerreTotal.toFixed(0)} m²` },
    { label: "SOIT", value: `${pleineTerrePercent.toFixed(1)} %`, isBold: true },
    { label: "Surface libre imperméable", value: `${impermeableArea.toFixed(0)} m²` },
    { label: "SOIT", value: `${impermeablePercent.toFixed(1)} %`, isBold: true },
    { label: "Total des espaces libres", value: `${totalFreeSpace.toFixed(0)} m²` },
    { label: "SOIT", value: `${totalFreePercent.toFixed(1)} %`, isBold: true },
    { label: "Places de stationnement extérieures", value: `${parkingSpaces}` },
  ];
}

/* ═══════════════════════════════════════════════════════════════════════════
   SURFACE SUMMARY TABLE
   ═══════════════════════════════════════════════════════════════════════════ */

function drawSurfaceTable(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  headerTitle: string,
  rows: TableRow[],
): number {
  const hdrH = 9;
  const subH = 7;
  const rowH = 7;

  // Header bar — dark blue
  doc.setFillColor(26, 35, 126); // #1a237e
  doc.rect(x, y, w, hdrH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(`RÉCAPITULATIF DES SURFACES — ${headerTitle}`, x + w / 2, y + 6.2, { align: "center" });

  // Sub-header — column labels
  const subY = y + hdrH;
  doc.setFillColor(40, 53, 147); // slightly lighter blue
  doc.rect(x, subY, w, subH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("DESCRIPTION", x + 3, subY + 4.8);
  doc.text("SURFACES", x + w - 3, subY + 4.8, { align: "right" });

  // Data rows
  let ry = subY + subH;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Alternating row colors
    if (row.isBold) {
      doc.setFillColor(230, 233, 255); // light indigo for SOIT rows
    } else {
      doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 249 : 255, i % 2 === 0 ? 253 : 255);
    }
    doc.rect(x, ry, w, rowH, "F");

    // Row border
    doc.setDrawColor(220, 225, 235);
    doc.setLineWidth(0.1);
    doc.rect(x, ry, w, rowH, "S");

    // Label
    doc.setTextColor(row.isBold ? 26 : 60, row.isBold ? 35 : 70, row.isBold ? 126 : 90);
    doc.setFont("helvetica", row.isBold ? "bold" : "normal");
    doc.setFontSize(7);
    doc.text(row.label, x + 3, ry + 4.8);

    // Value
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 30, 50);
    doc.setFontSize(7);
    doc.text(row.value, x + w - 3, ry + 4.8, { align: "right" });

    ry += rowH;
  }

  return hdrH + subH + rows.length * rowH;
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
  const postal = getPostalCode(p);
  const dept   = getDepartment(p);
  const mainJob = jobs[0];
  const desc   = p.projectDescription;

  // Build location suffix — e.g. "(60510)" or "(60)"
  const locationSuffix = postal ? `(${postal})` : dept ? `(${dept})` : "";

  const natureLabel = (j: JobEntry) => {
    if (j.nature === "new_construction")    return "construction neuve";
    if (j.nature === "existing_extension")  return "extension sur l'existant";
    if (j.nature === "outdoor_development") return "aménagement extérieur";
    const label = j.displayLabel?.toLowerCase();
    if (label?.includes("carport"))         return "construction d'un carport";
    if (label?.includes("garage"))          return "construction d'un garage";
    if (label?.includes("abri"))            return "construction d'un abri";
    return j.nature || "construction";
  };

  const sections: TextSection[] = [];

  // ── 1 - État initial du terrain et ses abords ──
  {
    const paras: string[] = [];
    paras.push(
      `Le terrain se situe au ${addr} sur la commune de ${city.toUpperCase()} ${locationSuffix}.`
    );
    paras.push(
      desc?.vegetationDescription as string ||
      "Le terrain est partiellement végétalisé et planté de quelques arbres. Des surfaces imperméables ont été aménagées."
    );
    paras.push(
      desc?.accessDescription as string ||
      `L'accès à la propriété se fait par la voie publique existante.`
    );
    paras.push(
      desc?.currentBuildingState as string ||
      (p.sitePlanData?.footprintExisting && p.sitePlanData.footprintExisting > 0
        ? "Le terrain est occupé par une maison d'habitation."
        : "Le terrain est actuellement non bâti.")
    );
    paras.push(
      desc?.slopeDescription as string ||
      "Le terrain présente une très faible pente."
    );
    sections.push({
      title: "1 - État initial du terrain et ses abords :",
      paragraphs: paras,
    });
  }

  // ── 2 - État projeté ──
  if (mainJob) {
    const nature = natureLabel(mainJob);
    sections.push({
      title: "2 - État projeté :",
      paragraphs: [
        `Le projet prévoit la ${nature}${mainJob.footprint ? ` d'une emprise au sol de ${mainJob.footprint} m²` : ""}.`,
      ],
    });
  } else {
    sections.push({
      title: "2 - État projeté :",
      paragraphs: ["Le projet prévoit des travaux sur la parcelle."],
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

      // Style description from DB or build from dimensions
      if (desc?.styleDescription) {
        paras.push(desc.styleDescription as string);
      } else if (mainJob.ridgeHeight || mainJob.wallHeight) {
        const parts: string[] = [];
        if (mainJob.wallHeight) parts.push(`hauteur de mur de ${mainJob.wallHeight} m`);
        if (mainJob.ridgeHeight) parts.push(`hauteur au faîtage de ${mainJob.ridgeHeight} m`);
        if (mainJob.roofPitch) parts.push(`pente de toiture de ${mainJob.roofPitch}°`);
        paras.push(`Le projet aura une ${parts.join(", ")}.`);
      }
    }
    sections.push({
      title: "Implantation, organisation, composition et volume :",
      paragraphs: paras,
    });
  }

  // ── Traitement des constructions, clôtures, végétations et aménagements ──
  {
    const paras: string[] = [];
    paras.push(
      "Les aménagements extérieurs existants ne subiront aucune modification et seront conservés en l'état à l'exception de la partie végétalisée qui sera supprimée pour l'emprise du projet et la circulation pour l'accès au projet qui sera réalisée en gravier."
    );

    // Setback distances
    const sb = desc?.setbackDistances;
    if (sb?.description) {
      paras.push(sb.description);
    } else if (sb) {
      const parts: string[] = [];
      if (sb.north !== undefined) parts.push(`à ${sb.north}m de la limite Nord`);
      if (sb.south !== undefined) parts.push(`en limite de propriété côté Sud`);
      if (sb.east !== undefined) parts.push(`en limite de propriété côté Est`);
      if (sb.west !== undefined) parts.push(`à ${sb.west}m de la limite Ouest`);
      if (sb.house !== undefined) parts.push(`à ${sb.house}m de la maison`);
      if (parts.length > 0) {
        const label = mainJob?.displayLabel?.toLowerCase().includes("carport") ? "Le carport" : "Le projet";
        paras.push(`${label} sera implanté ${parts.join(" et ")}.`);
      }
    }

    sections.push({
      title: "Traitement des constructions, clôtures, végétations et aménagements :",
      paragraphs: paras,
    });
  }

  // ── Matériaux et les couleurs ──
  {
    const paras: string[] = [];
    const label = mainJob?.displayLabel?.toLowerCase().includes("carport") ? "du carport" : "du projet";

    // Structure material
    if (m.structureMaterial) {
      paras.push(`La structure ${label} sera en ${m.structureMaterial}.`);
    } else {
      const wallMat = m.matExtMaterial || m.wallMaterial;
      if (wallMat) {
        paras.push(`La structure sera en ${wallMat}${m.wallColor ? ` de couleur ${m.wallColor}` : ""}.`);
      }
    }

    // Roof description — dual pan if available
    if (m.roofPan1Material && m.roofPan2Material) {
      paras.push(
        `La toiture sera à deux pans de pentes différentes. Le plus grand pan de toiture sera en ${m.roofPan1Material} de couleur ${m.roofPan1Color || "—"} RAL ${m.roofPan1RAL || "—"} avec une pente de ${m.roofPan1Slope || "—"}% et l'autre pan, plus petit, sera en ${m.roofPan2Material} de couleur ${m.roofPan2Color || "—"} RAL ${m.roofPan2RAL || "—"} avec une pente de ${m.roofPan2Slope || "—"}%.`
      );
    } else {
      const roofMat = m.roofCovering || m.roofMaterial;
      const roofCol = m.roofColor;
      if (roofMat) {
        paras.push(`La toiture sera en ${roofMat}${roofCol ? ` de couleur ${roofCol}` : ""}.`);
      }
    }

    if (m.joineryMaterial) {
      paras.push(`Les menuiseries seront en ${m.joineryMaterial}${m.trimColor ? ` de coloris ${m.trimColor}` : ""}.`);
    }

    if (paras.length === 0) {
      paras.push("Les matériaux et coloris seront définis conformément au PLU applicable.");
    }

    sections.push({ title: "Matériaux et les couleurs :", paragraphs: paras });
  }

  // ── Organisation et l'aménagement des accès ──
  {
    const paras: string[] = [];
    paras.push("L'accès au terrain ne sera pas modifié.");

    // Parking spaces
    const parkingCount = (desc?.parkingSpacesProject as number) || 1;
    paras.push(
      `Le projet créera ${parkingCount} place${parkingCount > 1 ? "s" : ""} de stationnement extérieure${parkingCount > 1 ? "s" : ""} supplémentaire${parkingCount > 1 ? "s" : ""} au niveau de la parcelle.`
    );

    paras.push(
      "La gestion des eaux usées ne sera pas modifiée en ce qui concerne la maison principale."
    );

    // Rainwater management
    if (desc?.rainwaterManagement) {
      paras.push(desc.rainwaterManagement as string);
    } else {
      const label = mainJob?.displayLabel?.toLowerCase().includes("carport") ? "le carport" : "le projet";
      paras.push(
        `Les eaux de pluies générées par ${label} seront traitées au niveau de la parcelle par une cuve de rétention avec réutilisation pour l'arrosage et les besoins en eau de l'entretien du jardin.`
      );
    }

    sections.push({
      title: "Organisation et l'aménagement des accès au terrain, aux constructions et aux aires de stationnement :",
      paragraphs: paras,
    });
  }

  return sections;
}
