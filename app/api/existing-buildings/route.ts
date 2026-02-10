import { NextRequest, NextResponse } from "next/server";

/**
 * Fetch existing buildings around a given coordinate from OpenStreetMap Overpass API.
 * Returns simplified building footprints with basic attributes.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") || "0");
  const lng = parseFloat(searchParams.get("lng") || "0");
  const radius = parseInt(searchParams.get("radius") || "200", 10); // meters

  if (!lat || !lng) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  try {
    // Query OSM Overpass API for buildings within radius
    const overpassQuery = `
      [out:json][timeout:15];
      (
        way["building"](around:${radius},${lat},${lng});
        relation["building"](around:${radius},${lat},${lng});
      );
      out body;
      >;
      out skel qt;
    `;

    const overpassUrl = "https://overpass-api.de/api/interpreter";
    const response = await fetch(overpassUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(overpassQuery)}`,
    });

    if (!response.ok) {
      // Fallback: return empty buildings with a message
      return NextResponse.json({
        buildings: [],
        message: "OSM Overpass API unavailable. You can manually add existing buildings.",
      });
    }

    const data = await response.json();

    // Parse OSM data into simplified building objects
    const nodes = new Map<number, { lat: number; lon: number }>();
    for (const element of data.elements || []) {
      if (element.type === "node") {
        nodes.set(element.id, { lat: element.lat, lon: element.lon });
      }
    }

    const buildings: Array<{
      id: string;
      type: string;
      name: string;
      coordinates: Array<{ lat: number; lng: number }>;
      tags: Record<string, string>;
      estimatedHeight: number;
      estimatedLevels: number;
      roofType: string;
    }> = [];

    for (const element of data.elements || []) {
      if (element.type === "way" && element.tags?.building) {
        const coords = (element.nodes || [])
          .map((nodeId: number) => {
            const node = nodes.get(nodeId);
            if (!node) return null;
            return { lat: node.lat, lng: node.lon };
          })
          .filter(Boolean);

        if (coords.length < 3) continue;

        // Estimate height from tags
        let estimatedHeight = 6; // default 2 stories at 3m each
        let estimatedLevels = 2;
        const heightTag = element.tags["height"];
        const levelsTag = element.tags["building:levels"];
        
        if (heightTag) {
          estimatedHeight = parseFloat(heightTag) || 6;
        } else if (levelsTag) {
          estimatedLevels = parseInt(levelsTag, 10) || 2;
          estimatedHeight = estimatedLevels * 3;
        }

        // Get roof type from tags
        const roofType = element.tags["roof:shape"] || element.tags["building:roof:shape"] || "flat";

        buildings.push({
          id: `osm-${element.id}`,
          type: element.tags.building || "yes",
          name: element.tags.name || element.tags["addr:housenumber"]
            ? `${element.tags["addr:housenumber"] || ""} ${element.tags["addr:street"] || ""}`.trim()
            : `Building ${element.id}`,
          coordinates: coords,
          tags: element.tags || {},
          estimatedHeight,
          estimatedLevels,
          roofType,
        });
      }
    }

    return NextResponse.json({
      buildings,
      center: { lat, lng },
      radius,
      count: buildings.length,
    });
  } catch (error) {
    console.error("Error fetching existing buildings:", error);
    return NextResponse.json({
      buildings: [],
      message: "Failed to fetch buildings from OSM. You can manually add existing buildings.",
    });
  }
}
