import { NextRequest, NextResponse } from "next/server";
import { fetchThreeMapViews } from "@/lib/fetchStaticMap";

/**
 * GET /api/map-tiles?lat=...&lng=...&zoom=...
 * Returns base64 map tiles for aerial, IGN, plan, and cadastre views.
 */
export async function GET(request: NextRequest) {
    const sp = request.nextUrl.searchParams;
    const lat = parseFloat(sp.get("lat") || "");
    const lng = parseFloat(sp.get("lng") || "");
    const zoom = parseInt(sp.get("zoom") || "16", 10);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
    }

    try {
        const views = await fetchThreeMapViews(lat, lng, zoom);
        return NextResponse.json({ views });
    } catch (error) {
        console.error("Map tiles fetch error:", error);
        return NextResponse.json({ error: "Failed to fetch map tiles" }, { status: 500 });
    }
}
