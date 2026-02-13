import { NextRequest, NextResponse } from "next/server";

// Real French Cadastre API integration
// Uses IGN Apicarto (cadastre/parcelle) with bounding box to fetch parcels.
// Smart selection: point-in-polygon for parcel containing the address, else closest centroid.
//
// OPTIMIZED: All API calls run in parallel where possible, with reduced timeouts.

const DEG_PER_M = 0.000009;
const DEFAULT_BUFFER_M = 120;

function normalizeCoordinates(coordinates: unknown): [number, number] | null {
  if (Array.isArray(coordinates) && coordinates.length >= 2) {
    const a = Number(coordinates[0]);
    const b = Number(coordinates[1]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      if (a >= -180 && a <= 180 && b >= -90 && b <= 90) return [a, b];
      if (b >= -180 && b <= 180 && a >= -90 && a <= 90) return [b, a];
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

function bboxPolygon(lng: number, lat: number, bufferMeters: number = DEFAULT_BUFFER_M): number[][][] {
  const d = bufferMeters * DEG_PER_M;
  return [[
    [lng - d, lat - d], [lng + d, lat - d],
    [lng + d, lat + d], [lng - d, lat + d],
    [lng - d, lat - d],
  ]];
}

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

function getExteriorRing(geometry: { type?: string; coordinates?: unknown }): Array<[number, number]> | null {
  if (!geometry || !geometry.coordinates) return null;
  const c = geometry.coordinates;
  if (geometry.type === "Polygon" && Array.isArray(c) && c.length > 0) {
    return Array.isArray(c[0]) ? (c[0] as Array<[number, number]>) : null;
  }
  if (geometry.type === "MultiPolygon" && Array.isArray(c) && c.length > 0) {
    const ring = Array.isArray(c[0]) ? (c[0] as unknown[])[0] : null;
    return Array.isArray(ring) ? (ring as Array<[number, number]>) : null;
  }
  return null;
}

function pointInPolygon(lng: number, lat: number, geometry: unknown): boolean {
  const ring = getExteriorRing(geometry as { type?: string; coordinates?: unknown });
  return ring ? pointInRing(lng, lat, ring) : false;
}

function polygonCentroid(geometry: unknown): [number, number] | null {
  const ring = getExteriorRing(geometry as { type?: string; coordinates?: unknown });
  if (!ring || ring.length === 0) return null;
  let sumLng = 0, sumLat = 0;
  for (const p of ring) { sumLng += p[0]; sumLat += p[1]; }
  return [sumLng / ring.length, sumLat / ring.length];
}

function distSq(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const dLng = lng2 - lng1, dLat = lat2 - lat1;
  return dLng * dLng + dLat * dLat;
}

function ensureUniqueParcelIds<T extends { id: string; section: string; number: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.map((p, i) => {
    let id = (p.id || "").trim();
    const base = `${p.section}-${p.number}`;
    if (!id || seen.has(id)) id = `${base}-${i}`;
    let j = 0;
    while (seen.has(id)) id = `${base}-${i}-${++j}`;
    seen.add(id);
    return { ...p, id };
  });
}

type ParcelItem = {
  id: string; section: string; number: string; area: number;
  geometry?: unknown; coordinates: number[];
};

function parseParcels(features: Array<{ properties: Record<string, unknown>; geometry: unknown }>, lng: number, lat: number): ParcelItem[] {
  return features.map(f => ({
    id: String(f.properties?.id ?? ""),
    section: String(f.properties?.section ?? ""),
    number: String(f.properties?.numero ?? ""),
    area: Number(f.properties?.contenance ?? 0),
    geometry: f.geometry,
    coordinates: [lng, lat],
  }));
}

async function fetchParcels(url: string, timeout: number): Promise<{ features: Array<{ properties: Record<string, unknown>; geometry: unknown }> } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    if (res.ok) {
      const data = await res.json();
      if (data.features?.length > 0) return data;
    }
  } catch { /* */ }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    let body: { citycode?: string; coordinates?: unknown; address?: string; bufferMeters?: number };
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { citycode, coordinates: rawCoordinates, bufferMeters: reqBuffer } = body;
    const coordinates = rawCoordinates != null ? normalizeCoordinates(rawCoordinates) : null;
    const bufferMeters = typeof reqBuffer === "number" && reqBuffer >= 50 && reqBuffer <= 400 ? reqBuffer : DEFAULT_BUFFER_M;

    if (!coordinates && !citycode) {
      return NextResponse.json({ error: "Coordinates or city code required" }, { status: 400 });
    }

    if (coordinates) {
      const [lng, lat] = coordinates;

      // ── Run commune + parcel lookups in PARALLEL ──────────────────────
      const bboxGeom = JSON.stringify({ type: "Polygon", coordinates: bboxPolygon(lng, lat, bufferMeters) });
      const pointGeom = JSON.stringify({ type: "Point", coordinates: [lng, lat] });

      const [communeResult, bboxResult, pointResult] = await Promise.allSettled([
        // Commune info
        fetch(`https://geo.api.gouv.fr/communes?lat=${lat}&lon=${lng}&fields=code,nom,departement,centre&limit=1`, { signal: AbortSignal.timeout(4000) })
          .then(async r => r.ok ? (await r.json())?.[0] ?? null : null).catch(() => null),
        // Primary: bbox query
        fetchParcels(`https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(bboxGeom)}`, 6000),
        // Parallel fallback: point query (in case bbox is too large / slow)
        fetchParcels(`https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(pointGeom)}`, 6000),
      ]);

      const commune = communeResult.status === "fulfilled" ? communeResult.value as { code: string; nom: string; departement?: { nom: string }; centre?: { coordinates: number[] } } | null : null;

      let parcels: ParcelItem[] = [];
      let bestMatchId: string | null = null;

      // Use bbox result (more parcels = better map) or fall back to point result
      const parcelData = (bboxResult.status === "fulfilled" && bboxResult.value)
        ? bboxResult.value
        : (pointResult.status === "fulfilled" && pointResult.value)
          ? pointResult.value
          : null;

      if (parcelData) {
        let raw = ensureUniqueParcelIds(parseParcels(parcelData.features, lng, lat));

        // Smart selection: find parcel containing the point
        let containing: ParcelItem | null = null;
        for (const p of raw) {
          if (p.geometry && pointInPolygon(lng, lat, p.geometry)) { containing = p; break; }
        }
        if (containing) {
          bestMatchId = containing.id;
        } else {
          let minDist = Infinity;
          for (const p of raw) {
            const cen = polygonCentroid(p.geometry);
            if (cen) { const d = distSq(lng, lat, cen[0], cen[1]); if (d < minDist) { minDist = d; bestMatchId = p.id; } }
          }
        }

        // Sort so best match is first
        if (bestMatchId && raw.length > 1) {
          const idx = raw.findIndex(p => p.id === bestMatchId);
          if (idx > 0) { const [best] = raw.splice(idx, 1); raw.unshift(best); }
        }
        parcels = raw;
      }

      // Fallback: generate estimated parcels
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
        message: "Select one or more parcels. You can own several parcels. The parcel under your address is pre-selected.",
      });
    }

    // Strategy 2: citycode only
    if (citycode) {
      const communeRes = await fetch(`https://geo.api.gouv.fr/communes/${citycode}?fields=nom,departement,centre`, { signal: AbortSignal.timeout(4000) });
      let communeName = "Unknown";
      let center = [0, 0];
      if (communeRes.ok) {
        const commune = await communeRes.json();
        communeName = commune.nom;
        center = commune.centre?.coordinates || [0, 0];
      }
      const parcels = generateRealisticParcels(citycode, center);
      return NextResponse.json({
        parcels,
        municipality: communeName,
        citycode,
        northAngleDegrees: computeNorthAngleFromGeometry(parcels[0]?.geometry),
        source: "estimated",
        message: "Select all parcels affected by your project.",
      });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (error) {
    console.error("Cadastre lookup error:", error);
    return NextResponse.json({ error: "Cadastre lookup failed" }, { status: 500 });
  }
}

function computeNorthAngleFromGeometry(geometry: unknown): number {
  if (!geometry || typeof geometry !== "object") return 0;
  const g = geometry as { type?: string; coordinates?: unknown };
  let rings: Array<Array<[number, number]>> = [];
  if (g.type === "Polygon" && Array.isArray(g.coordinates)) rings = g.coordinates as Array<Array<[number, number]>>;
  else if (g.type === "MultiPolygon" && Array.isArray(g.coordinates)) rings = (g.coordinates as Array<Array<Array<[number, number]>>>).flat();
  if (rings.length === 0) return 0;
  const pts = rings[0];
  if (!pts || pts.length < 2) return 0;
  let sumLng = 0, sumLat = 0;
  for (const p of pts) { sumLng += p[0]; sumLat += p[1]; }
  const clng = sumLng / pts.length, clat = sumLat / pts.length;
  let maxLat = clat, northLng = clng, northLat = clat;
  for (const p of pts) { if (p[1] > maxLat) { maxLat = p[1]; northLng = p[0]; northLat = p[1]; } }
  const dLng = northLng - clng, dLat = northLat - clat;
  if (Math.abs(dLng) < 1e-10 && Math.abs(dLat) < 1e-10) return 0;
  return Math.round((Math.atan2(dLng, dLat) * 180 / Math.PI) * 10) / 10;
}

function generateRealisticParcels(citycode: string, center: number[]): Array<{
  id: string; section: string; number: string; area: number; coordinates: number[]; geometry?: unknown;
}> {
  const sections = ["AB", "AC", "AD", "AE"];
  const section = sections[Math.floor(Math.random() * sections.length)];
  return Array.from({ length: 6 }, (_, i) => ({
    id: `${citycode}000${section}${String(100 + i).padStart(4, "0")}`,
    section,
    number: String(100 + i).padStart(4, "0"),
    area: Math.floor(200 + Math.random() * 800),
    coordinates: [center[0] + (Math.random() - 0.5) * 0.002, center[1] + (Math.random() - 0.5) * 0.002],
  }));
}
