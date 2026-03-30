/**
 * Terrain3DRightPanel.tsx
 *
 * Premium dark right-sidebar for the 3D view — inspired by 3D-Mapper's side panel.
 *
 * Sections:
 *   1. Terrain (height exaggeration slider + presets)
 *   2. Sculpture (sculpt mode toggle + brush controls + undo/reset)
 *
 * Mounted as a fixed sidebar alongside Terrain3DViewer in page.tsx.
 * No floating overlaps — all controls live here.
 */

"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  Mountain,
  Zap,
  Minus,
  Plus,
  Undo2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useSculptStore } from "@/store/useSculptStore";

// ─── Design Tokens (deep navy "Stellar Glass") ──────────────────────────────

const C = {
  panel:      "#111827",          // bg-gray-900
  section:    "#1a2235",          // slightly lighter sections
  row:        "#1f2d43",          // hover / stepper bg
  rowHov:     "#263550",
  border:     "rgba(55,65,81,0.7)",
  sky:        "#38bdf8",
  skyBright:  "#0ea5e9",
  skyGlow:    "rgba(56,189,248,0.20)",
  amber:      "#f59e0b",
  amberGlow:  "rgba(245,158,11,0.18)",
  amberBord:  "rgba(245,158,11,0.35)",
  textHi:     "#f1f5f9",
  textMid:    "#94a3b8",
  textDim:    "#475569",
  danger:     "#f87171",
  dangerBg:   "rgba(248,113,113,0.10)",
  dangerBord: "rgba(248,113,113,0.28)",
  green:      "#4ade80",
};

// ─── Props ───────────────────────────────────────────────────────────────────

interface Terrain3DRightPanelProps {
  zScale: number;
  setZScale: (v: number) => void;
  getVertexNGF?: (idx: number) => number;
}

// ─── Reusable Row ────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <p style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.09em",
      textTransform: "uppercase", color: C.textDim,
      padding: "8px 16px 4px",
    }}>
      {label}
    </p>
  );
}

function Divider() {
  return <div style={{ height: 1, background: C.border, margin: "0 0" }} />;
}

function Stepper({
  label, value, onMinus, onPlus,
}: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "6px 16px",
    }}>
      <span style={{ fontSize: 12, color: C.textMid }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          onClick={onMinus}
          style={{
            width: 28, height: 28, borderRadius: 7, display: "flex",
            alignItems: "center", justifyContent: "center",
            background: C.row, border: `1px solid ${C.border}`,
            color: C.textMid, cursor: "pointer",
          }}
        >
          <Minus style={{ width: 12, height: 12 }} />
        </button>
        <span style={{
          fontFamily: "ui-monospace,monospace", fontSize: 12,
          color: C.textHi, fontWeight: 600, minWidth: 56, textAlign: "center",
        }}>
          {value}
        </span>
        <button
          onClick={onPlus}
          style={{
            width: 28, height: 28, borderRadius: 7, display: "flex",
            alignItems: "center", justifyContent: "center",
            background: C.row, border: `1px solid ${C.border}`,
            color: C.textMid, cursor: "pointer",
          }}
        >
          <Plus style={{ width: 12, height: 12 }} />
        </button>
      </div>
    </div>
  );
}

// ─── Collapsible Section ─────────────────────────────────────────────────────

function Section({
  icon, label, badge, defaultOpen = true, accent = C.sky, children,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  accent?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px", background: "transparent", border: "none",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 30, height: 30, borderRadius: 9, flexShrink: 0,
          background: `rgba(${accent === C.sky ? "56,189,248" : "245,158,11"},0.12)`,
          border: `1px solid rgba(${accent === C.sky ? "56,189,248" : "245,158,11"},0.22)`,
        }}>
          {icon}
        </span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.textHi, letterSpacing: "0.01em" }}>
          {label}
        </span>
        {badge}
        {open
          ? <ChevronUp   style={{ width: 14, height: 14, color: C.textDim }} />
          : <ChevronDown style={{ width: 14, height: 14, color: C.textDim }} />
        }
      </button>
      {open && children}
      <Divider />
    </>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Terrain3DRightPanel({
  zScale,
  setZScale,
  getVertexNGF,
}: Terrain3DRightPanelProps) {

  // ── Sculpt store ──────────────────────────────────────────────────────────
  const isSculptMode    = useSculptStore((s) => s.isSculptMode);
  const setSculptMode   = useSculptStore((s) => s.setSculptMode);
  const brush           = useSculptStore((s) => s.brush);
  const setBrush        = useSculptStore((s) => s.setBrush);
  const selectedVertex  = useSculptStore((s) => s.selectedVertex);
  const hoveredVertex   = useSculptStore((s) => s.hoveredVertex);
  const elevationDeltas = useSculptStore((s) => s.elevationDeltas);
  const setExactDelta   = useSculptStore((s) => s.setExactDelta);
  const undo            = useSculptStore((s) => s.undo);
  const resetAllDeltas  = useSculptStore((s) => s.resetAllDeltas);
  const undoStack       = useSculptStore((s) => s.undoStack);

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

  const sliderPct = Math.round(((zScale - 0.1) / 4.9) * 100);
  const scaleLabel = Math.abs(zScale - 1) < 0.05 ? "Réel" : `×${zScale.toFixed(1)}`;

  return (
    <div
      style={{
        width: 260,
        height: "100%",
        background: C.panel,
        borderLeft: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        flexShrink: 0,
        fontFamily: "Inter, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      {/* ── Panel Header ─────────────────────────────────────────── */}
      <div style={{
        padding: "14px 16px 10px",
        borderBottom: `1px solid ${C.border}`,
        background: "#0f1623",
      }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: C.textMid, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Terrain 3D
        </p>
        <p style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
          Controls & sculpture
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          SECTION 1 — Height Exaggeration
      ══════════════════════════════════════════════════════════════ */}
      <Section
        defaultOpen={true}
        icon={<Mountain style={{ width: 14, height: 14, color: C.sky }} />}
        label="Hauteur du terrain"
        accent={C.sky}
        badge={
          <span style={{
            fontSize: 10, fontWeight: 700, fontFamily: "ui-monospace,monospace",
            color: C.skyBright, background: C.skyGlow,
            border: `1px solid rgba(56,189,248,0.30)`,
            borderRadius: 6, padding: "2px 8px", marginRight: 4,
          }}>
            {scaleLabel}
          </span>
        }
      >
        {/* Slider */}
        <div style={{ padding: "4px 16px 8px" }}>
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
              cursor: "pointer",
              outline: "none",
              background: `linear-gradient(to right, ${C.skyBright} ${sliderPct}%, rgba(56,189,248,0.15) ${sliderPct}%)`,
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            {["Plat", "Réel", "×5"].map((t) => (
              <span key={t} style={{ fontSize: 9, color: C.textDim, letterSpacing: "0.04em" }}>{t}</span>
            ))}
          </div>
        </div>

        {/* Presets */}
        <div style={{ display: "flex", gap: 6, padding: "0 16px 12px" }}>
          {([0.5, 1, 2, 3] as const).map((v) => {
            const active = Math.abs(zScale - v) < 0.05;
            return (
              <button
                key={v}
                onClick={() => setZScale(v)}
                style={{
                  flex: 1, padding: "5px 0",
                  borderRadius: 8, fontSize: 11, fontWeight: 600,
                  cursor: "pointer",
                  border: active
                    ? `1px solid rgba(56,189,248,0.55)`
                    : `1px solid ${C.border}`,
                  background: active ? C.skyGlow : C.row,
                  color: active ? C.sky : C.textMid,
                  boxShadow: active ? `0 0 8px ${C.skyGlow}` : "none",
                  transition: "all 0.15s ease",
                  letterSpacing: "0.02em",
                }}
              >
                {v === 1 ? "Réel" : `×${v}`}
              </button>
            );
          })}
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════════
          SECTION 2 — Sculpture terrain
      ══════════════════════════════════════════════════════════════ */}
      <Section
        defaultOpen={false}
        icon={<Zap style={{ width: 13, height: 13, color: isSculptMode ? C.amber : C.textDim }} />}
        label="Sculpture terrain"
        accent={C.amber}
        badge={
          modifiedCount > 0 ? (
            <span style={{
              fontSize: 10, fontWeight: 700, fontFamily: "ui-monospace,monospace",
              color: C.amber, background: C.amberGlow,
              border: `1px solid ${C.amberBord}`,
              borderRadius: 6, padding: "2px 7px", marginRight: 4,
            }}>
              {modifiedCount > 99 ? "99+" : modifiedCount} pts
            </span>
          ) : undefined
        }
      >
        <div style={{ padding: "4px 16px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
          {/* Sculpt toggle */}
          <button
            onClick={() => setSculptMode(!isSculptMode)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 12px", borderRadius: 10, cursor: "pointer",
              border: isSculptMode ? `1px solid ${C.amberBord}` : `1px solid ${C.border}`,
              background: isSculptMode ? C.amberGlow : C.row,
              transition: "all 0.18s ease",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: isSculptMode ? C.amber : C.textMid }}>
              {isSculptMode ? "Sculpture active" : "Activer la sculpture"}
            </span>
            {/* Toggle pill */}
            <span style={{
              display: "inline-flex", width: 36, height: 20, borderRadius: 99,
              background: isSculptMode ? C.amber : C.border,
              position: "relative", flexShrink: 0,
              transition: "background 0.2s ease",
              border: `1px solid ${isSculptMode ? C.amber : C.border}`,
            }}>
              <span style={{
                position: "absolute", top: 3,
                left: isSculptMode ? 18 : 3,
                width: 12, height: 12, borderRadius: "50%",
                background: isSculptMode ? "#111827" : C.textDim,
                transition: "left 0.18s ease",
                boxShadow: isSculptMode ? `0 0 4px ${C.amber}` : "none",
              }} />
            </span>
          </button>

          {/* Brush controls */}
          {isSculptMode && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0" }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: C.textDim }}>
                  Pinceau
                </span>
                <button
                  onClick={handleFalloffToggle}
                  style={{
                    fontSize: 9, fontWeight: 600, color: C.textMid,
                    background: C.row, border: `1px solid ${C.border}`,
                    borderRadius: 5, padding: "2px 8px", cursor: "pointer",
                  }}
                >
                  {brush.falloff === "smooth" ? "⊛ Doux" : "△ Linéaire"}
                </button>
              </div>
            </>
          )}
        </div>

        {isSculptMode && (
          <>
            <Stepper
              label="Rayon"
              value={`${brush.radius.toFixed(1)} m`}
              onMinus={() => setBrush({ radius: Math.max(0.5, brush.radius - 0.5) })}
              onPlus={()  => setBrush({ radius: Math.min(20.0, brush.radius + 0.5) })}
            />
            <Stepper
              label="Force"
              value={brush.strength.toFixed(3)}
              onMinus={() => setBrush({ strength: Math.round(Math.max(0.002, brush.strength - 0.005) * 1000) / 1000 })}
              onPlus={()  => setBrush({ strength: Math.round(Math.min(0.15,  brush.strength + 0.005) * 1000) / 1000 })}
            />

            {/* Manual NGF input */}
            {activeVertex !== null && currentElevation !== null && (
              <div style={{ margin: "4px 16px 8px", background: C.row, borderRadius: 10, padding: "8px 12px", border: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: C.textDim }}>
                    Élévation NGF
                  </span>
                  {Math.abs(currentDelta) > 0.001 && (
                    <span style={{ fontSize: 10, fontFamily: "ui-monospace,monospace", fontWeight: 700, color: currentDelta > 0 ? C.green : C.danger }}>
                      {currentDelta > 0 ? "+" : ""}{currentDelta.toFixed(2)} m
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <label style={{ fontSize: 10, color: C.textMid, whiteSpace: "nowrap" }}>NGF (m):</label>
                  <input
                    type="number"
                    step={0.1}
                    value={currentElevation.toFixed(2)}
                    onChange={handleManualElevation}
                    style={{
                      flex: 1, width: 0, padding: "4px 8px", borderRadius: 7,
                      fontSize: 12, fontFamily: "ui-monospace,monospace",
                      fontWeight: 600, background: "#0f1623",
                      border: `1px solid rgba(56,189,248,0.28)`,
                      color: C.sky, outline: "none",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Undo / Reset */}
            <div style={{ display: "flex", gap: 8, padding: "0 16px 10px" }}>
              <button
                onClick={undo}
                disabled={undoStack.length === 0}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  padding: "7px 0", borderRadius: 8, fontSize: 11, fontWeight: 600,
                  cursor: undoStack.length > 0 ? "pointer" : "not-allowed",
                  background: undoStack.length > 0 ? C.row : "transparent",
                  border: `1px solid ${C.border}`,
                  color: undoStack.length > 0 ? C.textMid : C.textDim,
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
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  padding: "7px 0", borderRadius: 8, fontSize: 11, fontWeight: 600,
                  cursor: modifiedCount > 0 ? "pointer" : "not-allowed",
                  background: modifiedCount > 0 ? C.dangerBg : "transparent",
                  border: modifiedCount > 0 ? `1px solid ${C.dangerBord}` : `1px solid ${C.border}`,
                  color: modifiedCount > 0 ? C.danger : C.textDim,
                  transition: "all 0.12s ease",
                }}
              >
                <RotateCcw style={{ width: 12, height: 12 }} />
                Réinit.
              </button>
            </div>
          </>
        )}
      </Section>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Footer */}
      <div style={{
        padding: "10px 16px",
        borderTop: `1px solid ${C.border}`,
        fontSize: 9,
        color: C.textDim,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}>
        IGN RGE Alti® — données réelles
      </div>

      <style>{`
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px; height: 16px;
          border-radius: 50%;
          background: ${C.skyBright};
          border: 2px solid #0f1623;
          box-shadow: 0 0 8px rgba(56,189,248,0.45);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
