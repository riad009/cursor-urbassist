import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateImage, isImageGenerationEnabled } from "@/lib/imageGeneration";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Developer module: Generate ultra-realistic visuals from sketches/SketchUp screenshots
// Section 8 of specifications
export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.role !== "DEVELOPER" && user.credits < 5) {
    return NextResponse.json(
      { error: "Insufficient credits. Need 5 credits per visual." },
      { status: 402 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("image") as File | null;
    const prompt = formData.get("prompt") as string | null;
    const style = formData.get("style") as string | null;
    const purpose = formData.get("purpose") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "Image file required" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type || "image/png";
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const styleDesc =
      style === "modern"
        ? "modern minimalist"
        : style === "classic"
          ? "classical European"
          : style === "mediterranean"
            ? "Mediterranean villa"
            : "contemporary";

    const purposeDesc =
      purpose === "sales"
        ? "real estate sales brochure"
        : purpose === "institutional"
          ? "institutional presentation"
          : purpose === "competition"
            ? "architectural competition"
            : "marketing presentation";

    const enhancedPrompt =
      prompt ||
      `Analyze this architectural sketch or 3D model screenshot. Describe in detail how to transform it into an ultra-realistic photorealistic rendering suitable for a ${purposeDesc}. Style: ${styleDesc}. Include suggestions for:
1. Realistic lighting and time of day
2. Material textures and finishes
3. Landscaping and vegetation
4. Sky and atmosphere
5. People and vehicles for scale
6. Environmental context`;

    let analysisText = "";
    let enhancedImageUrl = dataUrl;

    if (isImageGenerationEnabled()) {
      const generated = await generateImage({
        prompt: `Ultra-realistic architectural rendering, ${styleDesc} style, photorealistic, 8k, professional real estate quality, same composition as the input image`,
        size: "1792x1024",
        style: "natural",
      });
      if (generated) enhancedImageUrl = generated;
    }

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
                    { text: enhancedPrompt },
                    {
                      inlineData: {
                        mimeType,
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
          const parts = data.candidates?.[0]?.content?.parts || [];

          // Check for generated image
          const imagePart = parts.find(
            (p: { inlineData?: { data: string; mimeType: string } }) =>
              p.inlineData
          );
          if (imagePart?.inlineData?.data) {
            enhancedImageUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
          }

          // Get text analysis
          const textPart = parts.find(
            (p: { text?: string }) => p.text
          );
          if (textPart?.text) {
            analysisText = textPart.text;
          }
        }
      } catch (e) {
        console.log("Gemini visual generation failed:", e);
      }
    }

    // Deduct credits
    const cost = 5;
    if (user.credits >= cost) {
      await prisma.user.update({
        where: { id: user.id },
        data: { credits: { decrement: cost } },
      });
      await prisma.creditTransaction.create({
        data: {
          userId: user.id,
          amount: -cost,
          type: "VISUAL_GENERATION",
          description: "Developer visual generation",
        },
      });
    }

    return NextResponse.json({
      success: true,
      originalUrl: dataUrl,
      imageUrl: enhancedImageUrl,
      analysis: analysisText || generateDefaultAnalysis(styleDesc, purposeDesc),
      style: styleDesc,
      purpose: purposeDesc,
      creditsUsed: cost,
      creditsRemaining: Math.max(0, user.credits - cost),
    });
  } catch (error) {
    console.error("Developer visual:", error);
    return NextResponse.json(
      { error: "Visual generation failed" },
      { status: 500 }
    );
  }
}

function generateDefaultAnalysis(style: string, purpose: string): string {
  return `Visual Enhancement Analysis

Style: ${style}
Purpose: ${purpose}

Rendering Recommendations:

1. Lighting
- Golden hour lighting (late afternoon) for warm, inviting atmosphere
- Soft shadows with ambient occlusion
- Sky with light clouds for depth

2. Materials
- High-resolution PBR textures for all surfaces
- Reflective glass with environment mapping
- Weathered stone/wood for authenticity

3. Landscaping
- Mature trees framing the composition
- Flowering shrubs near entrance
- Manicured lawn with defined edges

4. Atmosphere
- Light atmospheric haze for depth
- Subtle lens effects for realism
- Color grading to enhance mood

5. Context
- Street furniture and infrastructure
- Pedestrians for human scale
- Vehicles appropriate to the setting

Note: Configure GEMINI_API_KEY for AI-powered image analysis and enhancement suggestions.`;
}
