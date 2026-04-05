/**
 * SVG Helper Utilities for PC3/PC5 Technical Drawings
 *
 * Pure-function SVG string generators for professional French
 * building permit cross-section and elevation drawings.
 * No DOM dependency — works server-side and client-side.
 */

import { DossierProjectData, JobEntry, MaterialsData } from "./types";

// ─── Constants ─────────────────────────────────────────────────────────────

/** A3 landscape at 96 dpi: 420mm × 297mm → 1587×1123 px */
export const SVG_VP = { W: 1587, H: 1123 };

/** Drawing area insets */
export const SVG_INSET = { L: 50, R: 50, T: 50, B: 120 };

/** Scale: 1:100 → 1m real = 3.78 px in SVG (1587px = 420mm paper, 1mm = 100mm real) */
export const SCALE_PX_PER_M = 1587 / 420 * 10; // ≈ 37.8

/** Colors */
export const C = {
  BOUNDARY: "#DC0000",
  GROUND: "#000000",
  WALLS: "#F5F0DC",
  WALLS_STROKE: "#333333",
  ROOF: "#555555",
  ROOF_STROKE: "#333333",
  HATCH: "#333333",
  DIM_BOX: "#1E3A8A",
  DIM_TEXT: "#FFFFFF",
  TN_MARKER: "#F97316",
  TITLE_BG: "#1a1a2e",
  TITLE_TEXT: "#FFFFFF",
  SCALE_BG: "#1a1a1a",
  LABEL_MUTED: "#64748b",
};

// ─── Building Data Extraction ──────────────────────────────────────────────

export interface BuildingDims {
  width: number;        // meters (E-W dimension)
  depth: number;        // meters (N-S dimension)
  wallHeight: number;   // meters
  ridgeHeight: number;  // meters
  roofType: string;     // 'gable' | 'flat' | 'hip' | 'pitched'
  roofPitch: number;    // degrees
  roofMaterial: string;
  roofColor: string;
  wallMaterial: string;
  wallColor: string;
  name?: string;        // building label for annotations
}

/**
 * Extract building dimensions from project data with sensible defaults.
 *
 * The 2D editor saves building3D as `{ buildings: [BuildingDetail, ...] }`.
 * Each BuildingDetail has nested objects:
 *   wallHeights: { ground, first, second }
 *   roof: { type, pitch, overhang, material }
 *   materials: { walls, roof, facade }
 *
 * We unwrap buildings[0] and map nested paths to flat BuildingDims.
 * Falls back to projectDescription.jobs[0], then hardcoded defaults.
 */
export function getBuildingData(project: DossierProjectData): BuildingDims {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b3dRaw = project.sitePlanData?.building3D as Record<string, any> | null;

  // Unwrap the buildings array wrapper — editor stores { buildings: [...] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b3d: Record<string, any> | null =
    Array.isArray(b3dRaw?.buildings) && b3dRaw!.buildings.length > 0
      ? b3dRaw!.buildings[0]
      : b3dRaw;

  const jobs = (project.projectDescription?.jobs || []) as unknown as Array<Record<string, unknown>>;
  const mats = (project.projectDescription?.materials || {}) as Record<string, unknown>;
  const mainJob = jobs[0] || {};

  // wallHeights is { ground, first, second } — extract ground floor height
  const wallH =
    Number(b3d?.wallHeights?.ground) ||
    Number(b3d?.wallHeight) ||
    Number(mainJob.wallHeight) ||
    2.5;

  // ridgeHeight: prefer stored value, else compute from wallHeight + 0.7m rise
  const ridgeH =
    Number(b3d?.ridgeHeight) ||
    (Number(b3d?.wallHeights?.ground) > 0 ? Number(b3d?.wallHeights?.ground) + 0.7 : 0) ||
    Number(mainJob.ridgeHeight) ||
    3.2;

  // Post-process: enforce invariants
  const result: BuildingDims = {
    width:
      Number(b3d?.width) ||
      Number(mainJob.footprint ? Math.sqrt(Number(mainJob.footprint)) : 0) ||
      8,
    depth:
      Number(b3d?.depth) ||
      Number(mainJob.footprint ? Math.sqrt(Number(mainJob.footprint)) * 0.75 : 0) ||
      6,
    wallHeight: wallH,
    ridgeHeight: ridgeH,

    // roof is nested: roof.type, roof.pitch
    roofType: String(b3d?.roof?.type || b3d?.roofType || mainJob.roofType || "gable"),
    roofPitch: Number(b3d?.roof?.pitch || b3d?.roofPitch) || Number(mainJob.roofPitch) || 30,

    // materials is nested: materials.walls, roof.material
    roofMaterial: String(
      b3d?.roof?.material ||
      b3d?.materials?.roof ||
      b3d?.roofMaterial ||
      (mats as Record<string, string>)?.roofCovering ||
      (mats as Record<string, string>)?.roofMaterial ||
      "Tuiles"
    ),
    roofColor: String(b3d?.roofColor || (mats as Record<string, string>)?.roofColor || ""),
    wallMaterial: String(
      b3d?.materials?.walls ||
      b3d?.wallMaterial ||
      (mats as Record<string, string>)?.wallMaterial ||
      (mats as Record<string, string>)?.matExtMaterial ||
      "Enduit"
    ),
    wallColor: String(b3d?.wallColor || (mats as Record<string, string>)?.wallColor || (mats as Record<string, string>)?.matExtColor || ""),
    name: String(b3d?.name || "Construction projetée"),
  };

  // Enforce: ridgeHeight must always exceed wallHeight
  if (result.ridgeHeight <= result.wallHeight) {
    result.ridgeHeight = result.wallHeight + 0.7;
  }

  // Enforce minimum dimensions (avoid 0-width/height buildings)
  if (result.width < 1) result.width = 8;
  if (result.depth < 1) result.depth = 6;
  if (result.wallHeight < 1) result.wallHeight = 2.5;

  return result;
}

// ─── Parcel Dimensions ─────────────────────────────────────────────────────

export interface ParcelDims {
  widthM: number;  // East-West span in meters
  depthM: number;  // North-South span in meters
}

/** Extract real-world parcel dimensions from GeoJSON geometry */
export function getParcelDimensions(geoJsonStr: string | null, parcelArea: number | null): ParcelDims {
  if (geoJsonStr) {
    try {
      const geo = JSON.parse(geoJsonStr);
      const coords = extractAllCoords(geo);
      if (coords.length > 0) {
        const lngs = coords.map((c: number[]) => c[0]);
        const lats = coords.map((c: number[]) => c[1]);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const midLat = (minLat + maxLat) / 2;
        const widthM = (maxLng - minLng) * 111320 * Math.cos(midLat * Math.PI / 180);
        const depthM = (maxLat - minLat) * 111320;
        if (widthM > 1 && depthM > 1) {
          return { widthM: Math.round(widthM * 10) / 10, depthM: Math.round(depthM * 10) / 10 };
        }
      }
    } catch { /* falls through to default */ }
  }
  // Fallback: estimate from parcel area (assume ~1.3:1 ratio)
  const area = parcelArea || 500;
  const side = Math.sqrt(area * 1.3);
  return { widthM: Math.round(side * 10) / 10, depthM: Math.round(area / side * 10) / 10 };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractAllCoords(geoJson: any): number[][] {
  if (!geoJson) return [];
  if (geoJson.type === "FeatureCollection") {
    return (geoJson.features || []).flatMap((f: Record<string, unknown>) => extractAllCoords(f));
  }
  if (geoJson.type === "Feature") return extractAllCoords(geoJson.geometry);
  if (geoJson.type === "Polygon") {
    return (geoJson.coordinates?.[0] || []) as number[][];
  }
  if (geoJson.type === "MultiPolygon") {
    return (geoJson.coordinates || []).flatMap((poly: number[][][]) => poly[0] || []);
  }
  if (geoJson.coordinates) return [geoJson.coordinates as number[]];
  return [];
}

// ─── NGF Values ────────────────────────────────────────────────────────────

/** Get NGF altitude from terrain data */
export function getNGFValue(project: DossierProjectData): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const terrain = project.terrainData as Record<string, any> | null;
  if (!terrain) return 0;

  // Priority 1: elevationPoints array — IGN API stores as { z } not { elevation }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const td = terrain.elevationPoints as any;
  if (Array.isArray(td) && td.length > 0) {
    // Check both field names: z (IGN RGE Alti), elevation (legacy)
    const elev = td.find((p: Record<string, unknown>) =>
      typeof p.z === "number" || typeof p.elevation === "number"
    );
    if (elev) {
      const val = typeof elev.z === "number" ? elev.z : Number(elev.elevation);
      if (val > -9999) return Math.round(val * 100) / 100;
    }
  }

  // Priority 2: stats object from terrain-elevation API response
  if (typeof terrain.stats === "object" && terrain.stats !== null) {
    if (typeof terrain.stats.mean === "number" && terrain.stats.mean > -9999)
      return Math.round(terrain.stats.mean * 100) / 100;
    if (typeof terrain.stats.min === "number" && terrain.stats.min > -9999)
      return Math.round(terrain.stats.min * 100) / 100;
  }

  // Priority 3: elevationPoints as object (non-array)
  if (typeof td === "object" && td !== null && !Array.isArray(td)) {
    if (typeof td.averageElevation === "number") return Math.round(td.averageElevation * 100) / 100;
    if (typeof td.minElevation === "number") return Math.round(td.minElevation * 100) / 100;
  }

  // No terrain data available — return 0 instead of hardcoded Paris value
  return 0;
}

// ─── Reusable SVG Fragments ────────────────────────────────────────────────

/** SVG defs: hatch pattern for underground */
export function svgHatchDefs(id = "hatch"): string {
  return `<defs>
    <pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="8" stroke="${C.HATCH}" stroke-width="1.5"/>
    </pattern>
  </defs>`;
}

/** Scale badge SVG — top-right corner */
export function svgScaleBadge(x: number, y: number, scale = "1/100"): string {
  return `<g transform="translate(${x},${y})">
    <rect x="0" y="0" width="92" height="62" rx="4" fill="${C.SCALE_BG}"/>
    <text x="46" y="18" text-anchor="middle" fill="white" font-size="10" font-family="Helvetica,Arial,sans-serif">ECHELLE</text>
    <text x="46" y="42" text-anchor="middle" fill="white" font-size="24" font-weight="bold" font-family="Helvetica,Arial,sans-serif">${scale}</text>
    <text x="46" y="56" text-anchor="middle" fill="white" font-size="9" font-family="Helvetica,Arial,sans-serif">ème</text>
  </g>`;
}

/** Title block strip at bottom */
export function svgTitleBlock(
  docTitle: string,
  pcmiNumber: string,
  y: number,
  width: number,
  date?: string
): string {
  const d = date || new Date().toLocaleDateString("fr-FR");
  return `<rect x="0" y="${y}" width="${width}" height="80" fill="${C.TITLE_BG}"/>
    <text x="20" y="${y + 30}" fill="${C.TITLE_TEXT}" font-size="13" font-weight="bold" font-family="Helvetica,Arial,sans-serif">INDICE 0</text>
    <text x="120" y="${y + 30}" fill="${C.TITLE_TEXT}" font-size="11" font-family="Helvetica,Arial,sans-serif">${d}</text>
    <text x="${width / 2}" y="${y + 35}" fill="${C.TITLE_TEXT}" font-size="20" font-weight="bold" text-anchor="middle" font-family="Helvetica,Arial,sans-serif">${docTitle}</text>
    <text x="${width - 40}" y="${y + 35}" fill="${C.TITLE_TEXT}" font-size="18" font-weight="bold" text-anchor="end" font-family="Helvetica,Arial,sans-serif">${pcmiNumber}</text>`;
}

/** Red dashed property boundary line with rotated label */
export function svgPropertyBoundary(x: number, topY: number, bottomY: number, labelSide: "left" | "right" = "left"): string {
  const textX = labelSide === "left" ? x - 8 : x + 8;
  return `<line x1="${x}" y1="${topY}" x2="${x}" y2="${bottomY}" stroke="${C.BOUNDARY}" stroke-width="2" stroke-dasharray="8,4"/>
    <text transform="rotate(-90, ${textX}, ${(topY + bottomY) / 2})" x="${textX}" y="${(topY + bottomY) / 2}" font-size="11" fill="${C.BOUNDARY}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif">Limite de propriété</text>`;
}

/** Hatched underground area below ground line */
export function svgUnderground(
  x: number,
  groundY: number,
  width: number,
  depth: number,
  hatchId = "hatch"
): string {
  return `<rect x="${x}" y="${groundY}" width="${width}" height="${depth}" fill="url(#${hatchId})"/>`;
}

/** Ground line (TN) */
export function svgGroundLine(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.GROUND}" stroke-width="2.5"/>`;
}

/** TN/TF label marker */
export function svgTNLabel(x: number, y: number, ngfValue: number, labelParts?: string): string {
  const label = labelParts || `TN=TF / +${ngfValue.toFixed(2)} NGF`;
  return `<rect x="${x - 4}" y="${y - 4}" width="8" height="8" fill="${C.TN_MARKER}" rx="1"/>
    <text x="${x + 12}" y="${y + 4}" font-size="10" fill="${C.GROUND}" font-family="Helvetica,Arial,sans-serif">${label}</text>`;
}

/** Blue dimension annotation box */
export function svgDimBox(x: number, y: number, label: string): string {
  const textLen = label.length * 6.5 + 12;
  return `<rect x="${x - textLen / 2}" y="${y - 10}" width="${textLen}" height="20" rx="3" fill="${C.DIM_BOX}"/>
    <text x="${x}" y="${y + 4}" text-anchor="middle" fill="${C.DIM_TEXT}" font-size="11" font-weight="bold" font-family="Helvetica,Arial,sans-serif">${label}</text>`;
}

/** Dimension arrow line with ticks */
export function svgDimArrow(x1: number, y: number, x2: number, label: string): string {
  const midX = (x1 + x2) / 2;
  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${C.DIM_BOX}" stroke-width="1" marker-start="url(#arrowL)" marker-end="url(#arrowR)"/>
    <text x="${midX}" y="${y - 5}" text-anchor="middle" fill="${C.DIM_BOX}" font-size="10" font-family="Helvetica,Arial,sans-serif">${label}</text>`;
}

/** Arrow marker defs for dimension lines */
export function svgArrowDefs(): string {
  return `<marker id="arrowL" markerWidth="6" markerHeight="6" refX="0" refY="3" orient="auto">
      <path d="M6,0 L0,3 L6,6" fill="none" stroke="${C.DIM_BOX}" stroke-width="1"/>
    </marker>
    <marker id="arrowR" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6" fill="none" stroke="${C.DIM_BOX}" stroke-width="1"/>
    </marker>`;
}

/** Building profile (walls + roof) used in PC3 cross-section and PC5.2 elevations */
export function svgBuildingProfile(
  x: number,
  groundY: number,
  buildingWidthPx: number,
  wallHeightPx: number,
  ridgeHeightPx: number,
  roofType: string
): string {
  const wallTop = groundY - wallHeightPx;
  const ridgeTop = groundY - ridgeHeightPx;
  const centerX = x + buildingWidthPx / 2;

  // Walls
  let svg = `<rect x="${x}" y="${wallTop}" width="${buildingWidthPx}" height="${wallHeightPx}" fill="${C.WALLS}" stroke="${C.WALLS_STROKE}" stroke-width="2"/>`;

  // Roof
  if (roofType === "flat") {
    svg += `<rect x="${x - 3}" y="${wallTop - 8}" width="${buildingWidthPx + 6}" height="8" fill="${C.ROOF}" stroke="${C.ROOF_STROKE}" stroke-width="1.5"/>`;
  } else if (roofType === "hip") {
    const inset = buildingWidthPx * 0.2;
    svg += `<polygon points="${x - 3},${wallTop} ${x + inset},${ridgeTop} ${x + buildingWidthPx - inset},${ridgeTop} ${x + buildingWidthPx + 3},${wallTop}" fill="${C.ROOF}" stroke="${C.ROOF_STROKE}" stroke-width="1.5"/>`;
  } else {
    // gable / pitched (default)
    svg += `<polygon points="${x - 3},${wallTop} ${centerX},${ridgeTop} ${x + buildingWidthPx + 3},${wallTop}" fill="${C.ROOF}" stroke="${C.ROOF_STROKE}" stroke-width="1.5"/>`;
  }

  return svg;
}

// ─── Format helpers ────────────────────────────────────────────────────────

export function formatDateFR(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Surface areas data extraction */
export interface SurfaceAreas {
  parcelArea: number;
  footprintExisting: number;
  footprintProjected: number;
  footprintHabitation: number;
  greenArea: number;
  gravelArea: number;
  semiPermeableArea: number;
  impermeableArea: number;
  totalFreeSpace: number;
  parkingSpaces: number;
  parkingSpacesExisting: number;
  parkingSpacesProject: number;
  pleineTerreTotal: number;
  coefficientEmpriseExisting: number;
  coefficientEmpriseProject: number;
}

export function getSurfaceAreas(project: DossierProjectData): SurfaceAreas {
  const parcelArea = project.parcelArea || 500;
  const fpExist = project.sitePlanData?.footprintExisting || 0;
  const fpProj = project.sitePlanData?.footprintProjected || 0;
  const desc = project.projectDescription;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sa = project.sitePlanData?.surfaceAreas as Record<string, any> | null;

  const greenArea = Number(sa?.greenArea) || Number(sa?.vegetalizedArea) || Math.round(parcelArea * 0.6);
  const semiPerm = Number(sa?.semiPermeableArea) || Number(sa?.gravelArea) || Math.round(parcelArea * 0.1);
  const imperm = Number(sa?.impermeableArea) || Math.round(parcelArea * 0.1);
  const habFP = Number(sa?.footprintHabitation) || fpExist;
  const totalFP_exist = fpExist;
  const totalFP_proj = fpProj || fpExist;
  const pleineTerreExist = greenArea + semiPerm;
  const totalFree = Number(sa?.totalFreeSpace) || Math.max(0, parcelArea - totalFP_exist);
  const parkingExist = Number(desc?.parkingSpacesExisting) || Number(sa?.parkingSpaces) || 1;
  const parkingProj = Number(desc?.parkingSpacesProject) || Number(sa?.parkingSpaces) || parkingExist;

  return {
    parcelArea,
    footprintExisting: totalFP_exist,
    footprintProjected: totalFP_proj,
    footprintHabitation: habFP,
    greenArea,
    gravelArea: semiPerm,
    semiPermeableArea: semiPerm,
    impermeableArea: imperm,
    totalFreeSpace: totalFree,
    parkingSpaces: parkingProj,
    parkingSpacesExisting: parkingExist,
    parkingSpacesProject: parkingProj,
    pleineTerreTotal: pleineTerreExist,
    coefficientEmpriseExisting: parcelArea > 0 ? (totalFP_exist / parcelArea) * 100 : 0,
    coefficientEmpriseProject: parcelArea > 0 ? (totalFP_proj / parcelArea) * 100 : 0,
  };
}
