import { NextRequest, NextResponse } from "next/server";

const APICARTO_GPU = "https://apicarto.ign.fr/api/gpu";
const API_HEADERS = { "User-Agent": "UrbAssist/1.0 (urbanisme)" };
const API_TIMEOUT = 8000;

/**
 * GPU Municipality endpoint — returns information about the commune's planning document.
 * Detects whether the commune has a PLU, PLUi, CC, POS, or is under RNU.
 *
 * Accepts: { insee: string } or { coordinates: [lng, lat] }
 */
export async function POST(request: NextRequest) {
    try {
        const { insee, coordinates } = await request.json();

        let communeCode = insee as string | undefined;

        // If coordinates provided but no INSEE, resolve it
        if (!communeCode && Array.isArray(coordinates) && coordinates.length >= 2) {
            const [lng, lat] = coordinates;
            try {
                const r = await fetch(
                    `https://geo.api.gouv.fr/communes?lat=${lat}&lon=${lng}&fields=code,nom&limit=1`,
                    { signal: AbortSignal.timeout(5000) }
                );
                if (r.ok) {
                    const c = await r.json();
                    if (c[0]) communeCode = c[0].code;
                }
            } catch {
                // continue
            }
        }

        if (!communeCode) {
            return NextResponse.json(
                { error: "INSEE code or coordinates required" },
                { status: 400 }
            );
        }

        // Call the official API Carto GPU municipality endpoint
        const features: unknown[] = [];
        try {
            const res = await fetch(
                `${APICARTO_GPU}/municipality?insee=${encodeURIComponent(communeCode)}`,
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
            console.log("[GPU/municipality] API error:", (e as Error).message);
        }

        // Extract useful info from features
        let isRnu = false;
        let documentType: string | null = null;
        let documentStatus: string | null = null;
        let communeName: string | null = null;
        let pluType: string | null = null;
        let hasPlu = false;

        if (features.length > 0) {
            const props = (features[0] as { properties?: Record<string, unknown> })
                ?.properties;
            if (props) {
                // Check RNU status
                const rnuRaw =
                    props.is_rnu ?? props.est_rnu ?? props.rnu ?? props.RNU;
                isRnu =
                    rnuRaw === true ||
                    ["true", "oui", "1"].includes(String(rnuRaw).toLowerCase());

                documentType =
                    (props.du_type as string) ??
                    (props.typedoc as string) ??
                    null;
                documentStatus = (props.etat as string) ?? null;
                communeName = (props.nom as string) ?? null;

                // Determine PLU type from document type
                if (documentType) {
                    const dt = documentType.toUpperCase();
                    if (dt.includes("PLUI")) pluType = "PLUi";
                    else if (dt.includes("PLU")) pluType = "PLU";
                    else if (dt === "CC") pluType = "CC";
                    else if (dt === "POS") pluType = "POS";
                    else pluType = documentType;
                }

                hasPlu = !isRnu && !!documentType;
            }
        }

        // If no features found, default to RNU
        if (features.length === 0) {
            isRnu = true;
        }

        return NextResponse.json({
            success: true,
            insee: communeCode,
            communeName,
            isRnu,
            hasPlu,
            pluType,
            documentType,
            documentStatus,
            features,
        });
    } catch (error) {
        console.error("GPU municipality error:", error);
        return NextResponse.json(
            { error: "Municipality lookup failed" },
            { status: 500 }
        );
    }
}
