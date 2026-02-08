import { NextRequest, NextResponse } from "next/server";

// Automatic PLU/PLUi Zone Detection from address
// Uses GPU (Géoportail de l'Urbanisme) API and fallback methods

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function POST(request: NextRequest) {
  try {
    const { coordinates, citycode, address } = await request.json();

    if (!coordinates && !citycode) {
      return NextResponse.json(
        { error: "Coordinates or city code required" },
        { status: 400 }
      );
    }

    const [lng, lat] = coordinates || [0, 0];
    let pluInfo: {
      zoneType: string | null;
      zoneName: string | null;
      communeName: string | null;
      pluType: string | null;
      pluStatus: string | null;
      regulations: Record<string, unknown> | null;
      pdfUrl: string | null;
    } = {
      zoneType: null,
      zoneName: null,
      communeName: null,
      pluType: null,
      pluStatus: null,
      regulations: null,
      pdfUrl: null,
    };

    // Step 1: Get commune information
    let communeCode = citycode;
    let communeName = "";

    if (coordinates) {
      try {
        const communeRes = await fetch(
          `https://geo.api.gouv.fr/communes?lat=${lat}&lon=${lng}&fields=code,nom,departement,population&limit=1`
        );
        if (communeRes.ok) {
          const communes = await communeRes.json();
          if (communes[0]) {
            communeCode = communes[0].code;
            communeName = communes[0].nom;
          }
        }
      } catch (e) {
        console.log("Commune lookup failed:", e);
      }
    }

    // Step 2: Try GPU (Géoportail de l'Urbanisme) for PLU zones
    try {
      const gpuRes = await fetch(
        `https://apicarto.ign.fr/api/gpu/zone-urba?lon=${lng}&lat=${lat}`,
        { signal: AbortSignal.timeout(10000) }
      );

      if (gpuRes.ok) {
        const gpuData = await gpuRes.json();
        if (gpuData.features && gpuData.features.length > 0) {
          const zone = gpuData.features[0].properties;
          pluInfo.zoneType = zone.typezone || zone.libelle || null;
          pluInfo.zoneName = zone.libelong || zone.libelle || null;
          pluInfo.pluType = zone.idurba
            ? zone.idurba.includes("PLUi")
              ? "PLUi"
              : "PLU"
            : null;
        }
      }
    } catch (e) {
      console.log("GPU API unavailable:", e);
    }

    // Step 3: Try to get PLU document info and PDF URL
    try {
      const docRes = await fetch(
        `https://apicarto.ign.fr/api/gpu/document?lon=${lng}&lat=${lat}`,
        { signal: AbortSignal.timeout(10000) }
      );

      if (docRes.ok) {
        const docData = await docRes.json();
        if (docData.features && docData.features.length > 0) {
          const doc = docData.features[0].properties as Record<string, unknown>;
          pluInfo.pluStatus = (doc.etat as string) || null;
          pluInfo.pluType = pluInfo.pluType || (doc.typedoc as string) || null;
          // Store PDF/document URL if API provides it (lien, url, document_url, etc.)
          const docUrl =
            (doc.lien as string) ||
            (doc.url as string) ||
            (doc.document_url as string) ||
            (doc.pdf_url as string);
          if (docUrl && typeof docUrl === "string") {
            pluInfo.pdfUrl = docUrl;
          }
        }
      }
      // Fallback: link to Géoportail document portal for the commune (user can find official PLU PDF there)
      if (!pluInfo.pdfUrl && communeCode) {
        pluInfo.pdfUrl = `https://www.geoportail-urbanisme.gouv.fr/document/commune/${communeCode}`;
      }
    } catch (e) {
      console.log("GPU document API unavailable:", e);
    }

    // Step 4: If no zone detected via API, provide estimated zone
    if (!pluInfo.zoneType) {
      // Estimate zone based on commune population and location
      try {
        const communeInfoRes = await fetch(
          `https://geo.api.gouv.fr/communes/${communeCode}?fields=population,surface`
        );
        if (communeInfoRes.ok) {
          const commune = await communeInfoRes.json();
          communeName = communeName || commune.nom;
          const pop = commune.population || 0;
          const density = pop / ((commune.surface || 1) / 100); // hab/km²

          if (density > 3000) {
            pluInfo.zoneType = "UA";
            pluInfo.zoneName = "Zone Urbaine Dense";
          } else if (density > 1000) {
            pluInfo.zoneType = "UB";
            pluInfo.zoneName = "Zone Urbaine Mixte";
          } else if (density > 300) {
            pluInfo.zoneType = "UC";
            pluInfo.zoneName = "Zone Urbaine Résidentielle";
          } else if (density > 100) {
            pluInfo.zoneType = "AU";
            pluInfo.zoneName = "Zone À Urbaniser";
          } else {
            pluInfo.zoneType = "A/N";
            pluInfo.zoneName = "Zone Agricole ou Naturelle";
          }
        }
      } catch {
        pluInfo.zoneType = "UB";
        pluInfo.zoneName = "Zone Urbaine (estimated)";
      }
    }

    pluInfo.communeName = communeName;

    // Step 5: Generate default regulations based on zone type
    pluInfo.regulations = getDefaultRegulations(pluInfo.zoneType || "UB");

    // Step 6: If Gemini is available and we have address context, enhance with AI
    if (GEMINI_API_KEY && address) {
      try {
        const prompt = `Based on French urban planning rules for zone ${pluInfo.zoneType} (${pluInfo.zoneName}) in ${communeName}, provide typical construction regulations in JSON format:
{
  "maxHeight": number (meters),
  "setbacks": {"front": number, "side": number, "rear": number},
  "maxCoverageRatio": number (0-1),
  "parkingRequirements": "string",
  "greenSpaceRequirements": "string",
  "roofConstraints": "string",
  "facadeConstraints": "string"
}
Only return the JSON, no other text.`;

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
            }),
          }
        );

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const aiText =
            geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
          const jsonMatch = aiText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const aiRegs = JSON.parse(jsonMatch[0]);
              pluInfo.regulations = { ...pluInfo.regulations, ...aiRegs };
            } catch {
              // keep default regulations
            }
          }
        }
      } catch (e) {
        console.log("Gemini enhancement failed:", e);
      }
    }

    return NextResponse.json({
      success: true,
      plu: pluInfo,
      source: pluInfo.pluStatus ? "gpu" : "estimated",
    });
  } catch (error) {
    console.error("PLU detection error:", error);
    return NextResponse.json(
      { error: "PLU detection failed" },
      { status: 500 }
    );
  }
}

function getDefaultRegulations(zoneType: string): Record<string, unknown> {
  const defaults: Record<string, Record<string, unknown>> = {
    UA: {
      zoneClassification: "UA - Zone Urbaine Dense",
      maxHeight: 15,
      setbacks: { front: 0, side: 0, rear: 3 },
      maxCoverageRatio: 0.8,
      maxFloorAreaRatio: 3.0,
      parkingRequirements: "1 place per 60m² of floor area",
      greenSpaceRequirements: "Minimum 10% of parcel area",
      architecturalConstraints: [
        "Construction on boundary allowed",
        "Alignment with existing buildings required",
        "Flat roof or traditional roof pitch",
      ],
    },
    UB: {
      zoneClassification: "UB - Zone Urbaine Mixte",
      maxHeight: 12,
      setbacks: { front: 5, side: 3, rear: 4 },
      maxCoverageRatio: 0.4,
      maxFloorAreaRatio: 1.2,
      parkingRequirements: "1 place per 60m² of floor area",
      greenSpaceRequirements: "Minimum 20% of parcel area",
      architecturalConstraints: [
        "Roof pitch 30-45 degrees",
        "Natural materials for facades",
        "Maximum 2 colors for exterior",
      ],
    },
    UC: {
      zoneClassification: "UC - Zone Urbaine Résidentielle",
      maxHeight: 9,
      setbacks: { front: 5, side: 4, rear: 5 },
      maxCoverageRatio: 0.3,
      maxFloorAreaRatio: 0.8,
      parkingRequirements: "2 places per dwelling",
      greenSpaceRequirements: "Minimum 30% of parcel area",
      architecturalConstraints: [
        "Roof pitch 30-45 degrees",
        "Fences limited to 1.80m height",
        "Residential character mandatory",
      ],
    },
    AU: {
      zoneClassification: "AU - Zone À Urbaniser",
      maxHeight: 10,
      setbacks: { front: 5, side: 4, rear: 4 },
      maxCoverageRatio: 0.35,
      maxFloorAreaRatio: 1.0,
      parkingRequirements: "2 places per dwelling",
      greenSpaceRequirements: "Minimum 25% of parcel area",
      architecturalConstraints: [
        "Subject to development plan approval",
        "Infrastructure must be completed first",
      ],
    },
    "A/N": {
      zoneClassification: "A/N - Zone Agricole ou Naturelle",
      maxHeight: 7,
      setbacks: { front: 10, side: 5, rear: 5 },
      maxCoverageRatio: 0.1,
      maxFloorAreaRatio: 0.2,
      parkingRequirements: "2 places per dwelling",
      greenSpaceRequirements: "Maintain natural character",
      architecturalConstraints: [
        "Construction strictly limited",
        "Agricultural buildings only in zone A",
        "No new construction in zone N",
      ],
    },
  };

  return defaults[zoneType] || defaults["UB"];
}
