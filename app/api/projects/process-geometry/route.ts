import { NextRequest, NextResponse } from "next/server";
import { processParcelGeometries, type ParcelInput } from "@/lib/gis-pipeline";

/**
 * POST /api/projects/process-geometry
 *
 * Backward-compatible endpoint. Now delegates to the shared gis-pipeline module.
 * This route is kept for any direct API callers, but the PRIMARY path is now
 * inline processing during project creation (POST /api/projects).
 */
export async function POST(req: NextRequest) {
  let body: { parcels?: ParcelInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.parcels || !Array.isArray(body.parcels) || body.parcels.length === 0) {
    return NextResponse.json(
      { error: "parcels array is required and must not be empty" },
      { status: 400 }
    );
  }

  const result = await processParcelGeometries(body.parcels);

  if (!result) {
    return NextResponse.json(
      { error: "No valid parcel geometries could be processed" },
      { status: 400 }
    );
  }

  // ── Step 2: Merge via turf.union → globalBoundary ─────────────────────────
  let merged: Feature<Polygon | MultiPolygon>;

  if (validFeatures.length === 1) {
    merged = validFeatures[0];
  } else {
    merged = validFeatures[0];
    for (let i = 1; i < validFeatures.length; i++) {
      try {
        const result = turf.union(
          turf.featureCollection([
            merged,
            validFeatures[i],
          ] as Feature<Polygon | MultiPolygon>[])
        );
        if (result) {
          merged = result as Feature<Polygon | MultiPolygon>;
        } else {
          failedIds.push(
            (validFeatures[i].properties as GeoJsonProperties)?.id ?? `index-${i}`
          );
        }
      } catch (e) {
        console.warn(`process-geometry: union failed for parcel index ${i}:`, e);
        failedIds.push(
          (validFeatures[i].properties as GeoJsonProperties)?.id ?? `index-${i}`
        );
      }
    }
  }

  const globalBoundary: Feature<Polygon | MultiPolygon> = {
    type: "Feature",
    geometry: merged.geometry,
    properties: {
      isContiguous: merged.geometry.type === "Polygon",
      sourceCount: validFeatures.length,
      failedIds,
    },
  };

  // ── Step 3: Extract vertices & calculate edges ────────────────────────────
  const boundaryVertexCoords = extractBoundaryVertices(globalBoundary.geometry);
  const { edges: rawEdges } = calculateEdges(globalBoundary.geometry);

  // ── Step 4: Compute refPoint (bbox center — not centroid) ─────────────────
  const [bboxMinLng, bboxMinLat, bboxMaxLng, bboxMaxLat] = turf.bbox(globalBoundary);
  const refPoint = {
    lng: (bboxMinLng + bboxMaxLng) / 2,
    lat: (bboxMinLat + bboxMaxLat) / 2,
  };

  // ── Step 5: Generate dense topography grid within the boundary ──────────
  // Use turf.pointGrid to create a ~5m-spaced grid of sample points inside
  // the global boundary. These will be used for smooth 3D terrain mesh.
  let topoGridCoords: [number, number][] = [];
  try {
    // Convert 5 metres to approximate degrees (~0.000045° at mid-latitudes)
    const cellSizeKm = 0.005; // 5m = 0.005km
    const grid = turf.pointGrid(
      [bboxMinLng, bboxMinLat, bboxMaxLng, bboxMaxLat],
      cellSizeKm,
      { units: "kilometers", mask: globalBoundary as Feature<Polygon> }
    );
    topoGridCoords = grid.features
      .map((f) => f.geometry.coordinates as [number, number])
      .filter(([lng, lat]) => isFinite(lng) && isFinite(lat));
    // Cap at 500 points to avoid IGN rate limits
    if (topoGridCoords.length > 500) {
      // Increase cell size and regenerate
      const scaleFactor = Math.ceil(Math.sqrt(topoGridCoords.length / 500));
      const biggerGrid = turf.pointGrid(
        [bboxMinLng, bboxMinLat, bboxMaxLng, bboxMaxLat],
        cellSizeKm * scaleFactor,
        { units: "kilometers", mask: globalBoundary as Feature<Polygon> }
      );
      topoGridCoords = biggerGrid.features
        .map((f) => f.geometry.coordinates as [number, number])
        .filter(([lng, lat]) => isFinite(lng) && isFinite(lat));
    }
  } catch (e) {
    console.warn("process-geometry: topography grid generation failed:", e);
    topoGridCoords = [];
  }

  // ── Step 6: Fetch NGF elevations for boundary vertices + topo grid ────────
  // Combine all coords into a single batch to minimize IGN API calls
  const allCoords: [number, number][] = [
    ...boundaryVertexCoords,
    ...topoGridCoords,
  ];
  const elevationMap = await fetchElevations(allCoords);

  // Build Vertex3D array for boundary vertices
  const vertices3D: Vertex3D[] = boundaryVertexCoords.map(([lng, lat]) => {
    const key = `${lng.toFixed(8)},${lat.toFixed(8)}`;
    const elevation = elevationMap.get(key) ?? 0;
    return { lng, lat, elevation };
  });

  // Build topography grid Vertex3D array
  const topographyGrid: Vertex3D[] = topoGridCoords
    .map(([lng, lat]) => {
      const key = `${lng.toFixed(8)},${lat.toFixed(8)}`;
      const elevation = elevationMap.get(key) ?? 0;
      return { lng, lat, elevation };
    })
    .filter((v) => v.elevation !== 0); // Only include points with valid elevation

  // Build EdgeMeasurement array with elevation data
  const edges: EdgeMeasurement[] = rawEdges.map((e) => {
    const fromKey = `${e.from[0].toFixed(8)},${e.from[1].toFixed(8)}`;
    const toKey = `${e.to[0].toFixed(8)},${e.to[1].toFixed(8)}`;
    return {
      from: {
        lng: e.from[0],
        lat: e.from[1],
        elevation: elevationMap.get(fromKey) ?? 0,
      },
      to: {
        lng: e.to[0],
        lat: e.to[1],
        elevation: elevationMap.get(toKey) ?? 0,
      },
      lengthMeters: e.lengthMeters,
    };
  });

  // ── Step 7: Compute elevation stats (using ALL elevation sources) ─────────
  const allElevations = [...vertices3D, ...topographyGrid]
    .map((v) => v.elevation)
    .filter((z) => z !== 0);
  const minElevation = allElevations.length > 0 ? Math.min(...allElevations) : 0;
  const maxElevation = allElevations.length > 0 ? Math.max(...allElevations) : 0;
  const meanElevation =
    allElevations.length > 0
      ? Math.round(
        (allElevations.reduce((s, v) => s + v, 0) / allElevations.length) * 100
      ) / 100
      : 0;

  // Compute slope between min and max elevation vertices
  let slopePercent: number | null = null;
  const allVerts = [...vertices3D, ...topographyGrid];
  if (allElevations.length >= 2 && maxElevation !== minElevation) {
    const minVtx = allVerts.find((v) => v.elevation === minElevation)!;
    const maxVtx = allVerts.find((v) => v.elevation === maxElevation)!;
    const horizDist = turf.distance(
      turf.point([minVtx.lng, minVtx.lat]),
      turf.point([maxVtx.lng, maxVtx.lat]),
      { units: "meters" }
    );
    if (horizDist > 0) {
      slopePercent =
        Math.round(((maxElevation - minElevation) / horizDist) * 100 * 100) / 100;
    }
  }

  // ── Step 8: Assemble & return ProcessedSiteData ───────────────────────────
  const result: ProcessedSiteData = {
    parcels: processedParcels,
    globalBoundary,
    edges,
    vertices3D,
    topographyGrid,
    refPoint,
    stats: {
      minElevation,
      maxElevation,
      meanElevation,
      slopePercent,
    },
  };

  return NextResponse.json(result);
}

