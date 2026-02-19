/**
 * POST /api/decision
 *
 * Server-side authoritative Decision Engine.
 *
 * Instead of relying on client-side threshold logic, this route:
 * 1. Re-queries the GPU API for PLU zone detection → derives dpThreshold
 * 2. Re-queries protected areas for heritage check
 * 3. Runs calculateDpPc() with API-derived dpThreshold
 * 4. Auto-injects DPC11 and +1 month adjustment if heritage is detected
 * 5. Returns the full decision package including required documents
 *
 * The client-side calculator remains for instant preview feedback, but this
 * route provides the authoritative decision that gets saved to the database.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  calculateDpPc,
  type DpPcInput,
  type ProjectTypeChoice,
  type SubmitterType,
  type DpPcResult,
} from "@/lib/dp-pc-calculator";
import {
  getDocumentsForProject,
  type AuthorizationDocument,
} from "@/lib/authorization-documents";

const INTERNAL_BASE = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DecisionRequest {
  projectId: string;
  projectType: ProjectTypeChoice;
  floorAreaCreated: number;
  footprintCreated?: number;
  existingFloorArea?: number;
  coordinates?: [number, number]; // [lng, lat]
  citycode?: string;
  submitterType?: SubmitterType;
  changeOfUseOrFacade?: boolean;
  shelterHeight?: number;
  isGarage?: boolean;
}

interface DecisionResponse {
  success: boolean;
  determination: string;
  explanation: string;
  architectRequired: boolean;
  dpThreshold: number;
  isUrbanZone: boolean;
  isRnu: boolean;
  rnuWarning: string | null;
  isProtectedZone: boolean;
  requiresDpc11: boolean;
  timelineAdjustmentMonths: number;
  documents: AuthorizationDocument[];
  heritageDetails: {
    inHeritageZone: boolean;
    requiresABF: boolean;
    heritageTypes: string[];
  } | null;
  source: "server";
}

// ---------------------------------------------------------------------------
// Internal API calls (server→server, no CORS)
// ---------------------------------------------------------------------------

async function fetchPluDetection(
  coordinates: [number, number],
  citycode?: string
): Promise<{
  isUrbanZone: boolean;
  isRnu: boolean;
  dpThreshold: number;
  rnuWarning: string | null;
  zoneType: string | null;
  pluType: string | null;
}> {
  try {
    const [lng, lat] = coordinates;
    const res = await fetch(`${INTERNAL_BASE}/api/plu-detection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        coordinates: [lng, lat],
        citycode,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        isUrbanZone: data.isUrbanZone ?? true,
        isRnu: data.isRnu ?? false,
        dpThreshold: data.dpThreshold ?? (data.isUrbanZone ? 40 : 20),
        rnuWarning: data.rnuWarning ?? null,
        zoneType: data.plu?.zoneType ?? null,
        pluType: data.plu?.pluType ?? null,
      };
    }
  } catch (e) {
    console.error("[Decision] PLU detection failed:", (e as Error).message);
  }

  // Fallback: assume urban zone (safer default)
  return {
    isUrbanZone: true,
    isRnu: false,
    dpThreshold: 40,
    rnuWarning: null,
    zoneType: null,
    pluType: null,
  };
}

async function fetchHeritageCheck(
  coordinates: [number, number],
  citycode?: string
): Promise<{
  isProtectedZone: boolean;
  requiresABF: boolean;
  heritageTypes: string[];
}> {
  try {
    const [lng, lat] = coordinates;
    const res = await fetch(`${INTERNAL_BASE}/api/protected-areas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        coordinates: [lng, lat],
        citycode,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (res.ok) {
      const data = await res.json();
      const summary = data.heritageSummary;
      return {
        isProtectedZone: summary?.inHeritageZone ?? false,
        requiresABF: summary?.requiresABF ?? false,
        heritageTypes: summary?.heritageTypes ?? [],
      };
    }
  } catch (e) {
    console.error("[Decision] Heritage check failed:", (e as Error).message);
  }

  return { isProtectedZone: false, requiresABF: false, heritageTypes: [] };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body: DecisionRequest = await request.json();

    if (!body.projectType || body.floorAreaCreated === undefined) {
      return NextResponse.json(
        { error: "projectType and floorAreaCreated are required" },
        { status: 400 }
      );
    }

    // ── Parallel API calls: PLU + Heritage ─────────────────────────────
    const hasCoords =
      Array.isArray(body.coordinates) &&
      body.coordinates.length >= 2 &&
      Number.isFinite(body.coordinates[0]) &&
      Number.isFinite(body.coordinates[1]);

    let pluData = {
      isUrbanZone: true,
      isRnu: false,
      dpThreshold: 40,
      rnuWarning: null as string | null,
      zoneType: null as string | null,
      pluType: null as string | null,
    };

    let heritageData = {
      isProtectedZone: false,
      requiresABF: false,
      heritageTypes: [] as string[],
    };

    if (hasCoords && body.coordinates) {
      const [plu, heritage] = await Promise.allSettled([
        fetchPluDetection(body.coordinates, body.citycode),
        fetchHeritageCheck(body.coordinates, body.citycode),
      ]);

      if (plu.status === "fulfilled") pluData = plu.value;
      if (heritage.status === "fulfilled") heritageData = heritage.value;
    }

    // ── Run calculator with API-derived thresholds ─────────────────────
    const calculatorInput: DpPcInput = {
      projectType: body.projectType,
      floorAreaCreated: body.floorAreaCreated,
      footprintCreated: body.footprintCreated,
      existingFloorArea: body.existingFloorArea,
      changeOfUseOrFacade: body.changeOfUseOrFacade,
      inUrbanZone: pluData.isUrbanZone,
      dpThreshold: pluData.dpThreshold, // API-derived, not hardcoded
      submitterType: body.submitterType,
      shelterHeight: body.shelterHeight,
      isGarage: body.isGarage,
    };

    const calcResult: DpPcResult = calculateDpPc(calculatorInput);

    // ── Heritage auto-injection ───────────────────────────────────────
    const requiresDpc11 = heritageData.isProtectedZone || heritageData.requiresABF;
    const timelineAdjustmentMonths = requiresDpc11 ? 1 : 0;

    // ── Build document list ───────────────────────────────────────────
    const determination =
      calcResult.determination === "ARCHITECT_REQUIRED"
        ? "PC"
        : calcResult.determination;

    const documents = getDocumentsForProject(determination, {
      hasABF: requiresDpc11,
      isExistingStructure:
        body.projectType === "existing_extension" ||
        body.projectType === "facade_change",
    });

    // ── Build response ────────────────────────────────────────────────
    const response: DecisionResponse = {
      success: true,
      determination: calcResult.determination,
      explanation: calcResult.explanation,
      architectRequired: calcResult.architectRequired ?? false,
      dpThreshold: pluData.dpThreshold,
      isUrbanZone: pluData.isUrbanZone,
      isRnu: pluData.isRnu,
      rnuWarning: pluData.rnuWarning,
      isProtectedZone: heritageData.isProtectedZone,
      requiresDpc11,
      timelineAdjustmentMonths,
      documents,
      heritageDetails: heritageData.isProtectedZone
        ? {
            inHeritageZone: heritageData.isProtectedZone,
            requiresABF: heritageData.requiresABF,
            heritageTypes: heritageData.heritageTypes,
          }
        : null,
      source: "server",
    };

    console.log(
      `[Decision] ${body.projectType}: ${calcResult.determination} | dpThreshold=${pluData.dpThreshold} | urban=${pluData.isUrbanZone} | rnu=${pluData.isRnu} | heritage=${heritageData.isProtectedZone}`
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Decision] Error:", error);
    return NextResponse.json(
      { error: "Decision engine failed" },
      { status: 500 }
    );
  }
}
