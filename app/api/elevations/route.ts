import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateElevation } from "@/lib/elevationGenerator";

// Elevation generation API - Section 6 of specifications
// Generates elevation drawings from 3D model data

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { projectId, facade, wallHeights, roofData, openings, materials, buildingWidth } =
      await request.json();

    if (!projectId || !facade) {
      return NextResponse.json(
        { error: "projectId and facade required" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
    });
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Generate elevation drawing data (buildingWidth: for north/south = width, east/west = depth)
    const elevationDrawing = generateElevation(
      facade,
      wallHeights || { ground: 3, first: 2.7 },
      roofData || { type: "gable", pitch: 35, overhang: 0.5 },
      openings || [],
      materials || {},
      buildingWidth ?? 12
    );

    // Save elevation data
    const elevation = await prisma.elevationData.create({
      data: {
        projectId,
        facade,
        wallHeights: wallHeights || { ground: 3, first: 2.7 },
        roofData: roofData || { type: "gable", pitch: 35 },
        openings: openings || [],
        materials: materials || {},
        canvasData: elevationDrawing,
      },
    });

    return NextResponse.json({
      success: true,
      elevation: {
        id: elevation.id,
        facade,
        drawing: elevationDrawing,
      },
    });
  } catch (error) {
    console.error("Elevation API error:", error);
    return NextResponse.json(
      { error: "Elevation generation failed" },
      { status: 500 }
    );
  }
}

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

  const elevations = await prisma.elevationData.findMany({
    where: { projectId },
  });

  return NextResponse.json({ elevations });
}
