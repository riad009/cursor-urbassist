import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/cadastre/road-type
 * Detect road types adjacent to a parcel using Overpass API (OpenStreetMap).
 *
 * Body: { lat: number, lng: number, radius?: number }
 * Returns: { roads: [{ name, type, classification, distance }] }
 */

interface RoadInfo {
  name: string;
  type: string; // OSM highway tag value
  classification: "voie_communale" | "voie_departementale" | "voie_nationale" | "chemin_rural" | "autoroute" | "voie_privee" | "inconnu";
  classificationLabel: string;
  distance: number; // approximate distance in meters from the coordinate
  ref?: string; // road ref (e.g., D123, N7)
}

// Map OSM highway types to French road classifications
function classifyRoad(highway: string, ref?: string): { classification: RoadInfo["classification"]; label: string } {
  const refUpper = (ref || "").toUpperCase();

  // Check ref first for departmental/national routes
  if (refUpper.startsWith("A") && /^A\d/.test(refUpper)) {
    return { classification: "autoroute", label: "Autoroute" };
  }
  if (refUpper.startsWith("N") && /^N\d/.test(refUpper)) {
    return { classification: "voie_nationale", label: "Route nationale" };
  }
  if (refUpper.startsWith("D") && /^D\d/.test(refUpper)) {
    return { classification: "voie_departementale", label: "Route départementale" };
  }
  if (refUpper.startsWith("C") && /^C\d/.test(refUpper)) {
    return { classification: "voie_communale", label: "Voie communale" };
  }

  // Classify by OSM highway type
  switch (highway) {
    case "motorway":
    case "motorway_link":
      return { classification: "autoroute", label: "Autoroute" };
    case "trunk":
    case "trunk_link":
      return { classification: "voie_nationale", label: "Route nationale" };
    case "primary":
    case "primary_link":
      return { classification: "voie_departementale", label: "Route départementale" };
    case "secondary":
    case "secondary_link":
      return { classification: "voie_departementale", label: "Route départementale" };
    case "tertiary":
    case "tertiary_link":
      return { classification: "voie_communale", label: "Voie communale" };
    case "residential":
    case "living_street":
    case "unclassified":
      return { classification: "voie_communale", label: "Voie communale" };
    case "track":
    case "path":
    case "bridleway":
      return { classification: "chemin_rural", label: "Chemin rural" };
    case "service":
      return { classification: "voie_privee", label: "Voie privée / Desserte" };
    default:
      return { classification: "inconnu", label: "Voie non classée" };
  }
}

// Haversine distance in meters
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function POST(request: NextRequest) {
  try {
    const { lat, lng, radius = 100 } = await request.json();

    if (!lat || !lng) {
      return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
    }

    // Query Overpass API for roads around the coordinate
    const overpassQuery = `
      [out:json][timeout:10];
      (
        way["highway"](around:${radius},${lat},${lng});
      );
      out body;
      >;
      out skel qt;
    `;

    const overpassRes = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(overpassQuery)}`,
      signal: AbortSignal.timeout(12000),
    });

    if (!overpassRes.ok) {
      return NextResponse.json({
        roads: [],
        error: "Overpass API unavailable",
      });
    }

    const overpassData = await overpassRes.json();
    const elements = overpassData.elements || [];

    // Build node lookup for coordinate calculation
    const nodes: Record<number, { lat: number; lon: number }> = {};
    elements.forEach((el: any) => {
      if (el.type === "node") {
        nodes[el.id] = { lat: el.lat, lon: el.lon };
      }
    });

    // Process ways
    const roads: RoadInfo[] = [];
    const seenNames = new Set<string>();

    elements
      .filter((el: any) => el.type === "way" && el.tags?.highway)
      .forEach((way: any) => {
        const tags = way.tags || {};
        const highway = tags.highway;
        const name = tags.name || tags.ref || `Unnamed ${highway}`;
        const ref = tags.ref || "";

        // Deduplicate by name
        const key = `${name}-${highway}`;
        if (seenNames.has(key)) return;
        seenNames.add(key);

        // Calculate approximate distance (using centroid of way nodes)
        let closestDist = Infinity;
        const wayNodes = way.nodes || [];
        for (const nid of wayNodes) {
          const node = nodes[nid];
          if (node) {
            const d = haversine(lat, lng, node.lat, node.lon);
            if (d < closestDist) closestDist = d;
          }
        }

        const { classification, label } = classifyRoad(highway, ref);

        roads.push({
          name,
          type: highway,
          classification,
          classificationLabel: label,
          distance: Math.round(closestDist),
          ref: ref || undefined,
        });
      });

    // Sort by distance
    roads.sort((a, b) => a.distance - b.distance);

    return NextResponse.json({
      success: true,
      roads: roads.slice(0, 10), // return top 10 closest roads
      nearestRoad: roads[0] || null,
    });
  } catch (error) {
    console.error("Road type detection error:", error);
    return NextResponse.json({
      roads: [],
      error: "Road type detection failed",
    });
  }
}
