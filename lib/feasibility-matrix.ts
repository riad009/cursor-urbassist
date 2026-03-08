/**
 * Feasibility Matrix — Strict TypeScript schema for AI-generated
 * "Analyse de la Réglementation" (Feasibility Report).
 *
 * This file defines:
 *  1. The TypeScript interfaces consumed by the frontend component.
 *  2. The Gemini `responseSchema` (using @google/generative-ai SchemaType)
 *     that guarantees structured JSON output matching these interfaces.
 *
 * Shared between:
 *  - /api/generate-feasibility  (backend: Gemini structured output)
 *  - <FeasibilityMatrix />       (frontend: rendering)
 */

import { SchemaType } from "@google/generative-ai";

// ─── Compliance Status Enum ──────────────────────────────────────────────────

export type ComplianceStatus = "OUI" | "NON" | "A VERIFIER" | "NON CONCERNE";

// ─── Row-level schema ────────────────────────────────────────────────────────

export interface FeasibilityRow {
  /** Regulatory topic, e.g. "Emprise au sol maximale (CES)" */
  topic: string;
  /** The verbatim rule text found in the PLU for this topic */
  ruleText: string;
  /** Compliance verdict against the user's project intent */
  complianceStatus: ComplianceStatus;
  /** Context-aware recommendation or action item */
  recommendation: string;
}

// ─── Category-level grouping ─────────────────────────────────────────────────

export interface FeasibilityCategory {
  /** Category name, e.g. "USAGE DES SOLS", "IMPLANTATION ET VOLUMETRIE" */
  category: string;
  /** All regulatory rows under this category */
  rows: FeasibilityRow[];
}

// ─── Top-level report ────────────────────────────────────────────────────────

export interface FeasibilityConclusion {
  /** Overall feasibility summary paragraph */
  summary: string;
  /** List of items that require further verification by the user */
  requiredChecks: string[];
  /** Likely authorization type, e.g. "Déclaration Préalable", "Permis de Construire" */
  authorizationType: string;
}

export interface FeasibilityReport {
  /** Summary of the analysis context (project + zone + intent) */
  projectContext: string;
  /** The compliance matrix grouped by regulatory categories */
  matrix: FeasibilityCategory[];
  /** Final conclusion with overall assessment */
  conclusion: FeasibilityConclusion;
}

// ─── Gemini responseSchema ───────────────────────────────────────────────────
// This mirrors the TypeScript interfaces above and is passed directly to
// Gemini's generationConfig.responseSchema to enforce structured output.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const FEASIBILITY_REPORT_SCHEMA: any = {
  type: SchemaType.OBJECT,
  properties: {
    projectContext: {
      type: SchemaType.STRING,
      description:
        "Résumé du contexte d'analyse : zone PLU, intention du projet, adresse si connue.",
    },
    matrix: {
      type: SchemaType.ARRAY,
      description:
        "Matrice de conformité regroupée par catégories réglementaires.",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          category: {
            type: SchemaType.STRING,
            description:
              'Nom de la catégorie réglementaire, ex: "USAGE DES SOLS", "CONDITIONS D\'OCCUPATION", "IMPLANTATION ET VOLUMETRIE", "ASPECT EXTÉRIEUR", "STATIONNEMENT", "ESPACES LIBRES", "RESEAUX ET DESSERTE".',
          },
          rows: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                topic: {
                  type: SchemaType.STRING,
                  description:
                    'Sujet réglementaire, ex: "Emprise au sol maximale (CES)".',
                },
                ruleText: {
                  type: SchemaType.STRING,
                  description:
                    "Texte exact ou résumé fidèle de la règle trouvée dans le PLU pour ce sujet. Si non trouvé, indiquer 'Non réglementé dans le document'.",
                },
                complianceStatus: {
                  type: SchemaType.STRING,
                  enum: ["OUI", "NON", "A VERIFIER", "NON CONCERNE"],
                  description:
                    "Statut de conformité du projet par rapport à cette règle.",
                },
                recommendation: {
                  type: SchemaType.STRING,
                  description:
                    "Conseil contextuel et actionnable pour le porteur de projet.",
                },
              },
              required: [
                "topic",
                "ruleText",
                "complianceStatus",
                "recommendation",
              ],
            },
          },
        },
        required: ["category", "rows"],
      },
    },
    conclusion: {
      type: SchemaType.OBJECT,
      properties: {
        summary: {
          type: SchemaType.STRING,
          description:
            "Paragraphe de synthèse globale sur la faisabilité du projet.",
        },
        requiredChecks: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description:
            "Liste des vérifications restantes que le porteur de projet doit effectuer.",
        },
        authorizationType: {
          type: SchemaType.STRING,
          description:
            'Type d\'autorisation probable : "Déclaration Préalable (DP)", "Permis de Construire (PC)", "Aucune autorisation requise", etc.',
        },
      },
      required: ["summary", "requiredChecks", "authorizationType"],
    },
  },
  required: ["projectContext", "matrix", "conclusion"],
};

// ─── Fallback report (when Gemini is unavailable) ────────────────────────────

export function createFallbackFeasibilityReport(
  pluZone: string,
  projectIntent: string
): FeasibilityReport {
  return {
    projectContext: `Analyse de faisabilité pour la zone ${pluZone}. Projet : ${projectIntent}. (Analyse IA non disponible — résultats par défaut.)`,
    matrix: [
      {
        category: "USAGE DES SOLS",
        rows: [
          {
            topic: "Destinations autorisées",
            ruleText: "Non analysé — document PLU requis.",
            complianceStatus: "A VERIFIER",
            recommendation:
              "Veuillez relancer l'analyse avec un document PLU valide.",
          },
        ],
      },
      {
        category: "IMPLANTATION ET VOLUMETRIE",
        rows: [
          {
            topic: "Hauteur maximale",
            ruleText: "Non analysé — document PLU requis.",
            complianceStatus: "A VERIFIER",
            recommendation:
              "Veuillez relancer l'analyse avec un document PLU valide.",
          },
        ],
      },
    ],
    conclusion: {
      summary: `Analyse automatique non disponible pour la zone ${pluZone}. Veuillez uploader le document PLU pour obtenir une analyse de faisabilité complète.`,
      requiredChecks: [
        "Charger le règlement PLU de la zone concernée",
        "Vérifier manuellement les règles applicables",
      ],
      authorizationType:
        "À déterminer (Déclaration Préalable ou Permis de Construire selon le projet).",
    },
  };
}
