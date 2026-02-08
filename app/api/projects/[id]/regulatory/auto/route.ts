import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { fetchPdfText } from "@/lib/fetchPdfText";

/**
 * Automatic pipeline: address → municipality/parcel → PLU detection → pdfUrl + regulations → save.
 * If pdfUrl is a direct PDF link, fetches and extracts text then runs Gemini analysis.
 * Optionally run Gemini analysis if documentContent is provided (e.g. from uploaded PDF).
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

  try {
    const body = await request.json().catch(() => ({}));
    const { documentContent: bodyDocumentContent } = body;

    let coordinates: number[] | null = null;
    if (project.coordinates) {
      try {
        const c = JSON.parse(project.coordinates);
        coordinates = Array.isArray(c) ? c : [c.lng ?? c.longitude, c.lat ?? c.latitude];
      } catch {
        // ignore
      }
    }
    if (!coordinates || coordinates.length < 2) {
      return NextResponse.json(
        { error: "Project has no coordinates. Set address and parcels first." },
        { status: 400 }
      );
    }

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
    if (!pluRes.ok) {
      const err = await pluRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.error || "PLU detection failed" },
        { status: 502 }
      );
    }
    const pluData = await pluRes.json();
    const plu = pluData.plu || {};
    const pdfUrl = plu.pdfUrl || null;
    const zoneType = plu.zoneType || plu.zoneName || null;
    const regulations = plu.regulations || {};

    let analysis: object = regulations;

    // Prefer explicit document content; otherwise try to fetch and parse official PLU PDF
    let documentContent: string | null =
      typeof bodyDocumentContent === "string" && bodyDocumentContent.length > 100
        ? bodyDocumentContent
        : null;

    if (!documentContent && pdfUrl && isLikelyDirectPdfUrl(pdfUrl)) {
      const pdfText = await fetchPdfText(pdfUrl);
      if (pdfText) documentContent = pdfText.slice(0, 30000);
    }

    if (documentContent) {
      const regRes = await fetch(
        new URL("/api/analyze-plu", request.url).origin + "/api/analyze-plu",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentContent,
            parcelAddress: project.address,
            zoneType,
          }),
        }
      );
      if (regRes.ok) {
        const regJson = await regRes.json();
        if (regJson.analysis && typeof regJson.analysis === "object") {
          analysis = { ...regulations, ...regJson.analysis };
        }
      }
    }

    const regulatory = await prisma.regulatoryAnalysis.upsert({
      where: { projectId: id },
      create: {
        projectId: id,
        zoneType,
        aiAnalysis: analysis as object,
        pdfUrl,
        protectedZones: pluData.plu?.protectedZones ?? null,
      },
      update: {
        zoneType,
        aiAnalysis: analysis as object,
        pdfUrl,
        protectedZones: pluData.plu?.protectedZones ?? undefined,
      },
    });

    return NextResponse.json({
      success: true,
      source: pluData.source || "gpu",
      pdfUrl: regulatory.pdfUrl,
      zoneType: regulatory.zoneType,
      analysis: regulatory.aiAnalysis,
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
