import { NextRequest, NextResponse } from "next/server";

/**
 * Combined geo-data for New Project: parcels (cadastre), PLU zone, and protected areas.
 * Called when the user selects an address so parcels and PLU load in one request.
 *
 * Performance: commune lookup + all 3 sub-APIs run in PARALLEL (not sequential).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const coordinates = body.coordinates as number[] | undefined;

    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return NextResponse.json({ error: "Coordinates [lng, lat] required" }, { status: 400 });
    }

    const [lng, lat] = coordinates.map(Number);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
    }

    const origin = request.nextUrl.origin;
    const addr = typeof body.address === "string" ? body.address : undefined;

    // ── Run commune lookup + ALL sub-APIs in PARALLEL ───────────────────
    // No sequential commune pre-fetch — each sub-API handles its own commune lookup if needed.
    // This saves 1-2 seconds on every request.

    type SubResult = { ok: boolean; data: Record<string, unknown> };

    const [cadastreResult, pluResult, paResult] = await Promise.allSettled([
      // 1) Cadastre — reduced timeout, smaller buffer
      fetch(`${origin}/api/cadastre/lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coordinates: [lng, lat], bufferMeters: 120 }),
        signal: AbortSignal.timeout(10000),
      }).then(async (res): Promise<SubResult> => ({ ok: res.ok, data: await res.json() })),

      // 2) PLU detection — handles commune lookup internally
      fetch(`${origin}/api/plu-detection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coordinates: [lng, lat], address: addr }),
        signal: AbortSignal.timeout(10000),
      }).then(async (res): Promise<SubResult> => ({ ok: res.ok, data: await res.json() })),

      // 3) Protected areas
      fetch(`${origin}/api/protected-areas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coordinates: [lng, lat] }),
        signal: AbortSignal.timeout(10000),
      }).then(async (res): Promise<SubResult> => ({ ok: res.ok, data: await res.json() })),
    ]);

    // ── Process results ─────────────────────────────────────────────────

    // Cadastre
    let parcels: Array<{ id: string; section: string; number: string; area: number; geometry?: unknown; coordinates?: number[] }> = [];
    let northAngleDegrees: number | null = null;
    let cadastreError: string | null = null;
    let bestMatchId: string | null = null;

    if (cadastreResult.status === "fulfilled") {
      const { ok, data } = cadastreResult.value;
      if (ok && Array.isArray(data.parcels)) {
        parcels = data.parcels as typeof parcels;
        northAngleDegrees = typeof data.northAngleDegrees === "number" ? data.northAngleDegrees : null;
        bestMatchId = typeof data.bestMatchId === "string" ? data.bestMatchId : null;
        if (data.source === "estimated" && parcels.length > 0) {
          cadastreError = "Cadastre data estimated (IGN API unavailable or no parcel at point).";
        }
      } else {
        cadastreError = (data.error as string) || "Failed to load parcels.";
      }
    } else {
      cadastreError = "Location data unavailable. You can still create the project with the address.";
    }

    // PLU
    let plu: { zoneType: string | null; zoneName: string | null; pluType?: string | null } = { zoneType: null, zoneName: null, pluType: null };
    let zoneFeatures: unknown[] = [];
    let pluDetectionFailed = false;
    let pluFallbackMessage: string | null = null;

    if (pluResult.status === "fulfilled" && pluResult.value.ok && pluResult.value.data.plu) {
      const p = pluResult.value.data.plu as Record<string, unknown>;
      plu = { zoneType: (p.zoneType as string) ?? null, zoneName: (p.zoneName as string) ?? null, pluType: (p.pluType as string) ?? null };
      zoneFeatures = Array.isArray(pluResult.value.data.zoneFeatures) ? (pluResult.value.data.zoneFeatures as unknown[]) : [];
      const src = pluResult.value.data.source;
      if (src === "fallback" || src === "none") {
        pluDetectionFailed = true;
        pluFallbackMessage = "Nous n'avons pas pu détecter automatiquement votre zone PLU ou RNU. Nous vous aiderons à la déterminer après validation de votre projet.";
      }
    } else {
      pluDetectionFailed = true;
      pluFallbackMessage = "Nous n'avons pas pu détecter automatiquement votre zone PLU ou RNU. Nous vous aiderons à la déterminer après validation de votre projet.";
    }

    // Protected areas
    let protectedAreas: Array<{ type: string; name: string; description?: string; constraints?: unknown; sourceUrl?: string }> = [];
    if (paResult.status === "fulfilled" && paResult.value.ok && Array.isArray(paResult.value.data.areas)) {
      protectedAreas = (paResult.value.data.areas as Array<Record<string, unknown>>).map(a => ({
        type: (a.type as string) ?? "INFO",
        name: (a.name as string) ?? "Protection",
        description: a.description as string | undefined,
        constraints: a.constraints,
        sourceUrl: a.sourceUrl as string | undefined,
      }));
    }

    return NextResponse.json({
      parcels,
      bestMatchId: bestMatchId ?? undefined,
      northAngleDegrees,
      cadastreError: cadastreError ?? undefined,
      plu,
      pluDetectionFailed,
      pluFallbackMessage: pluFallbackMessage ?? undefined,
      zoneFeatures,
      protectedAreas,
    });
  } catch (error) {
    console.error("Geo-data error:", error);
    return NextResponse.json({ error: "Failed to load location data" }, { status: 500 });
  }
}
