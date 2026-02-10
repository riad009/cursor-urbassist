import { NextRequest, NextResponse } from "next/server"

// Deep PLU analysis using Gemini — structured compliance analysis per project
const GEMINI_API_KEY = process.env.GEMINI_API_KEY

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
        source: "fallback",
      })
    }

    const prompt = buildInDepthAnalysisPrompt(body)

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 16384,
            responseMimeType: "application/json",
          },
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.text()
      console.error("Gemini API error:", response.status, errorData)
      return NextResponse.json({
        success: true,
        analysis: generateFallbackAnalysis(body),
        source: "fallback",
      })
    }

    const data = await response.json()
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || ""
    const analysis = parseGeminiResponse(rawText)

    return NextResponse.json({
      success: true,
      analysis,
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
