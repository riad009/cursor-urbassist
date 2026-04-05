/**
 * PC1 — Plan de Situation (Location Plan)
 *
 * Generates a SINGLE A3 landscape page (420mm × 297mm) combining:
 *   - Left half: IGN topographic plan (1/5000)
 *   - Top-right: Cadastral parcel view (1/2000)
 *   - Bottom-right: Aerial orthophoto (1/2000)
 *   - Center-top: Compass rose
 *   - Bottom: Professional dark title block
 *
 * All map images are composed server-side via sharp tile stitching.
 */

import { jsPDF } from "jspdf";
import { DossierProjectData, GeneratorResult } from "./types";
import { COLORS, formatDateFR } from "./shared";

// ─── Coordinate parser ─────────────────────────────────────────────────────

function parseCenter(project: DossierProjectData): [number, number] | null {
  if (project.coordinates) {
    try {
      const parsed = JSON.parse(project.coordinates);
      if (Array.isArray(parsed) && parsed.length >= 2) {
        return [parsed[1], parsed[0]]; // [lat, lng]
      }
      const lat = parsed.lat ?? parsed.latitude;
      const lng = parsed.lng ?? parsed.longitude;
      if (typeof lat === "number" && typeof lng === "number") return [lat, lng];
    } catch {
      /* ignore */
    }
  }
  return null;
}

// ─── Fetch all 3 map images from the server ────────────────────────────────

async function fetchAllMapImages(
  baseUrl: string,
  lat: number,
  lng: number,
  parcelGeoJson?: string | null
): Promise<{
  ignImage: string;
  cadastreImage: string;
  aerialImage: string;
}> {
  const payload = {
    lat,
    lng,
    parcelGeoJson: parcelGeoJson ? JSON.parse(parcelGeoJson) : undefined,
  };

  // Try up to 2 attempts
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/api/location-plan/export-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        return {
          ignImage: data.ignImage,
          cadastreImage: data.cadastreImage,
          aerialImage: data.aerialImage,
        };
      }

      const errText = await res.text().catch(() => "");
      console.warn(
        `[PC1] Map fetch attempt ${attempt + 1} failed: ${res.status} — ${errText}`
      );

      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch (err) {
      console.warn(`[PC1] Map fetch attempt ${attempt + 1} error:`, err);
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }

  throw new Error("Map composition failed after 2 attempts");
}

// ─── Draw compass rose ─────────────────────────────────────────────────────

function drawCompassRose(doc: jsPDF, cx: number, cy: number, r: number) {
  // North arrow (dark filled)
  doc.setFillColor(26, 26, 46);
  doc.triangle(cx, cy - r, cx - r * 0.15, cy, cx + r * 0.15, cy, "F");

  // South arrow (grey)
  doc.setFillColor(160, 160, 160);
  doc.triangle(cx, cy + r, cx - r * 0.15, cy, cx + r * 0.15, cy, "F");

  // East/West arms
  doc.setFillColor(26, 26, 46);
  doc.triangle(cx + r * 0.7, cy, cx, cy - r * 0.1, cx, cy + r * 0.1, "F");
  doc.setFillColor(160, 160, 160);
  doc.triangle(cx - r * 0.7, cy, cx, cy - r * 0.1, cx, cy + r * 0.1, "F");

  // Center circle
  doc.setDrawColor(26, 26, 46);
  doc.setLineWidth(0.5);
  doc.circle(cx, cy, r * 0.12);

  // Cardinal labels
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(26, 26, 46);
  doc.text("N", cx, cy - r - 3, { align: "center" });
  doc.text("S", cx, cy + r + 6, { align: "center" });
  doc.text("E", cx + r * 0.7 + 5, cy + 2.5);
  doc.text("O", cx - r * 0.7 - 8, cy + 2.5);
}

// ─── Draw map header bar ───────────────────────────────────────────────────

function drawMapHeader(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  fontSize: number = 7
) {
  doc.setFillColor(26, 26, 46); // #1a1a2e
  doc.rect(x, y, w, h, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  doc.text(text, x + 3, y + h - 2);
}

// ─── Generator ─────────────────────────────────────────────────────────────

export async function generatePC1(
  doc: jsPDF,
  project: DossierProjectData,
  baseUrl: string,
  onProgress?: (msg: string) => void
): Promise<GeneratorResult> {
  const center = parseCenter(project);

  if (!center) {
    // Placeholder when no coordinates
    doc.setFillColor(248, 250, 252);
    doc.rect(10, 10, 400, 243, "F");
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(12);
    doc.text(
      "Les coordonnées du projet ne sont pas disponibles.\nVeuillez renseigner l'adresse du projet.",
      210,
      130,
      { align: "center" }
    );

    // Title block
    drawTitleBlock(doc, project);

    return { pageCount: 1, label: "Plan de Situation", code: "PC1" };
  }

  const [lat, lng] = center;

  // ── Fetch all 3 map images in one call ──────────────────────────────
  onProgress?.("PC1 — Composition des 3 vues cartographiques...");

  let ignImage: string | null = null;
  let cadastreImage: string | null = null;
  let aerialImage: string | null = null;

  try {
    const maps = await fetchAllMapImages(
      baseUrl,
      lat,
      lng,
      project.parcelGeometry
    );
    ignImage = maps.ignImage;
    cadastreImage = maps.cadastreImage;
    aerialImage = maps.aerialImage;
  } catch (err) {
    console.error("[PC1] Failed to fetch map images:", err);
  }

  // ── IGN map — left half ─────────────────────────────────────────────
  drawMapHeader(doc, 10, 10, 200, 8, "PLAN IGN — 1/5000ème", 7);

  if (ignImage) {
    try {
      doc.addImage(
        `data:image/jpeg;base64,${ignImage}`,
        "JPEG",
        10,
        18,
        200,
        235
      );
    } catch (err) {
      console.error("[PC1] IGN image embed failed:", err);
      drawPlaceholder(doc, 10, 18, 200, 235, "IGN Plan indisponible");
    }
  } else {
    drawPlaceholder(doc, 10, 18, 200, 235, "IGN Plan indisponible");
  }

  // ── Compass rose (center-top area) ──────────────────────────────────
  drawCompassRose(doc, 250, 38, 18);

  // ── Cadastre map — top right ────────────────────────────────────────
  drawMapHeader(
    doc,
    215,
    75,
    195,
    8,
    "PLAN DE COMPOSITION CADASTRALE — 1/2000ème",
    6
  );

  if (cadastreImage) {
    try {
      doc.addImage(
        `data:image/jpeg;base64,${cadastreImage}`,
        "JPEG",
        215,
        83,
        195,
        80
      );
    } catch (err) {
      console.error("[PC1] Cadastre image embed failed:", err);
      drawPlaceholder(doc, 215, 83, 195, 80, "Cadastre indisponible");
    }
  } else {
    drawPlaceholder(doc, 215, 83, 195, 80, "Cadastre indisponible");
  }

  // ── Aerial map — bottom right ───────────────────────────────────────
  drawMapHeader(doc, 215, 168, 195, 7, "VUE AÉRIENNE — 1/2000ème", 6);

  if (aerialImage) {
    try {
      doc.addImage(
        `data:image/jpeg;base64,${aerialImage}`,
        "JPEG",
        215,
        175,
        195,
        78
      );
    } catch (err) {
      console.error("[PC1] Aerial image embed failed:", err);
      drawPlaceholder(doc, 215, 175, 195, 78, "Vue aérienne indisponible");
    }
  } else {
    drawPlaceholder(doc, 215, 175, 195, 78, "Vue aérienne indisponible");
  }

  // ── Drawing border around the entire map area ───────────────────────
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(10, 10, 400, 243);

  // ── Divider lines ───────────────────────────────────────────────────
  // Vertical divider between left IGN and right panels
  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.3);
  doc.line(210, 10, 210, 253);

  // Horizontal divider between cadastre and aerial
  doc.line(215, 163, 410, 163);

  // ── Title block ─────────────────────────────────────────────────────
  drawTitleBlock(doc, project);

  return { pageCount: 1, label: "Plan de Situation", code: "PC1" };
}

// ─── Title block (dark professional footer) ─────────────────────────────────

function drawTitleBlock(doc: jsPDF, project: DossierProjectData) {
  const W = 420;

  // Title block background
  doc.setFillColor(26, 26, 46); // #1a1a2e dark navy
  doc.rect(0, 255, W, 42, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");

  // Row 1: Info columns
  const cols = [8, 115, 225, 330];
  const labels = ["ADRESSE", "PARCELLE", "COMMUNE", "AUTORISATION"];
  const values = [
    project.address || "Non renseigné",
    project.parcelIds || "Non renseigné",
    project.municipality || "Non renseigné",
    project.authorizationType === "DP"
      ? "Déclaration Préalable"
      : "Permis de Construire",
  ];

  doc.setFontSize(5.5);
  doc.setTextColor(180, 180, 180);
  cols.forEach((x, i) => {
    doc.text(labels[i], x, 261);
  });

  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  cols.forEach((x, i) => {
    doc.text(values[i], x, 267);
  });

  // Row 2: INDICE | Date | Document name | PCMI number
  doc.setDrawColor(100, 100, 120);
  doc.setLineWidth(0.2);
  doc.line(8, 271, W - 8, 271);

  doc.setFontSize(7);
  doc.setTextColor(180, 180, 180);
  doc.setFont("helvetica", "normal");
  doc.text("INDICE", 8, 277);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text("0", 8, 284);

  // Date
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(180, 180, 180);
  doc.text(formatDateFR(), 30, 277);

  // Document title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text("PLAN DE SITUATION", W / 2, 282, { align: "center" });

  // PCMI number
  doc.setFontSize(14);
  doc.text("PCMI 1", W - 12, 282, { align: "right" });

  // Fine print disclaimer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(4.5);
  doc.setTextColor(120, 120, 140);
  doc.text(
    "Document ne pouvant servir à l'exécution des travaux — Il appartient au maître d'œuvre de réaliser toutes les études techniques nécessaires.",
    8,
    293
  );

  // Bottom-right: generated by
  doc.setFontSize(4);
  doc.text(`Généré par Urbassist — urbassist.com — ${formatDateFR()}`, W - 8, 293, {
    align: "right",
  });
}

// ─── Placeholder ────────────────────────────────────────────────────────────

function drawPlaceholder(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string
) {
  doc.setFillColor(248, 250, 252);
  doc.rect(x, y, w, h, "F");
  doc.setTextColor(...COLORS.MUTED);
  doc.setFontSize(9);
  doc.text(text, x + w / 2, y + h / 2, { align: "center" });
}
