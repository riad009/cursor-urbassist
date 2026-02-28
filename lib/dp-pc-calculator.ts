/**
 * DP / PC (Déclaration Préalable / Permis de Construire) calculation for French planning.
 * Comprehensive rules covering independent constructions, extensions, swimming pools,
 * facade/use changes, and submitter type (individual vs company).
 */

export type ProjectTypeChoice =
  | "new_construction"
  | "existing_extension"
  | "outdoor"
  | "swimming_pool"
  | "facade_change"
  | "outdoor_fence"
  | "outdoor_other";

export type SubmitterType = "individual" | "company";

/**
 * Surface de Plancher coefficients per level type (French R.111-22 / Code de l'urbanisme).
 *
 * Based on legal definition:
 *  - Only areas with ceiling height > 1.80m are counted
 *  - Measured from interior faces of walls (~5% deduction for wall thickness)
 *  - Garages, parking, technical rooms are EXCLUDED
 *  - Attic (combles) with ceiling ≤ 1.80m are EXCLUDED
 *  - Convertible attic (aménageable) with partial height > 1.80m: ~60% counted
 *
 * Coefficients represent: (usable floor area with ht > 1.80m) / (ground footprint)
 *  - RDC (ground floor, 1 level): 0.95 — nearly full footprint, only wall deduction
 *  - R+1 (2 levels): 0.90 per level — slight reduction for stairwell openings
 *  - R+2+ (3 levels): 0.85 per level — attic/combles reduce effective area
 */
export const FLOOR_AREA_COEFFICIENTS: Record<number, number> = {
  1: 0.95, // RDC only — full ceiling height, minimal exclusions
  2: 0.90, // RDC + R+1 — stairwell opening deducted
  3: 0.82, // RDC + R+1 + combles/R+2 — attic slopes reduce usable area
};

/** Default coefficient for levels beyond 3 */
export const FLOOR_AREA_COEFFICIENT_DEFAULT = 0.80;

/**
 * Estimate created Surface de Plancher from ground footprint and number of levels.
 *
 * Legal basis (Art. R.111-22 Code de l'urbanisme):
 *  - Sum of floor areas of all levels with ceiling height > 1.80m
 *  - Measured from interior faces of walls
 *  - Excludes: garages, parking, areas with ht ≤ 1.80m, technical rooms
 *
 * @param groundAreaM2 - Ground footprint (emprise au sol) in m²
 * @param numberOfLevels - Number of levels (1 = RDC, 2 = RDC+R+1, 3 = RDC+R+1+combles)
 * @param isGarage - If true, returns 0 (garages excluded from surface de plancher)
 */
export function estimateFloorAreaCreated(
  groundAreaM2: number,
  numberOfLevels: number,
  isGarage = false
): number {
  if (groundAreaM2 <= 0 || numberOfLevels < 1) return 0;
  if (isGarage) return 0; // Garages are excluded from surface de plancher
  // Formula: Footprint × Levels × 0.90 − stairwell deduction
  // The 0.90 factor accounts for wall thickness (interior measurement per Art. R.111-22).
  // Stairwell deductions per level count (client-confirmed values):
  //   1 level (RDC):            110 * 1 * 0.9       = 99
  //   2 levels (RDC + R+1):     110 * 2 * 0.9 - 6   = 192
  //   3 levels (RDC + R+1+R+2): 110 * 3 * 0.9 - 9   = 288
  // Formula: levels × 3 for multi-level buildings, 0 for single level.
  const deduction = numberOfLevels > 1 ? numberOfLevels * 3 : 0;
  return parseFloat((groundAreaM2 * numberOfLevels * 0.90 - deduction).toFixed(2));
}

export type DeterminationType = "NONE" | "DP" | "PC" | "ARCHITECT_REQUIRED" | "REVIEW";

export interface DpPcInput {
  projectType: ProjectTypeChoice;
  /** Created floor area (surface de plancher créée) in m² */
  floorAreaCreated: number;
  /** Created footprint (emprise au sol) in m² — compared with floorAreaCreated, stricter applies */
  footprintCreated?: number;
  /** Only for existing_extension: existing floor area before work */
  existingFloorArea?: number;
  /** Extension: ground area of extension (for 40 m² rule) */
  groundAreaExtension?: number;
  /** Change of use or facade modification → PC regardless of area */
  changeOfUseOrFacade?: boolean;
  /** Urban zone (PLU U, UD, AUD…) for extension rules */
  inUrbanZone?: boolean;
  /**
   * API-derived DP threshold in m² (overrides inUrbanZone logic).
   * When provided by the GPU API / PLU detection, this takes priority
   * over the default `inUrbanZone ? 40 : 20` calculation.
   */
  dpThreshold?: number;
  /** Submitter type — company always requires architect for PC */
  submitterType?: SubmitterType;
  /** Swimming pool: height of shelter/cover in meters (> 1.80m triggers PC) */
  shelterHeight?: number;
  /** Is the construction a garage (excluded from taxable floor area) */
  isGarage?: boolean;
}

export interface DpPcResult {
  determination: DeterminationType;
  /** Human-readable explanation (FR) */
  explanation: string;
  /** Optional detail for admin/review */
  detail?: string;
  /** Whether an architect is required */
  architectRequired?: boolean;
  /** Whether we cannot offer this service (architect required) */
  cannotOffer?: boolean;
}

// ─── Swimming Pool Rules ────────────────────────────────────────────────────

function calculateSwimmingPool(input: DpPcInput): DpPcResult {
  const area = input.floorAreaCreated;
  const shelterHeight = input.shelterHeight ?? 0;

  if (area < 10) {
    return {
      determination: "NONE",
      explanation: `La piscine fait ${area} m² (moins de 10 m²). Aucune autorisation n'est requise.`,
      detail: "pool<10",
    };
  }

  if (area <= 100) {
    // Exception: shelter > 1.80m → PC
    if (shelterHeight > 1.80) {
      const result: DpPcResult = {
        determination: "PC",
        explanation: `La piscine fait ${area} m² avec un abri de ${shelterHeight} m (supérieur à 1,80 m). Un permis de construire est nécessaire.`,
        detail: "pool_shelter>1.80",
      };
      return applyCompanyArchitect(result, input.submitterType);
    }
    return {
      determination: "DP",
      explanation: `La piscine fait ${area} m² (entre 10 et 100 m²). Une déclaration préalable est requise.`,
      detail: "pool_10-100",
    };
  }

  // > 100 m²
  const result: DpPcResult = {
    determination: "PC",
    explanation: `La piscine fait ${area} m² (supérieure à 100 m²). Un permis de construire est nécessaire.`,
    detail: "pool>100",
  };
  return applyCompanyArchitect(result, input.submitterType);
}

// ─── Independent Construction Rules ─────────────────────────────────────────

function calculateNewConstruction(input: DpPcInput): DpPcResult {
  const floorArea = input.floorAreaCreated;
  const footprint = input.footprintCreated ?? floorArea;
  // Use the stricter (larger) of footprint and floor area for threshold comparison
  const stricterArea = Math.max(footprint, floorArea);

  if (stricterArea < 5) {
    return {
      determination: "NONE",
      explanation: `Emprise au sol : ${footprint} m², surface de plancher : ${floorArea} m² (les deux < 5 m²). Aucune autorisation n'est requise.`,
      detail: "new<5",
    };
  }

  if (stricterArea <= 20) {
    return {
      determination: "DP",
      explanation: `Emprise au sol : ${footprint} m², surface de plancher : ${floorArea} m² (entre 5 et 20 m²). Une déclaration préalable suffit.`,
      detail: "new_5-20",
    };
  }

  // > 20 m² → PC (check 150 m² for architect requirement)
  if (floorArea >= 150) {
    return {
      determination: "ARCHITECT_REQUIRED",
      explanation: `Emprise au sol : ${footprint} m², surface de plancher : ${floorArea} m² (supérieure à 20 m²). Un permis de construire est nécessaire. De plus, la surface de plancher (${floorArea} m²) dépasse 150 m², le recours à un architecte est obligatoire.`,
      detail: "new>20_architect",
      architectRequired: true,
      cannotOffer: true,
    };
  }

  const result: DpPcResult = {
    determination: "PC",
    explanation: `Emprise au sol : ${footprint} m², surface de plancher : ${floorArea} m² (supérieure à 20 m²). Un permis de construire est nécessaire.`,
    detail: "new>20",
  };
  return applyCompanyArchitect(result, input.submitterType);
}

// ─── Existing Building Extension Rules ──────────────────────────────────────

function calculateExistingExtension(input: DpPcInput): DpPcResult {
  const {
    floorAreaCreated: floorArea,
    footprintCreated,
    existingFloorArea = 0,
    changeOfUseOrFacade,
    inUrbanZone = true,
    submitterType,
  } = input;

  const footprint = footprintCreated ?? floorArea;
  // Use the stricter (larger) of footprint and floor area for DP/PC threshold
  const stricterArea = Math.max(footprint, floorArea);
  // 150 m² architect threshold uses ONLY total floor area (not footprint)
  const totalFloorAfterWork = existingFloorArea + floorArea;

  // Facade modification or change of use → PC regardless
  if (changeOfUseOrFacade) {
    const result: DpPcResult = {
      determination: "PC",
      explanation:
        "Un projet avec changement de destination ou modification de façade est soumis au permis de construire, quelle que soit la surface.",
      detail: "facade_change",
    };
    if (totalFloorAfterWork > 150) {
      return {
        determination: "ARCHITECT_REQUIRED",
        explanation: `${result.explanation} De plus, la surface de plancher totale après travaux (${totalFloorAfterWork} m²) dépasse 150 m², le recours à un architecte est obligatoire.`,
        detail: "facade_change_architect",
        architectRequired: true,
        cannotOffer: true,
      };
    }
    return applyCompanyArchitect(result, submitterType);
  }

  // ── Threshold depends on zone type ──
  // When dpThreshold is provided by the API (GPU/PLU detection), use it directly.
  // Otherwise fall back to: Urban zone (PLU/PLUi U-zones) = 40 m², Non-urban = 20 m².
  const dpThreshold = input.dpThreshold ?? (inUrbanZone ? 40 : 20);

  // ── Extension ≤ threshold → DP (check 150 m² for architect) ──
  if (stricterArea <= dpThreshold) {
    // Extensions < 20 m² (both footprint AND floor area) are ALWAYS DP
    // regardless of total floor area — the 150 m² architect rule does not override this.
    // For non-urban zones where dpThreshold = 20, extensions exactly at 20 m² are also DP.
    const alwaysDp = stricterArea < 20 || (dpThreshold === 20 && stricterArea <= 20);

    if (alwaysDp || totalFloorAfterWork <= 150) {
      return {
        determination: "DP",
        explanation: inUrbanZone
          ? `Emprise au sol : ${footprint} m², surface de plancher créée : ${floorArea} m² (≤ ${dpThreshold} m²) en zone urbaine. Surface totale après travaux : ${totalFloorAfterWork} m² (≤ 150 m²). Une déclaration préalable suffit.`
          : `Emprise au sol : ${footprint} m², surface de plancher créée : ${floorArea} m² (≤ ${dpThreshold} m²) hors zone urbaine. Une déclaration préalable suffit.`,
        detail: `ext<=${dpThreshold}`,
      };
    }
    // Total floor area > 150 AND extension ≥ 20 m² → PC + architect required
    return {
      determination: "ARCHITECT_REQUIRED",
      explanation: `Emprise au sol : ${footprint} m², surface de plancher créée : ${floorArea} m² (≤ ${dpThreshold} m²), mais la surface de plancher totale après travaux est de ${totalFloorAfterWork} m² (> 150 m²). Un permis de construire avec architecte obligatoire est nécessaire.`,
      detail: "ext_total>150_architect",
      architectRequired: true,
      cannotOffer: true,
    };
  }

  // ── Extension > threshold → PC (check 150 m² for architect) ──
  if (totalFloorAfterWork > 150) {
    return {
      determination: "ARCHITECT_REQUIRED",
      explanation: `Emprise au sol : ${footprint} m², surface de plancher créée : ${floorArea} m² (> ${dpThreshold} m²)${existingFloorArea ? `, surface existante : ${existingFloorArea} m²` : ""}. Surface totale après travaux : ${totalFloorAfterWork} m² (> 150 m²). Un permis de construire avec architecte obligatoire est nécessaire.`,
      detail: "ext_architect",
      architectRequired: true,
      cannotOffer: true,
    };
  }

  const result: DpPcResult = {
    determination: "PC",
    explanation: `Emprise au sol : ${footprint} m², surface de plancher créée : ${floorArea} m² (> ${dpThreshold} m²)${existingFloorArea ? `, surface existante : ${existingFloorArea} m²` : ""}. Surface totale après travaux : ${totalFloorAfterWork} m² (≤ 150 m²). Un permis de construire est nécessaire.`,
    detail: `ext>${dpThreshold}`,
  };
  return applyCompanyArchitect(result, submitterType);
}

// ─── Fence / Gate Rules ─────────────────────────────────────────────────────

function calculateFenceGate(): DpPcResult {
  return {
    determination: "DP",
    explanation: "L'édification d'une clôture ou d'un portail est soumise à une déclaration préalable (article R.421-12 du Code de l'urbanisme).",
    detail: "fence_gate",
  };
}

// ─── Company submitter → architect required ─────────────────────────────────

function applyCompanyArchitect(result: DpPcResult, submitterType?: SubmitterType): DpPcResult {
  if (submitterType === "company" && (result.determination === "PC" || result.determination === "ARCHITECT_REQUIRED")) {
    return {
      ...result,
      determination: "ARCHITECT_REQUIRED",
      explanation: `${result.explanation} En tant qu'entreprise (personne morale), le recours à un architecte est obligatoire pour un permis de construire.`,
      architectRequired: true,
      cannotOffer: true,
    };
  }
  return result;
}

// ─── Main Calculator ────────────────────────────────────────────────────────

/**
 * Compute DP vs PC (and architect requirement) from project type and areas.
 * 
 * Rules implemented:
 * 
 * Independent constructions (new_construction):
 *   < 5 m²  → NONE (no authorization)
 *   5–20 m² → DP
 *   > 20 m² → PC
 *   Total > 150 m² → ARCHITECT_REQUIRED
 * 
 * Existing building work (existing_extension):
 *   < 20 m² → DP
 *   20–40 m² urban zone, total ≤ 150 → DP
 *   20–40 m² urban zone, total > 150 → ARCHITECT_REQUIRED
 *   > 40 m² → PC (or ARCHITECT if total > 150)
 *   Facade/use change → PC regardless
 * 
 * Swimming pools (swimming_pool):
 *   < 10 m²  → NONE
 *   10–100 m² → DP (shelter > 1.80m → PC)
 *   > 100 m² → PC
 * 
 * Company submitter → ARCHITECT_REQUIRED when PC is determined
 */
export function calculateDpPc(input: DpPcInput): DpPcResult {
  const { projectType, changeOfUseOrFacade } = input;

  // Facade/change of use override (applies to any type)
  if (changeOfUseOrFacade && projectType !== "swimming_pool") {
    const totalAfterWork = (input.existingFloorArea ?? 0) + input.floorAreaCreated;
    if (totalAfterWork > 150) {
      return {
        determination: "ARCHITECT_REQUIRED",
        explanation:
          "Un projet avec changement de destination ou modification de façade est soumis au permis de construire. De plus, la surface totale dépasse 150 m², le recours à un architecte est obligatoire.",
        detail: "changeOfUseOrFacade_architect",
        architectRequired: true,
        cannotOffer: true,
      };
    }
    const result: DpPcResult = {
      determination: "PC",
      explanation:
        "Un projet avec changement de destination ou modification de façade est soumis au permis de construire, quelle que soit la surface.",
      detail: "changeOfUseOrFacade",
    };
    return applyCompanyArchitect(result, input.submitterType);
  }

  switch (projectType) {
    case "swimming_pool":
      return calculateSwimmingPool(input);

    case "new_construction":
      return calculateNewConstruction(input);

    case "existing_extension":
      return calculateExistingExtension(input);

    case "facade_change":
      return {
        determination: "PC",
        explanation:
          "Une modification de façade ou un changement de destination nécessite un permis de construire.",
        detail: "facade_change_type",
      };

    case "outdoor":
      return {
        determination: "REVIEW",
        explanation:
          "Pour un aménagement extérieur (clôture, terrasse, etc.), le type d'autorisation dépend des règles locales. Vérification recommandée auprès de votre mairie.",
        detail: "outdoor",
      };

    case "outdoor_fence":
      return calculateFenceGate();

    case "outdoor_other":
      return {
        determination: "REVIEW",
        explanation:
          "Pour cet aménagement extérieur, le type d'autorisation dépend de la nature exacte des travaux et des règles locales. Contactez votre mairie pour vérification.",
        detail: "outdoor_other",
      };

    default:
      return {
        determination: "REVIEW",
        explanation: "Impossible de déterminer automatiquement le type d'autorisation. Vérification recommandée.",
        detail: "unknown",
      };
  }
}
