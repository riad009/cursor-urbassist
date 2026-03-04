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

    // ── Step 1: Run cadastre + PLU + protected areas in PARALLEL ────────
    // Once cadastre resolves we use the parcel geometry to clip buildings.

    type SubResult = { ok: boolean; data: Record<string, unknown> };

    const [cadastreResult, pluResult, paResult] = await Promise.allSettled([
      // 1) Cadastre — real IGN Apicarto parcel polygons
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
    let bestMatchGeometry: unknown = null;

    if (cadastreResult.status === "fulfilled") {
      const { ok, data } = cadastreResult.value;
      if (ok && Array.isArray(data.parcels) && (data.parcels as unknown[]).length > 0) {
        parcels = data.parcels as typeof parcels;
        northAngleDegrees = typeof data.northAngleDegrees === "number" ? data.northAngleDegrees : null;
        bestMatchId = typeof data.bestMatchId === "string" ? data.bestMatchId : null;
        // Grab the geometry of the best-match parcel for building clip
        const best = parcels.find((p) => p.id === bestMatchId) ?? parcels[0];
        bestMatchGeometry = best?.geometry ?? null;
      } else {
        // source "none" means IGN returned no parcels — not a server error, surface the message
        const errMsg = (data.error as string) || (data.source === "none"
          ? "Aucune parcelle cadastrale trouvée pour cette adresse."
          : "Failed to load parcels.");
        cadastreError = errMsg;
      }
    } else {
      cadastreError = "Données cadastrales indisponibles. Vous pouvez continuer avec l'adresse saisie.";
    }

    // ── Step 2: Fetch IGN BDTOPO buildings using parcel geometry (parallel with PLU/PA processing) ──
    let existingBuildingsGeoJSON: unknown = null;
    const buildingsFetchPromise: Promise<void> = bestMatchGeometry
      ? fetch(`${origin}/api/existing-buildings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parcelGeometry: bestMatchGeometry }),
          signal: AbortSignal.timeout(14000),
        })
          .then(async (res) => {
            if (res.ok) {
              const bd = await res.json();
              if (bd.buildings) existingBuildingsGeoJSON = bd.buildings;
            }
          })
          .catch(() => { /* non-blocking — buildings are optional at this stage */ })
      : Promise.resolve();


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
      if (src === "none") {
        pluDetectionFailed = true;
        pluFallbackMessage = "La détection automatique de la zone PLU n'a pas abouti. Nous vous aiderons à la déterminer après validation de votre projet.";
      } else if (src === "no_data") {
        // White zone — documents not uploaded yet. This is accurate data, not a failure.
        pluFallbackMessage = "Les documents d'urbanisme de cette commune n'ont pas encore été mis en ligne. Contactez votre mairie pour connaître la réglementation applicable.";
      }
    } else {
      pluDetectionFailed = true;
      pluFallbackMessage = "La détection automatique de la zone PLU n'a pas abouti. Nous vous aiderons à la déterminer après validation de votre projet.";
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

    // Wait for buildings (non-blocking — resolves immediately if no parcel geometry)
    await buildingsFetchPromise;


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
      existingBuildingsGeoJSON: existingBuildingsGeoJSON ?? undefined,
    });
  } catch (error) {
    console.error("Geo-data error:", error);
    return NextResponse.json({ error: "Failed to load location data" }, { status: 500 });
  }
}
