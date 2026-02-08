import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateImage, isImageGenerationEnabled } from "@/lib/imageGeneration";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Landscape Integration API - Section 7 of specifications
// AI-assisted landscape integration with Gemini
export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await request.formData();
    const photo = formData.get("photo") as File;
    const projectData = formData.get("projectData") as string;
    const action = (formData.get("action") as string) || "analyze";

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
      // Analyze photo for perspective and integration points
      let analysis = {
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

      if (GEMINI_API_KEY) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      {
                        text: `Analyze this construction site photo for landscape integration. Return JSON with:
{
  "horizonLine": number (0-1, fraction from top),
  "vanishingPoints": [{"x": number, "y": number}],
  "groundPlane": {"y": number, "perspective": "one-point"|"two-point"},
  "suggestedScale": number,
  "lightDirection": {"azimuth": number, "elevation": number},
  "skyRegion": {"top": 0, "bottom": number},
  "groundRegion": {"top": number, "bottom": 1},
  "vegetationAreas": [{"x": number, "y": number, "w": number, "h": number}],
  "bestIntegrationZone": {"x": number, "y": number, "w": number, "h": number},
  "ambiance": "urban"|"suburban"|"rural"|"coastal"|"mountain"
}
Only return the JSON.`,
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
                },
              }),
            }
          );

          if (res.ok) {
            const data = await res.json();
            const text =
              data.candidates?.[0]?.content?.parts?.[0]?.text || "";
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                const aiAnalysis = JSON.parse(jsonMatch[0]);
                analysis = { ...analysis, ...aiAnalysis };
              } catch {
                // keep default analysis
              }
            }
          }
        } catch (e) {
          console.log("Gemini analysis failed:", e);
        }
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
      });
    }

    if (action === "generate-image") {
      const projectId = formData.get("projectId") as string | null;
      if (!projectId) {
        return NextResponse.json({ error: "projectId required for image generation" }, { status: 400 });
      }
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId: user.id },
      });
      if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
      if (user.credits < 5) {
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
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      {
                        text: `You are an expert in landscape integration for construction projects. Analyze this site photo and write a detailed landscape integration report${pName ? ` for the project "${pName}"` : ""} (${pType}).

Consider:
1. Where and how a building would best integrate (orientation, placement, scale)
2. Architectural style and materials matching the surroundings
3. Landscaping and vegetation recommendations
4. Color palette and facade suggestions
5. Lighting and shadow integration
6. Any constraints or opportunities visible in the site

Provide a clear, professional report in 4–6 short sections.`,
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
                  temperature: 0.4,
                  maxOutputTokens: 2048,
                },
              }),
            }
          );

          if (res.ok) {
            const data = await res.json();
            const integrationReport =
              data.candidates?.[0]?.content?.parts?.[0]?.text || "";

            // Deduct credits
            if (user.credits >= 5) {
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
