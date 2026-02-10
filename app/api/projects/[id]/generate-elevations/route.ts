import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateElevation } from "@/lib/elevationGenerator";
import type { Building3D } from "@/lib/building3d";

const FACADES = [
  { name: "north" as const, buildingWidthKey: "width" as const },
  { name: "south" as const, buildingWidthKey: "width" as const },
  { name: "east" as const, buildingWidthKey: "depth" as const },
  { name: "west" as const, buildingWidthKey: "depth" as const },
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId } = await params;
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    include: { sitePlanData: true },
  });
  if (!project)
    return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const building3D = (project.sitePlanData?.building3D as Building3D) ?? null;
  if (!building3D) {
    return NextResponse.json(
      {
        error:
          "No 3D model defined. Save building dimensions and wall heights in Building 3D first.",
      },
      { status: 400 }
    );
  }

  const wallHeights = {
    ground: building3D.wallHeights?.ground ?? 3,
    first: building3D.wallHeights?.first,
    second: building3D.wallHeights?.second,
  };
  const roofData = {
    type: building3D.roof?.type ?? "gable",
    pitch: building3D.roof?.pitch ?? 35,
    overhang: building3D.roof?.overhang ?? 0.5,
  };
  const width = building3D.width ?? 12;
  const depth = building3D.depth ?? 10;
  const materials = building3D.materials ?? {};

  // Delete existing elevations for this project so we replace with consistent set
  await prisma.elevationData.deleteMany({ where: { projectId } });

  const created: { facade: string; id: string }[] = [];

  for (const { name, buildingWidthKey } of FACADES) {
    const buildingWidthMeters =
      buildingWidthKey === "width" ? width : depth;
    const drawing = generateElevation(
      name,
      wallHeights,
      roofData,
      [],
      materials,
      buildingWidthMeters
    );

    const elevation = await prisma.elevationData.create({
      data: {
        projectId,
        facade: name,
        wallHeights,
        roofData,
        openings: [],
        materials,
        canvasData: drawing,
      },
    });
    created.push({ facade: name, id: elevation.id });
  }

  return NextResponse.json({
    success: true,
    message: "Elevations generated from 3D model (consistent with site plan).",
    elevations: created,
  });
}
