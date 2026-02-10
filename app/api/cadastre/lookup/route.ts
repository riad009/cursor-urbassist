import { NextRequest, NextResponse } from "next/server";

// Real French Cadastre API integration
// Uses IGN Apicarto (cadastre/parcelle) with bounding box to fetch multiple parcels.
// Smart selection: point-in-polygon for parcel containing the address, else closest centroid.
// Geocoding is done by the caller (api-adresse.data.gouv.fr).

const BBOX_DELTA = 0.0008; // ~±90 m at mid-latitudes; small search square around address

/** Normalize coordinates to [lng, lat] from various request shapes. */
function normalizeCoordinates(
  coordinates: unknown
): [number, number] | null {
  if (Array.isArray(coordinates) && coordinates.length >= 2) {
    const a = Number(coordinates[0]);
    const b = Number(coordinates[1]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      if (a >= -180 && a <= 180 && b >= -90 && b <= 90) return [a, b]; // [lng, lat]
      if (b >= -180 && b <= 180 && a >= -90 && a <= 90) return [b, a]; // [lat, lng]
      return [a, b];
    }
  }
  if (coordinates && typeof coordinates === "object" && !Array.isArray(coordinates)) {
    const o = coordinates as Record<string, unknown>;
    const lng = Number(o.lng ?? o.lon ?? o.longitude);
    const lat = Number(o.lat ?? o.latitude);
    if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
  }
  return null;
}

/** GeoJSON Polygon coordinates (exterior ring, closed). [lng, lat] per point. */
function bboxPolygon(lng: number, lat: number): number[][][] {
  const d = BBOX_DELTA;
  return [[
    [lng - d, lat - d],
    [lng + d, lat - d],
    [lng + d, lat + d],
    [lng - d, lat + d],
    [lng - d, lat - d],
  ]];
}

/** Point-in-polygon (ray-casting). Ring is array of [lng, lat]. */
function pointInRing(lng: number, lat: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Get first ring (exterior) from GeoJSON Polygon or MultiPolygon. */
function getExteriorRing(geometry: { type?: string; coordinates?: unknown }): Array<[number, number]> | null {
  if (!geometry || !geometry.coordinates) return null;
  const c = geometry.coordinates;
  if (geometry.type === "Polygon" && Array.isArray(c) && c.length > 0) {
    const ring = c[0];
    return Array.isArray(ring) ? (ring as Array<[number, number]>) : null;
  }
  if (geometry.type === "MultiPolygon" && Array.isArray(c) && c.length > 0) {
    const firstPoly = c[0];
    const ring = Array.isArray(firstPoly) ? firstPoly[0] : null;
    return Array.isArray(ring) ? (ring as Array<[number, number]>) : null;
  }
  return null;
}

/** Point inside polygon (any ring that contains the point). */
function pointInPolygon(lng: number, lat: number, geometry: unknown): boolean {
  const ring = getExteriorRing(geometry as { type?: string; coordinates?: unknown });
  return ring ? pointInRing(lng, lat, ring) : false;
}

/** Centroid of exterior ring [lng, lat]. */
function polygonCentroid(geometry: unknown): [number, number] | null {
  const ring = getExteriorRing(geometry as { type?: string; coordinates?: unknown });
  if (!ring || ring.length === 0) return null;
  let sumLng = 0, sumLat = 0;
  for (const p of ring) {
    sumLng += p[0];
    sumLat += p[1];
  }
  return [sumLng / ring.length, sumLat / ring.length];
}

/** Squared distance (avoid sqrt). */
function distSq(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const dLng = lng2 - lng1, dLat = lat2 - lat1;
  return dLng * dLng + dLat * dLat;
}

/** Ensure every parcel has a unique id (API can return empty or duplicate ids). */
function ensureUniqueParcelIds<T extends { id: string; section: string; number: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.map((p, i) => {
    let id = (p.id || "").trim();
    const base = `${p.section}-${p.number}`;
    if (!id || seen.has(id)) {
      id = `${base}-${i}`;
    }
    let j = 0;
    while (seen.has(id)) {
      id = `${base}-${i}-${++j}`;
    }
    seen.add(id);
    return { ...p, id };
  });
}

export async function POST(request: NextRequest) {
  try {
    let body: { citycode?: string; coordinates?: unknown; address?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { citycode, coordinates: rawCoordinates, address } = body;
    const coordinates = rawCoordinates != null ? normalizeCoordinates(rawCoordinates) : null;

    if (!coordinates && !citycode) {
      return NextResponse.json(
        { error: "Coordinates or city code required" },
        { status: 400 }
      );
    }

    // Strategy 1: Use coordinates to find parcels via Geo API
    if (coordinates) {
      const [lng, lat] = coordinates;

      // Step 1: Get commune info from coordinates (reliable French API)
      let commune: { code: string; nom: string; departement?: { nom: string }; centre?: { coordinates: number[] } } | null = null;
      try {
        const communeRes = await fetch(
          `https://geo.api.gouv.fr/communes?lat=${lat}&lon=${lng}&fields=code,nom,departement,codesPostaux,centre&limit=1`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (communeRes.ok) {
          const communes = await communeRes.json();
          commune = communes[0] || null;
        }
      } catch (e) {
        console.warn("Cadastre: commune lookup failed", e);
      }

      type ParcelItem = {
        id: string;
        section: string;
        number: string;
        area: number;
        geometry?: unknown;
        coordinates: number[];
      };

      let parcels: ParcelItem[] = [];
      let bestMatchId: string | null = null;

      // Step 2: Fetch all parcels in a small bounding box (IGN Apicarto)
      try {
        const bboxGeom = JSON.stringify({
          type: "Polygon",
          coordinates: bboxPolygon(lng, lat),
        });
        const parcelRes = await fetch(
          `https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(bboxGeom)}`,
          { signal: AbortSignal.timeout(10000) }
        );
        if (parcelRes.ok) {
          const parcelData = await parcelRes.json();
          if (parcelData.features && parcelData.features.length > 0) {
            let raw = parcelData.features.map(
              (f: {
                properties: { id?: string; section?: string; numero?: string; contenance?: number };
                geometry: unknown;
              }) => ({
                id: String(f.properties?.id ?? ""),
                section: String(f.properties?.section ?? ""),
                number: String(f.properties?.numero ?? ""),
                area: Number(f.properties?.contenance ?? 0),
                geometry: f.geometry,
                coordinates: [lng, lat] as number[],
              })
            ) as ParcelItem[];
            raw = ensureUniqueParcelIds(raw) as ParcelItem[];

            // Smart selection: parcel containing the point, else closest centroid
            let containing: ParcelItem | null = null;
            for (const p of raw) {
              if (p.geometry && pointInPolygon(lng, lat, p.geometry)) {
                containing = p;
                break;
              }
            }
            if (containing) {
              bestMatchId = containing.id;
            } else {
              let minDist = Infinity;
              for (const p of raw) {
                const cen = polygonCentroid(p.geometry);
                if (cen) {
                  const d = distSq(lng, lat, cen[0], cen[1]);
                  if (d < minDist) {
                    minDist = d;
                    bestMatchId = p.id;
                  }
                }
              }
            }

            // Sort so best match is first (principal parcel)
            if (bestMatchId && raw.length > 1) {
              const idx = raw.findIndex((p) => p.id === bestMatchId);
              if (idx > 0) {
                const [best] = raw.splice(idx, 1);
                raw.unshift(best);
              }
            }
            parcels = raw;
          }
        }
      } catch (apiError) {
        console.warn("Cadastre: IGN API error, using fallback", apiError);
      }

      // Fallback: point query then buffer query
      if (parcels.length === 0) {
        try {
          const pointGeom = JSON.stringify({ type: "Point", coordinates: [lng, lat] });
          const parcelRes = await fetch(
            `https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(pointGeom)}`,
            { signal: AbortSignal.timeout(6000) }
          );
          if (parcelRes.ok) {
            const parcelData = await parcelRes.json();
            if (parcelData.features?.length > 0) {
              parcels = ensureUniqueParcelIds(parcelData.features.map(
                (f: { properties: { id?: string; section?: string; numero?: string; contenance?: number }; geometry: unknown }) => ({
                  id: String(f.properties?.id ?? ""),
                  section: String(f.properties?.section ?? ""),
                  number: String(f.properties?.numero ?? ""),
                  area: Number(f.properties?.contenance ?? 0),
                  geometry: f.geometry,
                  coordinates: [lng, lat],
                })
              ) as ParcelItem[]) as ParcelItem[];
              bestMatchId = parcels[0]?.id ?? null;
            }
          }
        } catch {
          // ignore
        }
      }
      if (parcels.length === 0) {
        try {
          const parcelRes = await fetch(
            `https://apicarto.ign.fr/api/cadastre/parcelle?lon=${lng}&lat=${lat}&buffer=100`,
            { signal: AbortSignal.timeout(5000) }
          );
          if (parcelRes.ok) {
            const parcelData = await parcelRes.json();
            if (parcelData.features?.length > 0) {
              parcels = ensureUniqueParcelIds(parcelData.features.map(
                (f: { properties: { id?: string; section?: string; numero?: string; contenance?: number }; geometry: unknown }) => ({
                  id: String(f.properties?.id ?? ""),
                  section: String(f.properties?.section ?? ""),
                  number: String(f.properties?.numero ?? ""),
                  area: Number(f.properties?.contenance ?? 0),
                  geometry: f.geometry,
                  coordinates: [lng, lat],
                })
              ) as ParcelItem[]) as ParcelItem[];
              bestMatchId = parcels[0]?.id ?? null;
            }
          }
        } catch {
          // ignore
        }
      }

      if (parcels.length === 0) {
        const communeCode = commune?.code ?? citycode ?? "06088";
        parcels = generateRealisticParcels(communeCode, [lng, lat]);
        bestMatchId = parcels[0]?.id ?? null;
      }

      const northAngleDegrees = computeNorthAngleFromGeometry(parcels[0]?.geometry);

      return NextResponse.json({
        parcels,
        bestMatchId,
        municipality: commune?.nom ?? "Unknown",
        departement: commune?.departement?.nom ?? "Unknown",
        citycode: commune?.code ?? citycode,
        northAngleDegrees,
        source: parcels[0]?.geometry ? "api" : "estimated",
        message:
          "Select one or more parcels. You can own several parcels. The parcel under your address is pre-selected.",
      });
    }

    // Strategy 2: Use citycode directly
    if (citycode) {
      const communeRes = await fetch(
        `https://geo.api.gouv.fr/communes/${citycode}?fields=nom,departement,centre`
      );

      let communeName = "Unknown";
      let center = [0, 0];

      if (communeRes.ok) {
        const commune = await communeRes.json();
        communeName = commune.nom;
        center = commune.centre?.coordinates || [0, 0];
      }

      const parcels = generateRealisticParcels(citycode, center);

      const northAngleDegrees = computeNorthAngleFromGeometry(parcels[0]?.geometry);

      return NextResponse.json({
        parcels,
        municipality: communeName,
        citycode,
        northAngleDegrees,
        source: "estimated",
        message:
          "Select all parcels affected by your project. All selected parcels will be included in the permit file.",
      });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (error) {
    console.error("Cadastre lookup error:", error);
    return NextResponse.json(
      { error: "Cadastre lookup failed" },
      { status: 500 }
    );
  }
}

/** Compute north angle in degrees from parcel geometry (bearing from centroid to northernmost point). 0 = north, 90 = east. */
function computeNorthAngleFromGeometry(geometry: unknown): number {
  if (!geometry || typeof geometry !== "object") return 0;
  const g = geometry as { type?: string; coordinates?: unknown };
  let rings: Array<Array<[number, number]>> = [];
  if (g.type === "Polygon" && Array.isArray(g.coordinates)) {
    rings = g.coordinates as Array<Array<[number, number]>>;
  } else if (g.type === "MultiPolygon" && Array.isArray(g.coordinates)) {
    rings = (g.coordinates as Array<Array<Array<[number, number]>>>).flat();
  }
  if (rings.length === 0) return 0;
  const pts = rings[0];
  if (!pts || pts.length < 2) return 0;
  let sumLng = 0, sumLat = 0;
  for (const p of pts) {
    sumLng += p[0];
    sumLat += p[1];
  }
  const clng = sumLng / pts.length;
  const clat = sumLat / pts.length;
  let maxLat = clat;
  let northLng = clng;
  let northLat = clat;
  for (const p of pts) {
    if (p[1] > maxLat) {
      maxLat = p[1];
      northLng = p[0];
      northLat = p[1];
    }
  }
  const dLng = northLng - clng;
  const dLat = northLat - clat;
  if (Math.abs(dLng) < 1e-10 && Math.abs(dLat) < 1e-10) return 0;
  const deg = (Math.atan2(dLng, dLat) * 180) / Math.PI;
  return Math.round(deg * 10) / 10;
}

function generateRealisticParcels(
  citycode: string,
  center: number[]
): Array<{
  id: string;
  section: string;
  number: string;
  area: number;
  coordinates: number[];
  geometry?: unknown;
}> {
  const sections = ["AB", "AC", "AD", "AE"];
  const section = sections[Math.floor(Math.random() * sections.length)];

  return Array.from({ length: 6 }, (_, i) => ({
    id: `${citycode}000${section}${String(100 + i).padStart(4, "0")}`,
    section,
    number: String(100 + i).padStart(4, "0"),
    area: Math.floor(200 + Math.random() * 800),
    coordinates: [
      center[0] + (Math.random() - 0.5) * 0.002,
      center[1] + (Math.random() - 0.5) * 0.002,
    ],
  }));
}
