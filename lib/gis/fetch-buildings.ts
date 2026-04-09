/**
 * fetch-buildings.ts — Smart Editor: Geospatial Building Footprint Fetcher
 *
 * Queries the French Géoplateforme BD TOPO WFS to retrieve existing building
 * footprints intersecting a given parcel polygon, then translates them into
 * local canvas coordinates for the Fabric.js site plan editor.
 *
 * DATA SOURCE:
 *   Géoplateforme WFS 2.0 — BDTOPO_V3:batiment
 *   Endpoint: https://data.geopf.fr/wfs/ows
 *   Auth: none required (public open data)
 *
 * COORDINATE PIPELINE:
 *   1. Parcel GeoJSON → Turf.js bbox → WFS BBOX filter
 *   2. WFS GeoJSON response → per-building Polygon features
 *   3. geoJsonToCanvas() → local pixel coordinates using the same
 *      equirectangular approximation as parcelGeometryToCanvas.ts
 *
 * USAGE:
 *   const buildings = await fetchExistingBuildings(parcelGeoJson);
 *   const canvasPolygons = buildings.map(b =>
 *     geoJsonToCanvas(b.geometry, pixelsPerMeter, centerPoint)
 *   );
 */

import * as turf from "@turf/turf";
import type {
  Feature,
  FeatureCollection,
  Polygon,
  MultiPolygon,
  Position,
} from "geojson";
import { ignFetchWithRetry } from "@/lib/ign-fetch";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Géoplateforme WFS endpoint for BD TOPO v3 */
const WFS_BASE = "https://data.geopf.fr/wfs/ows";

/** BD TOPO layer name for buildings */
const BATIMENT_LAYER = "BDTOPO_V3:batiment";

/**
 * Equirectangular approximation constants.
 * Matched exactly to parcelGeometryToCanvas.ts for coordinate consistency.
 */
const METERS_PER_DEGREE_LAT = 111_320;
const RAD = Math.PI / 180;

/** Maximum number of buildings to return (safety cap for dense urban areas) */
const MAX_FEATURES = 200;

/** Bbox expansion in meters to catch buildings straddling parcel edges */
const BBOX_PADDING_M = 5;

// ─── Public Types ───────────────────────────────────────────────────────────

export interface FetchedBuilding {
  /** Unique identifier from BD TOPO (cleabs) */
  id: string;
  /** GeoJSON geometry in WGS84 (lng/lat) */
  geometry: Polygon | MultiPolygon;
  /** Building usage from BD TOPO (e.g. "Résidentiel", "Commercial") */
  usage: string | null;
  /** Number of storeys from BD TOPO, if available */
  storeys: number | null;
  /** Building height in meters from BD TOPO, if available */
  heightM: number | null;
  /** Ground altitude in meters (NGF) */
  altitudeM: number | null;
}

export interface CanvasPolygon {
  /** Canvas-space points for Fabric.js polygon (centered around bbox center) */
  points: { x: number; y: number }[];
  /** Canvas-space bounding box center X (Fabric.js `left`) */
  left: number;
  /** Canvas-space bounding box center Y (Fabric.js `top`) */
  top: number;
  /** Width of bounding box in pixels */
  widthPx: number;
  /** Height of bounding box in pixels */
  heightPx: number;
  /** The original fetched building data */
  source: FetchedBuilding;
}

export interface GeoToCanvasOptions {
  /** Pixels per meter scale factor (from editor config) */
  pixelsPerMeter: number;
  /** Reference longitude (parcel centroid) for equirectangular projection */
  refLng: number;
  /** Reference latitude (parcel centroid) for equirectangular projection */
  refLat: number;
  /** Canvas center X in pixels (typically canvasWidth / 2) */
  centerCanvasX: number;
  /** Canvas center Y in pixels (typically canvasHeight / 2) */
  centerCanvasY: number;
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

function degLngToMeters(dLng: number, refLat: number): number {
  return dLng * METERS_PER_DEGREE_LAT * Math.cos(refLat * RAD);
}

function degLatToMeters(dLat: number): number {
  return dLat * METERS_PER_DEGREE_LAT;
}

/**
 * Expand a [minLng, minLat, maxLng, maxLat] bbox by `meters` in all directions.
 */
function expandBbox(
  bbox: [number, number, number, number],
  meters: number
): [number, number, number, number] {
  const centerLat = (bbox[1] + bbox[3]) / 2;
  const dLng = meters / (METERS_PER_DEGREE_LAT * Math.cos(centerLat * RAD));
  const dLat = meters / METERS_PER_DEGREE_LAT;
  return [
    bbox[0] - dLng,
    bbox[1] - dLat,
    bbox[2] + dLng,
    bbox[3] + dLat,
  ];
}

/**
 * Build a WFS GetFeature URL for BD TOPO batiment with spatial BBOX filter.
 *
 * Uses CQL_FILTER with BBOX() for reliable spatial intersection.
 * SRS is EPSG:4326 (WGS84) — matches our GeoJSON input.
 */
function buildWfsUrl(bbox: [number, number, number, number]): string {
  // WFS BBOX CQL: BBOX(geometrie, minLat, minLng, maxLat, maxLng, 'EPSG:4326')
  // Note: Géoplateforme WFS CQL BBOX uses lat/lng order for EPSG:4326
  const cqlFilter = `BBOX(geometrie,${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]},'EPSG:4326')`;

  const params = new URLSearchParams({
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    TYPENAMES: BATIMENT_LAYER,
    OUTPUTFORMAT: "application/json",
    SRSNAME: "EPSG:4326",
    COUNT: String(MAX_FEATURES),
    CQL_FILTER: cqlFilter,
  });

  return `${WFS_BASE}?${params.toString()}`;
}

/**
 * Extract a ring as [lng, lat][] from a GeoJSON Polygon or one ring of a MultiPolygon.
 */
function extractExteriorRing(
  geometry: Polygon | MultiPolygon
): Position[][] {
  if (geometry.type === "Polygon") {
    return [geometry.coordinates[0]];
  }
  // MultiPolygon → collect all outer rings
  return geometry.coordinates.map((poly) => poly[0]);
}

// ─── Core Fetch ─────────────────────────────────────────────────────────────

/**
 * Fetch existing building footprints from BD TOPO that intersect the given parcel.
 *
 * @param parcelGeoJson - Parcel as GeoJSON Feature, FeatureCollection, or raw Polygon/MultiPolygon
 * @returns Array of fetched buildings with WGS84 geometries and metadata
 */
export async function fetchExistingBuildings(
  parcelGeoJson: unknown
): Promise<FetchedBuilding[]> {
  // ── Parse input ──────────────────────────────────────────────────────
  let parcelFeature: Feature<Polygon | MultiPolygon>;

  try {
    const parsed =
      typeof parcelGeoJson === "string"
        ? JSON.parse(parcelGeoJson)
        : parcelGeoJson;

    if (!parsed || typeof parsed !== "object") {
      console.warn("[fetch-buildings] Invalid parcel GeoJSON input");
      return [];
    }

    if (parsed.type === "FeatureCollection" && Array.isArray(parsed.features)) {
      // Use the first polygon feature
      const feat = parsed.features.find(
        (f: Feature) =>
          f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"
      );
      if (!feat) return [];
      parcelFeature = feat as Feature<Polygon | MultiPolygon>;
    } else if (parsed.type === "Feature" && parsed.geometry) {
      parcelFeature = parsed as Feature<Polygon | MultiPolygon>;
    } else if (parsed.type === "Polygon" || parsed.type === "MultiPolygon") {
      parcelFeature = turf.feature(parsed) as Feature<Polygon | MultiPolygon>;
    } else {
      console.warn("[fetch-buildings] Unsupported GeoJSON type:", parsed.type);
      return [];
    }
  } catch (e) {
    console.warn("[fetch-buildings] Failed to parse parcel GeoJSON:", e);
    return [];
  }

  // ── Compute bbox ─────────────────────────────────────────────────────
  const rawBbox = turf.bbox(parcelFeature) as [number, number, number, number];
  const paddedBbox = expandBbox(rawBbox, BBOX_PADDING_M);

  // ── WFS request ──────────────────────────────────────────────────────
  const url = buildWfsUrl(paddedBbox);

  interface WfsProperties {
    cleabs?: string;
    usage_1?: string;
    nombre_d_etages?: number;
    hauteur?: number;
    altitude_minimale_sol?: number;
    [key: string]: unknown;
  }

  const result = await ignFetchWithRetry<FeatureCollection>(url, {
    maxRetries: 2,
    timeoutMs: 15_000,
  });

  if (!result.ok || !result.data) {
    console.warn(
      `[fetch-buildings] WFS request failed after ${result.attempts} attempts: ${result.error}`
    );
    return [];
  }

  const fc = result.data;
  if (!fc.features || !Array.isArray(fc.features)) {
    console.warn("[fetch-buildings] WFS response has no features array");
    return [];
  }

  // ── Filter to only buildings that actually intersect the parcel ──────
  // The BBOX filter is coarse; refine with Turf.js intersection
  const buildings: FetchedBuilding[] = [];

  for (const feature of fc.features) {
    if (
      !feature.geometry ||
      (feature.geometry.type !== "Polygon" &&
        feature.geometry.type !== "MultiPolygon")
    ) {
      continue;
    }

    // Precise intersection check
    try {
      if (!turf.booleanIntersects(parcelFeature, feature as Feature<Polygon | MultiPolygon>)) {
        continue;
      }
    } catch {
      // If intersection check fails (topology errors), include the building
      // to avoid missing legitimate features
    }

    const props = (feature.properties || {}) as WfsProperties;

    buildings.push({
      id: props.cleabs || `bdtopo-${buildings.length}`,
      geometry: feature.geometry as Polygon | MultiPolygon,
      usage: (props.usage_1 as string) || null,
      storeys:
        typeof props.nombre_d_etages === "number"
          ? props.nombre_d_etages
          : null,
      heightM: typeof props.hauteur === "number" ? props.hauteur : null,
      altitudeM:
        typeof props.altitude_minimale_sol === "number"
          ? props.altitude_minimale_sol
          : null,
    });
  }

  console.debug(
    `[fetch-buildings] Found ${buildings.length} buildings from ${fc.features.length} WFS features`
  );

  return buildings;
}

// ─── Coordinate Translation ─────────────────────────────────────────────────

/**
 * Translate a WGS84 building polygon into local canvas coordinates.
 *
 * Uses the same equirectangular approximation as `parcelGeometryToCanvas.ts`
 * to ensure pixel-perfect alignment with existing parcel shapes on the canvas.
 *
 * The returned `points` array is centered around the polygon's bounding-box
 * center, and `left`/`top` give the absolute canvas position — matching
 * Fabric.js pathOffset convention (center origin).
 *
 * @param geometry - WGS84 Polygon or MultiPolygon from BD TOPO
 * @param options  - Scale and projection parameters
 * @returns Canvas polygon(s) ready for Fabric.js, one per ring
 */
export function geoJsonToCanvas(
  geometry: Polygon | MultiPolygon,
  options: GeoToCanvasOptions
): CanvasPolygon[] {
  const {
    pixelsPerMeter,
    refLng,
    refLat,
    centerCanvasX,
    centerCanvasY,
  } = options;

  const rings = extractExteriorRing(geometry);
  const results: CanvasPolygon[] = [];

  for (const ring of rings) {
    if (ring.length < 3) continue;

    // Convert each coordinate to absolute canvas position
    const absPoints = ring.map(([lng, lat]) => {
      const mx = degLngToMeters(lng - refLng, refLat);
      const my = degLatToMeters(lat - refLat);
      return {
        x: centerCanvasX + mx * pixelsPerMeter,
        y: centerCanvasY - my * pixelsPerMeter, // Y-flip for screen coords
      };
    });

    // Compute bounding box center (matches Fabric.js pathOffset)
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of absPoints) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    const bboxCenterX = (minX + maxX) / 2;
    const bboxCenterY = (minY + maxY) / 2;

    if (!Number.isFinite(bboxCenterX) || !Number.isFinite(bboxCenterY)) {
      continue;
    }

    // Center points around bbox center for Fabric.js polygon pathOffset
    const points = absPoints.map((p) => ({
      x: p.x - bboxCenterX,
      y: p.y - bboxCenterY,
    }));

    results.push({
      points,
      left: bboxCenterX,
      top: bboxCenterY,
      widthPx: maxX - minX,
      heightPx: maxY - minY,
      source: null as unknown as FetchedBuilding, // Set by caller
    });
  }

  return results;
}

/**
 * Convenience: fetch buildings AND translate to canvas coords in one call.
 *
 * @param parcelGeoJson - Parcel geometry (string or object)
 * @param canvasOptions - Scale and projection parameters
 * @returns Array of canvas-ready polygon definitions with source metadata
 */
export async function fetchAndProjectBuildings(
  parcelGeoJson: unknown,
  canvasOptions: GeoToCanvasOptions
): Promise<CanvasPolygon[]> {
  const buildings = await fetchExistingBuildings(parcelGeoJson);

  const allPolygons: CanvasPolygon[] = [];

  for (const building of buildings) {
    const projected = geoJsonToCanvas(building.geometry, canvasOptions);
    for (const poly of projected) {
      poly.source = building;
      allPolygons.push(poly);
    }
  }

  return allPolygons;
}

// ─── Store Integration ──────────────────────────────────────────────────────

/**
 * Inject fetched BD TOPO buildings into the editor stores as locked
 * `isExisting: true` elements.
 *
 * Creates proper BuildingDetail entries for each fetched building and
 * appends them to the editorStore's buildingDetails array. Also syncs
 * to useSitePlanMath for real-time CES tracking.
 *
 * @param polygons     - Canvas-projected polygons from fetchAndProjectBuildings()
 * @param editorStore  - The editor store instance (pass set/get functions)
 * @param mathStore    - The useSitePlanMath store instance
 *
 * @example
 * ```ts
 * const projected = await fetchAndProjectBuildings(parcelGeoJSON, canvasOptions);
 * injectBuildingsToEditorStore(projected, {
 *   getBuildingDetails: () => useEditorStore.getState().buildingDetails,
 *   setBuildingDetails: useEditorStore.getState().setBuildingDetails,
 *   addMathBuilding: useSitePlanMath.getState().addBuilding,
 * });
 * ```
 */
export function injectBuildingsToEditorStore(
  polygons: CanvasPolygon[],
  stores: {
    getBuildingDetails: () => Array<{
      id: string;
      name: string;
      isExisting: boolean;
      width: number;
      depth: number;
      [key: string]: unknown;
    }>;
    setBuildingDetails: (details: Array<unknown>) => void;
    addMathBuilding: (building: {
      id: string;
      name: string;
      width: number;
      depth: number;
      isExisting: boolean;
    }) => void;
  }
): void {
  if (!polygons || polygons.length === 0) return;

  const existing = stores.getBuildingDetails();
  // Track which BD TOPO IDs we already have to avoid duplicates
  const existingIds = new Set(existing.map((b) => b.id));

  const newDetails: Array<Record<string, unknown>> = [];

  for (const poly of polygons) {
    const source = poly.source;
    if (!source) continue;

    const id = `bdtopo-${source.id}`;
    if (existingIds.has(id)) continue; // Already imported

    // Compute real-world dimensions from pixel bounding box
    // This is approximate — the actual footprint is the polygon shape
    const widthM = poly.widthPx > 0 ? Math.round(poly.widthPx / 10 * 100) / 100 : 6;
    const depthM = poly.heightPx > 0 ? Math.round(poly.heightPx / 10 * 100) / 100 : 6;
    const heightM = source.heightM ?? 6;
    const storeys = source.storeys ?? Math.max(1, Math.round(heightM / 3));

    const detail = {
      id,
      name: source.usage
        ? `${source.usage} (existant)`
        : `Bâtiment existant #${newDetails.length + 1}`,
      isExisting: true,
      width: widthM,
      depth: depthM,
      wallHeights: {
        ground: Math.min(heightM, 3),
        first: storeys > 1 ? Math.min(heightM - 3, 3) : 0,
        second: storeys > 2 ? Math.min(heightM - 6, 3) : 0,
      },
      wallThickness: 0.2,
      roof: {
        type: "flat" as const,
        pitch: 0,
        overhang: 0,
        material: "Tuile terre cuite",
      },
      materials: {
        walls: "Enduit blanc",
        roof: "Tuile terre cuite",
        facade: "Enduit blanc",
      },
      openings: [],
      rooms: [],
      color: "#94a3b8", // Slate grey for existing buildings
      altitudeM: source.altitudeM ?? undefined,
    };

    newDetails.push(detail);

    // Also inject into the math store for CES tracking
    stores.addMathBuilding({
      id,
      name: detail.name,
      width: widthM,
      depth: depthM,
      isExisting: true,
    });
  }

  if (newDetails.length > 0) {
    stores.setBuildingDetails([...existing, ...newDetails]);
    console.debug(
      `[fetch-buildings] Injected ${newDetails.length} existing buildings into editor store`
    );
  }
}
