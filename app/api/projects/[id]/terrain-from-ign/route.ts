import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  getParcelBoundsAndRef,
  lngLatToCanvas,
  type ParcelBoundsAndRef,
} from "@/lib/parcelGeometryToCanvas";

const IGN_ELEVATION_URL =
  "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json";
const RGE_ALTI_RESOURCE = "ign_rge_alti_wld";
const GRID_SIZE = 12; // 12x12 = 144 points per request (well under 5000 limit)
const NO_DATA_ELEVATION = -99999;

/** Approximate meters to degrees (lat): 1 deg ≈ 111320 m */
const METERS_TO_DEG_LAT = 1 / 111320;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId } = await params;
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    select: { id: true, coordinates: true, parcelGeometry: true },
  });
  if (!project)
    return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const canvasWidth = Math.min(
    2000,
    Math.max(400, Number(searchParams.get("canvasWidth")) || 800)
  );
  const canvasHeight = Math.min(
    2000,
    Math.max(400, Number(searchParams.get("canvasHeight")) || 600)
  );
  const pixelsPerMeter = Math.min(
    50,
    Math.max(2, Number(searchParams.get("pixelsPerMeter")) || 8)
  );

  let bounds: ParcelBoundsAndRef | null = null;
  let refLng: number;
  let refLat: number;
  let minLng: number, maxLng: number, minLat: number, maxLat: number;

  if (project.parcelGeometry) {
    bounds = getParcelBoundsAndRef(project.parcelGeometry);
  }
  if (bounds) {
    refLng = bounds.refLng;
    refLat = bounds.refLat;
    minLng = bounds.minLng;
    maxLng = bounds.maxLng;
    minLat = bounds.minLat;
    maxLat = bounds.maxLat;
  } else {
    let lng: number, lat: number;
    try {
      const coords =
        typeof project.coordinates === "string"
          ? JSON.parse(project.coordinates) as number[]
          : project.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        lng = Number(coords[0]);
        lat = Number(coords[1]);
      } else {
        return NextResponse.json(
          { error: "Project has no coordinates or parcel geometry" },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Project has no coordinates or parcel geometry" },
        { status: 400 }
      );
    }
    refLng = lng;
    refLat = lat;
    const bufferDeg = 50 * METERS_TO_DEG_LAT;
    minLng = lng - bufferDeg;
    maxLng = lng + bufferDeg;
    minLat = lat - bufferDeg;
    maxLat = lat + bufferDeg;
  }

  const lons: number[] = [];
  const lats: number[] = [];
  for (let i = 0; i < GRID_SIZE; i++) {
    const t = i / (GRID_SIZE - 1 || 1);
    for (let j = 0; j < GRID_SIZE; j++) {
      const s = j / (GRID_SIZE - 1 || 1);
      lons.push(minLng + s * (maxLng - minLng));
      lats.push(minLat + t * (maxLat - minLat));
    }
  }

  const lonParam = lons.join("|");
  const latParam = lats.join("|");
  const url = `${IGN_ELEVATION_URL}?lon=${encodeURIComponent(lonParam)}&lat=${encodeURIComponent(latParam)}&resource=${RGE_ALTI_RESOURCE}&delimiter=|&zonly=false`;

  let res: Response;
  try {
    res = await fetch(url, { next: { revalidate: 0 } });
  } catch (e) {
    console.error("IGN elevation fetch error:", e);
    return NextResponse.json(
      { error: "Could not reach IGN elevation service" },
      { status: 502 }
    );
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: `IGN service error: ${res.status}` },
      { status: 502 }
    );
  }

  let data: { elevations?: Array<{ lon: number; lat: number; z: number }> };
  try {
    data = await res.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid response from IGN elevation service" },
      { status: 502 }
    );
  }

  const elevations = data.elevations ?? [];
  const centerCanvasX = canvasWidth / 2;
  const centerCanvasY = canvasHeight / 2;

  const points: { x: number; y: number; value: number }[] = [];
  for (const e of elevations) {
    if (e.z === NO_DATA_ELEVATION) continue;
    const { x, y } = lngLatToCanvas(e.lon, e.lat, {
      refLng,
      refLat,
      centerCanvasX,
      centerCanvasY,
      pixelsPerMeter,
    });
    points.push({ x, y, value: e.z });
  }

  return NextResponse.json({
    points,
    source: "ign_rge_alti",
    count: points.length,
  });
}
