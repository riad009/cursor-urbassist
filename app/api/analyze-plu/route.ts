import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { existsSync, readFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  GoogleGenerativeAI,
  SchemaType,
  type GenerationConfig,
} from "@google/generative-ai";
import {
  type PluRules,
  type DeepPluAnalysis,
  createFallbackPluRules,
} from "@/lib/plu-rules";
import { extractZonePages, extractZoneText } from "@/lib/pdf-zone-extractor";
import { detectPlaceholderPdf } from "@/lib/pdf-placeholder-detector";

// ─── Config ──────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-2.5-flash";
const MAX_PDF_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB — smart splitting handles large files
const GEMINI_INLINE_LIMIT = 15 * 1024 * 1024; // ~15 MB raw = ~20 MB base64 (Gemini inline limit)
const API_TIMEOUT_MS = 120_000; // 2 min — large PDFs can take time

// ─── Gemini responseSchema for PluRules ──────────────────────────────────────
// This guarantees the output JSON matches our TypeScript interface exactly.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PLU_RULES_SCHEMA: any = {
  type: SchemaType.OBJECT,
  properties: {
    maxCoverageRatio: { type: SchemaType.NUMBER, nullable: true },
    maxHeight: { type: SchemaType.NUMBER, nullable: true },
    maxRidgeHeight: { type: SchemaType.NUMBER, nullable: true },
    setbacks: {
      type: SchemaType.OBJECT,
      properties: {
        front: { type: SchemaType.STRING, nullable: true, description: "Number in metres or formula string like 'H/2 avec minimum 3m'. Use null if not found." },
        side: { type: SchemaType.STRING, nullable: true, description: "Number in metres or formula string. Use null if not found." },
        rear: { type: SchemaType.STRING, nullable: true, description: "Number in metres or formula string. Use null if not found." },
      },
      required: ["front", "side", "rear"],
    },
    minPlotArea: { type: SchemaType.NUMBER, nullable: true },
    maxFloorAreaRatio: { type: SchemaType.NUMBER, nullable: true },
    greenSpaceMinPercent: { type: SchemaType.NUMBER, nullable: true },
    maxFenceHeight: { type: SchemaType.NUMBER, nullable: true },
    allowedRoofTypes: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    roofSlopeRange: { type: SchemaType.STRING, nullable: true },
    allowedRoofMaterials: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    forbiddenRoofMaterials: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    allowedFacadeMaterials: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    forbiddenFacadeMaterials: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    allowedFacadeColors: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    forbiddenFacadeColors: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    allowedJoineryMaterials: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    forbiddenJoineryColors: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    parkingRequirements: { type: SchemaType.STRING, nullable: true },
    annexRules: { type: SchemaType.STRING, nullable: true },
    architectRequired: { type: SchemaType.BOOLEAN },
    abfSpecificConstraints: { type: SchemaType.STRING, nullable: true },
    heritageNotes: { type: SchemaType.STRING, nullable: true },
    notes: { type: SchemaType.STRING },
    extractionConfidence: {
      type: SchemaType.STRING,
      enum: ["high", "medium", "low"],
    },
  },
  required: [
    "maxCoverageRatio", "maxHeight", "maxRidgeHeight", "setbacks",
    "allowedRoofTypes", "allowedRoofMaterials", "forbiddenRoofMaterials",
    "allowedFacadeMaterials", "forbiddenFacadeMaterials",
    "allowedFacadeColors", "forbiddenFacadeColors",
    "allowedJoineryMaterials", "forbiddenJoineryColors",
    "architectRequired", "notes", "extractionConfidence",
  ],
};

// ─── POST handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ── 1. Parse multipart/form-data ───────────────────────────────────────
    const formData = await request.formData();
    // Accept both legacy field names and new unified field names
    const pdfFile = (formData.get("pluPdfFile") as File | null) || (formData.get("pdfFile") as File | null);
    const pdfFile2 = (formData.get("lotissementFile") as File | null) || (formData.get("pdfFile2") as File | null); // Optional lotissement supplement
    const pdfUrl = (formData.get("pluPdfUrl") as string) || (formData.get("pdfUrl") as string) || "";   // Auto-fetched GPU URL
    const pluZone = (formData.get("pluZone") as string) || "non spécifiée";
    const isABFZone = (formData.get("isABFZone") as string) === "true";
    const parcelAddress = (formData.get("parcelAddress") as string) || "non précisée";
    const projectBrief = (formData.get("projectBrief") as string) || "";

    // ── 2. Resolve primary PDF — 3-LAYER PIPELINE ────────────────────────
    // Layer 1: Download → Smart Zone Split → inline to Gemini
    // Layer 2: (reserved for Gemini File API — future)
    // Layer 3: Text-only extraction → degraded mode
    let primaryPdfBase64: string | null = null;
    let degradedModeText: string | null = null; // Layer 3 fallback text

    console.log(`[analyze-plu] ▶ Request received — pdfFile: ${pdfFile ? `${pdfFile.name} (${pdfFile.size}b)` : "none"}, pdfUrl: ${pdfUrl || "none"}, zone: ${pluZone}, ABF: ${isABFZone}, projectBrief: ${projectBrief ? `${projectBrief.length} chars` : "none"}`);

    // ── Download or read the raw PDF buffer ──────────────────────────────
    let rawPdfBuffer: Buffer | null = null;

    if (pdfFile && pdfFile.size > 0) {
      if (!pdfFile.type.includes("pdf") && !pdfFile.name.endsWith(".pdf")) {
        return NextResponse.json(
          { error: "Seuls les fichiers PDF sont acceptés." },
          { status: 400 }
        );
      }
      if (pdfFile.size > MAX_PDF_SIZE_BYTES) {
        return NextResponse.json(
          { error: `Le fichier PDF dépasse la limite de ${MAX_PDF_SIZE_BYTES / 1024 / 1024} Mo.` },
          { status: 400 }
        );
      }
      rawPdfBuffer = Buffer.from(await pdfFile.arrayBuffer());
      console.log(`[analyze-plu] ✓ Loaded uploaded file: ${rawPdfBuffer.byteLength} bytes`);
    } else if (pdfUrl.trim()) {
      // Multi-strategy download from geoportail-urbanisme.gouv.fr
      console.log(`[analyze-plu] Fetching PDF via multi-strategy download: ${pdfUrl}`);
      const tmpDir = join(tmpdir(), "urbassist-plu");
      try { mkdirSync(tmpDir, { recursive: true }); } catch { /* exists */ }
      const tmpFile = join(tmpDir, `plu_${Date.now()}.pdf`);
      const sanitizedUrl = pdfUrl.replace(/"/g, '').replace(/'/g, '');

      const curlStrategies = [
        `curl -sS -L --max-time 120 --retry 3 --retry-delay 3 --retry-all-errors -o "${tmpFile}" -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" -H "Accept: application/pdf,*/*" "${sanitizedUrl}"`,
        `curl -sS -L --max-time 120 --retry 2 --retry-delay 5 -o "${tmpFile}" -H "User-Agent: UrbAssist/2.0 (Linux)" "${sanitizedUrl}"`,
        `curl -sS -L -k --max-time 120 -o "${tmpFile}" "${sanitizedUrl}"`,
      ];

      for (let i = 0; i < curlStrategies.length; i++) {
        try {
          try { if (existsSync(tmpFile)) unlinkSync(tmpFile); } catch { /* ok */ }
          console.log(`[analyze-plu] ➤ Strategy ${i + 1}/${curlStrategies.length}...`);
          execSync(curlStrategies[i], { timeout: 130_000, stdio: ['pipe', 'pipe', 'pipe'] });

          if (existsSync(tmpFile)) {
            const buf = readFileSync(tmpFile);
            const first4 = buf.slice(0, 4).toString();
            if (first4 === "%PDF" && buf.byteLength >= 100) {
              rawPdfBuffer = buf;
              console.log(`[analyze-plu] ✓ Strategy ${i + 1} succeeded: ${buf.byteLength} bytes (${(buf.byteLength / 1024 / 1024).toFixed(1)}MB), valid PDF`);
              break;
            } else {
              console.warn(`[analyze-plu] ✗ Strategy ${i + 1}: Not a valid PDF (${buf.byteLength} bytes)`);
            }
          } else {
            console.warn(`[analyze-plu] ✗ Strategy ${i + 1}: No output file created`);
          }
        } catch (e) {
          console.warn(`[analyze-plu] ✗ Strategy ${i + 1} failed:`, (e as Error).message?.slice(0, 200));
        }
      }
      try { if (existsSync(tmpFile)) unlinkSync(tmpFile); } catch { /* ok */ }

      // Fallback: Node.js fetch
      if (!rawPdfBuffer) {
        try {
          console.log(`[analyze-plu] ➤ Fallback: Node.js fetch...`);
          const fetchRes = await fetch(sanitizedUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept": "application/pdf,*/*" },
            redirect: "follow",
            signal: AbortSignal.timeout(120_000),
          });
          if (fetchRes.ok) {
            const nodeBuf = Buffer.from(await fetchRes.arrayBuffer());
            if (nodeBuf.slice(0, 4).toString() === "%PDF" && nodeBuf.byteLength >= 100) {
              rawPdfBuffer = nodeBuf;
              console.log(`[analyze-plu] ✓ Node.js fetch succeeded: ${nodeBuf.byteLength} bytes (${(nodeBuf.byteLength / 1024 / 1024).toFixed(1)}MB)`);
            }
          }
        } catch (e) {
          console.warn(`[analyze-plu] ✗ Node.js fetch failed:`, (e as Error).message?.slice(0, 200));
        }
      }

      // ── Detect placeholder/redirect PDFs ────────────────────────────
      // Some municipalities upload a tiny placeholder PDF that says
      // "visit our website to download the real documents".
      // These pass %PDF validation but have no useful regulatory content.
      if (rawPdfBuffer) {
        const phCheck = await detectPlaceholderPdf(rawPdfBuffer);
        if (phCheck.isPlaceholder) {
          console.warn(`[analyze-plu] ⚠ Placeholder PDF detected from URL — discarding. ${phCheck.reason}`);
          rawPdfBuffer = null; // Force pipeline to fall through to text-only / manual upload
          // Store info so we can return it in the response
          (request as unknown as Record<string, unknown>).__placeholderInfo = phCheck;
        }
      }
    } else {
      console.warn(`[analyze-plu] ✗ No PDF source provided (no file, no URL)`);
    }

    // ── LAYER 1: Smart Zone Splitting ────────────────────────────────────
    // If we have a raw PDF, try to extract only zone-relevant pages
    if (rawPdfBuffer) {
      if (rawPdfBuffer.byteLength <= GEMINI_INLINE_LIMIT) {
        // Small enough for Gemini inline — no splitting needed
        primaryPdfBase64 = rawPdfBuffer.toString("base64");
        console.log(`[analyze-plu] ✓ PDF small enough for inline (${(rawPdfBuffer.byteLength / 1024 / 1024).toFixed(1)}MB) — no splitting needed`);
      } else {
        // Large PDF — need smart zone splitting
        console.log(`[analyze-plu] ▶ PDF is ${(rawPdfBuffer.byteLength / 1024 / 1024).toFixed(1)}MB — running smart zone extraction for "${pluZone}"...`);
        try {
          const extraction = await extractZonePages(rawPdfBuffer, pluZone);
          if (extraction.zoneFound && extraction.extractedPageCount > 0) {
            // Check if the extracted PDF fits inline
            if (extraction.buffer.byteLength <= GEMINI_INLINE_LIMIT) {
              primaryPdfBase64 = extraction.buffer.toString("base64");
              console.log(`[analyze-plu] ✓ ${extraction.summary}`);
            } else {
              // Still too large even after splitting — try text extraction
              console.warn(`[analyze-plu] ⚠ Split PDF still ${(extraction.buffer.byteLength / 1024 / 1024).toFixed(1)}MB — falling back to text extraction`);
              const textResult = await extractZoneText(rawPdfBuffer, pluZone);
              if (textResult.text.length > 100) {
                degradedModeText = textResult.text;
                console.log(`[analyze-plu] ✓ Text extracted: ${textResult.pageCount} pages, ${textResult.text.length} chars`);
              }
            }
          } else {
            // Zone not found in PDF — use text extraction fallback
            console.warn(`[analyze-plu] ⚠ Zone "${pluZone}" not found in PDF — trying text extraction`);
            const textResult = await extractZoneText(rawPdfBuffer, pluZone);
            if (textResult.text.length > 100) {
              degradedModeText = textResult.text;
              console.log(`[analyze-plu] ✓ Text extracted: ${textResult.pageCount} pages, ${textResult.text.length} chars`);
            }
          }
        } catch (err) {
          console.warn(`[analyze-plu] ✗ Zone extraction failed:`, (err as Error).message);
          // Last resort: try text extraction
          try {
            const textResult = await extractZoneText(rawPdfBuffer, pluZone);
            if (textResult.text.length > 100) {
              degradedModeText = textResult.text;
              console.log(`[analyze-plu] ✓ Text fallback: ${textResult.pageCount} pages, ${textResult.text.length} chars`);
            }
          } catch { /* truly degraded */ }
        }
      }
    }

    // ── Check if we have any usable data ─────────────────────────────────
    if (!primaryPdfBase64 && !degradedModeText && pdfUrl.trim()) {
      console.warn(`[analyze-plu] ⚠ All PDF processing strategies failed — running text-only qualitative analysis`);
    }
    if (!primaryPdfBase64 && !degradedModeText && !pdfUrl.trim()) {
      return NextResponse.json(
        { error: "Aucune source de document PLU trouvée. Veuillez uploader un fichier PDF ou vérifier que l'URL automatique est disponible." },
        { status: 400 }
      );
    }

    // ── 3. Resolve optional second PDF (lotissement) ──────────────────────
    let secondPdfBase64: string | null = null;
    if (pdfFile2 && pdfFile2.size > 0) {
      if (pdfFile2.size > MAX_PDF_SIZE_BYTES) {
        console.warn(`[analyze-plu] Second PDF too large, skipping`);
      } else {
        const buf2 = await pdfFile2.arrayBuffer();
        secondPdfBase64 = Buffer.from(buf2).toString("base64");
        console.log(`[analyze-plu] Lotissement supplement: ${buf2.byteLength} bytes`);
      }
    }

    const hasMultipleDocs = !!secondPdfBase64;

    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is not configured in environment variables");
      return NextResponse.json(
        {
          success: true,
          analysis: generateFallbackAnalysis(pluZone),
          pluRules: createFallbackPluRules(),
          source: "fallback" as const,
        },
        { status: 200 }
      );
    }

    // ── 4. Initialize Gemini ───────────────────────────────────────────────
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const hasPdf = !!primaryPdfBase64;
    const hasContent = hasPdf || !!degradedModeText; // Either PDF or extracted text
    console.log(`[analyze-plu] ▶ Calling Gemini (model: ${MODEL_NAME}, PDF: ${hasPdf ? `${primaryPdfBase64!.length} base64 chars` : 'NONE'}, text: ${degradedModeText ? `${degradedModeText.length} chars` : 'NONE'})`);

    // ── 5. Build prompts ───────────────────────────────────────────────────
    const qualitativeSystemPrompt = buildQualitativeSystemPrompt(pluZone, isABFZone, hasMultipleDocs, projectBrief);
    let qualitativeUserPrompt = buildQualitativeUserPrompt(pluZone, isABFZone, parcelAddress, hasMultipleDocs, projectBrief);
    const extractionSystemPrompt = buildExtractionSystemPrompt(pluZone, isABFZone, hasMultipleDocs, projectBrief);
    let extractionUserPrompt = buildExtractionUserPrompt(pluZone, isABFZone, parcelAddress, hasMultipleDocs, projectBrief);

    // If we have extracted text (Layer 3), inject it into the user prompts
    if (degradedModeText && !hasPdf) {
      const textBlock = `\n\n--- CONTENU EXTRAIT DU RÈGLEMENT PLU (ZONE ${pluZone.toUpperCase()}) ---\n${degradedModeText}\n--- FIN DU CONTENU EXTRAIT ---\n\nATTENTION: Le document PDF complet n'a pas pu être traité. Les extraits ci-dessus proviennent des pages les plus pertinentes pour la zone ${pluZone.toUpperCase()}. Analysez ces extraits en détail pour extraire les règles applicables.`;
      qualitativeUserPrompt += textBlock;
      extractionUserPrompt += textBlock;
      console.log(`[analyze-plu] ✓ Injected ${degradedModeText.length} chars of extracted text into prompts`);
    }

    // ── 6. Build PDF parts array (empty in degraded mode) ─────────────────
    const pdfParts: { inlineData: { data: string; mimeType: string } }[] = [];
    if (primaryPdfBase64) {
      pdfParts.push({ inlineData: { data: primaryPdfBase64, mimeType: "application/pdf" } });
    }
    if (secondPdfBase64) {
      pdfParts.push({ inlineData: { data: secondPdfBase64, mimeType: "application/pdf" } });
    }

    const qualitativeConfig: GenerationConfig = {
      temperature: 0.1,
      maxOutputTokens: 16384,
      responseMimeType: "application/json",
    };

    const extractionConfig: GenerationConfig = {
      temperature: 0,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
      responseSchema: PLU_RULES_SCHEMA,
    };

    const t0 = Date.now();
    // Run both calls — extraction runs if we have PDF OR extracted text
    const geminiCalls: [Promise<string | null>, Promise<string | null>] = [
      callGeminiWithPdfs(genAI, qualitativeSystemPrompt, qualitativeUserPrompt, pdfParts, qualitativeConfig),
      hasContent
        ? callGeminiWithPdfs(genAI, extractionSystemPrompt, extractionUserPrompt, pdfParts, extractionConfig)
        : Promise.resolve(null),
    ];
    const [qualResult, extractResult] = await Promise.allSettled(geminiCalls);
    console.log(`[analyze-plu] Gemini calls completed in ${Date.now() - t0}ms — qualitative: ${qualResult.status}, extraction: ${hasContent ? extractResult.status : 'SKIPPED (no content)'}`);


    // ── 7. Parse responses ─────────────────────────────────────────────────
    let qualOk = false;
    let extractOk = false;
    let analysis: DeepPluAnalysis = generateFallbackAnalysis(pluZone);
    if (qualResult.status === "fulfilled" && qualResult.value) {
      try {
        analysis = JSON.parse(qualResult.value) as DeepPluAnalysis;
        qualOk = true;
        console.log(`[analyze-plu] ✓ Qualitative analysis parsed (keys: ${Object.keys(analysis).join(", ")})`);
      } catch (e) {
        console.warn(`[analyze-plu] ⚠ Qualitative JSON parse failed, trying loose parse:`, (e as Error).message);
        const looseParsed = parseLooseJson<DeepPluAnalysis>(qualResult.value);
        if (looseParsed) {
          analysis = looseParsed;
          qualOk = true;
          console.log(`[analyze-plu] ✓ Qualitative loose-parsed successfully`);
        } else {
          console.warn(`[analyze-plu] ✗ Qualitative loose parse also failed. Raw output (first 500 chars): ${qualResult.value.slice(0, 500)}`);
        }
      }
    } else if (qualResult.status === "rejected") {
      console.error("[analyze-plu] ✗ Qualitative Gemini call REJECTED:", qualResult.reason);
    } else {
      console.warn(`[analyze-plu] ✗ Qualitative Gemini returned null/empty`);
    }

    let pluRules: PluRules = createFallbackPluRules();
    if (extractResult.status === "fulfilled" && extractResult.value) {
      try {
        const raw = JSON.parse(extractResult.value);
        pluRules = sanitizePluRules(raw);
        extractOk = true;
        console.log(`[analyze-plu] ✓ PluRules extracted (confidence: ${pluRules.extractionConfidence}, maxHeight: ${pluRules.maxHeight}, CES: ${pluRules.maxCoverageRatio})`);
      } catch (e) {
        console.warn(`[analyze-plu] ⚠ Extraction JSON parse failed, trying loose:`, (e as Error).message);
        const parsed = parseLooseJson<Partial<PluRules>>(extractResult.value);
        if (parsed) {
          pluRules = sanitizePluRules(parsed);
          extractOk = true;
          console.log(`[analyze-plu] ✓ PluRules loose-parsed (confidence: ${pluRules.extractionConfidence})`);
        } else {
          console.warn(`[analyze-plu] ✗ Extraction loose parse also failed. Trying regex extraction...`);
          // Last-resort: regex extraction of key values from raw text
          const regexRules = regexExtractPluRules(extractResult.value);
          if (regexRules) {
            pluRules = sanitizePluRules(regexRules);
            pluRules.extractionConfidence = "low";
            extractOk = true;
            console.log(`[analyze-plu] ✓ PluRules regex-extracted (maxHeight: ${pluRules.maxHeight}, CES: ${pluRules.maxCoverageRatio})`);
          } else {
            console.warn(`[analyze-plu] ✗ All extraction methods failed. Raw (first 500): ${extractResult.value.slice(0, 500)}`);
          }
        }
      }
    } else if (extractResult.status === "rejected") {
      console.error("[analyze-plu] ✗ Extraction Gemini call REJECTED:", extractResult.reason);
    } else {
      console.warn(`[analyze-plu] ✗ Extraction Gemini returned null/empty`);
    }

    // ── 8. Determine source quality ───────────────────────────────────────
    const source = (qualOk || extractOk) ? "gemini" : "fallback";
    if (source === "fallback") {
      console.error(`[analyze-plu] ✗✗ BOTH Gemini calls failed — returning fallback data. This means the AI analysis did NOT work.`);
    } else {
      console.log(`[analyze-plu] ✓ Returning ${source} data (qualitative: ${qualOk ? "OK" : "fallback"}, extraction: ${extractOk ? "OK" : "fallback"})`);
    }

    // ── 9. Return combined result ──────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const placeholderInfo = (request as any).__placeholderInfo as { isPlaceholder: boolean; suggestedUrl: string | null; reason: string | null } | undefined;

    return NextResponse.json({
      success: true,
      analysis,
      pluRules,
      source,
      documentsAnalyzed: hasMultipleDocs ? 2 : 1,
      ...(placeholderInfo?.isPlaceholder ? {
        placeholderDetected: true,
        suggestedUrl: placeholderInfo.suggestedUrl,
        placeholderReason: placeholderInfo.reason,
      } : {}),
    });
  } catch (error) {
    console.error("PLU Analysis error:", error);
    const message = error instanceof Error ? error.message : "Erreur interne lors de l'analyse du document PLU.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── Gemini call helper ──────────────────────────────────────────────────────

async function callGeminiWithPdfs(
  genAI: GoogleGenerativeAI,
  systemPrompt: string,
  userPrompt: string,
  pdfParts: { inlineData: { data: string; mimeType: string } }[],
  generationConfig: GenerationConfig,
): Promise<string | null> {
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: systemPrompt,
    generationConfig,
  });

  const timeout = setTimeout(() => {}, API_TIMEOUT_MS);

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
      return result.response.text();
    } catch (firstErr) {
      const errMsg = (firstErr as Error).message || "";
      const is400 = errMsg.includes("400") || errMsg.includes("Bad Request") || errMsg.includes("invalid argument");

      // If the error is a 400 and we had PDF parts, retry WITHOUT PDF (degraded text-only)
      if (is400 && pdfParts.length > 0) {
        console.warn(`[analyze-plu] ⚠ Gemini 400 with PDF — retrying text-only (PDF may be unprocessable: corrupted, scanned, or too complex)`);
        const retryResult = await model.generateContent({
          contents: [
            {
              role: "user",
              parts: [
                { text: `[NOTE: Le document PDF n'a pas pu être analysé directement. Réponds en te basant UNIQUEMENT sur les informations textuelles fournies dans le prompt système et ci-dessous. Indique clairement dans tes réponses que l'analyse est basée sur les informations du projet et non sur le document PLU.]\n\n${userPrompt}` },
              ],
            },
          ],
        });
        return retryResult.response.text();
      }

      // Not a 400 or no PDF parts — rethrow
      throw firstErr;
    }
  } finally {
    clearTimeout(timeout);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MASTER SYSTEM PROMPTS
// ═══════════════════════════════════════════════════════════════════════════════

function buildExtractionSystemPrompt(pluZone: string, isABFZone: boolean, hasMultipleDocs = false, projectBrief = ""): string {
  const multiDocNote = hasMultipleDocs
    ? `\n\n9. MULTIPLE DOCUMENTS: You are given TWO PDF documents. The FIRST is the main PLU regulation. The SECOND is a subdivision regulation (règlement de lotissement) that may override or supplement the PLU. When both documents address the same rule, the LOTISSEMENT regulation takes precedence. Extract values from BOTH documents, clearly noting in the "notes" field when a lotissement rule overrides the PLU.`
    : "";
  const briefNote = projectBrief.trim()
    ? `\n\n10. PROJECT CONTEXT: The applicant has provided the following project brief. Use this to understand the project scope and focus your extraction on the rules most relevant to this specific project:\n\n--- PROJECT BRIEF ---\n${projectBrief.trim()}\n--- END PROJECT BRIEF ---`
    : "";
  return `You are an expert-level French urban planning regulation parser (urbaniste confirmé).
Your SOLE mission is to extract PRECISE, machine-readable regulatory values from a PLU (Plan Local d'Urbanisme) document.

═══ ABSOLUTE RULES ═══

1. ZONE FOCUS: Extract rules ONLY for the zone "${pluZone}". If the document contains multiple zones, IGNORE all zones except "${pluZone}". If you cannot find the exact zone name, look for the closest match (e.g., "UA" matches "Zone UA", "UA1", "UA-a").

2. NO HALLUCINATION: If a specific rule is NOT explicitly mentioned in the text for zone "${pluZone}", you MUST return null for that field. Do NOT guess, infer, estimate, or use standard/typical French urban planning defaults. Extract ONLY what is WRITTEN in the document.

3. NUMERIC PRECISION:
   - Heights in METRES (not centimetres).
   - Coverage ratios (CES, COS) as DECIMALS (e.g., 0.4 for 40%, 0.6 for 60%).
   - Green space as a PERCENTAGE NUMBER (e.g., 30 for 30%).
   - Distances/setbacks in METRES.

4. FORMULA HANDLING: If a setback is expressed as a formula (e.g., "H/2", "L = H/2 avec un minimum de 3 mètres", "la moitié de la hauteur"), extract the FORMULA STRING as-is. Do NOT attempt to compute it. Include the formula in the corresponding setback field AND note it in the "notes" field.

5. QUALITATIVE EXTRACTION: For materials, colors, roof types — extract the EXACT French terms used in the document. Do not translate or paraphrase. Separate items into allowed vs. forbidden as the regulation specifies.

${isABFZone ? `6. ABF / HERITAGE ZONE: This parcel is in a PROTECTED HERITAGE ZONE (périmètre de protection des Monuments Historiques / site patrimonial remarquable). You MUST:
   - Set "architectRequired" to true if the ABF (Architecte des Bâtiments de France) must review the project.
   - Extract ANY specific heritage-related constraints into "abfSpecificConstraints" (e.g., specific material requirements, color harmony with historic buildings, prohibition of modern materials).
   - Extract heritage notes into "heritageNotes".
   - Pay EXTREME attention to Article 11 (aspect extérieur) constraints that are typically more restrictive in heritage zones.` : `6. This parcel is NOT in a heritage zone. Set "architectRequired" to true ONLY if the regulation explicitly requires ABF approval for this specific zone.`}

7. CONFIDENCE: Assess your extraction confidence:
   - "high": You found the zone and extracted most values with certainty.
   - "medium": You found the zone but some values were ambiguous or the document structure was unusual.
   - "low": You could not clearly identify the zone or the document was poorly structured.

8. OUTPUT: Respond with a SINGLE valid JSON object matching the required schema. No markdown, no comments, no text outside the JSON.${multiDocNote}${briefNote}`;
}

function buildExtractionUserPrompt(pluZone: string, isABFZone: boolean, parcelAddress: string, hasMultipleDocs = false, projectBrief = ""): string {
  const multiDocInstr = hasMultipleDocs
    ? `\n6. TWO DOCUMENTS ARE ATTACHED: The first PDF is the PLU regulation; the second is a subdivision (lotissement) regulation. Analyze both. Lotissement rules override PLU where they conflict.`
    : "";
  const briefInstr = projectBrief.trim()
    ? `\n7. PROJECT BRIEF PROVIDED: The applicant's project involves the following. Pay close attention to rules about dimensions, materials, and uses that apply to this specific project:\n${projectBrief.trim()}`
    : "";
  return `Analyze the attached PLU regulation PDF document.

Context:
- Parcel address: ${parcelAddress}
- PLU Zone to extract: ${pluZone}
- Heritage protection (ABF): ${isABFZone ? "OUI — parcelle en zone protégée" : "NON"}
- Documents provided: ${hasMultipleDocs ? "2 (PLU + Lotissement)" : "1 (PLU)"}

Instructions:
1. Locate the section(s) of the document that apply to zone "${pluZone}".
2. Extract ALL numeric and qualitative regulatory values for this zone.
3. For each field, if the value is not explicitly stated in the document for this zone, use null.
4. For setback formulas like "H/2", keep the formula as a string.
5. Return the structured JSON as specified.${multiDocInstr}${briefInstr}

CRITICAL REMINDER: Do NOT invent values. Only extract what is WRITTEN in the document.`;
}

function buildQualitativeSystemPrompt(pluZone: string, isABFZone: boolean, hasMultipleDocs = false, projectBrief = ""): string {
  const multiDocNote = hasMultipleDocs
    ? "\n\nMULTIPLE DOCUMENTS: You are given TWO PDF documents. The first is the main PLU regulation, the second is a subdivision (lotissement) regulation. Analyze BOTH documents. When the lotissement has rules that override or supplement the PLU, note this clearly in the relevant item's reglementation field."
    : "";
  const briefNote = projectBrief.trim()
    ? `\n\nPROJECT BRIEF: The applicant has provided the following description of their project. Use this to assess compliance (conformité) of the planned works against each regulation point. Where you have enough information from the brief, set conformité to "Conforme", "Non conforme", or "A VÉRIFIER". Focus on dimensions, materials, and building types mentioned in the brief:\n\n--- PROJECT BRIEF ---\n${projectBrief.trim()}\n--- END PROJECT BRIEF ---`
    : "";
  return `You are a strict French urban planning regulation parser (urbaniste confirmé).
You ONLY extract factual information from provided PLU documents.
You NEVER invent, hallucinate, or assume values not explicitly stated in the source text.
When a value is not found, you use "Non réglementé" in the reglementation field and "Non concerné" in the conformite field.

ZONE FOCUS: Only extract rules for zone "${pluZone}". Ignore all other zones.
${isABFZone ? "ABF ZONE: This project is in a heritage protection zone. Pay special attention to Articles 6, 7, 10, 11 and any ABF-specific requirements." : ""}${multiDocNote}${briefNote}

Output a SINGLE valid JSON object matching the required structure. No text outside JSON.`;
}

function buildQualitativeUserPrompt(pluZone: string, isABFZone: boolean, parcelAddress: string, hasMultipleDocs = false, projectBrief = ""): string {
  const briefContext = projectBrief.trim()
    ? `\n\n**Applicant's Project Brief:**\n${projectBrief.trim()}\n\nUse the above project brief to assess conformité where you have enough data (e.g., if the brief mentions a 9m ridge height and the PLU caps it at 10m, mark that as "Conforme").`
    : "";
  return `Analyze the attached PLU regulation document${hasMultipleDocs ? "s" : ""} for a construction project and produce a structured compliance analysis in JSON format.

**Project Context:**
- Address: ${parcelAddress}
- PLU Zone: ${pluZone}
- Heritage Zone (ABF): ${isABFZone ? "OUI" : "NON"}
- Documents provided: ${hasMultipleDocs ? "2 (PLU + Lotissement)" : "1 (PLU)"}

**Your Task:**
1. Thoroughly review the attached regulation PDF.
2. For the 'situationProjet' object, determine if the project is in a subdivision ("lotissement"), an ABF zone, or a PPR zone.
3. For each regulatory point listed below, find the relevant rule in the document for zone "${pluZone}".
4. For each point, write what the regulation says in 'reglementation', then set conformite to "A VERIFIER" (since we don't have the project details yet).
5. If a rule for a specific point is not mentioned in the PLU document, write "Non réglementé" in 'reglementation' and "Non concerné" in 'conformite'.
6. The term 'hauteur à l'égout de toiture' may be referred to as 'hauteur en façade' or 'hauteur à l'égout'. Link these concepts intelligently.
7. If you spot other important regulations not listed below, add them in "autresReglementations".

**Required Sections & Points:**

Section: USAGE DES SOLS (key: usageDesSols)
- "Destinations et sous-destinations interdites"
- "Interdictions ou limitations d'usages spécifiques"
- "Règles de Mixité sociale"
- "Règles de Mixité fonctionnelle"

Section: CONDITIONS D'OCCUPATION DU SOL (key: conditionsOccupation)
- "Surface de plancher maximale (COS si applicable)"
- "Emprise au sol maximale (CES)"
- "Coefficient de Biotope par surface (CBS)"
- "Surface minimale d'espace vert en pleine terre"

Section: IMPLANTATION ET VOLUMETRIE (key: implantationVolumetrie)
- "Implantation par rapport aux voies et emprises publiques"
- "Implantation par rapport aux limites séparatives"
- "Implantation des constructions les unes par rapport aux autres"
- "Hauteurs maximales à l'égout / en façade"
- "Hauteurs maximales au faîtage"
- "Définition de la hauteur de référence (TN, NGF, etc.)"
- "Volumétrie, gabarit et forme de la construction"

Section: ASPECT EXTÉRIEUR (key: aspectExterieur)
- "Toitures (pentes, matériaux, couleurs, éléments techniques)"
- "Façades (matériaux, couleurs, modénatures)"
- "Menuiseries (matériaux, couleurs, proportions)"
- "Clôtures sur rue (hauteur, type, matériaux)"
- "Clôtures sur limites séparatives (hauteur, type, matériaux)"
- "Portails et portillons"
- "Annexes (abris de jardin, garages, piscines, etc.)"

Section: STATIONNEMENT (key: stationnement)
- "Nombre de places pour véhicules motorisés"
- "Caractéristiques des aires de stationnement"
- "Nombre de places pour vélos"

Section: ESPACES LIBRES (key: espacesLibres)
- "Traitement des espaces non bâtis"
- "Obligations de plantations et essences végétales"
- "Gestion des eaux pluviales à la parcelle"

Section: RESEAUX ET DESSERTE (key: reseauxVrd)
- "Conditions de desserte par les voies (accès)"
- "Alimentation en eau potable"
- "Assainissement des eaux usées (EU)"
- "Gestion des eaux pluviales (EP)"
- "Desserte Électricité et Télécommunications"

**Conclusion:**
- 'conclusion.resume': General summary of what the regulation allows and constrains.
- 'conclusion.typeDossier': Suggest the permit type ("Déclaration Préalable" or "Permis de Construire").

**Required JSON structure:**
{
  "situationProjet": { "lotissement": false, "abf": false, "ppr": false, "details": "" },
  "usageDesSols": { "sectionTitle": "USAGE DES SOLS ET DESTINATION DES CONSTRUCTIONS", "items": [{"item": "...", "reglementation": "...", "conformite": "..."}] },
  "conditionsOccupation": { "sectionTitle": "CONDITIONS D'OCCUPATION DU SOL", "items": [...] },
  "implantationVolumetrie": { "sectionTitle": "IMPLANTATION ET VOLUMETRIE", "items": [...] },
  "aspectExterieur": { "sectionTitle": "ASPECT EXTÉRIEUR ET QUALITÉ ARCHITECTURALE", "items": [...] },
  "stationnement": { "sectionTitle": "STATIONNEMENT", "items": [...] },
  "espacesLibres": { "sectionTitle": "ESPACES LIBRES ET PLANTATIONS", "items": [...] },
  "reseauxVrd": { "sectionTitle": "RESEAUX ET DESSERTE (VRD)", "items": [...] },
  "autresReglementations": { "sectionTitle": "AUTRES RÉGLEMENTATIONS", "items": [] },
  "conclusion": { "resume": "...", "typeDossier": "..." }
}${briefContext}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSING & SANITIZATION UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sanitize raw parsed PluRules — ensure every field has the correct type.
 * Gemini with responseSchema should guarantee this, but we belt-and-suspenders it.
 */
function sanitizePluRules(raw: Partial<PluRules>): PluRules {
  const fallback = createFallbackPluRules();

  const parseNumOrNull = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === "number" && !isNaN(v)) return v;
    if (typeof v === "string") {
      const n = parseFloat(v);
      if (!isNaN(n)) return n;
    }
    return null;
  };

  const parseSetbackValue = (v: unknown): number | string | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === "number" && !isNaN(v)) return v;
    if (typeof v === "string") {
      // Try to parse as plain number first
      const n = parseFloat(v);
      if (!isNaN(n) && v.trim() === String(n)) return n;
      // It's a formula string like "H/2 avec minimum 3m" — keep as is
      if (v.trim().length > 0) return v.trim();
    }
    return null;
  };

  const ensureStringArray = (v: unknown): string[] => {
    if (!Array.isArray(v)) return [];
    return v.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  };

  return {
    maxCoverageRatio: parseNumOrNull(raw.maxCoverageRatio),
    maxHeight: parseNumOrNull(raw.maxHeight),
    maxRidgeHeight: parseNumOrNull(raw.maxRidgeHeight),
    setbacks: {
      front: parseSetbackValue(raw.setbacks?.front),
      side: parseSetbackValue(raw.setbacks?.side),
      rear: parseSetbackValue(raw.setbacks?.rear),
    },
    minPlotArea: parseNumOrNull(raw.minPlotArea),
    maxFloorAreaRatio: parseNumOrNull(raw.maxFloorAreaRatio),
    greenSpaceMinPercent: parseNumOrNull(raw.greenSpaceMinPercent),
    maxFenceHeight: parseNumOrNull(raw.maxFenceHeight),
    allowedRoofTypes: ensureStringArray(raw.allowedRoofTypes),
    roofSlopeRange: typeof raw.roofSlopeRange === "string" ? raw.roofSlopeRange : null,
    allowedRoofMaterials: ensureStringArray(raw.allowedRoofMaterials),
    forbiddenRoofMaterials: ensureStringArray(raw.forbiddenRoofMaterials),
    allowedFacadeMaterials: ensureStringArray(raw.allowedFacadeMaterials),
    forbiddenFacadeMaterials: ensureStringArray(raw.forbiddenFacadeMaterials),
    allowedFacadeColors: ensureStringArray(raw.allowedFacadeColors),
    forbiddenFacadeColors: ensureStringArray(raw.forbiddenFacadeColors),
    allowedJoineryMaterials: ensureStringArray(raw.allowedJoineryMaterials),
    forbiddenJoineryColors: ensureStringArray(raw.forbiddenJoineryColors),
    parkingRequirements: typeof raw.parkingRequirements === "string" ? raw.parkingRequirements : null,
    annexRules: typeof raw.annexRules === "string" ? raw.annexRules : null,
    architectRequired: raw.architectRequired === true,
    abfSpecificConstraints: typeof raw.abfSpecificConstraints === "string" ? raw.abfSpecificConstraints : null,
    heritageNotes: typeof raw.heritageNotes === "string" ? raw.heritageNotes : null,
    notes: typeof raw.notes === "string" ? raw.notes : "",
    extractionConfidence: (["high", "medium", "low"] as const).includes(raw.extractionConfidence as "high" | "medium" | "low")
      ? (raw.extractionConfidence as "high" | "medium" | "low")
      : "low",
  };
}

// Robust JSON parser for potentially malformed Gemini output.
// Handles: markdown fences, JS comments, trailing commas, single-quoted
// strings, unquoted property names, and string-aware brace matching.
function parseLooseJson<T>(text: string): T | null {
  if (!text) return null;

  // 1. Strip markdown code fences
  let cleaned = text.replace(/```(?:json)?[\s\n]*/gi, "").replace(/```\s*/g, "").trim();

  // 2. Try direct parse first (fast path)
  try {
    return JSON.parse(cleaned) as T;
  } catch { /* continue */ }

  // 3. Aggressive cleanup: strip JS comments, fix common issues
  cleaned = stripJsComments(cleaned);
  // Remove trailing commas before } or ]
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");
  // Convert single-quoted strings to double-quoted
  cleaned = cleaned.replace(/([:,\[\s{]\s*)'([^']*?)'/g, '$1"$2"');

  // 4. Try parse after cleanup
  try {
    return JSON.parse(cleaned) as T;
  } catch { /* continue */ }

  // 5. Extract the first balanced JSON object with string-aware matching
  const jsonBlock = extractBalancedJson(cleaned);
  if (jsonBlock) {
    // One more cleanup pass on the extracted block
    const finalBlock = jsonBlock.replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(finalBlock) as T;
    } catch { /* continue */ }

    // 6. Nuclear option: fix unquoted keys
    const fixedKeys = finalBlock.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    try {
      return JSON.parse(fixedKeys) as T;
    } catch { /* continue */ }
  }

  return null;
}

// Strip line comments (//) and block comments from a string, respecting quoted strings.
function stripJsComments(text: string): string {
  let result = "";
  let i = 0;
  while (i < text.length) {
    // Skip double-quoted strings
    if (text[i] === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') {
        if (text[j] === '\\') j++; // skip escaped char
        j++;
      }
      result += text.slice(i, j + 1);
      i = j + 1;
    }
    // Line comment: //
    else if (text[i] === '/' && text[i + 1] === '/') {
      // Skip to end of line
      const eol = text.indexOf('\n', i);
      i = eol < 0 ? text.length : eol + 1;
    }
    // Block comment: /* */
    else if (text[i] === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 2;
    }
    else {
      result += text[i];
      i++;
    }
  }
  return result;
}

/** Extract the first balanced { ... } block, aware of quoted strings. */
function extractBalancedJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  // If we never balanced, return everything from start to the last }
  const lastBrace = text.lastIndexOf("}");
  if (lastBrace > start) return text.slice(start, lastBrace + 1);

  return null;
}

// Last-resort regex-based extraction from raw Gemini output text
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function regexExtractPluRules(raw: string): Record<string, any> | null {
  if (!raw || raw.length < 20) return null;

  const extractNum = (key: string): number | null => {
    // Match patterns like "maxHeight": 15.0 or "maxHeight": 15
    const m = raw.match(new RegExp(`"${key}"\\s*:\\s*([\\d.]+)`));
    if (m) return parseFloat(m[1]);
    return null;
  };

  const extractStr = (key: string): string | null => {
    const m = raw.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`));
    return m ? m[1] : null;
  };

  const extractStrArray = (key: string): string[] => {
    // Match "key": ["val1", "val2", ...]
    const m = raw.match(new RegExp(`"${key}"\\s*:\\s*\\[([^\\]]*?)\\]`));
    if (!m) return [];
    const items = m[1].match(/"([^"]+)"/g);
    return items ? items.map(s => s.replace(/"/g, "")) : [];
  };

  const maxHeight = extractNum("maxHeight");
  const maxRidgeHeight = extractNum("maxRidgeHeight");
  const maxCoverageRatio = extractNum("maxCoverageRatio");
  const greenSpaceMinPercent = extractNum("greenSpaceMinPercent");
  const maxFenceHeight = extractNum("maxFenceHeight");
  const frontSetback = extractNum("front");
  const sideSetback = extractNum("side");
  const rearSetback = extractNum("rear");
  const roofSlopeRange = extractStr("roofSlopeRange");
  const parkingRequirements = extractStr("parkingRequirements");
  const allowedRoofTypes = extractStrArray("allowedRoofTypes");
  const allowedFacadeMaterials = extractStrArray("allowedFacadeMaterials");
  const forbiddenFacadeMaterials = extractStrArray("forbiddenFacadeMaterials");
  const allowedRoofMaterials = extractStrArray("allowedRoofMaterials");
  const forbiddenRoofMaterials = extractStrArray("forbiddenRoofMaterials");

  // Only return if we got at least one meaningful value
  const hasValues = maxHeight !== null || maxRidgeHeight !== null ||
    maxCoverageRatio !== null || allowedRoofTypes.length > 0 ||
    allowedFacadeMaterials.length > 0;

  if (!hasValues) return null;

  return {
    maxHeight,
    maxRidgeHeight,
    maxCoverageRatio,
    greenSpaceMinPercent,
    maxFenceHeight,
    setbacks: { front: frontSetback, side: sideSetback, rear: rearSetback },
    roofSlopeRange,
    parkingRequirements,
    allowedRoofTypes,
    allowedFacadeMaterials,
    forbiddenFacadeMaterials,
    allowedRoofMaterials,
    forbiddenRoofMaterials,
    extractionConfidence: "low",
  };
}

// ─── Fallback analysis (when Gemini is unavailable) ──────────────────────────

function generateFallbackAnalysis(pluZone: string): DeepPluAnalysis {
  const makeItem = (item: string): { item: string; reglementation: string; conformite: "Non concerné" } => ({
    item,
    reglementation: "Non réglementé",
    conformite: "Non concerné",
  });

  return {
    situationProjet: {
      lotissement: false,
      abf: false,
      ppr: false,
      details: "Non déterminé (analyse IA non disponible).",
    },
    usageDesSols: {
      sectionTitle: "USAGE DES SOLS ET DESTINATION DES CONSTRUCTIONS",
      items: [
        makeItem("Destinations et sous-destinations interdites"),
        makeItem("Interdictions ou limitations d'usages spécifiques"),
      ],
    },
    conditionsOccupation: {
      sectionTitle: "CONDITIONS D'OCCUPATION DU SOL",
      items: [
        makeItem("Emprise au sol maximale (CES)"),
        makeItem("Surface minimale d'espace vert en pleine terre"),
      ],
    },
    implantationVolumetrie: {
      sectionTitle: "IMPLANTATION ET VOLUMETRIE",
      items: [
        makeItem("Hauteurs maximales à l'égout / en façade"),
        makeItem("Hauteurs maximales au faîtage"),
      ],
    },
    aspectExterieur: {
      sectionTitle: "ASPECT EXTÉRIEUR ET QUALITÉ ARCHITECTURALE",
      items: [makeItem("Toitures (pentes, matériaux, couleurs)")],
    },
    stationnement: {
      sectionTitle: "STATIONNEMENT",
      items: [makeItem("Nombre de places pour véhicules motorisés")],
    },
    espacesLibres: {
      sectionTitle: "ESPACES LIBRES ET PLANTATIONS",
      items: [makeItem("Obligations de plantations")],
    },
    reseauxVrd: {
      sectionTitle: "RESEAUX ET DESSERTE (VRD)",
      items: [makeItem("Conditions de desserte par les voies")],
    },
    conclusion: {
      resume: `Analyse automatique non disponible. Zone indiquée : ${pluZone}. Veuillez uploader le document PLU pour une analyse complète.`,
      typeDossier: "À déterminer (Déclaration Préalable ou Permis de Construire selon le projet).",
    },
    zoneClassification: pluZone,
    zoneDescription: "Résultats par défaut — document PLU requis pour une analyse complète.",
  };
}
