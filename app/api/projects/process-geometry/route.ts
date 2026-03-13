import { NextRequest, NextResponse } from "next/server";
import { processParcelGeometries, type ParcelInput } from "@/lib/gis-pipeline";

/**
 * POST /api/projects/process-geometry
 *
 * Backward-compatible endpoint. Now delegates to the shared gis-pipeline module.
 * This route is kept for any direct API callers, but the PRIMARY path is now
 * inline processing during project creation (POST /api/projects).
 */
export async function POST(req: NextRequest) {
  let body: { parcels?: ParcelInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.parcels || !Array.isArray(body.parcels) || body.parcels.length === 0) {
    return NextResponse.json(
      { error: "parcels array is required and must not be empty" },
      { status: 400 }
    );
  }

  const result = await processParcelGeometries(body.parcels);

  if (!result) {
    return NextResponse.json(
      { error: "No valid parcel geometries could be processed" },
      { status: 400 }
    );
  }

  return NextResponse.json(result.data);
}
