/**
 * AltimetryUI.tsx — 3D Terrain Sculpting Overlay Controls
 *
 * Enterprise-grade HTML/Tailwind overlay that sits on top of the 3D viewer.
 * Provides:
 *   1. Sculpt Mode toggle
 *   2. Brush configuration (radius, strength, falloff)
 *   3. Selected vertex elevation display + manual input
 *   4. Undo / Reset controls
 *
 * DESIGN:
 *   - Compact floating panel in the top-right corner of the 3D viewport
 *   - Semi-transparent dark glass aesthetic matching the editor theme
 *   - Non-blocking: never prevents interaction with the 3D canvas
 */

"use client";

import React, { useCallback, useMemo } from "react";
import {
  Mountain,
  Undo2,
  RotateCcw,
  Circle,
  Minus,
  Plus,
  MousePointer2,
} from "lucide-react";
import { useSculptStore } from "@/store/useSculptStore";

// ─── Props ──────────────────────────────────────────────────────────────────

interface AltimetryUIProps {
  /**
   * Function to compute the real-world NGF elevation for a given vertex.
   * Called when the UI needs to display the current elevation.
   * Receives: vertexIndex → returns elevation in metres NGF.
   */
  getVertexNGF?: (vertexIndex: number) => number;
  /** Optional CSS class for positioning */
  className?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function AltimetryUI({ getVertexNGF, className = "" }: AltimetryUIProps) {
  const isSculptMode = useSculptStore((s) => s.isSculptMode);
  const setSculptMode = useSculptStore((s) => s.setSculptMode);
  const brush = useSculptStore((s) => s.brush);
  const setBrush = useSculptStore((s) => s.setBrush);
  const selectedVertex = useSculptStore((s) => s.selectedVertex);
  const hoveredVertex = useSculptStore((s) => s.hoveredVertex);
  const elevationDeltas = useSculptStore((s) => s.elevationDeltas);
  const setExactDelta = useSculptStore((s) => s.setExactDelta);
  const undo = useSculptStore((s) => s.undo);
  const resetAllDeltas = useSculptStore((s) => s.resetAllDeltas);
  const undoStack = useSculptStore((s) => s.undoStack);

  const activeVertex = selectedVertex ?? hoveredVertex;

  // Compute the real-world elevation for the active vertex
  const currentElevation = useMemo(() => {
    if (activeVertex === null || !getVertexNGF) return null;
    return getVertexNGF(activeVertex);
  }, [activeVertex, getVertexNGF, elevationDeltas]); // re-derive when deltas change

  const currentDelta = useMemo(() => {
    if (activeVertex === null) return 0;
    return elevationDeltas[activeVertex] ?? 0;
  }, [activeVertex, elevationDeltas]);

  const modifiedCount = useMemo(
    () => Object.keys(elevationDeltas).length,
    [elevationDeltas]
  );

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleToggleSculpt = useCallback(() => {
    setSculptMode(!isSculptMode);
  }, [isSculptMode, setSculptMode]);

  const handleRadiusChange = useCallback(
    (dir: 1 | -1) => {
      const newR = Math.max(0.5, Math.min(20.0, brush.radius + dir * 0.5));
      setBrush({ radius: newR });
    },
    [brush.radius, setBrush]
  );

  const handleStrengthChange = useCallback(
    (dir: 1 | -1) => {
      const newS = Math.max(0.002, Math.min(0.15, brush.strength + dir * 0.005));
      setBrush({ strength: Math.round(newS * 1000) / 1000 });
    },
    [brush.strength, setBrush]
  );

  const handleFalloffToggle = useCallback(() => {
    setBrush({ falloff: brush.falloff === "smooth" ? "linear" : "smooth" });
  }, [brush.falloff, setBrush]);

  const handleManualElevation = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (activeVertex === null || !getVertexNGF) return;
      const targetNGF = parseFloat(e.target.value);
      if (isNaN(targetNGF)) return;

      // Compute what delta we need:
      // currentNGF = originalNGF + existingDelta/exag (simplified)
      // We store the raw scene-space delta — but for manual input,
      // we set an absolute delta that produces the desired NGF.
      // The getVertexNGF callback already handles exag conversion,
      // so we compute: newDelta = (targetNGF - originalNGF) * exag
      // Since we don't have exag here, we compute relative to current:
      const currentNGF = getVertexNGF(activeVertex);
      const existingDelta = elevationDeltas[activeVertex] ?? 0;
      // delta that was needed to get from original to current:
      // we don't know exag, so we use the difference approach:
      const additionalDelta = targetNGF - currentNGF;
      // This won't be perfectly scene-space-accurate without the exag factor,
      // but for the UI it provides reasonable manual control.
      setExactDelta(activeVertex, existingDelta + additionalDelta);
    },
    [activeVertex, getVertexNGF, elevationDeltas, setExactDelta]
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className={`
        absolute top-3 right-3 z-50 w-64
        flex flex-col gap-2
        ${className}
      `}
      style={{ pointerEvents: "auto" }}
    >
      {/* ═══ Toggle Button ═══ */}
      <button
        onClick={handleToggleSculpt}
        className={`
          flex items-center gap-2.5 px-4 py-2.5 rounded-xl
          text-sm font-semibold tracking-wide
          backdrop-blur-md border transition-all duration-200
          ${
            isSculptMode
              ? "bg-amber-500/90 border-amber-400/50 text-slate-900 shadow-lg shadow-amber-500/25 hover:bg-amber-500"
              : "bg-slate-800/80 border-slate-600/40 text-slate-200 hover:bg-slate-700/80 hover:border-slate-500/50"
          }
        `}
      >
        <Mountain className="w-4 h-4" />
        {isSculptMode ? "Sculpting Active" : "Enable Terrain Sculpting"}
      </button>

      {/* ═══ Controls Panel (only when sculpt mode is on) ═══ */}
      {isSculptMode && (
        <div className="rounded-xl bg-slate-900/85 backdrop-blur-md border border-slate-700/50 overflow-hidden shadow-xl">
          {/* Brush Settings */}
          <div className="px-3 pt-3 pb-2 space-y-2.5">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <span>Brush Settings</span>
              <button
                onClick={handleFalloffToggle}
                className="px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300 hover:bg-slate-600/60 text-[9px] font-medium"
                title="Toggle brush falloff"
              >
                {brush.falloff === "smooth" ? "⊛ Smooth" : "△ Linear"}
              </button>
            </div>

            {/* Radius */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <Circle className="w-3 h-3" /> Radius
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleRadiusChange(-1)}
                  className="w-5 h-5 rounded bg-slate-700/80 text-slate-300 hover:bg-slate-600 flex items-center justify-center"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="text-xs font-mono text-slate-200 w-12 text-center">
                  {brush.radius.toFixed(1)}m
                </span>
                <button
                  onClick={() => handleRadiusChange(1)}
                  className="w-5 h-5 rounded bg-slate-700/80 text-slate-300 hover:bg-slate-600 flex items-center justify-center"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Strength */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <MousePointer2 className="w-3 h-3" /> Strength
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleStrengthChange(-1)}
                  className="w-5 h-5 rounded bg-slate-700/80 text-slate-300 hover:bg-slate-600 flex items-center justify-center"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="text-xs font-mono text-slate-200 w-12 text-center">
                  {brush.strength.toFixed(3)}
                </span>
                <button
                  onClick={() => handleStrengthChange(1)}
                  className="w-5 h-5 rounded bg-slate-700/80 text-slate-300 hover:bg-slate-600 flex items-center justify-center"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-slate-700/50" />

          {/* Active Vertex Info */}
          <div className="px-3 py-2.5">
            {activeVertex !== null && currentElevation !== null ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Vertex #{activeVertex}
                  </span>
                  {Math.abs(currentDelta) > 0.001 && (
                    <span
                      className={`text-[10px] font-mono font-bold ${
                        currentDelta > 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {currentDelta > 0 ? "+" : ""}
                      {currentDelta.toFixed(3)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-slate-400 whitespace-nowrap">
                    NGF (m):
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={currentElevation.toFixed(2)}
                    onChange={handleManualElevation}
                    className="
                      flex-1 px-2 py-1 rounded-md text-xs font-mono
                      bg-slate-800/80 border border-slate-600/50
                      text-slate-200 focus:border-amber-500/60
                      focus:outline-none focus:ring-1 focus:ring-amber-500/30
                    "
                  />
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 italic text-center py-1">
                Hover or click a terrain vertex
              </p>
            )}
          </div>

          {/* Divider */}
          <div className="h-px bg-slate-700/50" />

          {/* Actions */}
          <div className="px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => undo()}
                disabled={undoStack.length === 0}
                className={`
                  flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium
                  transition-colors
                  ${
                    undoStack.length > 0
                      ? "bg-slate-700/60 text-slate-300 hover:bg-slate-600/60"
                      : "bg-slate-800/40 text-slate-600 cursor-not-allowed"
                  }
                `}
                title="Undo last sculpt action"
              >
                <Undo2 className="w-3 h-3" /> Undo
              </button>

              <button
                onClick={() => resetAllDeltas()}
                disabled={modifiedCount === 0}
                className={`
                  flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium
                  transition-colors
                  ${
                    modifiedCount > 0
                      ? "bg-red-500/15 text-red-300 hover:bg-red-500/25"
                      : "bg-slate-800/40 text-slate-600 cursor-not-allowed"
                  }
                `}
                title="Reset all terrain modifications"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            </div>

            {modifiedCount > 0 && (
              <span className="text-[10px] font-mono text-amber-400/80">
                {modifiedCount} pts
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
