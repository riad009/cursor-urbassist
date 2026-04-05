"use client";

/**
 * PC5.2 — Facades & Elevations — Projected State
 *
 * Professional inline preview: 2 pages, 4 elevation drawings.
 *   Page 1: Élévation Ouest projetée (top) + Élévation Est projetée (bottom)
 *   Page 2: Élévation Nord projetée (top) + Élévation Sud projetée (bottom)
 *
 * Always shows the proposed building, unlike PC5.1 which may show empty plot.
 * Renders entirely from project data — no captured images needed.
 * Matches the PDF output from lib/pdf/pc5-generator.ts.
 */

import React, { useMemo } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PC52Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  projectData: Record<string, any> | null;
  projectAddress: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobs: Array<Record<string, any>>;
}

interface ParcelDims {
  widthM: number;
  depthM: number;
}

interface BuildingDims {
  width: number;
  depth: number;
  wallHeight: number;
  ridgeHeight: number;
  roofType: string;
  wallColor: string;
  roofColor: string;
  wallMaterial: string;
  roofMaterial: string;
  roofPitch: number;
}

interface ElevationConfig {
  label: string;
  facadeDimension: "width" | "depth";
}

// ─── Constants ──────────────────────────────────────────────────────────────

const COLORS = {
  HEADER_BG: "#9F1239",    // rose-800
  FOOTER_BG: "#1a1a2e",
  BOUNDARY: "#DC0000",
  GROUND: "#000000",
  HATCH: "#555555",
  TN_MARKER: "#F97316",
  TF_MARKER: "#228B22",
  WALLS_DEFAULT: "#F5F0DC",
  ROOF_DEFAULT: "#64594E",
  ROOF_STROKE: "#3C3530",
  WALLS_STROKE: "#333333",
  MUTED: "#94a3b8",
  DIM_BOX: "#1E3A8A",
  SCALE_BG: "#1a1a1a",
  GRASS: "#78B450",
  WINDOW: "#b0d8f0",
  WINDOW_FRAME: "#334155",
  DOOR: "#6E4628",
  DOOR_FRAME: "#3A2010",
  CHIMNEY: "#8C7864",
  CHIMNEY_CAP: "#504640",
  MAT_LEADER: "#1E3A8A",
  PROJ_LABEL: "#9F1239",
};

const PANEL = {
  VP_W: 800,
  VP_H: 280,
  MARGIN_LEFT: 65,
  MARGIN_RIGHT: 65,
  GROUND_Y_RATIO: 0.72,
};

// ─── Data extraction helpers ────────────────────────────────────────────────

function extractParcelDims(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  projectData: Record<string, any> | null
): ParcelDims {
  if (projectData?.parcelGeometry) {
    try {
      const geo = JSON.parse(projectData.parcelGeometry as string);
      const coords = extractCoords(geo);
      if (coords.length > 1) {
        const lngs = coords.map((c: number[]) => c[0]);
        const lats = coords.map((c: number[]) => c[1]);
        const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
        const widthM =
          (Math.max(...lngs) - Math.min(...lngs)) *
          111320 *
          Math.cos((midLat * Math.PI) / 180);
        const depthM = (Math.max(...lats) - Math.min(...lats)) * 111320;
        if (widthM > 1 && depthM > 1) {
          return {
            widthM: Math.round(widthM * 10) / 10,
            depthM: Math.round(depthM * 10) / 10,
          };
        }
      }
    } catch {
      /* fallthrough */
    }
  }
  const area = projectData?.parcelArea || 500;
  const side = Math.sqrt(area * 1.3);
  return {
    widthM: Math.round(side * 10) / 10,
    depthM: Math.round((area / side) * 10) / 10,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCoords(geoJson: any): number[][] {
  if (!geoJson) return [];
  if (geoJson.type === "FeatureCollection")
    return (geoJson.features || []).flatMap(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (f: any) => extractCoords(f)
    );
  if (geoJson.type === "Feature") return extractCoords(geoJson.geometry);
  if (geoJson.type === "Polygon")
    return (geoJson.coordinates?.[0] || []) as number[][];
  if (geoJson.type === "MultiPolygon")
    return (geoJson.coordinates || []).flatMap(
      (poly: number[][][]) => poly[0] || []
    );
  return [];
}

function extractNGF(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  projectData: Record<string, any> | null
): number {
  try {
    const terrain = projectData?.terrainData;
    if (!terrain) return 0;

    const td = terrain.elevationPoints;
    if (Array.isArray(td) && td.length > 0) {
      // IGN API stores as { z }, legacy as { elevation }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const elev = td.find((p: any) => typeof p.z === "number" || typeof p.elevation === "number");
      if (elev) {
        const val = typeof elev.z === "number" ? elev.z : Number(elev.elevation);
        if (val > -9999) return Math.round(val * 100) / 100;
      }
    }
    // Check stats from terrain-elevation API
    if (terrain.stats && typeof terrain.stats.mean === "number" && terrain.stats.mean > -9999) {
      return Math.round(terrain.stats.mean * 100) / 100;
    }
    if (td && typeof td === "object" && !Array.isArray(td)) {
      if (typeof td.averageElevation === "number")
        return Math.round(td.averageElevation * 100) / 100;
    }
  } catch {
    /* fallthrough */
  }
  return 0;
}

/**
 * Extract building for PC5.2 (projected state).
 * Always returns a building — this is the proposed construction.
 */
function extractBuildingDims(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  projectData: Record<string, any> | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobs: Array<Record<string, any>>
): BuildingDims {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b3dRaw = projectData?.sitePlanData?.building3D as Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b3d: Record<string, any> | null =
    Array.isArray(b3dRaw?.buildings) && b3dRaw!.buildings.length > 0
      ? b3dRaw!.buildings[0]
      : b3dRaw;

  const mainJob = jobs[0] || {};
  const mats = (projectData?.projectDescription?.materials || {}) as Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >;

  const width =
    Number(b3d?.width) ||
    (mainJob?.footprint ? Math.sqrt(Number(mainJob.footprint)) : 0) ||
    8;

  const wallH =
    Number(b3d?.wallHeights?.ground) ||
    Number(b3d?.wallHeight) ||
    Number(mainJob?.wallHeight) ||
    2.5;

  return {
    width,
    depth: Number(b3d?.depth) || width * 0.75,
    wallHeight: wallH,
    ridgeHeight:
      Number(b3d?.ridgeHeight) ||
      (wallH > 0 ? wallH + 0.7 : 3.2),
    roofType: String(b3d?.roof?.type || b3d?.roofType || mainJob?.roofType || "gable"),
    roofPitch: Number(b3d?.roof?.pitch || b3d?.roofPitch || 30),
    wallColor: String(b3d?.wallColor || mats?.wallColor || mats?.matExtColor || ""),
    roofColor: String(b3d?.roofColor || mats?.roofColor || ""),
    wallMaterial: String(
      b3d?.materials?.walls || b3d?.wallMaterial || mats?.wallMaterial || mats?.matExtMaterial || "Enduit"
    ),
    roofMaterial: String(
      b3d?.roof?.material || b3d?.materials?.roof || b3d?.roofMaterial || mats?.roofCovering || mats?.roofMaterial || "Tuiles"
    ),
  };
}

function formatDateFR(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(
    d.getMonth() + 1
  ).padStart(2, "0")}/${d.getFullYear()}`;
}

// ─── SVG Sub-Components ─────────────────────────────────────────────────────

function HatchDefs({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={id} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="5" stroke="#555" strokeWidth="0.6" />
      </pattern>
    </defs>
  );
}

function GrassVegetation({ startX, groundY, width: w }: { startX: number; groundY: number; width: number }) {
  const tufts: React.ReactNode[] = [];
  const count = Math.floor(w / 12);
  for (let i = 0; i < count; i++) {
    const x = startX + i * (w / count) + 3;
    const h = 3 + (i % 3) * 1.2;
    tufts.push(
      <g key={`g-${i}`}>
        <line x1={x} y1={groundY} x2={x - 0.8} y2={groundY - h} stroke={COLORS.GRASS} strokeWidth="0.8" />
        <line x1={x + 2} y1={groundY} x2={x + 2.5} y2={groundY - h * 0.6} stroke={COLORS.GRASS} strokeWidth="0.6" />
        <line x1={x + 4} y1={groundY} x2={x + 3.6} y2={groundY - h * 0.75} stroke={COLORS.GRASS} strokeWidth="0.7" />
      </g>
    );
  }
  return <>{tufts}</>;
}

function RoofTexture({ bX, wallTop, bWidthPx, ridgeTop, centerX }: {
  bX: number; wallTop: number; bWidthPx: number; ridgeTop: number; centerX: number;
}) {
  const roofH = wallTop - ridgeTop;
  const rows = Math.floor(roofH / 6);
  const lines: React.ReactNode[] = [];
  for (let r = 1; r < rows; r++) {
    const t = r / rows;
    const y = ridgeTop + t * roofH;
    const halfW = t * (bWidthPx / 2 + 2);
    lines.push(
      <line key={`rt-${r}`} x1={centerX - halfW} y1={y} x2={centerX + halfW} y2={y} stroke="rgba(255,255,255,0.2)" strokeWidth="0.4" />
    );
  }
  return <>{lines}</>;
}

/**
 * Compute building-centric zoom scale.
 * When the building is very small relative to the plot, we zoom into the
 * building so it fills ~45% of the drawing width.  Property boundaries
 * are clipped to the SVG edges.
 */
function computeScale(
  plotSpan: number,
  facadeLenM: number,
  buildingFacadeLenM: number,
  buildingHeightM: number,
  groundY: number,
) {
  const naturalPxPerM = plotSpan / facadeLenM;
  const naturalBldgPx = buildingFacadeLenM * naturalPxPerM;
  const minBldgPx = plotSpan * 0.35; // building must be ≥35% of viewport
  const idealBldgPx = plotSpan * 0.45; // ideal ~45%

  let pxPerM = naturalPxPerM;
  let isZoomed = false;

  if (naturalBldgPx < minBldgPx && buildingFacadeLenM > 0) {
    // Zoom in so building occupies idealBldgPx
    pxPerM = idealBldgPx / buildingFacadeLenM;
    isZoomed = true;
  }

  // Also ensure wall height is readable (≥ 55px)
  const wallHPx = buildingHeightM * pxPerM;
  const availH = (groundY - 40) * 0.65;
  if (wallHPx < 55 && buildingHeightM > 0) {
    const heightPxPerM = 70 / buildingHeightM; // target 70px wall height
    if (heightPxPerM > pxPerM) {
      pxPerM = Math.min(heightPxPerM, availH / buildingHeightM);
      isZoomed = true;
    }
  }

  // Cap so building doesn't exceed 55% of viewport
  const cappedBldgPx = buildingFacadeLenM * pxPerM;
  if (cappedBldgPx > plotSpan * 0.55) {
    pxPerM = (plotSpan * 0.55) / buildingFacadeLenM;
  }

  return { pxPerM, isZoomed };
}

/** Elevation panel for projected state */
function ElevationPanel({
  config,
  parcel,
  building,
  ngf,
  panelId,
}: {
  config: ElevationConfig;
  parcel: ParcelDims;
  building: BuildingDims;
  ngf: number;
  panelId: string;
}) {
  const { VP_W, VP_H, MARGIN_LEFT, MARGIN_RIGHT, GROUND_Y_RATIO } = PANEL;
  const groundY = VP_H * GROUND_Y_RATIO;
  const hatchBottom = VP_H - 10;
  const hatchDepth = hatchBottom - groundY;
  const leftBXNatural = MARGIN_LEFT;
  const rightBXNatural = VP_W - MARGIN_RIGHT;
  const plotSpan = rightBXNatural - leftBXNatural;
  const facadeLenM = config.facadeDimension === "width" ? parcel.widthM : parcel.depthM;
  const hatchId = `hatch-${panelId}`;

  // Building facade length in meters
  const facadeLen = config.facadeDimension === "width" ? building.width : building.depth;

  // ── Building-centric zoom scaling ──
  const { pxPerM, isZoomed } = computeScale(plotSpan, facadeLenM, facadeLen, building.wallHeight, groundY);

  // If zoomed, property boundaries extend beyond viewport — clamp to edges
  const plotWidthPx = facadeLenM * pxPerM;
  const centerX = (leftBXNatural + rightBXNatural) / 2;
  const leftBX = isZoomed ? Math.max(10, centerX - plotWidthPx / 2) : leftBXNatural;
  const rightBX = isZoomed ? Math.min(VP_W - 10, centerX + plotWidthPx / 2) : rightBXNatural;

  // Building pixel sizes
  const bWidthPx = Math.max(facadeLen * pxPerM, 60);
  const wallHPx = Math.min(Math.max(building.wallHeight * pxPerM, 55), (groundY - 40) * 0.65);
  const ridgeHPx = Math.min(Math.max(building.ridgeHeight * pxPerM, wallHPx + 12), (groundY - 25) * 0.85);
  const bX = centerX - bWidthPx / 2;
  const wallTop = groundY - wallHPx;
  const ridgeTop = groundY - ridgeHPx;

  const winW = Math.min(bWidthPx * 0.08, 20);
  const winH = wallHPx * 0.3;
  const numWin = Math.max(Math.min(Math.floor(bWidthPx / (winW * 3)), 6), 2);
  const winSpacing = bWidthPx / (numWin + 1);
  const doorW = Math.min(bWidthPx * 0.06, 16);
  const doorH = wallHPx * 0.5;

  const roofPoints =
    building.roofType === "flat" ? null
    : building.roofType === "hip"
    ? `${bX - 3},${wallTop} ${bX + bWidthPx * 0.2},${ridgeTop} ${bX + bWidthPx * 0.8},${ridgeTop} ${bX + bWidthPx + 3},${wallTop}`
    : `${bX - 3},${wallTop} ${centerX},${ridgeTop} ${bX + bWidthPx + 3},${wallTop}`;

  const chimX = centerX + bWidthPx * 0.18;
  const chimW = 8, chimH = 14;
  const t = Math.abs(chimX - centerX) / (bWidthPx / 2 + 3);
  const roofYAtChim = ridgeTop + t * (wallTop - ridgeTop);
  const showChimney = building.roofType !== "flat" && roofYAtChim - chimH > 30;

  const matAnnotX = bX + bWidthPx + 55;
  const showAnnotations = matAnnotX < VP_W - 20;

  return (
    <div className="border border-slate-200 rounded overflow-hidden">
      <svg viewBox={`0 0 ${VP_W} ${VP_H}`} className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
        <HatchDefs id={hatchId} />

        {/* Underground */}
        <rect x="0" y={groundY} width={VP_W} height={hatchDepth} fill={`url(#${hatchId})`} />

        {/* Ground line */}
        <line x1="0" y1={groundY} x2={VP_W} y2={groundY} stroke={COLORS.GROUND} strokeWidth="2.5" />
        <GrassVegetation startX={10} groundY={groundY} width={VP_W - 20} />

        {/* Boundaries */}
        {[leftBX, rightBX].map((bx, i) => (
          <line key={i} x1={bx} y1={20} x2={bx} y2={hatchBottom} stroke={COLORS.BOUNDARY} strokeWidth="2" strokeDasharray="10 6" />
        ))}
        <text transform={`rotate(-90, ${leftBX - 10}, ${(20 + groundY) / 2})`} x={leftBX - 10} y={(20 + groundY) / 2} fontSize="9" fill={COLORS.BOUNDARY} fontStyle="italic" fontWeight="bold" textAnchor="middle" fontFamily="Helvetica, Arial, sans-serif">Limite de propriété</text>
        <text transform={`rotate(-90, ${rightBX + 14}, ${(20 + groundY) / 2})`} x={rightBX + 14} y={(20 + groundY) / 2} fontSize="9" fill={COLORS.BOUNDARY} fontStyle="italic" fontWeight="bold" textAnchor="middle" fontFamily="Helvetica, Arial, sans-serif">Limite de propriété</text>

        {/* TN/TF markers */}
        {[leftBX, rightBX].map((bx, i) => (
          <g key={`tn-${i}`}>
            <rect x={bx - 14} y={groundY + 2} width="12" height="10" rx="1.5" fill={COLORS.TN_MARKER} />
            <text x={bx - 8} y={groundY + 9} fontSize="5.5" fill="#fff" textAnchor="middle" fontWeight="bold" fontFamily="Helvetica, Arial, sans-serif">TN</text>
            <rect x={bx + 2} y={groundY + 2} width="12" height="10" rx="1.5" fill={COLORS.TF_MARKER} />
            <text x={bx + 8} y={groundY + 9} fontSize="5.5" fill="#fff" textAnchor="middle" fontWeight="bold" fontFamily="Helvetica, Arial, sans-serif">TF</text>
          </g>
        ))}

        {/* NGF labels */}
        <text x={leftBX + 25} y={groundY + 18} fontSize="6" fill="#555" fontFamily="Helvetica, Arial, sans-serif">+{ngf.toFixed(2)} NGF</text>
        <text x={rightBX - 25} y={groundY + 18} fontSize="6" fill="#555" textAnchor="end" fontFamily="Helvetica, Arial, sans-serif">+{ngf.toFixed(2)} NGF</text>

        {/* Plot width */}
        <line x1={leftBX} y1={16} x2={rightBX} y2={16} stroke={COLORS.GROUND} strokeWidth="0.5" />
        <line x1={leftBX} y1={12} x2={leftBX} y2={20} stroke={COLORS.GROUND} strokeWidth="0.5" />
        <line x1={rightBX} y1={12} x2={rightBX} y2={20} stroke={COLORS.GROUND} strokeWidth="0.5" />
        <rect x={(leftBX + rightBX) / 2 - 28} y={9} width="56" height="14" fill="#fff" stroke={COLORS.GROUND} strokeWidth="0.3" rx="1" />
        <text x={(leftBX + rightBX) / 2} y={19} fontSize="9" fill={COLORS.GROUND} textAnchor="middle" fontWeight="bold" fontFamily="Helvetica, Arial, sans-serif">{facadeLenM.toFixed(1)} m</text>

        {/* ═══ Building ═══ */}
        {/* Walls */}
        <rect x={bX} y={wallTop} width={bWidthPx} height={wallHPx} fill={COLORS.WALLS_DEFAULT} stroke={COLORS.WALLS_STROKE} strokeWidth="1.5" />

        {/* Windows */}
        {Array.from({ length: numWin }).map((_, i) => {
          const wx = bX + (i + 1) * winSpacing - winW / 2;
          if (Math.abs(wx + winW / 2 - centerX) < doorW * 2) return null;
          return (
            <g key={`w-${i}`}>
              <rect x={wx} y={wallTop + wallHPx * 0.2} width={winW} height={winH} fill={COLORS.WINDOW} stroke={COLORS.WINDOW_FRAME} strokeWidth="0.7" />
              <line x1={wx + winW / 2} y1={wallTop + wallHPx * 0.2} x2={wx + winW / 2} y2={wallTop + wallHPx * 0.2 + winH} stroke={COLORS.WINDOW_FRAME} strokeWidth="0.4" />
              <line x1={wx} y1={wallTop + wallHPx * 0.2 + winH / 2} x2={wx + winW} y2={wallTop + wallHPx * 0.2 + winH / 2} stroke={COLORS.WINDOW_FRAME} strokeWidth="0.4" />
              <line x1={wx - 1} y1={wallTop + wallHPx * 0.2 + winH} x2={wx + winW + 1} y2={wallTop + wallHPx * 0.2 + winH} stroke={COLORS.WALLS_STROKE} strokeWidth="0.8" />
            </g>
          );
        })}

        {/* Door */}
        <rect x={centerX - doorW / 2} y={groundY - doorH} width={doorW} height={doorH} fill={COLORS.DOOR} stroke={COLORS.DOOR_FRAME} strokeWidth="0.7" />
        <circle cx={centerX + doorW / 3} cy={groundY - doorH / 2} r="1.5" fill="#c8b060" />

        {/* Roof */}
        {building.roofType === "flat" ? (
          <rect x={bX - 2} y={wallTop - 6} width={bWidthPx + 4} height={6} fill={COLORS.ROOF_DEFAULT} stroke={COLORS.ROOF_STROKE} strokeWidth="1" />
        ) : (
          <>
            <polygon points={roofPoints!} fill={COLORS.ROOF_DEFAULT} stroke={COLORS.ROOF_STROKE} strokeWidth="1.5" />
            <RoofTexture bX={bX} wallTop={wallTop} bWidthPx={bWidthPx} ridgeTop={ridgeTop} centerX={centerX} />
          </>
        )}

        {/* Chimney */}
        {showChimney && (
          <g>
            <rect x={chimX - chimW / 2} y={roofYAtChim - chimH} width={chimW} height={chimH} fill={COLORS.CHIMNEY} stroke={COLORS.WALLS_STROKE} strokeWidth="0.6" />
            <rect x={chimX - chimW / 2 - 1} y={roofYAtChim - chimH - 2} width={chimW + 2} height={2} fill={COLORS.CHIMNEY_CAP} />
          </g>
        )}

        {/* "Construction projetée" label */}
        <rect x={bX + bWidthPx / 2 - 50} y={wallTop + wallHPx * 0.55} width="100" height="14" rx="2" fill={COLORS.PROJ_LABEL} opacity="0.85" />
        <text x={bX + bWidthPx / 2} y={wallTop + wallHPx * 0.55 + 10} fontSize="8" fill="#fff" textAnchor="middle" fontWeight="bold" fontFamily="Helvetica, Arial, sans-serif">
          Construction projetée
        </text>

        {/* Dimensions */}
        <line x1={bX - 18} y1={groundY} x2={bX - 18} y2={wallTop} stroke={COLORS.DIM_BOX} strokeWidth="0.8" />
        <line x1={bX - 21} y1={groundY} x2={bX - 15} y2={groundY} stroke={COLORS.DIM_BOX} strokeWidth="0.8" />
        <line x1={bX - 21} y1={wallTop} x2={bX - 15} y2={wallTop} stroke={COLORS.DIM_BOX} strokeWidth="0.8" />
        <rect x={bX - 52} y={(groundY + wallTop) / 2 - 7} width="30" height="14" rx="2" fill={COLORS.DIM_BOX} />
        <text x={bX - 37} y={(groundY + wallTop) / 2 + 2} fontSize="8" fill="#fff" textAnchor="middle" fontWeight="bold" fontFamily="Helvetica, Arial, sans-serif">{building.wallHeight.toFixed(1)} m</text>

        <line x1={bX + bWidthPx + 18} y1={groundY} x2={bX + bWidthPx + 18} y2={ridgeTop} stroke={COLORS.DIM_BOX} strokeWidth="0.8" />
        <line x1={bX + bWidthPx + 15} y1={groundY} x2={bX + bWidthPx + 21} y2={groundY} stroke={COLORS.DIM_BOX} strokeWidth="0.8" />
        <line x1={bX + bWidthPx + 15} y1={ridgeTop} x2={bX + bWidthPx + 21} y2={ridgeTop} stroke={COLORS.DIM_BOX} strokeWidth="0.8" />
        <rect x={bX + bWidthPx + 23} y={(groundY + ridgeTop) / 2 - 7} width="30" height="14" rx="2" fill={COLORS.DIM_BOX} />
        <text x={bX + bWidthPx + 38} y={(groundY + ridgeTop) / 2 + 2} fontSize="8" fill="#fff" textAnchor="middle" fontWeight="bold" fontFamily="Helvetica, Arial, sans-serif">{building.ridgeHeight.toFixed(1)} m</text>

        {/* Eave + Ridge labels */}
        <text x={bX + bWidthPx + 24} y={wallTop + 3} fontSize="6" fill={COLORS.DIM_BOX} fontFamily="Helvetica, Arial, sans-serif">Égout +{building.wallHeight.toFixed(2)}</text>
        <text x={centerX} y={ridgeTop - 6} fontSize="7" fill="#333" textAnchor="middle" fontFamily="Helvetica, Arial, sans-serif">Faîtage +{building.ridgeHeight.toFixed(2)}</text>

        {/* NGF */}
        <text x={bX - 54} y={wallTop - 2} fontSize="6" fill="#64748b" fontFamily="Helvetica, Arial, sans-serif">+{(ngf + building.wallHeight).toFixed(2)} NGF</text>
        <text x={centerX} y={ridgeTop - 14} fontSize="6" fill="#64748b" textAnchor="middle" fontFamily="Helvetica, Arial, sans-serif">+{(ngf + building.ridgeHeight).toFixed(2)} NGF</text>

        {/* Building width */}
        <line x1={bX} y1={groundY + 10} x2={bX + bWidthPx} y2={groundY + 10} stroke={COLORS.GROUND} strokeWidth="0.5" />
        <line x1={bX} y1={groundY + 7} x2={bX} y2={groundY + 13} stroke={COLORS.GROUND} strokeWidth="0.5" />
        <line x1={bX + bWidthPx} y1={groundY + 7} x2={bX + bWidthPx} y2={groundY + 13} stroke={COLORS.GROUND} strokeWidth="0.5" />
        <rect x={centerX - 24} y={groundY + 5} width="48" height="12" fill="#fff" stroke={COLORS.GROUND} strokeWidth="0.3" rx="1" />
        <text x={centerX} y={groundY + 13} fontSize="8" fill={COLORS.GROUND} textAnchor="middle" fontWeight="bold" fontFamily="Helvetica, Arial, sans-serif">{facadeLen.toFixed(1)} m</text>

        {/* Material annotations */}
        {showAnnotations && (
          <g>
            <line x1={bX + bWidthPx + 2} y1={(wallTop + groundY) / 2} x2={matAnnotX - 5} y2={(wallTop + groundY) / 2} stroke={COLORS.MAT_LEADER} strokeWidth="0.6" />
            <circle cx={bX + bWidthPx + 2} cy={(wallTop + groundY) / 2} r="2" fill={COLORS.MAT_LEADER} />
            <text x={matAnnotX} y={(wallTop + groundY) / 2 - 4} fontSize="7" fill={COLORS.MAT_LEADER} fontFamily="Helvetica, Arial, sans-serif">{building.wallMaterial}</text>
            {building.wallColor && <text x={matAnnotX} y={(wallTop + groundY) / 2 + 6} fontSize="6" fill={COLORS.MAT_LEADER} fontFamily="Helvetica, Arial, sans-serif">couleur {building.wallColor}</text>}

            <line x1={bX + bWidthPx + 2} y1={building.roofType === "flat" ? wallTop - 3 : (wallTop + ridgeTop) / 2} x2={matAnnotX - 5} y2={building.roofType === "flat" ? wallTop - 3 : (wallTop + ridgeTop) / 2} stroke={COLORS.MAT_LEADER} strokeWidth="0.6" />
            <circle cx={bX + bWidthPx + 2} cy={building.roofType === "flat" ? wallTop - 3 : (wallTop + ridgeTop) / 2} r="2" fill={COLORS.MAT_LEADER} />
            <text x={matAnnotX} y={(building.roofType === "flat" ? wallTop - 3 : (wallTop + ridgeTop) / 2) - 4} fontSize="7" fill={COLORS.MAT_LEADER} fontFamily="Helvetica, Arial, sans-serif">Toiture en {building.roofMaterial.toLowerCase()}</text>
            {building.roofColor && <text x={matAnnotX} y={(building.roofType === "flat" ? wallTop - 3 : (wallTop + ridgeTop) / 2) + 6} fontSize="6" fill={COLORS.MAT_LEADER} fontFamily="Helvetica, Arial, sans-serif">couleur {building.roofColor}</text>}
            {building.roofPitch > 0 && building.roofType !== "flat" && <text x={matAnnotX} y={(building.roofType === "flat" ? wallTop - 3 : (wallTop + ridgeTop) / 2) + 14} fontSize="6" fill={COLORS.MAT_LEADER} fontFamily="Helvetica, Arial, sans-serif">Pente {building.roofPitch}%</text>}
          </g>
        )}

        {/* TN label */}
        <text x={VP_W / 2} y={groundY - 3} fontSize="7" fill="#64748b" textAnchor="middle" fontFamily="Helvetica, Arial, sans-serif">TN (Terrain Naturel)</text>
      </svg>

      <div className="text-center py-2 border-t border-slate-100" style={{ background: "#f8fafc" }}>
        <p className="text-xs font-bold text-slate-700">{config.label} projetée</p>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function PC52InlinePreview({
  projectData,
  projectAddress,
  jobs,
}: PC52Props) {
  const parcel = useMemo(() => extractParcelDims(projectData), [projectData]);
  const ngf = useMemo(() => extractNGF(projectData), [projectData]);
  const building = useMemo(
    () => extractBuildingDims(projectData, jobs),
    [projectData, jobs]
  );

  const parcelRef = projectData?.parcelIds || "";

  const pageConfigs: [ElevationConfig, ElevationConfig][] = [
    [
      { label: "Élévation Ouest", facadeDimension: "depth" },
      { label: "Élévation Est", facadeDimension: "depth" },
    ],
    [
      { label: "Élévation Nord", facadeDimension: "width" },
      { label: "Élévation Sud", facadeDimension: "width" },
    ],
  ];

  return (
    <div className="bg-white space-y-6">
      {pageConfigs.map(([topConfig, bottomConfig], pageIdx) => (
        <div key={pageIdx} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-6 py-3 flex items-center justify-between" style={{ background: COLORS.HEADER_BG }}>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-white">PC5.2 — FAÇADES ET TOITURES PROJETÉES</h2>
              <p className="text-xs mt-0.5" style={{ color: "#fda4af" }}>Échelle 1/100</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="rounded px-3 py-1.5 text-center" style={{ background: COLORS.SCALE_BG }}>
                <p className="text-[7px] text-slate-400 uppercase tracking-wide">ECHELLE</p>
                <p className="text-base font-black text-white leading-tight">1/100</p>
                <p className="text-[6px] text-slate-400">ème</p>
              </div>
              <p className="text-xs text-white/80 font-medium">Page {pageIdx + 1}/2</p>
            </div>
          </div>

          <div className="px-4 py-3 space-y-3">
            <ElevationPanel config={topConfig} parcel={parcel} building={building} ngf={ngf} panelId={`p52-${pageIdx}-top`} />
            <ElevationPanel config={bottomConfig} parcel={parcel} building={building} ngf={ngf} panelId={`p52-${pageIdx}-bot`} />
          </div>

          <div className="px-6 py-2.5" style={{ background: COLORS.FOOTER_BG }}>
            <p className="text-[9px] text-white/90 text-center font-bold tracking-wide">
              INDICE 0 &nbsp;|&nbsp; {formatDateFR()} &nbsp;|&nbsp; FAÇADES ET TOITURES PROJETÉES &nbsp;|&nbsp; PCMI 5
            </p>
            <p className="text-[8px] text-white/60 text-center mt-1">
              {projectAddress || "—"} &nbsp;•&nbsp; Parcelle: {parcelRef || "—"} &nbsp;•&nbsp; Échelle: 1 : 100 &nbsp;•&nbsp; Page {pageIdx + 1}/2
            </p>
          </div>
          <p className="text-[6px] text-slate-400 leading-tight px-4 py-1.5" style={{ background: "#f1f5f9" }}>
            Document ne pouvant servir à l&apos;exécution des travaux - Il appartient au maître d&apos;œuvre de réaliser toutes les études et les contrôles nécessaires par des organismes agréés afin d&apos;édifier ce bâtiment dans les règles de l&apos;art et la réglementation en vigueur (DTU, PLU,...). Ce dessin est réalisé d&apos;après les documents fournis par le maître d&apos;ouvrage.
          </p>
        </div>
      ))}
    </div>
  );
}
