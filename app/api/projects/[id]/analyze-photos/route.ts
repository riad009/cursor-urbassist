import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * POST /api/projects/[id]/analyze-photos
 * Analyze environment photos using Gemini Vision.
 * Accepts photos directly via FormData (near_photo, far_photo)
 * OR falls back to reading from previously uploaded files on disk.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getSession();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: projectId } = await params;

    // Verify project ownership
    const project = await prisma.project.findFirst({
        where: { id: projectId, userId: user.id },
        select: {
            id: true,
            name: true,
            address: true,
            municipality: true,
            projectDescription: true,
        },
    });

    if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!GEMINI_API_KEY) {
        return NextResponse.json({ error: "AI analysis not configured" }, { status: 503 });
    }

    try {
        const imageParts: Array<{ inlineData: { data: string; mimeType: string } }> = [];

        // Try to read photos from FormData first (direct upload)
        const contentType = request.headers.get("content-type") || "";

        if (contentType.includes("multipart/form-data")) {
            const formData = await request.formData();
            const nearFile = formData.get("near_photo") as File | null;
            const farFile = formData.get("far_photo") as File | null;

            for (const file of [nearFile, farFile]) {
                if (!file || file.size === 0) continue;
                const buffer = Buffer.from(await file.arrayBuffer());
                const base64 = buffer.toString("base64");

                let mimeType = file.type || "image/jpeg";
                if (!mimeType.startsWith("image/")) mimeType = "image/jpeg";

                imageParts.push({
                    inlineData: { data: base64, mimeType },
                });
            }
        }

        // If no photos from FormData, try reading from disk (previously uploaded files)
        if (imageParts.length === 0) {
            const desc = (project.projectDescription as Record<string, unknown>) || {};
            const uploads = (desc.uploads as Array<{
                type: string;
                filename: string;
                path: string;
                uploadedAt: string;
            }>) || [];

            const nearUpload = uploads.filter(u => u.type === "near_photo").pop();
            const farUpload = uploads.filter(u => u.type === "far_photo").pop();

            if (!nearUpload && !farUpload) {
                return NextResponse.json(
                    { error: "No photos found. Please upload at least one photo first." },
                    { status: 400 }
                );
            }

            const path = await import("path");
            const fs = await import("fs/promises");

            for (const upload of [nearUpload, farUpload]) {
                if (!upload) continue;
                const filePath = path.join(process.cwd(), upload.path);
                try {
                    const fileBuffer = await fs.readFile(filePath);
                    const base64 = fileBuffer.toString("base64");
                    const ext = upload.filename.toLowerCase();
                    let mimeType = "image/jpeg";
                    if (ext.endsWith(".png")) mimeType = "image/png";
                    else if (ext.endsWith(".webp")) mimeType = "image/webp";
                    else if (ext.endsWith(".gif")) mimeType = "image/gif";

                    imageParts.push({
                        inlineData: { data: base64, mimeType },
                    });
                } catch {
                    console.warn(`Could not read photo: ${filePath}`);
                }
            }
        }

        if (imageParts.length === 0) {
            return NextResponse.json(
                { error: "Could not process photos. Please re-upload and try again." },
                { status: 400 }
            );
        }

        // Build Gemini Vision prompt
        const prompt = `You are an expert French urban planning consultant analyzing photos of a construction site for a building permit (permis de construire / déclaration préalable).

Project: ${project.name || "Construction project"}
Address: ${project.address || "Not specified"}
Municipality: ${project.municipality || "Not specified"}

These are photos of the property and its surroundings. Analyze them carefully and provide a structured description in BOTH French and English.

Return a JSON object (no markdown, just raw JSON) with these fields:
{
  "terrainDescription": "Detailed description of the terrain (topography, slope, soil type visible)",
  "terrainDescriptionFr": "Same in French",
  "existingConditions": "Description of what currently exists (buildings, structures, vacant land)",
  "existingConditionsFr": "Same in French",
  "vegetation": "Description of existing vegetation (trees, hedges, lawn, etc.)",
  "vegetationFr": "Same in French",
  "surroundings": "Description of the immediate surroundings (neighboring buildings, street, urban context)",
  "surroundingsFr": "Same in French",
  "atmosphere": "General atmosphere and character of the neighborhood",
  "atmosphereFr": "Same in French",
  "accessibility": "Visible access points, roads, sidewalks",
  "accessibilityFr": "Same in French",
  "notableFeatures": "Any notable features: walls, fences, poles, infrastructure",
  "notableFeaturesFr": "Same in French",
  "fullDescriptionFr": "A complete, formal French descriptive paragraph suitable for Section 1 (État actuel du terrain) of a Notice Descriptive. This should be 3-5 sentences covering terrain, existing conditions, vegetation, and surroundings in professional urban planning language."
}

Be precise and professional. If you cannot clearly determine something from the photos, say so honestly.`;

        // Call Gemini Vision API
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: prompt },
                            ...imageParts,
                        ],
                    }],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 4096,
                    },
                }),
            }
        );

        if (!res.ok) {
            const errorText = await res.text();
            console.error("Gemini Vision API error:", errorText);
            return NextResponse.json(
                { error: "AI analysis failed. Please try again." },
                { status: 502 }
            );
        }

        const data = await res.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

        // Parse JSON from response (may be wrapped in ```json ... ```)
        let analysis: Record<string, string> = {};
        try {
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                analysis = JSON.parse(jsonMatch[0]);
            }
        } catch {
            console.warn("Could not parse Gemini JSON, using raw text");
            analysis = {
                terrainDescription: rawText,
                terrainDescriptionFr: rawText,
                fullDescriptionFr: rawText,
            };
        }

        // Save analysis results to projectDescription
        const desc = (project.projectDescription as Record<string, unknown>) || {};
        const updatedDesc = {
            ...desc,
            photoAnalysis: {
                ...analysis,
                analyzedAt: new Date().toISOString(),
            },
        };

        await prisma.project.update({
            where: { id: projectId },
            data: {
                projectDescription: updatedDesc as Prisma.InputJsonValue,
            },
        });

        return NextResponse.json({
            success: true,
            analysis,
        });
    } catch (error) {
        console.error("Photo analysis error:", error);
        return NextResponse.json(
            { error: "Photo analysis failed" },
            { status: 500 }
        );
    }
}
