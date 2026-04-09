/**
 * Centralized Data Extraction Utility
 *
 * Single source of truth for all PC generators.
 * Wraps existing helpers (getBuildingData, getParcelDimensions, getNGFValue,
 * getSurfaceAreas) and adds terrain profile, materials merge, and
 * regulatory context extraction.
 *
 * Every generator can call extractProjectData() once and get a fully
 * typed, validated, fallback-aware data object. No more independent
 * parsing with inconsistent defaults.
 */

import {
  DossierProjectData,
  JobEntry,
  MaterialsData,
} from "./types";
import {
  getBuildingData,
  getParcelDimensions,
  getNGFValue,
  getSurfaceAreas,
  type BuildingDims,
  type ElevationBuilding,
  type ParcelDims,
  type SurfaceAreas,
} from "./svg-helpers";

// ─── Terrain Profile ───────────────────────────────────────────────────────

export interface TerrainPoint {
  x: number;      // distance along section line in meters
  elevation: number; // NGF elevation in meters
}

export interface TerrainProfile {
  /** Points along the primary section line (TN = terrain naturel) */
  points: TerrainPoint[];
  /** Average ground slope in degrees (0 = flat) */
  slopeDeg: number;
  /** Minimum NGF elevation across all points */
  minElev: number;
  /** Maximum NGF elevation across all points */
  maxElev: number;
  /** Whether real terrain data exists (vs. synthetic flat line) */
  hasRealData: boolean;
}

/** Extract terrain profile from terrainData.profiles or elevationPoints */
function getTerrainProfile(project: DossierProjectData): TerrainProfile {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const td = project.terrainData as Record<string, any> | null;
  if (!td) return flatProfile(getNGFValue(project));

  // Priority 1: profiles array (from section line tool)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profiles = td.profiles as any;
  if (Array.isArray(profiles) && profiles.length > 0) {
    const firstProfile = profiles[0];
    const pts = Array.isArray(firstProfile.points) ? firstProfile.points : [];
    if (pts.length >= 2) {
      const mapped: TerrainPoint[] = pts.map((p: Record<string, number>, i: number) => ({
        x: typeof p.distance === "number" ? p.distance : i * 2,
        elevation: typeof p.elevation === "number" ? p.elevation : typeof p.z === "number" ? p.z : 0,
      }));
      return buildProfile(mapped);
    }
  }

  // Priority 2: elevationPoints array
  const epRaw = td.elevationPoints;
  if (Array.isArray(epRaw) && epRaw.length >= 2) {
    // Sort by x coordinate and map to TerrainPoints
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sorted = [...epRaw].sort((a: any, b: any) => (a.x ?? 0) - (b.x ?? 0));
    const mapped: TerrainPoint[] = sorted.map((p: Record<string, number>, i: number) => ({
      x: typeof p.x === "number" ? p.x : i * 5,
      elevation: typeof p.elevation === "number" ? p.elevation : typeof p.z === "number" ? p.z : typeof p.value === "number" ? p.value : 0,
    }));
    return buildProfile(mapped);
  }

  // Priority 3: single elevation value → flat line
  return flatProfile(getNGFValue(project));
}

function buildProfile(points: TerrainPoint[]): TerrainProfile {
  const elevations = points.map((p) => p.elevation);
  const minElev = Math.min(...elevations);
  const maxElev = Math.max(...elevations);
  const dx = points[points.length - 1].x - points[0].x;
  const dy = maxElev - minElev;
  const slopeDeg = dx > 0 ? Math.atan2(dy, dx) * (180 / Math.PI) : 0;
  return { points, slopeDeg, minElev, maxElev, hasRealData: true };
}

function flatProfile(ngfValue: number): TerrainProfile {
  return {
    points: [
      { x: 0, elevation: ngfValue },
      { x: 30, elevation: ngfValue },
    ],
    slopeDeg: 0,
    minElev: ngfValue,
    maxElev: ngfValue,
    hasRealData: false,
  };
}

// ─── Materials Merge ───────────────────────────────────────────────────────

export interface MergedMaterials {
  wallMaterial: string;
  wallColor: string;
  roofMaterial: string;
  roofCovering: string;
  roofColor: string;
  roofRAL: string;
  joineryMaterial: string;
  trimColor: string;
  gutterMaterial: string;
  existingFacade: string;
  structureMaterial: string;
  /** True if any real material data exists (not just defaults) */
  hasRealData: boolean;
}

/** Merge materials from projectDescription.materials AND building3D.materials */
function getMergedMaterials(project: DossierProjectData): MergedMaterials {
  const descMats = (project.projectDescription?.materials || {}) as Record<string, string | number | undefined>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b3dRaw = project.sitePlanData?.building3D as Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b3d: Record<string, any> | null =
    Array.isArray(b3dRaw?.buildings) && b3dRaw!.buildings.length > 0
      ? b3dRaw!.buildings[0]
      : b3dRaw;

  const b3dMats = (b3d?.materials || {}) as Record<string, string | undefined>;
  const b3dRoof = (b3d?.roof || {}) as Record<string, string | number | undefined>;

  // Merge: building3D takes precedence over projectDescription
  const pick = (
    ...sources: Array<string | number | undefined | null>
  ): string => {
    for (const s of sources) {
      if (s != null && String(s).trim()) return String(s).trim();
    }
    return "";
  };

  const wallMaterial = pick(b3dMats.walls, descMats.wallMaterial, descMats.matExtMaterial);
  const roofMaterial = pick(
    b3dRoof.material as string | undefined,
    b3dMats.roof,
    descMats.roofMaterial as string | undefined,
    descMats.roofCovering as string | undefined,
  );

  const hasRealData = !!(wallMaterial || roofMaterial);

  return {
    wallMaterial: wallMaterial || "À confirmer",
    wallColor: pick(descMats.wallColor, descMats.matExtColor, b3d?.wallColor),
    roofMaterial: roofMaterial || "À confirmer",
    roofCovering: pick(descMats.roofCovering as string | undefined, b3dRoof.material as string | undefined),
    roofColor: pick(descMats.roofColor, b3d?.roofColor as string | undefined),
    roofRAL: pick(descMats.roofPan1RAL as string | undefined),
    joineryMaterial: pick(descMats.joineryMaterial as string | undefined),
    trimColor: pick(descMats.trimColor as string | undefined),
    gutterMaterial: pick(descMats.gutterMaterial as string | undefined),
    existingFacade: pick(descMats.existingFacade as string | undefined),
    structureMaterial: pick(descMats.structureMaterial as string | undefined),
    hasRealData,
  };
}

// ─── Regulatory Context ────────────────────────────────────────────────────

export interface RegulatoryContext {
  zoneType: string;
  maxCoverageRatio: number | null;   // CES: coefficient d'emprise au sol (0–1)
  maxHeight: number | null;          // meters
  minGreenPct: number | null;        // percentage (0–100)
  setbacks: {
    front: number | null;
    side: number | null;
    rear: number | null;
  };
  includeOverhangInFootprint: boolean;
  /** True if regulatory analysis data exists for this project */
  hasRealData: boolean;
}

/** Extract regulatory context from the regulatoryData field */
function getRegulatoryContext(project: DossierProjectData): RegulatoryContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reg = (project as any).regulatoryData as Record<string, any> | null;
  if (!reg) {
    return {
      zoneType: "",
      maxCoverageRatio: null,
      maxHeight: null,
      minGreenPct: null,
      setbacks: { front: null, side: null, rear: null },
      includeOverhangInFootprint: false,
      hasRealData: false,
    };
  }

  const ai = reg.aiAnalysis || reg;

  return {
    zoneType: String(ai.zoneType || reg.zoneType || ""),
    maxCoverageRatio: typeof ai.maxCoverageRatio === "number" ? ai.maxCoverageRatio : null,
    maxHeight: typeof ai.maxHeight === "number" ? ai.maxHeight : null,
    minGreenPct: typeof ai.minGreenPct === "number" ? ai.minGreenPct : null,
    setbacks: {
      front: typeof ai.setbacks?.front === "number" ? ai.setbacks.front : null,
      side: typeof ai.setbacks?.side === "number" ? ai.setbacks.side : null,
      rear: typeof ai.setbacks?.rear === "number" ? ai.setbacks.rear : null,
    },
    includeOverhangInFootprint: ai.includeOverhangInFootprint === true,
    hasRealData: true,
  };
}

// ─── All Buildings ─────────────────────────────────────────────────────────

export interface AllBuildings {
  /** Primary building (largest or first) — used for cross-section/elevation */
  primary: BuildingDims;
  /** All buildings from building3D array */
  all: BuildingDims[];
  /** Total footprint in m² */
  totalFootprint: number;
  /** Whether real building data exists (not just defaults) */
  hasRealData: boolean;
}

/** Extract all buildings, not just the first one */
function getAllBuildings(project: DossierProjectData): AllBuildings {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b3dRaw = project.sitePlanData?.building3D as Record<string, any> | null;
  const buildings = Array.isArray(b3dRaw?.buildings) ? b3dRaw!.buildings : [];

  if (buildings.length === 0) {
    // Fall back to the existing single-building extraction
    const primary = getBuildingData(project);
    return {
      primary,
      all: [primary],
      totalFootprint: primary.width * primary.depth,
      hasRealData: false,
    };
  }

  const jobs = (project.projectDescription?.jobs || []) as unknown as Array<Record<string, unknown>>;
  const mats = (project.projectDescription?.materials || {}) as Record<string, unknown>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapped: BuildingDims[] = buildings.map((b3d: Record<string, any>) => {
    const mainJob = jobs[0] || {};
    const wallH =
      Number(b3d.wallHeights?.ground) ||
      Number(b3d.wallHeight) ||
      Number(mainJob.wallHeight) ||
      2.5;
    const ridgeH =
      Number(b3d.ridgeHeight) ||
      (wallH > 0 ? wallH + 0.7 : 3.2);

    return {
      width: Number(b3d.width) || 8,
      depth: Number(b3d.depth) || 6,
      wallHeight: wallH,
      ridgeHeight: ridgeH,
      roofType: String(b3d.roof?.type || b3d.roofType || "gable"),
      roofPitch: Number(b3d.roof?.pitch || b3d.roofPitch) || 30,
      roofMaterial: String(
        b3d.roof?.material ||
        b3d.materials?.roof ||
        (mats as Record<string, string>)?.roofCovering ||
        "Tuiles"
      ),
      roofColor: String(b3d.roofColor || (mats as Record<string, string>)?.roofColor || ""),
      wallMaterial: String(
        b3d.materials?.walls ||
        b3d.wallMaterial ||
        (mats as Record<string, string>)?.wallMaterial ||
        "Enduit"
      ),
      wallColor: String(b3d.wallColor || (mats as Record<string, string>)?.wallColor || ""),
      name: String(b3d.name || "Construction projetée"),
    };
  });

  // Primary = largest by footprint
  const sorted = [...mapped].sort((a, b) => (b.width * b.depth) - (a.width * a.depth));
  const totalFootprint = mapped.reduce((sum, b) => sum + b.width * b.depth, 0);

  return {
    primary: sorted[0],
    all: mapped,
    totalFootprint,
    hasRealData: true,
  };
}

// ─── Project Identity ──────────────────────────────────────────────────────

export interface ProjectIdentity {
  name: string;
  address: string;
  municipality: string;
  departement: string;
  postalCode: string;
  parcelIds: string;
  authorizationType: string;
  authorizationLabel: string;
  applicantName: string;
  scale: string;
  coordinates: { lat: number; lng: number } | null;
}

function getProjectIdentity(project: DossierProjectData): ProjectIdentity {
  const desc = project.projectDescription;
  let coords: { lat: number; lng: number } | null = null;
  if (project.coordinates) {
    try {
      coords = JSON.parse(project.coordinates);
    } catch { /* ignore */ }
  }

  const authType = project.authorizationType || "PC";
  return {
    name: project.name || "Projet sans nom",
    address: project.address || "Adresse non renseignée",
    municipality: project.municipality || "",
    departement: project.departement || "",
    postalCode: project.postalCode || "",
    parcelIds: project.parcelIds || "",
    authorizationType: authType,
    authorizationLabel: authType === "DP" ? "Déclaration Préalable" : "Permis de Construire",
    applicantName: [desc?.applicantFirstNames, desc?.applicantName].filter(Boolean).join(" ") || "—",
    scale: project.scale || "1:100",
    coordinates: coords,
  };
}

// ─── Canvas Position Cross-Reference ───────────────────────────────────────

/**
 * Extract building canvas positions from the Fabric.js canvasData JSON.
 *
 * The site-plan editor stores building positions in the `canvasData` field.
 * Each canvas object with a `buildingDetailId` represents a building on the
 * 2D plan. We extract their center coordinates (in canvas pixels) and
 * convert to meters using the project's scale.
 */
function getCanvasPositions(
  project: DossierProjectData,
): Map<string, { centerXm: number; centerYm: number }> {
  const result = new Map<string, { centerXm: number; centerYm: number }>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = project.sitePlanData?.canvasData as any;
  if (!raw) return result;

  // Determine scale (pixels per meter)
  const scaleStr = project.scale || "1:100";
  const scaleMatch = scaleStr.match(/(\d+)\s*:\s*(\d+)/);
  // Default: 1:100 → 10 px/m (from SCALES constant in site-plan)
  let pxPerM = 10;
  if (scaleMatch) {
    const ratio = Number(scaleMatch[2]) / Number(scaleMatch[1]);
    // At 1:100 the editor uses 10px/m, at 1:50 → 20px/m, at 1:200 → 5px/m
    pxPerM = 1000 / ratio;
  }

  try {
    const canvasJson = typeof raw === "string" ? JSON.parse(raw) : raw;
    const objects = Array.isArray(canvasJson?.objects) ? canvasJson.objects : [];

    for (const obj of objects) {
      const bdId = obj.buildingDetailId || obj._buildingDetailId;
      if (!bdId) continue;

      const left = Number(obj.left) || 0;
      const top = Number(obj.top) || 0;
      const w = (Number(obj.width) || 0) * (Number(obj.scaleX) || 1);
      const h = (Number(obj.height) || 0) * (Number(obj.scaleY) || 1);

      // Fabric stores top-left corner; compute center
      const centerXpx = left + w / 2;
      const centerYpx = top + h / 2;

      result.set(bdId, {
        centerXm: centerXpx / pxPerM,
        centerYm: centerYpx / pxPerM,
      });
    }
  } catch {
    // Canvas data is corrupted or unparseable — fall back to no positions
  }

  return result;
}

// ─── Timeline-Filtered Building Extraction ─────────────────────────────────

/**
 * Determine whether `isExisting` is explicitly set on ANY building in the array.
 * If at least one building has `isExisting === true` or `isExisting === false`,
 * the flag is considered "reliable" and we trust the stored values.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasExplicitExistingFlag(buildings: Array<Record<string, any>>): boolean {
  return buildings.some(
    (b) => b.isExisting === true || b.isExisting === false,
  );
}

/**
 * Convert raw building3D entries into ElevationBuilding[] with canvas positions.
 *
 * SMART INFERENCE RULES for `isExisting`:
 *   1. If buildings have explicit `isExisting` booleans → trust them.
 *   2. If NO building has the flag (undefined everywhere):
 *      - `new_construction` → ALL buildings are new → PC5.1 = empty plot.
 *      - `existing_extension` | `outdoor` | anything else → the LARGEST
 *        building (by footprint) is tagged existing. The rest are new.
 *
 * @param filter - 'initial' returns only isExisting buildings,
 *                 'projected' returns ALL buildings.
 * @param projectNature - inferred project nature string.
 */
function getElevationBuildings(
  project: DossierProjectData,
  filter: "initial" | "projected",
  projectNature: string,
): ElevationBuilding[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b3dRaw = project.sitePlanData?.building3D as Record<string, any> | null;
  const buildings = Array.isArray(b3dRaw?.buildings) ? b3dRaw!.buildings : [];

  if (buildings.length === 0) {
    // No building3D data — synthesize from job-level data
    const primary = getBuildingData(project);
    if (filter === "initial" && projectNature === "new_construction") {
      // Pure new construction → PC5.1 shows "Terrain vierge"
      return [];
    }
    return [{
      ...primary,
      siteX: 0,
      siteY: 0,
      isExisting: filter === "initial",
    }];
  }

  const canvasPositions = getCanvasPositions(project);
  const jobs = (project.projectDescription?.jobs || []) as unknown as Array<Record<string, unknown>>;
  const mats = (project.projectDescription?.materials || {}) as Record<string, unknown>;

  // ── Determine isExisting inference strategy ──
  const flagsReliable = hasExplicitExistingFlag(buildings);

  // If flags are unreliable AND project is NOT new_construction,
  // find the largest building (by footprint) to tag as existing.
  let largestIdx = -1;
  if (!flagsReliable && projectNature !== "new_construction") {
    let maxArea = 0;
    buildings.forEach((b: Record<string, unknown>, i: number) => {
      const area = (Number(b.width) || 0) * (Number(b.depth) || 0);
      if (area > maxArea) {
        maxArea = area;
        largestIdx = i;
      }
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapped: ElevationBuilding[] = buildings.map((b3d: Record<string, any>, idx: number) => {
    const mainJob = jobs[0] || {};
    const wallH = (() => {
      const ground = b3d.wallHeights?.ground;
      if (ground !== undefined && ground !== null && ground !== "") return Number(ground);
      const wh = b3d.wallHeight;
      if (wh !== undefined && wh !== null && wh !== "") return Number(wh);
      const jWh = (mainJob as Record<string, unknown>).wallHeight;
      if (jWh !== undefined && jWh !== null && jWh !== "") return Number(jWh);
      return 2.5;
    })();
    const ridgeH =
      Number(b3d.ridgeHeight) ||
      (wallH > 0 ? wallH + 0.7 : 0);

    const bdId = String(b3d.id || "");
    const pos = canvasPositions.get(bdId);

    // ── Resolve isExisting ──
    let resolvedExisting: boolean;
    if (flagsReliable) {
      // Trust the explicitly stored boolean
      resolvedExisting = b3d.isExisting === true;
    } else if (projectNature === "new_construction") {
      // All buildings are new
      resolvedExisting = false;
    } else {
      // Extension/outdoor: largest building = existing, rest = new
      resolvedExisting = idx === largestIdx;
    }

    return {
      width: Number(b3d.width) || 8,
      depth: Number(b3d.depth) || 6,
      wallHeight: wallH,
      ridgeHeight: ridgeH,
      roofType: String(b3d.roof?.type || b3d.roofType || "gable"),
      roofPitch: Number(b3d.roof?.pitch || b3d.roofPitch) || 30,
      roofMaterial: String(
        b3d.roof?.material ||
        b3d.materials?.roof ||
        (mats as Record<string, string>)?.roofCovering ||
        "Tuiles"
      ),
      roofColor: String(b3d.roofColor || (mats as Record<string, string>)?.roofColor || ""),
      wallMaterial: String(
        b3d.materials?.walls ||
        b3d.wallMaterial ||
        (mats as Record<string, string>)?.wallMaterial ||
        "Enduit"
      ),
      wallColor: String(b3d.wallColor || (mats as Record<string, string>)?.wallColor || ""),
      name: String(b3d.name || (resolvedExisting ? "Maison existante" : "Construction projetée")),
      // ── Elevation-specific fields ──
      siteX: pos?.centerXm ?? 0,
      siteY: pos?.centerYm ?? 0,
      isExisting: resolvedExisting,
      buildingId: bdId || undefined,
    };
  });

  // Apply timeline filter
  if (filter === "initial") {
    const existing = mapped.filter((b) => b.isExisting);
    return existing;
  }

  // 'projected' = all buildings (existing + new)
  return mapped;
}

// ─── Main Interface & Function ─────────────────────────────────────────────

export interface ExtractedProjectData {
  /** Project identity (name, address, parcel, auth type) */
  identity: ProjectIdentity;
  /** Primary building dimensions (backward-compatible with getBuildingData) */
  building: BuildingDims;
  /** All buildings in the project */
  buildings: AllBuildings;
  /** Existing building for PC5.1 initial state (null = empty plot) */
  existingBuilding: BuildingDims | null;
  /** Project nature: 'new_construction' | 'existing_extension' | 'work_on_existing' | etc. */
  projectNature: string;
  /** Parcel dimensions from GeoJSON geometry */
  parcel: ParcelDims;
  /** NGF altitude at project site */
  ngfAltitude: number;
  /** Surface areas and coverage coefficients */
  surfaces: SurfaceAreas;
  /** Terrain profile for cross-section drawings */
  terrain: TerrainProfile;
  /** Merged materials from all sources */
  materials: MergedMaterials;
  /** PLU regulatory context (setbacks, CES, heights) */
  regulatory: RegulatoryContext;
  /** Project jobs from description */
  jobs: JobEntry[];
  /** Raw project data for edge cases */
  raw: DossierProjectData;

  // ── PC5 Elevation Engine: timeline-filtered building arrays ──

  /** Buildings for PC5.1 (Initial State): only isExisting === true */
  initialBuildings: ElevationBuilding[];
  /** Buildings for PC5.2 (Projected State): ALL buildings */
  projectedBuildings: ElevationBuilding[];
}

/**
 * Extract and normalize all project data needed by PC generators.
 *
 * Call this ONCE per dossier generation and pass the result to all generators.
 * Each field is strongly typed with sensible defaults — no generator should
 * ever need to parse raw JSON or check for null.
 */
export function extractProjectData(project: DossierProjectData): ExtractedProjectData {
  const jobs = (project.projectDescription?.jobs || []) as JobEntry[];
  const mainJob = (jobs[0] || {}) as unknown as Record<string, unknown>;
  const nature = String(mainJob.nature || "new_construction");

  return {
    identity: getProjectIdentity(project),
    building: getBuildingData(project),
    buildings: getAllBuildings(project),
    existingBuilding: getExistingBuilding(project, nature),
    projectNature: nature,
    parcel: getParcelDimensions(project.parcelGeometry, project.parcelArea),
    ngfAltitude: getNGFValue(project),
    surfaces: getSurfaceAreas(project),
    terrain: getTerrainProfile(project),
    materials: getMergedMaterials(project),
    regulatory: getRegulatoryContext(project),
    jobs,
    raw: project,
    // ── PC5 Elevation Engine ──
    initialBuildings: getElevationBuildings(project, "initial", nature),
    projectedBuildings: getElevationBuildings(project, "projected", nature),
  };
}

// ─── Existing Building ────────────────────────────────────────────────────

/**
 * Extract existing building for PC5.1 initial state.
 *
 * ALWAYS returns a building — PC5.1 must show the existing state of the
 * property per French building permit requirements. Even for "new construction"
 * projects (carports, garages), there is typically an existing house on the lot.
 *
 * The building data comes from (in priority order):
 *   1. existingBuildingsData (dedicated existing building record)
 *   2. building3D data (the main building in the 3D editor)
 *   3. Job-level dimensions (footprint, wall heights from the job form)
 *   4. Sensible defaults (8m × 6m, 2.5m walls)
 */
function getExistingBuilding(
  project: DossierProjectData,
  _nature: string
): BuildingDims | null {
  // Try existingBuildingsData first (dedicated field for existing structures)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingData = (project as any).existingBuildingsData;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing: Record<string, any> | null = Array.isArray(existingData)
    ? existingData[0]
    : existingData || null;

  // Fall back to building3D data — in most projects the 3D building IS the existing house
  const building = getBuildingData(project);
  const jobs = (project.projectDescription?.jobs || []) as unknown as Array<Record<string, unknown>>;
  const mainJob = jobs[0] || {};

  const width =
    Number(existing?.width) ||
    (mainJob.existingFootprint
      ? Math.sqrt(Number(mainJob.existingFootprint))
      : 0) ||
    building.width;

  const depth = Number(existing?.depth) || Number(building.depth) || width * 0.75;

  return {
    width,
    depth,
    wallHeight: Number(existing?.wallHeight) || building.wallHeight,
    ridgeHeight: Number(existing?.ridgeHeight) || building.ridgeHeight,
    roofType: String(existing?.roofType || building.roofType),
    roofPitch: Number(existing?.roofPitch) || building.roofPitch,
    roofMaterial: String(existing?.roofMaterial || building.roofMaterial),
    roofColor: String(existing?.roofColor || building.roofColor),
    wallMaterial: String(existing?.wallMaterial || building.wallMaterial),
    wallColor: String(existing?.wallColor || building.wallColor),
    name: "Construction existante",
  };
}
