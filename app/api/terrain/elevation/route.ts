import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/terrain/elevation
 *
 * Proxies IGN RGE Alti® elevation requests to avoid CORS issues.
 * Accepts: ?points=lng1,lat1|lng2,lat2|... (max 200 points per request)
 * Returns: { elevations: number[] }
 */

const IGN_ALTI_URL =
  "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pointsStr = searchParams.get("points");

  if (!pointsStr) {
    return NextResponse.json(
      { error: "Missing 'points' parameter. Format: lng1,lat1|lng2,lat2|..." },
      { status: 400 }
    );
  }

  // Parse points
  const pairs = pointsStr.split("|").filter(Boolean);
  if (pairs.length === 0 || pairs.length > 200) {
    return NextResponse.json(
      { error: `Invalid point count: ${pairs.length}. Must be 1-200.` },
      { status: 400 }
    );
  }

  const lons: string[] = [];
  const lats: string[] = [];
  for (const pair of pairs) {
    const [lng, lat] = pair.split(",");
    if (!lng || !lat || isNaN(Number(lng)) || isNaN(Number(lat))) {
      return NextResponse.json(
        { error: `Invalid point: "${pair}". Expected format: lng,lat` },
        { status: 400 }
      );
    }
    lons.push(lng);
    lats.push(lat);
  }

  try {
    const url = `${IGN_ALTI_URL}?lon=${lons.join("|")}&lat=${lats.join("|")}&resource=ign_rge_alti_wld`;

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(`[elevation-proxy] IGN API error: ${response.status} — ${text}`);
      return NextResponse.json(
        { error: `IGN API returned ${response.status}`, elevations: pairs.map(() => 0) },
        { status: 200 }
      );
    }

    const data = await response.json();

    if (Array.isArray(data.elevations)) {
      const elevations = data.elevations.map((e: any) => {
        // Handle both formats:
        // Standard: { lon, lat, z, acc } → e.z
        // zonly: number → e directly
        const val = typeof e === "number" ? e : (typeof e?.z === "number" ? e.z : 0);
        return val > -1000 ? val : 0;
      });
      return NextResponse.json({ elevations });
    }

    // Fallback
    return NextResponse.json({ elevations: pairs.map(() => 0) });
  } catch (err) {
    console.error("[elevation-proxy] Fetch error:", err);
    return NextResponse.json(
      { error: "Failed to fetch elevations", elevations: pairs.map(() => 0) },
      { status: 200 }
    );
  }
}
