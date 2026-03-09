import { NextRequest, NextResponse } from "next/server";
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

// ─── Config ──────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-2.5-flash";
const MAX_PDF_SIZE_BYTES = 30 * 1024 * 1024; // 30 MB hard limit
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
    const pdfFile = formData.get("pdfFile") as File | null;
    const pdfFile2 = formData.get("pdfFile2") as File | null; // Optional lotissement supplement
    const pdfUrl = (formData.get("pdfUrl") as string) || "";   // Auto-fetched GPU URL
    const pluZone = (formData.get("pluZone") as string) || "non spécifiée";
    const isABFZone = (formData.get("isABFZone") as string) === "true";
    const parcelAddress = (formData.get("parcelAddress") as string) || "non précisée";

    // ── 2. Resolve primary PDF (file upload takes priority over URL) ──────
    let primaryPdfBase64: string | null = null;

    if (pdfFile && pdfFile.size > 0) {
      // Validate uploaded file
      if (pdfFile.size > MAX_PDF_SIZE_BYTES) {
        return NextResponse.json(
          { error: `Le fichier PDF dépasse la limite de ${MAX_PDF_SIZE_BYTES / 1024 / 1024} Mo.` },
          { status: 400 }
        );
      }
      if (!pdfFile.type.includes("pdf") && !pdfFile.name.endsWith(".pdf")) {
        return NextResponse.json(
          { error: "Seuls les fichiers PDF sont acceptés." },
          { status: 400 }
        );
      }
      const buf = await pdfFile.arrayBuffer();
      primaryPdfBase64 = Buffer.from(buf).toString("base64");
    } else if (pdfUrl.trim()) {
      // Fetch PDF from auto-detected GPU URL
      console.log(`[analyze-plu] Fetching PDF from URL: ${pdfUrl}`);
      try {
        const res = await fetch(pdfUrl, {
          signal: AbortSignal.timeout(30_000),
          headers: { "User-Agent": "UrbAssist/1.0" },
        });
        if (res.ok) {
          const contentType = res.headers.get("content-type") || "";
          if (contentType.includes("pdf") || pdfUrl.endsWith(".pdf")) {
            const buf = await res.arrayBuffer();
            if (buf.byteLength > MAX_PDF_SIZE_BYTES) {
              console.warn(`[analyze-plu] URL PDF too large: ${buf.byteLength} bytes`);
            } else {
              primaryPdfBase64 = Buffer.from(buf).toString("base64");
              console.log(`[analyze-plu] Fetched ${buf.byteLength} bytes from URL`);
            }
          } else {
            console.warn(`[analyze-plu] URL is not a PDF (content-type: ${contentType})`);
          }
        } else {
          console.warn(`[analyze-plu] URL fetch failed: ${res.status}`);
        }
      } catch (e) {
        console.warn(`[analyze-plu] URL fetch error:`, (e as Error).message);
      }
    }

    if (!primaryPdfBase64) {
      return NextResponse.json(
        { error: "Un fichier PDF du règlement PLU est requis. Uploadez un fichier ou vérifiez l'URL automatique." },
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

    // ── 5. Build prompts ───────────────────────────────────────────────────
    const qualitativeSystemPrompt = buildQualitativeSystemPrompt(pluZone, isABFZone, hasMultipleDocs);
    const qualitativeUserPrompt = buildQualitativeUserPrompt(pluZone, isABFZone, parcelAddress, hasMultipleDocs);
    const extractionSystemPrompt = buildExtractionSystemPrompt(pluZone, isABFZone, hasMultipleDocs);
    const extractionUserPrompt = buildExtractionUserPrompt(pluZone, isABFZone, parcelAddress, hasMultipleDocs);

    // ── 6. Build PDF parts array ──────────────────────────────────────────
    const pdfParts: { inlineData: { data: string; mimeType: string } }[] = [
      { inlineData: { data: primaryPdfBase64, mimeType: "application/pdf" } },
    ];
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

    const [qualResult, extractResult] = await Promise.allSettled([
      callGeminiWithPdfs(genAI, qualitativeSystemPrompt, qualitativeUserPrompt, pdfParts, qualitativeConfig),
      callGeminiWithPdfs(genAI, extractionSystemPrompt, extractionUserPrompt, pdfParts, extractionConfig),
    ]);

    // ── 7. Parse responses ─────────────────────────────────────────────────
    let analysis: DeepPluAnalysis = generateFallbackAnalysis(pluZone);
    if (qualResult.status === "fulfilled" && qualResult.value) {
      try {
        analysis = JSON.parse(qualResult.value) as DeepPluAnalysis;
      } catch {
        analysis = parseLooseJson<DeepPluAnalysis>(qualResult.value) ?? generateFallbackAnalysis(pluZone);
      }
    } else if (qualResult.status === "rejected") {
      console.error("Qualitative Gemini call failed:", qualResult.reason);
    }

    let pluRules: PluRules = createFallbackPluRules();
    if (extractResult.status === "fulfilled" && extractResult.value) {
      try {
        const raw = JSON.parse(extractResult.value);
        pluRules = sanitizePluRules(raw);
      } catch {
        const parsed = parseLooseJson<Partial<PluRules>>(extractResult.value);
        if (parsed) pluRules = sanitizePluRules(parsed);
      }
    } else if (extractResult.status === "rejected") {
      console.error("Extraction Gemini call failed:", extractResult.reason);
    }

    // ── 8. Return combined result ──────────────────────────────────────────
    return NextResponse.json({
      success: true,
      analysis,
      pluRules,
      source: "gemini",
      documentsAnalyzed: hasMultipleDocs ? 2 : 1,
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

    const response = result.response;
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MASTER SYSTEM PROMPTS
// ═══════════════════════════════════════════════════════════════════════════════

function buildExtractionSystemPrompt(pluZone: string, isABFZone: boolean, hasMultipleDocs = false): string {
  const multiDocNote = hasMultipleDocs
    ? `\n\n9. MULTIPLE DOCUMENTS: You are given TWO PDF documents. The FIRST is the main PLU regulation. The SECOND is a subdivision regulation (règlement de lotissement) that may override or supplement the PLU. When both documents address the same rule, the LOTISSEMENT regulation takes precedence. Extract values from BOTH documents, clearly noting in the "notes" field when a lotissement rule overrides the PLU.`
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

8. OUTPUT: Respond with a SINGLE valid JSON object matching the required schema. No markdown, no comments, no text outside the JSON.${multiDocNote}`;
}

function buildExtractionUserPrompt(pluZone: string, isABFZone: boolean, parcelAddress: string, hasMultipleDocs = false): string {
  const multiDocInstr = hasMultipleDocs
    ? `\n6. TWO DOCUMENTS ARE ATTACHED: The first PDF is the PLU regulation; the second is a subdivision (lotissement) regulation. Analyze both. Lotissement rules override PLU where they conflict.`
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
5. Return the structured JSON as specified.${multiDocInstr}

CRITICAL REMINDER: Do NOT invent values. Only extract what is WRITTEN in the document.`;
}

function buildQualitativeSystemPrompt(pluZone: string, isABFZone: boolean, hasMultipleDocs = false): string {
  const multiDocNote = hasMultipleDocs
    ? "\n\nMULTIPLE DOCUMENTS: You are given TWO PDF documents. The first is the main PLU regulation, the second is a subdivision (lotissement) regulation. Analyze BOTH documents. When the lotissement has rules that override or supplement the PLU, note this clearly in the relevant item's reglementation field."
    : "";
  return `You are a strict French urban planning regulation parser (urbaniste confirmé).
You ONLY extract factual information from provided PLU documents.
You NEVER invent, hallucinate, or assume values not explicitly stated in the source text.
When a value is not found, you use "Non réglementé" in the reglementation field and "Non concerné" in the conformite field.

ZONE FOCUS: Only extract rules for zone "${pluZone}". Ignore all other zones.
${isABFZone ? "ABF ZONE: This project is in a heritage protection zone. Pay special attention to Articles 6, 7, 10, 11 and any ABF-specific requirements." : ""}${multiDocNote}

Output a SINGLE valid JSON object matching the required structure. No text outside JSON.`;
}

function buildQualitativeUserPrompt(pluZone: string, isABFZone: boolean, parcelAddress: string, hasMultipleDocs = false): string {
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
}`;
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

/**
 * Attempt to parse a potentially malformed JSON string.
 * Handles markdown code fences and trailing commas.
 */
function parseLooseJson<T>(text: string): T | null {
  if (!text) return null;

  // Strip markdown code fences
  let cleaned = text.replace(/```(?:json)?[\s\n]*/gi, "").replace(/```\s*/g, "").trim();

  // Try direct parse
  try {
    return JSON.parse(cleaned) as T;
  } catch { /* continue */ }

  // Try extracting the first JSON object
  const start = cleaned.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let end = start;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === "{") depth++;
    else if (cleaned[i] === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }

  if (end > start) {
    try {
      const block = cleaned.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(block) as T;
    } catch { /* give up */ }
  }

  return null;
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
