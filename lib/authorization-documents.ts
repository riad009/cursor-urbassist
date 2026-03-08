/**
 * Authorization document definitions for French planning applications.
 * DPC = Déclaration Préalable de Construire
 * PC  = Permis de Construire
 */

export interface AuthorizationDocument {
    code: string;
    dualCode?: string; // alternate PC/DPC code
    label: string;
    description?: string;
    tag?: string; // e.g. "ABF Required", "Existing", "Proposed"
}

// ─── Déclaration Préalable (DP) ─────────────────────────────────────────────

export const DP_DOCUMENTS: AuthorizationDocument[] = [
    { code: "DPC 1", dualCode: "PC 1", label: "Plan de situation", description: "Localise le terrain dans la commune" },
    { code: "DPC 2", dualCode: "PC 2", label: "Plan de masse", description: "Vue d'ensemble du terrain et des constructions" },
    { code: "DPC 3", dualCode: "PC 3", label: "Plan en coupe", description: "Coupe du terrain et de la construction" },
    { code: "DPC 4", dualCode: "PC 5", label: "Plan des façades et des toitures", description: "Élévations et toitures du projet" },
    { code: "DPC 5", dualCode: "PC 6", label: "Représentation de l'aspect extérieur", description: "Vue en perspective ou 3D du projet" },
    { code: "DPC 6", dualCode: "PC 6", label: "Document graphique", description: "Insertion du projet dans son environnement" },
    { code: "DPC 7", dualCode: "PC 7", label: "Photographie de l'environnement proche", description: "Photos du terrain et des abords immédiats" },
    { code: "DPC 8", dualCode: "PC 8", label: "Photographie de l'environnement lointain", description: "Photos du paysage environnant" },
    { code: "DPC 8.1", dualCode: "PC 4", label: "Notice descriptive du projet", description: "Description détaillée du projet et de son insertion" },
];

// ─── DPC 11 — Only for ABF Heritage zones ───────────────────────────────────

export const DPC11_DOCUMENT: AuthorizationDocument = {
    code: "DPC 11",
    label: "Notice relative aux modalités d'exécution des travaux",
    description: "Requis en zone ABF / Patrimoine — détaille les modalités d'exécution",
    tag: "ABF",
};

// ─── Permis de Construire (PC) ──────────────────────────────────────────────

export const PC_DOCUMENTS: AuthorizationDocument[] = [
    { code: "PC 1", dualCode: "DPC 1", label: "Plan de situation", description: "Localise le terrain dans la commune" },
    { code: "PC 2", dualCode: "DPC 2", label: "Plan de masse", description: "Vue d'ensemble du terrain et des constructions" },
    { code: "PC 3", dualCode: "DPC 3", label: "Plan en coupe", description: "Coupe du terrain et de la construction" },
    { code: "PC 4", dualCode: "DPC 8.1", label: "Notice descriptive du projet", description: "Description du terrain, du projet et des matériaux" },
    { code: "PC 5", dualCode: "DPC 4", label: "Plan des façades et des toitures", description: "Élévations et toitures du projet" },
    { code: "PC 6", dualCode: "DPC 6", label: "Document graphique", description: "Insertion du projet dans son environnement" },
    { code: "PC 7", dualCode: "DPC 7", label: "Photographie de l'environnement proche", description: "Photos du terrain et des abords immédiats" },
    { code: "PC 8", dualCode: "DPC 8", label: "Photographie de l'environnement lointain", description: "Photos du paysage environnant" },
];

// Split PC5 for existing structures
export const PC5_EXISTING: AuthorizationDocument = {
    code: "PC 5a",
    dualCode: "DPC 4a",
    label: "Plan des façades et toitures — État existant",
    description: "Élévations et toitures de la construction existante avant travaux",
    tag: "Existant",
};

export const PC5_PROPOSED: AuthorizationDocument = {
    code: "PC 5b",
    dualCode: "DPC 4b",
    label: "Plan des façades et toitures — État projeté",
    description: "Élévations et toitures du projet après travaux",
    tag: "Projeté",
};

// ─── Notes for single-family houses (PC) ────────────────────────────────────

export const PC_ADDITIONAL_NOTES: string[] = [
    "Pour les maisons individuelles : attestation thermique RE 2020 pouvant être requise",
    "Pour les maisons individuelles : attestation sismique PCMI 13 pouvant être requise",
];

/**
 * Returns the correct document list based on authorization type.
 * Simple version — no project context.
 */
export function getDocumentsForType(authType: string | null | undefined): AuthorizationDocument[] {
    if (!authType) return DP_DOCUMENTS;
    const upper = authType.toUpperCase();
    if (upper === "PC" || upper === "ARCHITECT_REQUIRED") return PC_DOCUMENTS;
    return DP_DOCUMENTS;
}

/**
 * Returns the full document list for a project, including:
 * - DPC11 when the project is in an ABF/Heritage zone (DP only)
 * - Split PC5 into Existing + Proposed when working on existing structures (PC only)
 */
export function getDocumentsForProject(
    authType: string | null | undefined,
    options?: {
        hasABF?: boolean;
        isExistingStructure?: boolean;
    }
): AuthorizationDocument[] {
    const upper = (authType || "").toUpperCase();
    const isPC = upper === "PC" || upper === "ARCHITECT_REQUIRED";

    if (isPC) {
        let docs = [...PC_DOCUMENTS];

        // Split PC5 into existing + proposed for projects with existing structures
        if (options?.isExistingStructure) {
            const pc5Index = docs.findIndex((d) => d.code === "PC 5");
            if (pc5Index >= 0) {
                docs.splice(pc5Index, 1, PC5_EXISTING, PC5_PROPOSED);
            }
        }

        // For PC in ABF zone: tag PC4 with ABF notice (DPC11 is NOT added for PC)
        if (options?.hasABF) {
            docs = docs.map((d) =>
                d.code === "PC 4"
                    ? {
                          ...d,
                          tag: "ABF",
                          description:
                              "La notice descriptive sera complétée avec les informations nécessaires pour l'ABF",
                      }
                    : d
            );
        }

        return docs;
    }

    // DP documents
    let docs = [...DP_DOCUMENTS];

    // Add DPC11 when in ABF Heritage zone (DP only)
    if (options?.hasABF) {
        docs.push(DPC11_DOCUMENT);
    }

    return docs;
}

// ─── PCMI 14 — Volet paysager for PC in ABF Heritage zones ──────────────

export const PCMI14_DOCUMENT: AuthorizationDocument = {
    code: "PCMI 14",
    label: "Volet paysager — Complément en zone ABF",
    description:
        "Document complémentaire requis pour les projets en périmètre de monument historique ou site patrimonial remarquable",
    tag: "ABF",
};

// ─── calculateRequiredDocuments ─────────────────────────────────────────
//
// Single entry-point for computing the full set of mandatory planning
// documents for a given project context.  This function is consumed by
// both the client-side store (via regulatoryDocumentStore) and the
// server-side PDF generation pipeline.
//
// French regulatory sources:
//  • Code de l'urbanisme Art. R.431-8 à R.431-12 (PC pièces jointes)
//  • Code de l'urbanisme Art. R.431-35 à R.431-37 (DP pièces jointes)
//  • Art. R.425-1  → consultation ABF obligatoire
//  • Circulaire du 2 mars 2017 → PCMI 14 volet paysager complémentaire

export interface RequiredDocumentsResult {
    /** The resolved project type */
    projectType: "DP" | "PC";
    /** Whether the project is located in an ABF / heritage zone */
    isABFZone: boolean;
    /** Complete ordered list of required documents */
    documents: AuthorizationDocument[];
    /** Document codes that were added specifically because of ABF zone */
    abfSpecificCodes: string[];
    /** Human-readable summary of ABF impact on documents */
    abfImpactSummary: string | null;
}

/**
 * Compute the full, ordered list of required French planning documents
 * for a project, taking into account authorization type and ABF zone status.
 *
 * This is the **canonical** function for document list computation.
 * Phase 2 (document generation / CERFA pre-fill) MUST use this function
 * or the Zustand store that wraps it.
 *
 * @param projectType  - "DP" (Déclaration Préalable) or "PC" (Permis de Construire)
 * @param isABFZone    - true if the parcel is inside an ABF / heritage protection perimeter
 * @param options      - additional context
 * @returns Typed result with documents, ABF-specific codes, and impact summary
 */
export function calculateRequiredDocuments(
    projectType: "DP" | "PC",
    isABFZone: boolean,
    options?: {
        /** True if the project involves modifications to an existing structure */
        isExistingStructure?: boolean;
    }
): RequiredDocumentsResult {
    // Resolve the authType string expected by getDocumentsForProject
    const authType = projectType === "PC" ? "PC" : "DP";

    // Get the base document list (handles PC5 split for existing structures)
    const documents = getDocumentsForProject(authType, {
        hasABF: isABFZone,
        isExistingStructure: options?.isExistingStructure,
    });

    // Track which codes were added/modified due to ABF
    const abfSpecificCodes: string[] = [];

    if (isABFZone) {
        if (projectType === "DP") {
            // DPC 11 is appended by getDocumentsForProject when hasABF = true
            abfSpecificCodes.push("DPC 11");
        } else {
            // PC 4 is tagged with ABF by getDocumentsForProject
            abfSpecificCodes.push("PC 4");

            // Add PCMI 14 — volet paysager complémentaire (ABF-specific for PC)
            // Only add if not already present (defensive)
            if (!documents.some((d) => d.code === "PCMI 14")) {
                documents.push(PCMI14_DOCUMENT);
                abfSpecificCodes.push("PCMI 14");
            }
        }
    }

    // Build human-readable impact summary
    let abfImpactSummary: string | null = null;
    if (isABFZone) {
        const codeList = abfSpecificCodes.join(", ");
        abfImpactSummary =
            projectType === "DP"
                ? `Zone ABF détectée — la pièce ${codeList} (notice relative aux modalités d'exécution des travaux) est obligatoire. ` +
                  `Le délai d'instruction est majoré d'un mois (consultation ABF).`
                : `Zone ABF détectée — les pièces ${codeList} sont requises ou complétées pour l'avis de l'Architecte des Bâtiments de France. ` +
                  `Le délai d'instruction est majoré d'un mois.`;
    }

    return {
        projectType,
        isABFZone,
        documents,
        abfSpecificCodes,
        abfImpactSummary,
    };
}
