/**
 * Phase 5 — Construction Type Differential Logic
 *
 * Per-type regulatory rule table based on French PLU / Code de l'urbanisme.
 * These are TYPE-SPECIFIC overrides layered on top of zone-level PLU rules.
 *
 * Key French law references:
 *  - Art. R.421-2: Exemptions from permit for small constructions
 *  - Art. R.421-9: Declarations for annexes < 20m²
 *  - Art. L.421-1: Permit requirements
 */

export type ConstructionType =
  | "main_house"
  | "extension"
  | "shed"
  | "carport"
  | "pool"
  | "annex";

export interface ConstructionTypeRule {
  /** Display label (FR/EN) */
  label: string;
  labelFr: string;
  emoji: string;
  /**
   * Setback overrides for this type.
   * null = use PLU zone rule (no override)
   * 0    = allowed on plot boundary
   */
  setbacks: {
    front: number | null;
    side: number | null;
    rear: number | null;
  };
  /** Max allowed height (m). null = use PLU zone rule. */
  maxHeight: number | null;
  /** Max ridge height (m). null = use PLU zone rule. */
  maxRidgeHeight: number | null;
  /**
   * Whether this element contributes to CES (emprise au sol).
   * Pools are excluded from CES in most French PLUs.
   */
  countInCES: boolean;
  /**
   * Permit exemption threshold (m²).
   * Elements ≤ this area may be exempt from DP/PC.
   * null = no auto exemption (full rules apply).
   */
  exemptUpToM2: number | null;
  /** Permit type required above the exempt threshold */
  permitAboveExempt: "DP" | "PC" | null;
  /**
   * Optional note shown in compliance panel.
   */
  note: string;
}

/**
 * Master construction type rule table.
 * All setback values are in metres.
 */
export const CONSTRUCTION_TYPE_RULES: Record<ConstructionType, ConstructionTypeRule> = {
  main_house: {
    label: "Main house",
    labelFr: "Maison principale",
    emoji: "🏠",
    // Full PLU zone setbacks apply — no override
    setbacks: { front: null, side: null, rear: null },
    maxHeight: null,
    maxRidgeHeight: null,
    countInCES: true,
    exemptUpToM2: null,
    permitAboveExempt: "PC",
    note: "Full PLU setbacks and height rules apply. Permit de construire required.",
  },
  extension: {
    label: "Extension",
    labelFr: "Extension",
    emoji: "➕",
    // Extensions follow the same rules as the main house
    setbacks: { front: null, side: null, rear: null },
    maxHeight: null,
    maxRidgeHeight: null,
    countInCES: true,
    exemptUpToM2: 40, // DP if ≤40m² in urban zone (Art. R.421-17)
    permitAboveExempt: "PC",
    note: "DP if ≤40m² in urban zone (Art. R.421-17). PC above 40m² or if total > 150m².",
  },
  shed: {
    label: "Garden shed",
    labelFr: "Abri de jardin",
    emoji: "🏚️",
    // Abris ≤5m² can sit on the boundary (no side/rear setback required)
    setbacks: { front: null, side: 0, rear: 0 },
    maxHeight: 3.5, // Art. R.421-2: constructions < 12m² h < 12m exempt
    maxRidgeHeight: 4.0,
    countInCES: true,
    exemptUpToM2: 5,  // ≤5m² fully exempt (Art. R.421-2)
    permitAboveExempt: "DP", // 5–20m² = DP; >20m² = PC
    note: "≤5m²: no permit. 5–20m²: Déclaration Préalable. Side/rear setback: 0m OK on boundary (verify with PLU).",
  },
  carport: {
    label: "Carport",
    labelFr: "Carport / auvent",
    emoji: "🅿️",
    // Open-sided carports often allowed on side boundary
    setbacks: { front: null, side: 0, rear: 0 },
    maxHeight: 3.0,
    maxRidgeHeight: 3.5,
    countInCES: true,
    exemptUpToM2: 20, // ≤20m² open structure → DP
    permitAboveExempt: "PC",
    note: "Open structure ≤20m²: Déclaration Préalable. >20m²: Permis de construire.",
  },
  pool: {
    label: "Swimming pool",
    labelFr: "Piscine",
    emoji: "🏊",
    // Pools must be ≥1m from plot boundary (Art. R.111-18)
    setbacks: { front: 1, side: 1, rear: 1 },
    maxHeight: null, // pools are in-ground, no height rule
    maxRidgeHeight: null,
    countInCES: false, // pools excluded from CES in most PLUs
    exemptUpToM2: 10,  // ≤10m²: no permit. 10–100m²: DP. >100m² + cover: PC.
    permitAboveExempt: "DP",
    note: "Pool excluded from CES. Minimum 1m from all boundaries. >10m²: Déclaration Préalable. Cover or >100m²: PC.",
  },
  annex: {
    label: "Annex",
    labelFr: "Annexe",
    emoji: "🏗️",
    // Annexes can be on boundary same as shed rules
    setbacks: { front: null, side: 0, rear: 0 },
    maxHeight: 3.5,
    maxRidgeHeight: 4.0,
    countInCES: true,
    exemptUpToM2: 5,
    permitAboveExempt: "DP",
    note: "Annexe accollée or détachée. ≤5m²: no permit. 5–20m²: DP (Art. R.421-9).",
  },
};

/**
 * Map a preset ID to its ConstructionType.
 * This is the bridge between ProjectPreset and the rule engine.
 */
export const PRESET_TO_CONSTRUCTION_TYPE: Record<string, ConstructionType> = {
  "house-small": "main_house",
  "house-medium": "main_house",
  "house-large": "main_house",
  extension: "extension",
  garage: "main_house",   // garage follows house rules unless it's an annex
  pool: "pool",
  terrace: "main_house",  // terraces follow main zone rules
  green: "main_house",
  "shed-small": "shed",
  carport: "carport",
  annex: "annex",
  custom: "main_house",
};

/**
 * Resolve the effective setback for a given dimension.
 * Type-specific override takes precedence over PLU zone rule.
 */
export function resolveSetback(
  dimension: "front" | "side" | "rear",
  constructionType: ConstructionType,
  pluSetback: number
): number {
  const override = CONSTRUCTION_TYPE_RULES[constructionType].setbacks[dimension];
  if (override !== null) return override;
  return pluSetback;
}

/**
 * Resolve max height — type rule wins if it's more restrictive.
 */
export function resolveMaxHeight(
  constructionType: ConstructionType,
  pluMaxHeight: number
): number {
  const typeMax = CONSTRUCTION_TYPE_RULES[constructionType].maxHeight;
  if (typeMax !== null) return Math.min(typeMax, pluMaxHeight);
  return pluMaxHeight;
}
