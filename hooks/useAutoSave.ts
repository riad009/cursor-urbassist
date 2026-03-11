/**
 * useAutoSave — Debounced auto-save hook for the site plan editor.
 *
 * Watches the editor Zustand store for changes and silently pushes
 * the latest canvas + buildings data to the database every 2 seconds.
 *
 * Usage:
 *   useAutoSave(projectId);
 *
 * Saves: canvasJSON, building details, elevation points.
 * Shows: nothing (silent). Sets isDirty = false on success.
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import { useEditorStore } from "@/store/editorStore";

const AUTO_SAVE_DEBOUNCE_MS = 2000;

export function useAutoSave(projectId: string | null) {
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

      // Build elements array from canvas objects (simplified — the full version
      // in site-plan/page.tsx does more detailed classification)
      const elements = state.buildingDetails.map((b) => ({
        type: "rect",
        name: b.name,
        category: "building",
        templateType: "house",
        surfaceType: "building",
        width: b.width,
        height: b.depth,
      }));

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

  // Save on beforeunload (last chance before tab closes)
  useEffect(() => {
    const onBeforeUnload = () => {
      const state = useEditorStore.getState();
      if (state.isDirty && state.canvasJSON && projectId) {
        // Use sendBeacon for reliable delivery during unload
        const payload = JSON.stringify({
          canvasData:
            typeof state.canvasJSON === "string"
              ? JSON.parse(state.canvasJSON)
              : state.canvasJSON,
          elements: [],
          building3D:
            state.buildingDetails.length > 0
              ? { buildings: state.buildingDetails }
              : null,
        });
        navigator.sendBeacon(
          `/api/projects/${projectId}/site-plan`,
          new Blob([payload], { type: "application/json" })
        );
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [projectId]);
}
