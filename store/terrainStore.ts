/**
 * Terrain Elevation Store — Zustand state for editable NGF elevation data.
 *
 * PURPOSE: Store elevation data fetched from IGN RGE Alti API and allow
 * the user to override individual elevation points when the public data
 * is inaccurate (as acknowledged by the client: "public elevation data is
 * not always perfectly precise").
 *
 * DESIGN:
 *  - Each point has both `z` (current value) and `originalZ` (from IGN)
 *  - `overrideElevation(pointId, newZ)` sets z and marks isOverridden = true
 *  - `resetElevation(pointId)` reverts a single point to originalZ
 *  - `resetAllOverrides()` reverts all user edits in one action
 *  - `getEffectiveStats()` recomputes min/max/mean/slope from current z values
 *  - Stats always reflect the current state (including overrides)
 */

import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types (shared between API and store)
// ---------------------------------------------------------------------------

export interface TerrainElevationPoint {
  /** Deterministic ID: `elev-{index}-{lon6}-{lat6}` */
  pointId: string;
  lon: number;
  lat: number;
  /** Current elevation in metres NGF (may be overridden by user) */
  z: number;
  /** Original elevation from IGN RGE Alti API (immutable reference) */
  originalZ: number;
  /** True if the user has manually overridden this point */
  isOverridden: boolean;
  /** Data source */
  source: "ign_rge_alti" | "user_manual";
}

export interface TerrainStats {
  min: number | null;
  max: number | null;
  mean: number | null;
  /** Approximate terrain slope as a percentage */
  slopePercent: number | null;
}

export interface TerrainState {
  // ── Data ───────────────────────────────────────────────────────────────
  /** All elevation sample points (includes user overrides) */
  points: TerrainElevationPoint[];
  /** Statistics computed from current z values */
  stats: TerrainStats;
  /** Whether elevation data has been loaded from the API */
  isLoaded: boolean;
  /** Loading state for the fetch operation */
  isLoading: boolean;
  /** Error message from the last fetch attempt */
  error: string | null;
  /** Number of points that have been overridden by the user */
  overrideCount: number;

  // ── Actions ────────────────────────────────────────────────────────────
  /** Set elevation data from API response. Replaces all points. */
  setElevationData: (
    points: TerrainElevationPoint[],
    stats: TerrainStats
  ) => void;
  /** Override a single point's elevation. Preserves originalZ. */
  overrideElevation: (pointId: string, newZ: number) => void;
  /** Reset a single point to its original IGN elevation. */
  resetElevation: (pointId: string) => void;
  /** Reset all user overrides back to original IGN values. */
  resetAllOverrides: () => void;
  /** Add a manually-placed elevation point (not from IGN). */
  addManualPoint: (lon: number, lat: number, z: number) => void;
  /** Remove a manually-added point by ID. */
  removePoint: (pointId: string) => void;
  /** Recompute and return stats from current z values. */
  getEffectiveStats: () => TerrainStats;
  /** Set loading state. */
  setLoading: (loading: boolean) => void;
  /** Set error state. */
  setError: (error: string | null) => void;
  /** Reset entire terrain state (e.g. new parcel selection). */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeStats(points: TerrainElevationPoint[]): TerrainStats {
  if (points.length === 0) {
    return { min: null, max: null, mean: null, slopePercent: null };
  }

  const zValues = points.map((p) => p.z);
  const min = Math.min(...zValues);
  const max = Math.max(...zValues);
  const mean =
    Math.round((zValues.reduce((s, v) => s + v, 0) / zValues.length) * 100) /
    100;

  // Approximate slope: elevation difference / horizontal distance between
  // the lowest and highest points
  let slopePercent: number | null = null;
  if (points.length >= 2) {
    const minPt = points.find((p) => p.z === min)!;
    const maxPt = points.find((p) => p.z === max)!;
    // Haversine approximation for horizontal distance
    const R = 6371000; // Earth radius in metres
    const dLat = ((maxPt.lat - minPt.lat) * Math.PI) / 180;
    const dLon = ((maxPt.lon - minPt.lon) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((minPt.lat * Math.PI) / 180) *
        Math.cos((maxPt.lat * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    const horizontalDist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    if (horizontalDist > 0) {
      slopePercent =
        Math.round(((max - min) / horizontalDist) * 100 * 100) / 100;
    }
  }

  return { min, max, mean, slopePercent };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const EMPTY_STATS: TerrainStats = {
  min: null,
  max: null,
  mean: null,
  slopePercent: null,
};

export const useTerrainStore = create<TerrainState>((set, get) => ({
  // Defaults
  points: [],
  stats: { ...EMPTY_STATS },
  isLoaded: false,
  isLoading: false,
  error: null,
  overrideCount: 0,

  // ── Set data from API ──────────────────────────────────────────────────
  setElevationData: (points, stats) =>
    set({
      points,
      stats,
      isLoaded: true,
      isLoading: false,
      error: null,
      overrideCount: 0,
    }),

  // ── Override a single point ────────────────────────────────────────────
  overrideElevation: (pointId, newZ) =>
    set((state) => {
      const newPoints = state.points.map((p) =>
        p.pointId === pointId
          ? {
              ...p,
              z: Math.round(newZ * 100) / 100, // cm precision
              isOverridden: true,
              source: "user_manual" as const,
            }
          : p
      );
      const overrideCount = newPoints.filter((p) => p.isOverridden).length;
      return {
        points: newPoints,
        stats: computeStats(newPoints),
        overrideCount,
      };
    }),

  // ── Reset a single point ──────────────────────────────────────────────
  resetElevation: (pointId) =>
    set((state) => {
      const newPoints = state.points.map((p) =>
        p.pointId === pointId
          ? {
              ...p,
              z: p.originalZ,
              isOverridden: false,
              source: "ign_rge_alti" as const,
            }
          : p
      );
      const overrideCount = newPoints.filter((p) => p.isOverridden).length;
      return {
        points: newPoints,
        stats: computeStats(newPoints),
        overrideCount,
      };
    }),

  // ── Reset all overrides ───────────────────────────────────────────────
  resetAllOverrides: () =>
    set((state) => {
      const newPoints = state.points.map((p) =>
        p.isOverridden
          ? {
              ...p,
              z: p.originalZ,
              isOverridden: false,
              source: "ign_rge_alti" as const,
            }
          : p
      );
      return {
        points: newPoints,
        stats: computeStats(newPoints),
        overrideCount: 0,
      };
    }),

  // ── Add a manual point ────────────────────────────────────────────────
  addManualPoint: (lon, lat, z) =>
    set((state) => {
      const roundedZ = Math.round(z * 100) / 100;
      const pointId = `manual-${state.points.length}-${lon.toFixed(6)}-${lat.toFixed(6)}`;
      const newPoint: TerrainElevationPoint = {
        pointId,
        lon,
        lat,
        z: roundedZ,
        originalZ: roundedZ,
        isOverridden: false,
        source: "user_manual",
      };
      const newPoints = [...state.points, newPoint];
      return {
        points: newPoints,
        stats: computeStats(newPoints),
      };
    }),

  // ── Remove a point ────────────────────────────────────────────────────
  removePoint: (pointId) =>
    set((state) => {
      const newPoints = state.points.filter((p) => p.pointId !== pointId);
      const overrideCount = newPoints.filter((p) => p.isOverridden).length;
      return {
        points: newPoints,
        stats: computeStats(newPoints),
        overrideCount,
      };
    }),

  // ── Get effective stats (recomputed from current z values) ────────────
  getEffectiveStats: () => computeStats(get().points),

  // ── Loading / Error ───────────────────────────────────────────────────
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error, isLoading: false }),

  // ── Full reset ────────────────────────────────────────────────────────
  reset: () =>
    set({
      points: [],
      stats: { ...EMPTY_STATS },
      isLoaded: false,
      isLoading: false,
      error: null,
      overrideCount: 0,
    }),
}));
