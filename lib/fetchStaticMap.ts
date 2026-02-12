/**
 * Fetches static map images for Plan de situation PDF export.
 * Three views: aerial (Esri), IGN orthophoto, cadastral/plan (OSM).
 * No API key required.
 */

function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y };
}

const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";
const IGN_ORTHO =
  "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&TILEMATRIXSET=PM&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}";
const OSM_PLAN = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const TILE_TIMEOUT_MS = 8000;
const TILE_MAX_RETRIES = 2;

async function fetchTileAsBase64(url: string): Promise<string | null> {
  for (let attempt = 0; attempt <= TILE_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TILE_TIMEOUT_MS),
        headers: { Accept: "image/png,image/jpeg,image/*" },
      });
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      if (buf.byteLength === 0) continue;
      const base64 = Buffer.from(buf).toString("base64");
      if (base64.length > 0) return base64;
    } catch {
      // retry or return null
    }
  }
  return null;
}

/** Single aerial/satellite tile from Esri */
export async function fetchStaticMapBase64(
  lat: number,
  lng: number,
  zoom: number = 16
): Promise<string | null> {
  const { x, y } = latLngToTile(lat, lng, zoom);
  const url = `${ESRI_IMAGERY}/${zoom}/${y}/${x}`;
  return fetchTileAsBase64(url);
}

/** Three map views for A3 Plan de situation: aerial, IGN orthophoto, cadastral/plan */
export async function fetchThreeMapViews(
  lat: number,
  lng: number,
  zoom: number = 16
): Promise<{ aerial: string | null; ign: string | null; plan: string | null }> {
  const { x, y } = latLngToTile(lat, lng, zoom);

  const [aerial, ign, plan] = await Promise.all([
    fetchTileAsBase64(`${ESRI_IMAGERY}/${zoom}/${y}/${x}`),
    fetchTileAsBase64(
      IGN_ORTHO.replace("{z}", String(zoom)).replace("{y}", String(y)).replace("{x}", String(x))
    ),
    fetchTileAsBase64(
      OSM_PLAN.replace("{z}", String(zoom)).replace("{x}", String(x)).replace("{y}", String(y))
    ),
  ]);

  return { aerial, ign, plan };
}
