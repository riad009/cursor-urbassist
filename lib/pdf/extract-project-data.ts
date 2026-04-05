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
  };
}

// ─── Existing Building ────────────────────────────────────────────────────

/**
 * Extract existing building for PC5.1 initial state.
 * Returns null for new construction on virgin land ("Terrain vierge").
 * Returns building data for extensions/renovations (the existing structure to show).
 */
function getExistingBuilding(
  project: DossierProjectData,
  nature: string
): BuildingDims | null {
  // For pure new construction, initial state is empty plot
  const isExtensionOrRenovation =
    nature === "existing_extension" ||
    nature === "work_on_existing" ||
    nature === "renovation" ||
    nature === "extension";

  if (!isExtensionOrRenovation) return null;

  // Try existingBuildingsData first
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingData = (project as any).existingBuildingsData;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing: Record<string, any> | null = Array.isArray(existingData)
    ? existingData[0]
    : existingData || null;

  // Fall back to building3D data (the user's building IS the existing one for extensions)
  const building = getBuildingData(project);
  const jobs = (project.projectDescription?.jobs || []) as unknown as Array<Record<string, unknown>>;
  const mainJob = jobs[0] || {};

  const width =
    Number(existing?.width) ||
    (mainJob.existingFootprint
      ? Math.sqrt(Number(mainJob.existingFootprint))
      : 0) ||
    building.width;

  const depth = Number(existing?.depth) || width * 0.75;

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
