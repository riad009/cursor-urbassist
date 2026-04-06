/**
 * useSitePlanMathSync.ts — Real-Time PLU Math Bridge
 *
 * Fire-and-forget hook that continuously synchronizes the 2D editor's
 * building details with the CES/buildable area calculation engine.
 *
 * DATA FLOW:
 *   editorStore.buildingDetails → useSitePlanMath.setBuildings()
 *   editorStore.projectData.parcelArea → useSitePlanMath.setParcelArea()
 *   editorStore.projectData.maxCoverageRatio → useSitePlanMath.setMaxCes()
 *
 * IMPORTANT:
 *   This hook performs ONLY side-effect synchronization.
 *   It does NOT return a derived object (which would cause infinite re-renders).
 *   To read the computed breakdown, use useSitePlanMath(selectSurfaceBreakdown)
 *   with a shallow equality wrapper in the consuming component.
 */

import { useEffect } from "react";
import { useEditorStore } from "@/store/editorStore";
import {
  useSitePlanMath,
  type SitePlanBuilding,
} from "@/store/useSitePlanMath";
import type { BuildingDetail } from "@/components/site-plan/BuildingDetailPanel";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Convert a BuildingDetail (from the editor panel) to a SitePlanBuilding
 * (for the math engine). This is the adapter layer between the two stores.
 */
function detailToMathBuilding(detail: BuildingDetail): SitePlanBuilding {
  return {
    id: detail.id,
    name: detail.name,
    width: detail.width,
    depth: detail.depth,
    isExisting: detail.isExisting,
    overhang: detail.roof?.overhang ?? 0,
    includeOverhangInFootprint: false,
  };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Synchronize the editor store with the PLU math engine.
 *
 * Call this once at the top of the site plan editor component.
 * It keeps the Zustand math store in sync with the editor as a side effect.
 *
 * To READ the computed CES breakdown in the UI, import and use:
 *   `useSitePlanMath(selectRemainingBuildable)` — returns a stable number
 *   `useSitePlanMath(selectIsOverCes)` — returns a stable boolean
 *
 * @example
 * ```tsx
 * function SitePlanEditor() {
 *   useSitePlanMathSync(); // fire-and-forget — keeps stores in sync
 *   const isOver = useSitePlanMath(selectIsOverCes); // stable boolean read
 * }
 * ```
 */
export function useSitePlanMathSync(): void {
  // ── Read from editorStore ───────────────────────────────────────────────
  const buildingDetails = useEditorStore((s) => s.buildingDetails);
  const projectData = useEditorStore((s) => s.projectData);

  // ── Sync parcel area & PLU rules ────────────────────────────────────────
  useEffect(() => {
    if (!projectData) return;

    if (projectData.parcelArea > 0) {
      useSitePlanMath.getState().setParcelArea(projectData.parcelArea);
    }

    if (
      typeof projectData.maxCoverageRatio === "number" &&
      projectData.maxCoverageRatio > 0
    ) {
      useSitePlanMath.getState().setMaxCes(projectData.maxCoverageRatio);
    }

    if (typeof projectData.includeOverhangInFootprint === "boolean") {
      useSitePlanMath.getState().setOverhangInclusion(projectData.includeOverhangInFootprint);
    }
  }, [projectData]);

  // ── Sync buildings on every change ──────────────────────────────────────
  useEffect(() => {
    if (!buildingDetails || buildingDetails.length === 0) {
      useSitePlanMath.getState().setBuildings([]);
      return;
    }

    const mathBuildings: SitePlanBuilding[] = buildingDetails.map(detailToMathBuilding);
    useSitePlanMath.getState().setBuildings(mathBuildings);
  }, [buildingDetails]);
}
