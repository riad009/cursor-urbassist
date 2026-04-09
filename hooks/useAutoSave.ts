/**
 * useAutoSave — Debounced auto-save hook for the site plan editor.
 *
 * Watches the editor Zustand store for changes and silently pushes
 * the latest canvas + buildings data to the database every 2 seconds.
 *
 * Usage:
 *   useAutoSave(projectId, fabricRef);
 *
 * Saves: canvasJSON, building details, elevation points.
 * Shows: nothing (silent). Sets isDirty = false on success.
 *
 * KEY FIXES (v2):
 *  - Accepts fabricRef so beforeunload can read LIVE canvas state
 *    (not the 800ms-stale store state)
 *  - sendBeacon now works because the API route has a POST handler
 *  - Reduced debounce from 2s → 1.5s for faster persistence
 */

"use client";

import { useEffect, useRef, useCallback, type RefObject } from "react";
import { useEditorStore } from "@/store/editorStore";

const AUTO_SAVE_DEBOUNCE_MS = 1500;

/**
 * Custom Fabric.js properties — MUST match the CANVAS_PROPS array in page.tsx.
 * Used to serialize canvas objects with all custom flags preserved.
 */
const CANVAS_PROPS = [
  "id", "elementName", "name",
  "isGrid", "isMeasurement", "isPolygonPreview",
  "isBoundaryOverlay", "isBoundaryDimension", "isRegulatoryFootprint",
  "isNorthArrow", "isInteriorLayout",
  "isBuildingOpening", "isBuildingOverhang", "isExteriorEnvelope",
  "isWallThickness", "isRoomLabel",
  "isElevationPoint", "isVegetation", "isViewpoint",
  "isAnnotation", "isVrd", "isSectionLine", "isParcel",
  "excludeFromExport",
  "parentId", "elevationValue", "vegetationType", "vrdType",
  "surfaceType", "templateType", "buildingId", "constructionType",
  "isExisting", "_buildingDetailId", "_overlayBuildingId", "buildingDetailId",
] as const;

/** Filter system overlays — only include user-created objects */
function filterUserObjects(objects: any[]): any[] {
  return objects.filter((o: any) =>
    !o.isGrid && !o.isMeasurement && !o.isPolygonPreview &&
    !o.isBoundaryOverlay && !o.isBoundaryDimension &&
    !o.isRegulatoryFootprint && !o.isNorthArrow &&
    !o.isInteriorLayout && !o.isBuildingOpening &&
    !o.isBuildingOverhang && !o.isExteriorEnvelope &&
    !o.isWallThickness && !o.isRoomLabel &&
    o.excludeFromExport !== true
  );
}

/** Build elements summary from canvas objects */
function buildElements(canvasData: any): any[] {
  const canvasObjects = (canvasData?.objects || []) as any[];
  return filterUserObjects(canvasObjects).map((o: any) => ({
    type: o.type,
    name: o.elementName || o.name || "Unnamed",
    category: o.templateType || o.surfaceType === "building" ? "building" : undefined,
    templateType: o.templateType,
    surfaceType: o.surfaceType,
    vrdType: o.vrdType,
    constructionType: o.constructionType,
    width: o.width,
    height: o.height,
  }));
}

export function useAutoSave(
  projectId: string | null,
  fabricRef?: RefObject<any | null>
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);

  const save = useCallback(async () => {
    if (!projectId || savingRef.current) return;

    const state = useEditorStore.getState();
    if (!state.isDirty || !state.canvasJSON) return;

    savingRef.current = true;
    try {
      const canvasData =
        typeof state.canvasJSON === "string"
          ? JSON.parse(state.canvasJSON)
          : state.canvasJSON;

      const elements = buildElements(canvasData);

      const res = await fetch(`/api/projects/${projectId}/site-plan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canvasData,
          elements,
          building3D:
            state.buildingDetails.length > 0
              ? { buildings: state.buildingDetails }
              : null,
        }),
      });

      if (res.ok) {
        useEditorStore.getState().markClean();
        console.debug("[auto-save] Saved successfully");
      }
    } catch (err) {
      console.warn("[auto-save] Failed:", err);
    } finally {
      savingRef.current = false;
    }
  }, [projectId]);

  // Subscribe to store changes and debounce saves
  useEffect(() => {
    if (!projectId) return;

    const unsubscribe = useEditorStore.subscribe((state, prevState) => {
      // Only trigger save on meaningful data changes
      if (
        state.canvasJSON !== prevState.canvasJSON ||
        state.buildingDetails !== prevState.buildingDetails ||
        state.elevationPoints !== prevState.elevationPoints
      ) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(save, AUTO_SAVE_DEBOUNCE_MS);
      }
    });

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [projectId, save]);

  // ── CRITICAL: Flush LIVE canvas state to DB on beforeunload ──
  // The canvas→store sync has an 800ms debounce. If the user refreshes
  // within that window, the store has STALE canvasJSON.
  // Solution: Read DIRECTLY from the Fabric.js canvas ref (if available)
  // to get the absolute latest state, then sendBeacon to the POST handler.
  useEffect(() => {
    const onBeforeUnload = () => {
      if (!projectId) return;

      const state = useEditorStore.getState();
      let canvasData: any = null;

      // Priority 1: Read LIVE canvas state directly from Fabric.js ref
      // This bypasses the 800ms debounce and gets the absolute latest state.
      const canvas = fabricRef?.current;
      if (canvas) {
        try {
          canvasData = (canvas as any).toJSON([...CANVAS_PROPS]);
          // Also flush to store so localStorage has the latest data
          const json = JSON.stringify(canvasData);
          useEditorStore.getState().setCanvasData(json);
        } catch {
          // Canvas may be disposed — fall back to store
        }
      }

      // Priority 2: Fall back to store's canvasJSON (may be up to 800ms stale)
      if (!canvasData && state.canvasJSON) {
        canvasData =
          typeof state.canvasJSON === "string"
            ? JSON.parse(state.canvasJSON)
            : state.canvasJSON;
      }

      if (!canvasData) return;

      const elements = buildElements(canvasData);

      // Use sendBeacon for reliable delivery during unload.
      // The API route now has a POST handler specifically for this.
      const payload = JSON.stringify({
        canvasData,
        elements,
        building3D:
          state.buildingDetails.length > 0
            ? { buildings: state.buildingDetails }
            : null,
      });
      navigator.sendBeacon(
        `/api/projects/${projectId}/site-plan`,
        new Blob([payload], { type: "application/json" })
      );
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [projectId, fabricRef]);
}
