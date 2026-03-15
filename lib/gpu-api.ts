/**
 * GPU API Utility — Fetch PLU zone & regulation PDF from the French
 * Géoportail de l'Urbanisme (GPU) via the APICarto proxy.
 *
 * This is a **client-safe** utility that calls our own Next.js API route
 * (which in turn calls the GPU) OR can be invoked server-side directly.
 *
 * The GPU zone-urba endpoint returns GeoJSON features with:
 *   - libelle / libelong  → zone code & name (e.g. "UB", "Zone Urbaine Mixte")
 *   - urlfic / url_fichier → direct link to the regulation PDF (règlement)
 *   - idurba              → PLU document identifier
 *   - typezone            → broad class (U, AU, A, N)
 *
 * Usage:
 *   const result = await fetchGpuRegulation(geojsonPolygon);
 *   // → { zoneName: "UB", zoneLabel: "Zone Urbaine Mixte", pdfUrl: "https://…", ... }
 */

import type { Feature, Polygon, MultiPolygon, GeoJsonProperties } from "geojson";

// ─── Constants ──────────────────────────────────────────────────────────────

const APICARTO_GPU = "https://apicarto.ign.fr/api/gpu";
const API_TIMEOUT = 10_000;
const API_HEADERS = { "User-Agent": "UrbAssist/1.0 (urbanisme)" };

// ─── Public types ───────────────────────────────────────────────────────────

/** Result of a GPU regulation fetch — everything a downstream consumer needs. */
export interface GpuRegulationResult {
  /** Short zone code, e.g. "UB", "UC1", "AUd" */
  zoneName: string;
  /** Full descriptive label, e.g. "Zone Urbaine Mixte" */
  zoneLabel: string;
  /** Direct URL to the official regulation PDF (règlement de zone). null = not available. */
  pdfUrl: string | null;
  /** GPU document type: PLU, PLUi, CC, RNU, ... */
  documentType: string | null;
  /** GPU document identifier (idurba) */
  idurba: string | null;
  /** Whether this is a broad zone family or a specific sub-zone */
  isSpecific: boolean;
  /** Raw GPU feature properties for advanced consumers */
  rawProperties: Record<string, unknown>;
}

/** Null-object for "no zone found" — used for typed default state. */
export const GPU_NO_RESULT: GpuRegulationResult = {
  zoneName: "",
  zoneLabel: "",
  pdfUrl: null,
  documentType: null,
  idurba: null,
  isSpecific: false,
  rawProperties: {},
};

// ─── Geometry helpers ───────────────────────────────────────────────────────

/**
 * Extracts a GeoJSON geometry from either a raw geometry or a Feature wrapper.
 * Normalises to always return a plain geometry object for the GPU API.
 */
function extractGeometry(
  input: Feature<Polygon | MultiPolygon> | Polygon | MultiPolygon | Record<string, unknown>,
): Polygon | MultiPolygon | null {
  if (!input) return null;
  // If Feature, unwrap
  if ((input as Feature).type === "Feature") {
    return (input as Feature<Polygon | MultiPolygon>).geometry ?? null;
  }
  const geomType = (input as Polygon | MultiPolygon).type;
  if (geomType === "Polygon" || geomType === "MultiPolygon") {
    return input as Polygon | MultiPolygon;
  }
  return null;
}

/**
 * Compute the centroid of a polygon to create a fallback Point query.
 * Simple bounding-box centroid — sufficient for GPU point-in-polygon.
 */
function centroidPoint(geom: Polygon | MultiPolygon): { type: "Point"; coordinates: [number, number] } {
  let allCoords: number[][] = [];
  if (geom.type === "Polygon") {
    allCoords = geom.coordinates[0];
  } else {
    allCoords = geom.coordinates.flatMap((poly) => poly[0]);
  }
  const lngs = allCoords.map((c) => c[0]);
  const lats = allCoords.map((c) => c[1]);
  return {
    type: "Point",
    coordinates: [
      (Math.min(...lngs) + Math.max(...lngs)) / 2,
      (Math.min(...lats) + Math.max(...lats)) / 2,
    ],
  };
}

// ─── Raw GPU fetch ──────────────────────────────────────────────────────────

async function gpuGet(path: string, geom: object): Promise<Array<{ properties?: Record<string, unknown> }>> {
  const url = `${APICARTO_GPU}/${path}?geom=${encodeURIComponent(JSON.stringify(geom))}`;
  try {
    const res = await fetch(url, {
      headers: API_HEADERS,
      signal: AbortSignal.timeout(API_TIMEOUT),
    });
    if (res.ok) {
      const data = await res.json();
      return data?.features ?? [];
    }
    console.warn(`[gpu-api] ${path}: HTTP ${res.status}`);
  } catch (e) {
    console.warn(`[gpu-api] ${path} failed:`, (e as Error).message);
  }
  return [];
}

// ─── Property extractors ────────────────────────────────────────────────────

const BROAD_ZONES = new Set(["U", "AU", "A", "N"]);

function extractLibelle(props: Record<string, unknown> | undefined): string | null {
  if (!props) return null;
  const v = (props.libelle ?? props.LIBELLE ?? props.code ?? props.zone ?? props.typezone ?? props.TYPEZONE) as string | undefined;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function extractLibelong(props: Record<string, unknown> | undefined): string | null {
  if (!props) return null;
  const v = (props.libelong ?? props.LIBELLONG ?? props.LIBELONG) as string | undefined;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Extract the regulation PDF URL from GPU properties.
 *
 * Strategy (in priority order):
 *   1. Direct URL from `urlfic` / `url_fichier` (rare — GPU usually leaves these empty)
 *   2. Construct from `gpu_doc_id` + `nomfic` → real download endpoint:
 *      https://www.geoportail-urbanisme.gouv.fr/api/document/{gpu_doc_id}/files/{nomfic}
 *      (returns 302 → data.geopf.fr PDF)
 *   3. Fallback fields: `lien`, `url`, `pdf_url`
 */
function extractPdfUrl(props: Record<string, unknown> | undefined): string | null {
  if (!props) return null;

  // Strategy 1: Direct URL fields (rare but ideal)
  const directCandidates = [
    props.urlfic,
    props.URLFIC,
    props.url_fichier,
    props.URL_FICHIER,
  ];
  for (const v of directCandidates) {
    if (typeof v === "string" && v.trim().startsWith("http")) {
      return v.trim();
    }
  }

  // Strategy 2: Construct from gpu_doc_id + nomfic (the standard GPU pattern)
  const gpuDocId = (props.gpu_doc_id ?? props.GPU_DOC_ID) as string | undefined;
  const nomfic = (props.nomfic ?? props.NOMFIC) as string | undefined;
  if (
    gpuDocId && typeof gpuDocId === "string" && gpuDocId.trim() &&
    nomfic && typeof nomfic === "string" && nomfic.trim()
  ) {
    return `https://www.geoportail-urbanisme.gouv.fr/api/document/${gpuDocId.trim()}/files/${encodeURIComponent(nomfic.trim())}`;
  }

  // Strategy 3: Other URL fields (generic fallback)
  const fallbackCandidates = [
    props.lien,
    props.url,
    props.pdf_url,
    props.document_url,
  ];
  for (const v of fallbackCandidates) {
    if (typeof v === "string" && v.trim().startsWith("http")) {
      return v.trim();
    }
  }
  return null;
}

function extractIdurba(props: Record<string, unknown> | undefined): string | null {
  if (!props) return null;
  const v = (props.idurba ?? props.IDURBA ?? props.du_type) as string | undefined;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// ─── Zone selection ─────────────────────────────────────────────────────────

function pickBestZoneFeature(
  features: Array<{ properties?: Record<string, unknown> }>,
): Record<string, unknown> | undefined {
  if (!features.length) return undefined;

  const withLib = features.filter((f) => extractLibelle(f.properties));
  if (!withLib.length) return features[0].properties;

  const specific = withLib.filter(
    (f) => !BROAD_ZONES.has(String(extractLibelle(f.properties) ?? "").toUpperCase()),
  );
  const pool = specific.length > 0 ? specific : withLib;

  pool.sort((a, b) => {
    const la = String(extractLibelle(a.properties) ?? "");
    const lb = String(extractLibelle(b.properties) ?? "");
    if (lb.length !== la.length) return lb.length - la.length;
    return la.localeCompare(lb);
  });

  return pool[0]?.properties ?? features[0].properties;
}

// ─── Main API ───────────────────────────────────────────────────────────────

/**
 * Fetch the PLU regulation for a given GeoJSON boundary from the GPU API.
 *
 * Strategy:
 *  1. Query `zone-urba` with the full polygon geometry
 *  2. Fallback to centroid Point query if polygon returns nothing
 *  3. Query `document` layer for the PDF URL if zone-urba doesn't have it
 *  4. Pick the most specific zone and extract pdf URL
 *
 * @param boundary - A GeoJSON Feature<Polygon|MultiPolygon>, or a bare Polygon/MultiPolygon geometry
 * @returns GpuRegulationResult (or GPU_NO_RESULT on failure)
 */
export async function fetchGpuRegulation(
  boundary: Feature<Polygon | MultiPolygon> | Polygon | MultiPolygon | Record<string, unknown>,
): Promise<GpuRegulationResult> {
  const geom = extractGeometry(boundary);
  if (!geom) {
    console.warn("[gpu-api] Invalid geometry — cannot query GPU.");
    return { ...GPU_NO_RESULT };
  }

  // ── Step 1: Parallel polygon + point + document queries ────────────────
  const pointGeom = centroidPoint(geom);

  const [polyZones, pointZones, docFeatures] = await Promise.all([
    gpuGet("zone-urba", geom),
    gpuGet("zone-urba", pointGeom),
    gpuGet("document", geom),
  ]);

  // Priority: polygon (precise) > point (fallback)
  const sourceFeatures = polyZones.length > 0 ? polyZones : pointZones;

  if (sourceFeatures.length === 0) {
    console.log("[gpu-api] No zone found for boundary.");
    return { ...GPU_NO_RESULT };
  }

  // ── Step 2: Pick best zone ─────────────────────────────────────────────
  const bestProps = pickBestZoneFeature(sourceFeatures) ?? {};

  const zoneName = extractLibelle(bestProps) ?? "";
  const zoneLabel = extractLibelong(bestProps) ?? zoneName;
  const idurba = extractIdurba(bestProps);

  // ── Step 3: Extract PDF URL ────────────────────────────────────────────
  // Try zone properties first, then fall back to document layer
  let pdfUrl = extractPdfUrl(bestProps);

  if (!pdfUrl && docFeatures.length > 0) {
    const docProps = docFeatures[0].properties;
    pdfUrl = extractPdfUrl(docProps);
  }

  // Determine document type
  let documentType: string | null = null;
  if (idurba) {
    documentType = idurba.includes("PLUi") ? "PLUi" : "PLU";
  }
  if (!documentType && docFeatures.length > 0) {
    const docProps = docFeatures[0].properties;
    const td = (docProps?.typedoc ?? docProps?.TYPEDOC ?? docProps?.type_doc) as string | undefined;
    if (td) documentType = td;
  }

  // ── Fallback: if no PDF URL from zone or document layer, leave null ──
  // Previous code constructed fake Géoportail URLs that 404'd.
  // An honest null lets the frontend show "No PDF found" and force upload.
  if (!pdfUrl && zoneName) {
    console.log(`[gpu-api] No PDF URL available for zone ${zoneName} — user must upload manually.`);
  }

  const isSpecific = zoneName.length > 1 && !BROAD_ZONES.has(zoneName.toUpperCase());

  const result: GpuRegulationResult = {
    zoneName,
    zoneLabel,
    pdfUrl,
    documentType,
    idurba,
    isSpecific,
    rawProperties: bestProps,
  };

  console.log(`[gpu-api] Zone: ${zoneName} (${zoneLabel}), PDF: ${pdfUrl ? "✓" : "✗"}, Type: ${documentType}`);

  return result;
}

// ─── Server-side convenience: fetch via our own API route ────────────────────

/**
 * Client-side variant that calls our `/api/plu-detection` endpoint
 * and extracts the GPU regulation result from the response.
 *
 * Use this from React components when you don't have direct server access.
 */
export async function fetchGpuRegulationViaApi(
  coordinates: [number, number],
  citycode?: string,
): Promise<GpuRegulationResult> {
  try {
    const res = await fetch("/api/plu-detection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates, citycode }),
    });

    if (!res.ok) {
      console.warn("[gpu-api] /api/plu-detection failed:", res.status);
      return { ...GPU_NO_RESULT };
    }

    const data = await res.json();
    const plu = data.plu as Record<string, unknown> | undefined;

    if (!plu?.zoneType) {
      return { ...GPU_NO_RESULT };
    }

    return {
      zoneName: (plu.zoneType as string) ?? "",
      zoneLabel: (plu.zoneName as string) ?? (plu.zoneType as string) ?? "",
      pdfUrl: (plu.pdfUrl as string) ?? null,
      documentType: (plu.pluType as string) ?? null,
      idurba: null,
      isSpecific: String(plu.zoneType ?? "").length > 1,
      rawProperties: plu,
    };
  } catch (err) {
    console.error("[gpu-api] Client fetch failed:", err);
    return { ...GPU_NO_RESULT };
  }
}
