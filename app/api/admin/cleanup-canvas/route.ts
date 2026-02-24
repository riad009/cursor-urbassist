import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Temporary admin route to clean orphaned measurement objects from canvas JSON.
// Remove this file after cleanup is done.
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const sp = await prisma.sitePlanData.findFirst({
    where: { projectId },
    select: { id: true, canvasData: true },
  });

  if (!sp?.canvasData) return NextResponse.json({ error: "no canvasData" }, { status: 404 });

  const canvas = typeof sp.canvasData === "string"
    ? JSON.parse(sp.canvasData)
    : (sp.canvasData as any);

  const objs: any[] = canvas.objects || [];
  const before = objs.length;

  const kept = objs.filter((o: any) => {
    if (!o || typeof o !== "object") return false;
    // Keep any object that has a user-assigned name
    if (o.elementName || o.name) return true;
    // Keep objects with user-meaningful data
    const hasMeaning = o.surfaceType || o.isParcel || o.elevationValue != null ||
      o.vegetationType || o.templateType || o.vrdType;
    if (hasMeaning) return true;
    // Remove if it has no user-meaning at all.
    // Measurement/overlay objects are identifiable by:
    // 1. Text with backgroundColor = measurement label (from createDimensionLine)
    // 2. Any type with no elementName, no surfaceType, no user tags
    //    (circles are corner nodes, lines are dimension lines, polygons are arrowheads)
    return false;
  });

  const removed = before - kept.length;
  const removedTypes = objs.filter((o: any) => !kept.includes(o)).map((o: any) => o.type);

  if (removed > 0) {
    canvas.objects = kept;
    await prisma.sitePlanData.update({
      where: { id: sp.id },
      data: { canvasData: JSON.stringify(canvas) as any },
    });
  }

  return NextResponse.json({
    before,
    after: kept.length,
    removed,
    removedTypes: removedTypes.slice(0, 50),
    message: removed > 0 ? `Removed ${removed} orphaned objects` : "Nothing to remove",
  });
}
