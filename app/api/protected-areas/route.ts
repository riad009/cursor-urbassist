import { NextRequest, NextResponse } from "next/server";

// Protected Areas Detection API
// Implements official API Carto (IGN) GPU endpoints per https://apicarto.ign.fr/api/doc/
// - Prescriptions (prescription-surf/lin/pct)
// - Public utility easements / SUP (assiette-sup-s/l/p, acte-sup)
// - Protection perimeters → ABF zone, heritage, flood, etc.
// Plus Monuments Historiques, Géorisques, Sites Patrimoniaux Remarquables.

interface ProtectedAreaResult {
  type: string;
  name: string;
  description: string;
  distance: number | null;
  constraints: string[];
  sourceUrl: string | null;
  severity: "high" | "medium" | "low" | "info";
}

const API_HEADERS = { "User-Agent": "UrbAssist/1.0 (urbanisme)" };
const API_TIMEOUT = 12000;
const APICARTO_GPU = "https://apicarto.ign.fr/api/gpu";

/** GeoJSON Point for API Carto (EPSG:4326). */
function pointGeom(lng: number, lat: number): { type: "Point"; coordinates: [number, number] } {
  return { type: "Point", coordinates: [lng, lat] };
}

/** Small GeoJSON Polygon buffer (~11m) for reliable intersection. */
function smallPolygonGeom(lng: number, lat: number): { type: "Polygon"; coordinates: number[][][] } {
  const d = 0.0001; // ~11m
  return {
    type: "Polygon",
    coordinates: [[
      [lng - d, lat - d],
      [lng + d, lat - d],
      [lng + d, lat + d],
      [lng - d, lat + d],
      [lng - d, lat - d],
    ]],
  };
}

/** Fetch GPU layer by geometric intersection (official API Carto method).
 *  Per the official spec, GPU endpoints only accept `geom` (GeoJSON) and optionally `partition`.
 *  They do NOT accept `lon`/`lat` parameters.
 *  Uses polygon geometry for better intersection reliability. */
async function fetchGpuByGeom(
  path: string,
  lng: number,
  lat: number,
  category?: string
): Promise<unknown[]> {
  // Use a small polygon buffer for better intersection results
  const geom = smallPolygonGeom(lng, lat);
  const geomEnc = encodeURIComponent(JSON.stringify(geom));
  const catParam = category ? `&categorie=${encodeURIComponent(category)}` : "";

  // 1. GET with geom (documented primary method)
  try {
    const res = await fetch(`${APICARTO_GPU}/${path}?geom=${geomEnc}${catParam}`, {
      headers: API_HEADERS,
      signal: AbortSignal.timeout(API_TIMEOUT),
    });
    if (res.ok) {
      const data = await res.json();
      const features = data?.features ?? [];
      if (features.length > 0) return features;
    }
  } catch {
    // continue to POST
  }

  // 2. POST with JSON body (documented: "toutes les requêtes peuvent se faire en POST ou en GET")
  try {
    const body: Record<string, unknown> = { geom };
    if (category) body.categorie = category;
    const res = await fetch(`${APICARTO_GPU}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...API_HEADERS },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(API_TIMEOUT),
    });
    if (res.ok) {
      const data = await res.json();
      const features = data?.features ?? [];
      if (features.length > 0) return features;
    }
  } catch {
    // continue
  }

  // 3. Last resort: try with point geometry (smaller footprint)
  try {
    const ptGeom = pointGeom(lng, lat);
    const ptEnc = encodeURIComponent(JSON.stringify(ptGeom));
    const res = await fetch(`${APICARTO_GPU}/${path}?geom=${ptEnc}${catParam}`, {
      headers: API_HEADERS,
      signal: AbortSignal.timeout(API_TIMEOUT),
    });
    if (res.ok) {
      const data = await res.json();
      return data?.features ?? [];
    }
  } catch {
    // ignore
  }
  return [];
}

/** Determine if a SUP/prescription feature indicates ABF (e.g. AC1 = Monuments historiques). */
function isAbfRelated(props: Record<string, unknown> | undefined): boolean {
  if (!props) return false;
  const cat = String(props.categorie ?? props.CATEGORIE ?? props.type_sup ?? "").toUpperCase();
  const lib = String(props.libelle ?? props.LIBELLE ?? props.nom ?? "").toLowerCase();
  if (cat.includes("AC1") || cat.includes("MONUMENT") || lib.includes("monument historique") || lib.includes("abf") || lib.includes("site classé") || lib.includes("secteur sauvegardé")) return true;
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const { coordinates, citycode } = await request.json();

    if (!coordinates && !citycode) {
      return NextResponse.json(
        { error: "Coordinates or city code required" },
        { status: 400 }
      );
    }

    const [lng, lat] = coordinates || [0, 0];
    const areas: ProtectedAreaResult[] = [];
    const seenKeys = new Set<string>();

    function addArea(area: ProtectedAreaResult, key?: string) {
      const k = key ?? `${area.type}:${area.name}`;
      if (seenKeys.has(k)) return;
      seenKeys.add(k);
      areas.push(area);
    }

    // 1. Prescriptions (PLU/PLUi) — official API Carto geom intersection
    const prescriptionLayers = ["prescription-surf", "prescription-lin", "prescription-pct"];
    for (const path of prescriptionLayers) {
      try {
        const features = await fetchGpuByGeom(path, lng, lat);
        for (const f of features.slice(0, 10)) {
          const props = (f as { properties?: Record<string, unknown> })?.properties ?? {};
          const name = (props.libelle ?? props.LIBELLE ?? props.nom ?? path) as string;
          if (!name) continue;
          const desc = (props.libelong ?? props.LIBELLONG ?? props.description) as string;
          if (isAbfRelated(props)) {
            addArea({
              type: "ABF",
              name: String(name),
              description: desc || "Prescription or SUP related to heritage/ABF. Approval from the Architecte des Bâtiments de France (ABF) may be required.",
              distance: null,
              constraints: [
                "ABF approval may be required for exterior modifications",
                "Verify with your mairie and PLU document",
              ],
              sourceUrl: "https://www.geoportail-urbanisme.gouv.fr/",
              severity: "high",
            });
          } else {
            addArea({
              type: "PRESCRIPTION",
              name: String(name),
              description: desc || "Prescription from the urban planning document applies to this parcel. Verify with your mairie.",
              distance: null,
              constraints: ["Check PLU document for specific rules", "Prescriptions may impose additional constraints"],
              sourceUrl: "https://www.geoportail-urbanisme.gouv.fr/",
              severity: "medium",
            });
          }
        }
      } catch (e) {
        console.log(`GPU ${path} unavailable:`, e);
      }
    }

    // 2. Servitudes d'utilité publique (SUP) — assiettes and optionally ABF (AC1)
    const supLayers = ["assiette-sup-s", "assiette-sup-l", "assiette-sup-p"];
    for (const path of supLayers) {
      try {
        const features = await fetchGpuByGeom(path, lng, lat);
        for (const f of features.slice(0, 10)) {
          const props = (f as { properties?: Record<string, unknown> })?.properties ?? {};
          const name = (props.libelle ?? props.LIBELLE ?? props.nom ?? props.type_sup ?? path) as string;
          if (!name) continue;
          if (isAbfRelated(props)) {
            addArea({
              type: "ABF",
              name: `SUP – ${String(name)}`,
              description: "Public utility easement (SUP) related to heritage or monuments. ABF approval may be required.",
              distance: null,
              constraints: ["ABF approval may be required", "SUP imposes constraints; verify with mairie"],
              sourceUrl: "https://www.geoportail-urbanisme.gouv.fr/",
              severity: "high",
            });
          } else {
            addArea({
              type: "SUP",
              name: String(name),
              description: "Servitude d'utilité publique (SUP) applies to this parcel. Verify with your mairie.",
              distance: null,
              constraints: ["Check PLU document for specific rules", "SUP may impose additional constraints"],
              sourceUrl: "https://www.geoportail-urbanisme.gouv.fr/",
              severity: "medium",
            });
          }
        }
      } catch (e) {
        console.log(`GPU ${path} unavailable:`, e);
      }
    }

    // 3. Monuments Historiques (ABF perimeters - 500m around listed monuments)
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

    // 4. Natural risk zones (Géorisques)
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

    // 5. Sites Patrimoniaux Remarquables (SPR) and Sites classés
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

    // 6. If no results from APIs, check based on commune data
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
