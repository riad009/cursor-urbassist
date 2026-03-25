/**
 * useSculptStore.ts — Zustand Store for 3D Terrain Sculpting
 *
 * ARCHITECTURE:
 *   - Stores elevation DELTAS (vertex index → height offset) as a non-destructive
 *     modification layer on top of the original terrain geometry.
 *   - NEVER mutates the original API elevation data.
 *   - Supports undo via snapshotting the deltas map on each commit.
 *   - Brush config (radius, strength) is stored here for UI ↔ Engine sync.
 *
 * DESIGN DECISIONS:
 *   - We use vertex INDEX (number) as the key because the terrain is a
 *     regular PlaneGeometry grid (128×128 = 16641 vertices). Index-based
 *     lookup is O(1) and stays stable across frames.
 *   - Deltas are committed on pointerUp, not pointerMove, to reduce store churn.
 *   - The sculpting engine reads `isSculptMode` to toggle raycasting.
 */

import { create } from "zustand";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SculptBrushConfig {
  /** Radius in scene-space units (metres). Vertices within this radius are affected. */
  radius: number;
  /** Strength multiplier for elevation change per pixel of mouse drag. */
  strength: number;
  /** Falloff curve: 'linear' (cone) or 'smooth' (Gaussian bell). */
  falloff: "linear" | "smooth";
}

export interface SculptState {
  // ── Mode ────────────────────────────────────────────────────────────────
  /** Whether sculpt mode is active. When false, pointer events pass through to OrbitControls. */
  isSculptMode: boolean;

  // ── Delta Layer ─────────────────────────────────────────────────────────
  /**
   * Map of vertex index → cumulative height delta (in scene-space Y units).
   * Positive = raise terrain, negative = lower.
   * Only contains entries for vertices the user has actually modified.
   */
  elevationDeltas: Record<number, number>;

  // ── Selection ───────────────────────────────────────────────────────────
  /** Index of the vertex currently hovered or being dragged. Null when idle. */
  hoveredVertex: number | null;
  /** Index of the vertex currently selected (after a click + release). */
  selectedVertex: number | null;
  /** World-space position of the hovered vertex (for cursor rendering). */
  hoveredWorldPos: [number, number, number] | null;

  // ── Brush ───────────────────────────────────────────────────────────────
  brush: SculptBrushConfig;

  // ── Undo ────────────────────────────────────────────────────────────────
  /** Stack of previous delta snapshots for undo. Max 30 entries. */
  undoStack: Record<number, number>[];

  // ── Actions ─────────────────────────────────────────────────────────────
  setSculptMode: (on: boolean) => void;
  setHoveredVertex: (index: number | null, worldPos?: [number, number, number] | null) => void;
  setSelectedVertex: (index: number | null) => void;

  /**
   * Apply a height delta to a single vertex.
   * Called during drag (pointerMove). Does NOT push undo.
   */
  applyDelta: (vertexIndex: number, delta: number) => void;

  /**
   * Apply deltas to multiple vertices at once (brush stroke).
   * Each entry is [vertexIndex, delta]. Does NOT push undo.
   */
  applyBrushDeltas: (entries: [number, number][]) => void;

  /**
   * Commit the current deltas state to the undo stack.
   * Called on pointerUp after a drag operation.
   */
  commitToUndo: () => void;

  /**
   * Set a precise elevation delta for a single vertex (from manual number input).
   * This replaces any existing delta for that vertex.
   */
  setExactDelta: (vertexIndex: number, absoluteDelta: number) => void;

  /** Pop the last undo entry and restore deltas. */
  undo: () => void;

  /** Reset all deltas to zero (flatten modifications). */
  resetAllDeltas: () => void;

  /** Update brush configuration. */
  setBrush: (config: Partial<SculptBrushConfig>) => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_UNDO = 30;

const DEFAULT_BRUSH: SculptBrushConfig = {
  radius: 3.0,
  strength: 0.02,
  falloff: "smooth",
};

// ─── Store ──────────────────────────────────────────────────────────────────

export const useSculptStore = create<SculptState>((set, get) => ({
  // Defaults
  isSculptMode: false,
  elevationDeltas: {},
  hoveredVertex: null,
  selectedVertex: null,
  hoveredWorldPos: null,
  brush: { ...DEFAULT_BRUSH },
  undoStack: [],

  // ── Mode ────────────────────────────────────────────────────────────────
  setSculptMode: (on) =>
    set({
      isSculptMode: on,
      hoveredVertex: null,
      selectedVertex: null,
      hoveredWorldPos: null,
    }),

  // ── Hover / Selection ──────────────────────────────────────────────────
  setHoveredVertex: (index, worldPos = null) =>
    set({ hoveredVertex: index, hoveredWorldPos: worldPos }),

  setSelectedVertex: (index) => set({ selectedVertex: index }),

  // ── Single vertex delta (drag) ─────────────────────────────────────────
  applyDelta: (vertexIndex, delta) =>
    set((state) => ({
      elevationDeltas: {
        ...state.elevationDeltas,
        [vertexIndex]: (state.elevationDeltas[vertexIndex] ?? 0) + delta,
      },
    })),

  // ── Brush stroke (multiple vertices) ───────────────────────────────────
  applyBrushDeltas: (entries) =>
    set((state) => {
      const newDeltas = { ...state.elevationDeltas };
      for (const [idx, d] of entries) {
        newDeltas[idx] = (newDeltas[idx] ?? 0) + d;
      }
      return { elevationDeltas: newDeltas };
    }),

  // ── Commit to undo stack ───────────────────────────────────────────────
  commitToUndo: () =>
    set((state) => {
      const snapshot = { ...state.elevationDeltas };
      const stack = [...state.undoStack, snapshot].slice(-MAX_UNDO);
      return { undoStack: stack };
    }),

  // ── Set exact delta (manual input) ─────────────────────────────────────
  setExactDelta: (vertexIndex, absoluteDelta) =>
    set((state) => ({
      elevationDeltas: {
        ...state.elevationDeltas,
        [vertexIndex]: absoluteDelta,
      },
    })),

  // ── Undo ───────────────────────────────────────────────────────────────
  undo: () =>
    set((state) => {
      if (state.undoStack.length === 0) return {};
      const newStack = [...state.undoStack];
      newStack.pop(); // Remove the last committed state
      // Restore to the previous state, or empty if stack is depleted
      const previousDeltas =
        newStack.length > 0 ? { ...newStack[newStack.length - 1] } : {};
      return {
        elevationDeltas: previousDeltas,
        undoStack: newStack,
      };
    }),

  // ── Reset all ──────────────────────────────────────────────────────────
  resetAllDeltas: () =>
    set({
      elevationDeltas: {},
      undoStack: [],
      hoveredVertex: null,
      selectedVertex: null,
      hoveredWorldPos: null,
    }),

  // ── Brush config ───────────────────────────────────────────────────────
  setBrush: (config) =>
    set((state) => ({
      brush: { ...state.brush, ...config },
    })),
}));
