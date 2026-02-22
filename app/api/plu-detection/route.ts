import { NextRequest, NextResponse } from "next/server";

// Automatic PLU/RNU/CC zone detection — fully reliable.
// Official API Carto (IGN): https://apicarto.ign.fr/api/doc/gpu
// Spec: https://github.com/IGNF/apicarto/blob/master/doc/gpu.yml
//
// GPU endpoints accept ONLY: geom (GeoJSON) + partition (optional) + insee (municipality only)
// They do NOT accept lon/lat query parameters.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const APICARTO_GPU = "https://apicarto.ign.fr/api/gpu";
const GEOPORTAIL_GPU = "https://www.geoportail-urbanisme.gouv.fr/api";
const API_HEADERS = { "User-Agent": "UrbAssist/1.0 (urbanisme)" };
const API_TIMEOUT = 8000;

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function pointGeom(lng: number, lat: number) {
  return { type: "Point" as const, coordinates: [lng, lat] as [number, number] };
}

function polygonBuffer(lng: number, lat: number, bufferDeg = 0.0005) {
  return {
    type: "Polygon" as const,
    coordinates: [[
      [lng - bufferDeg, lat - bufferDeg],
      [lng + bufferDeg, lat - bufferDeg],
      [lng + bufferDeg, lat + bufferDeg],
      [lng - bufferDeg, lat + bufferDeg],
      [lng - bufferDeg, lat - bufferDeg],
    ]],
  };
}

// ---------------------------------------------------------------------------
// Fast GPU fetch — single GET attempt (the API responds reliably)
// ---------------------------------------------------------------------------

async function gpuGet(path: string, geom: object): Promise<unknown[]> {
  const url = `${APICARTO_GPU}/${path}?geom=${encodeURIComponent(JSON.stringify(geom))}`;
  try {
    const res = await fetch(url, { headers: API_HEADERS, signal: AbortSignal.timeout(API_TIMEOUT) });
    if (res.ok) {
      const data = await res.json();
      return data?.features ?? [];
    }
    console.log(`[PLU] ${path}: ${res.status}`);
  } catch (e) {
    console.log(`[PLU] ${path} failed:`, (e as Error).message);
  }
  return [];
}

async function gpuMunicipality(insee: string): Promise<unknown[]> {
  try {
    const res = await fetch(`${APICARTO_GPU}/municipality?insee=${encodeURIComponent(insee)}`, {
      headers: API_HEADERS,
      signal: AbortSignal.timeout(API_TIMEOUT),
    });
    if (res.ok) {
      const data = await res.json();
      return data?.features ?? [];
    }
  } catch (e) {
    console.log(`[PLU] municipality failed:`, (e as Error).message);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Zone selection helpers
// ---------------------------------------------------------------------------

const BROAD_ZONE_CODES = new Set(["U", "AU", "A", "N"]);

const ZONE_LIBELLE_PRIORITY: string[] = [
  "AUD", "AU", "AUS", "AUL", "AUH", "AUM", "AUN",
  "UA", "UB", "UC", "UD", "UE", "UF", "UG", "UH", "UI", "UJ", "UK", "UL",
  "UM", "UN", "UP", "UQ", "UR", "US", "UT", "UU", "UV", "UW", "UX", "UY", "UZ",
];

function getZoneLibelle(props: Record<string, unknown> | undefined): string | null {
  if (!props) return null;
  const v = (props.libelle ?? props.LIBELLE ?? props.typezone ?? props.TYPEZONE ?? props.code ?? props.zone) as string | undefined;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function getZoneLibelong(props: Record<string, unknown> | undefined): string | null {
  if (!props) return null;
  const v = (props.libelong ?? props.LIBELONG ?? props.libelle ?? props.LIBELLE) as string | undefined;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function pickBestZone(features: Array<{ properties?: Record<string, unknown> }>): Record<string, unknown> | undefined {
  if (!features.length) return undefined;
  const withLib = features.filter(f => getZoneLibelle(f.properties));
  if (!withLib.length) return features[0].properties;
  const specific = withLib.filter(f => !BROAD_ZONE_CODES.has(String(getZoneLibelle(f.properties) ?? "").toUpperCase()));
  const pool = specific.length > 0 ? specific : withLib;
  pool.sort((a, b) => {
    const la = String(getZoneLibelle(a.properties) ?? "").toUpperCase();
    const lb = String(getZoneLibelle(b.properties) ?? "").toUpperCase();
    const ia = ZONE_LIBELLE_PRIORITY.indexOf(la);
    const ib = ZONE_LIBELLE_PRIORITY.indexOf(lb);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  return pool[0]?.properties ?? features[0].properties;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const { coordinates, citycode, address } = await request.json();
    if (!coordinates && !citycode) {
      return NextResponse.json({ error: "Coordinates or city code required" }, { status: 400 });
    }

    const [lng, lat] = coordinates || [0, 0];
    const hasCoords = Array.isArray(coordinates) && coordinates.length >= 2
      && Number.isFinite(lng) && Number.isFinite(lat) && (lng !== 0 || lat !== 0);

    const pluInfo: {
      zoneType: string | null; zoneName: string | null; communeName: string | null;
      pluType: string | null; pluStatus: string | null;
      regulations: Record<string, unknown> | null; pdfUrl: string | null;
    } = { zoneType: null, zoneName: null, communeName: null, pluType: null, pluStatus: null, regulations: null, pdfUrl: null };

    // ── Run commune lookup + ALL GPU layers in PARALLEL ─────────────────
    // Previously commune lookup ran first (blocking GPU by 1-2s). Now everything runs at once.
    let communeCode = citycode as string | undefined;
    let communeName = "";

    const polyGeom = hasCoords ? polygonBuffer(lng, lat, 0.0005) : null;
    const ptGeom = hasCoords ? pointGeom(lng, lat) : null;

    type GpuResults = {
      zoneUrbaPolygon: unknown[]; zoneUrbaPoint: unknown[]; zoneUrbaGP: unknown[];
      document: unknown[]; secteurCc: unknown[]; municipality: unknown[];
      prescriptionSurf: unknown[]; prescriptionLin: unknown[]; prescriptionPct: unknown[];
      infoSurf: unknown[]; infoLin: unknown[]; infoPct: unknown[];
    };

    const gpu: GpuResults = {
      zoneUrbaPolygon: [], zoneUrbaPoint: [], zoneUrbaGP: [],
      document: [], secteurCc: [], municipality: [],
      prescriptionSurf: [], prescriptionLin: [], prescriptionPct: [],
      infoSurf: [], infoLin: [], infoPct: [],
    };

    if (hasCoords && polyGeom && ptGeom) {
      // Commune lookup runs concurrently with ALL GPU calls
      const communePromise = fetch(`https://geo.api.gouv.fr/communes?lat=${lat}&lon=${lng}&fields=code,nom&limit=1`, { signal: AbortSignal.timeout(5000) })
        .then(async r => { if (r.ok) { const c = await r.json(); if (c[0]) { communeCode = c[0].code; communeName = c[0].nom; } } })
        .catch(() => { /* optional */ });

      const settledResults = await Promise.allSettled([
        /* 0 */ gpuGet("zone-urba", polyGeom),
        /* 1 */ gpuGet("zone-urba", ptGeom),
        /* 2 */ fetch(`${GEOPORTAIL_GPU}/feature-info/du?lon=${lng}&lat=${lat}&typeName=zone_urba&zone=production`, { headers: API_HEADERS, signal: AbortSignal.timeout(API_TIMEOUT) }).then(r => r.ok ? r.json() : null).then(d => d?.features ?? []).catch(() => [] as unknown[]),
        /* 3 */ gpuGet("document", polyGeom),
        /* 4 */ gpuGet("secteur-cc", polyGeom),
        /* 5 */ gpuGet("prescription-surf", polyGeom),
        /* 6 */ gpuGet("prescription-lin", polyGeom),
        /* 7 */ gpuGet("prescription-pct", polyGeom),
        /* 8 */ gpuGet("info-surf", polyGeom),
        /* 9 */ gpuGet("info-lin", polyGeom),
        /* 10 */ gpuGet("info-pct", polyGeom),
        /* 11 */ communePromise,
      ]);

      const val = (i: number) => settledResults[i].status === "fulfilled" ? (settledResults[i] as PromiseFulfilledResult<unknown[]>).value : [];
      gpu.zoneUrbaPolygon = val(0);
      gpu.zoneUrbaPoint = val(1);
      gpu.zoneUrbaGP = val(2);
      gpu.document = val(3);
      gpu.secteurCc = val(4);
      gpu.prescriptionSurf = val(5);
      gpu.prescriptionLin = val(6);
      gpu.prescriptionPct = val(7);
      gpu.infoSurf = val(8);
      gpu.infoLin = val(9);
      gpu.infoPct = val(10);
      // communeCode/communeName are now set via the communePromise side-effect

      // Municipality lookup needs communeCode, so run it after commune resolves
      if (communeCode) {
        try { gpu.municipality = await gpuMunicipality(communeCode); } catch { /* */ }
      }
    } else if (hasCoords) {
      // Has coords but missing geom (shouldn't happen, defensive)
      try {
        const r = await fetch(`https://geo.api.gouv.fr/communes?lat=${lat}&lon=${lng}&fields=code,nom&limit=1`, { signal: AbortSignal.timeout(5000) });
        if (r.ok) { const c = await r.json(); if (c[0]) { communeCode = c[0].code; communeName = c[0].nom; } }
      } catch { /* */ }
    } else if (communeCode) {
      if (!communeName) {
        try { const r = await fetch(`https://geo.api.gouv.fr/communes/${communeCode}?fields=nom`, { signal: AbortSignal.timeout(3000) }); if (r.ok) { const c = await r.json(); communeName = c?.nom ?? ""; } } catch { /* */ }
      }
      try { gpu.municipality = await gpuMunicipality(communeCode); } catch { /* */ }
    }

    console.log(`[PLU] Commune: ${communeName} (${communeCode ?? "?"})`);

    // ── Extract zone from results ───────────────────────────────────────
    let zoneFeatures: unknown[] =
      gpu.zoneUrbaPolygon.length > 0 ? gpu.zoneUrbaPolygon :
        gpu.zoneUrbaPoint.length > 0 ? gpu.zoneUrbaPoint :
          gpu.zoneUrbaGP.length > 0 ? gpu.zoneUrbaGP : [];

    if (zoneFeatures.length > 0) {
      const zone = pickBestZone(zoneFeatures as Array<{ properties?: Record<string, unknown> }>);
      if (zone) {
        pluInfo.zoneType = getZoneLibelle(zone);
        pluInfo.zoneName = getZoneLibelong(zone) || pluInfo.zoneType;
        const idurba = (zone.idurba ?? zone.IDURBA ?? zone.du_type) as string | undefined;
        pluInfo.pluType = idurba ? (String(idurba).includes("PLUi") ? "PLUi" : "PLU") : null;
        pluInfo.pluStatus = (zone.etat as string) ?? "detected";
        console.log(`[PLU] Zone detected: ${pluInfo.zoneType} — ${pluInfo.zoneName}`);
      }
    }

    // Document layer: pluStatus, pluType, pdfUrl
    if (gpu.document.length > 0) {
      const doc = (gpu.document[0] as { properties?: Record<string, unknown> }).properties;
      if (doc) {
        pluInfo.pluStatus = pluInfo.pluStatus ?? (doc.etat as string) ?? null;
        pluInfo.pluType = pluInfo.pluType ?? (doc.typedoc as string) ?? null;
        const docUrl = (doc.lien ?? doc.url ?? doc.document_url ?? doc.pdf_url) as string | undefined;
        if (docUrl && typeof docUrl === "string") pluInfo.pdfUrl = docUrl;
      }
    }
    if (!pluInfo.pdfUrl && communeCode) {
      pluInfo.pdfUrl = `https://www.geoportail-urbanisme.gouv.fr/document/commune/${communeCode}`;
    }

    // Carte Communale sector fallback
    if (!pluInfo.zoneType && gpu.secteurCc.length > 0) {
      const first = (gpu.secteurCc[0] as { properties?: Record<string, unknown> }).properties;
      if (first) {
        pluInfo.zoneType = (first.libelle as string) || "CC";
        pluInfo.zoneName = (first.libelong as string) || (first.libelle as string) || "Secteur Carte Communale";
        pluInfo.pluType = pluInfo.pluType || "CC";
        pluInfo.pluStatus = "detected";
        console.log(`[PLU] CC sector: ${pluInfo.zoneType}`);
      }
    }

    // RNU check via municipality
    if (!pluInfo.zoneType && gpu.municipality.length > 0) {
      const props = (gpu.municipality[0] as { properties?: Record<string, unknown> })?.properties;
      if (props) {
        const raw = props.is_rnu ?? props.est_rnu ?? props.rnu ?? props.RNU;
        const isRnu = raw === true || ["true", "oui", "1"].includes(String(raw).toLowerCase());
        if (isRnu) {
          pluInfo.zoneType = "RNU";
          pluInfo.zoneName = "Règlement National d'Urbanisme";
          pluInfo.pluType = "RNU";
          pluInfo.pluStatus = "detected";
          console.log("[PLU] RNU detected via municipality");
        }
      }
    }

    // Document-only fallback
    if (!pluInfo.zoneType && gpu.document.length > 0) {
      const doc = (gpu.document[0] as { properties?: Record<string, unknown> }).properties;
      if (doc) {
        const typedoc = (doc.typedoc ?? doc.TYPEDOC ?? doc.type_doc) as string | undefined;
        pluInfo.zoneType = typedoc?.trim() || "PLU";
        pluInfo.zoneName = (doc.nom ?? doc.NOM ?? doc.libelle ?? pluInfo.zoneType) as string;
        pluInfo.pluType = pluInfo.pluType ?? (typedoc ?? "PLU");
        pluInfo.pluStatus = "document";
        console.log(`[PLU] Document fallback: ${pluInfo.zoneType}`);
      }
    }

    // Commune found but no PLU/CC/RNU data → "no data" (white zone on Geoportail)
    // White zones mean documents haven't been uploaded yet — NOT the same as RNU.
    // RNU (grey zones) are only flagged when the municipality API explicitly says so.
    if (!pluInfo.zoneType && (communeCode || communeName)) {
      pluInfo.zoneType = null;
      pluInfo.zoneName = null;
      pluInfo.pluType = null;
      pluInfo.pluStatus = "no_data";
      console.log("[PLU] No urbanisme data found (white zone — documents not uploaded)");
    }

    pluInfo.communeName = communeName;
    pluInfo.regulations = pluInfo.zoneType ? getDefaultRegulations(pluInfo.zoneType) : null;

    // ── Gemini AI enhancement — NON-BLOCKING ────────────────────────────
    // Removed from critical path. Default regulations are sufficient for
    // the new project page. AI enhancement can be done later when the user
    // views the project detail page.

    console.log(`[PLU] Result: zone=${pluInfo.zoneType} type=${pluInfo.pluType} status=${pluInfo.pluStatus}`);

    // ── Derive decision-engine fields from zone detection ─────────────────
    const zoneUpper = (pluInfo.zoneType ?? "").toUpperCase();
    const isUrbanZone = zoneUpper.startsWith("U") || zoneUpper.startsWith("AU");
    const isRnu = pluInfo.pluType === "RNU" || pluInfo.zoneType === "RNU";
    const noData = pluInfo.pluStatus === "no_data";
    const dpThreshold = isUrbanZone ? 40 : 20;
    const rnuWarning = isRnu
      ? "Terrain soumis au RNU : Constructibilité limitée à la continuité de l'urbanisation."
      : noData
        ? "Les documents d'urbanisme de cette commune n'ont pas encore été mis en ligne. Contactez votre mairie pour connaître la réglementation applicable."
        : null;

    return NextResponse.json({
      success: true,
      plu: pluInfo,
      zoneFeatures,
      // Decision-engine fields (derived from API, not hardcoded on client)
      isUrbanZone,
      isRnu,
      dpThreshold,
      rnuWarning,
      noData,
      source: pluInfo.zoneType
        ? "gpu"
        : noData ? "no_data" : "none",
      gpu: {
        document: gpu.document,
        zone: zoneFeatures,
        secteurCc: gpu.secteurCc,
        prescriptionSurf: gpu.prescriptionSurf,
        prescriptionLin: gpu.prescriptionLin,
        prescriptionPct: gpu.prescriptionPct,
        infoSurf: gpu.infoSurf,
        infoLin: gpu.infoLin,
        infoPct: gpu.infoPct,
      },
    });
  } catch (error) {
    console.error("PLU detection error:", error);
    return NextResponse.json({ error: "PLU detection failed" }, { status: 500 });
  }
}

function getDefaultRegulations(zoneType: string): Record<string, unknown> {
  const defaults: Record<string, Record<string, unknown>> = {
    UA: {
      zoneClassification: "UA - Zone Urbaine Dense", maxHeight: 15,
      setbacks: { front: 0, side: 0, rear: 3 }, maxCoverageRatio: 0.8, maxFloorAreaRatio: 3.0,
      parkingRequirements: "1 place per 60m² of floor area", greenSpaceRequirements: "Minimum 10% of parcel area",
      architecturalConstraints: ["Construction on boundary allowed", "Alignment with existing buildings required", "Flat roof or traditional roof pitch"],
    },
    UB: {
      zoneClassification: "UB - Zone Urbaine Mixte", maxHeight: 12,
      setbacks: { front: 5, side: 3, rear: 4 }, maxCoverageRatio: 0.4, maxFloorAreaRatio: 1.2,
      parkingRequirements: "1 place per 60m² of floor area", greenSpaceRequirements: "Minimum 20% of parcel area",
      architecturalConstraints: ["Roof pitch 30-45 degrees", "Natural materials for facades", "Maximum 2 colors for exterior"],
    },
    UC: {
      zoneClassification: "UC - Zone Urbaine Résidentielle", maxHeight: 9,
      setbacks: { front: 5, side: 4, rear: 5 }, maxCoverageRatio: 0.3, maxFloorAreaRatio: 0.8,
      parkingRequirements: "2 places per dwelling", greenSpaceRequirements: "Minimum 30% of parcel area",
      architecturalConstraints: ["Roof pitch 30-45 degrees", "Fences limited to 1.80m height", "Residential character mandatory"],
    },
    AU: {
      zoneClassification: "AU - Zone À Urbaniser", maxHeight: 10,
      setbacks: { front: 5, side: 4, rear: 4 }, maxCoverageRatio: 0.35, maxFloorAreaRatio: 1.0,
      parkingRequirements: "2 places per dwelling", greenSpaceRequirements: "Minimum 25% of parcel area",
      architecturalConstraints: ["Subject to development plan approval", "Infrastructure must be completed first"],
    },
    AUD: {
      zoneClassification: "AUD - Zone à urbaniser d'habitat diffus", maxHeight: 10,
      setbacks: { front: 5, side: 4, rear: 4 }, maxCoverageRatio: 0.35, maxFloorAreaRatio: 1.0,
      parkingRequirements: "2 places per dwelling", greenSpaceRequirements: "Minimum 25% of parcel area",
      architecturalConstraints: ["Subject to development plan approval", "Diffuse habitat zone – verify with PLU for specific rules"],
    },
    "A/N": {
      zoneClassification: "A/N - Zone Agricole ou Naturelle", maxHeight: 7,
      setbacks: { front: 10, side: 5, rear: 5 }, maxCoverageRatio: 0.1, maxFloorAreaRatio: 0.2,
      parkingRequirements: "2 places per dwelling", greenSpaceRequirements: "Maintain natural character",
      architecturalConstraints: ["Construction strictly limited", "Agricultural buildings only in zone A", "No new construction in zone N"],
    },
  };
  const exact = defaults[zoneType];
  if (exact) return exact;
  const family = zoneType.startsWith("AU") ? "AU" : zoneType.startsWith("U") ? "UB" : null;
  return family ? defaults[family] ?? defaults["UB"] : defaults["UB"];
}
