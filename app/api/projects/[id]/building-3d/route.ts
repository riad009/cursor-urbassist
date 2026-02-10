import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BUILDING_3D, type Building3D } from "@/lib/building3d";

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
  const merged = building3D
    ? { ...DEFAULT_BUILDING_3D, ...building3D }
    : DEFAULT_BUILDING_3D;

  return NextResponse.json({
    building3D: merged,
    fromSitePlan: !!building3D,
  });
}

export async function PUT(
  request: NextRequest,
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

  const body = (await request.json()) as Building3D;

  const sitePlan = await prisma.sitePlanData.upsert({
    where: { projectId: id },
    create: {
      projectId: id,
      canvasData: {},
      building3D: body,
    },
    update: { building3D: body },
  });

  return NextResponse.json({
    success: true,
    building3D: sitePlan.building3D,
  });
}
