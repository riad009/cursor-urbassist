/**
 * DP / PC (Déclaration Préalable / Permis de Construire) calculation for French planning.
 * Multi-level and extension projects with floor area (surface de plancher).
 */

export type ProjectTypeChoice = "new_construction" | "existing_extension" | "outdoor";

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

export type DeterminationType = "DP" | "PC" | "ARCHITECT_REQUIRED" | "REVIEW";

export interface DpPcInput {
  projectType: ProjectTypeChoice;
  /** Created floor area (surface de plancher créée) in m² */
  floorAreaCreated: number;
  /** Only for existing_extension: existing floor area before work */
  existingFloorArea?: number;
  /** Extension: ground area of extension (for 40 m² rule) */
  groundAreaExtension?: number;
  /** Change of use or facade modification → PC regardless of area */
  changeOfUseOrFacade?: boolean;
  /** Urban zone (PLU U, UD, AUD…) for extension rules */
  inUrbanZone?: boolean;
}

export interface DpPcResult {
  determination: DeterminationType;
  /** Human-readable explanation (FR) */
  explanation: string;
  /** Optional detail for admin/review */
  detail?: string;
}

/**
 * Compute DP vs PC (and architect requirement) from project type and areas.
 *
 * DP (Déclaration préalable):
 * - Independent construction: created < 20 m² → DP
 * - Extension: created ≤ 40 m² (ground or floor in urban zone) AND total after work ≤ 150 m² → DP
 *
 * PC (Permis de construire):
 * - Independent construction > 20 m²
 * - Extension > 40 m² ground or total after work > 150 m²
 * - Change of use or facade modification (any surface)
 * - Architect required: PC when total > 150 m² or SCI
 */
export function calculateDpPc(input: DpPcInput): DpPcResult {
  const {
    projectType,
    floorAreaCreated,
    existingFloorArea = 0,
    groundAreaExtension,
    changeOfUseOrFacade,
    inUrbanZone = true,
  } = input;

  const totalAfterWork = existingFloorArea + floorAreaCreated;

  if (changeOfUseOrFacade) {
    return {
      determination: "PC",
      explanation:
        "Un projet avec changement de destination ou modification de façade est soumis au permis de construire, quelle que soit la surface.",
      detail: "changeOfUseOrFacade",
    };
  }

  if (projectType === "outdoor") {
    return {
      determination: "REVIEW",
      explanation:
        "Pour un aménagement extérieur (piscine, clôture, etc.), le type d'autorisation dépend des règles locales. Vérification recommandée.",
      detail: "outdoor",
    };
  }

  if (projectType === "new_construction") {
    if (floorAreaCreated < 20) {
      return {
        determination: "DP",
        explanation: `La surface de plancher créée est de ${floorAreaCreated} m² (moins de 20 m²). Une déclaration préalable suffit.`,
      };
    }
    if (totalAfterWork > 150) {
      return {
        determination: "ARCHITECT_REQUIRED",
        explanation: `La surface créée est de ${floorAreaCreated} m². Comme la surface totale dépasse 150 m², un permis de construire et le recours à un architecte sont obligatoires.`,
        detail: "totalAfterWork>150",
      };
    }
    return {
      determination: "PC",
      explanation: `La surface de plancher créée est de ${floorAreaCreated} m² (≥ 20 m²). Un permis de construire est nécessaire.`,
    };
  }

  // existing_extension
  const extensionOver40 =
    (typeof groundAreaExtension === "number" && groundAreaExtension > 40) ||
    (inUrbanZone && floorAreaCreated > 40);
  if (extensionOver40 || totalAfterWork > 150) {
    const reasons: string[] = [];
    if (extensionOver40) reasons.push("surface créée > 40 m²");
    if (totalAfterWork > 150) reasons.push("surface totale après travaux > 150 m²");
    const needsArchitect = totalAfterWork > 150;
    return {
      determination: needsArchitect ? "ARCHITECT_REQUIRED" : "PC",
      explanation: `La surface créée est de ${floorAreaCreated} m²${existingFloorArea ? `, la surface existante de ${existingFloorArea} m²` : ""}, soit une surface totale après travaux de ${totalAfterWork} m². Comme ${reasons.join(" et ")}, un permis de construire est nécessaire${needsArchitect ? " ainsi qu’un architecte (surface totale > 150 m²)" : ""}.`,
      detail: needsArchitect ? "totalAfterWork>150" : "extensionOver40",
    };
  }

  return {
    determination: "DP",
    explanation: `La surface créée est de ${floorAreaCreated} m²${existingFloorArea ? `, surface existante ${existingFloorArea} m²` : ""}, surface totale après travaux ${totalAfterWork} m². Une déclaration préalable suffit.`,
  };
}
