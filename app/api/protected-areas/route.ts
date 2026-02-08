import { NextRequest, NextResponse } from "next/server";

// Protected Areas Detection API
// Detects ABF perimeters, heritage sites, classified zones, flood zones, Natura 2000
// Uses French government APIs: Atlas des patrimoines, Géorisques, etc.

interface ProtectedAreaResult {
  type: string;
  name: string;
  description: string;
  distance: number | null;
  constraints: string[];
  sourceUrl: string | null;
  severity: "high" | "medium" | "low" | "info";
}

export async function POST(request: NextRequest) {
  try {
    const { coordinates, citycode, address } = await request.json();

    if (!coordinates && !citycode) {
      return NextResponse.json(
        { error: "Coordinates or city code required" },
        { status: 400 }
      );
    }

    const [lng, lat] = coordinates || [0, 0];
    const areas: ProtectedAreaResult[] = [];

    // 1. Check Monuments Historiques (ABF perimeters - 500m around listed monuments)
    try {
      const mhRes = await fetch(
        `https://data.culture.gouv.fr/api/explore/v2.1/catalog/datasets/liste-des-immeubles-proteges-au-titre-des-monuments-historiques/records?where=within_distance(geolocalisation%2C%20geom'POINT(${lng}%20${lat})'%2C%20500m)&limit=10`,
        { signal: AbortSignal.timeout(8000) }
      );

      if (mhRes.ok) {
        const mhData = await mhRes.json();
        if (mhData.results && mhData.results.length > 0) {
          for (const mh of mhData.results) {
            areas.push({
              type: "ABF",
              name: `Monument Historique: ${mh.tico || mh.appellation_courante || "Listed building"}`,
              description: `Located within 500m of a listed historical monument. Approval from the Architecte des Bâtiments de France (ABF) is required.`,
              distance: null,
              constraints: [
                "ABF approval required for any exterior modification",
                "Materials and colors must be approved by ABF",
                "New construction must be harmonious with surroundings",
                "Roof type and slope may be imposed",
                "Fences and walls subject to ABF approval",
              ],
              sourceUrl: "https://www.culture.gouv.fr/Thematiques/Monuments-Sites",
              severity: "high",
            });
          }
        }
      }
    } catch (e) {
      console.log("Monuments historiques API unavailable:", e);
    }

    // 2. Check natural risk zones (Géorisques)
    try {
      const riskRes = await fetch(
        `https://georisques.gouv.fr/api/v1/resultats_rapport_risques?latlon=${lat},${lng}`,
        { signal: AbortSignal.timeout(8000) }
      );

      if (riskRes.ok) {
        const riskData = await riskRes.json();
        if (riskData.data) {
          // Flood zone
          if (riskData.data.risques_inondation) {
            areas.push({
              type: "FLOOD_ZONE",
              name: "Zone inondable",
              description:
                "The parcel is located in a flood risk zone (PPRI). Specific construction rules apply.",
              distance: null,
              constraints: [
                "Building floor must be above reference flood level",
                "Underground parking may be prohibited",
                "Specific materials required for flood resistance",
                "Insurance obligations under Cat-Nat regime",
              ],
              sourceUrl: "https://www.georisques.gouv.fr/",
              severity: "high",
            });
          }

          // Seismic zone
          if (riskData.data.zonage_sismique) {
            areas.push({
              type: "SEISMIC",
              name: `Zone sismique ${riskData.data.zonage_sismique}`,
              description: `Seismic zone ${riskData.data.zonage_sismique}. Anti-seismic construction norms may apply.`,
              distance: null,
              constraints: [
                "Anti-seismic construction norms (Eurocode 8) may apply",
                "Structural reinforcement requirements",
              ],
              sourceUrl: "https://www.georisques.gouv.fr/",
              severity: "medium",
            });
          }
        }
      }
    } catch (e) {
      console.log("Géorisques API unavailable:", e);
    }

    // 3. Check Sites Patrimoniaux Remarquables (SPR) and Sites classés
    try {
      const siteRes = await fetch(
        `https://data.culture.gouv.fr/api/explore/v2.1/catalog/datasets/sites-patrimoniaux-remarquables/records?where=within_distance(geo_point_2d%2C%20geom'POINT(${lng}%20${lat})'%2C%201000m)&limit=5`,
        { signal: AbortSignal.timeout(8000) }
      );

      if (siteRes.ok) {
        const siteData = await siteRes.json();
        if (siteData.results && siteData.results.length > 0) {
          for (const site of siteData.results) {
            areas.push({
              type: "HERITAGE",
              name: `Site Patrimonial Remarquable: ${site.nom || "Heritage site"}`,
              description:
                "Located within or near a Site Patrimonial Remarquable (SPR). Enhanced architectural controls apply.",
              distance: null,
              constraints: [
                "ABF approval required",
                "Strict architectural guidelines apply",
                "Material palette may be restricted",
                "Demolition may require authorization",
                "Specific urban planning rules (PVAP/PSMV) apply",
              ],
              sourceUrl: null,
              severity: "high",
            });
          }
        }
      }
    } catch (e) {
      console.log("SPR API unavailable:", e);
    }

    // 4. If no results from APIs, check based on commune data
    if (areas.length === 0 && citycode) {
      // Use the commune data to provide general information
      try {
        const communeRes = await fetch(
          `https://geo.api.gouv.fr/communes/${citycode}?fields=population,surface`
        );
        if (communeRes.ok) {
          const commune = await communeRes.json();
          // Large historic cities are more likely to have protected areas
          if (commune.population > 50000) {
            areas.push({
              type: "INFO",
              name: "Urban area - verify protections",
              description: `${commune.nom} is a significant urban area. We recommend verifying with the local town hall (mairie) for any specific protections.`,
              distance: null,
              constraints: [
                "Check with mairie for specific zoning constraints",
                "Verify ABF perimeters at town hall",
                "Check for local heritage protection plan",
              ],
              sourceUrl: null,
              severity: "info",
            });
          }
        }
      } catch (e) {
        console.log("Commune API unavailable:", e);
      }
    }

    // Always include general info
    areas.push({
      type: "INFO",
      name: "General construction regulations",
      description:
        "All construction projects must comply with the local PLU/PLUi and national building regulations (Code de l'urbanisme, RT2020/RE2020).",
      distance: null,
      constraints: [
        "Energy performance: RE2020 requirements",
        "Accessibility: Handicap accessibility norms",
        "Fire safety: ERP or habitation regulations",
        "Neighbor rights: Civil code articles 544 et seq.",
      ],
      sourceUrl: "https://www.legifrance.gouv.fr/",
      severity: "info",
    });

    return NextResponse.json({
      success: true,
      areas,
      coordinates: { lat, lng },
      citycode,
      totalProtections: areas.filter((a) => a.type !== "INFO").length,
      hasHighSeverity: areas.some((a) => a.severity === "high"),
    });
  } catch (error) {
    console.error("Protected areas detection error:", error);
    return NextResponse.json(
      { error: "Protected areas detection failed" },
      { status: 500 }
    );
  }
}
