/**
 * SUP (Servitude d'Utilité Publique) Classification Utility
 *
 * Separates protected areas into CRITICAL (heritage, ABF, flood/risk)
 * and SECONDARY (technical servitudes like electricity, gas, etc.)
 * for a tiered UI display.
 *
 * Classification uses THREE signals:
 *   1. `type` field from the API (ABF, FLOOD_ZONE, HERITAGE)
 *   2. `categorie` SUP code (AC1, PM1, …)
 *   3. Text-matching on `name`/`description` for items without clean codes
 */

// ── Critical SUP category codes ─────────────────────────────────────────────
// Heritage & major risks — these trigger legal obligations (ABF, DP11, etc.)
export const CRITICAL_CODES = [
    "AC1", // Monument Historique (Classé/Inscrit)
    "AC2", // Site Patrimonial Remarquable / Site Classé
    "AC4", // Périmètre des Abords (ABF 500m)
    "PM1", // Risque Inondation (PPRI)
    "PM2", // Risque Technologique (PPRT)
    "PM3", // Risque Minier
] as const;

// Types from the protected-areas API that are always critical
const CRITICAL_TYPES = ["ABF", "FLOOD_ZONE", "HERITAGE"] as const;

// ── Text patterns for critical detection ────────────────────────────────────
// When the raw API data doesn't have a clean categorie code, we fall back
// to matching these French keywords in the name or description.
const CRITICAL_TEXT_PATTERNS = [
    // Heritage / Patrimoine / ABF
    "monument historique",
    "monuments historiques",
    "abf",
    "architecte des bâtiments",
    "architecte des batiments",
    "site classé",
    "site inscrit",
    "site patrimonial",
    "sites patrimoniaux",
    "secteur sauvegardé",
    "patrimoine",
    "patrimonial",
    "intérêt patrimonial",
    "interet patrimonial",
    "périmètre de protection",
    "perimetre de protection",
    "abords",
    // Flood / Risk
    "p.p.r.i",
    "ppri",
    "inondation",
    "inondable",
    "zone inondable",
    "risque inondation",
    "plan de prévention des risques",
    "plan de prevention des risques",
    "zone à risque",
    "zone a risque",
    "risque naturel",
    "risque technologique",
    "risque minier",
    // General risk markers
    "aléa",
    "alea",
    "submersion",
    "crue",
] as const;

// ── Readable label mapping ──────────────────────────────────────────────────
export const SUP_LABEL_MAP: Record<string, string> = {
    // Heritage (Prioritaire)
    AC1: "Monument Historique (Classé/Inscrit)",
    AC2: "Site Classé / Site Inscrit",
    AC3: "Réserve Naturelle",
    AC4: "Périmètre des Abords (ABF 500m)",
    // Risks (Prioritaire)
    PM1: "Zone Inondable (PPRI)",
    PM2: "Risque Technologique (PPRT)",
    PM3: "Risque Minier",
    // Technical servitudes (Secondaire)
    A1: "Protection des bois et forêts",
    A4: "Terrains riverains des cours d'eau",
    A5: "Canalisations Eau / Assainissement",
    A7: "Alignement voirie",
    AR: "Archéologie préventive",
    EL7: "Servitude d'utilité publique aéronautique",
    I1: "Canalisations de transport de gaz",
    I1bis: "Canalisations de produits chimiques",
    I3: "Canalisations de transport d'hydrocarbures",
    I4: "Passage Lignes Électriques",
    I6: "Mines et carrières",
    I7: "Stockage souterrain",
    INT1: "Cimetières",
    PT1: "Télécommunications",
    PT2: "Servitudes radioélectriques",
    PT2LH: "Liaisons hertziennes",
    PT3: "Centre radioélectrique",
    T1: "Voies ferrées",
    T4: "Aérodrome",
    T5: "Dégagement aéronautique",
    T7: "Routes express / Autoroutes",
};

// ── Types ───────────────────────────────────────────────────────────────────
export interface ClassifiedProtection {
    /** Original fields from the API */
    type: string;
    name: string;
    description?: string;
    severity?: string;
    sourceUrl?: string | null;
    constraints?: string[] | unknown;
    categorie?: string;
    /** Readable label resolved from the code or original name */
    label: string;
    /** Whether this was detected as critical */
    isCritical: boolean;
}

export interface ProcessedProtections {
    /** Heritage / ABF / Flood — always visible */
    criticalItems: ClassifiedProtection[];
    /** Technical servitudes — behind "Show more" */
    secondaryItems: ClassifiedProtection[];
    /** True if any critical item triggers ABF obligations */
    requiresABF: boolean;
}

// ── Helper: check if free text contains critical keywords ───────────────────
function containsCriticalText(text: string): boolean {
    const lower = text.toLowerCase();
    return CRITICAL_TEXT_PATTERNS.some((pattern) => lower.includes(pattern));
}

// ── Classification function ─────────────────────────────────────────────────
export function processProtections(
    areas: Array<{
        type: string;
        name: string;
        description?: string;
        severity?: string;
        sourceUrl?: string | null;
        constraints?: string[] | unknown;
        categorie?: string;
    }>,
): ProcessedProtections {
    const criticalItems: ClassifiedProtection[] = [];
    const secondaryItems: ClassifiedProtection[] = [];

    for (const area of areas) {
        // Skip INFO-type items (general construction regs, etc.)
        if (area.type === "INFO") continue;

        const code = (area.categorie ?? "").toUpperCase().trim();

        // ── Determine criticality using THREE signals ──
        // Signal 1: API type is inherently critical
        const isCriticalType = (CRITICAL_TYPES as readonly string[]).includes(area.type);
        // Signal 2: SUP category code is critical
        const isCriticalCode = CRITICAL_CODES.some((c) => code.startsWith(c));
        // Signal 3: Name or description contains critical French keywords
        const isCriticalByText =
            containsCriticalText(area.name || "") ||
            containsCriticalText(area.description || "");

        const isCritical = isCriticalType || isCriticalCode || isCriticalByText;

        // Resolve readable label: prefer our mapping, then original name
        const label =
            (code && SUP_LABEL_MAP[code]) ||
            area.name ||
            "Autre servitude";

        const item: ClassifiedProtection = {
            type: area.type,
            name: area.name,
            description: area.description,
            severity: isCritical ? (area.severity === "high" ? "high" : "high") : area.severity,
            sourceUrl: area.sourceUrl,
            constraints: area.constraints,
            categorie: code || undefined,
            label,
            isCritical,
        };

        if (isCritical) {
            criticalItems.push(item);
        } else {
            secondaryItems.push(item);
        }
    }

    const requiresABF = criticalItems.some(
        (i) =>
            i.type === "ABF" ||
            i.type === "HERITAGE" ||
            ["AC1", "AC2", "AC4"].some((c) => (i.categorie ?? "").startsWith(c)) ||
            containsCriticalText(i.name || ""),
    );

    return { criticalItems, secondaryItems, requiresABF };
}
