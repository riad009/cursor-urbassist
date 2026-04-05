/**
 * map-math.ts — Pure GIS math for PC1 tile-stitched map generation.
 *
 * Provides:
 *   1. Bounding box extraction from arbitrary GeoJSON
 *   2. Aspect-ratio-aware bbox expansion with configurable padding
 *   3. Dynamic zoom calculation from a target real-world scale denominator
 *   4. Tile grid computation that fully covers a geographic bbox
 *   5. Pixel-precise crop rect within a tile mosaic
 *
 * All functions are stateless and have zero side effects.
 * Coordinate convention: [lng, lat] (GeoJSON standard).
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/** [minLng, minLat, maxLng, maxLat] — standard OGC/GeoJSON bbox order */
export type BBox = [number, number, number, number];

export interface TileGrid {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  tilesWide: number;
  tilesTall: number;
}

export interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface MapViewParams {
  /** Padded bbox matching the PDF container aspect ratio */
  bbox: BBox;
  /** Integer zoom level for tile fetching */
  zoom: number;
  /** Tile grid covering the bbox */
  grid: TileGrid;
  /** Crop rect within the stitched tile mosaic to extract the final image */
  crop: CropRect;
  /** Pixel dimensions of the final output after crop */
  outputWidth: number;
  outputHeight: number;
}

// ─── Web Mercator tile coordinate conversions ───────────────────────────────

export function lngToTileX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * Math.pow(2, zoom);
}

export function latToTileY(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    Math.pow(2, zoom)
  );
}

export function tileXToLng(x: number, zoom: number): number {
  return (x / Math.pow(2, zoom)) * 360 - 180;
}

export function tileYToLat(y: number, zoom: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** Convert geographic [lat, lng] to pixel position relative to a tile grid origin. */
export function geoToPixel(
  lat: number,
  lng: number,
  gridOriginTileX: number,
  gridOriginTileY: number,
  zoom: number
): { x: number; y: number } {
  // Fractional tile positions in world space
  const worldTileX = lngToTileX(lng, zoom);
  const worldTileY = latToTileY(lat, zoom);
  return {
    x: Math.round((worldTileX - gridOriginTileX) * 256),
    y: Math.round((worldTileY - gridOriginTileY) * 256),
  };
}

// ─── Geometry extraction ────────────────────────────────────────────────────

/**
 * Recursively extract all [lng, lat] coordinate pairs from any GeoJSON structure.
 * Handles Feature, FeatureCollection, Polygon, MultiPolygon, and raw coordinate arrays.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractAllCoords(geoJson: any): number[][] {
  if (!geoJson) return [];
  if (typeof geoJson === "string") {
    try {
      geoJson = JSON.parse(geoJson);
    } catch {
      return [];
    }
  }

  if (geoJson.type === "FeatureCollection") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (geoJson.features || []).flatMap((f: any) => extractAllCoords(f));
  }
  if (geoJson.type === "Feature") {
    return extractAllCoords(geoJson.geometry);
  }
  if (geoJson.type === "Polygon") {
    // coordinates: Ring[] → Ring = [lng, lat][]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (geoJson.coordinates || []).flat() as any;
  }
  if (geoJson.type === "MultiPolygon") {
    // coordinates: Polygon[] → Ring[] → [lng, lat][]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (geoJson.coordinates || []).flat(2) as any;
  }
  if (geoJson.type === "Point") {
    return [geoJson.coordinates];
  }
  return [];
}

// ─── BBox extraction ────────────────────────────────────────────────────────

/**
 * Compute the tight geographic bounding box of a GeoJSON object.
 * Returns null if no valid coordinates are found.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractBBox(geoJson: any): BBox | null {
  const coords = extractAllCoords(geoJson);
  if (coords.length === 0) return null;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const [lng, lat] = c;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  if (!isFinite(minLng) || !isFinite(minLat)) return null;
  return [minLng, minLat, maxLng, maxLat];
}

// ─── Aspect-ratio-aware padded bounding box ─────────────────────────────────

/**
 * Expand a geographic bounding box so that:
 *   1. Its geographic aspect ratio matches `targetWidthPx / targetHeightPx`
 *   2. A padding margin is applied (default 20%) so the polygon never
 *      touches the image edges.
 *
 * The expansion is applied symmetrically along whichever geographic axis
 * is "short" relative to the target aspect ratio, accounting for the
 * Web Mercator latitude distortion (cos(lat) correction on longitude).
 */
export function computePaddedBBox(
  bbox: BBox,
  targetWidthPx: number,
  targetHeightPx: number,
  paddingFactor: number = 0.05
): BBox {
  let [minLng, minLat, maxLng, maxLat] = bbox;

  // Step 1: Apply padding to the raw geographic extent
  const lngSpan = maxLng - minLng;
  const latSpan = maxLat - minLat;

  // Guard: if the bbox is a point or extremely tiny, create a minimum extent
  // ~55m at equator — enough to see surroundings without drowning the point
  const minExtentDeg = 0.0005;
  const effectiveLngSpan = Math.max(lngSpan, minExtentDeg);
  const effectiveLatSpan = Math.max(latSpan, minExtentDeg);

  const lngPad = effectiveLngSpan * paddingFactor;
  const latPad = effectiveLatSpan * paddingFactor;

  minLng -= lngPad;
  maxLng += lngPad;
  minLat -= latPad;
  maxLat += latPad;

  // Step 2: Convert the padded geographic extents to meters for aspect correction
  const centerLat = (minLat + maxLat) / 2;
  const cosLat = Math.cos((centerLat * Math.PI) / 180);

  // Approximate meters per degree
  const mPerDegLat = 111320; // constant
  const mPerDegLng = 111320 * cosLat; // longitude shrinks toward poles

  const widthM = (maxLng - minLng) * mPerDegLng;
  const heightM = (maxLat - minLat) * mPerDegLat;

  // Step 3: Compute the target aspect ratio in meters
  const targetAR = targetWidthPx / targetHeightPx; // e.g. 0.851 for IGN
  const currentAR = widthM / heightM;

  if (currentAR < targetAR) {
    // Need to widen (extend longitude)
    const newWidthM = heightM * targetAR;
    const deltaM = (newWidthM - widthM) / 2;
    const deltaDeg = deltaM / mPerDegLng;
    minLng -= deltaDeg;
    maxLng += deltaDeg;
  } else {
    // Need to heighten (extend latitude)
    const newHeightM = widthM / targetAR;
    const deltaM = (newHeightM - heightM) / 2;
    const deltaDeg = deltaM / mPerDegLat;
    minLat -= deltaDeg;
    maxLat += deltaDeg;
  }

  return [minLng, minLat, maxLng, maxLat];
}

// ─── Zoom level calculation ─────────────────────────────────────────────────

/**
 * Calculate the integer zoom level needed to fit a bbox into a given
 * pixel width, using standard Web Mercator math.
 *
 * The core equation:
 *   zoom = log2( 360 / lngDiff ) + log2( targetWidthPx / 256 )
 * adjusted for latitude distortion via cos(centerLat).
 *
 * Returns an integer zoom (floored) so tiles can be fetched.
 */
export function calculateZoomForBBox(
  bbox: BBox,
  targetWidthPx: number
): number {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const lngDiff = maxLng - minLng;
  const latDiff = maxLat - minLat;
  const centerLat = (minLat + maxLat) / 2;
  const cosLat = Math.cos((centerLat * Math.PI) / 180);

  // Zoom from longitude span
  const zoomLng = Math.log2((360 * cosLat) / lngDiff) + Math.log2(targetWidthPx / 256);

  // Zoom from latitude span (Mercator Y is nonlinear, but for small spans
  // the linear approximation 360 / latDiff is close enough; for precision
  // we compute the Mercator pixel span)
  const targetHeightPx = targetWidthPx; // use same dimension for comparison
  const mercatorLatSpan =
    Math.abs(latToTileY(minLat, 0) - latToTileY(maxLat, 0)) * 256;
  const zoomLat = mercatorLatSpan > 0
    ? Math.log2(targetHeightPx / mercatorLatSpan)
    : zoomLng;

  // Use the more restrictive (lower) zoom so the entire bbox fits
  const zoom = Math.min(zoomLng, zoomLat);

  // Clamp to valid WMTS range
  return Math.max(1, Math.min(19, Math.floor(zoom)));
}

/**
 * Calculate the zoom level required to achieve a specific real-world
 * scale (e.g., 1:2000 or 1:5000) for a given latitude.
 *
 * Uses the relationship between Web Mercator tile resolution and
 * physical paper size:
 *
 *   At zoom z, one tile covers (circumference × cos(lat)) / 2^z meters
 *   horizontally in 256 pixels.
 *
 *   Paper DPI context: we want `targetWidthMM` mm of paper to show
 *   `targetWidthMM × scaleDenominator` mm of the real world.
 *
 *   Resolution needed: (scaleDenominator × targetWidthMM / 1000) meters
 *   shown in targetWidthPx pixels.
 *
 *   metersPerPixel_needed = (scaleDenominator × targetWidthMM) / (1000 × targetWidthPx)
 *
 *   At zoom z: metersPerPixel = (40075016.686 × cos(lat)) / (256 × 2^z)
 *
 *   Solving for z:
 *   2^z = (40075016.686 × cos(lat) × targetWidthPx) / (256 × scaleDenominator × targetWidthMM / 1000)
 *   z = log2( ... )
 */
export function calculateZoomForScale(
  lat: number,
  scaleDenominator: number,
  targetWidthPx: number,
  targetWidthMM: number
): number {
  const EARTH_CIRCUMFERENCE_M = 40075016.686;
  const cosLat = Math.cos((Math.abs(lat) * Math.PI) / 180);

  // Real-world meters that targetWidthMM of paper represents at this scale
  const realWorldWidthM = (scaleDenominator * targetWidthMM) / 1000;

  // Meters per pixel needed
  const mppNeeded = realWorldWidthM / targetWidthPx;

  // At zoom z, mpp = (EARTH_CIRCUMFERENCE_M * cosLat) / (256 * 2^z)
  // 2^z = (EARTH_CIRCUMFERENCE_M * cosLat) / (256 * mppNeeded)
  const pow2z = (EARTH_CIRCUMFERENCE_M * cosLat) / (256 * mppNeeded);
  const z = Math.log2(pow2z);

  return Math.max(1, Math.min(19, Math.floor(z)));
}

// ─── Tile grid computation ──────────────────────────────────────────────────

/**
 * Compute the tile grid (integer tile coordinates) that fully covers
 * a geographic bounding box at a given zoom level.
 */
export function computeTileGrid(bbox: BBox, zoom: number): TileGrid {
  const [minLng, minLat, maxLng, maxLat] = bbox;

  // Floor for start (top-left), ceil for end (bottom-right)
  // Note: higher lat → lower tileY (north is up in Mercator)
  const startX = Math.floor(lngToTileX(minLng, zoom));
  const endX = Math.ceil(lngToTileX(maxLng, zoom));
  const startY = Math.floor(latToTileY(maxLat, zoom)); // maxLat → smaller Y
  const endY = Math.ceil(latToTileY(minLat, zoom));     // minLat → larger Y

  return {
    startX,
    startY,
    endX,
    endY,
    tilesWide: endX - startX,
    tilesTall: endY - startY,
  };
}

// ─── Crop rect computation ──────────────────────────────────────────────────

/**
 * After stitching tiles into a mosaic (tilesWide × tilesTall × 256px),
 * compute the pixel rectangle within that mosaic that corresponds
 * exactly to the geographic bbox, then scale/crop to the desired
 * output dimensions.
 *
 * Returns the crop rect in mosaic pixel coordinates.
 */
export function computeCropRect(
  bbox: BBox,
  grid: TileGrid,
  zoom: number,
  targetWidthPx: number,
  targetHeightPx: number
): CropRect {
  const [minLng, minLat, maxLng, maxLat] = bbox;

  // Convert bbox corners to pixel positions within the mosaic
  const topLeft = geoToPixel(maxLat, minLng, grid.startX, grid.startY, zoom);
  const bottomRight = geoToPixel(minLat, maxLng, grid.startX, grid.startY, zoom);

  // The geographic region in mosaic pixels
  const geoWidth = bottomRight.x - topLeft.x;
  const geoHeight = bottomRight.y - topLeft.y;

  // We want to crop exactly matching the target aspect ratio.
  // The bbox was already aspect-corrected by computePaddedBBox,
  // so geoWidth/geoHeight should be very close to targetWidthPx/targetHeightPx.
  // Just center the crop to handle any rounding.
  const centerX = topLeft.x + geoWidth / 2;
  const centerY = topLeft.y + geoHeight / 2;

  // Use the geo region dimensions directly — the aspect ratio was pre-corrected
  const cropWidth = Math.max(1, geoWidth);
  const cropHeight = Math.max(1, geoHeight);

  // Clamp to mosaic bounds
  const mosaicWidth = grid.tilesWide * 256;
  const mosaicHeight = grid.tilesTall * 256;

  let left = Math.round(centerX - cropWidth / 2);
  let top = Math.round(centerY - cropHeight / 2);

  left = Math.max(0, Math.min(left, mosaicWidth - cropWidth));
  top = Math.max(0, Math.min(top, mosaicHeight - cropHeight));

  return {
    left,
    top,
    width: Math.round(Math.min(cropWidth, mosaicWidth - left)),
    height: Math.round(Math.min(cropHeight, mosaicHeight - top)),
  };
}

// ─── High-level pipeline ────────────────────────────────────────────────────

/**
 * Compute all map view parameters for a single map panel.
 *
 * Uses the SCALE-BASED GEOGRAPHIC WINDOW approach:
 *   1. The paper dimensions (mm) × scale denominator define the real-world
 *      extent shown in the map (e.g., 200mm at 1:5000 = 1000m).
 *   2. This window is centered on the parcel centroid.
 *   3. The zoom level is chosen so this window fills targetWidthPx pixels.
 *   4. The tile grid covers this window; NO crop is needed — the full
 *      mosaic is resized to fill the output dimensions.
 *
 * @param geoJson           Parcel GeoJSON (any format)
 * @param centerLat         Fallback center latitude if no GeoJSON
 * @param centerLng         Fallback center longitude if no GeoJSON
 * @param targetWidthPx     Output image width in pixels
 * @param targetHeightPx    Output image height in pixels
 * @param containerWidthMM  PDF container width in mm
 * @param containerHeightMM PDF container height in mm
 * @param scaleDenominator  Target scale (e.g. 5000 for 1:5000)
 */
export function computeMapViewParams(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  geoJson: any | null,
  centerLat: number,
  centerLng: number,
  targetWidthPx: number,
  targetHeightPx: number,
  containerWidthMM: number,
  containerHeightMM: number,
  scaleDenominator: number
): MapViewParams {
  // Step 1: Determine the parcel centroid (prefer GeoJSON, fall back to coords)
  const tightBBox = geoJson ? extractBBox(geoJson) : null;
  let cLat = centerLat;
  let cLng = centerLng;
  if (tightBBox) {
    cLat = (tightBBox[1] + tightBBox[3]) / 2;
    cLng = (tightBBox[0] + tightBBox[2]) / 2;
  }

  // Step 2: Compute geographic window from scale × paper dimensions
  //   200mm paper × 1:5000 scale → 200 × 5000 / 1000 = 1000m real-world width
  const cosLat = Math.cos((Math.abs(cLat) * Math.PI) / 180);
  const mPerDegLng = 111320 * cosLat;
  const mPerDegLat = 111320;

  const realWidthM = (scaleDenominator * containerWidthMM) / 1000;
  const realHeightM = (scaleDenominator * containerHeightMM) / 1000;

  const halfWidthDeg = realWidthM / 2 / mPerDegLng;
  const halfHeightDeg = realHeightM / 2 / mPerDegLat;

  const scaleBBox: BBox = [
    cLng - halfWidthDeg,
    cLat - halfHeightDeg,
    cLng + halfWidthDeg,
    cLat + halfHeightDeg,
  ];

  // Step 3: Calculate zoom so this window fills TARGET_PX_WIDTH pixels
  const zoom = calculateZoomForBBox(scaleBBox, targetWidthPx);

  // Step 4: Compute the tile grid that covers this window
  const grid = computeTileGrid(scaleBBox, zoom);

  // Step 5: Crop rect (geographic bbox within the mosaic)
  const crop = computeCropRect(
    scaleBBox,
    grid,
    zoom,
    targetWidthPx,
    targetHeightPx
  );

  return {
    bbox: scaleBBox,
    zoom,
    grid,
    crop,
    outputWidth: targetWidthPx,
    outputHeight: targetHeightPx,
  };
}
