import { NextRequest, NextResponse } from "next/server";
import { mergeParcelGeometries, type ParcelGeometry } from "@/lib/parcel-merge";

/**
 * POST /api/cadastre/merge
 * Merge multiple parcels into a single polygon using geometric union.
 *
 * Body: { parcelIds: string[] }
 * Returns: { success: true, merged: { geometry, area, ids } }
 */
export async function POST(request: NextRequest) {
  try {
    const { parcelIds } = await request.json();

    if (!Array.isArray(parcelIds) || parcelIds.length < 2) {
      return NextResponse.json(
        { error: "At least 2 parcel IDs required for merge" },
        { status: 400 }
      );
    }

    // Fetch parcel geometries from IGN Apicarto
    const parcels: ParcelGeometry[] = [];
    const fetchPromises = parcelIds.map(async (id: string) => {
      try {
        // Parse parcel ID: commune_prefix_section_number or similar
        const parts = id.split(/[_\s]+/);
        let commune = "";
        let section = "";
        let number = "";

        if (parts.length >= 4) {
          commune = parts[0] + parts[1]; // e.g., "34172" + "000" or just commune code
          section = parts[2];
          number = parts[3];
        } else if (parts.length >= 3) {
          commune = parts[0];
          section = parts[1];
          number = parts[2];
        } else {
          // Try direct apicarto query with the ID
          commune = id;
        }

        // Try fetching from IGN Apicarto by parcel ID
        const url = `https://apicarto.ign.fr/api/cadastre/parcelle?code_insee=${commune.substring(0, 5)}&section=${section}&numero=${number}`;
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
          const data = await res.json();
          const features = data?.features || [];
          if (features.length > 0) {
            const feature = features[0];
            const props = feature.properties || {};
            parcels.push({
              id,
              section: props.section || section,
              number: props.numero || number,
              area: props.contenance || 0,
              geometry: feature.geometry,
              commune: props.code_com || commune,
            });
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch parcel ${id}:`, err);
      }
    });

    await Promise.all(fetchPromises);

    if (parcels.length < 2) {
      return NextResponse.json(
        { error: "Could not retrieve geometry for enough parcels. Need at least 2 valid geometries." },
        { status: 400 }
      );
    }

    // Perform geometric union
    const merged = mergeParcelGeometries(parcels);

    if (!merged) {
      return NextResponse.json(
        { error: "Failed to compute geometric union of parcels" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      merged: {
        geometry: merged.geometry,
        area: merged.properties?.area || 0,
        ids: parcelIds,
        sourceCount: parcels.length,
      },
    });
  } catch (error) {
    console.error("Parcel merge error:", error);
    return NextResponse.json(
      { error: "Parcel merge failed" },
      { status: 500 }
    );
  }
}
