/**
 * Dossier Assembler — orchestrates all PC generators into a single PDF.
 *
 * Client-side orchestrator that:
 * 1. Fetches project data from /api/generate-dossier
 * 2. Calls each PC generator in sequence
 * 3. Returns the assembled jsPDF document
 */

import { jsPDF } from "jspdf";
import { DossierProjectData, CapturedImages, GeneratorResult } from "./types";
import { createA3Doc, drawFooter, A3L, COLORS, formatDateFR } from "./shared";
import { generatePC1 } from "./pc1-generator";
import { generatePC2 } from "./pc2-generator";
import { generatePC3 } from "./pc3-generator";
import { generatePC4 } from "./pc4-generator";
import { generatePC5 } from "./pc5-generator";

export interface AssembleOptions {
  projectId: string;
  baseUrl: string;
  capturedImages: CapturedImages;
  onProgress?: (msg: string, pct: number) => void;
}

/**
 * Generate a single PC document PDF.
 */
export async function generateSingleDocument(
  docCode: string,
  projectData: DossierProjectData,
  baseUrl: string,
  capturedImages: CapturedImages,
  onProgress?: (msg: string) => void
): Promise<jsPDF> {
  const doc = createA3Doc();

  switch (docCode) {
    case "PC1":
      await generatePC1(doc, projectData, baseUrl, onProgress);
      break;
    case "PC2":
      await generatePC2(doc, projectData, capturedImages);
      break;
    case "PC3":
      await generatePC3(doc, projectData);
      break;
    case "PC4":
      await generatePC4(doc, projectData);
      break;
    case "PC5":
    case "PC5.1":
    case "PC5.2":
      await generatePC5(doc, projectData);
      break;
    default:
      throw new Error(`Unknown document code: ${docCode}`);
  }

  return doc;
}

/**
 * Assemble the full dossier (PC1 through PC5.2) into a single multi-page PDF.
 *
 * Each generator is wrapped in a try/catch — if one fails, an error page
 * is inserted and generation continues. A user should NEVER receive a
 * blank dossier because a single map fetch timed out.
 */
export async function assembleDossier(
  projectData: DossierProjectData,
  opts: AssembleOptions
): Promise<jsPDF> {
  const { baseUrl, capturedImages, onProgress } = opts;
  const doc = createA3Doc();
  const results: GeneratorResult[] = [];

  // ═══ Cover Page ═══
  onProgress?.("Génération de la page de garde...", 5);
  drawCoverPage(doc, projectData);

  // ═══ PC1 — Plan de Situation (1 page: 3 views combined) ═══
  onProgress?.("PC1 — Plan de Situation...", 15);
  doc.addPage([420, 297], "landscape");
  try {
    const r1 = await generatePC1(doc, projectData, baseUrl, (msg) =>
      onProgress?.(msg, 30)
    );
    results.push(r1);
  } catch (err) {
    console.error("[dossier] PC1 generation failed:", err);
    drawErrorPage(doc, "PCMI 1", "Plan de Situation", err);
  }

  // ═══ PC2 — Plan de Masse ═══
  onProgress?.("PC2 — Plan de Masse...", 45);
  doc.addPage([420, 297], "landscape");
  try {
    const r2 = await generatePC2(doc, projectData, capturedImages);
    results.push(r2);
  } catch (err) {
    console.error("[dossier] PC2 generation failed:", err);
    drawErrorPage(doc, "PCMI 2", "Plan de Masse", err);
  }

  // ═══ PC3 — Plan en Coupe ═══
  onProgress?.("PC3 — Plan en Coupe...", 60);
  doc.addPage([420, 297], "landscape");
  try {
    const r3 = await generatePC3(doc, projectData);
    results.push(r3);
  } catch (err) {
    console.error("[dossier] PC3 generation failed:", err);
    drawErrorPage(doc, "PCMI 3", "Plan en Coupe", err);
  }

  // ═══ PC4 — Notice Descriptive ═══
  onProgress?.("PC4 — Notice Descriptive...", 75);
  doc.addPage([420, 297], "landscape");
  try {
    const r4 = await generatePC4(doc, projectData);
    results.push(r4);
  } catch (err) {
    console.error("[dossier] PC4 generation failed:", err);
    drawErrorPage(doc, "PCMI 4", "Notice Descriptive", err);
  }

  // ═══ PC5 — Plans des Façades ═══
  onProgress?.("PC5 — Plans des Façades...", 90);
  doc.addPage([420, 297], "landscape");
  try {
    const r5 = await generatePC5(doc, projectData);
    results.push(r5);
  } catch (err) {
    console.error("[dossier] PC5 generation failed:", err);
    drawErrorPage(doc, "PCMI 5.1 / 5.2", "Plans des Façades", err);
  }

  onProgress?.("Finalisation du dossier...", 98);

  return doc;
}

// ─── Error page (used when a generator fails) ──────────────────────────────

function drawErrorPage(doc: jsPDF, pcmiNumber: string, docTitle: string, err: unknown) {
  const { W, H } = A3L;

  // Light grey background
  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, W, H, "F");

  // Warning icon area
  doc.setFillColor(254, 243, 199); // amber-100
  doc.roundedRect(W / 2 - 30, H * 0.3, 60, 60, 30, 30, "F");

  doc.setTextColor(217, 119, 6); // amber-600
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text("!", W / 2, H * 0.3 + 38, { align: "center" });

  // Error title
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(16);
  doc.text(`Échec de génération — ${pcmiNumber}`, W / 2, H * 0.55, { align: "center" });

  // Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(docTitle, W / 2, H * 0.6, { align: "center" });

  // Error detail
  const errMsg = err instanceof Error ? err.message : String(err);
  doc.setFontSize(7);
  doc.text(`Erreur: ${errMsg.slice(0, 120)}`, W / 2, H * 0.67, { align: "center" });

  doc.setFontSize(8);
  doc.text(
    "Ce document peut être régénéré individuellement depuis le tableau de bord du dossier.",
    W / 2,
    H * 0.73,
    { align: "center" }
  );

  // Footer
  drawFooter(doc, {
    docTitle: `${docTitle} (ERREUR)`,
    pcmiNumber,
    scale: "—",
  });
}

// ─── Cover page ────────────────────────────────────────────────────────────

function drawCoverPage(doc: jsPDF, project: DossierProjectData) {
  const { W, H, M } = A3L;
  const desc = project.projectDescription;
  const applicant = desc?.applicantName || "—";
  const isDP = project.authorizationType === "DP";
  const dossierTitle = isDP
    ? "DOSSIER DE DÉCLARATION PRÉALABLE"
    : "DOSSIER DE PERMIS DE CONSTRUIRE";

  // Full dark background
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, H, "F");

  // Accent stripe
  doc.setFillColor(79, 70, 229); // indigo-600
  doc.rect(0, H * 0.38, W, 3, "F");

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text(dossierTitle, W / 2, H * 0.25, { align: "center" });

  doc.setFontSize(14);
  doc.setTextColor(165, 180, 252); // indigo-300
  doc.text("PIÈCES CONSTITUTIVES DU DOSSIER", W / 2, H * 0.32, { align: "center" });

  // Project info block
  const blockY = H * 0.45;
  const blockW = 200;
  const blockX = W / 2 - blockW / 2;

  // Info grid
  const infoItems = [
    ["PROJET", project.name || "—"],
    ["ADRESSE", project.address || "—"],
    ["COMMUNE", project.municipality || "—"],
    ["PARCELLE(S)", project.parcelIds || "—"],
    ["DEMANDEUR", applicant],
    ["TYPE", project.authorizationType === "DP" ? "Déclaration Préalable (DP)" : "Permis de Construire (PC)"],
    ["DATE", formatDateFR()],
    ["RÉFÉRENCE", project.id.slice(0, 8).toUpperCase()],
  ];

  doc.setFontSize(7);
  let iy = blockY;
  for (const [label, value] of infoItems) {
    doc.setTextColor(148, 163, 184); // slate-400
    doc.setFont("helvetica", "bold");
    doc.text(label, blockX, iy);

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(value, blockX + 45, iy);
    doc.setFontSize(7);
    iy += 10;
  }

  // Document index
  const indexY = H * 0.75;
  doc.setTextColor(148, 163, 184);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("SOMMAIRE DES PIÈCES", blockX, indexY);

  const docList = [
    "PCMI 1 — Plan de situation du terrain",
    "PCMI 2 — Plan de masse des constructions",
    "PCMI 3 — Plan en coupe du terrain et de la construction",
    "PCMI 4 — Notice descriptive",
    "PCMI 5.1 — Façades et toitures (état initial)",
    "PCMI 5.2 — Façades et toitures (état projeté)",
  ];

  doc.setFont("helvetica", "normal");
  doc.setTextColor(203, 213, 225); // slate-300
  doc.setFontSize(8);
  docList.forEach((item, i) => {
    doc.text(`${i + 1}.  ${item}`, blockX + 5, indexY + 8 + i * 7);
  });

  // Footer
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(6);
  doc.text(
    `Document généré par Urbassist — urbassist.com — ${formatDateFR()}`,
    W / 2,
    H - 12,
    { align: "center" }
  );
}

/**
 * Fetch project data from the server API.
 */
export async function fetchDossierData(
  projectId: string,
  baseUrl: string
): Promise<DossierProjectData> {
  const res = await fetch(`${baseUrl}/api/generate-dossier?projectId=${projectId}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch dossier data: ${res.status} — ${text}`);
  }
  return res.json();
}
