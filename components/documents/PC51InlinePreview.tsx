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
  HATCH: "#666666",
  TN_MARKER: "#F97316",
  WALLS_DEFAULT: "#F5F0DC",
  ROOF_DEFAULT: "#555555",
  WALLS_STROKE: "#333333",
  MUTED: "#94a3b8",
  DIM_BOX: "#1E3A8A",
  SCALE_BG: "#1a1a1a",
};

// SVG drawing area within the 800×280 viewBox per panel
const PANEL = {
  VP_W: 800,
  VP_H: 280,
  MARGIN_LEFT: 60,
  MARGIN_RIGHT: 60,
  GROUND_Y_RATIO: 0.72,
  HATCH_DEPTH: 30,
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
    const td = projectData?.terrainData?.elevationPoints;
    if (Array.isArray(td) && td.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const elev = td.find((p: any) => typeof p.elevation === "number");
      if (elev) return Math.round(Number(elev.elevation) * 100) / 100;
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
  return 64.75;
}

function extractBuildingDims(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  projectData: Record<string, any> | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobs: Array<Record<string, any>>
): BuildingDims | null {
  // For PC5.1 (initial state), we look for existing building data
  const existingData = projectData?.existingBuildingsData;
  const b3d = projectData?.sitePlanData?.building3D;
  const mainJob = jobs[0] || {};
  const mats = (projectData?.projectDescription?.materials || {}) as Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >;

  // Check if there's an existing building
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = Array.isArray(existingData)
    ? existingData[0]
    : existingData;

  // If the job is "existing_extension" or "work_on_existing", there IS an existing building
  const hasExistingBuilding =
    existing ||
    mainJob?.nature === "existing_extension" ||
    mainJob?.nature === "work_on_existing" ||
    (mainJob?.existingFootprint && Number(mainJob.existingFootprint) > 0);

  if (!hasExistingBuilding) return null;

  // Extract dimensions from whichever source has them
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

  return {
    width,
    depth,
    wallHeight:
      Number(existing?.wallHeight) ||
      Number(b3d?.wallHeight) ||
      Number(mainJob?.wallHeight) ||
      2.5,
    ridgeHeight:
      Number(existing?.ridgeHeight) ||
      Number(b3d?.ridgeHeight) ||
      Number(mainJob?.ridgeHeight) ||
      3.2,
    roofType: String(
      existing?.roofType || b3d?.roofType || mainJob?.roofType || "gable"
    ),
    wallColor: String(
      existing?.wallColor ||
        mats?.wallColor ||
        mats?.matExtColor ||
        "Beige"
    ),
    roofColor: String(
      existing?.roofColor || mats?.roofColor || "Gris anthracite"
    ),
    wallMaterial: String(
      existing?.wallMaterial ||
        mats?.wallMaterial ||
        mats?.matExtMaterial ||
        "Enduit"
    ),
    roofMaterial: String(
      existing?.roofMaterial ||
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
        width="6"
        height="6"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="6"
          stroke={COLORS.HATCH}
          strokeWidth="0.8"
        />
      </pattern>
    </defs>
  );
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

  const leftBX = MARGIN_LEFT;
  const rightBX = VP_W - MARGIN_RIGHT;
  const plotSpan = rightBX - leftBX;

  const facadeLenM =
    config.facadeDimension === "width" ? parcel.widthM : parcel.depthM;
  const pxPerM = plotSpan / facadeLenM;

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

        {/* ── TN=TF ground level markers ── */}
        {/* Left marker */}
        <rect
          x={leftBX - 16}
          y={groundY - 22}
          width="32"
          height="20"
          rx="2"
          fill={COLORS.TN_MARKER}
          opacity="0.9"
        />
        <text
          x={leftBX}
          y={groundY - 12}
          fontSize="7"
          fill="#fff"
          textAnchor="middle"
          fontWeight="bold"
          fontFamily="Helvetica, Arial, sans-serif"
        >
          TN=TF
        </text>
        <text
          x={leftBX}
          y={groundY - 4}
          fontSize="7"
          fill="#fff"
          textAnchor="middle"
          fontFamily="Helvetica, Arial, sans-serif"
        >
          {formatGroundLevel(config.groundLevelLeft)}
        </text>

        {/* Right marker */}
        <rect
          x={rightBX - 16}
          y={groundY - 22}
          width="32"
          height="20"
          rx="2"
          fill={COLORS.TN_MARKER}
          opacity="0.9"
        />
        <text
          x={rightBX}
          y={groundY - 12}
          fontSize="7"
          fill="#fff"
          textAnchor="middle"
          fontWeight="bold"
          fontFamily="Helvetica, Arial, sans-serif"
        >
          TN=TF
        </text>
        <text
          x={rightBX}
          y={groundY - 4}
          fontSize="7"
          fill="#fff"
          textAnchor="middle"
          fontFamily="Helvetica, Arial, sans-serif"
        >
          {formatGroundLevel(config.groundLevelRight)}
        </text>

        {/* ── "TN" arrows on ground line ── */}
        <text
          x={leftBX - 3}
          y={groundY + 12}
          fontSize="7"
          fill={COLORS.GROUND}
          textAnchor="end"
          fontFamily="Helvetica, Arial, sans-serif"
        >
          TN
        </text>
        <line
          x1={leftBX + 5}
          y1={groundY + 8}
          x2={leftBX + 5}
          y2={groundY + 2}
          stroke={COLORS.GROUND}
          strokeWidth="1"
          markerEnd="url(#arrowDown)"
        />
        <text
          x={rightBX + 3}
          y={groundY + 12}
          fontSize="7"
          fill={COLORS.GROUND}
          textAnchor="start"
          fontFamily="Helvetica, Arial, sans-serif"
        >
          TN
        </text>

        {/* ── NGF labels ── */}
        <text
          x={leftBX + 25}
          y={groundY + 13}
          fontSize="6"
          fill="#555"
          fontFamily="Helvetica, Arial, sans-serif"
        >
          +{ngf.toFixed(2)} NGF
        </text>
        <text
          x={rightBX - 25}
          y={groundY + 13}
          fontSize="6"
          fill="#555"
          textAnchor="end"
          fontFamily="Helvetica, Arial, sans-serif"
        >
          +{ngf.toFixed(2)} NGF
        </text>

        {/* ── Plot width dimension line ── */}
        <line
          x1={leftBX}
          y1={16}
          x2={rightBX}
          y2={16}
          stroke={COLORS.GROUND}
          strokeWidth="0.5"
        />
        <line
          x1={leftBX}
          y1={12}
          x2={leftBX}
          y2={20}
          stroke={COLORS.GROUND}
          strokeWidth="0.5"
        />
        <line
          x1={rightBX}
          y1={12}
          x2={rightBX}
          y2={20}
          stroke={COLORS.GROUND}
          strokeWidth="0.5"
        />
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

/** Building silhouette with walls, windows, door, roof, dimensions */
function BuildingProfile({
  building,
  centerX,
  groundY,
  pxPerM,
  plotSpan,
  facadeDimension,
  ngf,
}: {
  building: BuildingDims;
  centerX: number;
  groundY: number;
  pxPerM: number;
  plotSpan: number;
  facadeDimension: "width" | "depth";
  ngf: number;
}) {
  const facadeLen =
    facadeDimension === "width" ? building.width : building.depth;
  const bWidthPx = Math.min(facadeLen * pxPerM, plotSpan * 0.55);
  const wallHPx = Math.min(building.wallHeight * pxPerM, (groundY - 40) * 0.6);
  const ridgeHPx = Math.min(
    building.ridgeHeight * pxPerM,
    (groundY - 30) * 0.8
  );

  const bX = centerX - bWidthPx / 2;
  const wallTop = groundY - wallHPx;
  const ridgeTop = groundY - ridgeHPx;

  // Window calculations
  const winW = Math.min(bWidthPx * 0.08, 20);
  const winH = wallHPx * 0.35;
  const numWin = Math.min(Math.floor(bWidthPx / (winW * 3)), 5);
  const winSpacing = bWidthPx / (numWin + 1);

  // Door
  const doorW = Math.min(bWidthPx * 0.06, 16);
  const doorH = wallHPx * 0.55;

  // Roof shape
  const roofPoints =
    building.roofType === "flat"
      ? null // handled differently
      : building.roofType === "hip"
      ? `${bX - 3},${wallTop} ${bX + bWidthPx * 0.2},${ridgeTop} ${
          bX + bWidthPx * 0.8
        },${ridgeTop} ${bX + bWidthPx + 3},${wallTop}`
      : `${bX - 3},${wallTop} ${centerX},${ridgeTop} ${
          bX + bWidthPx + 3
        },${wallTop}`;

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
        if (
          Math.abs(wx + winW / 2 - centerX) < doorW * 1.5
        )
          return null;
        return (
          <g key={`win-${i}`}>
            <rect
              x={wx}
              y={wallTop + wallHPx * 0.2}
              width={winW}
              height={winH}
              fill="#b4d6f0"
              stroke="#3a3a50"
              strokeWidth="0.7"
            />
            {/* Cross bars */}
            <line
              x1={wx + winW / 2}
              y1={wallTop + wallHPx * 0.2}
              x2={wx + winW / 2}
              y2={wallTop + wallHPx * 0.2 + winH}
              stroke="#3a3a50"
              strokeWidth="0.4"
            />
            <line
              x1={wx}
              y1={wallTop + wallHPx * 0.2 + winH / 2}
              x2={wx + winW}
              y2={wallTop + wallHPx * 0.2 + winH / 2}
              stroke="#3a3a50"
              strokeWidth="0.4"
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
        fill="#6e4628"
        stroke="#3a2010"
        strokeWidth="0.7"
      />
      <circle cx={centerX + doorW / 3} cy={groundY - doorH / 2} r="1.5" fill="#c8b060" />

      {/* Roof */}
      {building.roofType === "flat" ? (
        <rect
          x={bX - 2}
          y={wallTop - 6}
          width={bWidthPx + 4}
          height={6}
          fill={COLORS.ROOF_DEFAULT}
          stroke={COLORS.WALLS_STROKE}
          strokeWidth="1"
        />
      ) : (
        <polygon
          points={roofPoints!}
          fill={COLORS.ROOF_DEFAULT}
          stroke={COLORS.WALLS_STROKE}
          strokeWidth="1.5"
        />
      )}

      {/* ── Dimension annotations ── */}

      {/* Wall height (left of building) */}
      <line
        x1={bX - 15}
        y1={groundY}
        x2={bX - 15}
        y2={wallTop}
        stroke={COLORS.DIM_BOX}
        strokeWidth="0.8"
      />
      <line
        x1={bX - 18}
        y1={groundY}
        x2={bX - 12}
        y2={groundY}
        stroke={COLORS.DIM_BOX}
        strokeWidth="0.8"
      />
      <line
        x1={bX - 18}
        y1={wallTop}
        x2={bX - 12}
        y2={wallTop}
        stroke={COLORS.DIM_BOX}
        strokeWidth="0.8"
      />
      {/* Wall height label */}
      <rect
        x={bX - 48}
        y={(groundY + wallTop) / 2 - 7}
        width="30"
        height="14"
        rx="2"
        fill={COLORS.DIM_BOX}
      />
      <text
        x={bX - 33}
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
      <line
        x1={bX + bWidthPx + 15}
        y1={groundY}
        x2={bX + bWidthPx + 15}
        y2={ridgeTop}
        stroke={COLORS.DIM_BOX}
        strokeWidth="0.8"
      />
      <line
        x1={bX + bWidthPx + 12}
        y1={groundY}
        x2={bX + bWidthPx + 18}
        y2={groundY}
        stroke={COLORS.DIM_BOX}
        strokeWidth="0.8"
      />
      <line
        x1={bX + bWidthPx + 12}
        y1={ridgeTop}
        x2={bX + bWidthPx + 18}
        y2={ridgeTop}
        stroke={COLORS.DIM_BOX}
        strokeWidth="0.8"
      />
      {/* Ridge height label */}
      <rect
        x={bX + bWidthPx + 20}
        y={(groundY + ridgeTop) / 2 - 7}
        width="30"
        height="14"
        rx="2"
        fill={COLORS.DIM_BOX}
      />
      <text
        x={bX + bWidthPx + 35}
        y={(groundY + ridgeTop) / 2 + 2}
        fontSize="8"
        fill="#fff"
        textAnchor="middle"
        fontWeight="bold"
        fontFamily="Helvetica, Arial, sans-serif"
      >
        {building.ridgeHeight.toFixed(1)} m
      </text>

      {/* NGF altitude labels */}
      <text
        x={bX - 50}
        y={wallTop - 2}
        fontSize="6"
        fill="#64748b"
        fontFamily="Helvetica, Arial, sans-serif"
      >
        +{(ngf + building.wallHeight).toFixed(2)} NGF
      </text>
      <text
        x={centerX}
        y={ridgeTop - 5}
        fontSize="7"
        fill="#555"
        textAnchor="middle"
        fontFamily="Helvetica, Arial, sans-serif"
      >
        Faîtage +{building.ridgeHeight.toFixed(1)} m
      </text>
      <text
        x={bX - 50}
        y={groundY - 2}
        fontSize="6"
        fill="#64748b"
        fontFamily="Helvetica, Arial, sans-serif"
      >
        +{ngf.toFixed(2)} NGF
      </text>

      {/* Building width dimension */}
      <line
        x1={bX}
        y1={groundY + 8}
        x2={bX + bWidthPx}
        y2={groundY + 8}
        stroke={COLORS.GROUND}
        strokeWidth="0.5"
      />
      <line
        x1={bX}
        y1={groundY + 5}
        x2={bX}
        y2={groundY + 11}
        stroke={COLORS.GROUND}
        strokeWidth="0.5"
      />
      <line
        x1={bX + bWidthPx}
        y1={groundY + 5}
        x2={bX + bWidthPx}
        y2={groundY + 11}
        stroke={COLORS.GROUND}
        strokeWidth="0.5"
      />
      <rect
        x={centerX - 22}
        y={groundY + 3}
        width="44"
        height="12"
        fill="#fff"
        stroke={COLORS.GROUND}
        strokeWidth="0.3"
        rx="1"
      />
      <text
        x={centerX}
        y={groundY + 12}
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
          PC5.1 — PLAN DES FAÇADES — ÉTAT INITIAL
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
          INDICE 0 &nbsp;|&nbsp; {formatDateFR()} &nbsp;|&nbsp; PLAN DES
          FAÇADES — ÉTAT INITIAL &nbsp;|&nbsp; PCMI 5.1
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

  // Ground level: use single NGF-relative value for all corners (current limitation)
  // Default to 0.00 since we don't have per-corner TN data yet
  const gl = 0.0;

  const parcelRef = projectData?.parcelIds || "";

  // Elevation configurations
  // Mapping: which corners map to left/right of each elevation view
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
