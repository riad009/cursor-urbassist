/**
 * Satellite Imagery API — IGN WMTS Orthophoto Proxy
 *
 * Fetches satellite/aerial imagery tiles from IGN Géoportail WMTS service
 * and returns a stitched image cropped to the requested bounding box.
 *
 * Usage: GET /api/terrain/satellite?bbox=minLng,minLat,maxLng,maxLat&width=512&height=512
 */
import { NextRequest, NextResponse } from "next/server";

// ─── IGN WMTS Configuration ─────────────────────────────────────────────────

const WMTS_BASE = "https://data.geopf.fr/wmts";
const LAYER = "ORTHOIMAGERY.ORTHOPHOTOS";
const STYLE = "normal";
const FORMAT = "image/jpeg";
const TILE_MATRIX_SET = "PM"; // Web Mercator (EPSG:3857)
const TILE_SIZE = 256;

// ─── Mercator Math ──────────────────────────────────────────────────────────

function lngToTileX(lng: number, zoom: number): number {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
}

function latToTileY(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, zoom)
  );
}

function tileXToLng(x: number, zoom: number): number {
  return (x / Math.pow(2, zoom)) * 360 - 180;
}

function tileYToLat(y: number, zoom: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

// ─── Tile Fetching ──────────────────────────────────────────────────────────

async function fetchTile(z: number, x: number, y: number): Promise<ArrayBuffer | null> {
  const url = `${WMTS_BASE}?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile` +
    `&LAYER=${LAYER}&STYLE=${STYLE}&FORMAT=${encodeURIComponent(FORMAT)}` +
    `&TILEMATRIXSET=${TILE_MATRIX_SET}&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      return await res.arrayBuffer();
    }
    console.warn(`[satellite] Tile ${z}/${x}/${y} failed: ${res.status}`);
    return null;
  } catch (err) {
    console.warn(`[satellite] Tile ${z}/${x}/${y} fetch error:`, err);
    return null;
  }
}

// ─── API Handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const bboxStr = searchParams.get("bbox");
    const width = parseInt(searchParams.get("width") || "512", 10);
    const height = parseInt(searchParams.get("height") || "512", 10);

    if (!bboxStr) {
      return NextResponse.json({ error: "Missing bbox parameter" }, { status: 400 });
    }

    const [minLng, minLat, maxLng, maxLat] = bboxStr.split(",").map(Number);
    if ([minLng, minLat, maxLng, maxLat].some((v) => !Number.isFinite(v))) {
      return NextResponse.json({ error: "Invalid bbox values" }, { status: 400 });
    }

    // Choose zoom level based on requested resolution
    // Higher zoom = more detail. For a parcel (~50m wide), zoom 18-19 gives great detail.
    const bboxWidthDeg = maxLng - minLng;
    const pixelsNeeded = width;
    // At zoom z, the world is 256 * 2^z pixels wide, covering 360 degrees
    // pixels per degree = 256 * 2^z / 360
    // We want: bboxWidthDeg * pixelsPerDeg >= pixelsNeeded
    const zoom = Math.min(
      19,
      Math.max(
        10,
        Math.ceil(Math.log2((pixelsNeeded * 360) / (bboxWidthDeg * 256)))
      )
    );

    // Get tile range
    const tileMinX = lngToTileX(minLng, zoom);
    const tileMaxX = lngToTileX(maxLng, zoom);
    const tileMinY = latToTileY(maxLat, zoom); // Note: Y is inverted in tile coords
    const tileMaxY = latToTileY(minLat, zoom);

    const numTilesX = tileMaxX - tileMinX + 1;
    const numTilesY = tileMaxY - tileMinY + 1;

    // Safety: limit total tiles
    if (numTilesX * numTilesY > 64) {
      return NextResponse.json(
        { error: "Too many tiles requested. Narrow the bbox or reduce resolution." },
        { status: 400 }
      );
    }

    // Fetch all tiles in parallel
    const tilePromises: Promise<{ x: number; y: number; data: ArrayBuffer | null }>[] = [];
    for (let ty = tileMinY; ty <= tileMaxY; ty++) {
      for (let tx = tileMinX; tx <= tileMaxX; tx++) {
        tilePromises.push(
          fetchTile(zoom, tx, ty).then((data) => ({ x: tx - tileMinX, y: ty - tileMinY, data }))
        );
      }
    }

    const tiles = await Promise.all(tilePromises);

    // For simplicity, return the tile grid info + individual tile URLs
    // The client will stitch them using a canvas
    const tileUrls: string[][] = [];
    for (let ty = tileMinY; ty <= tileMaxY; ty++) {
      const row: string[] = [];
      for (let tx = tileMinX; tx <= tileMaxX; tx++) {
        row.push(
          `${WMTS_BASE}?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile` +
            `&LAYER=${LAYER}&STYLE=${STYLE}&FORMAT=${encodeURIComponent(FORMAT)}` +
            `&TILEMATRIXSET=${TILE_MATRIX_SET}&TILEMATRIX=${zoom}&TILEROW=${ty}&TILECOL=${tx}`
        );
      }
      tileUrls.push(row);
    }

    // Compute the geo bounds of the tile grid (for UV mapping)
    const gridMinLng = tileXToLng(tileMinX, zoom);
    const gridMaxLng = tileXToLng(tileMaxX + 1, zoom);
    const gridMinLat = tileYToLat(tileMaxY + 1, zoom);
    const gridMaxLat = tileYToLat(tileMinY, zoom);

    return NextResponse.json({
      zoom,
      tileUrls,
      tileSize: TILE_SIZE,
      gridBounds: {
        minLng: gridMinLng,
        maxLng: gridMaxLng,
        minLat: gridMinLat,
        maxLat: gridMaxLat,
      },
      requestedBounds: { minLng, minLat, maxLng, maxLat },
      numTiles: { x: numTilesX, y: numTilesY },
    });
  } catch (err) {
    console.error("[satellite] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
