import { NextRequest, NextResponse } from "next/server";

const APICARTO_GPU = "https://apicarto.ign.fr/api/gpu";
const API_HEADERS = { "User-Agent": "UrbAssist/1.0 (urbanisme)" };
const API_TIMEOUT = 8000;

/**
 * GPU Secteur-CC endpoint — returns Carte Communale sector features.
 * Useful for communes without a PLU that have a Carte Communale instead.
 *
 * Accepts: { coordinates: [lng, lat] } or { geom: GeoJSON }
 */
export async function POST(request: NextRequest) {
    try {
        const { coordinates, geom } = await request.json();

        let geometry = geom;

        // Build polygon buffer from coordinates if no geom provided
        if (!geometry && Array.isArray(coordinates) && coordinates.length >= 2) {
            const [lng, lat] = coordinates;
            const d = 0.0005; // ~55m buffer
            geometry = {
                type: "Polygon",
                coordinates: [
                    [
                        [lng - d, lat - d],
                        [lng + d, lat - d],
                        [lng + d, lat + d],
                        [lng - d, lat + d],
                        [lng - d, lat - d],
                    ],
                ],
            };
        }

        if (!geometry) {
            return NextResponse.json(
                { error: "Coordinates or GeoJSON geometry required" },
                { status: 400 }
            );
        }

        const geomEncoded = encodeURIComponent(JSON.stringify(geometry));
        const features: unknown[] = [];

        try {
            const res = await fetch(
                `${APICARTO_GPU}/secteur-cc?geom=${geomEncoded}`,
                {
                    headers: API_HEADERS,
                    signal: AbortSignal.timeout(API_TIMEOUT),
                }
            );
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data?.features)) {
                    features.push(...data.features);
                }
            }
        } catch (e) {
            console.log("[GPU/secteur-cc] API error:", (e as Error).message);
        }

        // Extract sector info
        const sectors = features.map((f) => {
            const props = (f as { properties?: Record<string, unknown> })
                ?.properties;
            return {
                libelle: (props?.libelle as string) ?? null,
                libelong: (props?.libelong as string) ?? null,
                typesect: (props?.typesect as string) ?? null,
            };
        });

        return NextResponse.json({
            success: true,
            features,
            sectors,
            hasSecteurCc: features.length > 0,
        });
    } catch (error) {
        console.error("GPU secteur-cc error:", error);
        return NextResponse.json(
            { error: "Secteur CC lookup failed" },
            { status: 500 }
        );
    }
}
