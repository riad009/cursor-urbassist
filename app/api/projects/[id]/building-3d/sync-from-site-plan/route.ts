import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Returns suggested width and depth (meters) from the project's site plan
 * by reading the first building element's dimensions.
 * Used for "Sync from site plan" in Building 3D.
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

  const sitePlan = project.sitePlanData;
  if (!sitePlan?.elements || !Array.isArray(sitePlan.elements)) {
    return NextResponse.json({
      success: true,
      width: null,
      depth: null,
      message: "No site plan elements. Draw a building in the Design Studio first.",
    });
  }

  const elements = sitePlan.elements as Array<{
    width?: number;
    height?: number;
    category?: string;
    type?: string;
    [key: string]: unknown;
  }>;
  const scale = parseScale(project.scale);
  const building = elements.find(
    (e) =>
      e.category === "building" ||
      e.type === "rect" ||
      e.templateType === "house-small" ||
      e.templateType === "house-medium"
  );

  if (!building || (building.width == null && building.height == null)) {
    return NextResponse.json({
      success: true,
      width: null,
      depth: null,
      message: "No building shape found in site plan.",
    });
  }

  const wPx = Number(building.width) || 0;
  const hPx = Number(building.height) || 0;
  const widthM = pixelsToMeters(wPx, scale);
  const depthM = pixelsToMeters(hPx, scale);

  return NextResponse.json({
    success: true,
    width: Math.round(widthM * 100) / 100,
    depth: Math.round(depthM * 100) / 100,
    message: "Dimensions taken from first building in site plan.",
  });
}

function parseScale(scaleStr: string | null): number {
  if (!scaleStr) return 10;
  const match = scaleStr.match(/1:(\d+)/);
  if (match) return 1000 / Number(match[1]);
  return 10;
}

function pixelsToMeters(pixels: number, pixelsPerMeter: number): number {
  if (!pixelsPerMeter) return pixels / 10;
  return pixels / pixelsPerMeter;
}
