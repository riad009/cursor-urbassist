/**
 * Authorization document definitions for French planning applications.
 * DPC = Déclaration Préalable de Construire
 * PC  = Permis de Construire
 */

export interface AuthorizationDocument {
    code: string;
    label: string;
    description?: string;
}

// ─── Déclaration Préalable (DP) ─────────────────────────────────────────────

export const DP_DOCUMENTS: AuthorizationDocument[] = [
    { code: "DPC 1", label: "Plan de situation", description: "Localise le terrain dans la commune" },
    { code: "DPC 2", label: "Plan de masse", description: "Vue d'ensemble du terrain et des constructions" },
    { code: "DPC 3", label: "Plan en coupe", description: "Coupe du terrain et de la construction" },
    { code: "DPC 4", label: "Plan des façades et des toitures", description: "Élévations et toitures du projet" },
    { code: "DPC 5", label: "Représentation de l'aspect extérieur", description: "Vue en perspective ou 3D du projet" },
    { code: "DPC 6", label: "Document graphique", description: "Insertion du projet dans son environnement" },
    { code: "DPC 7", label: "Photographie de l'environnement proche", description: "Photos du terrain et des abords immédiats" },
    { code: "DPC 8", label: "Photographie de l'environnement lointain", description: "Photos du paysage environnant" },
    { code: "DPC 8.1", label: "Notice descriptive du projet", description: "Description détaillée du projet et de son insertion" },
];

// ─── Permis de Construire (PC) ──────────────────────────────────────────────

export const PC_DOCUMENTS: AuthorizationDocument[] = [
    { code: "PC 1", label: "Plan de situation", description: "Localise le terrain dans la commune" },
    { code: "PC 2", label: "Plan de masse", description: "Vue d'ensemble du terrain et des constructions" },
    { code: "PC 3", label: "Plan en coupe", description: "Coupe du terrain et de la construction" },
    { code: "PC 4", label: "Notice descriptive du projet", description: "Description du terrain, du projet et des matériaux" },
    { code: "PC 5", label: "Plan des façades et des toitures", description: "Élévations et toitures du projet" },
    { code: "PC 6", label: "Document graphique", description: "Insertion du projet dans son environnement" },
    { code: "PC 7", label: "Photographie de l'environnement proche", description: "Photos du terrain et des abords immédiats" },
    { code: "PC 8", label: "Photographie de l'environnement lointain", description: "Photos du paysage environnant" },
];

// ─── Notes for single-family houses (PC) ────────────────────────────────────

export const PC_ADDITIONAL_NOTES: string[] = [
    "Pour les maisons individuelles : attestation thermique RE 2020 pouvant être requise",
    "Pour les maisons individuelles : attestation sismique PCMI 13 pouvant être requise",
];

/**
 * Returns the correct document list based on authorization type.
 */
export function getDocumentsForType(authType: string | null | undefined): AuthorizationDocument[] {
    if (!authType) return DP_DOCUMENTS;
    const upper = authType.toUpperCase();
    if (upper === "PC" || upper === "ARCHITECT_REQUIRED") return PC_DOCUMENTS;
    return DP_DOCUMENTS;
}
