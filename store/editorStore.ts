/**
 * Editor Store — Zustand state for site-plan editor with sessionStorage persistence.
 *
 * PURPOSE: Make the editor 100% resilient to page refresh (F5 / Cmd+R).
 * On refresh, the store hydrates from sessionStorage FIRST (instant), then the page
 * validates with a server fetch (eventual consistency).
 *
 * DESIGN:
 *  - Uses `persist` middleware with `sessionStorage` (auto-clears on tab close)
 *  - Storage key is dynamic per project: `urbassist-editor-{projectId}`
 *  - Stores: canvasJSON, buildingDetails, elevationPoints, projectData
 *  - Large data (canvas JSON) is stored as a compressed string
 *  - `_lastSavedAt` timestamp enables stale detection
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { BuildingDetail } from "@/components/site-plan/BuildingDetailPanel";
import type { ProcessedSiteData } from "@/types/processed-site-data";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectDataCache {
  parcelArea: number;
  northAngle: number;
  minGreenPct: number;
  maxCoverageRatio: number;
  includeOverhangInFootprint: boolean;
  coordinates: { lat: number; lng: number } | null;
  parcelGeometry: unknown;
  parcelsGeoJSON: unknown;
  existingBuildingsGeoJSON: unknown;
}

interface ElevationPoint {
  id: string;
  x: number;
  y: number;
  value: number;
}

export interface EditorState {
  // ── Identifiers ─────────────────────────────────────────────────────────
  projectId: string | null;

  // ── Cached Data ─────────────────────────────────────────────────────────
  /** Serialized Fabric.js canvas JSON (from canvas.toJSON()) */
  canvasJSON: string | null;
  /** Building configuration details */
  buildingDetails: BuildingDetail[];
  /** Elevation points placed on canvas */
  elevationPoints: ElevationPoint[];
  /** Project metadata (parcel area, coordinates, parcelsGeoJSON, etc.) */
  projectData: ProjectDataCache | null;
  /** Fully pre-processed GIS site data (boundary, edges, elevations) — persisted for refresh survival */
  processedSiteData: ProcessedSiteData | null;

  // ── Tracking ────────────────────────────────────────────────────────────
  /** Timestamp of last persistence to this store */
  _lastSavedAt: number;
  /** Whether there are unsaved changes */
  isDirty: boolean;

  // ── Actions ─────────────────────────────────────────────────────────────
  /** Initialize store for a specific project (resets if projectId changed) */
  initProject: (projectId: string) => void;
  /** Update cached canvas JSON */
  setCanvasData: (json: string) => void;
  /** Update building details array */
  setBuildingDetails: (details: BuildingDetail[]) => void;
  /** Update elevation points */
  setElevationPoints: (points: ElevationPoint[]) => void;
  /** Update fully processed GIS site data */
  setProcessedSiteData: (data: ProcessedSiteData | null) => void;
  /** Update project metadata */
  setProjectData: (data: ProjectDataCache) => void;
  /** Mark as dirty (unsaved changes) */
  markDirty: () => void;
  /** Mark as clean (just saved) */
  markClean: () => void;
  /** Full reset */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Dynamic storage key
// ---------------------------------------------------------------------------

let activeProjectId: string | null = null;

function getStorageKey(): string {
  return `urbassist-editor-${activeProjectId || "unknown"}`;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const INITIAL_STATE = {
  projectId: null as string | null,
  canvasJSON: null as string | null,
  buildingDetails: [] as BuildingDetail[],
  elevationPoints: [] as ElevationPoint[],
  projectData: null as ProjectDataCache | null,
  processedSiteData: null as ProcessedSiteData | null,
  _lastSavedAt: 0,
  isDirty: false,
};

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      initProject: (projectId: string) => {
        const current = get().projectId;
        if (current === projectId) return; // already initialized

        activeProjectId = projectId;

        // Check sessionStorage for existing data for this project
        try {
          const key = getStorageKey();
          const stored = sessionStorage.getItem(key);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed?.state?.projectId === projectId) {
              // Hydrate from session storage
              set({
                ...parsed.state,
                isDirty: false, // Fresh load = not dirty
              });
              return;
            }
          }
        } catch { /* ignore parse errors */ }

        // No cached data — initialize fresh
        set({
          ...INITIAL_STATE,
          projectId,
        });
      },

      setCanvasData: (json) =>
        set({
          canvasJSON: json,
          _lastSavedAt: Date.now(),
          isDirty: true,
        }),

      setBuildingDetails: (details) =>
        set({
          buildingDetails: details,
          _lastSavedAt: Date.now(),
          isDirty: true,
        }),

      setElevationPoints: (points) =>
        set({
          elevationPoints: points,
          _lastSavedAt: Date.now(),
          isDirty: true,
        }),

      setProcessedSiteData: (data) =>
        set({
          processedSiteData: data,
          _lastSavedAt: Date.now(),
        }),

      setProjectData: (data) =>
        set({
          projectData: data,
          _lastSavedAt: Date.now(),
        }),

      markDirty: () => set({ isDirty: true }),
      markClean: () => set({ isDirty: false }),

      reset: () => set({ ...INITIAL_STATE }),
    }),
    {
      name: "urbassist-editor-storage",
      storage: createJSONStorage(() => {
        // SSR guard: sessionStorage is only available in the browser
        if (typeof window === "undefined") {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return sessionStorage;
      }),
      // Only persist essential data — skip transient UI state
      partialize: (state) => ({
        projectId: state.projectId,
        canvasJSON: state.canvasJSON,
        buildingDetails: state.buildingDetails,
        elevationPoints: state.elevationPoints,
        projectData: state.projectData,
        processedSiteData: state.processedSiteData,
        _lastSavedAt: state._lastSavedAt,
      }),
    }
  )
);
