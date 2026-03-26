/**
 * usePluCompliance.ts — Real-Time PLU Compliance Hook
 *
 * Bridges the Fabric.js 2D canvas with PLU compliance checks.
 *
 * ARCHITECTURE:
 *   - Listens to Fabric.js events: object:modified, object:added, object:removed
 *   - Debounces recalculations to prevent freezing during complex polygon drags
 *   - Delegates all math to lib/plu-math.ts (zero calculations in React render cycle)
 *   - Returns a typed ComplianceReport consumed by PluAlertBanner
 *
 * USAGE:
 *   const report = usePluCompliance({
 *     fabricCanvasRef,
 *     pixelsPerMeter: 10,
 *     pluRules: { maxCoverageRatio: 0.15, setbacks: { front: 3, side: 3, rear: 4 } },
 *     parcelAreaM2: 500, // optional override
 *   });
 */

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  generateComplianceReport,
  type ComplianceReport,
  type FabricCanvasObject,
  type SetbackRequirements,
} from "@/lib/plu-math";

// ─── Types ──────────────────────────────────────────────────────────────────

/** PLU rules input — accepts the shapes from both inline config and PluRules interface */
export interface PluComplianceRules {
  /** CES max coverage ratio as decimal (e.g. 0.15 for 15%). Null = not enforced. */
  maxCoverageRatio?: number | null;
  /** Required setbacks in meters. */
  setbacks?: SetbackRequirements | null;
}

export interface UsePluComplianceOptions {
  /**
   * Ref to the Fabric.js canvas instance.
   * This is the same `fabricRef.current` used throughout the site-plan editor.
   * We use `unknown` to avoid a hard dependency on the fabric namespace — the
   * ref is cast to our internal FabricCanvasLike interface at usage sites.
   */
  fabricCanvasRef: React.RefObject<unknown | null>;
  /**
   * Pixels-per-meter scale factor for the current canvas.
   * Essential for converting canvas dimensions to real-world meters.
   */
  pixelsPerMeter: number;
  /**
   * PLU rules to enforce. Null/undefined = skip compliance checks.
   */
  pluRules: PluComplianceRules | null | undefined;
  /**
   * Optional override for parcel area in m².
   * If provided, this value is used instead of computing area from canvas objects.
   * Useful when the DB stores a cadastral-certified area.
   */
  parcelAreaM2?: number;
  /**
   * Debounce delay in milliseconds for recalculations.
   * Higher values improve drag performance at the cost of slower feedback.
   * @default 150
   */
  debounceMs?: number;
}

// Minimal Fabric.js Canvas interface to avoid full import
interface FabricCanvasLike {
  getObjects(): FabricCanvasObject[];
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
}

// ─── Default Report (no-data state) ─────────────────────────────────────────

const NO_DATA_REPORT: ComplianceReport = Object.freeze({
  status: "no-data",
  coverageRatio: 0,
  maxCoverageRatio: null,
  parcelAreaM2: 0,
  totalBuildingAreaM2: 0,
  coverageExceeded: false,
  setbackViolations: [],
  timestamp: 0,
});

// ─── Hook ───────────────────────────────────────────────────────────────────

export function usePluCompliance(options: UsePluComplianceOptions): ComplianceReport {
  const {
    fabricCanvasRef,
    pixelsPerMeter,
    pluRules,
    parcelAreaM2,
    debounceMs = 150,
  } = options;

  const [report, setReport] = useState<ComplianceReport>(NO_DATA_REPORT as ComplianceReport);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  // Track the latest values in refs to avoid stale closures
  const latestPluRef = useRef(pluRules);
  const latestPpmRef = useRef(pixelsPerMeter);
  const latestParcelAreaRef = useRef(parcelAreaM2);

  // Keep refs in sync with props (no re-render on ref update)
  latestPluRef.current = pluRules;
  latestPpmRef.current = pixelsPerMeter;
  latestParcelAreaRef.current = parcelAreaM2;

  /**
   * Core recalculation function.
   * Grabs canvas objects, delegates to plu-math.ts, and updates state.
   * Runs OUTSIDE the React render cycle (in a debounced callback).
   */
  const recalculate = useCallback(() => {
    if (!isMountedRef.current) return;

    const canvas = fabricCanvasRef.current as unknown as FabricCanvasLike | null;
    if (!canvas) {
      setReport(NO_DATA_REPORT as ComplianceReport);
      return;
    }

    const plu = latestPluRef.current;
    const ppm = latestPpmRef.current;
    const areaOverride = latestParcelAreaRef.current;

    // If no PLU rules or no scale, we can't check compliance
    if (!plu || ppm <= 0) {
      setReport(NO_DATA_REPORT as ComplianceReport);
      return;
    }

    // Grab all canvas objects (the snapshot is fast — Fabric caches this)
    const objects = canvas.getObjects();

    // Delegate everything to the math engine
    const newReport = generateComplianceReport(
      objects,
      ppm,
      plu.maxCoverageRatio ?? null,
      plu.setbacks ?? null,
      areaOverride
    );

    // Only update state if still mounted and report actually changed
    if (isMountedRef.current) {
      setReport((prev) => {
        // Shallow comparison to avoid unnecessary re-renders
        if (
          prev.status === newReport.status &&
          prev.coverageRatio === newReport.coverageRatio &&
          prev.totalBuildingAreaM2 === newReport.totalBuildingAreaM2 &&
          prev.setbackViolations.length === newReport.setbackViolations.length &&
          prev.coverageExceeded === newReport.coverageExceeded
        ) {
          return prev; // Reference-stable — no re-render
        }
        return newReport;
      });
    }
  }, [fabricCanvasRef]);

  /**
   * Debounced version of recalculate.
   * Clears previous timer on each call to coalesce rapid events.
   */
  const debouncedRecalculate = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      recalculate();
    }, debounceMs);
  }, [recalculate, debounceMs]);

  /**
   * Register Fabric.js event listeners.
   * Re-registers when the canvas ref changes or when the debounce function changes.
   */
  useEffect(() => {
    const canvas = fabricCanvasRef.current as unknown as FabricCanvasLike | null;
    if (!canvas) return;

    // The event handler shared by all three events
    const handler = () => {
      debouncedRecalculate();
    };

    // Subscribe to canvas mutation events
    canvas.on("object:modified", handler);
    canvas.on("object:added", handler);
    canvas.on("object:removed", handler);

    // Run an initial calculation immediately
    recalculate();

    return () => {
      // Unsubscribe on cleanup
      canvas.off("object:modified", handler);
      canvas.off("object:added", handler);
      canvas.off("object:removed", handler);

      // Cancel pending debounce
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [fabricCanvasRef, debouncedRecalculate, recalculate]);

  // Recalculate when PLU rules or scale change (non-canvas-event changes)
  useEffect(() => {
    recalculate();
  }, [pluRules, pixelsPerMeter, parcelAreaM2, recalculate]);

  // Track mounted state for async safety
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return report;
}
