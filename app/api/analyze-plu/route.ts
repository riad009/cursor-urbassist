import { NextRequest, NextResponse } from "next/server"

// Deep PLU analysis using Gemini — structured compliance analysis per project
const GEMINI_API_KEY = process.env.GEMINI_API_KEY

// ─── Structured machine-readable rule schema (Phase 4) ──────────────────────
export interface PluRules {
  /** CES: max coverage ratio as decimal (e.g. 0.4 for 40%) */
  maxCoverageRatio: number | null
  /** Max height at eave / facade in metres */
  maxHeight: number | null
  /** Max height at ridge in metres */
  maxRidgeHeight: number | null
  /** Required setbacks in metres */
  setbacks: {
    front: number | null
    side: number | null
    rear: number | null
  }
  /** Minimum green/permeable surface e.g. "20%" */
  greenSpaceRequirements: string | null
  /** Parking requirement description e.g. "1 place per 60m²" */
  parkingRequirements: string | null
  /** Roof slope range e.g. "30 à 45 degrés" */
  roofSlopes: string | null
  /** Explicitly allowed roof materials */
  allowedRoofMaterials: string[]
  /** Explicitly forbidden facade materials */
  forbiddenFacadeMaterials: string[]
  /** Max fence height in metres */
  maxFenceHeight: number | null
  /** ABF / architect-des-Batiments sign-off required */
  architectRequired: boolean
  /** Any important qualitative note */
  notes: string
}

interface AnalysisRequest {
  documentContent: string
  parcelAddress?: string
  zoneType?: string
  description?: string
}

/** Expected item in each section */
export interface AnalysisItem {
  item: string
  reglementation: string
  conformite: "OUI" | "NON" | "A VERIFIER" | "Non concerné"
}

/** Section with items */
export interface AnalysisSection {
  sectionTitle: string
  items: AnalysisItem[]
}

/** In-depth analysis output (user-provided schema) */
export interface DeepPluAnalysis {
  situationProjet?: {
    lotissement?: boolean
    abf?: boolean
    ppr?: boolean
    details?: string
  }
  usageDesSols?: AnalysisSection
  conditionsOccupation?: AnalysisSection
  implantationVolumetrie?: AnalysisSection
  aspectExterieur?: AnalysisSection
  stationnement?: AnalysisSection
  espacesLibres?: AnalysisSection
  reseauxVrd?: AnalysisSection
  autresReglementations?: AnalysisSection
  conclusion?: { resume: string; typeDossier: string }
  /** Legacy article-based format (optional, for backward compatibility) */
  zoneClassification?: string
  zoneDescription?: string
  summary?: Record<string, unknown>
  [key: string]: unknown
}

export async function POST(request: NextRequest) {
  try {
    const body: AnalysisRequest = await request.json()

    if (!body.documentContent) {
      return NextResponse.json(
        { error: "Document content is required" },
        { status: 400 }
      )
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json({
        success: true,
        analysis: generateFallbackAnalysis(body),
        pluRules: generateFallbackPluRules(),
        source: "fallback",
      })
    }

    const qualitativePrompt = buildInDepthAnalysisPrompt(body)
    const extractionPrompt = buildRuleExtractionPrompt(body)

    // Run both Gemini calls in parallel for performance
    const [qualResponse, extractResponse] = await Promise.allSettled([
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: qualitativePrompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 16384,
              responseMimeType: "application/json",
            },
          }),
        }
      ),
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: extractionPrompt }] }],
            generationConfig: {
              temperature: 0.0,
              maxOutputTokens: 2048,
              responseMimeType: "application/json",
            },
          }),
        }
      ),
    ])

    // Parse qualitative analysis
    let analysis: DeepPluAnalysis & Record<string, unknown> = generateFallbackAnalysis(body)
    if (qualResponse.status === "fulfilled" && qualResponse.value.ok) {
      const data = await qualResponse.value.json()
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || ""
      if (rawText) analysis = parseGeminiResponse(rawText)
    }

    // Parse structured rule extraction
    let pluRules: PluRules = generateFallbackPluRules()
    if (extractResponse.status === "fulfilled" && extractResponse.value.ok) {
      const data = await extractResponse.value.json()
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || ""
      if (rawText) pluRules = parsePluRules(rawText)
    }

    return NextResponse.json({
      success: true,
      analysis,
      pluRules,
      source: "gemini",
    })
  } catch (error) {
    console.error("PLU Analysis error:", error)
    return NextResponse.json(
      { error: "Failed to analyze PLU document" },
      { status: 500 }
    )
  }
}

function buildInDepthAnalysisPrompt(body: AnalysisRequest): string {
  const address = body.parcelAddress || "non précisée"
  const zone = body.zoneType || "non spécifiée"
  const description = body.description || "non fournie"
  const docContent = body.documentContent.slice(0, 80000)

  return `Analyze the provided urban planning regulation document (PLU) for a specific construction project and produce a structured analysis in JSON format.

**Project Details:**
- Address: ${address}
- PLU Zone: ${zone}
- Project Description: ${description}

**Your Task:**
1. Thoroughly review the attached regulation (document content below).
2. For the 'situationProjet' object, fill in the details based on the project information and what you can find in the document. Specifically, determine if the project is in a subdivision ("lotissement"), an ABF zone (Architecte des Bâtiments de France), or a PPR zone (Plan de Prévention des Risques).
3. For each regulatory point listed in the "Analysis Structure and Required Points" section below, find the relevant rule in the document for the project's PLU zone.
4. Compare the project description against each rule.
5. For each point, determine the compliance status: "OUI" (compliant), "NON" (non-compliant), or "A VERIFIER" (more information needed).
6. If a rule for a specific point is not mentioned in the PLU document, you MUST still include the item in your response. For such cases, write "Non réglementé" in the 'reglementation' field and "Non concerné" in the 'conformite' field.
7. The term 'hauteur à l'égout de toiture' might be referred to as 'hauteur en façade' or 'hauteur à l'égout'. Intelligently link these concepts.
8. Structure your entire output as a single JSON object matching the provided schema. Do not include any text or markdown formatting outside of the JSON object.
9. **Crucially**: In addition to the required points listed below, if you identify any other significant regulations in the document that are relevant to the project (e.g., rules about renewable energy, specific local heritage requirements, etc.), you MUST add them as new items within the most appropriate section of your analysis, or in "autresReglementations" if they do not fit elsewhere.

**Analysis Structure and Required Points:**
You must create sections as titled below and include all the specified items within them.

**Section: USAGE DES SOLS ET DESTINATION DES CONSTRUCTIONS** (output key: usageDesSols)
- Item: "Destinations et sous-destinations interdites"
- Item: "Interdictions ou limitations d'usages spécifiques"
- Item: "Règles de Mixité sociale"
- Item: "Règles de Mixité fonctionnelle"

**Section: CONDITIONS D'OCCUPATION DU SOL** (output key: conditionsOccupation)
- Item: "Surface de plancher maximale (COS si applicable)"
- Item: "Emprise au sol maximale (CES)"
- Item: "Coefficient de Biotope par surface (CBS)"
- Item: "Surface minimale d'espace vert en pleine terre"

**Section: IMPLANTATION ET VOLUMETRIE** (output key: implantationVolumetrie)
- Item: "Implantation par rapport aux voies et emprises publiques"
- Item: "Implantation par rapport aux limites séparatives"
- Item: "Implantation des constructions les unes par rapport aux autres"
- Item: "Hauteurs maximales à l'égout / en façade"
- Item: "Hauteurs maximales au faîtage"
- Item: "Définition de la hauteur de référence (TN, NGF, etc.)"
- Item: "Volumétrie, gabarit et forme de la construction"

**Section: ASPECT EXTÉRIEUR ET QUALITÉ ARCHITECTURALE** (output key: aspectExterieur)
- Item: "Toitures (pentes, matériaux, couleurs, éléments techniques)"
- Item: "Façades (matériaux, couleurs, modénatures)"
- Item: "Menuiseries (matériaux, couleurs, proportions)"
- Item: "Clôtures sur rue (hauteur, type, matériaux)"
- Item: "Clôtures sur limites séparatives (hauteur, type, matériaux)"
- Item: "Portails et portillons"
- Item: "Annexes (abris de jardin, garages, piscines, etc.)"

**Section: STATIONNEMENT** (output key: stationnement)
- Item: "Nombre de places pour véhicules motorisés"
- Item: "Caractéristiques des aires de stationnement (dimensions, revêtement)"
- Item: "Nombre de places pour vélos"

**Section: ESPACES LIBRES ET PLANTATIONS** (output key: espacesLibres)
- Item: "Traitement des espaces non bâtis"
- Item: "Obligations de plantations et essences végétales"
- Item: "Gestion des eaux pluviales à la parcelle"

**Section: RESEAUX ET DESSERTE (VRD)** (output key: reseauxVrd)
- Item: "Conditions de desserte par les voies (accès)"
- Item: "Alimentation en eau potable"
- Item: "Assainissement des eaux usées (EU)"
- Item: "Gestion des eaux pluviales (EP)"
- Item: "Desserte Électricité et Télécommunications"

**Conclusion:**
- In the 'conclusion.resume' field, provide a general summary of the project's feasibility.
- In the 'conclusion.typeDossier' field, suggest the type of permit required (e.g., "Déclaration Préalable", "Permis de Construire").

**Required JSON schema (output exactly this structure):**
{
  "situationProjet": { "lotissement": false, "abf": false, "ppr": false, "details": "" },
  "usageDesSols": { "sectionTitle": "USAGE DES SOLS ET DESTINATION DES CONSTRUCTIONS", "items": [{"item": "...", "reglementation": "...", "conformite": "OUI"|"NON"|"A VERIFIER"|"Non concerné"}] },
  "conditionsOccupation": { "sectionTitle": "CONDITIONS D'OCCUPATION DU SOL", "items": [...] },
  "implantationVolumetrie": { "sectionTitle": "IMPLANTATION ET VOLUMETRIE", "items": [...] },
  "aspectExterieur": { "sectionTitle": "ASPECT EXTÉRIEUR ET QUALITÉ ARCHITECTURALE", "items": [...] },
  "stationnement": { "sectionTitle": "STATIONNEMENT", "items": [...] },
  "espacesLibres": { "sectionTitle": "ESPACES LIBRES ET PLANTATIONS", "items": [...] },
  "reseauxVrd": { "sectionTitle": "RESEAUX ET DESSERTE (VRD)", "items": [...] },
  "autresReglementations": { "sectionTitle": "AUTRES RÉGLEMENTATIONS", "items": [] },
  "conclusion": { "resume": "...", "typeDossier": "..." }
}

**Document content (PLU regulation):**
${docContent}`
}

function parseGeminiResponse(text: string): DeepPluAnalysis & Record<string, unknown> {
  try {
    return JSON.parse(text) as DeepPluAnalysis & Record<string, unknown>
  } catch {
    // empty
  }

  const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "").trim()
  try {
    return JSON.parse(cleaned) as DeepPluAnalysis & Record<string, unknown>
  } catch {
    // empty
  }

  const start = cleaned.indexOf("{")
  if (start >= 0) {
    let depth = 0
    let end = start
    for (let i = start; i < cleaned.length; i++) {
      if (cleaned[i] === "{") depth++
      else if (cleaned[i] === "}") {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    if (end > start) {
      try {
        const block = cleaned.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1")
        return JSON.parse(block) as DeepPluAnalysis & Record<string, unknown>
      } catch {
        // empty
      }
    }
  }

  return {
    conclusion: { resume: text.slice(0, 500), typeDossier: "À déterminer" },
    parseError: true,
  }
}

function generateFallbackAnalysis(body: AnalysisRequest): DeepPluAnalysis {
  const zone = body.zoneType || "Zone non spécifiée"
  return {
    situationProjet: { lotissement: false, abf: false, ppr: false, details: "Non déterminé (analyse non disponible)." },
    usageDesSols: {
      sectionTitle: "USAGE DES SOLS ET DESTINATION DES CONSTRUCTIONS",
      items: [
        { item: "Destinations et sous-destinations interdites", reglementation: "Non réglementé", conformite: "Non concerné" },
        { item: "Interdictions ou limitations d'usages spécifiques", reglementation: "Non réglementé", conformite: "Non concerné" },
      ],
    },
    conditionsOccupation: {
      sectionTitle: "CONDITIONS D'OCCUPATION DU SOL",
      items: [
        { item: "Emprise au sol maximale (CES)", reglementation: "Non réglementé", conformite: "Non concerné" },
        { item: "Surface minimale d'espace vert en pleine terre", reglementation: "Non réglementé", conformite: "Non concerné" },
      ],
    },
    implantationVolumetrie: {
      sectionTitle: "IMPLANTATION ET VOLUMETRIE",
      items: [
        { item: "Hauteurs maximales à l'égout / en façade", reglementation: "Non réglementé", conformite: "Non concerné" },
        { item: "Hauteurs maximales au faîtage", reglementation: "Non réglementé", conformite: "Non concerné" },
      ],
    },
    aspectExterieur: {
      sectionTitle: "ASPECT EXTÉRIEUR ET QUALITÉ ARCHITECTURALE",
      items: [{ item: "Toitures (pentes, matériaux, couleurs)", reglementation: "Non réglementé", conformite: "Non concerné" }],
    },
    stationnement: {
      sectionTitle: "STATIONNEMENT",
      items: [{ item: "Nombre de places pour véhicules motorisés", reglementation: "Non réglementé", conformite: "Non concerné" }],
    },
    espacesLibres: {
      sectionTitle: "ESPACES LIBRES ET PLANTATIONS",
      items: [{ item: "Obligations de plantations", reglementation: "Non réglementé", conformite: "Non concerné" }],
    },
    reseauxVrd: {
      sectionTitle: "RESEAUX ET DESSERTE (VRD)",
      items: [{ item: "Conditions de desserte par les voies", reglementation: "Non réglementé", conformite: "Non concerné" }],
    },
    conclusion: {
      resume: `Analyse automatique non disponible (clé API manquante). Zone indiquée : ${zone}. Uploadez le document PLU pour une analyse complète.`,
      typeDossier: "À déterminer (Déclaration Préalable ou Permis de Construire selon le projet).",
    },
    zoneClassification: zone,
    zoneDescription: "Résultats par défaut — document PLU requis pour une analyse complète.",
  }
}

// ─── Phase 4: Structured Rule Extraction ─────────────────────────────────────

/**
 * Builds a strictly numerical extraction prompt.
 * Temperature 0.0 + responseMimeType application/json → deterministic output.
 */
function buildRuleExtractionPrompt(body: AnalysisRequest): string {
  const address = body.parcelAddress || "non précisée"
  const zone = body.zoneType || "non spécifiée"
  const docContent = body.documentContent.slice(0, 80000)

  return `You are an expert French urban planning rule parser. Extract ONLY precise, machine-readable numerical and categorical values from the PLU regulation document below.

Project context:
- Address: ${address}
- PLU zone: ${zone}

Output a SINGLE JSON object with EXACTLY this structure. Use null for any value not found in the document. All distances in metres, ratios as decimals (e.g. 0.4 for 40%).

{
  "maxCoverageRatio": <number|null>,
  "maxHeight": <number|null>,
  "maxRidgeHeight": <number|null>,
  "setbacks": {
    "front": <number|null>,
    "side": <number|null>,
    "rear": <number|null>
  },
  "greenSpaceRequirements": <"X%" string|null>,
  "parkingRequirements": <"N place par Xm²" string|null>,
  "roofSlopes": <"X à Y degrés" string|null>,
  "allowedRoofMaterials": [<string>, ...],
  "forbiddenFacadeMaterials": [<string>, ...],
  "maxFenceHeight": <number|null>,
  "architectRequired": <boolean>,
  "notes": "<any critical qualitative constraint in one sentence>"
}

Rules:
- maxCoverageRatio: CES (coefficient d'emprise au sol) as decimal. E.g. if PLU says "40%" → 0.4
- maxHeight: height at eave/façade/égout in metres. NOT ridge height.
- maxRidgeHeight: height at faîtage/ridge in metres.
- setbacks.front: recul voie publique in metres (minimum)
- setbacks.side: recul limites séparatives latérales in metres
- setbacks.rear: recul limite fond de parcelle in metres
- greenSpaceRequirements: minimum permeable/green surface as percentage string e.g. "20%"
- parkingRequirements: parking rule as string e.g. "1 place par logement" or "1 place par 60m² SHON"
- architectRequired: true ONLY if the zone explicitly requires ABF (Architecte des Bâtiments de France) approval
- Do NOT include commentary, markdown, or any text outside the JSON object.

PLU document:
${docContent}`
}

/**
 * Parse the structured extraction response — strict JSON only.
 */
function parsePluRules(text: string): PluRules {
  const fallback = generateFallbackPluRules()
  try {
    const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "").trim()
    const start = cleaned.indexOf("{")
    const end = cleaned.lastIndexOf("}")
    if (start < 0 || end < 0) return fallback
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<PluRules>

    return {
      maxCoverageRatio: typeof parsed.maxCoverageRatio === "number" ? parsed.maxCoverageRatio : null,
      maxHeight: typeof parsed.maxHeight === "number" ? parsed.maxHeight : null,
      maxRidgeHeight: typeof parsed.maxRidgeHeight === "number" ? parsed.maxRidgeHeight : null,
      setbacks: {
        front: parsed.setbacks?.front ?? null,
        side: parsed.setbacks?.side ?? null,
        rear: parsed.setbacks?.rear ?? null,
      },
      greenSpaceRequirements: parsed.greenSpaceRequirements ?? null,
      parkingRequirements: parsed.parkingRequirements ?? null,
      roofSlopes: parsed.roofSlopes ?? null,
      allowedRoofMaterials: Array.isArray(parsed.allowedRoofMaterials) ? parsed.allowedRoofMaterials : [],
      forbiddenFacadeMaterials: Array.isArray(parsed.forbiddenFacadeMaterials) ? parsed.forbiddenFacadeMaterials : [],
      maxFenceHeight: typeof parsed.maxFenceHeight === "number" ? parsed.maxFenceHeight : null,
      architectRequired: parsed.architectRequired === true,
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
    }
  } catch {
    return fallback
  }
}

function generateFallbackPluRules(): PluRules {
  return {
    maxCoverageRatio: null,
    maxHeight: null,
    maxRidgeHeight: null,
    setbacks: { front: null, side: null, rear: null },
    greenSpaceRequirements: null,
    parkingRequirements: null,
    roofSlopes: null,
    allowedRoofMaterials: [],
    forbiddenFacadeMaterials: [],
    maxFenceHeight: null,
    architectRequired: false,
    notes: "",
  }
}
