"use client";

/**
 * PC5.1 — Facades & Elevations — Initial State
 *
 * Professional inline preview: 2 pages, 4 elevation drawings.
 *   Page 1: Élévation Ouest (top) + Élévation Est (bottom)
 *   Page 2: Élévation Nord (top) + Élévation Sud (bottom)
 *
 * Renders entirely from project data — no captured images needed.
 * Matches the PDF output from lib/pdf/pc5-generator.ts.
 *
 * For new construction: shows "Terrain vierge" (empty plot)
 * For extensions/renovations: shows existing building silhouette
 */

import React, { useMemo } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PC51Props {
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

type Direction = "ouest" | "est" | "nord" | "sud";

interface ElevationConfig {
  direction: Direction;
  label: string;
  facadeDimension: "width" | "depth";
  groundLevelLeft: number;
  groundLevelRight: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const COLORS = {
  HEADER_BG: "#6B21A8",
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
};

// SVG drawing area within the 800×280 viewBox per panel
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
      if (typeof td.minElevation === "number")
        return Math.round(td.minElevation * 100) / 100;
    }
  } catch {
    /* fallthrough */
  }
  return 0;
}

/**
 * Extract building dimensions for PC5.1 (initial state).
 * For extensions/renovations: returns existing building
 * For new construction: returns null (virgin land)
 */
function extractBuildingDims(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  projectData: Record<string, any> | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobs: Array<Record<string, any>>
): BuildingDims | null {
  const mainJob = jobs[0] || {};
  const nature = String(mainJob?.nature || "new_construction");

  // For new construction, initial state is empty plot — no existing building
  const isExtensionOrRenovation =
    nature === "existing_extension" ||
    nature === "work_on_existing" ||
    nature === "renovation" ||
    nature === "extension";

  if (!isExtensionOrRenovation) return null;

  // Try existingBuildingsData first
  const existingData = projectData?.existingBuildingsData;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing: Record<string, any> | null = Array.isArray(existingData)
    ? existingData[0]
    : existingData || null;

  // Unwrap building3D
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b3dRaw = projectData?.sitePlanData?.building3D as Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b3d: Record<string, any> | null =
    Array.isArray(b3dRaw?.buildings) && b3dRaw!.buildings.length > 0
      ? b3dRaw!.buildings[0]
      : b3dRaw;

  const mats = (projectData?.projectDescription?.materials || {}) as Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >;

  const width =
    Number(existing?.width) ||
    Number(b3d?.width) ||
    (mainJob?.existingFootprint
      ? Math.sqrt(Number(mainJob.existingFootprint))
      : 0) ||
    (mainJob?.footprint ? Math.sqrt(Number(mainJob.footprint)) : 0) ||
    8;

  const depth =
    Number(existing?.depth) ||
    Number(b3d?.depth) ||
    width * 0.75 ||
    6;

  const wallH =
    Number(existing?.wallHeight) ||
    Number(b3d?.wallHeights?.ground) ||
    Number(b3d?.wallHeight) ||
    Number(mainJob?.wallHeight) ||
    2.5;

  return {
    width,
    depth,
    wallHeight: wallH,
    ridgeHeight:
      Number(existing?.ridgeHeight) ||
      Number(b3d?.ridgeHeight) ||
      (wallH > 0 ? wallH + 0.7 : 3.2),
    roofType: String(
      existing?.roofType || b3d?.roof?.type || b3d?.roofType || mainJob?.roofType || "gable"
    ),
    roofPitch: Number(existing?.roofPitch || b3d?.roof?.pitch || b3d?.roofPitch || 30),
    wallColor: String(
      existing?.wallColor || b3d?.wallColor || mats?.wallColor || mats?.matExtColor || ""
    ),
    roofColor: String(
      existing?.roofColor || b3d?.roofColor || mats?.roofColor || ""
    ),
    wallMaterial: String(
      existing?.wallMaterial ||
        b3d?.materials?.walls ||
        b3d?.wallMaterial ||
        mats?.wallMaterial ||
        mats?.matExtMaterial ||
        "Enduit"
    ),
    roofMaterial: String(
      existing?.roofMaterial ||
        b3d?.roof?.material ||
        b3d?.materials?.roof ||
        b3d?.roofMaterial ||
        mats?.roofCovering ||
        mats?.roofMaterial ||
        "Tuiles"
    ),
  };
}

function formatDateFR(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(
    d.getMonth() + 1
  ).padStart(2, "0")}/${d.getFullYear()}`;
}

function formatGroundLevel(val: number): string {
  const sign = val >= 0 ? "+" : "";
  return `${sign}${val.toFixed(2).replace(".", ",")}`;
}

// ─── SVG Sub-Components ─────────────────────────────────────────────────────

/** Hatched underground pattern defs */
function HatchDefs({ id }: { id: string }) {
  return (
    <defs>
      <pattern
        id={id}
        width="5"
        height="5"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="5"
          stroke={COLORS.HATCH}
          strokeWidth="0.6"
        />
      </pattern>
    </defs>
  );
}

/** Grass tufts along the ground line */
function GrassVegetation({ startX, groundY, width }: { startX: number; groundY: number; width: number }) {
  const tufts: React.ReactNode[] = [];
  const count = Math.floor(width / 12);
  for (let i = 0; i < count; i++) {
    const x = startX + i * (width / count) + 3;
    const h = 3 + (i % 3) * 1.2;
    tufts.push(
      <g key={`grass-${i}`}>
        <line x1={x} y1={groundY} x2={x - 0.8} y2={groundY - h} stroke={COLORS.GRASS} strokeWidth="0.8" />
        <line x1={x + 2} y1={groundY} x2={x + 2.5} y2={groundY - h * 0.6} stroke={COLORS.GRASS} strokeWidth="0.6" />
        <line x1={x + 4} y1={groundY} x2={x + 3.6} y2={groundY - h * 0.75} stroke={COLORS.GRASS} strokeWidth="0.7" />
      </g>
    );
  }
  return <>{tufts}</>;
}

/** Roof texture horizontal lines */
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
      <line
        key={`rt-${r}`}
        x1={centerX - halfW}
        y1={y}
        x2={centerX + halfW}
        y2={y}
        stroke="rgba(255,255,255,0.2)"
        strokeWidth="0.4"
      />
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
  const minBldgPx = plotSpan * 0.35;
  const idealBldgPx = plotSpan * 0.45;

  let pxPerM = naturalPxPerM;
  let isZoomed = false;

  if (naturalBldgPx < minBldgPx && buildingFacadeLenM > 0) {
    pxPerM = idealBldgPx / buildingFacadeLenM;
    isZoomed = true;
  }

  const wallHPx = buildingHeightM * pxPerM;
  const availH = (groundY - 40) * 0.65;
  if (wallHPx < 55 && buildingHeightM > 0) {
    const heightPxPerM = 70 / buildingHeightM;
    if (heightPxPerM > pxPerM) {
      pxPerM = Math.min(heightPxPerM, availH / buildingHeightM);
      isZoomed = true;
    }
  }

  const cappedBldgPx = buildingFacadeLenM * pxPerM;
  if (cappedBldgPx > plotSpan * 0.55) {
    pxPerM = (plotSpan * 0.55) / buildingFacadeLenM;
  }

  return { pxPerM, isZoomed };
}

/** Single elevation panel SVG */
function ElevationPanel({
  config,
  parcel,
  building,
  ngf,
  panelId,
}: {
  config: ElevationConfig;
  parcel: ParcelDims;
  building: BuildingDims | null;
  ngf: number;
  panelId: string;
}) {
  const { VP_W, VP_H, MARGIN_LEFT, MARGIN_RIGHT, GROUND_Y_RATIO } = PANEL;
  const groundY = VP_H * GROUND_Y_RATIO;
  const hatchTop = groundY;
  const hatchBottom = VP_H - 10;
  const hatchDepth = hatchBottom - hatchTop;

  const leftBXNatural = MARGIN_LEFT;
  const rightBXNatural = VP_W - MARGIN_RIGHT;
  const plotSpan = rightBXNatural - leftBXNatural;

  const facadeLenM =
    config.facadeDimension === "width" ? parcel.widthM : parcel.depthM;

  // Building facade length in meters (0 if no building)
  const buildingFacadeLen = building
    ? (config.facadeDimension === "width" ? building.width : building.depth)
    : 0;

  // ── Building-centric zoom scaling ──
  const { pxPerM, isZoomed } = computeScale(
    plotSpan, facadeLenM, buildingFacadeLen,
    building?.wallHeight ?? 0, groundY
  );

  // If zoomed, property boundaries may extend beyond viewport — clamp to edges
  const plotWidthPx = facadeLenM * pxPerM;
  const centerX = (leftBXNatural + rightBXNatural) / 2;
  const leftBX = isZoomed ? Math.max(10, centerX - plotWidthPx / 2) : leftBXNatural;
  const rightBX = isZoomed ? Math.min(VP_W - 10, centerX + plotWidthPx / 2) : rightBXNatural;

  const hatchId = `hatch-${panelId}`;

  return (
    <div className="border border-slate-200 rounded overflow-hidden">
      <svg
        viewBox={`0 0 ${VP_W} ${VP_H}`}
        className="w-full h-auto"
        xmlns="http://www.w3.org/2000/svg"
      >
        <HatchDefs id={hatchId} />

        {/* ── Underground hatching ── */}
        <rect
          x="0"
          y={hatchTop}
          width={VP_W}
          height={hatchDepth}
          fill={`url(#${hatchId})`}
        />

        {/* ── Ground line ── */}
        <line
          x1="0"
          y1={groundY}
          x2={VP_W}
          y2={groundY}
          stroke={COLORS.GROUND}
          strokeWidth="2.5"
        />

        {/* ── Grass vegetation ── */}
        <GrassVegetation startX={10} groundY={groundY} width={VP_W - 20} />

        {/* ── Property boundary lines (red dashed) ── */}
        {[leftBX, rightBX].map((bx, i) => (
          <line
            key={i}
            x1={bx}
            y1={20}
            x2={bx}
            y2={hatchBottom}
            stroke={COLORS.BOUNDARY}
            strokeWidth="2"
            strokeDasharray="10 6"
          />
        ))}

        {/* ── Boundary labels (rotated) ── */}
        <text
          transform={`rotate(-90, ${leftBX - 10}, ${
            (20 + groundY) / 2
          })`}
          x={leftBX - 10}
          y={(20 + groundY) / 2}
          fontSize="9"
          fill={COLORS.BOUNDARY}
          fontStyle="italic"
          fontWeight="bold"
          textAnchor="middle"
          fontFamily="Helvetica, Arial, sans-serif"
        >
          Limite de propriété
        </text>
        <text
          transform={`rotate(-90, ${rightBX + 14}, ${
            (20 + groundY) / 2
          })`}
          x={rightBX + 14}
          y={(20 + groundY) / 2}
          fontSize="9"
          fill={COLORS.BOUNDARY}
          fontStyle="italic"
          fontWeight="bold"
          textAnchor="middle"
          fontFamily="Helvetica, Arial, sans-serif"
        >
          Limite de propriété
        </text>

        {/* ── TN/TF markers ── */}
        {[leftBX, rightBX].map((bx, i) => (
          <g key={`tn-tf-${i}`}>
            {/* TN marker (orange) */}
            <rect x={bx - 14} y={groundY + 2} width="12" height="10" rx="1.5" fill={COLORS.TN_MARKER} />
            <text x={bx - 8} y={groundY + 9} fontSize="5.5" fill="#fff" textAnchor="middle" fontWeight="bold" fontFamily="Helvetica, Arial, sans-serif">
              TN
            </text>
            {/* TF marker (green) */}
            <rect x={bx + 2} y={groundY + 2} width="12" height="10" rx="1.5" fill={COLORS.TF_MARKER} />
            <text x={bx + 8} y={groundY + 9} fontSize="5.5" fill="#fff" textAnchor="middle" fontWeight="bold" fontFamily="Helvetica, Arial, sans-serif">
              TF
            </text>
          </g>
        ))}

        {/* ── TN=TF ground level labels ── */}
        <text x={leftBX - 18} y={groundY - 3} fontSize="7" fill={COLORS.GROUND} textAnchor="end" fontWeight="bold" fontFamily="Helvetica, Arial, sans-serif">
          TN=TF
        </text>
        <text x={leftBX - 18} y={groundY + 5} fontSize="7" fill={COLORS.GROUND} textAnchor="end" fontFamily="Helvetica, Arial, sans-serif">
          {formatGroundLevel(config.groundLevelLeft)}
        </text>
        <text x={rightBX + 18} y={groundY - 3} fontSize="7" fill={COLORS.GROUND} fontWeight="bold" fontFamily="Helvetica, Arial, sans-serif">
          TN=TF
        </text>
        <text x={rightBX + 18} y={groundY + 5} fontSize="7" fill={COLORS.GROUND} fontFamily="Helvetica, Arial, sans-serif">
          {formatGroundLevel(config.groundLevelRight)}
        </text>

        {/* ── NGF labels ── */}
        <text x={leftBX + 25} y={groundY + 18} fontSize="6" fill="#555" fontFamily="Helvetica, Arial, sans-serif">
          +{ngf.toFixed(2)} NGF
        </text>
        <text x={rightBX - 25} y={groundY + 18} fontSize="6" fill="#555" textAnchor="end" fontFamily="Helvetica, Arial, sans-serif">
          +{ngf.toFixed(2)} NGF
        </text>

        {/* ── Plot width dimension line ── */}
        <line x1={leftBX} y1={16} x2={rightBX} y2={16} stroke={COLORS.GROUND} strokeWidth="0.5" />
        <line x1={leftBX} y1={12} x2={leftBX} y2={20} stroke={COLORS.GROUND} strokeWidth="0.5" />
        <line x1={rightBX} y1={12} x2={rightBX} y2={20} stroke={COLORS.GROUND} strokeWidth="0.5" />
        <rect
          x={(leftBX + rightBX) / 2 - 28}
          y={9}
          width="56"
          height="14"
          fill="#fff"
          stroke={COLORS.GROUND}
          strokeWidth="0.3"
          rx="1"
        />
        <text
          x={(leftBX + rightBX) / 2}
          y={19}
          fontSize="9"
          fill={COLORS.GROUND}
          textAnchor="middle"
          fontWeight="bold"
          fontFamily="Helvetica, Arial, sans-serif"
        >
          {facadeLenM.toFixed(1)} m
        </text>

        {/* ── Building or empty plot ── */}
        {building ? (
          <BuildingProfile
            building={building}
            centerX={(leftBX + rightBX) / 2}
            groundY={groundY}
            pxPerM={pxPerM}
            plotSpan={plotSpan}
            facadeDimension={config.facadeDimension}
            ngf={ngf}
            leftBX={leftBX}
            rightBX={rightBX}
          />
        ) : (
          <>
            <text
              x={VP_W / 2}
              y={groundY - 60}
              fontSize="13"
              fill={COLORS.MUTED}
              textAnchor="middle"
              fontStyle="italic"
              fontFamily="Helvetica, Arial, sans-serif"
            >
              Terrain vierge — aucune construction existante
            </text>
            <text
              x={VP_W / 2}
              y={groundY - 40}
              fontSize="10"
              fill={COLORS.MUTED}
              textAnchor="middle"
              fontStyle="italic"
              fontFamily="Helvetica, Arial, sans-serif"
            >
              (Aucune élévation à représenter)
            </text>
          </>
        )}

        {/* ── TN label centered ── */}
        <text
          x={VP_W / 2}
          y={groundY - 3}
          fontSize="7"
          fill="#64748b"
          textAnchor="middle"
          fontFamily="Helvetica, Arial, sans-serif"
        >
          TN (Terrain Naturel)
        </text>
      </svg>

      {/* Panel caption */}
      <div
        className="text-center py-2 border-t border-slate-100"
        style={{ background: "#f8fafc" }}
      >
        <p className="text-xs font-bold text-slate-700">
          {config.label} initiale
        </p>
      </div>
    </div>
  );
}

/** Building silhouette with walls, windows, door, textured roof, chimney, dimensions, material annotations */
function BuildingProfile({
  building,
  centerX,
  groundY,
  pxPerM,
  plotSpan,
  facadeDimension,
  ngf,
  leftBX,
  rightBX,
}: {
  building: BuildingDims;
  centerX: number;
  groundY: number;
  pxPerM: number;
  plotSpan: number;
  facadeDimension: "width" | "depth";
  ngf: number;
  leftBX: number;
  rightBX: number;
}) {
  const facadeLen =
    facadeDimension === "width" ? building.width : building.depth;

  // ── Building-centric zoom: enforce minimum readable sizes ──
  const bWidthPx = Math.max(facadeLen * pxPerM, 60);
  const wallHPx = Math.min(Math.max(building.wallHeight * pxPerM, 55), (groundY - 40) * 0.65);
  const ridgeHPx = Math.min(
    Math.max(building.ridgeHeight * pxPerM, wallHPx + 12),
    (groundY - 25) * 0.85
  );

  const bX = centerX - bWidthPx / 2;
  const wallTop = groundY - wallHPx;
  const ridgeTop = groundY - ridgeHPx;

  // Window calculations
  const winW = Math.min(bWidthPx * 0.07, 18);
  const winH = wallHPx * 0.3;
  const numWin = Math.min(Math.floor(bWidthPx / (winW * 3.5)), 6);
  const winSpacing = bWidthPx / (numWin + 1);

  // Door
  const doorW = Math.min(bWidthPx * 0.055, 14);
  const doorH = wallHPx * 0.5;

  // Roof shape
  const roofPoints =
    building.roofType === "flat"
      ? null
      : building.roofType === "hip"
      ? `${bX - 3},${wallTop} ${bX + bWidthPx * 0.2},${ridgeTop} ${
          bX + bWidthPx * 0.8
        },${ridgeTop} ${bX + bWidthPx + 3},${wallTop}`
      : `${bX - 3},${wallTop} ${centerX},${ridgeTop} ${
          bX + bWidthPx + 3
        },${wallTop}`;

  // Chimney position
  const chimX = centerX + bWidthPx * 0.18;
  const chimW = 8;
  const chimH = 14;
  const t = Math.abs(chimX - centerX) / (bWidthPx / 2 + 3);
  const roofYAtChim = ridgeTop + t * (wallTop - ridgeTop);
  const showChimney = building.roofType !== "flat" && roofYAtChim - chimH > 30;

  // Material annotation position
  const matAnnotX = bX + bWidthPx + 55;
  const showAnnotations = matAnnotX < PANEL.VP_W - 20;

  return (
    <g>
      {/* Walls */}
      <rect
        x={bX}
        y={wallTop}
        width={bWidthPx}
        height={wallHPx}
        fill={COLORS.WALLS_DEFAULT}
        stroke={COLORS.WALLS_STROKE}
        strokeWidth="1.5"
      />

      {/* Windows */}
      {Array.from({ length: numWin }).map((_, i) => {
        const wx = bX + (i + 1) * winSpacing - winW / 2;
        // Skip window if it overlaps door area
        if (Math.abs(wx + winW / 2 - centerX) < doorW * 2) return null;
        return (
          <g key={`win-${i}`}>
            {/* Window fill */}
            <rect
              x={wx}
              y={wallTop + wallHPx * 0.2}
              width={winW}
              height={winH}
              fill={COLORS.WINDOW}
              stroke={COLORS.WINDOW_FRAME}
              strokeWidth="0.7"
            />
            {/* Cross bars */}
            <line
              x1={wx + winW / 2}
              y1={wallTop + wallHPx * 0.2}
              x2={wx + winW / 2}
              y2={wallTop + wallHPx * 0.2 + winH}
              stroke={COLORS.WINDOW_FRAME}
              strokeWidth="0.4"
            />
            <line
              x1={wx}
              y1={wallTop + wallHPx * 0.2 + winH / 2}
              x2={wx + winW}
              y2={wallTop + wallHPx * 0.2 + winH / 2}
              stroke={COLORS.WINDOW_FRAME}
              strokeWidth="0.4"
            />
            {/* Window sill */}
            <line
              x1={wx - 1}
              y1={wallTop + wallHPx * 0.2 + winH}
              x2={wx + winW + 1}
              y2={wallTop + wallHPx * 0.2 + winH}
              stroke={COLORS.WALLS_STROKE}
              strokeWidth="0.8"
            />
          </g>
        );
      })}

      {/* Door */}
      <rect
        x={centerX - doorW / 2}
        y={groundY - doorH}
        width={doorW}
        height={doorH}
        fill={COLORS.DOOR}
        stroke={COLORS.DOOR_FRAME}
        strokeWidth="0.7"
      />
      {/* Door handle */}
      <circle cx={centerX + doorW / 3} cy={groundY - doorH / 2} r="1.5" fill="#c8b060" />

      {/* Roof */}
      {building.roofType === "flat" ? (
        <rect
          x={bX - 2}
          y={wallTop - 6}
          width={bWidthPx + 4}
          height={6}
          fill={COLORS.ROOF_DEFAULT}
          stroke={COLORS.ROOF_STROKE}
          strokeWidth="1"
        />
      ) : (
        <>
          <polygon
            points={roofPoints!}
            fill={COLORS.ROOF_DEFAULT}
            stroke={COLORS.ROOF_STROKE}
            strokeWidth="1.5"
          />
          {/* Roof texture */}
          <RoofTexture
            bX={bX}
            wallTop={wallTop}
            bWidthPx={bWidthPx}
            ridgeTop={ridgeTop}
            centerX={centerX}
          />
        </>
      )}

      {/* Chimney */}
      {showChimney && (
        <g>
          <rect
            x={chimX - chimW / 2}
            y={roofYAtChim - chimH}
            width={chimW}
            height={chimH}
            fill={COLORS.CHIMNEY}
            stroke={COLORS.WALLS_STROKE}
            strokeWidth="0.6"
          />
          <rect
            x={chimX - chimW / 2 - 1}
            y={roofYAtChim - chimH - 2}
            width={chimW + 2}
            height={2}
            fill={COLORS.CHIMNEY_CAP}
          />
        </g>
      )}

      {/* ── Dimension annotations ── */}

      {/* Wall height (left of building) */}
      <line x1={bX - 18} y1={groundY} x2={bX - 18} y2={wallTop} stroke={COLORS.DIM_BOX} strokeWidth="0.8" />
      <line x1={bX - 21} y1={groundY} x2={bX - 15} y2={groundY} stroke={COLORS.DIM_BOX} strokeWidth="0.8" />
      <line x1={bX - 21} y1={wallTop} x2={bX - 15} y2={wallTop} stroke={COLORS.DIM_BOX} strokeWidth="0.8" />
      {/* Wall height label */}
      <rect
        x={bX - 52}
        y={(groundY + wallTop) / 2 - 7}
        width="30"
        height="14"
        rx="2"
        fill={COLORS.DIM_BOX}
      />
      <text
        x={bX - 37}
        y={(groundY + wallTop) / 2 + 2}
        fontSize="8"
        fill="#fff"
        textAnchor="middle"
        fontWeight="bold"
        fontFamily="Helvetica, Arial, sans-serif"
      >
        {building.wallHeight.toFixed(1)} m
      </text>

      {/* Ridge height (right of building) */}
      <line x1={bX + bWidthPx + 18} y1={groundY} x2={bX + bWidthPx + 18} y2={ridgeTop} stroke={COLORS.DIM_BOX} strokeWidth="0.8" />
      <line x1={bX + bWidthPx + 15} y1={groundY} x2={bX + bWidthPx + 21} y2={groundY} stroke={COLORS.DIM_BOX} strokeWidth="0.8" />
      <line x1={bX + bWidthPx + 15} y1={ridgeTop} x2={bX + bWidthPx + 21} y2={ridgeTop} stroke={COLORS.DIM_BOX} strokeWidth="0.8" />
      {/* Ridge height label */}
      <rect
        x={bX + bWidthPx + 23}
        y={(groundY + ridgeTop) / 2 - 7}
        width="30"
        height="14"
        rx="2"
        fill={COLORS.DIM_BOX}
      />
      <text
        x={bX + bWidthPx + 38}
        y={(groundY + ridgeTop) / 2 + 2}
        fontSize="8"
        fill="#fff"
        textAnchor="middle"
        fontWeight="bold"
        fontFamily="Helvetica, Arial, sans-serif"
      >
        {building.ridgeHeight.toFixed(1)} m
      </text>

      {/* Eave height label */}
      <text
        x={bX + bWidthPx + 24}
        y={wallTop + 3}
        fontSize="6"
        fill={COLORS.DIM_BOX}
        fontFamily="Helvetica, Arial, sans-serif"
      >
        Égout +{building.wallHeight.toFixed(2)}
      </text>

      {/* Ridge label at top */}
      <text
        x={centerX}
        y={ridgeTop - 6}
        fontSize="7"
        fill="#333"
        textAnchor="middle"
        fontFamily="Helvetica, Arial, sans-serif"
      >
        Faîtage +{building.ridgeHeight.toFixed(2)}
      </text>

      {/* NGF altitude labels */}
      <text x={bX - 54} y={wallTop - 2} fontSize="6" fill="#64748b" fontFamily="Helvetica, Arial, sans-serif">
        +{(ngf + building.wallHeight).toFixed(2)} NGF
      </text>
      <text x={centerX} y={ridgeTop - 14} fontSize="6" fill="#64748b" textAnchor="middle" fontFamily="Helvetica, Arial, sans-serif">
        +{(ngf + building.ridgeHeight).toFixed(2)} NGF
      </text>
      <text x={bX - 54} y={groundY - 2} fontSize="6" fill="#64748b" fontFamily="Helvetica, Arial, sans-serif">
        +{ngf.toFixed(2)} NGF
      </text>

      {/* Building width dimension */}
      <line x1={bX} y1={groundY + 10} x2={bX + bWidthPx} y2={groundY + 10} stroke={COLORS.GROUND} strokeWidth="0.5" />
      <line x1={bX} y1={groundY + 7} x2={bX} y2={groundY + 13} stroke={COLORS.GROUND} strokeWidth="0.5" />
      <line x1={bX + bWidthPx} y1={groundY + 7} x2={bX + bWidthPx} y2={groundY + 13} stroke={COLORS.GROUND} strokeWidth="0.5" />
      <rect
        x={centerX - 24}
        y={groundY + 5}
        width="48"
        height="12"
        fill="#fff"
        stroke={COLORS.GROUND}
        strokeWidth="0.3"
        rx="1"
      />
      <text
        x={centerX}
        y={groundY + 13}
        fontSize="8"
        fill={COLORS.GROUND}
        textAnchor="middle"
        fontWeight="bold"
        fontFamily="Helvetica, Arial, sans-serif"
      >
        {facadeLen.toFixed(1)} m
      </text>

      {/* Floor level label */}
      <text
        x={bX + bWidthPx + 5}
        y={groundY - 4}
        fontSize="6"
        fill="#555"
        fontFamily="Helvetica, Arial, sans-serif"
      >
        Niveau RDC +0.00
      </text>

      {/* ── Material Annotations with leader lines ── */}
      {showAnnotations && (
        <g>
          {/* Wall material */}
          <line
            x1={bX + bWidthPx + 2}
            y1={(wallTop + groundY) / 2}
            x2={matAnnotX - 5}
            y2={(wallTop + groundY) / 2}
            stroke={COLORS.MAT_LEADER}
            strokeWidth="0.6"
          />
          <circle cx={bX + bWidthPx + 2} cy={(wallTop + groundY) / 2} r="2" fill={COLORS.MAT_LEADER} />
          <text
            x={matAnnotX}
            y={(wallTop + groundY) / 2 - 4}
            fontSize="7"
            fill={COLORS.MAT_LEADER}
            fontFamily="Helvetica, Arial, sans-serif"
          >
            {building.wallMaterial}
          </text>
          {building.wallColor && (
            <text
              x={matAnnotX}
              y={(wallTop + groundY) / 2 + 6}
              fontSize="6"
              fill={COLORS.MAT_LEADER}
              fontFamily="Helvetica, Arial, sans-serif"
            >
              couleur {building.wallColor}
            </text>
          )}

          {/* Roof material */}
          <line
            x1={bX + bWidthPx + 2}
            y1={building.roofType === "flat" ? wallTop - 3 : (wallTop + ridgeTop) / 2}
            x2={matAnnotX - 5}
            y2={building.roofType === "flat" ? wallTop - 3 : (wallTop + ridgeTop) / 2}
            stroke={COLORS.MAT_LEADER}
            strokeWidth="0.6"
          />
          <circle
            cx={bX + bWidthPx + 2}
            cy={building.roofType === "flat" ? wallTop - 3 : (wallTop + ridgeTop) / 2}
            r="2"
            fill={COLORS.MAT_LEADER}
          />
          <text
            x={matAnnotX}
            y={(building.roofType === "flat" ? wallTop - 3 : (wallTop + ridgeTop) / 2) - 4}
            fontSize="7"
            fill={COLORS.MAT_LEADER}
            fontFamily="Helvetica, Arial, sans-serif"
          >
            Toiture en {building.roofMaterial.toLowerCase()}
          </text>
          {building.roofColor && (
            <text
              x={matAnnotX}
              y={(building.roofType === "flat" ? wallTop - 3 : (wallTop + ridgeTop) / 2) + 6}
              fontSize="6"
              fill={COLORS.MAT_LEADER}
              fontFamily="Helvetica, Arial, sans-serif"
            >
              couleur {building.roofColor}
            </text>
          )}
          {building.roofPitch > 0 && building.roofType !== "flat" && (
            <text
              x={matAnnotX}
              y={(building.roofType === "flat" ? wallTop - 3 : (wallTop + ridgeTop) / 2) + 14}
              fontSize="6"
              fill={COLORS.MAT_LEADER}
              fontFamily="Helvetica, Arial, sans-serif"
            >
              Pente {building.roofPitch}%
            </text>
          )}
        </g>
      )}
    </g>
  );
}

// ─── Page Components ────────────────────────────────────────────────────────

/** Purple header bar */
function PageHeader({
  pageLabel,
}: {
  pageLabel: string;
}) {
  return (
    <div
      className="px-6 py-3 flex items-center justify-between"
      style={{ background: COLORS.HEADER_BG }}
    >
      <div>
        <h2 className="text-sm font-black uppercase tracking-wider text-white">
          PC5.1 — FAÇADES ET TOITURES EXISTANTES
        </h2>
        <p className="text-xs mt-0.5" style={{ color: "#c4b5fd" }}>
          Échelle 1/100
        </p>
      </div>
      <div className="flex items-center gap-4">
        {/* Scale badge */}
        <div
          className="rounded px-3 py-1.5 text-center"
          style={{ background: COLORS.SCALE_BG }}
        >
          <p className="text-[7px] text-slate-400 uppercase tracking-wide">
            ECHELLE
          </p>
          <p className="text-base font-black text-white leading-tight">
            1/100
          </p>
          <p className="text-[6px] text-slate-400">ème</p>
        </div>
        {/* Page number */}
        <p className="text-xs text-white/80 font-medium">
          Page {pageLabel}
        </p>
      </div>
    </div>
  );
}

/** Dark footer */
function PageFooter({
  address,
  parcelRef,
  pageLabel,
}: {
  address: string;
  parcelRef: string;
  pageLabel: string;
}) {
  return (
    <>
      <div
        className="px-6 py-2.5"
        style={{ background: COLORS.FOOTER_BG }}
      >
        <p className="text-[9px] text-white/90 text-center font-bold tracking-wide">
          INDICE 0 &nbsp;|&nbsp; {formatDateFR()} &nbsp;|&nbsp; FAÇADES
          ET TOITURES EXISTANTES &nbsp;|&nbsp; PCMI 5
        </p>
        <p className="text-[8px] text-white/60 text-center mt-1">
          {address || "—"} &nbsp;•&nbsp; Parcelle: {parcelRef || "—"}{" "}
          &nbsp;•&nbsp; Échelle: 1 : 100 &nbsp;•&nbsp; Page {pageLabel}
        </p>
      </div>
      <p className="text-[6px] text-slate-400 leading-tight px-4 py-1.5"
         style={{ background: "#f1f5f9" }}>
        Document ne pouvant servir à l&apos;exécution des travaux - Il
        appartient au maître d&apos;œuvre de réaliser toutes les études et
        les contrôles nécessaires par des organismes agréés afin
        d&apos;édifier ce bâtiment dans les règles de l&apos;art et la
        réglementation en vigueur (DTU, PLU,...). Ce dessin est réalisé
        d&apos;après les documents fournis par le maître d&apos;ouvrage.
      </p>
    </>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function PC51InlinePreview({
  projectData,
  projectAddress,
  jobs,
}: PC51Props) {
  // Extract all data from project
  const parcel = useMemo(
    () => extractParcelDims(projectData),
    [projectData]
  );
  const ngf = useMemo(() => extractNGF(projectData), [projectData]);
  const building = useMemo(
    () => extractBuildingDims(projectData, jobs),
    [projectData, jobs]
  );

  // Ground level: use single NGF-relative value for all corners
  const gl = 0.0;

  const parcelRef = projectData?.parcelIds || "";

  // Elevation configurations
  const pageConfigs: [ElevationConfig, ElevationConfig][] = [
    // Page 1: Ouest (top) + Est (bottom)
    [
      {
        direction: "ouest",
        label: "Élévation Ouest",
        facadeDimension: "depth",
        groundLevelLeft: gl,
        groundLevelRight: gl,
      },
      {
        direction: "est",
        label: "Élévation Est",
        facadeDimension: "depth",
        groundLevelLeft: gl,
        groundLevelRight: gl,
      },
    ],
    // Page 2: Nord (top) + Sud (bottom)
    [
      {
        direction: "nord",
        label: "Élévation Nord",
        facadeDimension: "width",
        groundLevelLeft: gl,
        groundLevelRight: gl,
      },
      {
        direction: "sud",
        label: "Élévation Sud",
        facadeDimension: "width",
        groundLevelLeft: gl,
        groundLevelRight: gl,
      },
    ],
  ];

  return (
    <div className="bg-white space-y-6">
      {pageConfigs.map(([topConfig, bottomConfig], pageIdx) => (
        <div
          key={pageIdx}
          className="border border-slate-200 rounded-xl overflow-hidden shadow-sm"
        >
          {/* Header */}
          <PageHeader pageLabel={`${pageIdx + 1}/2`} />

          {/* Two elevation panels */}
          <div className="px-4 py-3 space-y-3">
            <ElevationPanel
              config={topConfig}
              parcel={parcel}
              building={building}
              ngf={ngf}
              panelId={`p${pageIdx}-top`}
            />
            <ElevationPanel
              config={bottomConfig}
              parcel={parcel}
              building={building}
              ngf={ngf}
              panelId={`p${pageIdx}-bot`}
            />
          </div>

          {/* Footer */}
          <PageFooter
            address={projectAddress}
            parcelRef={parcelRef}
            pageLabel={`${pageIdx + 1}/2`}
          />
        </div>
      ))}
    </div>
  );
}
