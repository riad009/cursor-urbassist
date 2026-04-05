"use client";

/**
 * PC5.1 — Facades & Elevations — Initial State
 *
 * Professional inline preview: 2 pages, 4 elevation drawings.
 *   Page 1: Élévation Ouest (top) + Élévation Est (bottom)
 *   Page 2: Élévation Nord (top) + Élévation Sud (bottom)
 *
 * Renders entirely from project data — no captured images needed.
 *
 * ARCHITECTURE: Thin wrapper around shared ElevationSVG component.
 * All geometry is computed by elevation-layout.ts (single source of truth).
 */

import React, { useMemo } from "react";
import { ElevationSVG } from "./ElevationSVG";
import {
  computeMultiBuildingLayout,
  DIRECTION_CONFIGS,
  type ViewportConfig,
} from "@/lib/pdf/elevation-layout";
import type { ElevationBuilding, ParcelDims } from "@/lib/pdf/svg-helpers";
import type { MergedMaterials, TerrainProfile } from "@/lib/pdf/extract-project-data";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PC51Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  projectData: Record<string, any> | null;
  projectAddress: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobs: Array<Record<string, any>>;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SVG_VIEWPORT: ViewportConfig = {
  w: 800,
  h: 280,
  marginL: 65,
  marginR: 65,
  groundRatio: 0.72,
};

const HEADER_COLORS = {
  EXIST: "#6B21A8",
  FOOTER: "#1a1a2e",
};

// ─── Page Config ────────────────────────────────────────────────────────────

const PAGE_PAIRS: [number, number][] = [
  [0, 1], // Page 1: Ouest + Est
  [2, 3], // Page 2: Nord + Sud
];

// ─── Data Extraction (client-side) ──────────────────────────────────────────

function extractClientData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  projectData: Record<string, any> | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobs: Array<Record<string, any>>,
): {
  parcel: ParcelDims;
  initialBuildings: ElevationBuilding[];
  ngf: number;
  materials: MergedMaterials;
  terrain: TerrainProfile;
  setbacks: { front?: number | null; side?: number | null; rear?: number | null };
} {
  // ── Parcel ──
  const parcel = extractParcelDims(projectData);

  // ── Buildings (initial state: isExisting === true only) ──
  const initialBuildings = extractInitialBuildings(projectData, jobs);

  // ── NGF ──
  const ngf = extractNGF(projectData);

  // ── Materials ──
  const materials = extractMaterials(projectData);

  // ── Terrain ──
  const terrain = extractTerrain(projectData, ngf);

  // ── Setbacks ──
  const setbackData = projectData?.projectDescription?.setbackDistances;
  const setbacks = {
    front: typeof setbackData?.south === "number" ? setbackData.south : null,
    side: typeof setbackData?.east === "number" ? setbackData.east : null,
    rear: typeof setbackData?.north === "number" ? setbackData.north : null,
  };

  return { parcel, initialBuildings, ngf, materials, terrain, setbacks };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractParcelDims(projectData: Record<string, any> | null): ParcelDims {
  if (projectData?.parcelGeometry) {
    try {
      const geo = JSON.parse(projectData.parcelGeometry as string);
      const coords = extractCoords(geo);
      if (coords.length > 1) {
        const lngs = coords.map((c: number[]) => c[0]);
        const lats = coords.map((c: number[]) => c[1]);
        const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
        const widthM = (Math.max(...lngs) - Math.min(...lngs)) * 111320 * Math.cos((midLat * Math.PI) / 180);
        const depthM = (Math.max(...lats) - Math.min(...lats)) * 111320;
        if (widthM > 1 && depthM > 1) {
          return { widthM: Math.round(widthM * 10) / 10, depthM: Math.round(depthM * 10) / 10 };
        }
      }
    } catch { /* fallthrough */ }
  }
  const area = projectData?.parcelArea || 500;
  const side = Math.sqrt(area * 1.3);
  return { widthM: Math.round(side * 10) / 10, depthM: Math.round((area / side) * 10) / 10 };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCoords(geoJson: any): number[][] {
  if (!geoJson) return [];
  if (geoJson.type === "FeatureCollection") return (geoJson.features || []).flatMap((f: unknown) => extractCoords(f));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((geoJson as any).type === "Feature") return extractCoords((geoJson as any).geometry);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((geoJson as any).type === "Polygon") return ((geoJson as any).coordinates?.[0] || []) as number[][];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((geoJson as any).type === "MultiPolygon") return ((geoJson as any).coordinates || []).flatMap((poly: number[][][]) => poly[0] || []);
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractNGF(projectData: Record<string, any> | null): number {
  try {
    const terrain = projectData?.terrainData;
    if (!terrain) return 0;
    const td = terrain.elevationPoints;
    if (Array.isArray(td) && td.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const elev = td.find((p: any) => typeof p.z === "number" || typeof p.elevation === "number");
      if (elev) {
        const val = typeof elev.z === "number" ? elev.z : Number(elev.elevation);
        if (val > -9999) return Math.round(val * 100) / 100;
      }
    }
    if (terrain.stats && typeof terrain.stats.mean === "number" && terrain.stats.mean > -9999) {
      return Math.round(terrain.stats.mean * 100) / 100;
    }
    if (td && typeof td === "object" && !Array.isArray(td)) {
      if (typeof td.averageElevation === "number") return Math.round(td.averageElevation * 100) / 100;
      if (typeof td.minElevation === "number") return Math.round(td.minElevation * 100) / 100;
    }
  } catch { /* fallthrough */ }
  return 0;
}

function extractInitialBuildings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  projectData: Record<string, any> | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobs: Array<Record<string, any>>,
): ElevationBuilding[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b3dRaw = projectData?.sitePlanData?.building3D as Record<string, any> | null;
  const buildings = Array.isArray(b3dRaw?.buildings) ? b3dRaw!.buildings : [];

  // Filter for isExisting === true
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingBuildings = buildings.filter((b: any) => b.isExisting === true);

  if (existingBuildings.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return existingBuildings.map((b: Record<string, any>) => {
      const wallH = Number(b.wallHeights?.ground) || Number(b.wallHeight) || 2.5;
      const ridgeH = Number(b.ridgeHeight) || (wallH > 0 ? wallH + 0.7 : 3.2);
      return {
        width: Number(b.width) || 8,
        depth: Number(b.depth) || 6,
        wallHeight: wallH,
        ridgeHeight: ridgeH,
        roofType: String(b.roof?.type || b.roofType || "gable"),
        roofPitch: Number(b.roof?.pitch || b.roofPitch) || 30,
        roofMaterial: String(b.roof?.material || b.materials?.roof || "Tuiles"),
        roofColor: String(b.roofColor || ""),
        wallMaterial: String(b.materials?.walls || b.wallMaterial || "Enduit"),
        wallColor: String(b.wallColor || ""),
        name: String(b.name || "Maison existante"),
        siteX: 0,
        siteY: 0,
        isExisting: true,
        buildingId: String(b.id || ""),
      } as ElevationBuilding;
    });
  }

  // Fallback: no buildings explicitly marked existing.
  // For new-construction projects, return empty → shows "Terrain vierge".
  // For existing-building projects, synthesize from legacy data.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingData = projectData?.existingBuildingsData as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing: Record<string, any> | null = Array.isArray(existingData) ? existingData[0] : existingData || null;

  if (!existing && (buildings.length === 0)) {
    // Pure new construction — PC5.1 shows empty plot
    return [];
  }

  // Synthesize from legacy existing building data or first building3D entry
  const mainJob = jobs[0] || {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b3d: Record<string, any> | null = buildings[0] || null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mats = (projectData?.projectDescription?.materials || {}) as Record<string, any>;

  const width = Number(existing?.width) || Number(b3d?.width) || (mainJob?.existingFootprint ? Math.sqrt(Number(mainJob.existingFootprint)) : 0) || 8;
  const depth = Number(existing?.depth) || Number(b3d?.depth) || width * 0.75 || 6;
  const wallH = Number(existing?.wallHeight) || Number(b3d?.wallHeights?.ground) || Number(b3d?.wallHeight) || Number(mainJob?.wallHeight) || 2.5;

  return [{
    width, depth, wallHeight: wallH,
    ridgeHeight: Number(existing?.ridgeHeight) || Number(b3d?.ridgeHeight) || (wallH > 0 ? wallH + 0.7 : 3.2),
    roofType: String(existing?.roofType || b3d?.roof?.type || b3d?.roofType || "gable"),
    roofPitch: Number(existing?.roofPitch || b3d?.roof?.pitch || b3d?.roofPitch || 30),
    wallColor: String(existing?.wallColor || b3d?.wallColor || mats?.wallColor || ""),
    roofColor: String(existing?.roofColor || b3d?.roofColor || mats?.roofColor || ""),
    wallMaterial: String(existing?.wallMaterial || b3d?.materials?.walls || mats?.wallMaterial || "Enduit"),
    roofMaterial: String(existing?.roofMaterial || b3d?.roof?.material || mats?.roofCovering || "Tuiles"),
    name: "Maison existante",
    siteX: 0,
    siteY: 0,
    isExisting: true,
  }];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractMaterials(projectData: Record<string, any> | null): MergedMaterials {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mats = (projectData?.projectDescription?.materials || {}) as Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b3dRaw = projectData?.sitePlanData?.building3D as Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b3d: Record<string, any> | null = Array.isArray(b3dRaw?.buildings) && b3dRaw!.buildings.length > 0 ? b3dRaw!.buildings[0] : b3dRaw;
  const b3dMats = (b3d?.materials || {}) as Record<string, string | undefined>;
  const b3dRoof = (b3d?.roof || {}) as Record<string, string | number | undefined>;

  const pick = (...sources: Array<string | number | undefined | null>): string => {
    for (const s of sources) { if (s != null && String(s).trim()) return String(s).trim(); }
    return "";
  };

  const wallMaterial = pick(b3dMats.walls, mats.wallMaterial, mats.matExtMaterial);
  const roofMaterial = pick(b3dRoof.material as string, b3dMats.roof, mats.roofMaterial, mats.roofCovering);
  return {
    wallMaterial: wallMaterial || "À confirmer",
    wallColor: pick(mats.wallColor, mats.matExtColor, b3d?.wallColor),
    roofMaterial: roofMaterial || "À confirmer",
    roofCovering: pick(mats.roofCovering, b3dRoof.material as string),
    roofColor: pick(mats.roofColor, b3d?.roofColor as string),
    roofRAL: pick(mats.roofPan1RAL),
    joineryMaterial: pick(mats.joineryMaterial),
    trimColor: pick(mats.trimColor),
    gutterMaterial: pick(mats.gutterMaterial),
    existingFacade: pick(mats.existingFacade),
    structureMaterial: pick(mats.structureMaterial),
    hasRealData: !!(wallMaterial || roofMaterial),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTerrain(projectData: Record<string, any> | null, ngf: number): TerrainProfile {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const td = projectData?.terrainData as Record<string, any> | null;
  if (!td) return { points: [{ x: 0, elevation: ngf }, { x: 30, elevation: ngf }], slopeDeg: 0, minElev: ngf, maxElev: ngf, hasRealData: false };

  const profiles = td.profiles;
  if (Array.isArray(profiles) && profiles.length > 0) {
    const pts = Array.isArray(profiles[0]?.points) ? profiles[0].points : [];
    if (pts.length >= 2) {
      const mapped = pts.map((p: Record<string, number>, i: number) => ({
        x: typeof p.distance === "number" ? p.distance : i * 2,
        elevation: typeof p.elevation === "number" ? p.elevation : typeof p.z === "number" ? p.z : 0,
      }));
      const elevs = mapped.map((p: { elevation: number }) => p.elevation);
      const minE = Math.min(...elevs);
      const maxE = Math.max(...elevs);
      const dx = mapped[mapped.length - 1].x - mapped[0].x;
      const dy = maxE - minE;
      return { points: mapped, slopeDeg: dx > 0 ? Math.atan2(dy, dx) * (180 / Math.PI) : 0, minElev: minE, maxElev: maxE, hasRealData: true };
    }
  }
  return { points: [{ x: 0, elevation: ngf }, { x: 30, elevation: ngf }], slopeDeg: 0, minElev: ngf, maxElev: ngf, hasRealData: false };
}

// ─── Date Helper ────────────────────────────────────────────────────────────

function formatDateFR(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function PC51InlinePreview({ projectData, projectAddress, jobs }: PC51Props) {
  const { parcel, initialBuildings, ngf, materials, terrain, setbacks } = useMemo(
    () => extractClientData(projectData, jobs),
    [projectData, jobs],
  );

  const parcelRef = projectData?.parcelIds || "—";
  const date = formatDateFR();

  return (
    <div className="bg-white space-y-6">
      {PAGE_PAIRS.map(([topIdx, bottomIdx], pageIdx) => {
        const topLayout = computeMultiBuildingLayout(
          parcel, initialBuildings, ngf, materials,
          DIRECTION_CONFIGS[topIdx], "initiale", SVG_VIEWPORT, terrain, setbacks,
        );
        const bottomLayout = computeMultiBuildingLayout(
          parcel, initialBuildings, ngf, materials,
          DIRECTION_CONFIGS[bottomIdx], "initiale", SVG_VIEWPORT, terrain, setbacks,
        );

        return (
          <div key={pageIdx} className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
            {/* Page header */}
            <div className="px-4 py-2 text-white flex justify-between items-center" style={{ backgroundColor: HEADER_COLORS.EXIST }}>
              <div>
                <div className="font-bold text-sm">PC5.1 — FAÇADES ET TOITURES EXISTANTES</div>
                <div className="text-xs opacity-80">Échelle 1/100</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-black/30 rounded px-2 py-1 text-center">
                  <div className="text-[10px] opacity-70">ECHELLE</div>
                  <div className="text-lg font-bold leading-none">1/100</div>
                  <div className="text-[8px] opacity-60">ème</div>
                </div>
                <div className="text-xs">Page {pageIdx + 1}/2</div>
              </div>
            </div>

            {/* Elevation panels */}
            <div className="p-3 space-y-3">
              {/* Section label */}
              <div className="bg-slate-50 px-3 py-1.5 rounded-t">
                <span className="text-sm font-bold text-slate-700">{topLayout.direction}</span>
              </div>
              <ElevationSVG layout={topLayout} panelId={`p${pageIdx}-top`} />

              <div className="bg-slate-50 px-3 py-1.5 rounded-t">
                <span className="text-sm font-bold text-slate-700">{bottomLayout.direction}</span>
              </div>
              <ElevationSVG layout={bottomLayout} panelId={`p${pageIdx}-bot`} />
            </div>

            {/* Disclaimer */}
            <div className="px-3 pb-1">
              <p className="text-[9px] text-gray-400 text-center leading-tight">
                Document ne pouvant servir à l&apos;exécution des travaux - Il appartient au maître d&apos;œuvre de
                réaliser toutes les études et les contrôles nécessaires.
              </p>
            </div>

            {/* Footer */}
            <div className="px-4 py-2 text-white text-xs flex justify-between" style={{ backgroundColor: HEADER_COLORS.FOOTER }}>
              <div>
                <span className="font-bold">PCMI 5.1</span> — FAÇADES ET TOITURES EXISTANTES
              </div>
              <div className="text-right space-x-4">
                {projectAddress && <span>{projectAddress}</span>}
                <span>Parcelle: {parcelRef}</span>
                <span>Échelle: 1/100</span>
                <span>{date}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
