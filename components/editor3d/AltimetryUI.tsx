/**
 * AltimetryUI.tsx — Premium dual-panel Terrain Controls
 *
 * "Stellar Glass" design system by Stitch / Google DeepMind.
 *
 * Panel 1 — Hauteur du terrain (sky blue / primary)
 *   · Horizontal slider  0.1x → 5x
 *   · Quick presets: ×0.5  Réel  ×2  ×3
 *
 * Panel 2 — Sculpture terrain (amber / tertiary)
 *   · Sculpt mode toggle
 *   · Brush radius + strength steppers
 *   · Manual NGF input for selected vertex
 *   · Undo / Reset actions
 *
 * Both panels are fully separate cards, each with their own header,
 * glassmorphism background, and independent collapse state.
 */

"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  Mountain,
  Undo2,
  RotateCcw,
  Minus,
  Plus,
  ChevronDown,
  ChevronUp,
  Layers,
  Zap,
} from "lucide-react";
import { useSculptStore } from "@/store/useSculptStore";

// ─── Design tokens (Stellar Glass) ─────────────────────────────────────────

const G = {
  // Surfaces
  bg:      "rgba(10,15,30,0.82)",
  card:    "rgba(22,27,43,0.94)",
  row:     "rgba(37,41,58,0.70)",
  rowHov:  "rgba(47,52,69,0.80)",
  // Sky (primary — height)
  sky:     "#90cdff",
  skyBright: "#00adff",
  skyGlow: "rgba(0,173,255,0.22)",
  // Amber (tertiary — sculpt)
  amber:   "#ffba43",
  amberDim: "rgba(255,186,67,0.18)",
  amberBorder: "rgba(255,186,67,0.30)",
  // Ghost border
  border:  "rgba(62,72,81,0.55)",
  // Text
  textHi:  "#dee1f7",
  textLo:  "#bec8d3",
  textDim: "#6b7a8d",
  // Blur
  blur:    "blur(20px) saturate(180%)",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const panelBase: React.CSSProperties = {
  background: G.card,
  backdropFilter: G.blur,
  WebkitBackdropFilter: G.blur,
  border: `0.5px solid ${G.border}`,
  borderRadius: 16,
  boxShadow: "0 8px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
  width: 264,
  color: G.textHi,
  overflow: "hidden",
  fontFamily: "Inter, system-ui, sans-serif",
};

const sectionHeader = (accent: string): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "11px 14px",
  borderBottom: `0.5px solid ${G.border}`,
  background: "rgba(255,255,255,0.025)",
  cursor: "pointer",
  userSelect: "none",
});

// ─── Props ──────────────────────────────────────────────────────────────────

interface AltimetryUIProps {
  getVertexNGF?: (vertexIndex: number) => number;
  className?: string;
  zScale?: number;
  setZScale?: (v: number) => void;
}

// ─── Height Panel ────────────────────────────────────────────────────────────

interface HeightPanelProps {
  zScale: number;
  setZScale: (v: number) => void;
}

function HeightPanel({ zScale, setZScale }: HeightPanelProps) {
  const [open, setOpen] = useState(true);
  const pct = Math.round(((zScale - 0.1) / 4.9) * 100);
  const label = Math.abs(zScale - 1) < 0.05 ? "Réel" : `×${zScale.toFixed(1)}`;
  const PRESETS = [0.5, 1, 2, 3] as const;

  return (
    <div style={panelBase}>
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={sectionHeader(G.sky)}
        className="w-full text-left transition-colors hover:bg-white/[0.03]"
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 8,
            background: `linear-gradient(135deg, ${G.skyGlow}, rgba(144,205,255,0.10))`,
            border: `0.5px solid rgba(144,205,255,0.25)`,
            flexShrink: 0,
          }}
        >
          <Mountain style={{ width: 14, height: 14, color: G.sky }} />
        </span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, letterSpacing: "0.01em", color: G.textHi }}>
          Hauteur du terrain
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            fontFamily: "ui-monospace, monospace",
            color: G.skyBright,
            background: `rgba(0,173,255,0.12)`,
            border: `0.5px solid rgba(0,173,255,0.25)`,
            borderRadius: 6,
            padding: "2px 7px",
            letterSpacing: "0.02em",
          }}
        >
          {label}
        </span>
        {open
          ? <ChevronUp   style={{ width: 13, height: 13, color: G.textDim, marginLeft: 4 }} />
          : <ChevronDown style={{ width: 13, height: 13, color: G.textDim, marginLeft: 4 }} />
        }
      </button>

      {/* Body */}
      {open && (
        <div style={{ padding: "14px 14px 12px" }}>
          {/* Slider */}
          <div style={{ position: "relative", marginBottom: 6 }}>
            <input
              type="range"
              min={0.1}
              max={5}
              step={0.1}
              value={zScale}
              onChange={(e) => setZScale(parseFloat(e.target.value))}
              style={{
                width: "100%",
                height: 4,
                appearance: "none",
                WebkitAppearance: "none",
                borderRadius: 99,
                outline: "none",
                cursor: "pointer",
                background: `linear-gradient(to right, ${G.skyBright} ${pct}%, rgba(144,205,255,0.15) ${pct}%)`,
                boxShadow: `0 0 8px ${G.skyGlow}`,
              }}
            />
          </div>
          {/* Tick labels */}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            {["Plat", "Réel", "×5"].map((t) => (
              <span key={t} style={{ fontSize: 9, color: G.textDim, letterSpacing: "0.04em" }}>
                {t}
              </span>
            ))}
          </div>

          {/* Preset buttons */}
          <div style={{ display: "flex", gap: 5 }}>
            {PRESETS.map((v) => {
              const active = Math.abs(zScale - v) < 0.05;
              return (
                <button
                  key={v}
                  onClick={() => setZScale(v)}
                  style={{
                    flex: 1,
                    padding: "5px 0",
                    borderRadius: 8,
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: "pointer",
                    border: active ? `0.5px solid rgba(0,173,255,0.50)` : `0.5px solid ${G.border}`,
                    background: active
                      ? `linear-gradient(135deg, rgba(0,173,255,0.22), rgba(144,205,255,0.12))`
                      : G.row,
                    color: active ? G.sky : G.textLo,
                    boxShadow: active ? `0 0 10px rgba(0,173,255,0.18)` : "none",
                    transition: "all 0.15s ease",
                    letterSpacing: "0.02em",
                  }}
                >
                  {v === 1 ? "Réel" : `×${v}`}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sculpt Panel ────────────────────────────────────────────────────────────

interface SculptPanelProps {
  getVertexNGF?: (idx: number) => number;
}

function SculptPanel({ getVertexNGF }: SculptPanelProps) {
  const [open, setOpen] = useState(false);

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

  const activeVertex = selectedVertex ?? hoveredVertex;

  const modifiedCount = useMemo(
    () => Object.keys(elevationDeltas).length,
    [elevationDeltas]
  );

  const currentElevation = useMemo(() => {
    if (activeVertex === null || !getVertexNGF) return null;
    return getVertexNGF(activeVertex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVertex, getVertexNGF, elevationDeltas]);

  const currentDelta = useMemo(() => {
    if (activeVertex === null) return 0;
    return elevationDeltas[activeVertex] ?? 0;
  }, [activeVertex, elevationDeltas]);

  const handleToggleSculpt = useCallback(() => {
    setSculptMode(!isSculptMode);
  }, [isSculptMode, setSculptMode]);

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

  // Stepper helper
  const stepper = (
    label: string,
    value: string,
    onMinus: () => void,
    onPlus:  () => void,
  ) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 11, color: G.textLo, letterSpacing: "0.01em" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button
          onClick={onMinus}
          style={{
            width: 26, height: 26, borderRadius: 7, display: "flex", alignItems: "center",
            justifyContent: "center", background: G.row, border: `0.5px solid ${G.border}`,
            color: G.textLo, cursor: "pointer", transition: "background 0.12s",
          }}
        >
          <Minus style={{ width: 11, height: 11 }} />
        </button>
        <span style={{
          fontFamily: "ui-monospace, monospace", fontSize: 11, color: G.textHi,
          minWidth: 48, textAlign: "center", fontWeight: 600,
        }}>
          {value}
        </span>
        <button
          onClick={onPlus}
          style={{
            width: 26, height: 26, borderRadius: 7, display: "flex", alignItems: "center",
            justifyContent: "center", background: G.row, border: `0.5px solid ${G.border}`,
            color: G.textLo, cursor: "pointer", transition: "background 0.12s",
          }}
        >
          <Plus style={{ width: 11, height: 11 }} />
        </button>
      </div>
    </div>
  );

  const amberBorder = isSculptMode
    ? `0.5px solid ${G.amberBorder}`
    : `0.5px solid ${G.border}`;

  return (
    <div
      style={{
        ...panelBase,
        border: amberBorder,
        boxShadow: isSculptMode
          ? `0 8px 40px rgba(0,0,0,0.45), 0 0 0 1px ${G.amberBorder}, inset 0 1px 0 rgba(255,255,255,0.04)`
          : panelBase.boxShadow,
        transition: "box-shadow 0.25s ease, border-color 0.25s ease",
      }}
    >
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={sectionHeader(G.amber)}
        className="w-full text-left transition-colors hover:bg-white/[0.03]"
      >
        <span
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            background: isSculptMode
              ? `linear-gradient(135deg, ${G.amberDim}, rgba(255,186,67,0.08))`
              : G.row,
            border: isSculptMode ? `0.5px solid ${G.amberBorder}` : `0.5px solid ${G.border}`,
            transition: "all 0.2s ease",
          }}
        >
          <Zap style={{ width: 13, height: 13, color: isSculptMode ? G.amber : G.textDim }} />
        </span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, letterSpacing: "0.01em", color: G.textHi }}>
          Sculpture terrain
        </span>
        {modifiedCount > 0 && (
          <span
            style={{
              fontSize: 10, fontWeight: 700, fontFamily: "ui-monospace,monospace",
              color: G.amber, background: G.amberDim,
              border: `0.5px solid ${G.amberBorder}`,
              borderRadius: 6, padding: "2px 6px",
            }}
          >
            {modifiedCount > 99 ? "99+" : modifiedCount} pts
          </span>
        )}
        {isSculptMode && (
          <span
            style={{
              width: 6, height: 6, borderRadius: "50%",
              background: G.amber, boxShadow: `0 0 6px ${G.amber}`,
              marginLeft: 6, flexShrink: 0,
            }}
          />
        )}
        {open
          ? <ChevronDown style={{ width: 13, height: 13, color: G.textDim, marginLeft: 4 }} />
          : <ChevronUp   style={{ width: 13, height: 13, color: G.textDim, marginLeft: 4 }} />
        }
      </button>

      {/* Body */}
      {open && (
        <div style={{ padding: "10px 14px 12px" }}>
          {/* Sculpt toggle */}
          <button
            onClick={handleToggleSculpt}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 10px",
              borderRadius: 10,
              marginBottom: 10,
              cursor: "pointer",
              border: isSculptMode ? `0.5px solid ${G.amberBorder}` : `0.5px solid ${G.border}`,
              background: isSculptMode
                ? `linear-gradient(135deg, rgba(255,186,67,0.14), rgba(255,186,67,0.06))`
                : G.row,
              transition: "all 0.18s ease",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: isSculptMode ? G.amber : G.textLo }}>
              {isSculptMode ? "Sculpture active" : "Activer la sculpture"}
            </span>
            {/* Toggle pill */}
            <span
              style={{
                display: "inline-flex",
                width: 34,
                height: 18,
                borderRadius: 99,
                background: isSculptMode ? G.amber : "rgba(255,255,255,0.12)",
                position: "relative",
                transition: "background 0.2s ease",
                flexShrink: 0,
                border: `0.5px solid ${isSculptMode ? G.amber : G.border}`,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: isSculptMode ? 17 : 2,
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: isSculptMode ? "#0e1322" : G.textDim,
                  transition: "left 0.18s ease, background 0.18s ease",
                  boxShadow: isSculptMode ? `0 0 4px ${G.amber}` : "none",
                }}
              />
            </span>
          </button>

          {/* Brush controls (only when sculpt active) */}
          {isSculptMode && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Falloff toggle */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                <span
                  style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.07em",
                    textTransform: "uppercase", color: G.textDim,
                  }}
                >
                  Pinceau
                </span>
                <button
                  onClick={handleFalloffToggle}
                  style={{
                    fontSize: 9, fontWeight: 600,
                    color: G.textLo, background: G.row,
                    border: `0.5px solid ${G.border}`,
                    borderRadius: 5, padding: "2px 7px",
                    cursor: "pointer", letterSpacing: "0.03em",
                  }}
                >
                  {brush.falloff === "smooth" ? "⊛ Doux" : "△ Linéaire"}
                </button>
              </div>

              {stepper(
                "Rayon",
                `${brush.radius.toFixed(1)} m`,
                () => setBrush({ radius: Math.max(0.5, brush.radius - 0.5) }),
                () => setBrush({ radius: Math.min(20.0, brush.radius + 0.5) }),
              )}

              {stepper(
                "Force",
                brush.strength.toFixed(3),
                () => setBrush({ strength: Math.round(Math.max(0.002, brush.strength - 0.005) * 1000) / 1000 }),
                () => setBrush({ strength: Math.round(Math.min(0.15,  brush.strength + 0.005) * 1000) / 1000 }),
              )}

              {/* Vertex NGF input */}
              {activeVertex !== null && currentElevation !== null && (
                <div
                  style={{
                    background: G.row,
                    borderRadius: 9,
                    padding: "8px 10px",
                    border: `0.5px solid ${G.border}`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: "0.07em",
                        textTransform: "uppercase", color: G.textDim,
                      }}
                    >
                      Élévation
                    </span>
                    {Math.abs(currentDelta) > 0.001 && (
                      <span
                        style={{
                          fontSize: 10, fontFamily: "ui-monospace,monospace", fontWeight: 700,
                          color: currentDelta > 0 ? "#4ade80" : "#f87171",
                        }}
                      >
                        {currentDelta > 0 ? "+" : ""}{currentDelta.toFixed(2)} m
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <label style={{ fontSize: 10, color: G.textLo, whiteSpace: "nowrap" }}>NGF (m):</label>
                    <input
                      type="number"
                      step={0.1}
                      value={currentElevation.toFixed(2)}
                      onChange={handleManualElevation}
                      style={{
                        flex: 1,
                        padding: "4px 8px",
                        borderRadius: 7,
                        fontSize: 11,
                        fontFamily: "ui-monospace,monospace",
                        fontWeight: 600,
                        background: "rgba(10,15,30,0.70)",
                        border: `0.5px solid rgba(144,205,255,0.25)`,
                        color: G.sky,
                        outline: "none",
                        width: 0,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Undo / Reset */}
              <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                <button
                  onClick={undo}
                  disabled={undoStack.length === 0}
                  style={{
                    flex: 1,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                    padding: "6px 0",
                    borderRadius: 8,
                    fontSize: 11, fontWeight: 600,
                    cursor: undoStack.length > 0 ? "pointer" : "not-allowed",
                    background: undoStack.length > 0 ? G.row : "rgba(255,255,255,0.04)",
                    border: `0.5px solid ${G.border}`,
                    color: undoStack.length > 0 ? G.textLo : G.textDim,
                    transition: "all 0.12s ease",
                  }}
                >
                  <Undo2 style={{ width: 12, height: 12 }} />
                  Annuler
                </button>
                <button
                  onClick={resetAllDeltas}
                  disabled={modifiedCount === 0}
                  style={{
                    flex: 1,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                    padding: "6px 0",
                    borderRadius: 8,
                    fontSize: 11, fontWeight: 600,
                    cursor: modifiedCount > 0 ? "pointer" : "not-allowed",
                    background: modifiedCount > 0 ? "rgba(248,113,113,0.10)" : "rgba(255,255,255,0.04)",
                    border: modifiedCount > 0 ? "0.5px solid rgba(248,113,113,0.30)" : `0.5px solid ${G.border}`,
                    color: modifiedCount > 0 ? "#f87171" : G.textDim,
                    transition: "all 0.12s ease",
                  }}
                >
                  <RotateCcw style={{ width: 12, height: 12 }} />
                  Réinit.
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main FAB + Panels ──────────────────────────────────────────────────────

export default function AltimetryUI({
  getVertexNGF,
  className = "",
  zScale = 1.0,
  setZScale,
}: AltimetryUIProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const isSculptMode = useSculptStore((s) => s.isSculptMode);
  const modifiedCount = useSculptStore((s) => Object.keys(s.elevationDeltas).length);

  return (
    <div
      className={className}
      style={{
        position: "absolute",
        bottom: 20,
        right: 16,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
        pointerEvents: "auto",
      }}
    >
      {/* ── Expanded panels (above FAB) ── */}
      {panelOpen && (
        <>
          {/* Height panel (sky blue) */}
          {setZScale && (
            <div
              style={{
                animation: "slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              <HeightPanel zScale={zScale} setZScale={setZScale} />
            </div>
          )}

          {/* Sculpt panel (amber) */}
          <div
            style={{
              animation: "slideUp 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <SculptPanel getVertexNGF={getVertexNGF} />
          </div>
        </>
      )}

      {/* ── FAB trigger ── */}
      <button
        onClick={() => setPanelOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          paddingLeft: 14,
          paddingRight: 12,
          paddingTop: 10,
          paddingBottom: 10,
          borderRadius: 14,
          cursor: "pointer",
          border: panelOpen
            ? `0.5px solid rgba(144,205,255,0.30)`
            : `0.5px solid rgba(255,255,255,0.18)`,
          background: panelOpen
            ? "rgba(10,15,30,0.90)"
            : "rgba(255,255,255,0.90)",
          backdropFilter: G.blur,
          WebkitBackdropFilter: G.blur,
          boxShadow: panelOpen
            ? `0 4px 24px rgba(0,0,0,0.30), 0 0 0 1px rgba(0,173,255,0.12)`
            : "0 4px 24px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.55)",
          color: panelOpen ? G.textHi : "#334155",
          transition: "all 0.2s ease",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        {/* Icon cluster */}
        <span style={{ position: "relative", display: "flex" }}>
          <Layers
            style={{
              width: 15, height: 15, flexShrink: 0,
              color: panelOpen ? G.sky : "#64748b",
              transition: "color 0.2s",
            }}
          />
          {/* Active dot */}
          {(isSculptMode || modifiedCount > 0) && (
            <span
              style={{
                position: "absolute",
                top: -3, right: -3,
                width: 6, height: 6,
                borderRadius: "50%",
                background: G.amber,
                boxShadow: `0 0 5px ${G.amber}`,
              }}
            />
          )}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.01em", whiteSpace: "nowrap" }}>
          Terrain avancé
        </span>
        {modifiedCount > 0 && !panelOpen && (
          <span
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 18, height: 18, borderRadius: "50%",
              background: G.amber, fontSize: 9, fontWeight: 700,
              color: "#1a1000", letterSpacing: 0,
            }}
          >
            {modifiedCount > 9 ? "9+" : modifiedCount}
          </span>
        )}
        {panelOpen
          ? <ChevronDown style={{ width: 13, height: 13, opacity: 0.55 }} />
          : <ChevronUp   style={{ width: 13, height: 13, opacity: 0.55 }} />
        }
      </button>

      {/* Keyframes injected once */}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
