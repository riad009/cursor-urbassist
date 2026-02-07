import { NextRequest, NextResponse } from "next/server"

// Gemini API integration for PLU document analysis
const GEMINI_API_KEY = process.env.GEMINI_API_KEY

interface AnalysisRequest {
  documentContent: string
  parcelAddress?: string
  zoneType?: string
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

    // If no API key, return mock analysis for demo
    if (!GEMINI_API_KEY) {
      return NextResponse.json({
        success: true,
        analysis: generateMockAnalysis(body),
      })
    }

    // Call Gemini API
    const prompt = buildAnalysisPrompt(body)
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2048,
          },
        }),
      }
    )

    if (!response.ok) {
      throw new Error("Failed to analyze document with Gemini")
    }

    const data = await response.json()
    const analysisText = data.candidates?.[0]?.content?.parts?.[0]?.text || ""

    return NextResponse.json({
      success: true,
      analysis: parseGeminiResponse(analysisText),
    })
  } catch (error) {
    console.error("PLU Analysis error:", error)
    return NextResponse.json(
      { error: "Failed to analyze PLU document" },
      { status: 500 }
    )
  }
}

function buildAnalysisPrompt(body: AnalysisRequest): string {
  return `You are an expert urban planning analyst. Analyze the following PLU (Plan Local d'Urbanisme) document and extract key construction regulations.

Document Content:
${body.documentContent}

${body.parcelAddress ? `Parcel Address: ${body.parcelAddress}` : ""}
${body.zoneType ? `Zone Type: ${body.zoneType}` : ""}

Please extract and summarize the following information in JSON format:
1. Zone classification (UA, UB, UC, etc.)
2. Maximum building height (in meters)
3. Setback requirements (front, side, rear in meters)
4. Maximum ground coverage ratio (CES - Coefficient d'Emprise au Sol)
5. Maximum floor area ratio (COS - Coefficient d'Occupation des Sols)
6. Minimum parking requirements
7. Green space requirements
8. Architectural constraints
9. Any special restrictions or requirements
10. Key recommendations for the project

Respond in the following JSON structure:
{
  "zoneClassification": "",
  "maxHeight": 0,
  "setbacks": { "front": 0, "side": 0, "rear": 0 },
  "maxCoverageRatio": 0,
  "maxFloorAreaRatio": 0,
  "parkingRequirements": "",
  "greenSpaceRequirements": "",
  "architecturalConstraints": [],
  "restrictions": [],
  "recommendations": []
}`
}

function parseGeminiResponse(text: string): object {
  try {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch {
    // If parsing fails, return text as summary
  }
  
  return { summary: text }
}

function generateMockAnalysis(body: AnalysisRequest): object {
  return {
    zoneClassification: "UB - Zone Urbaine Mixte",
    maxHeight: 12,
    setbacks: {
      front: 5,
      side: 3,
      rear: 4,
    },
    maxCoverageRatio: 0.4,
    maxFloorAreaRatio: 1.2,
    parkingRequirements: "1 place per 60m² of floor area",
    greenSpaceRequirements: "Minimum 20% of parcel area must be landscaped",
    architecturalConstraints: [
      "Roof pitch between 30-45 degrees",
      "Natural materials for facades (stone, wood, render)",
      "Maximum 2 colors for exterior walls",
      "Traditional window proportions required",
    ],
    restrictions: [
      "No industrial activities permitted",
      "Maximum 2 dwelling units per building",
      "Construction prohibited within 10m of watercourse",
    ],
    recommendations: [
      "Consider solar panel integration with roof design",
      "Rainwater collection system recommended",
      "Native vegetation for landscaping preferred",
      "EV charging infrastructure recommended for parking",
    ],
    confidence: 0.85,
    analyzedAt: new Date().toISOString(),
  }
}
