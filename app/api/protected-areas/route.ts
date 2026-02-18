import { NextRequest, NextResponse } from "next/server";

// Protected Areas Detection API
// Implements official API Carto (IGN) GPU endpoints per https://apicarto.ign.fr/api/doc/
// - Prescriptions (prescription-surf/lin/pct)
// - Public utility easements / SUP (assiette-sup-s/l/p, acte-sup)
// - Protection perimeters → ABF zone, heritage, flood, etc.
// Plus Monuments Historiques, Géorisques, Sites Patrimoniaux Remarquables.
//
// PERFORMANCE: All external API calls run in PARALLEL via Promise.allSettled.

interface ProtectedAreaResult {
  type: string;
  name: string;
  description: string;
  distance: number | null;
  constraints: string[];
  sourceUrl: string | null;
  severity: "high" | "medium" | "low" | "info";
  categorie?: string;
}

const API_HEADERS = { "User-Agent": "UrbAssist/1.0 (urbanisme)" };
const API_TIMEOUT = 25000; // GPU API returns 8MB+ GeoJSON bodies that need time to download
const APICARTO_GPU = "https://apicarto.ign.fr/api/gpu";

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

/** Fetch GPU layer by geometric intersection — single fast GET.
 *  Removed serial POST and Point fallbacks that added massive latency. */
async function fetchGpuByGeom(
  path: string,
  lng: number,
  lat: number,
): Promise<unknown[]> {
  const geom = smallPolygonGeom(lng, lat);
  const geomEnc = encodeURIComponent(JSON.stringify(geom));
  try {
    const res = await fetch(`${APICARTO_GPU}/${path}?geom=${geomEnc}`, {
      headers: API_HEADERS,
      signal: AbortSignal.timeout(API_TIMEOUT),
    });
    if (res.ok) {
      // Read body as text first — the GPU API returns multi-MB GeoJSON
      // and streaming JSON parse can be interrupted by the abort signal.
      const text = await res.text();
      const data = JSON.parse(text);
      return data?.features ?? [];
    }
  } catch {
    // timeout or network error — silently return empty
  }
  return [];
}

/** Determine if a SUP/prescription feature indicates ABF (e.g. AC1 = Monuments historiques). */
function isAbfRelated(props: Record<string, unknown> | undefined): boolean {
  if (!props) return false;
  const cat = String(props.categorie ?? props.CATEGORIE ?? props.suptype ?? props.type_sup ?? "").toUpperCase();
  const lib = String(props.libelle ?? props.LIBELLE ?? props.nomsuplitt ?? props.nom ?? "").toLowerCase();
  const typeass = String(props.typeass ?? "").toLowerCase();
  if (cat.startsWith("AC1") || cat.includes("MONUMENT") || typeass.includes("abords")) return true;
  if (lib.includes("monument historique") || lib.includes("abf") || lib.includes("site classé") || lib.includes("secteur sauvegardé")) return true;
  return false;
}

/** Detect flood/risk prescriptions (P.P.R.I., inondation, PM1, PM2, etc.) */
function isRiskRelated(props: Record<string, unknown> | undefined): boolean {
  if (!props) return false;
  const cat = String(props.categorie ?? props.CATEGORIE ?? props.type_sup ?? "").toUpperCase();
  const lib = String(props.libelle ?? props.LIBELLE ?? props.nom ?? "").toLowerCase();
  const desc = String(props.libelong ?? props.LIBELLONG ?? props.description ?? "").toLowerCase();
  const text = lib + " " + desc;
  if (cat.startsWith("PM1") || cat.startsWith("PM2") || cat.startsWith("PM3")) return true;
  if (text.includes("p.p.r.i") || text.includes("ppri") || text.includes("inondation") || text.includes("inondable") || text.includes("risque naturel") || text.includes("risque technologique") || text.includes("risque minier") || text.includes("zone à risque") || text.includes("zone a risque") || text.includes("submersion") || text.includes("crue") || text.includes("aléa")) return true;
  return false;
}

/** Detect heritage/patrimoine items that aren't caught by isAbfRelated */
function isHeritageRelated(props: Record<string, unknown> | undefined): boolean {
  if (!props) return false;
  const cat = String(props.categorie ?? props.CATEGORIE ?? props.suptype ?? props.type_sup ?? "").toUpperCase();
  const lib = String(props.libelle ?? props.LIBELLE ?? props.nomsuplitt ?? props.nom ?? "").toLowerCase();
  const typeass = String(props.typeass ?? "").toLowerCase();
  if (cat.startsWith("AC2") || cat.startsWith("AC4")) return true;
  if (typeass.includes("abords") || typeass.includes("patrimoin")) return true;
  if (lib.includes("patrimonial") || lib.includes("patrimoine") || lib.includes("site patrimonial") || lib.includes("site inscrit") || lib.includes("site classé") || lib.includes("périmètre de protection") || lib.includes("abords")) return true;
  return false;
}

/** Haversine distance in metres between two lat/lng points. */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

    // ── Run ALL external API calls in PARALLEL ──────────────────────────
    const [
      prescSurfResult,
      prescLinResult,
      prescPctResult,
      supSResult,
      supLResult,
      supPResult,
      riskResult,
    ] = await Promise.allSettled([
      // GPU prescription layers
      fetchGpuByGeom("prescription-surf", lng, lat),
      fetchGpuByGeom("prescription-lin", lng, lat),
      fetchGpuByGeom("prescription-pct", lng, lat),
      // GPU SUP layers — these contain AC1 (MH perimeters), AC2, AC4, PM1, etc.
      fetchGpuByGeom("assiette-sup-s", lng, lat),
      fetchGpuByGeom("assiette-sup-l", lng, lat),
      fetchGpuByGeom("assiette-sup-p", lng, lat),
      // Géorisques
      fetch(
        `https://georisques.gouv.fr/api/v1/resultats_rapport_risques?latlon=${lat},${lng}`,
        { signal: AbortSignal.timeout(API_TIMEOUT) }
      ).then(async r => r.ok ? JSON.parse(await r.text()) : null).catch(() => null),
    ]);

    // ── Process prescription results ──────────────────────────────────
    const prescResults = [prescSurfResult, prescLinResult, prescPctResult];
    const prescPaths = ["prescription-surf", "prescription-lin", "prescription-pct"];
    for (let i = 0; i < prescResults.length; i++) {
      const result = prescResults[i];
      if (result.status !== "fulfilled") continue;
      const features = result.value as unknown[];
      for (const f of features.slice(0, 10)) {
        const props = (f as { properties?: Record<string, unknown> })?.properties ?? {};
        const name = (props.libelle ?? props.LIBELLE ?? props.nom ?? prescPaths[i]) as string;
        if (!name) continue;
        const desc = (props.libelong ?? props.LIBELLONG ?? props.description) as string;
        const cat = String(props.categorie ?? props.CATEGORIE ?? "").toUpperCase().trim();
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
            categorie: cat || undefined,
          });
        } else if (isRiskRelated(props)) {
          addArea({
            type: "FLOOD_ZONE",
            name: String(name),
            description: desc || "Zone de risque naturel/technologique. Des contraintes spécifiques s'appliquent.",
            distance: null,
            constraints: [
              "Construction may be restricted or conditioned",
              "Check PPRI/PPRT specific rules",
            ],
            sourceUrl: "https://www.geoportail-urbanisme.gouv.fr/",
            severity: "high",
            categorie: cat || undefined,
          });
        } else if (isHeritageRelated(props)) {
          addArea({
            type: "HERITAGE",
            name: String(name),
            description: desc || "Zone patrimoine. Des obligations spécifiques peuvent s'appliquer.",
            distance: null,
            constraints: [
              "Heritage protection constraints may apply",
              "Check with ABF or local authorities",
            ],
            sourceUrl: "https://www.geoportail-urbanisme.gouv.fr/",
            severity: "high",
            categorie: cat || undefined,
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
            categorie: cat || undefined,
          });
        }
      }
    }

    // ── Process SUP results ───────────────────────────────────────────
    const supResults = [supSResult, supLResult, supPResult];
    const supPaths = ["assiette-sup-s", "assiette-sup-l", "assiette-sup-p"];
    for (let i = 0; i < supResults.length; i++) {
      const result = supResults[i];
      if (result.status !== "fulfilled") continue;
      const features = result.value as unknown[];
      for (const f of features.slice(0, 15)) {
        const props = (f as { properties?: Record<string, unknown> })?.properties ?? {};
        // GPU SUP fields: nomsuplitt = monument name, suptype = AC1/PM1/etc, typeass = perimeter type
        const rawName = (props.libelle ?? props.LIBELLE ?? props.nomsuplitt ?? props.nom ?? props.type_sup ?? supPaths[i]) as string;
        if (!rawName) continue;
        const supCat = String(props.categorie ?? props.CATEGORIE ?? props.suptype ?? props.type_sup ?? "").toUpperCase().trim();
        const monumentName = String(props.nomsuplitt ?? "").trim();
        const typeass = String(props.typeass ?? "").toLowerCase();

        if (isAbfRelated(props)) {
          // AC1 = Monument Historique perimeter — use the actual monument name
          const displayName = monumentName || rawName;
          const isPerimetre = typeass.includes("abords") || typeass.includes("périmètre");
          addArea({
            type: "ABF",
            name: `Monument Historique: ${displayName}`,
            description: isPerimetre
              ? `Périmètre des abords de ${displayName}. Approval from the Architecte des Bâtiments de France (ABF) is required for any modification.`
              : `Monument Historique — ${displayName}. ABF approval required.`,
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
            categorie: supCat || undefined,
          });
        } else if (isRiskRelated(props)) {
          addArea({
            type: "FLOOD_ZONE",
            name: `SUP – ${String(rawName)}`,
            description: "Servitude de risque naturel/technologique. Des contraintes spécifiques s'appliquent.",
            distance: null,
            constraints: ["Construction may be restricted", "Check PPRI/PPRT rules"],
            sourceUrl: "https://www.geoportail-urbanisme.gouv.fr/",
            severity: "high",
            categorie: supCat || undefined,
          });
        } else if (isHeritageRelated(props)) {
          const displayName = monumentName || rawName;
          addArea({
            type: "HERITAGE",
            name: `Patrimoine: ${displayName}`,
            description: `Zone de patrimoine protégé — ${displayName}. Des obligations spécifiques peuvent s'appliquer.`,
            distance: null,
            constraints: ["Heritage protection constraints may apply", "Check with ABF or local authorities"],
            sourceUrl: "https://www.geoportail-urbanisme.gouv.fr/",
            severity: "high",
            categorie: supCat || undefined,
          });
        } else {
          addArea({
            type: "SUP",
            name: `SUP – ${String(rawName)}`,
            description: "Servitude d'utilité publique. Des obligations spécifiques peuvent s'appliquer.",
            distance: null,
            constraints: ["Check with local authorities for specific requirements"],
            sourceUrl: "https://www.geoportail-urbanisme.gouv.fr/",
            severity: "medium",
            categorie: supCat || undefined,
          });
        }
      }
    }

    // ── Process Géorisques ────────────────────────────────────────────
    if (riskResult.status === "fulfilled" && riskResult.value) {
      const riskData = riskResult.value as { data?: Record<string, unknown> };
      if (riskData.data) {
        if (riskData.data.risques_inondation) {
          areas.push({
            type: "FLOOD_ZONE",
            name: "Zone inondable",
            description: "The parcel is located in a flood risk zone (PPRI). Specific construction rules apply.",
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

    // ── Commune fallback if nothing found ─────────────────────────────
    if (areas.length === 0 && citycode) {
      try {
        const communeRes = await fetch(
          `https://geo.api.gouv.fr/communes/${citycode}?fields=population,surface`,
          { signal: AbortSignal.timeout(3000) }
        );
        if (communeRes.ok) {
          const commune = await communeRes.json();
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
      } catch {
        // ignore
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

    // ── Build heritage summary ─────────────────────────────────────────
    const heritageAreas = areas.filter(
      (a) => a.type === "ABF" || a.type === "HERITAGE"
    );
    // Find nearest monument — works for both MH API results and GPU AC1 SUPs
    const nearestMH = heritageAreas
      .filter((a) => a.type === "ABF" && a.name.startsWith("Monument Historique"))
      .sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999))[0] ?? null;

    const heritageTypes = [...new Set(heritageAreas.map((a) => {
      const cat = (a.categorie ?? "").toUpperCase();
      if (cat.startsWith("AC1") || a.name.includes("Monument Historique")) return "MH_PERIMETRE";
      if (cat.startsWith("AC2")) return "SITE_CLASSE";
      if (cat.startsWith("AC4")) return "ZPPA";
      if (a.name.includes("Site Patrimonial Remarquable")) return "SPR";
      if (a.name.includes("Site Classé")) return "SITE_CLASSE";
      if (a.name.includes("Site Inscrit")) return "SITE_INSCRIT";
      return a.type;
    }))].filter(Boolean);

    const heritageSummary = {
      inHeritageZone: heritageAreas.length > 0,
      requiresABF: heritageAreas.some(
        (a) => a.type === "ABF" || a.name.includes("ABF") || a.name.includes("Monument Historique") || a.name.includes("Site Patrimonial")
      ),
      nearestMonument: nearestMH
        ? {
            name: nearestMH.name.replace(/^Monument Historique:\s*/, ""),
            distance: nearestMH.distance,
            type: "classé" as const,
          }
        : null,
      heritageTypes,
      detectedZones: heritageAreas.map((a) => ({
        type: a.type,
        name: a.name,
        distance: a.distance,
      })),
    };

    return NextResponse.json({
      success: true,
      areas,
      heritageSummary,
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
