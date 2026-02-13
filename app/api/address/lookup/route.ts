import { NextRequest, NextResponse } from "next/server";

// French cadastre/address lookup - integrates with data.gouv.fr APIs
// GeoAPI GOUV FR: https://geo.api.gouv.fr/
// Cadastre: https://cadastre.data.gouv.fr/bundler/cadastre-etalab

export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json();
    if (!address || typeof address !== "string") {
      return NextResponse.json({ error: "Address required" }, { status: 400 });
    }

    // Use Adresse API (data.gouv.fr) for address search
    const searchUrl = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=5`;
    const searchRes = await fetch(searchUrl, {
      signal: AbortSignal.timeout(5000),
    });
    if (!searchRes.ok) {
      throw new Error("Address search failed");
    }
    const searchData = await searchRes.json();

    const features = searchData.features || [];
    const results = features.map((f: { properties: { label: string; city: string; postcode: string; context?: string }; geometry: { coordinates: number[] } }) => ({
      label: f.properties?.label,
      city: f.properties?.city,
      postcode: f.properties?.postcode,
      context: f.properties?.context,
      coordinates: f.geometry?.coordinates,
    }));

    if (results.length === 0) {
      // Return mock data for demo when no results
      return NextResponse.json({
        results: [
          {
            label: address,
            city: "Nice",
            postcode: "06000",
            context: "Alpes-Maritimes, Provence-Alpes-Côte d'Azur",
            coordinates: [7.2622, 43.7102],
            mock: true,
          },
        ],
      });
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Address lookup error:", error);
    return NextResponse.json(
      { error: "Address lookup failed" },
      { status: 500 }
    );
  }
}
