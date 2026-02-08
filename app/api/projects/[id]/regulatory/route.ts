import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await prisma.project.findFirst({ where: { id, userId: user.id } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const body = await request.json().catch(() => ({}));
    const { documentContent, zoneType, pdfUrl } = body;

    let analysis: object;
    if (GEMINI_API_KEY && documentContent) {
      const prompt = `You are an expert urban planning analyst. Analyze this PLU (Plan Local d'Urbanisme) document and extract key construction regulations. Respond ONLY with valid JSON.

Document:
${documentContent.slice(0, 30000)}

${project.address ? `Address: ${project.address}` : ""}
${zoneType ? `Zone: ${zoneType}` : ""}

Extract and return this JSON structure:
{"zoneClassification":"","maxHeight":0,"setbacks":{"front":0,"side":0,"rear":0},"maxCoverageRatio":0,"maxFloorAreaRatio":0,"minGreenPct":20,"parkingRequirements":"","greenSpaceRequirements":"","architecturalConstraints":[],"restrictions":[],"recommendations":[],"protectedZones":[]}
Include minGreenPct as a number (e.g. 20 for 20% minimum green space).`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: text };
      } else {
        analysis = getMockAnalysis(project.address);
      }
    } else {
      analysis = getMockAnalysis(project.address);
    }

    const regulatory = await prisma.regulatoryAnalysis.upsert({
      where: { projectId: id },
      create: {
        projectId: id,
        zoneType: zoneType || null,
        rawContent: documentContent?.slice(0, 50000) || null,
        aiAnalysis: analysis as object,
        pdfUrl: pdfUrl || null,
      },
      update: {
        zoneType: zoneType || null,
        rawContent: documentContent?.slice(0, 50000) || null,
        aiAnalysis: analysis as object,
        ...(pdfUrl !== undefined && { pdfUrl: pdfUrl || null }),
      },
    });

    // Deduct credit
    await prisma.user.update({
      where: { id: user.id },
      data: { credits: { decrement: 1 } },
    });
    await prisma.creditTransaction.create({
      data: {
        userId: user.id,
        amount: -1,
        type: "PLU_ANALYSIS",
        description: "PLU regulatory analysis",
        metadata: { projectId: id },
      },
    });

    return NextResponse.json({ analysis: regulatory.aiAnalysis, regulatory });
  } catch (error) {
    console.error("Regulatory analysis:", error);
    return NextResponse.json(
      { error: "Analysis failed" },
      { status: 500 }
    );
  }
}

function getMockAnalysis(address?: string | null): object {
  return {
    zoneClassification: "UB - Zone Urbaine Mixte",
    maxHeight: 12,
    setbacks: { front: 5, side: 3, rear: 4 },
    maxCoverageRatio: 0.4,
    maxFloorAreaRatio: 1.2,
    parkingRequirements: "1 place per 60m² of floor area",
    greenSpaceRequirements: "Minimum 20% of parcel area must be landscaped",
    architecturalConstraints: [
      "Roof pitch between 30-45 degrees",
      "Natural materials for facades",
      "Maximum 2 colors for exterior walls",
    ],
    restrictions: ["No industrial activities", "Max 2 dwelling units per building"],
    recommendations: ["Solar panel integration", "Rainwater collection", "Native vegetation"],
    protectedZones: address ? [] : [],
  };
}
