import { NextRequest, NextResponse } from "next/server";

/**
 * Combined geo-data for New Project: parcels (cadastre), PLU zone, and protected areas.
 * Called when the user selects an address so parcels and PLU load in one request.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const coordinates = body.coordinates as number[] | undefined;

    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return NextResponse.json(
        { error: "Coordinates [lng, lat] required" },
        { status: 400 }
      );
    }

    const [lng, lat] = coordinates.map(Number);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return NextResponse.json(
        { error: "Invalid coordinates" },
        { status: 400 }
      );
    }

    const origin = request.nextUrl.origin;

    // 1) Cadastre: parcels + north angle + bestMatchId (parcel under address or closest)
    let parcels: Array<{ id: string; section: string; number: string; area: number; geometry?: unknown; coordinates?: number[] }> = [];
    let northAngleDegrees: number | null = null;
    let cadastreError: string | null = null;
    let bestMatchId: string | null = null;

    try {
      const cadastreRes = await fetch(`${origin}/api/cadastre/lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coordinates: [lng, lat] }),
        signal: AbortSignal.timeout(15000),
      });
      const cadastreData = await cadastreRes.json();

      if (cadastreRes.ok && Array.isArray(cadastreData.parcels)) {
        parcels = cadastreData.parcels;
        northAngleDegrees =
          typeof cadastreData.northAngleDegrees === "number"
            ? cadastreData.northAngleDegrees
            : null;
        bestMatchId =
          typeof cadastreData.bestMatchId === "string" ? cadastreData.bestMatchId : null;
        if (cadastreData.source === "estimated" && parcels.length > 0) {
          cadastreError = "Cadastre data estimated (IGN API unavailable or no parcel at point).";
        }
      } else {
        cadastreError = cadastreData.error || "Failed to load parcels.";
      }
    } catch (e) {
      cadastreError = "Location data unavailable. You can still create the project with the address.";
    }

    // 2) PLU detection: zone type + zone features
    let plu: { zoneType: string | null; zoneName: string | null; pluType?: string | null } = {
      zoneType: null,
      zoneName: null,
      pluType: null,
    };
    let zoneFeatures: unknown[] = [];

    try {
      const pluRes = await fetch(`${origin}/api/plu-detection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coordinates: [lng, lat] }),
        signal: AbortSignal.timeout(12000),
      });
      const pluData = await pluRes.json();

      if (pluRes.ok && pluData.plu) {
        const p = pluData.plu;
        plu = {
          zoneType: p.zoneType ?? null,
          zoneName: p.zoneName ?? null,
          pluType: p.pluType ?? null,
        };
        zoneFeatures = Array.isArray(pluData.zoneFeatures) ? pluData.zoneFeatures : [];
      }
    } catch {
      // Non-blocking; leave plu empty
    }

    // 3) Protected areas
    let protectedAreas: Array<{ type: string; name: string; description?: string; constraints?: unknown; sourceUrl?: string }> = [];

    try {
      const paRes = await fetch(`${origin}/api/protected-areas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coordinates: [lng, lat] }),
        signal: AbortSignal.timeout(10000),
      });
      const paData = await paRes.json();

      if (paRes.ok && Array.isArray(paData.areas)) {
        protectedAreas = paData.areas.map(
          (a: { type?: string; name?: string; description?: string; constraints?: unknown; sourceUrl?: string }) => ({
            type: a.type ?? "INFO",
            name: a.name ?? "Protection",
            description: a.description,
            constraints: a.constraints,
            sourceUrl: a.sourceUrl,
          })
        );
      }
    } catch {
      // Non-blocking
    }

    return NextResponse.json({
      parcels,
      bestMatchId: bestMatchId ?? undefined,
      northAngleDegrees,
      cadastreError: cadastreError ?? undefined,
      plu,
      zoneFeatures,
      protectedAreas,
    });
  } catch (error) {
    console.error("Geo-data error:", error);
    return NextResponse.json(
      { error: "Failed to load location data" },
      { status: 500 }
    );
  }
}
