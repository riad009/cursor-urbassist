/**
 * AltimetryUI.tsx — Simplified "Advanced Terrain" FAB
 *
 * ▸ DEFAULT: A single, minimal FAB "Modifier le terrain" — not intimidating at all.
 * ▸ ON CLICK: Slides out the existing brush/sculpt controls in a compact panel.
 * ▸ The underlying sculpt math (AltimetrySculptor.ts) is completely untouched.
 * ▸ Zero regression on undo/reset/brush logic — all still wired.
 */

"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  Mountain,
  Undo2,
  RotateCcw,
  Circle,
  Minus,
  Plus,
  MousePointer2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useSculptStore } from "@/store/useSculptStore";

// ─── Props ──────────────────────────────────────────────────────────────────

interface AltimetryUIProps {
  getVertexNGF?: (vertexIndex: number) => number;
  className?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function AltimetryUI({ getVertexNGF, className = "" }: AltimetryUIProps) {
  const isSculptMode   = useSculptStore((s) => s.isSculptMode);
  const setSculptMode  = useSculptStore((s) => s.setSculptMode);
  const brush          = useSculptStore((s) => s.brush);
  const setBrush       = useSculptStore((s) => s.setBrush);
  const selectedVertex = useSculptStore((s) => s.selectedVertex);
  const hoveredVertex  = useSculptStore((s) => s.hoveredVertex);
  const elevationDeltas = useSculptStore((s) => s.elevationDeltas);
  const setExactDelta  = useSculptStore((s) => s.setExactDelta);
  const undo           = useSculptStore((s) => s.undo);
  const resetAllDeltas = useSculptStore((s) => s.resetAllDeltas);
  const undoStack      = useSculptStore((s) => s.undoStack);

  /** Whether the advanced controls drawer is open */
  const [panelOpen, setPanelOpen] = useState(false);

  const activeVertex = selectedVertex ?? hoveredVertex;

  const currentElevation = useMemo(() => {
    if (activeVertex === null || !getVertexNGF) return null;
    return getVertexNGF(activeVertex);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVertex, getVertexNGF, elevationDeltas]);

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
    (dir: 1 | -1) => setBrush({ radius: Math.max(0.5, Math.min(20.0, brush.radius + dir * 0.5)) }),
    [brush.radius, setBrush]
  );

  const handleStrengthChange = useCallback(
    (dir: 1 | -1) => setBrush({ strength: Math.round(Math.max(0.002, Math.min(0.15, brush.strength + dir * 0.005)) * 1000) / 1000 }),
    [brush.strength, setBrush]
  );

  const handleFalloffToggle = useCallback(
    () => setBrush({ falloff: brush.falloff === "smooth" ? "linear" : "smooth" }),
    [brush.falloff, setBrush]
  );

  const handleManualElevation = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (activeVertex === null || !getVertexNGF) return;
      const targetNGF = parseFloat(e.target.value);
      if (isNaN(targetNGF)) return;
      const currentNGF = getVertexNGF(activeVertex);
      const existingDelta = elevationDeltas[activeVertex] ?? 0;
      setExactDelta(activeVertex, existingDelta + (targetNGF - currentNGF));
    },
    [activeVertex, getVertexNGF, elevationDeltas, setExactDelta]
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className={`absolute bottom-5 right-4 z-50 flex flex-col items-end gap-2 ${className}`}
      style={{ pointerEvents: "auto" }}
    >
      {/* ── Advanced Controls Drawer (hidden by default) ── */}
      {panelOpen && (
        <div
          className="rounded-2xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-3 duration-200"
          style={{
            background: "rgba(15,23,42,0.92)",
            backdropFilter: "blur(16px) saturate(180%)",
            border: "1px solid rgba(148,163,184,0.15)",
            width: 240,
            color: "#e2e8f0",
          }}
        >
          {/* Sculpt Mode Toggle */}
          <button
            onClick={handleToggleSculpt}
            className={`
              w-full flex items-center gap-2.5 px-4 py-3
              text-sm font-semibold tracking-wide border-b transition-all duration-150
              ${isSculptMode
                ? "bg-amber-500/20 border-amber-500/30 text-amber-300"
                : "border-slate-700/50 text-slate-300 hover:bg-slate-700/40"
              }
            `}
          >
            <Mountain className="w-4 h-4 shrink-0" />
            {isSculptMode ? "Sculpture active" : "Activer la sculpture"}
            <span className={`ml-auto w-2 h-2 rounded-full ${isSculptMode ? "bg-amber-400" : "bg-slate-600"}`} />
          </button>

          {/* Brush controls — only when sculpt mode on */}
          {isSculptMode && (
            <div className="px-3 pt-3 pb-2 space-y-3">
              {/* Brush header */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pinceau</span>
                <button
                  onClick={handleFalloffToggle}
                  className="px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300 hover:bg-slate-600/60 text-[9px] font-medium"
                >
                  {brush.falloff === "smooth" ? "⊛ Doux" : "△ Linéaire"}
                </button>
              </div>

              {/* Radius */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <Circle className="w-3 h-3" /> Rayon
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleRadiusChange(-1)} className="w-6 h-6 rounded-lg bg-slate-700/80 text-slate-300 hover:bg-slate-600 flex items-center justify-center">
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-xs font-mono text-slate-200 w-12 text-center">{brush.radius.toFixed(1)}m</span>
                  <button onClick={() => handleRadiusChange(1)} className="w-6 h-6 rounded-lg bg-slate-700/80 text-slate-300 hover:bg-slate-600 flex items-center justify-center">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Strength */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <MousePointer2 className="w-3 h-3" /> Force
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleStrengthChange(-1)} className="w-6 h-6 rounded-lg bg-slate-700/80 text-slate-300 hover:bg-slate-600 flex items-center justify-center">
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-xs font-mono text-slate-200 w-12 text-center">{brush.strength.toFixed(3)}</span>
                  <button onClick={() => handleStrengthChange(1)} className="w-6 h-6 rounded-lg bg-slate-700/80 text-slate-300 hover:bg-slate-600 flex items-center justify-center">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Active vertex elevation input */}
              {activeVertex !== null && currentElevation !== null && (
                <div className="border-t border-slate-700/50 pt-2.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Élévation</span>
                    {Math.abs(currentDelta) > 0.001 && (
                      <span className={`text-[10px] font-mono font-bold ${currentDelta > 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {currentDelta > 0 ? "+" : ""}{currentDelta.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-slate-400 whitespace-nowrap">NGF (m):</label>
                    <input
                      type="number"
                      step="0.1"
                      value={currentElevation.toFixed(2)}
                      onChange={handleManualElevation}
                      className="flex-1 px-2 py-1 rounded-lg text-xs font-mono bg-slate-800/80 border border-slate-600/50 text-slate-200 focus:border-amber-500/60 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
                    />
                  </div>
                </div>
              )}

              {/* Undo / Reset */}
              <div className="border-t border-slate-700/50 pt-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => undo()}
                    disabled={undoStack.length === 0}
                    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${undoStack.length > 0 ? "bg-slate-700/60 text-slate-300 hover:bg-slate-600/60" : "bg-slate-800/40 text-slate-600 cursor-not-allowed"}`}
                  >
                    <Undo2 className="w-3 h-3" /> Annuler
                  </button>
                  <button
                    onClick={() => resetAllDeltas()}
                    disabled={modifiedCount === 0}
                    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${modifiedCount > 0 ? "bg-red-500/15 text-red-300 hover:bg-red-500/25" : "bg-slate-800/40 text-slate-600 cursor-not-allowed"}`}
                  >
                    <RotateCcw className="w-3 h-3" /> Réinitialiser
                  </button>
                </div>
                {modifiedCount > 0 && (
                  <span className="text-[10px] font-mono text-amber-400/80">{modifiedCount} pts</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Main FAB trigger ── */}
      <button
        onClick={() => setPanelOpen((o) => !o)}
        className="flex items-center gap-2.5 pl-4 pr-3 py-2.5 rounded-2xl shadow-xl transition-all duration-200 group"
        style={{
          background: panelOpen
            ? "rgba(15,23,42,0.95)"
            : "rgba(255,255,255,0.88)",
          backdropFilter: "blur(16px) saturate(180%)",
          WebkitBackdropFilter: "blur(16px) saturate(180%)",
          border: panelOpen
            ? "1px solid rgba(148,163,184,0.20)"
            : "1px solid rgba(148,163,184,0.28)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.5)",
          color: panelOpen ? "#e2e8f0" : "#334155",
        }}
      >
        <Mountain className="w-4 h-4 shrink-0" style={{ color: panelOpen ? "#fbbf24" : "#64748b" }} />
        <span className="text-sm font-semibold whitespace-nowrap">Terrain avancé</span>
        {modifiedCount > 0 && (
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-400/90 text-[9px] font-bold text-slate-900">
            {modifiedCount > 9 ? "9+" : modifiedCount}
          </span>
        )}
        {panelOpen ? <ChevronDown className="w-3.5 h-3.5 opacity-60" /> : <ChevronUp className="w-3.5 h-3.5 opacity-60" />}
      </button>
    </div>
  );
}
