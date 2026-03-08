/**
 * PLU Rules — Unified TypeScript schema for structured rule extraction.
 *
 * This interface represents the JSON structure that Gemini MUST output when
 * analyzing a French PLU (Plan Local d'Urbanisme) regulation document.
 *
 * Shared between:
 *  - /api/analyze-plu (backend: Gemini structured output)
 *  - Frontend consumers (compliance display, site-plan overlay)
 */

// ─── Main structured output ──────────────────────────────────────────────────

export interface PluRules {
  // ─── Numeric rules ─────────────────────────────────────────────────────────
  /** CES: coefficient d'emprise au sol as decimal (e.g. 0.4 for 40%). null if not found. */
  maxCoverageRatio: number | null;
  /** Max height at eave / facade / égout de toiture in metres. null if not found. */
  maxHeight: number | null;
  /** Max height at ridge / faîtage in metres. null if not found. */
  maxRidgeHeight: number | null;
  /** Required setbacks in metres. String value accepted for formulas like "H/2 avec minimum 3m". */
  setbacks: {
    front: number | string | null;
    side: number | string | null;
    rear: number | string | null;
  };
  /** Minimum plot area in m² (superficie minimale de terrain). null if not found. */
  minPlotArea: number | null;
  /** COS: coefficient d'occupation des sols as decimal. null if not applicable/found. */
  maxFloorAreaRatio: number | null;
  /** Minimum green/permeable surface as percentage number (e.g. 30 for 30%). null if not found. */
  greenSpaceMinPercent: number | null;
  /** Max fence height in metres. null if not found. */
  maxFenceHeight: number | null;

  // ─── Qualitative rules ─────────────────────────────────────────────────────
  /** Allowed roof types, e.g. ["2 pentes", "4 pentes", "toiture terrasse"]. Empty if not specified. */
  allowedRoofTypes: string[];
  /** Roof slope range as string, e.g. "30 à 45 degrés". null if not found. */
  roofSlopeRange: string | null;
  /** Explicitly allowed roof materials, e.g. ["tuile terre cuite", "ardoise"]. */
  allowedRoofMaterials: string[];
  /** Explicitly forbidden roof materials. */
  forbiddenRoofMaterials: string[];
  /** Allowed facade materials, e.g. ["enduit", "pierre"]. */
  allowedFacadeMaterials: string[];
  /** Forbidden facade materials, e.g. ["bardage métallique"]. */
  forbiddenFacadeMaterials: string[];
  /** Allowed facade colors, e.g. ["blanc cassé", "beige", "pierre"]. */
  allowedFacadeColors: string[];
  /** Explicitly forbidden facade colors, e.g. ["couleurs vives"]. */
  forbiddenFacadeColors: string[];
  /** Allowed joinery/window frame materials. */
  allowedJoineryMaterials: string[];
  /** Forbidden joinery/window colors. */
  forbiddenJoineryColors: string[];
  /** Parking requirement as string, e.g. "1 place par logement" or "1 place par 60m² SHON". null if not found. */
  parkingRequirements: string | null;
  /** Rules for annexes (garages, abris de jardin, piscines, etc.). null if not found. */
  annexRules: string | null;

  // ─── Heritage / ABF ────────────────────────────────────────────────────────
  /** Whether ABF (Architecte des Bâtiments de France) approval is explicitly required. */
  architectRequired: boolean;
  /** Specific constraints when in ABF zone. null if not applicable. */
  abfSpecificConstraints: string | null;
  /** Any heritage-related notes from the regulation. null if not applicable. */
  heritageNotes: string | null;

  // ─── General ───────────────────────────────────────────────────────────────
  /** Any critical qualitative constraint or edge-case note. */
  notes: string;
  /** Self-assessed confidence in the extraction quality. */
  extractionConfidence: "high" | "medium" | "low";
}

// ─── Legacy compat (re-export existing types used by the qualitative analysis) ─

export interface AnalysisItem {
  item: string;
  reglementation: string;
  conformite: "OUI" | "NON" | "A VERIFIER" | "Non concerné";
}

export interface AnalysisSection {
  sectionTitle: string;
  items: AnalysisItem[];
}

export interface DeepPluAnalysis {
  situationProjet?: {
    lotissement?: boolean;
    abf?: boolean;
    ppr?: boolean;
    details?: string;
  };
  usageDesSols?: AnalysisSection;
  conditionsOccupation?: AnalysisSection;
  implantationVolumetrie?: AnalysisSection;
  aspectExterieur?: AnalysisSection;
  stationnement?: AnalysisSection;
  espacesLibres?: AnalysisSection;
  reseauxVrd?: AnalysisSection;
  autresReglementations?: AnalysisSection;
  conclusion?: { resume: string; typeDossier: string };
  zoneClassification?: string;
  zoneDescription?: string;
  summary?: Record<string, unknown>;
  [key: string]: unknown;
}

// ─── Defaults / Fallbacks ────────────────────────────────────────────────────

export function createFallbackPluRules(): PluRules {
  return {
    maxCoverageRatio: null,
    maxHeight: null,
    maxRidgeHeight: null,
    setbacks: { front: null, side: null, rear: null },
    minPlotArea: null,
    maxFloorAreaRatio: null,
    greenSpaceMinPercent: null,
    maxFenceHeight: null,
    allowedRoofTypes: [],
    roofSlopeRange: null,
    allowedRoofMaterials: [],
    forbiddenRoofMaterials: [],
    allowedFacadeMaterials: [],
    forbiddenFacadeMaterials: [],
    allowedFacadeColors: [],
    forbiddenFacadeColors: [],
    allowedJoineryMaterials: [],
    forbiddenJoineryColors: [],
    parkingRequirements: null,
    annexRules: null,
    architectRequired: false,
    abfSpecificConstraints: null,
    heritageNotes: null,
    notes: "",
    extractionConfidence: "low",
  };
}
