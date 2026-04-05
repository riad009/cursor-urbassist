import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import {
  computeMapViewParams,
  geoToPixel,
  type MapViewParams,
} from "@/lib/pdf/map-math";

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
 *
 * ────────────────────────────────────────────────────────────────────
 * This route dynamically calculates zoom and bounding box from:
 *   - The parcel GeoJSON polygon (if available)
 *   - The target French government scale (1:5000 for IGN, 1:2000 for Cadastre/Aerial)
 *   - The exact PDF container aspect ratio
 *
 * The tile mosaic is stitched, then cropped to pixel-perfect dimensions
 * matching the PDF layout containers in pc1-generator.ts.
 * ────────────────────────────────────────────────────────────────────
 */

// ─── PDF layout container definitions (mm) ──────────────────────────────────
// These MUST match the values in pc1-generator.ts addImage() calls.

const PDF_CONTAINERS = {
  IGN:      { widthMM: 200, heightMM: 235, scale: 5000 },
  CADASTRE: { widthMM: 195, heightMM: 80,  scale: 2000 },
  AERIAL:   { widthMM: 195, heightMM: 78,  scale: 2000 },
} as const;

// Target pixel widths for generated images.
// Higher = sharper in PDF but more tiles to fetch.
// 2400px @ 200mm = 305 DPI — crisp A3 PDF.
const TARGET_PX_WIDTH = 2400;

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

async function fetchTile(url: string): Promise<Buffer> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
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

// ─── Compose a map image using the new math pipeline ────────────────────────

async function generateMapImage(
  lat: number,
  lng: number,
  layerKey: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parcelGeoJson: any | null,
  containerWidthMM: number,
  containerHeightMM: number,
  scaleDenominator: number,
  addProjetLabel: boolean = false
): Promise<string> {
  const layer = LAYERS[layerKey];
  if (!layer) throw new Error(`Unknown layer: ${layerKey}`);

  // ── Compute view parameters from scale × paper dimensions ─────────
  const targetHeightPx = Math.round(
    TARGET_PX_WIDTH * (containerHeightMM / containerWidthMM)
  );

  const viewParams: MapViewParams = computeMapViewParams(
    parcelGeoJson,
    lat,
    lng,
    TARGET_PX_WIDTH,
    targetHeightPx,
    containerWidthMM,
    containerHeightMM,
    scaleDenominator
  );

  const { grid, crop, zoom } = viewParams;
  const { startX, startY, endX, endY, tilesWide, tilesTall } = grid;

  const mosaicWidth = tilesWide * 256;
  const mosaicHeight = tilesTall * 256;

  console.log(
    `[PC1] ${layerKey} z${zoom}: grid ${startX}-${endX} x ${startY}-${endY} ` +
    `(${tilesWide}×${tilesTall} tiles = ${mosaicWidth}×${mosaicHeight}px), ` +
    `crop: ${crop.left},${crop.top} ${crop.width}×${crop.height}, ` +
    `output: ${TARGET_PX_WIDTH}×${targetHeightPx}`
  );

  // ── Fetch all tiles ─────────────────────────────────────────────────
  const allTiles: { tx: number; ty: number }[] = [];
  for (let ty = startY; ty < endY; ty++) {
    for (let tx = startX; tx < endX; tx++) {
      allTiles.push({ tx, ty });
    }
  }

  const tileBuffers: { buffer: Buffer; x: number; y: number }[] = [];
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

  // ── Build composite operations ──────────────────────────────────────
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
      mosaicWidth,
      mosaicHeight
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
    const labelFontSize = Math.max(13, Math.round(mosaicWidth / 80));
    const circleR = Math.max(22, Math.round(mosaicWidth / 50));
    const rectW = Math.max(70, Math.round(mosaicWidth / 15));
    const rectH = Math.max(24, Math.round(mosaicWidth / 50));
    const projetSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${mosaicWidth}" height="${mosaicHeight}">
      <circle cx="${centerPx.x}" cy="${centerPx.y}" r="${circleR}" fill="none" stroke="red" stroke-width="3"/>
      <rect x="${centerPx.x + circleR + 6}" y="${centerPx.y - rectH / 2}" width="${rectW}" height="${rectH}" fill="#1a6bc9" rx="4"/>
      <text x="${centerPx.x + circleR + 6 + rectW / 2}" y="${centerPx.y + labelFontSize / 3}" text-anchor="middle" fill="white" font-size="${labelFontSize}" font-weight="bold" font-family="Helvetica,Arial,sans-serif">PROJET</text>
    </svg>`;
    compositeOps.push({
      input: Buffer.from(projetSvg),
      left: 0,
      top: 0,
    });
  }

  // ── PASS 1: Stitch tiles into mosaic PNG buffer ─────────────────────
  const mosaicBuffer = await sharp({
    create: {
      width: mosaicWidth,
      height: mosaicHeight,
      channels: 4,
      background: { r: 220, g: 220, b: 220, alpha: 1 },
    },
  })
    .composite(compositeOps)
    .png()
    .toBuffer();

  // ── PASS 2: Extract crop region → resize to exact output dims ───────
  const canCrop =
    crop.width > 0 &&
    crop.height > 0 &&
    crop.left >= 0 &&
    crop.top >= 0 &&
    crop.left + crop.width <= mosaicWidth &&
    crop.top + crop.height <= mosaicHeight;

  let outputPipeline = sharp(mosaicBuffer);

  if (canCrop) {
    outputPipeline = outputPipeline.extract({
      left: crop.left,
      top: crop.top,
      width: crop.width,
      height: crop.height,
    });
  }

  const imageBuffer = await outputPipeline
    .resize(TARGET_PX_WIDTH, targetHeightPx, { fit: "fill" })
    .jpeg({ quality: 90 })
    .toBuffer();

  console.log(
    `[PC1] ${layerKey}: output image ${imageBuffer.length} bytes ` +
    `(${TARGET_PX_WIDTH}×${targetHeightPx})`
  );

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

    // Dynamic stroke width: thicker at lower zooms so polygon stays visible
    const strokeWidth = zoom <= 14 ? 5 : zoom <= 16 ? 4 : 3;

    let paths = "";
    for (const ring of coordRings) {
      const points = ring
        .map((coord: number[]) => {
          const px = geoToPixel(coord[1], coord[0], startTileX, startTileY, zoom);
          return `${px.x},${px.y}`;
        })
        .join(" ");
      paths += `<polygon points="${points}" fill="rgba(255,0,0,0.15)" stroke="#DC0000" stroke-width="${strokeWidth}" stroke-dasharray="12,6" />`;
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

    const parsedGeo =
      typeof parcelGeoJson === "string"
        ? JSON.parse(parcelGeoJson)
        : parcelGeoJson;

    console.log("[PC1] lat:", lat, "lng:", lng);
    console.log("[PC1] parcelGeoJson type:", parsedGeo?.type ?? "none");

    // ── Mode 2: Multi-layer (no `layer` param) ────────────────────────
    const singleLayerMode = body.layer != null;

    if (!singleLayerMode) {
      const [ignImage, cadastreImage, aerialImage] = await Promise.all([
        generateMapImage(
          lat, lng, "IGN", parsedGeo,
          PDF_CONTAINERS.IGN.widthMM,
          PDF_CONTAINERS.IGN.heightMM,
          PDF_CONTAINERS.IGN.scale,
          true // PROJET label
        ),
        generateMapImage(
          lat, lng, "CADASTRE", parsedGeo,
          PDF_CONTAINERS.CADASTRE.widthMM,
          PDF_CONTAINERS.CADASTRE.heightMM,
          PDF_CONTAINERS.CADASTRE.scale
        ),
        generateMapImage(
          lat, lng, "AERIAL", parsedGeo,
          PDF_CONTAINERS.AERIAL.widthMM,
          PDF_CONTAINERS.AERIAL.heightMM,
          PDF_CONTAINERS.AERIAL.scale
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
    const layerKey = (body.layer || "AERIAL").toUpperCase();

    if (!LAYERS[layerKey]) {
      return NextResponse.json(
        { error: `Unknown layer: ${layerKey}` },
        { status: 400 }
      );
    }

    // Legacy mode: use the AERIAL container dimensions as default
    const container = PDF_CONTAINERS[layerKey as keyof typeof PDF_CONTAINERS]
      || PDF_CONTAINERS.AERIAL;

    const image = await generateMapImage(
      lat, lng, layerKey, parsedGeo,
      container.widthMM,
      container.heightMM,
      container.scale
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
