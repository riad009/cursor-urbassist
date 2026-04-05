/**
 * GET /api/generate-dossier?projectId=xxx
 *
 * Fetches all project data needed to generate the complete PC dossier.
 * Returns a DossierProjectData JSON object that the client-side
 * assembler uses to drive jsPDF generation.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        sitePlanData: true,
        terrainData: true,
        elevationData: true,
        sectionData: true,
        descriptiveStatement: true,
        regulatoryAnalysis: true,
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Extract postal code from citycode or address
    let postalCode: string | null = null;
    if (project.citycode) {
      // citycode is INSEE code (5 digits) — postal code prefix = first 2 digits (department)
      postalCode = project.citycode;
    }
    // Try to extract from address string (e.g., "13 Rue X, 60510 Bresles")
    if (!postalCode && project.address) {
      const postalMatch = project.address.match(/\b(\d{5})\b/);
      if (postalMatch) postalCode = postalMatch[1];
    }

    // Shape the response to match DossierProjectData interface
    const data = {
      id: project.id,
      name: project.name,
      address: project.address,
      municipality: project.municipality,
      departement: project.departement,
      postalCode,
      citycode: project.citycode,
      coordinates: project.coordinates,
      parcelIds: project.parcelIds,
      parcelArea: project.parcelArea,
      parcelGeometry: project.parcelGeometry,
      authorizationType: project.authorizationType,
      projectDescription: project.projectDescription as Record<string, unknown> | null,
      scale: project.scale,
      sitePlanData: project.sitePlanData
        ? {
            canvasData: project.sitePlanData.canvasData,
            elements: project.sitePlanData.elements,
            footprintExisting: project.sitePlanData.footprintExisting,
            footprintProjected: project.sitePlanData.footprintProjected,
            footprintMax: project.sitePlanData.footprintMax,
            surfaceAreas: project.sitePlanData.surfaceAreas,
            northAngle: project.sitePlanData.northAngle,
            building3D: project.sitePlanData.building3D,
          }
        : null,
      terrainData: project.terrainData
        ? {
            elevationPoints: project.terrainData.elevationPoints,
            sectionLines: project.terrainData.sectionLines,
            terrainModel: project.terrainData.terrainModel,
            profiles: project.terrainData.profiles,
          }
        : null,
      elevationData: project.elevationData.map((e) => ({
        facade: e.facade,
        wallHeights: e.wallHeights,
        roofData: e.roofData,
        openings: e.openings,
        materials: e.materials,
      })),
      sectionData: project.sectionData.map((s) => ({
        name: s.name,
        sectionLine: s.sectionLine,
        groundProfile: s.groundProfile,
        buildingCut: s.buildingCut,
      })),
      descriptiveStatement: project.descriptiveStatement
        ? {
            answers: project.descriptiveStatement.answers,
            generatedText: project.descriptiveStatement.generatedText,
            sections: project.descriptiveStatement.sections,
          }
        : null,
      regulatoryData: project.regulatoryAnalysis
        ? {
            zoneType: project.regulatoryAnalysis.zoneType,
            aiAnalysis: project.regulatoryAnalysis.aiAnalysis as Record<string, unknown> | null,
            constraints: project.regulatoryAnalysis.constraints,
            protectedZones: project.regulatoryAnalysis.protectedZones,
          }
        : null,
    };

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[generate-dossier] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch project data" },
      { status: 500 }
    );
  }
}
