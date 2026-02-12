import { NextRequest, NextResponse } from "next/server";

// Automatic PLU/PLUi Zone Detection from address
// Uses all GPU endpoints (Documents d'urbanisme: PLU, POS, CC, PSMV):
//   - zone-urba: official GPU then API Carto. Secteur-cc for CC when no PLU zone.
//   - document, secteur-cc, prescription-surf/lin/pct, info-surf/lin/pct via API Carto (lon/lat).
// https://www.geoportail-urbanisme.gouv.fr/api and https://apicarto.ign.fr/api/doc/gpu

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GPU_BASE = "https://www.geoportail-urbanisme.gouv.fr/api";
const APICARTO_GPU = "https://apicarto.ign.fr/api/gpu";

/** GPU layer paths (lon/lat query). */
const GPU_LAYERS = [
  "document",
  "zone-urba",
  "secteur-cc",
  "prescription-surf",
  "prescription-lin",
  "prescription-pct",
  "info-surf",
  "info-lin",
  "info-pct",
] as const;

const POINT_GEOM = (lng: number, lat: number) =>
  JSON.stringify({ type: "Point", coordinates: [lng, lat] });

const API_HEADERS = { "User-Agent": "UrbAssist/1.0 (urbanisme)" };
const API_TIMEOUT = 12000;

/** API Carto GPU: intersection géométrique. Try GET lon/lat first (most reliable), then POST geom, then GET geom. */
async function fetchGpuLayer(
  baseUrl: string,
  path: string,
  lng: number,
  lat: number
): Promise<unknown[]> {
  const geom = { type: "Point" as const, coordinates: [lng, lat] };

  // 1. GET lon/lat (simplest; API Carto doc supports "par attribut" and "par intersection")
  try {
    const res = await fetch(`${baseUrl}/${path}?lon=${lng}&lat=${lat}`, {
      headers: API_HEADERS,
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

  // 2. POST with geom
  try {
    const res = await fetch(`${baseUrl}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...API_HEADERS },
      body: JSON.stringify({ geom }),
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

  // 3. POST with body = raw geometry (some clients send this)
  try {
    const res = await fetch(`${baseUrl}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...API_HEADERS },
      body: JSON.stringify(geom),
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

  // 4. GET geom (URL-encoded GeoJSON)
  try {
    const geomParam = encodeURIComponent(POINT_GEOM(lng, lat));
    const res = await fetch(`${baseUrl}/${path}?geom=${geomParam}`, {
      headers: API_HEADERS,
      signal: AbortSignal.timeout(API_TIMEOUT),
    });
    if (res.ok) {
      const data = await res.json();
      const features = data?.features ?? [];
      if (features.length > 0) return features;
    }
  } catch {
    // ignore
  }
  return [];
}

/** Broad category codes only (CNIG typezone). */
const BROAD_ZONE_CODES = new Set(["U", "AU", "A", "N"]);

/**
 * Priority order for zone libelle when multiple specific zones overlap (e.g. AUD vs Uj).
 * Lower index = higher priority. AUD (zone à urbaniser diffuse) preferred over Uj (urbaine loisirs).
 */
const ZONE_LIBELLE_PRIORITY: string[] = [
  "AUD", // Zone à urbaniser d'habitat diffus — often the actual applicable zone when overlapping U
  "AU", "AUS", "AUL", "AUH", "AUM", "AUN", // other AU
  "UA", "UB", "UC", "UD", "UE", "UF", "UG", "UH", "UI", "UJ", "UK", "UL", "UM", "UN", "UP", "UQ", "UR", "US", "UT", "UU", "UV", "UW", "UX", "UY", "UZ", // U sub-types
];

function libellePriority(libelle: string): number {
  const upper = libelle.trim().toUpperCase();
  const i = ZONE_LIBELLE_PRIORITY.indexOf(upper);
  return i === -1 ? ZONE_LIBELLE_PRIORITY.length : i;
}

/** Get zone code from feature properties (API Carto and Geoportail may use different keys). */
function getZoneLibelle(props: Record<string, unknown> | undefined): string | null {
  if (!props) return null;
  const v =
    (props.libelle as string) ??
    (props.LIBELLE as string) ??
    (props.typezone as string) ??
    (props.TYPESZONE as string) ??
    (props.code as string) ??
    (props.zone as string);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Get zone long name from feature properties. */
function getZoneLibelong(props: Record<string, unknown> | undefined): string | null {
  if (!props) return null;
  const v =
    (props.libelong as string) ??
    (props.LIBELLONG as string) ??
    (props.libelle as string) ??
    (props.LIBELLE as string);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * When the API returns multiple zone features at a point, pick the best applicable zone:
 * - Exclude broad codes (U, AU, A, N) when a more specific code exists.
 * - Prefer AUD over Uj (and AU-type over U-type) when both are present.
 */
function pickBestZoneFeature(
  features: Array<{ properties?: Record<string, unknown> }>
): { properties?: Record<string, unknown> } | null {
  if (!features.length) return null;
  const withLibelle = features.filter((f) => getZoneLibelle(f.properties));
  if (withLibelle.length === 0) return features[0];
  const specific = withLibelle.filter(
    (f) => !BROAD_ZONE_CODES.has(String(getZoneLibelle(f.properties) ?? "").toUpperCase())
  );
  if (specific.length === 0) return withLibelle[0] ?? features[0];
  const best = specific.sort(
    (a, b) =>
      libellePriority(String(getZoneLibelle(a.properties) ?? "")) -
      libellePriority(String(getZoneLibelle(b.properties) ?? ""))
  )[0];
  return best ?? specific[0] ?? features[0];
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
    let pluInfo: {
      zoneType: string | null;
      zoneName: string | null;
      communeName: string | null;
      pluType: string | null;
      pluStatus: string | null;
      regulations: Record<string, unknown> | null;
      pdfUrl: string | null;
    } = {
      zoneType: null,
      zoneName: null,
      communeName: null,
      pluType: null,
      pluStatus: null,
      regulations: null,
      pdfUrl: null,
    };

    // Step 1: Get commune information
    let communeCode = citycode;
    let communeName = "";

    if (coordinates) {
      try {
        const communeRes = await fetch(
          `https://geo.api.gouv.fr/communes?lat=${lat}&lon=${lng}&fields=code,nom,departement,population&limit=1`
        );
        if (communeRes.ok) {
          const communes = await communeRes.json();
          if (communes[0]) {
            communeCode = communes[0].code;
            communeName = communes[0].nom;
          }
        }
      } catch (e) {
        console.log("Commune lookup failed:", e);
      }
    }

    // Step 2: Zone from GPU — Geoportail feature-info/du (official) and API Carto zone-urba
    let zoneFeatures: unknown[] = [];
    // 2a. Geoportail API: /feature-info/du with typeName=zone_urba (lon, lat required per swagger)
    const geoportailUrl = `${GPU_BASE}/feature-info/du?lon=${lng}&lat=${lat}&typeName=zone_urba&zone=production`;
    try {
      const gpuRes = await fetch(geoportailUrl, {
        headers: API_HEADERS,
        signal: AbortSignal.timeout(API_TIMEOUT),
      });
      if (gpuRes.ok) {
        const gpuData = await gpuRes.json();
        if (gpuData.features && gpuData.features.length > 0) {
          zoneFeatures = gpuData.features;
        }
      }
    } catch {
      // continue to API Carto
    }
    // 2b. API Carto (IGN) zone-urba if Geoportail returned nothing
    if (zoneFeatures.length === 0) {
      zoneFeatures = await fetchGpuLayer(APICARTO_GPU, "zone-urba", lng, lat) as unknown[];
    }
    if (zoneFeatures.length > 0) {
      const features = zoneFeatures as Array<{ properties?: Record<string, unknown> }>;
      const zone = pickBestZoneFeature(features)?.properties ?? features[0].properties;
      if (zone) {
        pluInfo.zoneType = getZoneLibelle(zone) ?? null;
        pluInfo.zoneName = getZoneLibelong(zone) || pluInfo.zoneType;
        const idurba = (zone.idurba ?? zone.IDURBA ?? zone.du_type) as string | undefined;
        pluInfo.pluType = idurba
          ? String(idurba).includes("PLUi")
            ? "PLUi"
            : "PLU"
          : null;
        pluInfo.pluStatus = pluInfo.pluStatus ?? (zone.etat as string) ?? "detected";
      }
    }

    // Step 2a: Check municipality for RNU (Règlement National d'Urbanisme) — prefer code_insee when available
    if (!pluInfo.zoneType && communeCode) {
      const munUrls: string[] = [
        `${APICARTO_GPU}/municipality?code_insee=${communeCode}`,
        `${APICARTO_GPU}/municipality?lon=${lng}&lat=${lat}`,
        `${APICARTO_GPU}/municipality?geom=${encodeURIComponent(POINT_GEOM(lng, lat))}`,
      ];
      for (const url of munUrls) {
        try {
          const munRes = await fetch(url, { signal: AbortSignal.timeout(6000) });
          if (munRes.ok) {
            const munData = await munRes.json();
            const munFeatures = munData?.features ?? [];
            if (munFeatures.length > 0) {
              const props = (munFeatures[0] as { properties?: Record<string, unknown> })?.properties;
              const raw = props?.est_rnu ?? props?.rnu ?? props?.RNU;
              const isRnu =
                raw === true ||
                String(raw).toLowerCase() === "true" ||
                String(raw).toLowerCase() === "oui";
              if (isRnu) {
                pluInfo.zoneType = "RNU";
                pluInfo.zoneName = "Règlement National d'Urbanisme";
                pluInfo.pluType = "RNU";
                pluInfo.pluStatus = pluInfo.pluStatus ?? "detected";
                break;
              }
            }
          }
        } catch {
          // try next URL
        }
      }
    }

    // Step 2b: Fetch all other GPU layers (document, secteur-cc, prescriptions, info) from API Carto
    const [
      documentFeatures,
      secteurCcFeatures,
      prescriptionSurfFeatures,
      prescriptionLinFeatures,
      prescriptionPctFeatures,
      infoSurfFeatures,
      infoLinFeatures,
      infoPctFeatures,
    ] = await Promise.all([
      fetchGpuLayer(APICARTO_GPU, "document", lng, lat),
      fetchGpuLayer(APICARTO_GPU, "secteur-cc", lng, lat),
      fetchGpuLayer(APICARTO_GPU, "prescription-surf", lng, lat),
      fetchGpuLayer(APICARTO_GPU, "prescription-lin", lng, lat),
      fetchGpuLayer(APICARTO_GPU, "prescription-pct", lng, lat),
      fetchGpuLayer(APICARTO_GPU, "info-surf", lng, lat),
      fetchGpuLayer(APICARTO_GPU, "info-lin", lng, lat),
      fetchGpuLayer(APICARTO_GPU, "info-pct", lng, lat),
    ]);

    // Document layer: fill pluStatus, pluType, pdfUrl (PLU/POS/CC/PSMV)
    if (documentFeatures.length > 0) {
      const doc = (documentFeatures[0] as { properties?: Record<string, unknown> }).properties;
      if (doc) {
        pluInfo.pluStatus = pluInfo.pluStatus ?? (doc.etat as string) ?? null;
        pluInfo.pluType = pluInfo.pluType ?? (doc.typedoc as string) ?? null;
        const docUrl =
          (doc.lien as string) ??
          (doc.url as string) ??
          (doc.document_url as string) ??
          (doc.pdf_url as string);
        if (docUrl && typeof docUrl === "string") pluInfo.pdfUrl = docUrl;
      }
    }
    if (!pluInfo.pdfUrl && communeCode) {
      pluInfo.pdfUrl = `https://www.geoportail-urbanisme.gouv.fr/document/commune/${communeCode}`;
    }

    // CC without PLU zone: use secteur-cc as sector (Carte Communale)
    if (!pluInfo.zoneType && secteurCcFeatures.length > 0) {
      const first = (secteurCcFeatures[0] as { properties?: Record<string, unknown> }).properties;
      if (first) {
        pluInfo.zoneType = (first.libelle as string) || "CC";
        pluInfo.zoneName = (first.libelong as string) || (first.libelle as string) || "Secteur Carte Communale";
        pluInfo.pluType = pluInfo.pluType || "CC";
        pluInfo.pluStatus = pluInfo.pluStatus ?? "detected";
      }
    }

    // Step 3: If no zone from PLU/RNU/CC APIs, leave zone null so the UI can show:
    // "We were unable to automatically detect your PLU or RNU zone. We will help you determine it after your project has been validated."
    // No estimated zone is set here to avoid blocking or misleading the user; they are not required to enter a zone manually.

    pluInfo.communeName = communeName;

    // Step 5: Generate default regulations based on zone type
    pluInfo.regulations = getDefaultRegulations(pluInfo.zoneType || "UB");

    // Step 6: If Gemini is available and we have address context, enhance with AI
    if (GEMINI_API_KEY && address) {
      try {
        const prompt = `Based on French urban planning rules for zone ${pluInfo.zoneType} (${pluInfo.zoneName}) in ${communeName}, provide typical construction regulations in JSON format:
{
  "maxHeight": number (meters),
  "setbacks": {"front": number, "side": number, "rear": number},
  "maxCoverageRatio": number (0-1),
  "parkingRequirements": "string",
  "greenSpaceRequirements": "string",
  "roofConstraints": "string",
  "facadeConstraints": "string"
}
Only return the JSON, no other text.`;

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
            }),
          }
        );

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const aiText =
            geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
          const jsonMatch = aiText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const aiRegs = JSON.parse(jsonMatch[0]);
              pluInfo.regulations = { ...pluInfo.regulations, ...aiRegs };
            } catch {
              // keep default regulations
            }
          }
        }
      } catch (e) {
        console.log("Gemini enhancement failed:", e);
      }
    }

    return NextResponse.json({
      success: true,
      plu: pluInfo,
      zoneFeatures,
      source: pluInfo.zoneType ? (pluInfo.pluStatus ? "gpu" : "estimated") : "none",
      gpu: {
        document: documentFeatures,
        zone: zoneFeatures,
        secteurCc: secteurCcFeatures,
        prescriptionSurf: prescriptionSurfFeatures,
        prescriptionLin: prescriptionLinFeatures,
        prescriptionPct: prescriptionPctFeatures,
        infoSurf: infoSurfFeatures,
        infoLin: infoLinFeatures,
        infoPct: infoPctFeatures,
      },
    });
  } catch (error) {
    console.error("PLU detection error:", error);
    return NextResponse.json(
      { error: "PLU detection failed" },
      { status: 500 }
    );
  }
}

function getDefaultRegulations(zoneType: string): Record<string, unknown> {
  const defaults: Record<string, Record<string, unknown>> = {
    UA: {
      zoneClassification: "UA - Zone Urbaine Dense",
      maxHeight: 15,
      setbacks: { front: 0, side: 0, rear: 3 },
      maxCoverageRatio: 0.8,
      maxFloorAreaRatio: 3.0,
      parkingRequirements: "1 place per 60m² of floor area",
      greenSpaceRequirements: "Minimum 10% of parcel area",
      architecturalConstraints: [
        "Construction on boundary allowed",
        "Alignment with existing buildings required",
        "Flat roof or traditional roof pitch",
      ],
    },
    UB: {
      zoneClassification: "UB - Zone Urbaine Mixte",
      maxHeight: 12,
      setbacks: { front: 5, side: 3, rear: 4 },
      maxCoverageRatio: 0.4,
      maxFloorAreaRatio: 1.2,
      parkingRequirements: "1 place per 60m² of floor area",
      greenSpaceRequirements: "Minimum 20% of parcel area",
      architecturalConstraints: [
        "Roof pitch 30-45 degrees",
        "Natural materials for facades",
        "Maximum 2 colors for exterior",
      ],
    },
    UC: {
      zoneClassification: "UC - Zone Urbaine Résidentielle",
      maxHeight: 9,
      setbacks: { front: 5, side: 4, rear: 5 },
      maxCoverageRatio: 0.3,
      maxFloorAreaRatio: 0.8,
      parkingRequirements: "2 places per dwelling",
      greenSpaceRequirements: "Minimum 30% of parcel area",
      architecturalConstraints: [
        "Roof pitch 30-45 degrees",
        "Fences limited to 1.80m height",
        "Residential character mandatory",
      ],
    },
    AU: {
      zoneClassification: "AU - Zone À Urbaniser",
      maxHeight: 10,
      setbacks: { front: 5, side: 4, rear: 4 },
      maxCoverageRatio: 0.35,
      maxFloorAreaRatio: 1.0,
      parkingRequirements: "2 places per dwelling",
      greenSpaceRequirements: "Minimum 25% of parcel area",
      architecturalConstraints: [
        "Subject to development plan approval",
        "Infrastructure must be completed first",
      ],
    },
    AUD: {
      zoneClassification: "AUD - Zone à urbaniser d'habitat diffus",
      maxHeight: 10,
      setbacks: { front: 5, side: 4, rear: 4 },
      maxCoverageRatio: 0.35,
      maxFloorAreaRatio: 1.0,
      parkingRequirements: "2 places per dwelling",
      greenSpaceRequirements: "Minimum 25% of parcel area",
      architecturalConstraints: [
        "Subject to development plan approval",
        "Diffuse habitat zone – verify with PLU for specific rules",
      ],
    },
    "A/N": {
      zoneClassification: "A/N - Zone Agricole ou Naturelle",
      maxHeight: 7,
      setbacks: { front: 10, side: 5, rear: 5 },
      maxCoverageRatio: 0.1,
      maxFloorAreaRatio: 0.2,
      parkingRequirements: "2 places per dwelling",
      greenSpaceRequirements: "Maintain natural character",
      architecturalConstraints: [
        "Construction strictly limited",
        "Agricultural buildings only in zone A",
        "No new construction in zone N",
      ],
    },
  };

  const exact = defaults[zoneType];
  if (exact) return exact;
  // Map sub-types to family (e.g. AUD → AU, UH/UD → UB)
  const family = zoneType.startsWith("AU") ? "AU" : zoneType.startsWith("U") ? "UB" : null;
  return family ? defaults[family] ?? defaults["UB"] : defaults["UB"];
}
