import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { processParcelGeometries, type ParcelInput } from "@/lib/gis-pipeline";

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      regulatoryAnalysis: { select: { id: true, zoneType: true } },
      _count: { select: { documents: true } },
    },
  });
  return NextResponse.json({ projects });
}

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const { name, description, address, municipality, parcelIds, parcelArea, parcelGeometry, parcelsGeoJSON, coordinates, citycode, zoneType, protectedAreas, northAngle, projectType } = body;

    // ── Step 1: Run the GIS pipeline BEFORE creating the project ─────────
    // This is THE COMPUTE SHIFT: all processing happens server-side, eagerly,
    // so the site-plan page has zero loading and zero race conditions.
    let processedSiteData: unknown = null;

    if (parcelsGeoJSON || parcelGeometry) {
      const geoSource = parcelsGeoJSON || (typeof parcelGeometry === "string" ? JSON.parse(parcelGeometry) : parcelGeometry);

      // Parse into ParcelInput array
      let parcelFeatures: ParcelInput[] = [];
      try {
        const parsed = typeof geoSource === "string" ? JSON.parse(geoSource) : geoSource;
        if (parsed?.type === "FeatureCollection" && Array.isArray(parsed.features)) {
          parcelFeatures = parsed.features
            .filter((f: any) => {
              const gt = f?.geometry?.type;
              return gt === "Polygon" || gt === "MultiPolygon";
            })
            .map((f: any, idx: number) => ({
              type: f.type,
              properties: {
                id: f.properties?.id || f.properties?.IDU || `parcel-${idx}`,
                section: f.properties?.section || f.properties?.SEC || "",
                number: f.properties?.number || f.properties?.NUM || "",
                area: f.properties?.area || f.properties?.contenance || 0,
              },
              geometry: f.geometry,
            }));
        } else if (parsed?.type === "Feature" && parsed.geometry) {
          parcelFeatures = [{
            type: parsed.type,
            properties: {
              id: parsed.properties?.id || "parcel-0",
              section: parsed.properties?.section || "",
              number: parsed.properties?.number || "",
              area: parsed.properties?.area || 0,
            },
            geometry: parsed.geometry,
          }];
        } else if (parsed?.type === "Polygon" || parsed?.type === "MultiPolygon") {
          parcelFeatures = [{
            type: "Feature",
            properties: { id: "parcel-0" },
            geometry: parsed,
          }];
        }
      } catch (e) {
        console.warn("[POST /api/projects] Failed to parse GeoJSON for pipeline:", e);
      }

      if (parcelFeatures.length > 0) {
        try {
          const result = await processParcelGeometries(parcelFeatures);
          if (result) {
            processedSiteData = result.data;
            console.log(
              `[POST /api/projects] GIS pipeline complete: ${result.data.vertices3D.length} vertices, ` +
              `${result.data.edges.length} edges, ` +
              `elevation range: ${result.data.stats.minElevation}–${result.data.stats.maxElevation}m NGF`
            );
          }
        } catch (e) {
          // If the GIS pipeline fails, we still create the project — just without processedSiteData.
          // The site-plan page will gracefully handle a null processedSiteData.
          console.error("[POST /api/projects] GIS pipeline failed (non-blocking):", e);
        }
      }
    }

    // ── Step 2: Create the project (without processedSiteData to avoid cache issues) ──
    const project = await prisma.project.create({
      data: {
        userId: user.id,
        name: name || "New Project",
        description: description || null,
        address: address || null,
        municipality: municipality || null,
        parcelIds: Array.isArray(parcelIds) ? parcelIds.join(",") : typeof parcelIds === "string" ? parcelIds : "",
        parcelArea: parcelArea ? Number(parcelArea) : null,
        parcelGeometry: typeof parcelGeometry === "string" ? parcelGeometry : (parcelGeometry != null ? JSON.stringify(parcelGeometry) : null),
        parcelsGeoJSON: parcelsGeoJSON ?? undefined,
        coordinates: coordinates ? JSON.stringify(coordinates) : null,
        citycode: citycode || null,
        northAngle: northAngle != null ? Number(northAngle) : null,
        projectType: projectType && ["construction", "extension", "outdoor", "renovation"].includes(String(projectType)) ? String(projectType) : null,
      },
    });

    // ── Step 3: Persist processedSiteData via raw SQL ─────────────────────
    // Raw SQL bypasses Turbopack's stale Prisma client cache. The column
    // exists in DB (from `prisma db push`) but the cached runtime client
    // may not know about it until the dev server is restarted.
    if (processedSiteData) {
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "Project" SET "processed_site_data" = $1::jsonb WHERE "id" = $2`,
          JSON.stringify(processedSiteData),
          project.id
        );
      } catch (e) {
        console.error("[POST /api/projects] Failed to save processedSiteData:", e);
      }
    }

    // Auto-create LOCATION_PLAN and SITE_PLAN when address and parcels are set
    const hasAddress = !!(address || project.address);
    const hasParcels = !!(Array.isArray(parcelIds) ? parcelIds.length : parcelIds) || !!coordinates;
    if (hasAddress && hasParcels) {
      for (const docType of ["LOCATION_PLAN", "SITE_PLAN"] as const) {
        const existing = await prisma.document.findFirst({
          where: { projectId: project.id, type: docType },
        });
        if (!existing) {
          await prisma.document.create({
            data: {
              projectId: project.id,
              type: docType,
              name: `${project.name} - ${docType === "SITE_PLAN" ? "Site Plan" : "Location Plan"}`,
              metadata: { autoGenerated: true, generatedAt: new Date().toISOString() },
              creditsUsed: 0,
            },
          });
        }
      }
    }

    if (zoneType) {
      await prisma.regulatoryAnalysis.create({
        data: {
          projectId: project.id,
          zoneType: String(zoneType),
          aiAnalysis: { zoneType, fromPluDetection: true },
        },
      });
    }
    if (Array.isArray(protectedAreas) && protectedAreas.length > 0) {
      await prisma.protectedArea.createMany({
        data: protectedAreas.slice(0, 20).map((a: { type?: string; name?: string; description?: string; constraints?: unknown; sourceUrl?: string }) => ({
          projectId: project.id,
          type: (a.type as string) || "INFO",
          name: (a.name as string) || "Protected area",
          description: a.description || null,
          constraints: a.constraints == null ? undefined : (a.constraints as object),
          sourceUrl: a.sourceUrl || null,
        })),
      });
    }
    return NextResponse.json({ project });
  } catch (error) {
    console.error("Create project:", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
