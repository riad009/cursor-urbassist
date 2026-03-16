/**
 * Map Tiles API — OpenTopoMap Proxy
 *
 * Fetches topographic map tiles from OpenTopoMap (green terrain shading,
 * blue water, roads, contour lines — like Google Earth map view).
 * Returns tile URLs for client-side stitching.
 *
 * Usage: GET /api/terrain/satellite?bbox=minLng,minLat,maxLng,maxLat&width=512&height=512
 */
import { NextRequest, NextResponse } from "next/server";

// ─── Tile Configuration ─────────────────────────────────────────────────

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

// ─── Tile URL Builder ───────────────────────────────────────────────────

function getTileUrl(z: number, x: number, y: number): string {
  // OpenTopoMap — green terrain shading, blue water, contour lines
  return `https://tile.opentopomap.org/${z}/${x}/${y}.png`;
}

// ─── API Handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const bboxStr = searchParams.get("bbox");
    const width = parseInt(searchParams.get("width") || "512", 10);

    if (!bboxStr) {
      return NextResponse.json({ error: "Missing bbox parameter" }, { status: 400 });
    }

    const [minLng, minLat, maxLng, maxLat] = bboxStr.split(",").map(Number);
    if ([minLng, minLat, maxLng, maxLat].some((v) => !Number.isFinite(v))) {
      return NextResponse.json({ error: "Invalid bbox values" }, { status: 400 });
    }

    // Choose zoom level — OpenTopoMap has green terrain at all zoom levels
    const bboxWidthDeg = maxLng - minLng;
    const pixelsNeeded = width;
    const zoom = Math.min(
      17,
      Math.max(
        13,
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

    // Build tile URLs for client-side stitching
    const tileUrls: string[][] = [];
    for (let ty = tileMinY; ty <= tileMaxY; ty++) {
      const row: string[] = [];
      for (let tx = tileMinX; tx <= tileMaxX; tx++) {
        row.push(getTileUrl(zoom, tx, ty));
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
    console.error("[map-tiles] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
