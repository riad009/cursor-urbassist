import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

/**
 * POST /api/location-plan/export-pdf
 *
 * Server-side tile composition for PC1 PDF export.
 * Fetches tiles DIRECTLY from data.geopf.fr (not through /api/map-tiles).
 *
 * Mode 1 (legacy): { lat, lng, zoom?, layer, parcelGeoJson? }
 *   → { image: "data:image/jpeg;base64,..." }
 *
 * Mode 2 (multi-layer): { lat, lng, parcelGeoJson?, projectData? }
 *   → { ignImage, cadastreImage, aerialImage } (base64 strings)
 */

// ─── Tile coordinate math ───────────────────────────────────────────────────

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

function tileToLng(x: number, zoom: number): number {
  return (x / Math.pow(2, zoom)) * 360 - 180;
}

function tileToLat(y: number, zoom: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** Convert a geographic coordinate to pixel position relative to a tile grid origin */
function geoToPixel(
  lat: number,
  lng: number,
  startTileX: number,
  startTileY: number,
  zoom: number
): { x: number; y: number } {
  const tileX = lngToTileX(lng, zoom);
  const tileLng = tileToLng(tileX, zoom);
  const nextTileLng = tileToLng(tileX + 1, zoom);
  const worldX =
    tileX * 256 +
    ((lng - tileLng) / (nextTileLng - tileLng)) * 256;

  const tileY = latToTileY(lat, zoom);
  const tileLat = tileToLat(tileY, zoom);
  const nextTileLat = tileToLat(tileY + 1, zoom);
  const worldY =
    tileY * 256 +
    ((tileLat - lat) / (tileLat - nextTileLat)) * 256;

  return {
    x: Math.round(worldX - startTileX * 256),
    y: Math.round(worldY - startTileY * 256),
  };
}

// ─── Layer configs (direct Géoplateforme URLs — NOT proxied) ────────────────

interface LayerConfig {
  buildUrl: (zoom: number, tx: number, ty: number) => string;
  outputFormat: "jpeg" | "png";
}

const LAYERS: Record<string, LayerConfig> = {
  AERIAL: {
    buildUrl: (z, tx, ty) =>
      `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0` +
      `&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM` +
      `&TILEMATRIX=${z}&TILEROW=${ty}&TILECOL=${tx}&FORMAT=image%2Fjpeg`,
    outputFormat: "jpeg",
  },
  IGN: {
    buildUrl: (z, tx, ty) =>
      `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0` +
      `&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM` +
      `&TILEMATRIX=${z}&TILEROW=${ty}&TILECOL=${tx}&FORMAT=image%2Fpng`,
    outputFormat: "png",
  },
  CADASTRE: {
    buildUrl: (z, tx, ty) =>
      `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0` +
      `&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&STYLE=normal&TILEMATRIXSET=PM` +
      `&TILEMATRIX=${z}&TILEROW=${ty}&TILECOL=${tx}&FORMAT=image%2Fpng`,
    outputFormat: "png",
  },
};

// ─── Fetch a single tile with proper headers ────────────────────────────────

async function fetchTile(
  url: string
): Promise<Buffer> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; UrbAssist/1.0)",
        Accept: "image/jpeg,image/png,image/*",
        Referer: "https://www.geoportail.gouv.fr/",
      },
    });

    if (!response.ok) {
      console.error("[PC1] tile failed:", url, response.status);
      return greyTile();
    }

    const ab = await response.arrayBuffer();
    if (ab.byteLength === 0) {
      console.error("[PC1] tile empty:", url);
      return greyTile();
    }

    return Buffer.from(ab);
  } catch (err) {
    console.error("[PC1] tile fetch error:", url, err);
    return greyTile();
  }
}

/** Create a 256×256 light grey fallback tile */
async function greyTile(): Promise<Buffer> {
  return sharp({
    create: {
      width: 256,
      height: 256,
      channels: 3,
      background: { r: 220, g: 220, b: 220 },
    },
  })
    .png()
    .toBuffer();
}

// ─── Compose a multi-tile map image ─────────────────────────────────────────

interface MapViewConfig {
  layerKey: string;
  zoom: number;
  tilesWide: number;  // number of tiles horizontally
  tilesTall: number;  // number of tiles vertically
}

async function generateMapImage(
  lat: number,
  lng: number,
  viewConfig: MapViewConfig,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parcelGeoJson?: any,
  addProjetLabel?: boolean
): Promise<string> {
  const { layerKey, zoom, tilesWide, tilesTall } = viewConfig;
  const layer = LAYERS[layerKey];
  if (!layer) throw new Error(`Unknown layer: ${layerKey}`);

  const centerTileX = lngToTileX(lng, zoom);
  const centerTileY = latToTileY(lat, zoom);

  const startX = centerTileX - Math.floor(tilesWide / 2);
  const startY = centerTileY - Math.floor(tilesTall / 2);
  const endX = startX + tilesWide;
  const endY = startY + tilesTall;

  const totalWidth = tilesWide * 256;
  const totalHeight = tilesTall * 256;

  console.log(`[PC1] ${layerKey} z${zoom}: center tile (${centerTileX},${centerTileY}), grid ${startX}-${endX} x ${startY}-${endY}, output ${totalWidth}x${totalHeight}`);

  // ── Fetch all tiles ─────────────────────────────────────────────────
  const tileBuffers: { buffer: Buffer; x: number; y: number }[] = [];

  // Fetch in parallel batches of 8
  const allTiles: { tx: number; ty: number }[] = [];
  for (let ty = startY; ty < endY; ty++) {
    for (let tx = startX; tx < endX; tx++) {
      allTiles.push({ tx, ty });
    }
  }

  const BATCH = 8;
  for (let i = 0; i < allTiles.length; i += BATCH) {
    const batch = allTiles.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async ({ tx, ty }) => {
        const url = layer.buildUrl(zoom, tx, ty);
        const buffer = await fetchTile(url);
        return {
          buffer,
          x: (tx - startX) * 256,
          y: (ty - startY) * 256,
        };
      })
    );
    tileBuffers.push(...results);
  }

  console.log(`[PC1] ${layerKey}: compositing ${tileBuffers.length} tiles`);

  // ── Compose tiles with sharp ────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const compositeOps: any[] = tileBuffers.map((t) => ({
    input: t.buffer,
    left: t.x,
    top: t.y,
  }));

  // ── Parcel overlay SVG ──────────────────────────────────────────────
  if (parcelGeoJson) {
    const svgOverlay = renderParcelSVG(
      parcelGeoJson,
      zoom,
      startX,
      startY,
      totalWidth,
      totalHeight
    );
    if (svgOverlay) {
      compositeOps.push({
        input: Buffer.from(svgOverlay),
        left: 0,
        top: 0,
      });
    }
  }

  // ── PROJET label for IGN view ───────────────────────────────────────
  if (addProjetLabel) {
    const centerPx = geoToPixel(lat, lng, startX, startY, zoom);
    const projetSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}">
      <circle cx="${centerPx.x}" cy="${centerPx.y}" r="22" fill="none" stroke="red" stroke-width="3"/>
      <rect x="${centerPx.x + 28}" y="${centerPx.y - 14}" width="70" height="24" fill="#1a6bc9" rx="4"/>
      <text x="${centerPx.x + 63}" y="${centerPx.y + 3}" text-anchor="middle" fill="white" font-size="13" font-weight="bold" font-family="Helvetica,Arial,sans-serif">PROJET</text>
    </svg>`;
    compositeOps.push({
      input: Buffer.from(projetSvg),
      left: 0,
      top: 0,
    });
  }

  // Compose everything onto a white background
  const imageBuffer = await sharp({
    create: {
      width: totalWidth,
      height: totalHeight,
      channels: 3,
      background: { r: 220, g: 220, b: 220 },
    },
  })
    .composite(compositeOps)
    .jpeg({ quality: 85 })
    .toBuffer();

  console.log(`[PC1] ${layerKey}: output image size ${imageBuffer.length} bytes`);

  return imageBuffer.toString("base64");
}

// ─── Parcel overlay SVG ─────────────────────────────────────────────────────

function renderParcelSVG(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  geoJson: any,
  zoom: number,
  startTileX: number,
  startTileY: number,
  width: number,
  height: number
): string | null {
  try {
    // Extract coordinates from GeoJSON
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let coordRings: any[] = [];
    const geom = extractGeometry(geoJson);
    if (!geom) return null;

    if (geom.type === "Polygon") {
      coordRings = geom.coordinates;
    } else if (geom.type === "MultiPolygon") {
      coordRings = geom.coordinates.flat();
    } else {
      return null;
    }

    if (coordRings.length === 0) return null;

    let paths = "";
    for (const ring of coordRings) {
      const points = ring
        .map((coord: number[]) => {
          const px = geoToPixel(coord[1], coord[0], startTileX, startTileY, zoom);
          return `${px.x},${px.y}`;
        })
        .join(" ");
      paths += `<polygon points="${points}" fill="rgba(255,0,0,0.2)" stroke="#ff0000" stroke-width="4" />`;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${paths}</svg>`;
  } catch (err) {
    console.error("[PC1] parcel SVG render error:", err);
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractGeometry(geoJson: any): any | null {
  if (!geoJson) return null;
  if (typeof geoJson === "string") {
    try {
      geoJson = JSON.parse(geoJson);
    } catch {
      return null;
    }
  }
  if (geoJson.type === "FeatureCollection")
    return geoJson.features?.[0]?.geometry;
  if (geoJson.type === "Feature") return geoJson.geometry;
  if (geoJson.type === "Polygon" || geoJson.type === "MultiPolygon")
    return geoJson;
  return null;
}

// ─── Route handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { parcelGeoJson, projectData } = body;

    // ── Robust coordinate extraction ──────────────────────────────────
    let lat: number;
    let lng: number;

    if (Array.isArray(body.lat)) {
      // coordinates passed as array [lng, lat]
      lng = body.lat[0];
      lat = body.lat[1];
    } else {
      lat = Number(body.lat);
      lng = Number(body.lng);
    }

    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
      return NextResponse.json(
        { error: "Invalid coordinates", lat, lng },
        { status: 400 }
      );
    }

    console.log("[PC1] lat:", lat, "lng:", lng);
    console.log("[PC1] parcelGeoJson type:", parcelGeoJson?.type ?? typeof parcelGeoJson);
    console.log("[PC1] center tile at zoom 16:", lngToTileX(lng, 16), latToTileY(lat, 16));
    console.log("[PC1] center tile at zoom 14:", lngToTileX(lng, 14), latToTileY(lat, 14));

    const parsedGeo =
      typeof parcelGeoJson === "string"
        ? JSON.parse(parcelGeoJson)
        : parcelGeoJson;

    // ── Mode 2: Multi-layer (no `layer` param) ────────────────────────
    const singleLayerMode = body.layer != null;

    if (!singleLayerMode) {
      // IGN at zoom 14: 4 tiles wide × 5 tiles tall = 1024×1280
      // CADASTRE at zoom 16: 5 tiles wide × 3 tiles tall = 1280×768
      // AERIAL at zoom 16: 5 tiles wide × 3 tiles tall = 1280×768
      const [ignImage, cadastreImage, aerialImage] = await Promise.all([
        generateMapImage(
          lat,
          lng,
          { layerKey: "IGN", zoom: 14, tilesWide: 4, tilesTall: 5 },
          parsedGeo,
          true // PROJET label
        ),
        generateMapImage(
          lat,
          lng,
          { layerKey: "CADASTRE", zoom: 16, tilesWide: 5, tilesTall: 3 },
          parsedGeo
        ),
        generateMapImage(
          lat,
          lng,
          { layerKey: "AERIAL", zoom: 16, tilesWide: 5, tilesTall: 3 },
          parsedGeo
        ),
      ]);

      return NextResponse.json({
        ignImage,
        cadastreImage,
        aerialImage,
        projectData: projectData || null,
      });
    }

    // ── Mode 1 (legacy): Single layer ─────────────────────────────────
    const zoom = body.zoom ?? 14;
    const layerKey = (body.layer || "AERIAL").toUpperCase();

    if (!LAYERS[layerKey]) {
      return NextResponse.json(
        { error: `Unknown layer: ${layerKey}` },
        { status: 400 }
      );
    }

    const image = await generateMapImage(
      lat,
      lng,
      { layerKey, zoom, tilesWide: 6, tilesTall: 4 },
      typeof parcelGeoJson === "string"
        ? JSON.parse(parcelGeoJson)
        : parcelGeoJson
    );

    const b64 =
      layerKey === "AERIAL"
        ? `data:image/jpeg;base64,${image}`
        : `data:image/png;base64,${image}`;

    return NextResponse.json({ image: b64 });
  } catch (err) {
    console.error("[export-pdf] Error:", err);
    return NextResponse.json(
      { error: "Failed to compose map image" },
      { status: 500 }
    );
  }
}
