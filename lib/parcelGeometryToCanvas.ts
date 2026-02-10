/**
 * Converts project parcelGeometry (GeoJSON) to Fabric.js polygon definitions
 * so that "all selected parcels" can be drawn on the site plan / editor canvas.
 */

const METERS_PER_DEGREE_LAT = 111320;
const RAD = Math.PI / 180;

function degLngToMeters(lng: number, refLat: number) {
  return lng * METERS_PER_DEGREE_LAT * Math.cos(refLat * RAD);
}
function degLatToMeters(lat: number) {
  return lat * METERS_PER_DEGREE_LAT;
}

type Coord = [number, number]; // [lng, lat] in GeoJSON

function ringToPoints(ring: Coord[], refLat: number, centroidLng: number, centroidLat: number, pixelsPerMeter: number): { x: number; y: number }[] {
  return ring.map(([lng, lat]) => {
    const mx = degLngToMeters(lng - centroidLng, refLat);
    const my = degLatToMeters(lat - centroidLat);
    return { x: mx * pixelsPerMeter, y: -my * pixelsPerMeter };
  });
}

function polygonFromCoords(
  coords: Coord[][],
  refLng: number,
  refLat: number,
  centerCanvasX: number,
  centerCanvasY: number,
  pixelsPerMeter: number
): { left: number; top: number; points: { x: number; y: number }[] } | null {
  const exterior = coords[0];
  if (!exterior || exterior.length < 3) return null;
  const n = exterior.length;
  const centroidLng = exterior.reduce((s, c) => s + c[0], 0) / n;
  const centroidLat = exterior.reduce((s, c) => s + c[1], 0) / n;
  const mx = degLngToMeters(centroidLng - refLng, refLat);
  const my = degLatToMeters(centroidLat - refLat);
  const left = centerCanvasX + mx * pixelsPerMeter;
  const top = centerCanvasY - my * pixelsPerMeter;
  const points = ringToPoints(exterior, refLat, centroidLng, centroidLat, pixelsPerMeter);
  return { left, top, points };
}

interface GeoPolygon {
  type: "Polygon";
  coordinates: Coord[][];
}
interface GeoMultiPolygon {
  type: "MultiPolygon";
  coordinates: Coord[][][];
}

function extractRings(geometry: GeoPolygon | GeoMultiPolygon): Coord[][][] {
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

export interface ParcelShape {
  left: number;
  top: number;
  points: { x: number; y: number }[];
}

export interface ParcelGeometryToCanvasOptions {
  canvasWidth: number;
  canvasHeight: number;
  pixelsPerMeter: number;
}

/**
 * Parse project parcelGeometry (GeoJSON string or object) and return one or more
 * polygon definitions in canvas space (Fabric origin center), so all selected
 * parcels can be drawn on the site plan / editor.
 */
export function parcelGeometryToShapes(
  parcelGeometry: string | unknown,
  options: ParcelGeometryToCanvasOptions
): ParcelShape[] {
  const { canvasWidth, canvasHeight, pixelsPerMeter } = options;
  const centerCanvasX = canvasWidth / 2;
  const centerCanvasY = canvasHeight / 2;

  type GeoFeature = { type: "Feature"; geometry?: GeoPolygon | GeoMultiPolygon };
  type GeoFC = { type: "FeatureCollection"; features?: GeoFeature[] };
  let geojson: GeoFC | GeoFeature | GeoPolygon | GeoMultiPolygon | null = null;
  if (typeof parcelGeometry === "string") {
    try {
      geojson = JSON.parse(parcelGeometry) as GeoFC | GeoFeature | GeoPolygon | GeoMultiPolygon;
    } catch {
      return [];
    }
  } else if (parcelGeometry && typeof parcelGeometry === "object") {
    geojson = parcelGeometry as GeoFC | GeoFeature | GeoPolygon | GeoMultiPolygon;
  }
  if (!geojson) return [];

  const geometries: { type: string; coordinates: Coord[][] | Coord[][][] }[] = [];

  if (geojson.type === "FeatureCollection") {
    const features = (geojson as GeoFC).features;
    if (Array.isArray(features)) {
      features.forEach((f: GeoFeature) => {
        if (f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"))
          geometries.push({ type: f.geometry.type, coordinates: f.geometry.coordinates });
      });
    }
  } else if (geojson.type === "Feature" && (geojson as GeoFeature).geometry) {
    const g = (geojson as GeoFeature).geometry!;
    if (g.type === "Polygon" || g.type === "MultiPolygon")
      geometries.push({ type: g.type, coordinates: g.coordinates });
  } else if (geojson.type === "Polygon" || geojson.type === "MultiPolygon") {
    geometries.push({ type: geojson.type, coordinates: (geojson as GeoPolygon | GeoMultiPolygon).coordinates });
  }

  if (geometries.length === 0) return [];

  const allLng: number[] = [];
  const allLat: number[] = [];
  geometries.forEach((g) => {
    if (g.type === "Polygon") {
      (g.coordinates as Coord[][])[0].forEach((c: Coord) => { allLng.push(c[0]); allLat.push(c[1]); });
    } else {
      (g.coordinates as Coord[][][]).forEach((poly) => {
        poly[0].forEach((c: Coord) => { allLng.push(c[0]); allLat.push(c[1]); });
      });
    }
  });
  const refLng = allLng.length ? allLng.reduce((a, b) => a + b, 0) / allLng.length : 0;
  const refLat = allLat.length ? allLat.reduce((a, b) => a + b, 0) / allLat.length : 0;

  const shapes: ParcelShape[] = [];
  geometries.forEach((g) => {
    const ringsPerPoly = extractRings(g as GeoPolygon | GeoMultiPolygon);
    ringsPerPoly.forEach((coords) => {
      const one = polygonFromCoords(coords, refLng, refLat, centerCanvasX, centerCanvasY, pixelsPerMeter);
      if (one) shapes.push(one);
    });
  });
  return shapes;
}

// ─── Terrain from IGN: bounds and lng/lat → canvas ────────────────────────────

function collectBoundsFromGeometries(
  geometries: { type: string; coordinates: Coord[][] | Coord[][][] }[]
): { refLng: number; refLat: number; minLng: number; maxLng: number; minLat: number; maxLat: number } | null {
  const allLng: number[] = [];
  const allLat: number[] = [];
  for (const g of geometries) {
    if (g.type === "Polygon") {
      (g.coordinates as Coord[][])[0].forEach((c: Coord) => {
        allLng.push(c[0]);
        allLat.push(c[1]);
      });
    } else {
      (g.coordinates as Coord[][][]).forEach((poly) => {
        poly[0].forEach((c: Coord) => {
          allLng.push(c[0]);
          allLat.push(c[1]);
        });
      });
    }
  }
  if (allLng.length === 0) return null;
  const refLng = allLng.reduce((a, b) => a + b, 0) / allLng.length;
  const refLat = allLat.reduce((a, b) => a + b, 0) / allLat.length;
  return {
    refLng,
    refLat,
    minLng: Math.min(...allLng),
    maxLng: Math.max(...allLng),
    minLat: Math.min(...allLat),
    maxLat: Math.max(...allLat),
  };
}

export interface ParcelBoundsAndRef {
  refLng: number;
  refLat: number;
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

/**
 * Get bounding box and reference point (centroid) from parcel geometry.
 * Used to build an elevation grid and to convert (lng, lat) to canvas (x, y).
 */
export function getParcelBoundsAndRef(
  parcelGeometry: string | unknown
): ParcelBoundsAndRef | null {
  type GeoFeature = { type: "Feature"; geometry?: { type: string; coordinates: unknown } };
  type GeoFC = { type: "FeatureCollection"; features?: GeoFeature[] };
  let geojson: GeoFC | GeoFeature | { type: string; coordinates: unknown } | null = null;
  if (typeof parcelGeometry === "string") {
    try {
      geojson = JSON.parse(parcelGeometry) as GeoFC | GeoFeature | { type: string; coordinates: unknown };
    } catch {
      return null;
    }
  } else if (parcelGeometry && typeof parcelGeometry === "object") {
    geojson = parcelGeometry as GeoFC | GeoFeature | { type: string; coordinates: unknown };
  }
  if (!geojson) return null;

  const geometries: { type: string; coordinates: Coord[][] | Coord[][][] }[] = [];
  if (geojson.type === "FeatureCollection" && Array.isArray((geojson as GeoFC).features)) {
    (geojson as GeoFC).features!.forEach((f: GeoFeature) => {
      if (f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"))
        geometries.push({ type: f.geometry.type, coordinates: f.geometry.coordinates as Coord[][] | Coord[][][] });
    });
  } else if (geojson.type === "Feature" && (geojson as GeoFeature).geometry) {
    const g = (geojson as GeoFeature).geometry!;
    if (g.type === "Polygon" || g.type === "MultiPolygon")
      geometries.push({ type: g.type, coordinates: g.coordinates as Coord[][] | Coord[][][] });
  } else if (geojson.type === "Polygon" || geojson.type === "MultiPolygon") {
    geometries.push({
      type: geojson.type,
      coordinates: (geojson as { type: string; coordinates: Coord[][] | Coord[][][] }).coordinates,
    });
  }
  return collectBoundsFromGeometries(geometries);
}

export interface LngLatToCanvasOptions {
  refLng: number;
  refLat: number;
  centerCanvasX: number;
  centerCanvasY: number;
  pixelsPerMeter: number;
}

/**
 * Convert a single (lng, lat) to canvas (x, y) using the same transform as parcel shapes.
 */
export function lngLatToCanvas(
  lng: number,
  lat: number,
  options: LngLatToCanvasOptions
): { x: number; y: number } {
  const { refLng, refLat, centerCanvasX, centerCanvasY, pixelsPerMeter } = options;
  const mx = degLngToMeters(lng - refLng, refLat);
  const my = degLatToMeters(lat - refLat);
  return {
    x: centerCanvasX + mx * pixelsPerMeter,
    y: centerCanvasY - my * pixelsPerMeter,
  };
}
