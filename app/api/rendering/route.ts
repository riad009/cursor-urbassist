import { NextRequest, NextResponse } from "next/server";
import { getSession, isUnrestrictedAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/** Style-specific ultra-realistic rendering prompts — optimised for Gemini image generation */
const STYLE_PROMPTS: Record<string, string> = {
  photorealistic:
    "Transform this architectural 3D render into an ultra-photorealistic, award-winning architectural photograph. " +
    "Apply physically-accurate global illumination, raytraced reflections on glass and metal, subsurface scattering on concrete and wood, " +
    "natural HDR sky with soft cumulus clouds, depth-of-field lens blur on background, realistic mature vegetation (trees, hedges, grass), " +
    "ambient occlusion in corners, subtle chromatic aberration and lens flare. Materials: true-to-life PBR textures — " +
    "brushed zinc, smooth render, wooden cladding grain, terracotta roof tiles. Output an 8K-quality photorealistic image.",
  warm_evening:
    "Transform this architectural 3D render into a golden-hour photorealistic visualization. " +
    "Apply warm 3200K directional sunlight from low angle, long dramatic shadows, " +
    "warm interior glow visible through windows (tungsten lighting inside), twilight sky with orange/magenta gradient, " +
    "silhouetted trees, dew on lawn, real PBR material textures. Cinematic color grading with warm tones. 8K quality.",
  aerial:
    "Transform this architectural 3D render into a high-altitude drone-style photorealistic aerial visualization. " +
    "Bird's-eye perspective, realistic neighbourhood context, clean manicured landscape, accurate orthographic shadows, " +
    "atmospheric haze in the distance, detailed roof materials, surrounding roads and vegetation. Tilt-shift lens feel. 8K quality.",
  winter:
    "Transform this architectural 3D render into a photorealistic winter-season visualization. " +
    "Overcast diffuse sky, thin snow layer on roof and ground, bare deciduous trees with frost, evergreen conifers, " +
    "cold 6500K colour temperature, warm interior light through frosty windows, breath-visible cold atmosphere, " +
    "wet pavement reflections, icicles on gutters. 8K quality.",
  night:
    "Transform this architectural 3D render into a dramatic nocturnal photorealistic visualization. " +
    "Deep blue night sky with stars, warm interior lighting casting pools of light on facade, exterior uplighting on walls, " +
    "path lights along walkway, car headlights in driveway, light reflections on wet surfaces, volumetric light fog, " +
    "firefly bokeh points, glowing windows. 8K quality.",
  mediterranean:
    "Transform this architectural 3D render into a Mediterranean-style photorealistic visualization. " +
    "Bright midday Mediterranean sun, deep blue sky, terracotta and white-washed surfaces, " +
    "bougainvillea and olive trees, lavender borders, terracotta pots, stone pathways, " +
    "Mediterranean cypress trees, warm ochre tones. 8K quality.",
  scandinavian:
    "Transform this architectural 3D render into a Scandinavian-style photorealistic visualization. " +
    "Soft overcast Nordic light, minimal clean palette, black-stained timber cladding, " +
    "birch trees with silver bark, green moss on rocks, simple gravel pathways, " +
    "muted earth tones, hygge interior warmth visible through large windows. 8K quality.",
};

/** POST /api/rendering — Ultra-Realistic Rendering Transformation
 *  Phase 1: Gemini 2.5 Flash analyses the 3D view (materials, lighting, etc.)
 *  Phase 2: Gemini 2.0 Flash Exp generates the ultra-realistic image
 *  Phase 3: Fallback to Imagen 3 if Phase 2 fails
 */
export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await request.formData();
    const renderImage = formData.get("image") as File;
    const style = (formData.get("style") as string) || "photorealistic";
    const projectId = formData.get("projectId") as string | null;
    const extraContext = (formData.get("context") as string) || "";
    const resolution = (formData.get("resolution") as string) || "high";

    if (!renderImage) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/tiff"];
    if (!allowedTypes.includes(renderImage.type)) {
      return NextResponse.json({ error: "Invalid image type. Upload JPEG, PNG, WebP, or TIFF." }, { status: 400 });
    }

    // Credit cost: 10 standard, 15 high-resolution
    const creditCost = resolution === "high" ? 15 : 10;

    if (!isUnrestrictedAdmin(user) && user.credits < creditCost) {
      return NextResponse.json(
        { error: `Insufficient credits (${creditCost} required, you have ${user.credits})`, required: creditCost, available: user.credits },
        { status: 402 },
      );
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured. Set it in .env for AI rendering." }, { status: 503 });
    }

    const bytes = await renderImage.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");

    const stylePrompt = STYLE_PROMPTS[style] || STYLE_PROMPTS.photorealistic;
    const fullPrompt = [
      stylePrompt,
      extraContext ? `Additional architectural context: ${extraContext}` : "",
      "CRITICAL: Maintain the EXACT same perspective, proportions, camera angle, and architectural layout of the original render. Only enhance the realism of materials, lighting, vegetation and atmosphere.",
    ].filter(Boolean).join("\n");

    // ─── Phase 1 — Gemini Analysis ────────────────────
    const analysisPrompt = `You are an expert architectural visualization specialist. Analyse this 3D render and provide a structured assessment.\n\n${stylePrompt}\n\nRespond with ONLY a JSON object:\n{"description":"detailed description of what the ultra-realistic version should look like","materials":["list of detected materials"],"lighting":"current lighting analysis and recommendations","atmosphere":"atmospheric conditions to apply","vegetation":["vegetation types to add or enhance"],"enhancedPrompt":"an optimised, detailed prompt for generating the ultra-realistic version"}`;

    const analysisRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: analysisPrompt },
            { inlineData: { mimeType: renderImage.type, data: base64 } },
          ]}],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2048, responseMimeType: "application/json" },
        }),
      },
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let analysis: Record<string, any> = {};
    let enhancedPrompt = fullPrompt;

    if (analysisRes.ok) {
      const data = await analysisRes.json();
      let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      text = text.trim();
      const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlock) text = codeBlock[1].trim();
      try {
        analysis = JSON.parse(text);
        enhancedPrompt = (analysis.enhancedPrompt as string) || enhancedPrompt;
      } catch {
        console.error("Rendering analysis parse error:", text.slice(0, 300));
      }
    }

    // ─── Phase 2 — Gemini Image Generation ─────────────
    let generatedImageBase64: string | null = null;
    let generatedMimeType = "image/png";

    const imageGenPrompt = [
      "You are an ultra-photorealistic architectural renderer. Transform this input render into a finished, publication-quality architectural photograph.",
      enhancedPrompt,
      "Preserve the EXACT geometry, perspective, proportions, and camera angle. Dramatically enhance: realistic PBR materials, global illumination, vegetation, sky, shadows, reflections.",
      "Do NOT add text, watermarks, or labels. Output ONLY the transformed image.",
    ].join("\n\n");

    try {
      const imageGenRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [
              { text: imageGenPrompt },
              { inlineData: { mimeType: renderImage.type, data: base64 } },
            ]}],
            generationConfig: {
              responseModalities: ["IMAGE", "TEXT"],
              temperature: 0.4,
            },
          }),
        },
      );

      if (imageGenRes.ok) {
        const genData = await imageGenRes.json();
        const parts = genData.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            generatedImageBase64 = part.inlineData.data;
            generatedMimeType = part.inlineData.mimeType || "image/png";
            break;
          }
        }
      } else {
        const errText = await imageGenRes.text();
        console.error("Gemini image generation error:", imageGenRes.status, errText.slice(0, 300));
      }
    } catch (err) {
      console.error("Gemini image generation exception:", err);
    }

    // ─── Phase 3 — Imagen 3 Fallback ──────────────────
    if (!generatedImageBase64) {
      try {
        const imagenRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:generateImages?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              instances: [{ prompt: enhancedPrompt.slice(0, 4000) }],
              parameters: { sampleCount: 1, aspectRatio: "16:9" },
            }),
          },
        );
        if (imagenRes.ok) {
          const imagenData = await imagenRes.json();
          const b64 = imagenData.predictions?.[0]?.bytesBase64Encoded;
          if (b64) {
            generatedImageBase64 = b64;
            generatedMimeType = "image/png";
          }
        }
      } catch (err) {
        console.error("Imagen 3 fallback failed:", err);
      }
    }

    // ─── Phase 4 — Deduct credits & persist ────────────
    if (!isUnrestrictedAdmin(user)) {
      await prisma.user.update({ where: { id: user.id }, data: { credits: { decrement: creditCost } } });
      await prisma.creditTransaction.create({
        data: {
          userId: user.id,
          amount: -creditCost,
          type: "RENDERING_TRANSFORM",
          description: `Ultra-realistic rendering (${style}${resolution === "high" ? " HD" : ""})`,
        },
      });
    }

    let documentId: string | null = null;
    if (projectId) {
      const doc = await prisma.document.create({
        data: {
          projectId,
          type: "RENDERING_TRANSFORM",
          name: `Render ${style} – ${new Date().toISOString().split("T")[0]}`,
          fileData: generatedImageBase64 || base64,
          metadata: {
            style,
            resolution,
            analysedAt: new Date().toISOString(),
            analysis,
            enhancedPrompt,
            hasGeneratedImage: !!generatedImageBase64,
            originalMimeType: renderImage.type,
          },
          creditsUsed: creditCost,
        },
      });
      documentId = doc.id;
    }

    return NextResponse.json({
      success: true,
      analysis,
      enhancedPrompt,
      style,
      resolution,
      creditCost,
      documentId,
      originalImage: `data:${renderImage.type};base64,${base64}`,
      generatedImage: generatedImageBase64
        ? `data:${generatedMimeType};base64,${generatedImageBase64}`
        : null,
    });
  } catch (error) {
    console.error("Rendering API error:", error);
    return NextResponse.json({ error: "Rendering transformation failed" }, { status: 500 });
  }
}

/** GET /api/rendering?projectId=XXX — Fetch rendering history for a project */
export async function GET(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId query param required" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: isUnrestrictedAdmin(user) ? { id: projectId } : { id: projectId, userId: user.id },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const renderings = await prisma.document.findMany({
    where: { projectId, type: "RENDERING_TRANSFORM" },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, metadata: true, creditsUsed: true, createdAt: true },
  });

  return NextResponse.json({ renderings });
}
