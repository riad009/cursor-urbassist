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
  // TODO Phase 2: Add "terrace" (Art. R.421-9 f: elevated terrace >0.60m → DP, >20m² → PC)
  // TODO Phase 2: Add "demolition" (Art. R421-27-1: requires DP or Permis de démolir in ABF zones)
  // TODO Phase 2: Add "solar_panel" (Ground-mounted: <1m height, ≤20m² → NONE, else DP/PC)

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
  /** Change of use (Changement de destination) */
  changeOfUse?: boolean;
  /** Modifying the exterior appearance (Modification aspect extérieur / façade) */
  facadeModification?: boolean;
  /** Urban zone (PLU U, UD, AUD…) for extension rules */
  inUrbanZone?: boolean;
  /**
   * Whether the commune uses RNU (Règlement National d'Urbanisme) instead of PLU.
   * Under RNU there is NO 40m² DP threshold — it's always 20m².
   */
  isRnu?: boolean;
  /**
   * API-derived DP threshold in m² (overrides inUrbanZone logic).
   * When provided by the GPU API / PLU detection, this takes priority
   * over the default `inUrbanZone ? 40 : 20` calculation.
   */
  dpThreshold?: number;
  /** Submitter type — company always requires architect for PC */
  submitterType?: SubmitterType;
  /** Swimming pool: height of shelter/cover in meters (>1.80m triggers PC) */
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
// Based on Articles R421-14 (PC) and R421-17 (DP) of the Code de l'urbanisme.
//
// Official French law summary:
//  1. Change of destination + facade/structure modification → PC (Art. R421-14 c)
//  2. Change of destination alone (no facade/structure) → DP (Art. R421-17 b)
//  3. Modification of exterior appearance alone → DP (Art. R421-17 a)
//  4. Extension / Raising the Height → area-based thresholds:
//     - < 5 m² → NONE
//     - 5–20 m² → DP
//     - 20–40 m² in urban zone (PLU U) → DP (unless total > 150 m²)
//     - > 40 m² (or > 20 m² outside urban zone) → PC
//     - Total floor area after work > 150 m² → ARCHITECT_REQUIRED

function calculateExistingExtension(input: DpPcInput): DpPcResult {
  const {
    floorAreaCreated: floorArea,
    footprintCreated,
    existingFloorArea = 0,
    changeOfUse,
    facadeModification,
    inUrbanZone = true,
    isRnu = false,
    isGarage = false,
    submitterType,
  } = input;

  const footprint = footprintCreated ?? floorArea;
  // For garages: surface de plancher is 0 (excluded), so only emprise au sol matters
  const effectiveFloorArea = isGarage ? 0 : floorArea;
  // Use the stricter (larger) of footprint and effective floor area for threshold comparison
  const stricterArea = Math.max(footprint, effectiveFloorArea);
  // 150 m² architect threshold uses ONLY total floor area (not footprint)
  const totalFloorAfterWork = existingFloorArea + effectiveFloorArea;
  // DP threshold: Under RNU there is NO 40m² exception — always 20m²
  // GPU API dpThreshold overrides everything if provided
  const dpThreshold = input.dpThreshold ?? (isRnu ? 20 : (inUrbanZone ? 40 : 20));

  // ── Rule 1: Change of destination + facade/structure modification → PC (Art. R421-14 c)
  if (changeOfUse && facadeModification) {
    const result: DpPcResult = {
      determination: "PC",
      explanation:
        "Un projet comportant à la fois un changement de destination et la modification de la façade ou de la structure porteuse est soumis au permis de construire (Art. R421-14 c).",
      detail: "changeOfUse_AND_facade",
    };
    if (totalFloorAfterWork > 150) {
      return {
        ...result,
        determination: "ARCHITECT_REQUIRED",
        explanation: `${result.explanation} De plus, la surface totale après travaux (${totalFloorAfterWork} m²) dépasse 150 m², le recours à un architecte est obligatoire.`,
        architectRequired: true,
        cannotOffer: true,
      };
    }
    return applyCompanyArchitect(result, submitterType);
  }

  // ── Rule 2: Change of destination alone (no facade changes) → DP (Art. R421-17 b)
  if (changeOfUse && !facadeModification) {
    return {
      determination: "DP",
      explanation:
        "Un changement de destination sans modification de la façade ni de la structure porteuse est soumis à une déclaration préalable (Art. R421-17 b).",
      detail: "changeOfUse_alone_dp",
    };
  }

  // ── Rule 3: Modification of exterior appearance alone → DP (Art. R421-17 a)
  if (facadeModification && !changeOfUse) {
    return {
      determination: "DP",
      explanation:
        "Les travaux modifiant l'aspect extérieur d'un bâtiment existant sont soumis à une déclaration préalable (Art. R421-17 a).",
      detail: "facade_alone_dp",
    };
  }

  // ── Rule 4: Extension / Raising the Height → area-based thresholds

  // 4a. < 5 m² → No authorization required
  if (stricterArea < 5) {
    return {
      determination: "NONE",
      explanation: `Emprise au sol : ${footprint} m², surface de plancher : ${floorArea} m² (les deux < 5 m²). Aucune autorisation n'est requise pour cette extension.`,
      detail: "extension<5",
    };
  }

  // 4b. ≤ dpThreshold (20 or 40 m²) → DP
  //     But check if total after work > 150 m² → then PC + architect
  if (stricterArea <= dpThreshold) {
    if (totalFloorAfterWork > 150) {
      return {
        determination: "ARCHITECT_REQUIRED",
        explanation: `Emprise au sol : ${footprint} m², surface de plancher créée : ${floorArea} m² (≤ ${dpThreshold} m²). Cependant, la surface totale après travaux (${totalFloorAfterWork} m²) dépasse 150 m². Un permis de construire est nécessaire et le recours à un architecte est obligatoire.`,
        detail: "extension_dp_but_architect",
        architectRequired: true,
        cannotOffer: true,
      };
    }
    return {
      determination: "DP",
      explanation: `Emprise au sol : ${footprint} m², surface de plancher créée : ${floorArea} m² (≤ ${dpThreshold} m²)${inUrbanZone ? " en zone urbaine" : ""}. Surface totale après travaux : ${totalFloorAfterWork} m². Une déclaration préalable suffit.`,
      detail: "extension_dp",
    };
  }

  // 4c. > dpThreshold → PC
  //     Check for architect (total > 150 m²)
  if (totalFloorAfterWork > 150) {
    return {
      determination: "ARCHITECT_REQUIRED",
      explanation: `Emprise au sol : ${footprint} m², surface de plancher créée : ${floorArea} m² (supérieure à ${dpThreshold} m²). Un permis de construire est nécessaire. De plus, la surface totale après travaux (${totalFloorAfterWork} m²) dépasse 150 m², le recours à un architecte est obligatoire.`,
      detail: "extension>threshold_architect",
      architectRequired: true,
      cannotOffer: true,
    };
  }

  const result: DpPcResult = {
    determination: "PC",
    explanation: `Emprise au sol : ${footprint} m², surface de plancher créée : ${floorArea} m² (supérieure à ${dpThreshold} m²). Un permis de construire est nécessaire.`,
    detail: "extension>threshold",
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
 * Rules implemented per Code de l'urbanisme (Art. R421-14 / R421-17):
 *
 * Independent constructions (new_construction):
 *   < 5 m²  → NONE (no authorization)
 *   5–20 m² → DP
 *   > 20 m² → PC
 *   Total > 150 m² → ARCHITECT_REQUIRED
 *
 * Existing building work (existing_extension):
 *   Change of destination + facade/structure → PC (Art. R421-14 c)
 *   Change of destination alone → DP (Art. R421-17 b)
 *   Facade modification alone → DP (Art. R421-17 a)
 *   Extension:
 *     < 5 m² → NONE
 *     5–20 m² → DP
 *     20–40 m² in urban zone (PLU), total ≤ 150 → DP
 *     > 40 m² (or > 20 m² non-urban) → PC
 *     Total > 150 m² → ARCHITECT_REQUIRED
 *
 * Swimming pools (swimming_pool):
 *   < 10 m²  → NONE
 *   10–100 m² → DP (shelter > 1.80m → PC)
 *   > 100 m² → PC
 *
 * Company submitter → ARCHITECT_REQUIRED when PC is determined
 */
export function calculateDpPc(input: DpPcInput): DpPcResult {
  const { projectType } = input;

  // No global override — each project type handles changeOfUse/facadeModification
  // internally according to the correct legal articles.

  switch (projectType) {
    case "swimming_pool":
      return calculateSwimmingPool(input);

    case "new_construction":
      return calculateNewConstruction(input);

    case "existing_extension":
      return calculateExistingExtension(input);

    case "facade_change":
      // Legacy project type — facade-only changes are DP (Art. R421-17 a)
      return {
        determination: "DP",
        explanation:
          "Les travaux modifiant l'aspect extérieur d'un bâtiment existant sont soumis à une déclaration préalable (Art. R421-17 a).",
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
