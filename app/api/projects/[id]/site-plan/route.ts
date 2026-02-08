import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await prisma.project.findFirst({ where: { id, userId: user.id } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const sitePlan = await prisma.sitePlanData.findUnique({
    where: { projectId: id },
  });
  return NextResponse.json({ sitePlan });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await prisma.project.findFirst({ where: { id, userId: user.id } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json();
  const sitePlan = await prisma.sitePlanData.upsert({
    where: { projectId: id },
    create: {
      projectId: id,
      canvasData: body.canvasData || {},
      elements: body.elements || null,
      footprintExisting: body.footprintExisting ?? null,
      footprintProjected: body.footprintProjected ?? null,
      footprintMax: body.footprintMax ?? null,
      surfaceAreas: body.surfaceAreas || null,
      vrdNetworks: body.vrdNetworks || null,
      northAngle: body.northAngle ?? null,
      terrainData: body.terrainData || null,
      building3D: body.building3D ?? null,
    },
    update: {
      ...(body.canvasData !== undefined && { canvasData: body.canvasData }),
      ...(body.elements !== undefined && { elements: body.elements }),
      ...(body.footprintExisting !== undefined && { footprintExisting: body.footprintExisting }),
      ...(body.footprintProjected !== undefined && { footprintProjected: body.footprintProjected }),
      ...(body.footprintMax !== undefined && { footprintMax: body.footprintMax }),
      ...(body.surfaceAreas !== undefined && { surfaceAreas: body.surfaceAreas }),
      ...(body.vrdNetworks !== undefined && { vrdNetworks: body.vrdNetworks }),
      ...(body.northAngle !== undefined && { northAngle: body.northAngle }),
      ...(body.terrainData !== undefined && { terrainData: body.terrainData }),
      ...(body.building3D !== undefined && { building3D: body.building3D }),
    },
  });
  return NextResponse.json({ sitePlan });
}
