import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isUnrestrictedAdmin } from "@/lib/auth";
import { fetchPdfText } from "@/lib/fetchPdfText";

const ANALYSIS_CREDIT_COST = parseInt(
  process.env.PLU_ANALYSIS_CREDITS || "3",
  10
) || 3;

/**
 * Deep PLU analysis pipeline:
 * - Primary: project has address/coordinates → PLU detection → fetch official PDF → Gemini analysis.
 * - Fallback: when zone is not detected or user prefers to upload, accept documentContent in body → run Gemini analysis (after payment).
 * Payment: credits are deducted when analysis is run (except admin).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId: user.id },
    include: { regulatoryAnalysis: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!isUnrestrictedAdmin(user)) {
    if (user.credits < ANALYSIS_CREDIT_COST) {
      return NextResponse.json(
        {
          error: `Insufficient credits. Deep PLU analysis costs ${ANALYSIS_CREDIT_COST} credits. You have ${user.credits}.`,
          creditsRequired: ANALYSIS_CREDIT_COST,
        },
        { status: 402 }
      );
    }
  }

  try {
    const body = await request.json().catch(() => ({}));
    const bodyDocumentContent =
      typeof body.documentContent === "string" && body.documentContent.length > 100
        ? body.documentContent
        : null;

    let coordinates: number[] | null = null;
    if (project.coordinates) {
      try {
        const c = JSON.parse(project.coordinates);
        coordinates = Array.isArray(c)
          ? c
          : [c.lng ?? c.longitude, c.lat ?? c.latitude];
      } catch {
        // ignore
      }
    }

    let documentContent: string | null = bodyDocumentContent;
    let zoneType: string | null = null;
    let pdfUrl: string | null = null;
    let regulations: Record<string, unknown> = {};
    let protectedZones: object | null = null;
    let pluSource = "upload";

    if (coordinates && coordinates.length >= 2) {
      const pluRes = await fetch(
        new URL("/api/plu-detection", request.url).origin + "/api/plu-detection",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            coordinates: [coordinates[0], coordinates[1]],
            address: project.address,
          }),
        }
      );
      if (pluRes.ok) {
        const pluData = await pluRes.json();
        const plu = pluData.plu || {};
        zoneType = plu.zoneType || plu.zoneName || null;
        pdfUrl = plu.pdfUrl || null;
        regulations = (plu.regulations || {}) as Record<string, unknown>;
        protectedZones = plu.protectedZones ?? null;
        pluSource = pluData.source || "gpu";
        if (!documentContent && pdfUrl && isLikelyDirectPdfUrl(pdfUrl)) {
          const pdfText = await fetchPdfText(pdfUrl);
          if (pdfText) documentContent = pdfText.slice(0, 80000);
        }
      }
    }

    if (!documentContent) {
      if (!coordinates || coordinates.length < 2) {
        return NextResponse.json(
          {
            error:
              "Project has no address or coordinates. Set the project address first, or upload your PLU document for analysis.",
          },
          { status: 400 }
        );
      }
      return NextResponse.json(
        {
          error:
            "Zone or PLU document could not be retrieved automatically. Please upload your PLU regulation (PDF) for analysis.",
          code: "ZONE_OR_DOC_NOT_FOUND",
        },
        { status: 502 }
      );
    }

    const regRes = await fetch(
      new URL("/api/analyze-plu", request.url).origin + "/api/analyze-plu",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentContent,
          parcelAddress: project.address ?? undefined,
          zoneType: zoneType ?? undefined,
          description: project.description ?? undefined,
        }),
      }
    );

    if (!regRes.ok) {
      const err = await regRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.error || "PLU analysis request failed" },
        { status: 502 }
      );
    }

    const regJson = await regRes.json();
    const analysis =
      regJson.analysis && typeof regJson.analysis === "object"
        ? { ...regulations, ...regJson.analysis }
        : regulations;

    const regulatory = await prisma.regulatoryAnalysis.upsert({
      where: { projectId: id },
      create: {
        projectId: id,
        zoneType,
        aiAnalysis: analysis as object,
        pdfUrl,
        protectedZones: protectedZones ?? undefined,
      },
      update: {
        zoneType,
        aiAnalysis: analysis as object,
        pdfUrl,
        protectedZones: protectedZones ?? undefined,
      },
    });

    if (!isUnrestrictedAdmin(user)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { credits: { decrement: ANALYSIS_CREDIT_COST } },
      });
      await prisma.creditTransaction.create({
        data: {
          userId: user.id,
          amount: -ANALYSIS_CREDIT_COST,
          type: "PLU_ANALYSIS",
          description: `Deep PLU analysis for project ${project.name?.slice(0, 40) || id}`,
          metadata: {
            projectId: id,
            zoneType,
            source: bodyDocumentContent ? "upload" : pluSource,
          },
        },
      });
    }

    return NextResponse.json({
      success: true,
      source: bodyDocumentContent ? "upload" : pluSource,
      pdfUrl: regulatory.pdfUrl,
      zoneType: regulatory.zoneType,
      analysis: regulatory.aiAnalysis,
      creditsUsed: isUnrestrictedAdmin(user) ? 0 : ANALYSIS_CREDIT_COST,
    });
  } catch (error) {
    console.error("Regulatory auto:", error);
    return NextResponse.json(
      { error: "Automatic analysis failed" },
      { status: 500 }
    );
  }
}

function isLikelyDirectPdfUrl(url: string): boolean {
  const u = url.toLowerCase();
  return u.endsWith(".pdf") || u.includes(".pdf?") || u.includes("/pdf/");
}
