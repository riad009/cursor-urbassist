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
