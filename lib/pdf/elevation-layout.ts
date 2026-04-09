/**
 * Elevation Layout Engine — Single Source of Truth
 *
 * Pure-function module that computes all geometry, positions, labels, and
 * annotations for PC5 elevation panels. Both the React SVG renderer
 * (ElevationSVG.tsx) and the jsPDF renderer (pc5-generator.ts) consume
 * the output of computeElevationLayout().
 *
 * No rendering side effects — no DOM, no jsPDF, no React.
 *
 * Visual improvements baked in:
 *   1. Facade differentiation (door placement per direction)
 *   2. Setback dimensions (distance from building edges to boundaries)
 *   3. Roof overhang (0.3m eave extension)
 *   4. Terrain slope (tilted ground line when real data exists)
 *   5. Foundation indication (below-ground strip)
 *   6. Window lintel + sill detail
 *   7. Fascia/eave line at wall-roof junction
 *   8. Building label below (not on wall face)
 */

import type { BuildingDims, ElevationBuilding, ParcelDims } from "./svg-helpers";
import type { MergedMaterials, TerrainProfile } from "./extract-project-data";

// ─── Types ─────────────────────────────────────────────────────────────────

export type FacadeDirection = "ouest" | "est" | "nord" | "sud";

export interface ViewportConfig {
  w: number;       // total width (px or mm)
  h: number;       // total height
  marginL: number; // left margin for boundaries
  marginR: number; // right margin for boundaries
  groundRatio: number; // ground line at this % of height (e.g. 0.72)
}

/** Pre-computed positions for a dimension line */
export interface DimLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  tickLen: number;
  label: string;
  labelX: number;
  labelY: number;
  vertical: boolean;
}

/** Pre-computed positions for a material annotation with leader line */
export interface MatAnnotation {
  anchorX: number;    // start of leader (on building surface)
  anchorY: number;
  labelX: number;     // end of leader (label zone)
  labelY: number;
  lines: string[];    // text lines, e.g. ["Enduit ciment", "couleur blanc"]
}

/** Window rectangle with lintel + sill */
export interface WindowLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  lintelY: number;  // thin bar above window
  sillY: number;    // sill projection below window
  mullionX: number; // vertical bar center
  mullionY: number; // horizontal bar center
}

/** Door rectangle */
export interface DoorLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  handleX: number;
  handleY: number;
}

/** Chimney rectangle */
export interface ChimneyLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  capY: number;
  capH: number;
}

/** Foundation strip below ground */
export interface FoundationLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Roof geometry */
export interface RoofLayout {
  type: "gable" | "hip" | "flat";
  points: Array<{ x: number; y: number }>;
  /** Horizontal tile lines for texture (y positions) */
  textureRows: Array<{ y: number; x1: number; x2: number }>;
}

/** Fascia line at eave */
export interface FasciaLayout {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
}

/** Property boundary line */
export interface BoundaryLayout {
  x: number;
  topY: number;
  bottomY: number;
  visible: boolean;
  label: string;     // "Limite de propriété"
  labelX: number;
  labelY: number;
}

/** TN/TF marker */
export interface TNMarkerLayout {
  x: number;
  y: number;
  tnLabel: { x: number; y: number };
  tfLabel: { x: number; y: number };
  ngfLabel: { x: number; y: number; text: string };
  groundLabel: { x: number; y: number; text: string };
}

/** Setback dimension */
export interface SetbackDim {
  x1: number;
  x2: number;
  y: number;
  label: string;
  visible: boolean;
}

// ─── Secondary Building Layout ─────────────────────────────────────────────

export interface SecondaryBuildingLayout {
  rect: { x: number; y: number; w: number; h: number };
  roof: RoofLayout;
  fascia: FasciaLayout;
  label: { x: number; y: number; text: string };
  color: string;           // fill color for this structure
  buildingType: string;    // 'garage' | 'parking' | 'pool' | 'garden' etc.
  heightDim: DimLine;      // wall height dimension
  widthDim: DimLine;       // building width dimension
}

// ─── Site Element Layout (ground-level: pool, garden, terrace, parking) ────

export interface SiteElementLayout {
  rect: { x: number; y: number; w: number; h: number };
  label: { x: number; y: number; text: string };
  widthDim: DimLine;
  depthDim?: DimLine;       // for pool (sunken depth)
  elementType: string;      // 'pool' | 'garden' | 'terrace' | 'parking'
  color: string;
  strokeColor: string;
  pattern?: 'water' | 'grass' | 'paving' | 'gravel';
  /** Width in meters (for label) */
  widthM: number;
  /** Depth in meters (for label) */
  depthM: number;
}

/**
 * Layout for a single building in the multi-building elevation array.
 * Each building gets its own wall/roof/windows/door/chimney/foundation
 * geometry plus dimension and annotation data.
 */
export interface BuildingLayout {
  /** Wall rectangle */
  rect: { x: number; y: number; w: number; h: number };
  roof: RoofLayout;
  fascia: FasciaLayout;
  windows: WindowLayout[];
  door: DoorLayout | null;
  chimney: ChimneyLayout | null;
  foundation: FoundationLayout;
  label: { x: number; y: number; text: string };
  /** Dimension lines */
  wallHeightDim: DimLine;
  ridgeHeightDim: DimLine;
  buildingWidthDim: DimLine;
  /** Setback dimensions (only meaningful for primary building) */
  setbackLeft: SetbackDim;
  setbackRight: SetbackDim;
  /** NGF altitude labels */
  ngfLabels: {
    ground: { x: number; y: number; text: string };
    wall: { x: number; y: number; text: string };
    ridge: { x: number; y: number; text: string };
    eave: { x: number; y: number; text: string };
    floor: { x: number; y: number; text: string };
  };
  /** Material annotations */
  wallAnnotation: MatAnnotation | null;
  roofAnnotation: MatAnnotation | null;
  /** Whether this is an existing building (muted rendering, no dims) */
  isExisting: boolean;
  /** Z-depth for painter's algorithm (higher = further from viewer) */
  zDepth: number;
  /** Wall fill color */
  fillColor: string;
}

// ─── Main Layout Interface ─────────────────────────────────────────────────

export interface ElevationLayout {
  // ── Viewport ──
  viewport: ViewportConfig;

  // ── Scale ──
  scale: {
    pxPerM: number;
    isZoomed: boolean;
    declared: string;   // "1 : 100"
  };

  // ── Ground ──
  ground: {
    y: number;            // ground line Y position
    leftX: number;        // left extent
    rightX: number;       // right extent
    slopeAngle: number;   // degrees of tilt (0 = flat)
    leftY: number;        // ground Y at left edge (for slope)
    rightY: number;       // ground Y at right edge (for slope)
  };

  // ── Hatch underground ──
  hatch: {
    topY: number;
    bottomY: number;
    leftX: number;
    rightX: number;
  };

  // ── Property boundaries ──
  boundaries: {
    left: BoundaryLayout;
    right: BoundaryLayout;
  };

  // ── TN/TF markers ──
  tnMarkers: TNMarkerLayout[];

  // ── Plot width dimension ──
  plotDim: DimLine;

  // ── Building (null = empty plot) ──
  building: {
    // Wall rectangle
    rect: { x: number; y: number; w: number; h: number };
    // Roof
    roof: RoofLayout;
    // Fascia at eave
    fascia: FasciaLayout;
    // Windows (varies per facade direction)
    windows: WindowLayout[];
    // Door (only on front facade)
    door: DoorLayout | null;
    // Chimney
    chimney: ChimneyLayout | null;
    // Foundation strip
    foundation: FoundationLayout;
    // Building label
    label: { x: number; y: number; text: string };
    // Dimension lines
    wallHeightDim: DimLine;
    ridgeHeightDim: DimLine;
    buildingWidthDim: DimLine;
    // Setback dimensions
    setbackLeft: SetbackDim;
    setbackRight: SetbackDim;
    // NGF altitude labels
    ngfLabels: {
      ground: { x: number; y: number; text: string };
      wall: { x: number; y: number; text: string };
      ridge: { x: number; y: number; text: string };
      eave: { x: number; y: number; text: string };
      floor: { x: number; y: number; text: string };
    };
    // Material annotations
    wallAnnotation: MatAnnotation | null;
    roofAnnotation: MatAnnotation | null;
  } | null;

  // ── Secondary buildings (garage, parking, etc.) — LEGACY, backward compat ──
  secondaryBuildings: SecondaryBuildingLayout[];

  // ── Multi-building array (new engine) ──
  /** All buildings laid out with absolute positioning and Z-depth order.
   *  Sorted back-to-front (painter's algorithm). */
  buildings: BuildingLayout[];

  // ── Site elements (ground-level: pool, garden, terrace, parking) ──
  siteElements: SiteElementLayout[];

  // ── Labels ──
  direction: string;      // "ÉLÉVATION NORD projetée"
  emptyPlotText: string;  // "Terrain vierge — aucune construction existante"
  emptyPlotSub: string;   // "(Aucune élévation à représenter)"
}

// ─── Direction Config ──────────────────────────────────────────────────────

export interface DirectionConfig {
  direction: FacadeDirection;
  label: string;          // "ÉLÉVATION NORD projetée"
  facadeDimension: "width" | "depth";
}

export const DIRECTION_CONFIGS: DirectionConfig[] = [
  { direction: "ouest", label: "ÉLÉVATION OUEST", facadeDimension: "depth" },
  { direction: "est",   label: "ÉLÉVATION EST",   facadeDimension: "depth" },
  { direction: "nord",  label: "ÉLÉVATION NORD",  facadeDimension: "width" },
  { direction: "sud",   label: "ÉLÉVATION SUD",   facadeDimension: "width" },
];

// ─── Facade Differentiation ────────────────────────────────────────────────

interface FacadeVariant {
  hasDoor: boolean;
  windowCount: number;
  windowScale: number; // 1.0 = normal, 0.8 = smaller
}

function getFacadeVariant(
  direction: FacadeDirection,
  buildingWidth: number,
  buildingDepth: number,
  facadeDimension: "width" | "depth",
): FacadeVariant {
  const facadeLen = facadeDimension === "width" ? buildingWidth : buildingDepth;

  // South = front (French convention: street-facing)
  // North = rear
  // East/West = sides (using depth dimension)
  switch (direction) {
    case "sud":
      return { hasDoor: true,  windowCount: Math.max(2, Math.min(6, Math.floor(facadeLen / 2.5))), windowScale: 1.0 };
    case "nord":
      return { hasDoor: false, windowCount: Math.max(1, Math.min(4, Math.floor(facadeLen / 3.5))), windowScale: 0.85 };
    case "ouest":
    case "est":
      return { hasDoor: false, windowCount: Math.max(1, Math.min(4, Math.floor(facadeLen / 3))), windowScale: 0.9 };
    default:
      return { hasDoor: true,  windowCount: 3, windowScale: 1.0 };
  }
}

// ─── Zoom Scale Calculation ────────────────────────────────────────────────

function computeZoomScale(
  plotSpan: number,
  facadeLenM: number,
  buildingFacadeLenM: number,
  buildingHeightM: number,
  availH: number,
): { pxPerM: number; isZoomed: boolean } {
  if (facadeLenM <= 0) return { pxPerM: 1, isZoomed: false };

  const naturalPxPerM = plotSpan / facadeLenM;
  const naturalBldgPx = buildingFacadeLenM * naturalPxPerM;
  const minBldgPx = plotSpan * 0.35;
  const idealBldgPx = plotSpan * 0.45;

  let pxPerM = naturalPxPerM;
  let isZoomed = false;

  // Zoom in if building is too small relative to plot
  if (naturalBldgPx < minBldgPx && buildingFacadeLenM > 0) {
    pxPerM = idealBldgPx / buildingFacadeLenM;
    isZoomed = true;
  }

  // Ensure wall height is readable
  const wallHPx = buildingHeightM * pxPerM;
  if (wallHPx < (plotSpan > 500 ? 15 : 55) && buildingHeightM > 0) {
    const targetPx = plotSpan > 500 ? 20 : 70;
    const heightPxPerM = targetPx / buildingHeightM;
    if (heightPxPerM > pxPerM) {
      pxPerM = Math.min(heightPxPerM, availH / buildingHeightM);
      isZoomed = true;
    }
  }

  // Cap: building shouldn't overflow panel
  const cappedBldgPx = buildingFacadeLenM * pxPerM;
  if (cappedBldgPx > plotSpan * 0.55) {
    pxPerM = (plotSpan * 0.55) / buildingFacadeLenM;
  }

  return { pxPerM, isZoomed };
}

// ─── Roof Geometry ─────────────────────────────────────────────────────────

const OVERHANG_M = 0.3; // standard French residential eave overhang

function computeRoofLayout(
  building: BuildingDims,
  bX: number,
  wallTop: number,
  bWidthPx: number,
  ridgeTop: number,
  centerX: number,
  pxPerM: number,
): RoofLayout {
  const overhangPx = Math.max(OVERHANG_M * pxPerM, 2); // minimum 2px visible
  const roofType = building.roofType === "flat" ? "flat" : building.roofType === "hip" ? "hip" : "gable";

  let points: Array<{ x: number; y: number }>;

  if (roofType === "flat") {
    const flatH = Math.max(2.5, pxPerM * 0.15);
    points = [
      { x: bX - overhangPx, y: wallTop },
      { x: bX + bWidthPx + overhangPx, y: wallTop },
      { x: bX + bWidthPx + overhangPx, y: wallTop - flatH },
      { x: bX - overhangPx, y: wallTop - flatH },
    ];
  } else if (roofType === "hip") {
    const inset = bWidthPx * 0.2;
    points = [
      { x: bX - overhangPx, y: wallTop },
      { x: bX + inset, y: ridgeTop },
      { x: bX + bWidthPx - inset, y: ridgeTop },
      { x: bX + bWidthPx + overhangPx, y: wallTop },
    ];
  } else {
    // Gable
    points = [
      { x: bX - overhangPx, y: wallTop },
      { x: centerX, y: ridgeTop },
      { x: bX + bWidthPx + overhangPx, y: wallTop },
    ];
  }

  // Texture rows (horizontal lines for tile indication)
  const textureRows: Array<{ y: number; x1: number; x2: number }> = [];
  if (roofType !== "flat") {
    const roofH = wallTop - ridgeTop;
    const rowSpacing = Math.max(roofH > 200 ? 6 : 2.5, roofH / 15);
    const rows = Math.floor(roofH / rowSpacing);
    for (let r = 1; r < rows; r++) {
      const t = r / rows;
      const y = ridgeTop + t * roofH;
      let halfW: number;
      if (roofType === "hip") {
        halfW = t * (bWidthPx / 2 + overhangPx);
      } else {
        halfW = t * (bWidthPx / 2 + overhangPx);
      }
      textureRows.push({ y, x1: centerX - halfW, x2: centerX + halfW });
    }
  }

  return { type: roofType, points, textureRows };
}

// ─── Window Layout ─────────────────────────────────────────────────────────

function computeWindows(
  variant: FacadeVariant,
  bX: number,
  wallTop: number,
  bWidthPx: number,
  wallHPx: number,
  centerX: number,
  doorW: number,
): WindowLayout[] {
  const windows: WindowLayout[] = [];
  const winW = Math.min(bWidthPx * 0.07, bWidthPx > 200 ? 14 : 5.5) * variant.windowScale;
  const winH = wallHPx * 0.3;
  const count = variant.windowCount;
  const spacing = bWidthPx / (count + 1);
  const lintelH = Math.max(winH * 0.06, 0.5);
  const sillH = Math.max(winH * 0.04, 0.3);

  for (let w = 1; w <= count; w++) {
    const wx = bX + w * spacing - winW / 2;
    const wy = wallTop + wallHPx * 0.2;

    // Skip if overlapping door zone
    if (variant.hasDoor && Math.abs(wx + winW / 2 - centerX) < doorW * 2) {
      continue;
    }

    windows.push({
      x: wx,
      y: wy,
      w: winW,
      h: winH,
      lintelY: wy - lintelH,
      sillY: wy + winH,
      mullionX: wx + winW / 2,
      mullionY: wy + winH / 2,
    });
  }

  return windows;
}

// ─── Chimney Layout ────────────────────────────────────────────────────────

function computeChimney(
  building: BuildingDims,
  centerX: number,
  bWidthPx: number,
  ridgeTop: number,
  wallTop: number,
  drawYTop: number,
): ChimneyLayout | null {
  if (building.roofType === "flat") return null;

  const chimX = centerX + bWidthPx * 0.18;
  const chimW = Math.max(2.5, bWidthPx * 0.03);
  const chimH = Math.max(4, bWidthPx * 0.04);
  const capH = Math.max(0.8, chimH * 0.15);

  // Calculate roof line height at chimney position
  const t = Math.abs(chimX - centerX) / (bWidthPx / 2 + 1);
  const roofYAtChim = ridgeTop + t * (wallTop - ridgeTop);

  // Only draw if there's room above the panel top
  if (roofYAtChim - chimH <= drawYTop + 10) return null;

  return {
    x: chimX - chimW / 2,
    y: roofYAtChim - chimH,
    w: chimW,
    h: chimH,
    capY: roofYAtChim - chimH - capH,
    capH,
  };
}

// ─── Main Layout Computation ───────────────────────────────────────────────

/**
 * Compute the full elevation layout from project data.
 * Pure function — no rendering side effects.
 *
 * Both the React SVG renderer and jsPDF renderer call this function
 * and translate the returned positions to their respective drawing APIs.
 */
export function computeElevationLayout(
  parcel: ParcelDims,
  building: BuildingDims | null,
  ngf: number,
  materials: MergedMaterials,
  dirConfig: DirectionConfig,
  suffix: string,          // "initiale" | "projetée"
  viewport: ViewportConfig,
  terrain?: TerrainProfile,
  setbacks?: { front?: number | null; side?: number | null; rear?: number | null },
  secondaryBuildingsInput?: BuildingDims[],
): ElevationLayout {
  const { w, h, marginL, marginR, groundRatio } = viewport;

  // ── Ground line ──
  const groundY = h * groundRatio;
  const hatchBottom = h - 10;

  // ── Boundaries (natural position) ──
  const leftBXNatural = marginL;
  const rightBXNatural = w - marginR;
  const plotSpan = rightBXNatural - leftBXNatural;

  // ── Facade dimension in meters ──
  const facadeLenM = dirConfig.facadeDimension === "width" ? parcel.widthM : parcel.depthM;
  const buildingFacadeLen = building
    ? (dirConfig.facadeDimension === "width" ? building.width : building.depth)
    : 0;

  // ── Zoom scale ──
  const { pxPerM, isZoomed } = computeZoomScale(
    plotSpan,
    facadeLenM,
    buildingFacadeLen,
    building?.wallHeight ?? 0,
    (groundY - 40) * 0.65,
  );

  // ── Boundary positions (clamp if zoomed) ──
  const plotWidthPx = facadeLenM * pxPerM;
  const centerX = (leftBXNatural + rightBXNatural) / 2;
  const leftBX = isZoomed ? Math.max(10, centerX - plotWidthPx / 2) : leftBXNatural;
  const rightBX = isZoomed ? Math.min(w - 10, centerX + plotWidthPx / 2) : rightBXNatural;

  const leftBVisible = leftBX > 10 && leftBX < w - 10;
  const rightBVisible = rightBX > 10 && rightBX < w - 10;

  // ── Terrain slope ──
  let slopeAngle = 0;
  let groundLeftY = groundY;
  let groundRightY = groundY;
  if (terrain?.hasRealData && terrain.slopeDeg > 0.3) {
    // Cap visual slope to keep drawing readable
    slopeAngle = Math.min(terrain.slopeDeg, 5);
    const slopeRad = (slopeAngle * Math.PI) / 180;
    const halfSpan = (rightBX - leftBX) / 2;
    groundLeftY = groundY + halfSpan * Math.tan(slopeRad);
    groundRightY = groundY - halfSpan * Math.tan(slopeRad);
  }

  // ── Direction label ──
  const dirLabel = `${dirConfig.label} ${suffix}`;

  // ── Plot dimension line ──
  const plotDimY = 15; // near top of panel
  const plotDim: DimLine = {
    x1: leftBX,
    y1: plotDimY,
    x2: rightBX,
    y2: plotDimY,
    tickLen: 4,
    label: `${facadeLenM.toFixed(1)} m`,
    labelX: centerX,
    labelY: plotDimY,
    vertical: false,
  };

  // ── TN/TF Markers ──
  const tnMarkers: TNMarkerLayout[] = [];
  for (const bx of [leftBX, rightBX]) {
    if (bx < 15 || bx > w - 15) continue;
    tnMarkers.push({
      x: bx,
      y: groundY,
      tnLabel: { x: bx - 4, y: groundY + 1 },
      tfLabel: { x: bx + 1, y: groundY + 1 },
      ngfLabel: { x: bx, y: groundY + 7, text: `+${ngf.toFixed(2)} NGF` },
      groundLabel: { x: bx, y: groundY - 1.5, text: "TN=TF" },
    });
  }

  // ── No building — empty plot ──
  if (!building) {
    return {
      viewport,
      scale: { pxPerM, isZoomed, declared: "1 : 100" },
      ground: {
        y: groundY,
        leftX: 0,
        rightX: w,
        slopeAngle,
        leftY: groundLeftY,
        rightY: groundRightY,
      },
      hatch: { topY: groundY, bottomY: hatchBottom, leftX: 0, rightX: w },
      boundaries: {
        left: { x: leftBX, topY: 20, bottomY: hatchBottom, visible: leftBVisible, label: "Limite de propriété", labelX: leftBX - 2, labelY: (20 + groundY) / 2 },
        right: { x: rightBX, topY: 20, bottomY: hatchBottom, visible: rightBVisible, label: "Limite de propriété", labelX: rightBX + 5, labelY: (20 + groundY) / 2 },
      },
      tnMarkers,
      plotDim,
      building: null,
      secondaryBuildings: [],
      buildings: [],
      siteElements: [],
      direction: dirLabel,
      emptyPlotText: "Terrain vierge — aucune construction existante",
      emptyPlotSub: "(Aucune élévation à représenter)",
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Building present — compute full layout
  // ═══════════════════════════════════════════════════════════════════════════

  const minBuildingPx = plotSpan > 500 ? 18 : 60;
  const bWidthPx = Math.max(buildingFacadeLen * pxPerM, minBuildingPx);
  const maxWallH = (groundY - 20) * 0.65;
  const minWallH = plotSpan > 500 ? 16 : 50;
  const wallHPx = Math.min(Math.max(building.wallHeight * pxPerM, minWallH), maxWallH);
  const maxRidgeH = (groundY - 10) * 0.85;
  const minRidgeH = wallHPx + 4;
  const ridgeHPx = Math.min(Math.max(building.ridgeHeight * pxPerM, minRidgeH), maxRidgeH);
  const bX = centerX - bWidthPx / 2;
  const wallTop = groundY - wallHPx;
  const ridgeTop = groundY - ridgeHPx;

  // ── Facade variant ──
  const variant = getFacadeVariant(
    dirConfig.direction,
    building.width,
    building.depth,
    dirConfig.facadeDimension,
  );

  // ── Door ──
  const doorW = Math.min(bWidthPx * 0.055, bWidthPx > 200 ? 12 : 4.5);
  const doorH = wallHPx * 0.5;
  const door: DoorLayout | null = variant.hasDoor
    ? {
        x: centerX - doorW / 2,
        y: groundY - doorH,
        w: doorW,
        h: doorH,
        handleX: centerX + doorW / 3,
        handleY: groundY - doorH / 2,
      }
    : null;

  // ── Windows ──
  const windows = computeWindows(variant, bX, wallTop, bWidthPx, wallHPx, centerX, doorW);

  // ── Roof ──
  const roof = computeRoofLayout(building, bX, wallTop, bWidthPx, ridgeTop, centerX, pxPerM);

  // ── Fascia ──
  const overhangPx = Math.max(OVERHANG_M * pxPerM, 2);
  const fascia: FasciaLayout = {
    x1: bX - overhangPx,
    y1: wallTop,
    x2: bX + bWidthPx + overhangPx,
    y2: wallTop,
    thickness: Math.max(1, pxPerM * 0.05),
  };

  // ── Chimney ──
  const chimney = computeChimney(building, centerX, bWidthPx, ridgeTop, wallTop, 10);

  // ── Foundation ──
  const foundationH = Math.max(2, pxPerM * 0.15);
  const foundation: FoundationLayout = {
    x: bX + bWidthPx * 0.05,
    y: groundY,
    w: bWidthPx * 0.9,
    h: foundationH,
  };

  // ── Building label (below building, not on wall) ──
  const buildingLabel = {
    x: centerX,
    y: groundY + (plotSpan > 500 ? 9 : 25),
    text: building.name || "Construction projetée",
  };

  // ── Wall height dimension (left of building) ──
  const dimLX = bX - (plotSpan > 500 ? 10 : 28);
  const wallHeightDim: DimLine = {
    x1: dimLX, y1: groundY,
    x2: dimLX, y2: wallTop,
    tickLen: 3,
    label: `${building.wallHeight.toFixed(1)} m`,
    labelX: dimLX - 2,
    labelY: (groundY + wallTop) / 2,
    vertical: true,
  };

  // ── Ridge height dimension (right of building) ──
  const dimRX = bX + bWidthPx + (plotSpan > 500 ? 10 : 28);
  const ridgeHeightDim: DimLine = {
    x1: dimRX, y1: groundY,
    x2: dimRX, y2: ridgeTop,
    tickLen: 3,
    label: `${building.ridgeHeight.toFixed(1)} m`,
    labelX: dimRX + 2,
    labelY: (groundY + ridgeTop) / 2,
    vertical: true,
  };

  // ── Building width dimension ──
  const bwDimY = groundY + (plotSpan > 500 ? 5 : 14);
  const buildingWidthDim: DimLine = {
    x1: bX, y1: bwDimY,
    x2: bX + bWidthPx, y2: bwDimY,
    tickLen: 3,
    label: `${buildingFacadeLen.toFixed(1)} m`,
    labelX: centerX,
    labelY: bwDimY,
    vertical: false,
  };

  // ── Setback dimensions ──
  const setbackDimY = bwDimY + (plotSpan > 500 ? 5 : 14);
  const leftSetbackPx = bX - leftBX;
  const rightSetbackPx = rightBX - (bX + bWidthPx);
  const leftSetbackM = leftSetbackPx > 0 ? leftSetbackPx / pxPerM : 0;
  const rightSetbackM = rightSetbackPx > 0 ? rightSetbackPx / pxPerM : 0;

  // Use real setback data if available, otherwise compute from geometry
  const effectiveLeftSetback = (setbacks?.side != null && dirConfig.facadeDimension === "depth")
    ? setbacks.side
    : (setbacks?.front != null && dirConfig.direction === "sud")
    ? setbacks.front
    : leftSetbackM;
  const effectiveRightSetback = (setbacks?.side != null && dirConfig.facadeDimension === "depth")
    ? setbacks.side
    : (setbacks?.rear != null && dirConfig.direction === "sud")
    ? setbacks.rear
    : rightSetbackM;

  const setbackLeft: SetbackDim = {
    x1: leftBX,
    x2: bX,
    y: setbackDimY,
    label: `${effectiveLeftSetback.toFixed(1)} m`,
    visible: leftBVisible && leftSetbackPx > (plotSpan > 500 ? 8 : 25),
  };

  const setbackRight: SetbackDim = {
    x1: bX + bWidthPx,
    x2: rightBX,
    y: setbackDimY,
    label: `${effectiveRightSetback.toFixed(1)} m`,
    visible: rightBVisible && rightSetbackPx > (plotSpan > 500 ? 8 : 25),
  };

  // ── NGF labels ──
  const ngfLabels = {
    ground: { x: bX - (plotSpan > 500 ? 14 : 42), y: groundY + 1, text: `+${ngf.toFixed(2)} NGF` },
    wall: { x: bX - (plotSpan > 500 ? 14 : 42), y: wallTop + 1, text: `+${(ngf + building.wallHeight).toFixed(2)} NGF` },
    ridge: { x: centerX, y: ridgeTop - (plotSpan > 500 ? 6 : 18), text: `+${(ngf + building.ridgeHeight).toFixed(2)} NGF` },
    eave: { x: dimRX + 2, y: wallTop + 1, text: `Égout +${building.wallHeight.toFixed(2)}` },
    floor: { x: bX + bWidthPx + 2, y: groundY - 1, text: "Niveau RDC +0.00" },
  };

  // ── Material annotations ──
  const matAnnotX = bX + bWidthPx + (plotSpan > 500 ? 25 : 70);
  const matVisible = matAnnotX < w - 15;

  const wallMatText = materials.wallMaterial || building.wallMaterial;
  const wallClrText = materials.wallColor || building.wallColor;
  const roofMatText = materials.roofMaterial || building.roofMaterial;
  const roofClrText = materials.roofColor || building.roofColor;

  const wallAnnotation: MatAnnotation | null = matVisible
    ? {
        anchorX: bX + bWidthPx + 2,
        anchorY: (wallTop + groundY) / 2,
        labelX: matAnnotX,
        labelY: (wallTop + groundY) / 2,
        lines: [wallMatText, wallClrText ? `couleur ${wallClrText}` : ""].filter(Boolean),
      }
    : null;

  const roofAnchorY = building.roofType === "flat" ? wallTop - 3 : (wallTop + ridgeTop) / 2;
  const roofLines = [
    `Toiture en ${roofMatText.toLowerCase()}`,
    roofClrText ? `couleur ${roofClrText}` : "",
    building.roofPitch > 0 && building.roofType !== "flat" ? `Pente ${building.roofPitch}%` : "",
  ].filter(Boolean);

  const roofAnnotation: MatAnnotation | null = matVisible
    ? {
        anchorX: bX + bWidthPx + 2,
        anchorY: roofAnchorY,
        labelX: matAnnotX,
        labelY: roofAnchorY,
        lines: roofLines,
      }
    : null;

  // ── Ridge faîtage label ──
  // (already in ngfLabels.ridge, but also add the architectural label)

  // ═══════════════════════════════════════════════════════════════════════════
  // Secondary Buildings (garage, parking, etc.)
  // ═══════════════════════════════════════════════════════════════════════════

  const secondaryBuildings: SecondaryBuildingLayout[] = [];
  const siteElements: SiteElementLayout[] = [];
  const secBuildings = secondaryBuildingsInput || [];

  if (secBuildings.length > 0) {
    // Place secondary buildings to the right of the main building with gaps
    const gapPx = Math.max(15, pxPerM * 2); // 2m gap minimum
    let nextX = bX + bWidthPx + gapPx;

    // Color map for building types
    const typeColors: Record<string, string> = {
      garage: "#D4C4A8",
      parking: "#C8D6E5",
      carport: "#B8C9A0",
      pool: "#87CEEB",
      garden: "#90EE90",
      shed: "#D2B48C",
      terrace: "#E8D5B7",
      fence: "#A0916B",
    };

    // Site element config for flat landscape items
    const SITE_ELEMENT_CONFIG: Record<string, { color: string; strokeColor: string; pattern: SiteElementLayout["pattern"]; depthM: number; label: string; yOffset: number }> = {
      pool:    { color: "#87CEEB", strokeColor: "#2196F3", pattern: "water",  depthM: 1.5,  label: "Piscine",  yOffset: 0 },
      garden:  { color: "#90EE90", strokeColor: "#4CAF50", pattern: "grass",  depthM: 0.3,  label: "Jardin",   yOffset: 0 },
      terrace: { color: "#E8D5B7", strokeColor: "#A0916B", pattern: "paving", depthM: 0.15, label: "Terrasse", yOffset: -Math.max(2, pxPerM * 0.1) },
      parking: { color: "#C8D6E5", strokeColor: "#78909C", pattern: "gravel", depthM: 0.1,  label: "Parking",  yOffset: 0 },
    };

    for (const secBldg of secBuildings) {
      const secWallH = secBldg.wallHeight;
      const btype = (secBldg.name || "Structure").toLowerCase().replace(/^construction\s*/i, "");

      // ── Route flat elements (wallHeight <= 0) to siteElements[] ──
      // Also match 'carport' as a parking alias
      const normalizedName = btype.replace(/carport/g, "parking");
      const detectedFlatType = Object.keys(SITE_ELEMENT_CONFIG).find(t => normalizedName.includes(t));
      if (secWallH <= 0 && detectedFlatType) {
        const config = SITE_ELEMENT_CONFIG[detectedFlatType];
        const secFacadeLen = dirConfig.facadeDimension === "width" ? secBldg.width : secBldg.depth;
        const secWidthPx = Math.max(secFacadeLen * pxPerM, 20);
        const secDepthPx = Math.max(config.depthM * pxPerM, 4);
        const secX = nextX;
        const secCenterX = secX + secWidthPx / 2;

        // Cap: don't overflow viewport — skip this one but try remaining
        if (secX + secWidthPx > w - 20) continue;

        // Pool is sunken below ground; terrace sits slightly above; others are at ground
        const rectY = detectedFlatType === "pool"
          ? groundY  // starts at ground, extends down
          : groundY + config.yOffset - secDepthPx;

        const secBwDimY = detectedFlatType === "pool"
          ? groundY + secDepthPx + 6
          : groundY + 6;

        siteElements.push({
          rect: { x: secX, y: rectY, w: secWidthPx, h: secDepthPx },
          label: {
            x: secCenterX,
            y: detectedFlatType === "pool" ? groundY + secDepthPx + (plotSpan > 500 ? 16 : 24) : groundY + (plotSpan > 500 ? 9 : 20),
            text: config.label,
          },
          widthDim: {
            x1: secX, y1: secBwDimY,
            x2: secX + secWidthPx, y2: secBwDimY,
            tickLen: 2,
            label: `${secFacadeLen.toFixed(1)}m`,
            labelX: secCenterX,
            labelY: secBwDimY,
            vertical: false,
          },
          depthDim: detectedFlatType === "pool" ? {
            x1: secX - 8, y1: groundY,
            x2: secX - 8, y2: groundY + secDepthPx,
            tickLen: 2,
            label: `${config.depthM.toFixed(1)}m`,
            labelX: secX - 10,
            labelY: groundY + secDepthPx / 2,
            vertical: true,
          } : undefined,
          elementType: detectedFlatType,
          color: config.color,
          strokeColor: config.strokeColor,
          pattern: config.pattern,
          widthM: secFacadeLen,
          depthM: config.depthM,
        });

        nextX = secX + secWidthPx + gapPx;
        continue;
      }

      // ── Skip non-structural items with no wall height and no flat-type match ──
      if (secWallH <= 0) continue;

      const secFacadeLen = dirConfig.facadeDimension === "width" ? secBldg.width : secBldg.depth;
      const secWidthPx = Math.max(secFacadeLen * pxPerM, 20);
      const secWallHPx = Math.min(Math.max(secWallH * pxPerM, 15), maxWallH * 0.6);
      const secRidgeH = secBldg.ridgeHeight > secWallH ? secBldg.ridgeHeight : secWallH + 0.3;
      const secRidgeHPx = Math.min(Math.max(secRidgeH * pxPerM, secWallHPx + 3), maxRidgeH * 0.6);

      const secX = nextX;
      const secCenterX = secX + secWidthPx / 2;
      const secWallTop = groundY - secWallHPx;
      const secRidgeTop = groundY - secRidgeHPx;

      // Cap: don't overflow viewport
      // Cap: don't overflow viewport — skip this one but try remaining
      if (secX + secWidthPx > w - 20) continue;

      // Roof
      const secRoof = computeRoofLayout(
        secBldg, secX, secWallTop, secWidthPx, secRidgeTop, secCenterX, pxPerM,
      );

      // Fascia
      const secOverhangPx = Math.max(OVERHANG_M * pxPerM, 2);
      const secFascia: FasciaLayout = {
        x1: secX - secOverhangPx,
        y1: secWallTop,
        x2: secX + secWidthPx + secOverhangPx,
        y2: secWallTop,
        thickness: Math.max(1, pxPerM * 0.05),
      };

      // Label
      const displayName = btype.charAt(0).toUpperCase() + btype.slice(1);

      // Height dimension (left of secondary building)
      const secDimLX = secX - 8;
      const secHeightDim: DimLine = {
        x1: secDimLX, y1: groundY,
        x2: secDimLX, y2: secWallTop,
        tickLen: 2,
        label: `${secWallH.toFixed(1)}m`,
        labelX: secDimLX - 2,
        labelY: (groundY + secWallTop) / 2,
        vertical: true,
      };

      // Width dimension
      const secBwDimY = groundY + 6;
      const secWidthDim: DimLine = {
        x1: secX, y1: secBwDimY,
        x2: secX + secWidthPx, y2: secBwDimY,
        tickLen: 2,
        label: `${secFacadeLen.toFixed(1)}m`,
        labelX: secCenterX,
        labelY: secBwDimY,
        vertical: false,
      };

      const detectedType = Object.keys(typeColors).find(t => normalizedName.includes(t)) || "garage";

      secondaryBuildings.push({
        rect: { x: secX, y: secWallTop, w: secWidthPx, h: secWallHPx },
        roof: secRoof,
        fascia: secFascia,
        label: {
          x: secCenterX,
          y: groundY + (plotSpan > 500 ? 9 : 20),
          text: displayName,
        },
        color: typeColors[detectedType] || "#D4C4A8",
        buildingType: detectedType,
        heightDim: secHeightDim,
        widthDim: secWidthDim,
      });

      nextX = secX + secWidthPx + gapPx;
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // Build the unified buildings[] array
  // ═════════════════════════════════════════════════════════════════════════════

  const primaryBuildingLayout: BuildingLayout = {
    rect: { x: bX, y: wallTop, w: bWidthPx, h: wallHPx },
    roof,
    fascia,
    windows,
    door,
    chimney,
    foundation,
    label: buildingLabel,
    wallHeightDim,
    ridgeHeightDim,
    buildingWidthDim,
    setbackLeft,
    setbackRight,
    ngfLabels,
    wallAnnotation,
    roofAnnotation,
    isExisting: false,
    zDepth: 0,
    fillColor: CLR.WALLS,
  };

  const allBuildings: BuildingLayout[] = [primaryBuildingLayout];

  return {
    viewport,
    scale: { pxPerM, isZoomed, declared: "1 : 100" },
    ground: {
      y: groundY,
      leftX: 0,
      rightX: w,
      slopeAngle,
      leftY: groundLeftY,
      rightY: groundRightY,
    },
    hatch: { topY: groundY, bottomY: hatchBottom, leftX: 0, rightX: w },
    boundaries: {
      left: { x: leftBX, topY: 20, bottomY: hatchBottom, visible: leftBVisible, label: "Limite de propriété", labelX: leftBX - 2, labelY: (20 + groundY) / 2 },
      right: { x: rightBX, topY: 20, bottomY: hatchBottom, visible: rightBVisible, label: "Limite de propriété", labelX: rightBX + 5, labelY: (20 + groundY) / 2 },
    },
    tnMarkers,
    plotDim,
    building: {
      rect: { x: bX, y: wallTop, w: bWidthPx, h: wallHPx },
      roof,
      fascia,
      windows,
      door,
      chimney,
      foundation,
      label: buildingLabel,
      wallHeightDim,
      ridgeHeightDim,
      buildingWidthDim,
      setbackLeft,
      setbackRight,
      ngfLabels,
      wallAnnotation,
      roofAnnotation,
    },
    secondaryBuildings,
    buildings: allBuildings,
    siteElements,
    direction: dirLabel,
    emptyPlotText: "",
    emptyPlotSub: "",
  };
}

// ─── Wall Fill Colors ────────────────────────────────────────────────────────

const CLR = {
  WALLS: "#F5F0DC",
  WALLS_EXISTING: "#E0DDD0",
};

const BLDG_FILLS: Record<string, string> = {
  garage: "#D4C4A8",
  parking: "#C8D6E5",
  carport: "#B8C9A0",
  pool: "#87CEEB",
  garden: "#90EE90",
  shed: "#D2B48C",
  terrace: "#E8D5B7",
  fence: "#A0916B",
};

function guessBuildingFill(name: string, isExisting: boolean): string {
  if (isExisting) return CLR.WALLS_EXISTING;
  const lower = name.toLowerCase();
  for (const [key, color] of Object.entries(BLDG_FILLS)) {
    if (lower.includes(key)) return color;
  }
  return CLR.WALLS;
}

// ─── Multi-Building Layout (ElevationBuilding[] → ElevationLayout) ─────────

/**
 * 1D Orthographic Projection: project building site coordinates (in meters)
 * onto the elevation view's X-axis for a given cardinal direction.
 *
 * COORDINATE SYSTEM (site plan, top-down):
 *   - X increases to the right (East)
 *   - Y increases downward (South)
 *
 * ELEVATION VIEWS:
 *   - SUD (looking at south face, viewer faces north):
 *       svgX = siteX (left-to-right preserved)
 *       zDepth = siteY (further south = deeper behind)
 *
 *   - NORD (looking at north face, viewer faces south):
 *       svgX = parcelWidth - siteX - buildingFacadeLen (mirrored horizontally)
 *       zDepth = parcelDepth - siteY (further north = deeper behind)
 *
 *   - EST (looking at east face, viewer faces west):
 *       svgX = parcelDepth - siteY - buildingFacadeLen (Y mapped to X, mirrored)
 *       zDepth = parcelWidth - siteX (further east = deeper behind)
 *
 *   - OUEST (looking at west face, viewer faces east):
 *       svgX = siteY (Y mapped to X, preserved)
 *       zDepth = siteX (further west = deeper behind)
 *
 * @returns svgXm - the building's LEFT EDGE X position on the elevation (meters)
 * @returns zDepth - distance from viewer (for painter's algorithm, higher = further)
 */
function projectSiteToElevation(
  siteXm: number,
  siteYm: number,
  facadeWidthM: number, // building's width in this elevation direction
  parcelWidthM: number,
  parcelDepthM: number,
  direction: FacadeDirection,
): { svgXm: number; zDepth: number } {
  switch (direction) {
    case "sud":
      return {
        svgXm: siteXm - facadeWidthM / 2,
        zDepth: siteYm,
      };
    case "nord":
      return {
        svgXm: parcelWidthM - siteXm - facadeWidthM / 2,
        zDepth: parcelDepthM - siteYm,
      };
    case "est":
      return {
        svgXm: parcelDepthM - siteYm - facadeWidthM / 2,
        zDepth: parcelWidthM - siteXm,
      };
    case "ouest":
      return {
        svgXm: siteYm - facadeWidthM / 2,
        zDepth: siteXm,
      };
    default:
      return { svgXm: siteXm - facadeWidthM / 2, zDepth: 0 };
  }
}

/**
 * Compute a full elevation layout from an array of ElevationBuilding[]
 * with proper timeline filtration and absolute spatial positioning.
 *
 * This is the new entry point for PC5 rendering. It replaces the old
 * pattern of passing a single `building` + `secondaryBuildingsInput`.
 *
 * COORDINATE PIPELINE:
 *   1. siteX/siteY arrive in METERS (already converted by getCanvasPositions)
 *   2. projectSiteToElevation() maps to 1D elevation X (meters)
 *   3. svgXm * pxPerM → SVG pixel coordinates
 */
export function computeMultiBuildingLayout(
  parcel: ParcelDims,
  buildings: ElevationBuilding[],
  ngf: number,
  materials: MergedMaterials,
  dirConfig: DirectionConfig,
  suffix: string,
  viewport: ViewportConfig,
  terrain?: TerrainProfile,
  setbacks?: { front?: number | null; side?: number | null; rear?: number | null },
): ElevationLayout {
  // ── Separate flat site elements from structural buildings ──
  const FLAT_ELEMENT_TYPES = ["pool", "garden", "terrace", "parking"];
  const structuralBuildings = buildings.filter((b) => {
    if (b.wallHeight > 0) return true;
    const name = (b.name || "").toLowerCase().replace(/carport/g, "parking");
    return !FLAT_ELEMENT_TYPES.some(t => name.includes(t));
  });
  const flatElements = buildings.filter((b) => {
    if (b.wallHeight > 0) return false;
    const name = (b.name || "").toLowerCase().replace(/carport/g, "parking");
    return FLAT_ELEMENT_TYPES.some(t => name.includes(t));
  });

  // Empty array = empty plot
  if (structuralBuildings.length === 0 && flatElements.length === 0) {
    return computeElevationLayout(
      parcel, null, ngf, materials, dirConfig, suffix, viewport, terrain, setbacks,
    );
  }

  // ── Pick the primary building (largest footprint among non-existing, or just largest) ──
  const buildingsToSearch = structuralBuildings.length > 0 ? structuralBuildings : buildings;
  let primaryIdx = 0;
  let maxArea = 0;
  buildingsToSearch.forEach((b, i) => {
    const area = b.width * b.depth;
    // Prefer non-existing buildings as primary
    if (!b.isExisting && area > maxArea) {
      maxArea = area;
      primaryIdx = i;
    }
  });
  // If all are existing, just pick the largest
  if (maxArea === 0) {
    buildingsToSearch.forEach((b, i) => {
      const area = b.width * b.depth;
      if (area > maxArea) {
        maxArea = area;
        primaryIdx = i;
      }
    });
  }
  const primary = buildingsToSearch[primaryIdx];

  // ── Check if any buildings have real site positions ──
  const hasPositions = buildings.some((b) => b.siteX !== 0 || b.siteY !== 0);

  if (!hasPositions) {
    // No canvas positions → fall back to legacy single-building layout
    // Pass flat elements as secondaryBuildingsInput so they get routed to siteElements[]
    const secondary: BuildingDims[] = buildings
      .filter((b) => b !== primary)
      .filter((b) => structuralBuildings.includes(b) || flatElements.includes(b));

    const layout = computeElevationLayout(
      parcel, primary, ngf, materials, dirConfig, suffix, viewport,
      terrain, setbacks, secondary,
    );

    // Wrap primary into the unified buildings[] array
    const unifiedBuildings: BuildingLayout[] = [];
    if (layout.building) {
      unifiedBuildings.push({
        ...layout.building,
        isExisting: primary.isExisting,
        zDepth: 0,
        fillColor: guessBuildingFill(primary.name || "", primary.isExisting),
      });
    }

    return { ...layout, buildings: unifiedBuildings };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Absolute positioning path (buildings have real canvas coordinates in meters)
  // ═══════════════════════════════════════════════════════════════════════════

  // Use the primary building for scale/boundary/ground computation
  const baseLayout = computeElevationLayout(
    parcel, primary, ngf, materials, dirConfig, suffix, viewport,
    terrain, setbacks,
  );

  const { ground, scale: { pxPerM } } = baseLayout;
  const leftBX = baseLayout.boundaries.left.x;
  const rightBX = baseLayout.boundaries.right.x;
  const plotSpanPx = rightBX - leftBX;
  const maxWallH = (ground.y - 20) * 0.65;

  // The facade dimension of the parcel in meters (determines the elevation's X extent)
  const facadeLenM = dirConfig.facadeDimension === "width" ? parcel.widthM : parcel.depthM;

  // ── Project all structural buildings and sort back-to-front ──
  const projected = structuralBuildings.map((b) => {
    // The building's facade width in this elevation direction
    const bFacadeLen = dirConfig.facadeDimension === "width" ? b.width : b.depth;

    const { svgXm, zDepth } = projectSiteToElevation(
      b.siteX, b.siteY,
      bFacadeLen,
      parcel.widthM, parcel.depthM,
      dirConfig.direction,
    );

    return { ...b, svgXm, zDepth, bFacadeLen };
  });

  // Painter's algorithm: sort descending zDepth (furthest first)
  projected.sort((a, b) => b.zDepth - a.zDepth);

  // ── Build per-building layouts with absolute pixel positioning ──
  const allBuildings: BuildingLayout[] = projected.map((b) => {
    const bWidthPx = Math.max(b.bFacadeLen * pxPerM, 20);
    const bWallHPx = Math.min(Math.max(b.wallHeight * pxPerM, 15), maxWallH);
    const bRidgeHPx = Math.min(
      Math.max(b.ridgeHeight * pxPerM, bWallHPx + 4),
      maxWallH * 1.2,
    );

    // Convert meters → SVG pixels, clamped to plot boundaries
    // svgXm is the building's left edge in meters relative to parcel origin
    const rawBX = leftBX + (facadeLenM > 0 ? (b.svgXm / facadeLenM) * plotSpanPx : plotSpanPx / 2);
    const bX = Math.max(leftBX - 5, Math.min(rawBX, rightBX - bWidthPx + 5));
    const bCenterX = bX + bWidthPx / 2;
    const bWallTop = ground.y - bWallHPx;
    const bRidgeTop = ground.y - bRidgeHPx;

    const variant = getFacadeVariant(
      dirConfig.direction, b.width, b.depth, dirConfig.facadeDimension,
    );
    const doorW = Math.min(bWidthPx * 0.055, 12);
    const doorH = bWallHPx * 0.5;
    const bDoor: DoorLayout | null = variant.hasDoor && !b.isExisting
      ? {
          x: bCenterX - doorW / 2,
          y: ground.y - doorH,
          w: doorW,
          h: doorH,
          handleX: bCenterX + doorW / 3,
          handleY: ground.y - doorH / 2,
        }
      : null;

    const bWindows = computeWindows(variant, bX, bWallTop, bWidthPx, bWallHPx, bCenterX, doorW);
    const bRoof = computeRoofLayout(b, bX, bWallTop, bWidthPx, bRidgeTop, bCenterX, pxPerM);
    const overhangPx = Math.max(OVERHANG_M * pxPerM, 2);
    const bFascia: FasciaLayout = {
      x1: bX - overhangPx, y1: bWallTop,
      x2: bX + bWidthPx + overhangPx, y2: bWallTop,
      thickness: Math.max(1, pxPerM * 0.05),
    };
    const bChimney = computeChimney(b, bCenterX, bWidthPx, bRidgeTop, bWallTop, 10);
    const foundH = Math.max(2, pxPerM * 0.15);

    const dimLX = bX - 10;
    const dimRX = bX + bWidthPx + 10;
    const bwDimY = ground.y + 6;

    return {
      rect: { x: bX, y: bWallTop, w: bWidthPx, h: bWallHPx },
      roof: bRoof,
      fascia: bFascia,
      windows: bWindows,
      door: bDoor,
      chimney: bChimney,
      foundation: {
        x: bX + bWidthPx * 0.05,
        y: ground.y,
        w: bWidthPx * 0.9,
        h: foundH,
      },
      label: {
        x: bCenterX,
        y: ground.y + 12,
        text: b.name || "Construction",
      },
      wallHeightDim: {
        x1: dimLX, y1: ground.y,
        x2: dimLX, y2: bWallTop,
        tickLen: 3,
        label: `${b.wallHeight.toFixed(1)} m`,
        labelX: dimLX - 2,
        labelY: (ground.y + bWallTop) / 2,
        vertical: true,
      },
      ridgeHeightDim: {
        x1: dimRX, y1: ground.y,
        x2: dimRX, y2: bRidgeTop,
        tickLen: 3,
        label: `${b.ridgeHeight.toFixed(1)} m`,
        labelX: dimRX + 2,
        labelY: (ground.y + bRidgeTop) / 2,
        vertical: true,
      },
      buildingWidthDim: {
        x1: bX, y1: bwDimY,
        x2: bX + bWidthPx, y2: bwDimY,
        tickLen: 3,
        label: `${b.bFacadeLen.toFixed(1)} m`,
        labelX: bCenterX,
        labelY: bwDimY,
        vertical: false,
      },
      setbackLeft: { x1: leftBX, x2: bX, y: bwDimY + 10, label: "", visible: false },
      setbackRight: { x1: bX + bWidthPx, x2: rightBX, y: bwDimY + 10, label: "", visible: false },
      ngfLabels: {
        ground: { x: dimLX - 10, y: ground.y + 1, text: `+${ngf.toFixed(2)} NGF` },
        wall: { x: dimLX - 10, y: bWallTop + 1, text: `+${(ngf + b.wallHeight).toFixed(2)} NGF` },
        ridge: { x: bCenterX, y: bRidgeTop - 6, text: `+${(ngf + b.ridgeHeight).toFixed(2)} NGF` },
        eave: { x: dimRX + 2, y: bWallTop + 1, text: `Égout +${b.wallHeight.toFixed(2)}` },
        floor: { x: bX + bWidthPx + 2, y: ground.y - 1, text: "Niveau RDC +0.00" },
      },
      wallAnnotation: null,
      roofAnnotation: null,
      isExisting: b.isExisting,
      zDepth: b.zDepth,
      fillColor: guessBuildingFill(b.name || "", b.isExisting),
    } as BuildingLayout;
  });

  // ── Compute site elements for flat landscape items in the multi-building path ──
  const computedSiteElements: SiteElementLayout[] = [];
  const SITE_EL_CFG: Record<string, { color: string; strokeColor: string; pattern: SiteElementLayout["pattern"]; depthM: number; label: string }> = {
    pool:    { color: "#87CEEB", strokeColor: "#2196F3", pattern: "water",  depthM: 1.5,  label: "Piscine" },
    garden:  { color: "#90EE90", strokeColor: "#4CAF50", pattern: "grass",  depthM: 0.3,  label: "Jardin" },
    terrace: { color: "#E8D5B7", strokeColor: "#A0916B", pattern: "paving", depthM: 0.15, label: "Terrasse" },
    parking: { color: "#C8D6E5", strokeColor: "#78909C", pattern: "gravel", depthM: 0.1,  label: "Parking" },
  };

  for (const flatB of flatElements) {
    const fname = (flatB.name || "").toLowerCase().replace(/carport/g, "parking");
    const ftype = Object.keys(SITE_EL_CFG).find(t => fname.includes(t));
    if (!ftype) continue;
    const cfg = SITE_EL_CFG[ftype];

    const bFacadeLen = dirConfig.facadeDimension === "width" ? flatB.width : flatB.depth;
    const { svgXm } = projectSiteToElevation(
      flatB.siteX, flatB.siteY, bFacadeLen,
      parcel.widthM, parcel.depthM, dirConfig.direction,
    );
    const bWidthPx = Math.max(bFacadeLen * pxPerM, 20);
    const depthPx = Math.max(cfg.depthM * pxPerM, 4);

    const facadeLenM = dirConfig.facadeDimension === "width" ? parcel.widthM : parcel.depthM;
    const rawBX = leftBX + (facadeLenM > 0 ? (svgXm / facadeLenM) * plotSpanPx : plotSpanPx / 2);
    const elX = Math.max(leftBX - 5, Math.min(rawBX, rightBX - bWidthPx + 5));
    const elCenterX = elX + bWidthPx / 2;

    const rectY = ftype === "pool" ? ground.y : ground.y - depthPx;
    const dimY = ftype === "pool" ? ground.y + depthPx + 6 : ground.y + 6;

    computedSiteElements.push({
      rect: { x: elX, y: rectY, w: bWidthPx, h: depthPx },
      label: {
        x: elCenterX,
        y: ftype === "pool" ? ground.y + depthPx + 16 : ground.y + 12,
        text: cfg.label,
      },
      widthDim: {
        x1: elX, y1: dimY,
        x2: elX + bWidthPx, y2: dimY,
        tickLen: 2,
        label: `${bFacadeLen.toFixed(1)}m`,
        labelX: elCenterX,
        labelY: dimY,
        vertical: false,
      },
      depthDim: ftype === "pool" ? {
        x1: elX - 8, y1: ground.y,
        x2: elX - 8, y2: ground.y + depthPx,
        tickLen: 2,
        label: `${cfg.depthM.toFixed(1)}m`,
        labelX: elX - 10,
        labelY: ground.y + depthPx / 2,
        vertical: true,
      } : undefined,
      elementType: ftype,
      color: cfg.color,
      strokeColor: cfg.strokeColor,
      pattern: cfg.pattern,
      widthM: bFacadeLen,
      depthM: cfg.depthM,
    });
  }

  return {
    ...baseLayout,
    buildings: allBuildings,
    secondaryBuildings: [], // unified into buildings[]
    siteElements: [...(baseLayout.siteElements || []), ...computedSiteElements],
  };
}
