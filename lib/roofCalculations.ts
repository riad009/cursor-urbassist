/**
 * Phase 7 — Roof Geometry Calculation Utilities
 *
 * Pure functions for computing roof surface area, ridge height,
 * drainage projection, attic volume, and SVG profile paths.
 * All inputs are in meters / degrees; results in meters / m².
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type RoofType = "flat" | "gable" | "hip" | "shed" | "mansard";

export interface RoofInput {
  type: RoofType;
  pitch: number;       // degrees (0–60)
  overhang: number;    // meters
}

export interface RoofCalcResult {
  /** True roof material surface area (m²) */
  surfaceArea: number;
  /** Height of the roof peak above wall plate (m) */
  ridgeHeight: number;
  /** Horizontal drainage projection area including overhangs (m²) */
  drainageArea: number;
  /** Approximate attic volume below the roof (m³) */
  atticVolume: number;
  /** Footprint area including overhangs (m²) */
  footprintWithOverhang: number;
  /** Net internal floor area accounting for wall thickness (m²) */
  netInternalArea: number;
  /** Gross external area (m²) */
  grossExternalArea: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEG2RAD = Math.PI / 180;

// ─── Core Calculations ───────────────────────────────────────────────────────

/**
 * Calculate comprehensive roof geometry data.
 * @param width       Building width in meters
 * @param depth       Building depth in meters
 * @param roof        Roof configuration
 * @param wallThickness Wall thickness in meters (default 0.2)
 */
export function calculateRoofData(
  width: number,
  depth: number,
  roof: RoofInput,
  wallThickness: number = 0.2
): RoofCalcResult {
  const pitchRad = roof.pitch * DEG2RAD;
  const overhang = roof.overhang || 0;

  // Footprint dimensions including overhangs
  const totalW = width + overhang * 2;
  const totalD = depth + overhang * 2;
  const footprintWithOverhang = totalW * totalD;

  // Gross external area vs net internal area
  const grossExternalArea = width * depth;
  const netInternalArea = Math.max(0, (width - wallThickness * 2) * (depth - wallThickness * 2));

  // Ridge height & surface area depend on roof type
  let ridgeHeight = 0;
  let surfaceArea = footprintWithOverhang; // default for flat
  let atticVolume = 0;

  switch (roof.type) {
    case "flat": {
      ridgeHeight = 0;
      surfaceArea = footprintWithOverhang;
      atticVolume = 0;
      break;
    }

    case "gable": {
      // Two-slope roof: ridge runs along the longer dimension
      const span = Math.min(totalW, totalD);
      const ridgeLen = Math.max(totalW, totalD);
      const halfSpan = span / 2;
      ridgeHeight = halfSpan * Math.tan(pitchRad);
      // Each slope: length = halfSpan / cos(pitch), area = slopeLen × ridgeLen
      const slopeLen = halfSpan / Math.cos(pitchRad);
      surfaceArea = 2 * slopeLen * ridgeLen;
      // Volume: triangular prism
      atticVolume = 0.5 * span * ridgeHeight * ridgeLen;
      break;
    }

    case "hip": {
      // Four-slope hip roof: all four edges slope inward
      const span = Math.min(totalW, totalD);
      const ridgeLen = Math.max(totalW, totalD) - span; // ridge length
      const halfSpan = span / 2;
      ridgeHeight = halfSpan * Math.tan(pitchRad);
      const slopeLen = halfSpan / Math.cos(pitchRad);

      if (ridgeLen > 0) {
        // Two trapezoid sides + two triangle ends
        const trapArea = 2 * slopeLen * (ridgeLen + span) / 2;
        const triArea = 2 * (0.5 * span * slopeLen);
        surfaceArea = trapArea + triArea;
      } else {
        // Pyramid (square or near-square footprint)
        surfaceArea = 4 * (0.5 * halfSpan * slopeLen);
      }
      // Volume approximation
      atticVolume = (footprintWithOverhang * ridgeHeight) / 3;
      break;
    }

    case "shed": {
      // Single slope across the shorter dimension
      const span = Math.min(totalW, totalD);
      const ridgeLen = Math.max(totalW, totalD);
      ridgeHeight = span * Math.tan(pitchRad);
      const slopeLen = span / Math.cos(pitchRad);
      surfaceArea = slopeLen * ridgeLen;
      atticVolume = 0.5 * span * ridgeHeight * ridgeLen;
      break;
    }

    case "mansard": {
      // Lower steep section (70° assumed) + upper gentle section
      const lowerPitchRad = 70 * DEG2RAD;
      const lowerFraction = 0.35; // 35% of half-span is the steep section
      const span = Math.min(totalW, totalD);
      const ridgeLen = Math.max(totalW, totalD);
      const halfSpan = span / 2;

      const lowerRun = halfSpan * lowerFraction;
      const lowerRise = lowerRun * Math.tan(lowerPitchRad);
      const lowerSlopeLen = lowerRun / Math.cos(lowerPitchRad);

      const upperRun = halfSpan - lowerRun;
      const upperRise = upperRun * Math.tan(pitchRad);
      const upperSlopeLen = upperRun / Math.cos(pitchRad);

      ridgeHeight = lowerRise + upperRise;

      // Two sides each with lower + upper slope
      surfaceArea = 2 * ridgeLen * (lowerSlopeLen + upperSlopeLen);
      atticVolume = ridgeLen * (
        (span * lowerRise) -                    // lower rect approximation
        (0.5 * lowerRun * lowerRise * 2) +      // minus triangles
        (0.5 * (span - 2 * lowerRun) * upperRise) // upper triangle
      );
      break;
    }
  }

  // Drainage area = horizontal projection of roof (same as footprint with overhang for any roof)
  const drainageArea = footprintWithOverhang;

  return {
    surfaceArea: round2(surfaceArea),
    ridgeHeight: round2(ridgeHeight),
    drainageArea: round2(drainageArea),
    atticVolume: round2(atticVolume),
    footprintWithOverhang: round2(footprintWithOverhang),
    netInternalArea: round2(netInternalArea),
    grossExternalArea: round2(grossExternalArea),
  };
}

// ─── SVG Profile Generator ──────────────────────────────────────────────────

/**
 * Generate SVG path data for a roof cross-section thumbnail.
 * Renders in a 120×60 viewBox.
 * Returns an object with `wallPath`, `roofPath`, and `groundLine`.
 */
export function generatePitchProfile(
  pitch: number,
  roofType: RoofType,
  width: number = 12
): { wallPath: string; roofPath: string; groundLine: string; viewBox: string } {
  const vbW = 120, vbH = 60;
  const margin = 10;
  const wallH = 22;          // wall height in SVG units
  const drawW = vbW - margin * 2;
  const baseY = vbH - 8;     // ground line
  const wallTopY = baseY - wallH;

  // Scale building width to SVG draw width
  const left = margin;
  const right = margin + drawW;

  const pitchRad = pitch * DEG2RAD;
  const halfSpan = drawW / 2;

  let roofPath = "";

  switch (roofType) {
    case "flat":
      roofPath = `M ${left} ${wallTopY} L ${right} ${wallTopY}`;
      break;

    case "gable": {
      const peakH = Math.min(halfSpan * Math.tan(pitchRad), vbH - margin - wallH - 4);
      const peakY = wallTopY - peakH;
      roofPath = `M ${left} ${wallTopY} L ${left + halfSpan} ${peakY} L ${right} ${wallTopY}`;
      break;
    }

    case "hip": {
      const peakH = Math.min(halfSpan * Math.tan(pitchRad), vbH - margin - wallH - 4);
      const peakY = wallTopY - peakH;
      const inset = drawW * 0.2;
      roofPath = `M ${left} ${wallTopY} L ${left + inset} ${peakY} L ${right - inset} ${peakY} L ${right} ${wallTopY}`;
      break;
    }

    case "shed": {
      const riseH = Math.min(drawW * Math.tan(pitchRad), vbH - margin - wallH - 4);
      roofPath = `M ${left} ${wallTopY - riseH} L ${right} ${wallTopY}`;
      break;
    }

    case "mansard": {
      const lowerFrac = 0.35;
      const lowerRun = halfSpan * lowerFrac;
      const lowerH = Math.min(lowerRun * Math.tan(70 * DEG2RAD), 18);
      const upperRun = halfSpan - lowerRun;
      const upperH = Math.min(upperRun * Math.tan(pitchRad), 10);
      const lY = wallTopY - lowerH;
      const uY = lY - upperH;
      roofPath = `M ${left} ${wallTopY} L ${left + lowerRun} ${lY} L ${left + halfSpan} ${uY} L ${right - lowerRun} ${lY} L ${right} ${wallTopY}`;
      break;
    }
  }

  const wallPath = `M ${left} ${baseY} L ${left} ${wallTopY} M ${right} ${wallTopY} L ${right} ${baseY}`;
  const groundLine = `M ${left - 4} ${baseY} L ${right + 4} ${baseY}`;

  return {
    wallPath,
    roofPath,
    groundLine,
    viewBox: `0 0 ${vbW} ${vbH}`,
  };
}

// ─── Material Estimation ─────────────────────────────────────────────────────

/**
 * Rough estimate of wall material volume (m³).
 * Useful for providing material cost hints.
 */
export function estimateWallVolume(
  width: number,
  depth: number,
  totalWallHeight: number,
  wallThickness: number = 0.2
): number {
  const perimeter = 2 * (width + depth);
  return round2(perimeter * totalWallHeight * wallThickness);
}

// ─── Validation Helpers ──────────────────────────────────────────────────────

export interface OpeningConflict {
  openingId: string;
  type: "too_wide" | "too_close_to_corner" | "overlap";
  message: string;
}

/**
 * Check openings for placement conflicts.
 * - Opening wider than its wall
 * - Opening placed within MIN_CORNER_DIST of a corner
 * - Overlapping openings on the same facade
 */
export function validateOpenings(
  openings: Array<{
    id: string;
    type: string;
    facade: "north" | "south" | "east" | "west";
    width: number;
    count: number;
  }>,
  buildingWidth: number,
  buildingDepth: number,
  minCornerDist: number = 0.3
): OpeningConflict[] {
  const conflicts: OpeningConflict[] = [];

  const wallLen = (facade: string) =>
    facade === "north" || facade === "south" ? buildingWidth : buildingDepth;

  // Group by facade for overlap check
  const byFacade: Record<string, typeof openings> = {};
  for (const op of openings) {
    (byFacade[op.facade] ??= []).push(op);
  }

  for (const op of openings) {
    const wl = wallLen(op.facade);
    const totalW = op.width * op.count;

    // Opening wider than wall
    if (totalW > wl) {
      conflicts.push({
        openingId: op.id,
        type: "too_wide",
        message: `Opening (${totalW.toFixed(1)}m) exceeds wall length (${wl.toFixed(1)}m)`,
      });
    }

    // Check if remaining space leaves enough for corner clearance
    const remainingPerSide = (wl - totalW) / 2;
    if (remainingPerSide < minCornerDist && totalW <= wl) {
      conflicts.push({
        openingId: op.id,
        type: "too_close_to_corner",
        message: `Opening leaves only ${remainingPerSide.toFixed(2)}m from corner (min ${minCornerDist}m)`,
      });
    }
  }

  // Overlap check: if total width of all openings on one facade exceeds wall
  for (const [facade, ops] of Object.entries(byFacade)) {
    const totalW = ops.reduce((sum, op) => sum + op.width * op.count, 0);
    const wl = wallLen(facade);
    if (totalW > wl * 0.9 && ops.length > 1) {
      ops.forEach((op) => {
        if (!conflicts.find((c) => c.openingId === op.id && c.type === "overlap")) {
          conflicts.push({
            openingId: op.id,
            type: "overlap",
            message: `Openings on ${facade} facade total ${totalW.toFixed(1)}m, exceeding 90% of wall (${wl.toFixed(1)}m)`,
          });
        }
      });
    }
  }

  return conflicts;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
