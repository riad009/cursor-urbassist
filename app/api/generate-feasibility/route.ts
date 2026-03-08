import { NextRequest, NextResponse } from "next/server";
import {
  GoogleGenerativeAI,
  type GenerationConfig,
} from "@google/generative-ai";
import {
  type FeasibilityReport,
  FEASIBILITY_REPORT_SCHEMA,
  createFallbackFeasibilityReport,
} from "@/lib/feasibility-matrix";

// ─── Config ──────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-2.5-flash";
const MAX_PDF_SIZE_BYTES = 30 * 1024 * 1024; // 30 MB
const API_TIMEOUT_MS = 180_000; // 3 min — feasibility analysis is heavier

// ─── POST handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ── 1. Parse multipart/form-data ─────────────────────────────────────
    const formData = await request.formData();
    const pdfFile = formData.get("pdfFile") as File | null;
    const pluZone = (formData.get("pluZone") as string)?.trim() || "non spécifiée";
    const projectIntent =
      (formData.get("projectIntent") as string)?.trim() || "";

    // ── 2. Validate inputs ───────────────────────────────────────────────
    if (!pdfFile || pdfFile.size === 0) {
      return NextResponse.json(
        { error: "Un fichier PDF du règlement PLU est requis." },
        { status: 400 }
      );
    }

    if (pdfFile.size > MAX_PDF_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: `Le fichier PDF dépasse la limite de ${MAX_PDF_SIZE_BYTES / 1024 / 1024} Mo.`,
        },
        { status: 400 }
      );
    }

    if (!pdfFile.type.includes("pdf") && !pdfFile.name.endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Seuls les fichiers PDF sont acceptés." },
        { status: 400 }
      );
    }

    if (!projectIntent) {
      return NextResponse.json(
        {
          error:
            "L'intention du projet est requise (ex: 'Construction d'un abri de jardin de 15m²').",
        },
        { status: 400 }
      );
    }

    // ── 3. Fallback if no API key ────────────────────────────────────────
    if (!GEMINI_API_KEY) {
      console.error(
        "GEMINI_API_KEY is not configured — returning fallback report"
      );
      return NextResponse.json({
        success: true,
        report: createFallbackFeasibilityReport(pluZone, projectIntent),
        source: "fallback" as const,
      });
    }

    // ── 4. Read PDF as base64 ────────────────────────────────────────────
    const pdfArrayBuffer = await pdfFile.arrayBuffer();
    const pdfBase64 = Buffer.from(pdfArrayBuffer).toString("base64");

    // ── 5. Initialize Gemini ─────────────────────────────────────────────
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

    const systemPrompt = buildVirtualArchitectSystemPrompt(
      pluZone,
      projectIntent
    );
    const userPrompt = buildUserPrompt(pluZone, projectIntent);

    const pdfPart = {
      inlineData: { data: pdfBase64, mimeType: "application/pdf" },
    };

    const generationConfig: GenerationConfig = {
      temperature: 0.1,
      maxOutputTokens: 16384,
      responseMimeType: "application/json",
      responseSchema: FEASIBILITY_REPORT_SCHEMA,
    };

    // ── 6. Call Gemini ───────────────────────────────────────────────────
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: systemPrompt,
      generationConfig,
    });

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), API_TIMEOUT_MS);

    let rawText: string | null = null;
    try {
      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [pdfPart, { text: userPrompt }],
          },
        ],
      });
      rawText = result.response.text();
    } finally {
      clearTimeout(timeout);
    }

    // ── 7. Parse response ────────────────────────────────────────────────
    if (!rawText) {
      console.error("Gemini returned empty response");
      return NextResponse.json({
        success: true,
        report: createFallbackFeasibilityReport(pluZone, projectIntent),
        source: "fallback" as const,
      });
    }

    let report: FeasibilityReport;
    try {
      report = JSON.parse(rawText) as FeasibilityReport;
    } catch {
      // Try to salvage partial JSON
      const parsed = parseLooseJson<FeasibilityReport>(rawText);
      if (parsed) {
        report = parsed;
      } else {
        console.error("Failed to parse Gemini response as JSON");
        return NextResponse.json({
          success: true,
          report: createFallbackFeasibilityReport(pluZone, projectIntent),
          source: "fallback" as const,
        });
      }
    }

    // ── 8. Sanitize / validate structure ─────────────────────────────────
    report = sanitizeFeasibilityReport(report, pluZone, projectIntent);

    return NextResponse.json({
      success: true,
      report,
      source: "gemini" as const,
    });
  } catch (error) {
    console.error("Generate Feasibility error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Erreur interne lors de la génération du rapport de faisabilité.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// THE "VIRTUAL ARCHITECT" SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

function buildVirtualArchitectSystemPrompt(
  pluZone: string,
  projectIntent: string
): string {
  return `Tu es un architecte DPLG français expérimenté, expert en urbanisme réglementaire et en Code de l'urbanisme.

═══ TA MISSION ═══

Tu dois produire une ANALYSE DE FAISABILITÉ RÉGLEMENTAIRE complète en comparant :
  A) Les règles du PLU (Plan Local d'Urbanisme) extraites du document PDF fourni, pour la zone "${pluZone}".
  B) L'intention de projet du demandeur : "${projectIntent}".

═══ RÈGLES ABSOLUES ═══

1. ZONE FOCUS : Analyse UNIQUEMENT les règles applicables à la zone "${pluZone}".
   Si le document contient plusieurs zones, IGNORE toutes les autres.
   Si la zone exacte n'est pas trouvée, cherche la correspondance la plus proche (ex: "UA" pour "Zone UA", "UA1").

2. ZÉRO HALLUCINATION : Si une règle n'est PAS explicitement mentionnée dans le document pour la zone "${pluZone}", indique "Non réglementé dans le document" dans ruleText et mets le statut "NON CONCERNE".

3. LOGIQUE DE CONFORMITÉ — C'EST CRUCIAL :

   ● "OUI" — Le projet respecte CLAIREMENT cette règle selon les informations fournies.
     Exemple : Le projet est un abri de jardin de 2.5m, la hauteur max est 10m → OUI.

   ● "NON" — Le projet VIOLE CLAIREMENT cette règle selon les informations fournies.
     Exemple : Le projet fait 20m de haut, la hauteur max est 10m → NON.

   ● "A VERIFIER" — La règle EXISTE et POURRAIT s'appliquer au projet, mais tu ne disposes pas de suffisamment d'informations dimensionnelles pour conclure.
     Exemple : Le CES max est de 40%, mais l'utilisateur n'a pas précisé la surface de la parcelle ni l'emprise existante → A VERIFIER.
     IMPORTANT : Dans la colonne recommendation, tu DOIS indiquer PRÉCISÉMENT ce que l'utilisateur doit calculer ou vérifier.
     Format recommandé : "Vérifier que [condition]. Pour cela, calculer [formule] avec [données nécessaires]."

   ● "NON CONCERNE" — La règle est SANS PERTINENCE pour ce type de projet.
     Exemple : Règle sur le stationnement commercial, mais le projet est un abri de jardin → NON CONCERNE.
     Dans la recommendation, expliquer brièvement pourquoi cette règle ne s'applique pas.

4. RECOMMANDATIONS : Chaque ligne DOIT avoir une recommandation utile et contextuelle :
   - Pour "OUI" : Confirmer ce qui est conforme et rappeler les conditions.
   - Pour "NON" : Expliquer la violation et proposer des solutions concrètes.
   - Pour "A VERIFIER" : Dire exactement QUOI vérifier et COMMENT (formule, mesure, document à consulter).
   - Pour "NON CONCERNE" : Justifier brièvement pourquoi la règle ne s'applique pas.

5. CATÉGORIES OBLIGATOIRES : Tu DOIS couvrir au minimum ces catégories :
   - USAGE DES SOLS : Destinations autorisées/interdites, mixité.
   - CONDITIONS D'OCCUPATION : CES, COS, CBS, espaces verts minimum.
   - IMPLANTATION ET VOLUMETRIE : Reculs, hauteurs, prospects, gabarits.
   - ASPECT EXTÉRIEUR : Toitures, façades, menuiseries, clôtures, annexes.
   - STATIONNEMENT : Places véhicules, vélos.
   - ESPACES LIBRES : Plantations, eaux pluviales.
   - RESEAUX ET DESSERTE : Accès, eau, assainissement, électricité.

6. CONCLUSION : Ta conclusion DOIT contenir :
   - Un résumé global de la faisabilité (faisable / faisable sous conditions / non faisable en l'état).
   - La liste des vérifications restantes (requiredChecks).
   - Le type d'autorisation probable : "Déclaration Préalable (DP)", "Permis de Construire (PC)", ou "Aucune autorisation requise" — en te basant sur les seuils du Code de l'urbanisme :
     * Surface de plancher ou emprise au sol ≤ 5m² sans modification de façade : aucune autorisation.
     * 5m² < Surface ≤ 20m² (ou 40m² en zone U avec PLU) : Déclaration Préalable.
     * Au-delà de 20m² (ou 40m²) : Permis de Construire.
     * Projet modifiant l'aspect extérieur : Déclaration Préalable minimum.

7. OUTPUT : Réponds avec un SEUL objet JSON valide. Pas de markdown, pas de commentaires, pas de texte hors du JSON.`;
}

function buildUserPrompt(pluZone: string, projectIntent: string): string {
  return `Analyse le document PDF du règlement PLU ci-joint et produis le rapport de faisabilité réglementaire.

Contexte :
- Zone PLU ciblée : ${pluZone}
- Intention du projet : ${projectIntent}

Instructions :
1. Identifie et lis attentivement les articles du règlement applicables à la zone "${pluZone}".
2. Pour CHAQUE règle trouvée, évalue sa conformité avec l'intention de projet "${projectIntent}".
3. Regroupe les résultats par catégorie réglementaire (Usage des sols, Conditions d'occupation, Implantation, Aspect extérieur, Stationnement, Espaces libres, Réseaux).
4. Pour chaque ligne, fournis : topic, ruleText (texte fidèle de la règle), complianceStatus, et recommendation.
5. Rédige une conclusion synthétique avec le type d'autorisation probable.

RAPPEL CRITIQUE :
- Utilise "A VERIFIER" quand tu n'as pas assez d'infos dimensionnelles pour conclure — et précise ce qu'il faut vérifier.
- Utilise "NON CONCERNE" quand la règle ne s'applique pas à ce type de projet.
- N'invente AUCUNE valeur. Extraits UNIQUEMENT ce qui est ÉCRIT dans le document.`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSING & SANITIZATION
// ═══════════════════════════════════════════════════════════════════════════════

const VALID_STATUSES = new Set([
  "OUI",
  "NON",
  "A VERIFIER",
  "NON CONCERNE",
]);

function sanitizeFeasibilityReport(
  raw: Partial<FeasibilityReport>,
  pluZone: string,
  projectIntent: string
): FeasibilityReport {
  const fallback = createFallbackFeasibilityReport(pluZone, projectIntent);

  const projectContext =
    typeof raw.projectContext === "string" && raw.projectContext.length > 0
      ? raw.projectContext
      : fallback.projectContext;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawMatrix = raw.matrix as any[] | undefined;
  const matrix = Array.isArray(rawMatrix)
    ? rawMatrix
        .filter(
          (cat) =>
            typeof cat === "object" &&
            cat !== null &&
            typeof cat.category === "string"
        )
        .map((cat) => ({
          category: String(cat.category),
          rows: Array.isArray(cat.rows)
            ? cat.rows
                .filter(
                  (row: unknown) =>
                    typeof row === "object" && row !== null
                )
                .map((row: Record<string, unknown>) => ({
                  topic:
                    typeof row.topic === "string" ? row.topic : "Non spécifié",
                  ruleText:
                    typeof row.ruleText === "string"
                      ? row.ruleText
                      : "Non extrait",
                  complianceStatus: VALID_STATUSES.has(
                    row.complianceStatus as string
                  )
                    ? (row.complianceStatus as
                        | "OUI"
                        | "NON"
                        | "A VERIFIER"
                        | "NON CONCERNE")
                    : "A VERIFIER",
                  recommendation:
                    typeof row.recommendation === "string"
                      ? row.recommendation
                      : "Vérifier manuellement.",
                }))
            : [],
        }))
    : fallback.matrix;

  const rawConclusion = raw.conclusion as
    | Partial<FeasibilityReport["conclusion"]>
    | undefined;

  const conclusion = {
    summary:
      typeof rawConclusion?.summary === "string" && rawConclusion.summary.length > 0
        ? rawConclusion.summary
        : fallback.conclusion.summary,
    requiredChecks: Array.isArray(rawConclusion?.requiredChecks)
      ? rawConclusion.requiredChecks.filter(
          (c): c is string => typeof c === "string" && c.length > 0
        )
      : fallback.conclusion.requiredChecks,
    authorizationType:
      typeof rawConclusion?.authorizationType === "string" &&
      rawConclusion.authorizationType.length > 0
        ? rawConclusion.authorizationType
        : fallback.conclusion.authorizationType,
  };

  return { projectContext, matrix, conclusion };
}

/**
 * Attempt to parse potentially malformed JSON.
 * Handles markdown code fences and trailing commas.
 */
function parseLooseJson<T>(text: string): T | null {
  if (!text) return null;

  // Strip markdown code fences
  const cleaned = text
    .replace(/```(?:json)?[\s\n]*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Try direct parse
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    /* continue */
  }

  // Try extracting the first JSON object
  const start = cleaned.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let end = start;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === "{") depth++;
    else if (cleaned[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end > start) {
    try {
      const block = cleaned
        .slice(start, end + 1)
        .replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(block) as T;
    } catch {
      /* give up */
    }
  }

  return null;
}
