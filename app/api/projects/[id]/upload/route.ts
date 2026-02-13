import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import path from "path";
import fs from "fs/promises";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

/**
 * POST /api/projects/[id]/upload
 * Upload a file (PLU document, etc.) to a project.
 * Files saved to /uploads/projects/{projectId}/
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
        select: { id: true },
    });
    if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const fileType = formData.get("type") as string | null;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024} MB)` },
                { status: 400 }
            );
        }

        // Only allow PDF for now
        if (!file.name.toLowerCase().endsWith(".pdf")) {
            return NextResponse.json(
                { error: "Only PDF files are allowed" },
                { status: 400 }
            );
        }

        // Create upload directory
        const projectDir = path.join(UPLOAD_DIR, "projects", projectId);
        await fs.mkdir(projectDir, { recursive: true });

        // Save file
        const safeFilename = `${fileType || "document"}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const filePath = path.join(projectDir, safeFilename);
        const buffer = Buffer.from(await file.arrayBuffer());
        await fs.writeFile(filePath, buffer);

        // Store reference in project via raw update on the projectDescription JSON column
        const existing = await prisma.project.findUnique({
            where: { id: projectId },
        });

        const desc = (existing?.projectDescription as Record<string, unknown>) || {};
        const uploads = (desc.uploads as Array<{ type: string; filename: string; path: string; uploadedAt: string }>) || [];
        uploads.push({
            type: fileType || "document",
            filename: file.name,
            path: `/uploads/projects/${projectId}/${safeFilename}`,
            uploadedAt: new Date().toISOString(),
        });

        await prisma.project.update({
            where: { id: projectId },
            data: {
                projectDescription: { ...desc, uploads } as Record<string, unknown>,
            },
        });

        return NextResponse.json({
            success: true,
            filename: safeFilename,
            path: `/uploads/projects/${projectId}/${safeFilename}`,
        });
    } catch (error) {
        console.error("Upload error:", error);
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
}
