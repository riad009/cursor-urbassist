import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// ── Server-side in-memory cache ────────────────────────────────────
// Caches project data for 15 seconds to eliminate redundant DB calls.
// Multiple rapid requests for the same project hit cache instead of Neon.
interface CacheEntry {
  data: unknown;
  userId: string;
  timestamp: number;
}
const projectCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15_000; // 15 seconds

function getCached(id: string, userId: string): unknown | null {
  const entry = projectCache.get(id);
  if (!entry) return null;
  if (entry.userId !== userId) return null; // ownership mismatch
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    projectCache.delete(id);
    return null;
  }
  return entry.data;
}

function setCache(id: string, userId: string, data: unknown) {
  projectCache.set(id, { data, userId, timestamp: Date.now() });
}

function invalidateCache(id: string) {
  projectCache.delete(id);
}

// ── API Route Handlers ─────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // Check server-side cache first
  const cached = getCached(id, user.id);
  if (cached) {
    return NextResponse.json({ project: cached });
  }

  // Use findUnique by primary key (instant index lookup) instead of findFirst.
  // Then verify ownership in application code.
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      regulatoryAnalysis: {
        select: { id: true, zoneType: true, protectedZones: true, analyzedAt: true },
      },
      // sitePlanData intentionally excluded from default GET — it contains
      // massive JSON blobs (canvasData, building3D) that add seconds to the query.
      // Pages that need it should use the dedicated /api/projects/[id]/site-plan endpoint.
      feasibilityReport: {
        select: { id: true, isFeasible: true, generatedAt: true },
      },
      documents: {
        select: { id: true, type: true, name: true, fileUrl: true, fileData: true, creditsUsed: true },
      },
      protectedAreas: true,
    },
  });

  // Ownership check
  if (!project || project.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Cache the result
  setCache(id, user.id, project);

  return NextResponse.json({ project });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // Lightweight ownership check using findUnique + select
  const existing = await prisma.project.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const data: Record<string, unknown> = {
    name: body.name,
    description: body.description,
    address: body.address,
    municipality: body.municipality,
    parcelIds: Array.isArray(body.parcelIds) ? body.parcelIds.join(",") : body.parcelIds,
    parcelArea: body.parcelArea,
    northAngle: body.northAngle != null ? Number(body.northAngle) : undefined,
    status: body.status,
    scale: body.scale,
    authorizationType: body.authorizationType,
    authorizationExplanation: body.authorizationExplanation,
    projectDescription: body.projectDescription,
    paidAt: body.paidAt ? new Date(body.paidAt) : undefined,
  };
  if (body.parcelGeometry !== undefined) {
    data.parcelGeometry = typeof body.parcelGeometry === "string" ? body.parcelGeometry : (body.parcelGeometry != null ? JSON.stringify(body.parcelGeometry) : null);
  }
  if (body.existingBuildingsData !== undefined) {
    data.existingBuildingsData = body.existingBuildingsData ?? null;
  }
  if (body.parcelsGeoJSON !== undefined) {
    data.parcelsGeoJSON = body.parcelsGeoJSON ?? null;
  }
  const updated = await prisma.project.update({
    where: { id },
    data,
  });

  // Invalidate cache after mutation
  invalidateCache(id);

  // Auto-create LOCATION_PLAN and SITE_PLAN when address + parcels exist
  const hasAddress = !!updated.address?.trim();
  const hasParcels = !!(updated.parcelIds?.trim() || updated.coordinates);
  if (hasAddress && hasParcels) {
    for (const docType of ["LOCATION_PLAN", "SITE_PLAN"] as const) {
      const docExists = await prisma.document.findFirst({
        where: { projectId: id, type: docType },
        select: { id: true },
      });
      if (!docExists) {
        await prisma.document.create({
          data: {
            projectId: id,
            type: docType,
            name: `${updated.name} - ${docType === "SITE_PLAN" ? "Site Plan" : "Location Plan"}`,
            metadata: { autoGenerated: true, generatedAt: new Date().toISOString() },
            creditsUsed: 0,
          },
        });
      }
    }
  }
  return NextResponse.json({ project: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!project || project.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Invalidate cache before deletion
  invalidateCache(id);

  await prisma.project.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
