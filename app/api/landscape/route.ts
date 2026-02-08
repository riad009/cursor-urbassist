import { NextRequest, NextResponse } from "next/server";
import { getSession, isUnrestrictedAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateImage, isImageGenerationEnabled } from "@/lib/imageGeneration";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/** Extract first complete JSON object from text (balance braces so we don't capture extra) */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  let quote = "";
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === quote) inString = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      quote = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

// Landscape Integration API - Section 7 of specifications
// AI-assisted landscape integration with Gemini
export async function POST(request: NextRequest) {
  const user = await getSession();

  try {
    const formData = await request.formData();
    const photo = formData.get("photo") as File;
    const projectData = formData.get("projectData") as string;
    const action = (formData.get("action") as string) || "analyze";

    // Only analyze can run without auth (so AI works before sign-in)
    const requiresAuth = action !== "analyze";
    if (requiresAuth && !user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!photo) {
      return NextResponse.json(
        { error: "No photo provided" },
        { status: 400 }
      );
    }

    // Validate image type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(photo.type)) {
      return NextResponse.json(
        {
          error:
            "Invalid image type. Please upload JPEG, PNG, or WebP files.",
        },
        { status: 400 }
      );
    }

    // Convert to base64
    const bytes = await photo.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${photo.type};base64,${base64}`;

    if (action === "analyze") {
      // Analyze photo for perspective and integration points (Gemini AI when key is set)
      let analysis: Record<string, unknown> = {
        horizonLine: 0.35,
        vanishingPoints: [
          { x: 0.3, y: 0.35 },
          { x: 0.85, y: 0.35 },
        ],
        groundPlane: { y: 0.65, perspective: "two-point" },
        suggestedScale: 1.0,
        orientation: "landscape",
        lightDirection: { azimuth: 225, elevation: 45 },
        skyRegion: { top: 0, bottom: 0.35 },
        groundRegion: { top: 0.6, bottom: 1.0 },
        vegetationAreas: [] as Array<{ x: number; y: number; w: number; h: number }>,
      };
      let geminiUsed = false;
      let geminiError: string | null = null;

      if (GEMINI_API_KEY) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      {
                        text: `You are a photo analysis assistant. Analyze this construction site photo for landscape integration.

Respond with ONLY a single JSON object, no other text or markdown. Valid JSON example:
{"horizonLine":0.35,"vanishingPoints":[{"x":0.3,"y":0.35},{"x":0.8,"y":0.35}],"groundPlane":{"y":0.65,"perspective":"two-point"},"suggestedScale":1,"lightDirection":{"azimuth":225,"elevation":45},"skyRegion":{"top":0,"bottom":0.35},"groundRegion":{"top":0.6,"bottom":1},"vegetationAreas":[],"bestIntegrationZone":{"x":0.25,"y":0.4,"w":0.5,"h":0.4},"ambiance":"urban"}

Rules: horizonLine 0-1 (fraction from top), ambiance one of: urban, suburban, rural, coastal, mountain. bestIntegrationZone: x,y,w,h each 0-1. Return only the JSON object.`,
                      },
                      {
                        inlineData: {
                          mimeType: photo.type,
                          data: base64,
                        },
                      },
                    ],
                  },
                ],
                generationConfig: {
                  temperature: 0.2,
                  maxOutputTokens: 1024,
                  responseMimeType: "application/json",
                },
              }),
            }
          );

          if (res.ok) {
            const data = await res.json();
            let text =
              data.candidates?.[0]?.content?.parts?.[0]?.text || "";
            text = text.trim();
            // Strip markdown code blocks if present
            const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (codeBlock) text = codeBlock[1].trim();
            const jsonStr = extractJsonObject(text);
            if (jsonStr) {
              const cleaned = jsonStr
                .replace(/,(\s*[}\]])/g, "$1") // trailing commas
                .replace(/\r\n/g, "\n");
              try {
                const aiAnalysis = JSON.parse(cleaned) as Record<string, unknown>;
                analysis = { ...analysis, ...aiAnalysis };
                geminiUsed = true;
              } catch (parseErr) {
                try {
                  const aiAnalysis = JSON.parse(jsonStr) as Record<string, unknown>;
                  analysis = { ...analysis, ...aiAnalysis };
                  geminiUsed = true;
                } catch {
                  geminiError = "AI response could not be parsed.";
                  console.error("Landscape parse error:", parseErr, "Raw:", jsonStr.slice(0, 300));
                }
              }
            } else {
              geminiError = "AI did not return valid analysis.";
            }
          } else {
            const errText = await res.text();
            geminiError = `Gemini API error (${res.status}). ${errText.slice(0, 100)}`;
            console.error("Gemini landscape analyze:", res.status, errText);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          geminiError = `Gemini request failed: ${msg}`;
          console.error("Gemini analysis failed:", e);
        }
      } else {
        geminiError = "GEMINI_API_KEY is not set. Add it in .env and restart the server for AI analysis.";
      }

      return NextResponse.json({
        success: true,
        photo: {
          name: photo.name,
          size: photo.size,
          type: photo.type,
          dataUrl,
          analysis,
        },
        geminiUsed,
        geminiError: geminiError || undefined,
      });
    }

    if (action === "generate-image") {
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const projectId = formData.get("projectId") as string | null;
      if (!projectId) {
        return NextResponse.json({ error: "projectId required for image generation" }, { status: 400 });
      }
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId: user.id },
      });
      if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
      if (!isUnrestrictedAdmin(user) && user.credits < 5) {
        return NextResponse.json({ error: "Insufficient credits (5 required)" }, { status: 402 });
      }
      const imageDataUrl = await generateImage({
        prompt: "Professional architectural photomontage: a single-family house integrated into a French suburban landscape, same lighting and perspective as the site photo, photorealistic, 8k, vegetation and context matching.",
        size: "1792x1024",
        style: "natural",
      });
      if (!imageDataUrl) {
        return NextResponse.json({
          success: false,
          error: "Image generation not available. Set OPENAI_API_KEY and IMAGE_GENERATION_ENABLED=true.",
        }, { status: 503 });
      }
      const base64Only = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
      if (!isUnrestrictedAdmin(user)) {
        await prisma.user.update({
          where: { id: user.id },
          data: { credits: { decrement: 5 } },
        });
        await prisma.creditTransaction.create({
          data: {
            userId: user.id,
            amount: -5,
            type: "LANDSCAPE_INTEGRATION",
            description: "Landscape insertion image generation",
          },
        });
      }
      const existing = await prisma.document.findFirst({
        where: { projectId, type: "LANDSCAPE_INSERTION" },
      });
      if (existing) {
        await prisma.document.update({
          where: { id: existing.id },
          data: { fileData: base64Only, metadata: { generatedAt: new Date().toISOString(), source: "image-api" }, creditsUsed: 5 },
        });
      } else {
        await prisma.document.create({
          data: {
            projectId,
            type: "LANDSCAPE_INSERTION",
            name: `${project.name} - Landscape Insertion`,
            fileData: base64Only,
            metadata: { generatedAt: new Date().toISOString(), source: "image-api" },
            creditsUsed: 5,
          },
        });
      }
      return NextResponse.json({
        success: true,
        imageUrl: imageDataUrl,
        imageGenerationEnabled: true,
      });
    }

    if (action === "generate-integration") {
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      // Generate AI-powered landscape integration report via Gemini
      const projectId = formData.get("projectId") as string | null;
      let projectName = "";
      let projectType = "residential";
      if (projectId) {
        const project = await prisma.project.findFirst({
          where: { id: projectId, userId: user.id },
        });
        if (project) {
          projectName = project.name;
          projectType = (project.projectType as string) || projectType;
        }
      }
      const projectInfo = projectData ? (() => { try { return JSON.parse(projectData); } catch { return {}; } })() : {};
      const pType = projectInfo.projectType || projectType;
      const pName = projectInfo.projectName || projectName;

      if (GEMINI_API_KEY) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      {
                        text: `You are an expert in landscape integration for construction and urban planning. Analyze this site photo in detail and write a comprehensive, professional landscape integration report${pName ? ` for the project "${pName}"` : ""} (${pType}).

Use Markdown: ## for main title, ### for section headings, **bold** for emphasis, - for bullet lists.

Structure the report with these sections (write 2–4 paragraphs or 4–8 bullet points per section where relevant):

1. **Project overview** – What the site shows, main features, and the integration objective (2–3 sentences).

2. **Site analysis and building integration** – Where and how a new building would best integrate: orientation, placement, scale, alignment with existing structures and sightlines. Be specific (e.g. “place along north edge to preserve views”).

3. **Architectural style and materials** – Recommendations for style, materials, and colors to match the surroundings. Mention specific materials (e.g. stone, render, wood) and a concise color palette.

4. **Landscaping and vegetation** – Vegetation types, planting zones, green buffers, and how to soften edges and link the building to the landscape.

5. **Lighting and shadows** – How to align the design with sun direction, avoid overshadowing, and integrate shadows for a realistic insertion.

6. **Constraints and opportunities** – Any visible constraints (access, slopes, existing trees, regulations) and opportunities (views, solar, rainwater, etc.).

7. **Summary and next steps** – Short recap and 3–5 concrete next steps for the project.

Write in clear, professional language. Aim for a full report (roughly 400–700 words), not a short summary. Output only the report in Markdown, no preamble.`,
                      },
                      {
                        inlineData: {
                          mimeType: photo.type,
                          data: base64,
                        },
                      },
                    ],
                  },
                ],
                generationConfig: {
                  temperature: 0.35,
                  maxOutputTokens: 4096,
                },
              }),
            }
          );

          if (res.ok) {
            const data = await res.json();
            const integrationReport =
              data.candidates?.[0]?.content?.parts?.[0]?.text || "";

            // Deduct credits (skip for admin)
            if (!isUnrestrictedAdmin(user) && user.credits >= 5) {
              await prisma.user.update({
                where: { id: user.id },
                data: { credits: { decrement: 5 } },
              });
              await prisma.creditTransaction.create({
                data: {
                  userId: user.id,
                  amount: -5,
                  type: "LANDSCAPE_INTEGRATION",
                  description: "AI landscape integration",
                },
              });
            }

            return NextResponse.json({
              success: true,
              integration: {
                report: integrationReport,
                photoUrl: dataUrl,
              },
            });
          }
        } catch (e) {
          console.log("Gemini integration generation failed:", e);
        }
      }

      // Fallback when Gemini is not configured or fails
      return NextResponse.json({
        success: true,
        integration: {
          report: `Landscape Integration Report

1. Site Analysis
The site photo shows a natural environment. For best integration, consider perspective and lighting of the scene.

2. Architectural Recommendations
- Match roofline profiles to the horizon
- Use materials that harmonize with the surroundings
- Respect scale and proportions visible in the photo

3. Landscaping
- Plant native species along boundaries
- Use vegetation to soften building edges
- Preserve existing trees where possible

4. Integration
- Place the building in the suggested zone (dashed area)
- Use "Realistic image" with a selected project to generate a photomontage.
- Export the result from Export Center → Landscape Insertion.`,
          photoUrl: dataUrl,
        },
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Landscape API error:", error);
    return NextResponse.json(
      { error: "Landscape operation failed" },
      { status: 500 }
    );
  }
}
