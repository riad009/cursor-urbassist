import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Building3D } from "@/lib/building3d";

/**
 * Returns building data derived from the 3D model for use in section drawings.
 * Use width when section is along building depth; use depth when section is along building width.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId: user.id },
    include: { sitePlanData: true },
  });
  if (!project)
    return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const building3D = (project.sitePlanData?.building3D as Building3D) ?? null;
  if (!building3D) {
    return NextResponse.json({
      success: true,
      hasModel: false,
      buildingData: null,
      message: "No 3D model. Define one in Building 3D first for consistent sections.",
    });
  }

  const gh = building3D.wallHeights?.ground ?? 3;
  const fh = building3D.wallHeights?.first ?? 0;
  const sh = building3D.wallHeights?.second ?? 0;
  const totalHeight = gh + fh + sh;
  const pitchRad = ((building3D.roof?.pitch ?? 35) * Math.PI) / 180;
  const roofHeight =
    building3D.roof?.type === "flat"
      ? 0
      : ((building3D.width ?? 12) / 2) * Math.tan(pitchRad);

  return NextResponse.json({
    success: true,
    hasModel: true,
    buildingData: {
      width: building3D.width ?? 12,
      depth: building3D.depth ?? 10,
      height: totalHeight,
      roofHeight,
      roofType: building3D.roof?.type ?? "gable",
    },
  });
}
