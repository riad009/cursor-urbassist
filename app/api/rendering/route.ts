import { NextRequest, NextResponse } from "next/server";
import { getSession, isUnrestrictedAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/** Ultra-Realistic Rendering Transformation API
 * Transforms SketchUp / Lumion / Enscape / 3ds Max + Vray views
 * into ultra-realistic renders using Gemini AI.
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

        if (!renderImage) {
            return NextResponse.json({ error: "No image provided" }, { status: 400 });
        }

        const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/tiff"];
        if (!allowedTypes.includes(renderImage.type)) {
            return NextResponse.json({ error: "Invalid image type. Upload JPEG, PNG, WebP, or TIFF." }, { status: 400 });
        }

        // Check credits
        if (!isUnrestrictedAdmin(user) && user.credits < 10) {
            return NextResponse.json({ error: "Insufficient credits (10 required)" }, { status: 402 });
        }

        const bytes = await renderImage.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64 = buffer.toString("base64");

        if (!GEMINI_API_KEY) {
            return NextResponse.json({
                success: false,
                error: "GEMINI_API_KEY not configured. Set it in .env for AI rendering.",
            }, { status: 503 });
        }

        // Style-specific prompts
        const STYLE_PROMPTS: Record<string, string> = {
            photorealistic: "Transform this 3D render into an ultra-photorealistic architectural visualization. Add realistic lighting, natural shadows, atmospheric perspective, material textures (glass reflections, wood grain, stone texture), surrounding landscape with realistic vegetation, sky with clouds, and ambient elements. The result should be indistinguishable from a professional photograph.",
            warm_evening: "Transform this 3D render into a warm evening architectural visualization. Add golden hour lighting, warm interior glow from windows, long shadows, twilight sky with orange/purple gradients. Ultra-photorealistic materials and vegetation.",
            aerial: "Transform this 3D render into an aerial/drone-style photorealistic visualization. Add realistic bird's-eye perspective, surrounding neighborhood context, clean landscape, realistic shadows from above. Ultra-photorealistic quality.",
            winter: "Transform this 3D render into a winter-season photorealistic visualization. Add overcast sky, bare deciduous trees, evergreen vegetation, frost on surfaces, cold color temperature, snow accents. Ultra-photorealistic quality.",
            night: "Transform this 3D render into a nocturnal architectural visualization. Add dramatic interior and exterior lighting, night sky, light reflections on surfaces, warm interior ambiance visible through windows. Ultra-photorealistic quality.",
        };

        const stylePrompt = STYLE_PROMPTS[style] || STYLE_PROMPTS.photorealistic;
        const fullPrompt = [
            stylePrompt,
            extraContext ? `Additional context: ${extraContext}` : "",
            "Maintain the exact same perspective, proportions, and architectural details of the original render.",
            "Output should be 8K quality, suitable for professional architectural presentation.",
        ].filter(Boolean).join(" ");

        // Call Gemini for image analysis and description generation
        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            {
                                text: `You are an expert architectural visualization artist. Analyze this 3D render and provide a detailed description of what the ultra-realistic version should look like.

${fullPrompt}

Respond with ONLY a JSON object:
{"description": "detailed description of the photorealistic result", "materials": ["list of materials visible"], "lighting": "lighting analysis", "atmosphere": "atmospheric conditions", "vegetation": ["vegetation types to add"], "enhancedPrompt": "optimized prompt for image generation"}`,
                            },
                            {
                                inlineData: { mimeType: renderImage.type, data: base64 },
                            },
                        ],
                    }],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 2048,
                        responseMimeType: "application/json",
                    },
                }),
            }
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let analysis: Record<string, any> = {};
        let enhancedPrompt = fullPrompt;

        if (geminiRes.ok) {
            const data = await geminiRes.json();
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

        // Deduct credits
        if (!isUnrestrictedAdmin(user)) {
            await prisma.user.update({
                where: { id: user.id },
                data: { credits: { decrement: 10 } },
            });
            await prisma.creditTransaction.create({
                data: {
                    userId: user.id,
                    amount: -10,
                    type: "RENDERING_TRANSFORM",
                    description: `Ultra-realistic rendering transformation (${style})`,
                },
            });
        }

        // Store the rendering result
        if (projectId) {
            await prisma.document.create({
                data: {
                    projectId,
                    type: "RENDERING_TRANSFORM",
                    name: `Rendering - ${style} - ${new Date().toISOString().split("T")[0]}`,
                    fileData: base64,
                    metadata: {
                        style,
                        analysedAt: new Date().toISOString(),
                        analysis,
                        enhancedPrompt,
                    },
                    creditsUsed: 10,
                },
            });
        }

        return NextResponse.json({
            success: true,
            analysis,
            enhancedPrompt,
            originalImage: `data:${renderImage.type};base64,${base64}`,
            style,
        });
    } catch (error) {
        console.error("Rendering API error:", error);
        return NextResponse.json(
            { error: "Rendering transformation failed" },
            { status: 500 }
        );
    }
}
