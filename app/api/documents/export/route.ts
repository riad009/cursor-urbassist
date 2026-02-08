import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const CREDIT_COSTS: Record<string, number> = {
  LOCATION_PLAN: 2,
  SITE_PLAN: 3,
  SECTION: 2,
  ELEVATION: 2,
  LANDSCAPE_INSERTION: 5,
  DESCRIPTIVE_STATEMENT: 2,
  FULL_PACKAGE: 10,
};

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

    const cost = CREDIT_COSTS[documentType] ?? 2;
    if (user.credits < cost) {
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
        const cost = CREDIT_COSTS.LANDSCAPE_INSERTION ?? 5;
        if (user.credits < cost) {
          return NextResponse.json(
            { error: `Insufficient credits. Need ${cost}, have ${user.credits}` },
            { status: 402 }
          );
        }
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
          creditsRemaining: user.credits - cost,
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
            mapUrls: generateMapUrls(project),
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

    // Generate a basic PDF representation (base64 encoded)
    const pdfBase64 = generatePDFContent(documentContent);

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

    // Deduct credits
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

    return NextResponse.json({
      success: true,
      document: {
        id: doc.id,
        name: doc.name,
        type: doc.type,
        fileData: pdfBase64,
        creditsUsed: cost,
      },
      creditsRemaining: user.credits - cost,
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

function generateMapUrls(project: {
  coordinates?: string | null;
  address?: string | null;
}): Record<string, string> {
  let lat = 43.7;
  let lng = 7.26;

  if (project.coordinates) {
    try {
      const coords = JSON.parse(project.coordinates);
      lat = coords.lat || coords[1] || 43.7;
      lng = coords.lng || coords[0] || 7.26;
    } catch {
      // use defaults
    }
  }

  return {
    aerial: `https://wxs.ign.fr/decouverte/geoportail/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&TILEMATRIXSET=PM&TILEMATRIX=16&TILECOL=${Math.floor(((lng + 180) / 360) * Math.pow(2, 16))}&TILEROW=${Math.floor((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2 * Math.pow(2, 16))}&FORMAT=image/jpeg`,
    cadastral: `https://cadastre.data.gouv.fr/map?lat=${lat}&lng=${lng}&zoom=18`,
    ign: `https://www.geoportail.gouv.fr/carte?c=${lng},${lat}&z=18`,
    openstreetmap: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`,
  };
}

function generatePDFContent(documentContent: {
  title: string;
  project: { name: string; address: string; municipality: string; date: string };
  paperSize: string;
  scale: string;
  type: string;
  content: unknown;
}): string {
  // Generate a proper PDF structure
  const { title, project, paperSize, scale, type } = documentContent;

  // Paper sizes in points (1 point = 1/72 inch)
  const sizes: Record<string, { w: number; h: number }> = {
    A4: { w: 595, h: 842 },
    A3: { w: 842, h: 1190 },
    A2: { w: 1190, h: 1684 },
    A1: { w: 1684, h: 2384 },
    A0: { w: 2384, h: 3370 },
  };

  const size = sizes[paperSize] || sizes.A3;

  // Build PDF content
  const pdfObjects: string[] = [];
  let objCount = 0;

  const addObj = (content: string) => {
    objCount++;
    pdfObjects.push(`${objCount} 0 obj\n${content}\nendobj`);
    return objCount;
  };

  // Catalog
  addObj("<< /Type /Catalog /Pages 2 0 R >>");

  // Pages
  addObj("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");

  // Font
  const fontId = addObj(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  );

  // Build content stream
  const lines: string[] = [];
  lines.push("BT");
  lines.push(`/F1 20 Tf`);
  lines.push(`50 ${size.h - 60} Td`);
  lines.push(`(${escPdf(title)}) Tj`);
  lines.push(`/F1 12 Tf`);
  lines.push(`0 -30 Td`);
  lines.push(`(Project: ${escPdf(project.name)}) Tj`);
  lines.push(`0 -20 Td`);
  lines.push(`(Address: ${escPdf(project.address)}) Tj`);
  lines.push(`0 -20 Td`);
  lines.push(`(Municipality: ${escPdf(project.municipality)}) Tj`);
  lines.push(`0 -20 Td`);
  lines.push(`(Scale: ${escPdf(scale)} | Paper: ${escPdf(paperSize)}) Tj`);
  lines.push(`0 -20 Td`);
  lines.push(`(Date: ${escPdf(project.date)}) Tj`);
  lines.push(`0 -20 Td`);
  lines.push(`(Document Type: ${escPdf(type)}) Tj`);

  // Add content-specific text
  lines.push(`0 -40 Td`);
  lines.push(`/F1 14 Tf`);
  lines.push(`(Document Content) Tj`);
  lines.push(`/F1 10 Tf`);
  lines.push(`0 -25 Td`);

  const contentObj = documentContent.content as Record<string, unknown>;
  if (contentObj && typeof contentObj === "object") {
    if (contentObj.text && typeof contentObj.text === "string") {
      // Descriptive statement
      const textLines = (contentObj.text as string).split("\n").slice(0, 30);
      for (const line of textLines) {
        if (line.trim()) {
          lines.push(`(${escPdf(line.substring(0, 80))}) Tj`);
          lines.push(`0 -15 Td`);
        }
      }
    } else {
      lines.push(
        `(This document contains ${type.toLowerCase().replace("_", " ")} data.) Tj`
      );
      lines.push(`0 -15 Td`);
      lines.push(
        `(Generated by UrbAssist - ${new Date().toISOString()}) Tj`
      );
    }
  }

  lines.push("ET");

  // Draw border
  lines.push("2 w");
  lines.push(
    `20 20 ${size.w - 40} ${size.h - 40} re S`
  );

  // Draw title block
  const tbW = size.w / 2;
  const tbH = 60;
  lines.push(
    `${size.w - tbW - 20} 20 ${tbW} ${tbH} re S`
  );

  // North arrow (simple triangle)
  const nx = size.w - 50;
  const ny = size.h - 50;
  lines.push(`${nx} ${ny + 20} m ${nx - 8} ${ny} l ${nx + 8} ${ny} l f`);

  const contentStream = lines.join("\n");

  // Content stream
  const streamId = addObj(
    `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`
  );

  // Page (insert at position 3, after pages)
  // We need to insert the page object at index 2 (which is object 3)
  pdfObjects.splice(
    2,
    0,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size.w} ${size.h}] /Contents ${streamId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>\nendobj`
  );

  // Rebuild with correct numbering
  const pdf = [
    "%PDF-1.4",
    ...pdfObjects,
    `xref\n0 ${objCount + 1}`,
    `trailer << /Size ${objCount + 1} /Root 1 0 R >>`,
    "%%EOF",
  ].join("\n");

  return Buffer.from(pdf).toString("base64");
}

function escPdf(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, "?");
}
