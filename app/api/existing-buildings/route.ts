import { NextRequest, NextResponse } from "next/server";
import * as turf from "@turf/turf";
import type { Feature, Polygon, MultiPolygon, FeatureCollection, GeoJsonProperties } from "geojson";
import { ignFetchWithRetry } from "@/lib/ign-fetch";

/**
 * POST /api/existing-buildings
 *
 * Fetch existing building footprints from the IGN Géoplateforme WFS
 * (BDTOPO_V3:batiment — official French topographic database, quarterly updated).
 *
 * The buildings are spatially clipped to the provided parcel polygon(s),
 * ensuring only buildings that actually intersect the selected parcels are returned.
 *
 * Body: { parcelGeometry: GeoJSON Polygon | MultiPolygon | FeatureCollection }
 * Response: { buildings: GeoJSON FeatureCollection, count: number, source: "bdtopo" }
 */

const IGN_WFS_BASE = "https://data.geopf.fr/wfs/ows";
const BDTOPO_LAYER = "BDTOPO_V3:batiment";

type ParcelGeoJSON = Feature<Polygon | MultiPolygon> | Polygon | MultiPolygon | FeatureCollection;

function normaliseToFeature(geom: ParcelGeoJSON): Feature<Polygon | MultiPolygon> | null {
  if (!geom) return null;
  if (geom.type === "FeatureCollection") {
    // Merge all features into one MultiPolygon via union
    const features = (geom as FeatureCollection).features.filter(
      (f) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"
    ) as Feature<Polygon | MultiPolygon>[];
    if (features.length === 0) return null;
    if (features.length === 1) return features[0];
    let merged: Feature<Polygon | MultiPolygon> = features[0];
    for (let i = 1; i < features.length; i++) {
      try {
        const result = turf.union(turf.featureCollection([merged, features[i]]));
        if (result) merged = result as Feature<Polygon | MultiPolygon>;
      } catch (e) {
        console.warn("normaliseToFeature: union failed for feature", i, e);
        // Skip this feature but continue with others
      }
    }
    return merged;
  }
  if (geom.type === "Feature") return geom as Feature<Polygon | MultiPolygon>;
  if (geom.type === "Polygon" || geom.type === "MultiPolygon") {
    return { type: "Feature", geometry: geom as Polygon | MultiPolygon, properties: {} };
  }
  return null;
}

export async function POST(req: NextRequest) {
  let body: { parcelGeometry?: ParcelGeoJSON };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.parcelGeometry) {
    return NextResponse.json(
      { error: "parcelGeometry is required (GeoJSON Polygon, MultiPolygon, or FeatureCollection)" },
      { status: 400 }
    );
  }

  const parcelFeature = normaliseToFeature(body.parcelGeometry);
  if (!parcelFeature) {
    return NextResponse.json(
      { error: "Could not parse parcelGeometry as a valid GeoJSON polygon" },
      { status: 400 }
    );
  }

  // Compute bounding box [minLng, minLat, maxLng, maxLat]
  const [minLng, minLat, maxLng, maxLat] = turf.bbox(parcelFeature);

  // Add a small buffer (~5m in degrees) to catch buildings that cross the exact boundary
  const BUFFER_DEG = 0.00005;
  const bboxStr = `${minLng - BUFFER_DEG},${minLat - BUFFER_DEG},${maxLng + BUFFER_DEG},${maxLat + BUFFER_DEG},EPSG:4326`;

  const wfsUrl = new URL(IGN_WFS_BASE);
  wfsUrl.searchParams.set("SERVICE", "WFS");
  wfsUrl.searchParams.set("VERSION", "2.0.0");
  wfsUrl.searchParams.set("REQUEST", "GetFeature");
  wfsUrl.searchParams.set("TYPENAMES", BDTOPO_LAYER);
  wfsUrl.searchParams.set("OUTPUTFORMAT", "application/json");
  wfsUrl.searchParams.set("BBOX", bboxStr);
  wfsUrl.searchParams.set("COUNT", "500"); // max 500 buildings per query

  try {
    // Use resilient fetch with 1 retry and WFS XML error detection
    const wfsResult = await ignFetchWithRetry<FeatureCollection>(wfsUrl.toString(), {
      maxRetries: 1,
      timeoutMs: 15000,
      backoffBaseMs: 500,
    });

    if (!wfsResult.ok || !wfsResult.data) {
      console.error("IGN BDTOPO WFS error:", wfsResult.error, `(${wfsResult.attempts} attempts)`);
      return NextResponse.json({
        buildings: { type: "FeatureCollection", features: [] } as FeatureCollection,
        count: 0,
        source: "bdtopo",
        message: "IGN BDTOPO WFS unavailable. You can manually draw existing buildings.",
      });
    }

    const wfsData = wfsResult.data;

    if (!wfsData.features || wfsData.features.length === 0) {
      return NextResponse.json({
        buildings: { type: "FeatureCollection", features: [] } as FeatureCollection,
        count: 0,
        source: "bdtopo",
        message: "Aucun bâtiment existant détecté sur les parcelles sélectionnées.",
      });
    }

    // Clip: keep only buildings that actually intersect the parcel polygon(s)
    const clipped = wfsData.features.filter((f) => {
      if (!f.geometry) return false;
      try {
        return turf.booleanIntersects(f as Feature, parcelFeature);
      } catch {
        return false;
      }
    });

    // Normalise and enrich each building feature
    const buildings: FeatureCollection<Polygon | MultiPolygon, GeoJsonProperties> = {
      type: "FeatureCollection",
      features: clipped
        .filter(
          (f) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"
        )
        .map((f) => {
          const props = f.properties ?? {};
          return {
            type: "Feature",
            geometry: f.geometry as Polygon | MultiPolygon,
            properties: {
              // IGN BDTOPO attribute names
              id: props.id ?? props.cleabs ?? f.id ?? `bdtopo-${Math.random().toString(36).slice(2)}`,
              usage: props.usage_1 ?? props.usage ?? "Indéterminé",
              height: typeof props.hauteur === "number" ? props.hauteur : null,
              floors: typeof props.nombre_d_etages === "number" ? props.nombre_d_etages : null,
              roofMaterial: props.materiaux_de_la_toiture ?? null,
              wallMaterial: props.materiaux_des_murs ?? null,
              constructionYear: props.date_de_construction ?? null,
              source: "bdtopo",
            },
          };
        }),
    };

    return NextResponse.json({
      buildings,
      count: buildings.features.length,
      source: "bdtopo",
    });
  } catch (error) {
    console.error("Error fetching IGN BDTOPO buildings:", error);
    return NextResponse.json({
      buildings: { type: "FeatureCollection", features: [] } as FeatureCollection,
      count: 0,
      source: "bdtopo",
      message: "Impossible de récupérer les bâtiments depuis IGN BDTOPO. Vous pouvez les dessiner manuellement.",
    });
  }
}

/**
 * GET kept for backward-compatibility but now returns an error pointing to POST.
 */
export async function GET() {
  return NextResponse.json(
    { error: "Use POST /api/existing-buildings with { parcelGeometry } body. GET is no longer supported." },
    { status: 405 }
  );
}
