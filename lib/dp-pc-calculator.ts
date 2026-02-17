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

/** Floor area is estimated as: ground × levels × (1 - 0.21) ≈ ground × levels × 0.79 */
export const FLOOR_AREA_COEFFICIENT = 0.79;

/**
 * Estimate created floor area from ground area and number of levels.
 * Exclusions (heights < 1.80 m, stair openings) are approximated by ~21% reduction.
 */
export function estimateFloorAreaCreated(groundAreaM2: number, numberOfLevels: number): number {
  if (groundAreaM2 <= 0 || numberOfLevels < 1) return 0;
  return Math.round(groundAreaM2 * numberOfLevels * FLOOR_AREA_COEFFICIENT);
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
  // Urban zone (PLU/PLUi U-zones): up to 40 m² inclusive → DP
  // Non-urban zone: up to 20 m² inclusive → DP
  const dpThreshold = inUrbanZone ? 40 : 20;

  // ── Extension ≤ threshold → DP (check 150 m² for architect) ──
  if (stricterArea <= dpThreshold) {
    if (totalFloorAfterWork <= 150) {
      return {
        determination: "DP",
        explanation: inUrbanZone
          ? `Emprise au sol : ${footprint} m², surface de plancher créée : ${floorArea} m² (≤ ${dpThreshold} m²) en zone urbaine. Surface totale après travaux : ${totalFloorAfterWork} m² (≤ 150 m²). Une déclaration préalable suffit.`
          : `Emprise au sol : ${footprint} m², surface de plancher créée : ${floorArea} m² (≤ ${dpThreshold} m²) hors zone urbaine. Une déclaration préalable suffit.`,
        detail: `ext<=${dpThreshold}`,
      };
    }
    // Total floor area > 150 → PC + architect required
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
