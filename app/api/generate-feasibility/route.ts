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
import { execSync } from "child_process";
import { existsSync, readFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { extractZonePages, extractZoneText } from "@/lib/pdf-zone-extractor";

// ─── Config ──────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-2.5-flash";
const MAX_PDF_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB — smart splitting handles large files
const GEMINI_INLINE_LIMIT = 15 * 1024 * 1024; // ~15 MB raw
const API_TIMEOUT_MS = 180_000; // 3 min

// ─── POST handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ── 1. Parse multipart/form-data ─────────────────────────────────────
    const formData = await request.formData();
    // Accept both legacy and unified field names
    const pdfFile = (formData.get("pluPdfFile") as File | null) || (formData.get("pdfFile") as File | null);
    const pdfUrl = (formData.get("pluPdfUrl") as string) || (formData.get("pdfUrl") as string) || "";
    const pluZone = (formData.get("pluZone") as string)?.trim() || "non spécifiée";
    const projectIntent =
      (formData.get("projectIntent") as string)?.trim() || "";

    console.log(`[generate-feasibility] ▶ Request — pdfFile: ${pdfFile ? `${pdfFile.name} (${pdfFile.size}b)` : "none"}, pdfUrl: ${pdfUrl || "none"}, zone: ${pluZone}, intent: ${projectIntent.slice(0, 80)}...`);

    // ── 2. Validate inputs ───────────────────────────────────────────────
    const hasPdfFile = pdfFile && pdfFile.size > 0;
    const hasPdfUrl = pdfUrl.length > 10;

    if (!hasPdfFile && !hasPdfUrl) {
      return NextResponse.json(
        { error: "Un fichier PDF ou une URL du règlement PLU est requis." },
        { status: 400 }
      );
    }

    if (hasPdfFile && pdfFile!.size > MAX_PDF_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: `Le fichier PDF dépasse la limite de ${MAX_PDF_SIZE_BYTES / 1024 / 1024} Mo.`,
        },
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

    // ── 4. Resolve raw PDF buffer ────────────────────────────────────────
    let rawPdfBuffer: Buffer | null = null;

    if (hasPdfFile) {
      rawPdfBuffer = Buffer.from(await pdfFile!.arrayBuffer());
      console.log(`[generate-feasibility] ✓ Loaded uploaded file: ${rawPdfBuffer.byteLength} bytes`);
    } else if (hasPdfUrl) {
      // Multi-strategy download (same as analyze-plu)
      console.log(`[generate-feasibility] Fetching PDF via multi-strategy download: ${pdfUrl}`);
      const tmpDir = join(tmpdir(), "urbassist-feas");
      try { mkdirSync(tmpDir, { recursive: true }); } catch { /* exists */ }
      const tmpFile = join(tmpDir, `feas_${Date.now()}.pdf`);
      const sanitizedUrl = pdfUrl.replace(/"/g, '').replace(/'/g, '');

      const curlStrategies = [
        `curl -sS -L --max-time 120 --retry 3 --retry-delay 3 --retry-all-errors -o "${tmpFile}" -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" -H "Accept: application/pdf,*/*" "${sanitizedUrl}"`,
        `curl -sS -L --max-time 120 --retry 2 --retry-delay 5 -o "${tmpFile}" -H "User-Agent: UrbAssist/2.0 (Linux)" "${sanitizedUrl}"`,
        `curl -sS -L -k --max-time 120 -o "${tmpFile}" "${sanitizedUrl}"`,
      ];

      for (let i = 0; i < curlStrategies.length; i++) {
        try {
          try { if (existsSync(tmpFile)) unlinkSync(tmpFile); } catch { /* ok */ }
          console.log(`[generate-feasibility] ➤ Strategy ${i + 1}/${curlStrategies.length}...`);
          execSync(curlStrategies[i], { timeout: 130_000, stdio: ['pipe', 'pipe', 'pipe'] });

          if (existsSync(tmpFile)) {
            const buf = readFileSync(tmpFile);
            const first4 = buf.slice(0, 4).toString();
            if (first4 === "%PDF" && buf.byteLength >= 100) {
              rawPdfBuffer = buf;
              console.log(`[generate-feasibility] ✓ Strategy ${i + 1} succeeded: ${buf.byteLength} bytes (${(buf.byteLength / 1024 / 1024).toFixed(1)}MB), valid PDF`);
              break;
            } else {
              console.warn(`[generate-feasibility] ✗ Strategy ${i + 1}: Not a valid PDF (${buf.byteLength} bytes)`);
            }
          }
        } catch (e) {
          console.warn(`[generate-feasibility] ✗ Strategy ${i + 1} failed:`, (e as Error).message?.slice(0, 200));
        }
      }
      try { if (existsSync(tmpFile)) unlinkSync(tmpFile); } catch { /* ok */ }

      // Final fallback: Node.js fetch
      if (!rawPdfBuffer) {
        try {
          console.log(`[generate-feasibility] ➤ Fallback: Node.js fetch...`);
          const fetchRes = await fetch(sanitizedUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept": "application/pdf,*/*" },
            redirect: "follow",
            signal: AbortSignal.timeout(120_000),
          });
          if (fetchRes.ok) {
            const nodeBuf = Buffer.from(await fetchRes.arrayBuffer());
            if (nodeBuf.slice(0, 4).toString() === "%PDF" && nodeBuf.byteLength >= 100) {
              rawPdfBuffer = nodeBuf;
              console.log(`[generate-feasibility] ✓ Node.js fetch succeeded: ${nodeBuf.byteLength} bytes`);
            }
          }
        } catch (e) {
          console.warn(`[generate-feasibility] ✗ Node.js fetch failed:`, (e as Error).message?.slice(0, 200));
        }
      }
    }

    if (!rawPdfBuffer) {
      return NextResponse.json(
        { error: "Impossible d'obtenir le document PLU. Veuillez réessayer ou uploader le fichier manuellement." },
        { status: 400 }
      );
    }

    // ── 5. Smart Zone Splitting (same pipeline as analyze-plu) ───────────
    let pdfBase64: string | null = null;
    let degradedModeText: string | null = null;

    if (rawPdfBuffer.byteLength <= GEMINI_INLINE_LIMIT) {
      pdfBase64 = rawPdfBuffer.toString("base64");
      console.log(`[generate-feasibility] ✓ PDF small enough for inline (${(rawPdfBuffer.byteLength / 1024 / 1024).toFixed(1)}MB)`);
    } else {
      console.log(`[generate-feasibility] ▶ PDF is ${(rawPdfBuffer.byteLength / 1024 / 1024).toFixed(1)}MB — running smart zone extraction for "${pluZone}"...`);
      try {
        const extraction = await extractZonePages(rawPdfBuffer, pluZone);
        if (extraction.zoneFound && extraction.extractedPageCount > 0) {
          if (extraction.buffer.byteLength <= GEMINI_INLINE_LIMIT) {
            pdfBase64 = extraction.buffer.toString("base64");
            console.log(`[generate-feasibility] ✓ ${extraction.summary}`);
          } else {
            console.warn(`[generate-feasibility] ⚠ Split PDF still ${(extraction.buffer.byteLength / 1024 / 1024).toFixed(1)}MB — falling back to text extraction`);
            const textResult = await extractZoneText(rawPdfBuffer, pluZone);
            if (textResult.text.length > 100) {
              degradedModeText = textResult.text;
              console.log(`[generate-feasibility] ✓ Text extracted: ${textResult.pageCount} pages, ${textResult.text.length} chars`);
            }
          }
        } else {
          console.warn(`[generate-feasibility] ⚠ Zone "${pluZone}" not found in PDF — trying text extraction`);
          const textResult = await extractZoneText(rawPdfBuffer, pluZone);
          if (textResult.text.length > 100) {
            degradedModeText = textResult.text;
            console.log(`[generate-feasibility] ✓ Text extracted: ${textResult.pageCount} pages, ${textResult.text.length} chars`);
          }
        }
      } catch (err) {
        console.warn(`[generate-feasibility] ✗ Zone extraction failed:`, (err as Error).message);
        try {
          const textResult = await extractZoneText(rawPdfBuffer, pluZone);
          if (textResult.text.length > 100) {
            degradedModeText = textResult.text;
            console.log(`[generate-feasibility] ✓ Text fallback: ${textResult.pageCount} pages, ${textResult.text.length} chars`);
          }
        } catch { /* truly degraded */ }
      }
    }

    // If no usable data at all, return fallback
    if (!pdfBase64 && !degradedModeText) {
      console.warn(`[generate-feasibility] ✗ All PDF processing failed — returning fallback`);
      return NextResponse.json({
        success: true,
        report: createFallbackFeasibilityReport(pluZone, projectIntent),
        source: "fallback" as const,
      });
    }

    // ── 6. Initialize Gemini ─────────────────────────────────────────────
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

    const systemPrompt = buildVirtualArchitectSystemPrompt(
      pluZone,
      projectIntent
    );
    let userPrompt = buildUserPrompt(pluZone, projectIntent);

    // If degraded text mode, inject extracted text into user prompt
    if (degradedModeText && !pdfBase64) {
      userPrompt += `\n\n--- CONTENU EXTRAIT DU RÈGLEMENT PLU (ZONE ${pluZone.toUpperCase()}) ---\n${degradedModeText}\n--- FIN DU CONTENU EXTRAIT ---\n\nATTENTION: Le document PDF complet n'a pas pu être traité. Les extraits ci-dessus proviennent des pages les plus pertinentes pour la zone ${pluZone.toUpperCase()}. Analysez ces extraits en détail.`;
      console.log(`[generate-feasibility] ✓ Injected ${degradedModeText.length} chars of extracted text into prompt`);
    }

    // Build PDF parts array (empty in degraded mode)
    const pdfParts: { inlineData: { data: string; mimeType: string } }[] = [];
    if (pdfBase64) {
      pdfParts.push({ inlineData: { data: pdfBase64, mimeType: "application/pdf" } });
    }

    const generationConfig: GenerationConfig = {
      temperature: 0.1,
      maxOutputTokens: 16384,
      responseMimeType: "application/json",
      responseSchema: FEASIBILITY_REPORT_SCHEMA,
    };

    // ── 7. Call Gemini ───────────────────────────────────────────────────
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: systemPrompt,
      generationConfig,
    });

    const timeout = setTimeout(() => {}, API_TIMEOUT_MS);

    let rawText: string | null = null;
    try {
      // Attempt 1: with PDF parts
      try {
        const result = await model.generateContent({
          contents: [
            {
              role: "user",
              parts: [
                ...pdfParts,
                { text: userPrompt },
              ],
            },
          ],
        });
        rawText = result.response.text();
      } catch (firstErr) {
        const errMsg = (firstErr as Error).message || "";
        const is400 = errMsg.includes("400") || errMsg.includes("Bad Request") || errMsg.includes("invalid argument");

        // If 400 with PDF, retry without PDF (text-only)
        if (is400 && pdfParts.length > 0) {
          console.warn(`[generate-feasibility] ⚠ Gemini 400 with PDF — retrying text-only`);
          const retryResult = await model.generateContent({
            contents: [
              {
                role: "user",
                parts: [
                  { text: `[NOTE: Le document PDF n'a pas pu être analysé directement. Réponds en te basant sur les informations textuelles.]\n\n${userPrompt}` },
                ],
              },
            ],
          });
          rawText = retryResult.response.text();
        } else {
          throw firstErr;
        }
      }
    } finally {
      clearTimeout(timeout);
    }

    // ── 8. Parse response ────────────────────────────────────────────────
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

    // ── 9. Sanitize / validate structure ─────────────────────────────────
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
