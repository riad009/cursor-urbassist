import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isUnrestrictedAdmin } from "@/lib/auth";
import {
  generateStyledPDF,
  type PDFProjectInfo,
  type PDFExportOptions,
} from "@/lib/pdf-generator";
import { fetchStaticMapBase64, fetchThreeMapViews } from "@/lib/fetchStaticMap";
import { CREDIT_COSTS, getDocumentExportCost } from "@/lib/credit-costs";

const CREDIT_COSTS_MAP = CREDIT_COSTS.DOCUMENT_EXPORT;

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { projectId, documentType, canvasData, options } =
      await request.json();
    if (!projectId || !documentType) {
      return NextResponse.json(
        { error: "projectId and documentType required" },
        { status: 400 }
      );
    }

    const cost = CREDIT_COSTS_MAP[documentType] ?? 2;
    if (!isUnrestrictedAdmin(user) && user.credits < cost) {
      return NextResponse.json(
        {
          error: `Insufficient credits. Need ${cost}, have ${user.credits}`,
        },
        { status: 402 }
      );
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
      include: {
        regulatoryAnalysis: true,
        sitePlanData: true,
        descriptiveStatement: true,
        terrainData: true,
      },
    });
    if (!project)
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );

    // Generate document content based on type
    let documentContent: {
      type: string;
      title: string;
      project: { name: string; address: string; municipality: string; date: string };
      content: unknown;
      paperSize: string;
      scale: string;
      includeOptions: Record<string, boolean>;
    };

    const baseInfo = {
      type: documentType,
      title: `${project.name} - ${documentType.replace("_", " ")}`,
      project: {
        name: project.name,
        address: project.address || "",
        municipality: project.municipality || "",
        date: new Date().toLocaleDateString("fr-FR"),
      },
      paperSize: options?.paperSize || "A3",
      scale: options?.scale || project.scale || "1:100",
      includeOptions: options?.include || {},
    };

    // Export landscape insertion as stored image when available
    if (documentType === "LANDSCAPE_INSERTION") {
      const existingLandscape = await prisma.document.findFirst({
        where: { projectId, type: "LANDSCAPE_INSERTION", fileData: { not: null } },
        orderBy: { createdAt: "desc" },
      });
      if (existingLandscape?.fileData) {
        const cost = CREDIT_COSTS_MAP.LANDSCAPE_INSERTION ?? 5;
        if (!isUnrestrictedAdmin(user) && user.credits < cost) {
          return NextResponse.json(
            { error: `Insufficient credits. Need ${cost}, have ${user.credits}` },
            { status: 402 }
          );
        }
        if (!isUnrestrictedAdmin(user)) {
          await prisma.user.update({
            where: { id: user.id },
            data: { credits: { decrement: cost } },
          });
          await prisma.creditTransaction.create({
            data: {
              userId: user.id,
              amount: -cost,
              type: "DOCUMENT_EXPORT",
              description: `Export ${documentType}`,
              metadata: { projectId, documentId: existingLandscape.id, documentType: "LANDSCAPE_INSERTION" },
            },
          });
        }
        return NextResponse.json({
          success: true,
          document: {
            id: existingLandscape.id,
            name: existingLandscape.name,
            type: existingLandscape.type,
            fileData: existingLandscape.fileData,
            mimeType: "image/png",
            isImage: true,
            creditsUsed: cost,
          },
          creditsRemaining: isUnrestrictedAdmin(user) ? user.credits : user.credits - cost,
        });
      }
    }

    switch (documentType) {
      case "LOCATION_PLAN":
        documentContent = {
          ...baseInfo,
          content: {
            type: "location_plan",
            coordinates: project.coordinates
              ? JSON.parse(project.coordinates)
              : null,
            address: project.address,
            parcelIds: project.parcelIds,
            views: ["aerial", "ign", "cadastral"],
          },
        };
        break;

      case "SITE_PLAN":
        documentContent = {
          ...baseInfo,
          content: {
            type: "site_plan",
            canvasData: canvasData || project.sitePlanData?.canvasData,
            elements: project.sitePlanData?.elements,
            footprints: {
              existing: project.sitePlanData?.footprintExisting,
              projected: project.sitePlanData?.footprintProjected,
              maximum: project.sitePlanData?.footprintMax,
            },
            surfaceAreas: project.sitePlanData?.surfaceAreas,
            northAngle: project.sitePlanData?.northAngle || 0,
            vrdNetworks: project.sitePlanData?.vrdNetworks,
          },
        };
        break;

      case "SECTION":
        documentContent = {
          ...baseInfo,
          content: {
            type: "section",
            terrainData: project.terrainData,
          },
        };
        break;

      case "ELEVATION":
        documentContent = {
          ...baseInfo,
          content: {
            type: "elevation",
          },
        };
        break;

      case "DESCRIPTIVE_STATEMENT":
        documentContent = {
          ...baseInfo,
          content: {
            type: "descriptive_statement",
            text:
              project.descriptiveStatement?.generatedText || "",
            sections: project.descriptiveStatement?.sections || {},
          },
        };
        break;

      case "FULL_PACKAGE":
        documentContent = {
          ...baseInfo,
          content: {
            type: "full_package",
            documents: [
              "LOCATION_PLAN",
              "SITE_PLAN",
              "SECTION",
              "ELEVATION",
              "DESCRIPTIVE_STATEMENT",
            ],
          },
        };
        break;

      default:
        documentContent = {
          ...baseInfo,
          content: { type: documentType },
        };
    }

    // Build PDF project info
    const pdfProject: PDFProjectInfo = {
      projectName: documentContent.project.name,
      address: documentContent.project.address,
      municipality: documentContent.project.municipality,
      date: documentContent.project.date,
      parcelRef: project.parcelIds || undefined,
      totalSurface: project.parcelArea ? `${project.parcelArea} m²` : undefined,
    };

    // Try to get main image (landscape insertion or site plan canvas)
    let mainImage: string | undefined;
    const landscapeDoc = await prisma.document.findFirst({
      where: { projectId, type: "LANDSCAPE_INSERTION", fileData: { not: null } },
      orderBy: { createdAt: "desc" },
    });
    if (landscapeDoc?.fileData) {
      const raw = landscapeDoc.fileData as string;
      mainImage = raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`;
    }
    const contentObj = documentContent.content as Record<string, unknown>;
    const sitePlanCanvas = contentObj?.canvasData ?? project.sitePlanData?.canvasData;
    if (!mainImage && typeof sitePlanCanvas === "string" && sitePlanCanvas.startsWith("data:image")) {
      mainImage = sitePlanCanvas;
    }

    // Extract surface data from site plan
    const surfaceAreasRaw = project.sitePlanData?.surfaceAreas;
    let surfaceData: Array<{ description: string; surface: string }> | undefined;
    if (Array.isArray(surfaceAreasRaw)) {
      surfaceData = surfaceAreasRaw.map((r) =>
        typeof r === "object" && r && "description" in r && "surface" in r
          ? { description: String(r.description), surface: String(r.surface) }
          : { description: "", surface: "" }
      ).filter((r) => r.description);
    } else if (surfaceAreasRaw && typeof surfaceAreasRaw === "object" && !Array.isArray(surfaceAreasRaw)) {
      surfaceData = Object.entries(surfaceAreasRaw as Record<string, number>).map(([desc, val]) => ({
        description: desc,
        surface: typeof val === "number" ? `${val.toFixed(2)} m²` : String(val),
      }));
    }

    const pdfOptions: PDFExportOptions = {
      paperSize: (documentContent.paperSize as "A3" | "A4" | "A2") || "A3",
      scale: documentContent.scale,
      documentType,
    };

    const statementText =
      (contentObj?.text as string) ||
      (contentObj?.sections && typeof contentObj.sections === "object"
        ? Object.values(contentObj.sections as Record<string, string>).join("\n\n")
        : project.descriptiveStatement?.generatedText || "");

    // Fetch three map views for Plan de situation (LOCATION_PLAN, FULL_PACKAGE)
    let mapImage: string | undefined;
    let mapImages: { aerial?: string | null; ign?: string | null; plan?: string | null } | undefined;
    const needsMap = documentType === "LOCATION_PLAN" || documentType === "FULL_PACKAGE";
    if (needsMap && project.coordinates) {
      try {
        const coords = JSON.parse(project.coordinates) as unknown;
        let lat: number | undefined;
        let lng: number | undefined;
        if (Array.isArray(coords)) {
          lat = coords[1];
          lng = coords[0];
        } else if (coords && typeof coords === "object") {
          const o = coords as Record<string, unknown>;
          lat = (o.lat ?? o.latitude) as number | undefined;
          lng = (o.lng ?? o.longitude) as number | undefined;
        }
        if (typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)) {
          try {
            const views = await fetchThreeMapViews(lat, lng, 16);
            mapImages = {
              aerial: views.aerial && views.aerial.length > 100 ? `data:image/png;base64,${views.aerial}` : null,
              ign: views.ign && views.ign.length > 100 ? `data:image/jpeg;base64,${views.ign}` : null,
              plan: views.plan && views.plan.length > 100 ? `data:image/png;base64,${views.plan}` : null,
            };
            if (views.aerial && views.aerial.length > 100) mapImage = `data:image/png;base64,${views.aerial}`;
            else if (views.ign && views.ign.length > 100) mapImage = `data:image/jpeg;base64,${views.ign}`;
            else if (views.plan && views.plan.length > 100) mapImage = `data:image/png;base64,${views.plan}`;
            else {
              const b64 = await fetchStaticMapBase64(lat, lng, 16);
              mapImage = b64 && b64.length > 100 ? `data:image/png;base64,${b64}` : undefined;
            }
          } catch {
            // Continue without map; PDF will show "Carte non disponible"
          }
        }
      } catch {
        // Invalid coordinates or parse error; continue without map
      }
    }

    const pdfContent = {
      type: documentType,
      text: statementText,
      surfaceData,
      mainImage,
      mapImage,
      mapImages,
    };

    const pdfBuffer = await generateStyledPDF(pdfProject, pdfOptions, pdfContent);
    const pdfBase64 = pdfBuffer.toString("base64");

    // Save document to database
    const doc = await prisma.document.create({
      data: {
        projectId,
        type: documentType,
        name: `${project.name} - ${documentType.replace("_", " ")}`,
        fileData: pdfBase64,
        metadata: {
          paperSize: baseInfo.paperSize,
          scale: baseInfo.scale,
          generatedAt: new Date().toISOString(),
        },
        creditsUsed: cost,
      },
    });

    // Deduct credits (skip for admin)
    if (!isUnrestrictedAdmin(user)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { credits: { decrement: cost } },
      });
      await prisma.creditTransaction.create({
        data: {
          userId: user.id,
          amount: -cost,
          type: "DOCUMENT_EXPORT",
          description: `Export ${documentType}`,
          metadata: { projectId, documentId: doc.id, documentType },
        },
      });
    }

    return NextResponse.json({
      success: true,
      document: {
        id: doc.id,
        name: doc.name,
        type: doc.type,
        fileData: pdfBase64,
        creditsUsed: cost,
      },
      creditsRemaining: isUnrestrictedAdmin(user) ? user.credits : user.credits - cost,
    });
  } catch (error) {
    console.error("Export:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}

// GET documents for a project
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

  const documents = await prisma.document.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ documents });
}
