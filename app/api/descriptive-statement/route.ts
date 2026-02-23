import { NextRequest, NextResponse } from "next/server";
import { getSession, isUnrestrictedAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Descriptive Statement (Notice Descriptive) generation
// Supports draft → review → confirm workflow
export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { projectId, answers, action } = await request.json();

    if (!projectId || !answers) {
      return NextResponse.json(
        { error: "projectId and answers required" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
      include: { regulatoryAnalysis: true },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // ── CONFIRM action: finalize an existing draft ──
    if (action === "confirm") {
      const existing = await prisma.descriptiveStatement.findUnique({
        where: { projectId },
      });
      if (!existing || existing.status !== "draft") {
        return NextResponse.json(
          { error: "No draft found to confirm" },
          { status: 400 }
        );
      }

      // Deduct credits on confirm (not on draft)
      if (!isUnrestrictedAdmin(user)) {
        if (user.credits < 2) {
          return NextResponse.json(
            { error: "Insufficient credits. 2 credits required." },
            { status: 402 }
          );
        }
        await prisma.user.update({
          where: { id: user.id },
          data: { credits: { decrement: 2 } },
        });
        await prisma.creditTransaction.create({
          data: {
            userId: user.id,
            amount: -2,
            type: "DESCRIPTIVE_STATEMENT",
            description: "Descriptive statement confirmed",
          },
        });
      }

      const confirmed = await prisma.descriptiveStatement.update({
        where: { projectId },
        data: { status: "confirmed" },
      });

      return NextResponse.json({
        success: true,
        statement: {
          id: confirmed.id,
          text: existing.generatedText,
          sections: existing.sections,
          status: "confirmed",
        },
        creditsUsed: 2,
      });
    }

    // ── REGENERATE action: create new draft (free if first, costs credits after) ──
    // Check if there's already a confirmed statement (re-generation costs credits)
    const existingStatement = await prisma.descriptiveStatement.findUnique({
      where: { projectId },
    });
    const isRegeneration = existingStatement?.status === "confirmed";

    // Generate descriptive statement text
    let generatedText = "";
    let sections: Record<string, string> = {};

    if (GEMINI_API_KEY) {
      const prompt = buildDescriptivePrompt(answers, project);

      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
            }),
          }
        );

        if (res.ok) {
          const data = await res.json();
          generatedText =
            data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        }
      } catch (e) {
        console.log("Gemini generation failed:", e);
      }
    }

    if (!generatedText) {
      const result = generateFromTemplate(answers, project);
      generatedText = result.text;
      sections = result.sections;
    } else {
      sections = parseIntoSections(generatedText);
    }

    // Save as DRAFT (credits not yet deducted)
    const statement = await prisma.descriptiveStatement.upsert({
      where: { projectId },
      create: {
        projectId,
        answers,
        generatedText,
        sections,
        status: "draft",
      },
      update: {
        answers,
        generatedText,
        sections,
        status: "draft",
      },
    });

    return NextResponse.json({
      success: true,
      statement: {
        id: statement.id,
        text: generatedText,
        sections,
        status: "draft",
      },
      isRegeneration,
      creditCost: 2,
      message: "Draft generated. Review and confirm to finalize (2 credits).",
    });
  } catch (error) {
    console.error("Descriptive statement error:", error);
    return NextResponse.json(
      { error: "Statement generation failed" },
      { status: 500 }
    );
  }
}

// GET existing statement
export async function GET(request: NextRequest) {
  const user = await getSession();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json(
      { error: "projectId required" },
      { status: 400 }
    );
  }

  const statement = await prisma.descriptiveStatement.findUnique({
    where: { projectId },
  });

  return NextResponse.json({ statement });
}

function buildDescriptivePrompt(
  answers: Record<string, string>,
  project: { name: string; address?: string | null; municipality?: string | null }
): string {
  return `You are an expert urban planning consultant in France. Generate a professional "Notice Descriptive" (descriptive statement) for a construction permit application based on the following information.

Project: ${project.name}
Address: ${project.address || "Not specified"}
Municipality: ${project.municipality || "Not specified"}

Project Details:
- Project type: ${answers.projectType || "Construction"}
- Current state of terrain: ${answers.currentState || "Not specified"}
- Proposed construction: ${answers.proposedConstruction || "Not specified"}
- Materials for facades: ${answers.facadeMaterials || "Not specified"}
- Roofing type: ${answers.roofType || "Not specified"}  
- Roofing materials: ${answers.roofMaterials || "Not specified"}
- Exterior finishes: ${answers.exteriorFinishes || "Not specified"}
- Fencing: ${answers.fencing || "Not specified"}
- Landscaping: ${answers.landscaping || "Not specified"}
- Access and parking: ${answers.accessParking || "Not specified"}
- Utility connections: ${answers.utilities || "Not specified"}
- Stormwater management: ${answers.stormwater || "Not specified"}
- Energy performance: ${answers.energyPerformance || "Not specified"}
- Additional details: ${answers.additionalDetails || "None"}

Generate a formal descriptive statement in French that:
1. Describes the current state of the terrain and surroundings
2. Presents the proposed project
3. Details exterior materials and finishes
4. Describes landscape integration
5. Explains utility connections
6. Addresses energy and environmental considerations

The text must be suitable for submission to French urban planning authorities.`;
}

function generateFromTemplate(
  answers: Record<string, string>,
  project: { name: string; address?: string | null; municipality?: string | null }
): { text: string; sections: Record<string, string> } {
  const sections: Record<string, string> = {};

  sections["1. État actuel du terrain"] =
    answers.currentState ||
    `Le terrain est situé à ${project.address || "[adresse]"}, commune de ${project.municipality || "[commune]"}. Il présente une topographie [à préciser] et est actuellement [à préciser son état actuel: nu, construit, etc.].`;

  sections["2. Présentation du projet"] =
    answers.proposedConstruction ||
    `Le projet consiste en ${answers.projectType || "une construction neuve"} d'une surface de plancher de [à préciser] m². Le bâtiment comprendra [à préciser le programme].`;

  sections["3. Implantation et volumétrie"] = `Le bâtiment sera implanté en respectant les règles du PLU applicable, avec un recul de [à préciser] mètres par rapport à la voie publique et de [à préciser] mètres par rapport aux limites séparatives. La hauteur maximale sera de [à préciser] mètres.`;

  sections["4. Matériaux et aspect extérieur"] =
    `Façades : ${answers.facadeMaterials || "[à préciser]"}. Toiture : ${answers.roofType || "[à préciser]"} en ${answers.roofMaterials || "[à préciser]"}. Menuiseries : ${answers.exteriorFinishes || "[à préciser]"}.`;

  sections["5. Clôtures et aménagements extérieurs"] =
    `Clôtures : ${answers.fencing || "[à préciser]"}. Aménagements paysagers : ${answers.landscaping || "[à préciser]"}.`;

  sections["6. Accès et stationnement"] =
    answers.accessParking ||
    "L'accès au terrain se fera depuis [à préciser]. Le stationnement sera assuré par [à préciser le nombre] places de stationnement conformes aux exigences du PLU.";

  sections["7. Raccordement aux réseaux"] =
    answers.utilities ||
    "Le projet sera raccordé aux réseaux publics d'eau potable, d'assainissement, d'électricité et de télécommunications. Les eaux pluviales seront gérées par [à préciser].";

  sections["8. Performance énergétique et environnementale"] =
    answers.energyPerformance ||
    "Le projet respectera la réglementation RE2020 en vigueur. Les dispositions suivantes seront mises en œuvre : [isolation, chauffage, ventilation, etc.].";

  const text = Object.entries(sections)
    .map(([title, content]) => `${title}\n\n${content}`)
    .join("\n\n---\n\n");

  return { text, sections };
}

function parseIntoSections(text: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const sectionRegex = /(?:^|\n)((?:\d+\.?\s*)?[A-Z][^\n]{5,})\n([\s\S]*?)(?=\n(?:\d+\.?\s*)?[A-Z][^\n]{5,}\n|$)/g;

  let match;
  while ((match = sectionRegex.exec(text)) !== null) {
    sections[match[1].trim()] = match[2].trim();
  }

  if (Object.keys(sections).length === 0) {
    sections["Notice Descriptive"] = text;
  }

  return sections;
}
