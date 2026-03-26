"use client";

/**
 * PlacementGuideOverlay.tsx — Guided Placement Reticle + French Tooltip
 *
 * Architecture:
 *   - Absolute-positioned OVER the Fabric canvas host div
 *   - Reads ONLY usePlacementSlice() → zero impact on canvas/toolbar renders
 *   - React.memo'd — only re-renders when placement phase or cursor changes
 *   - pointer-events: none — never intercepts Fabric.js mouse events
 *
 * Visual design:
 *   - Animated pulsing SVG crosshair reticle at cursor position
 *   - Glassmorphism French tooltip offset below-right of cursor
 *   - Renders NOTHING when phase !== 'guided' (zero DOM cost when idle)
 */

import React, { memo } from "react";
import { usePlacementSlice } from "@/store/useUrbAssistProjectStore";
import { getAssetDescriptor } from "@/lib/assets-library";

// ─── Reticle SVG (Crosshair with animated ring) ─────────────────────────────

function ReticleSVG() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: "visible" }}
    >
      {/* Outer pulsing ring */}
      <circle
        cx="24"
        cy="24"
        r="18"
        stroke="#2563eb"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        fill="none"
        opacity="0.5"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 24 24"
          to="360 24 24"
          dur="6s"
          repeatCount="indefinite"
        />
      </circle>

      {/* Inner solid ring */}
      <circle
        cx="24"
        cy="24"
        r="10"
        stroke="#3b82f6"
        strokeWidth="2"
        fill="rgba(59,130,246,0.08)"
      >
        <animate
          attributeName="r"
          values="9;11;9"
          dur="2s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="stroke-opacity"
          values="1;0.5;1"
          dur="2s"
          repeatCount="indefinite"
        />
      </circle>

      {/* Crosshair lines */}
      <line x1="24" y1="4" x2="24" y2="16" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="24" y1="32" x2="24" y2="44" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="4" y1="24" x2="16" y2="24" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="32" y1="24" x2="44" y2="24" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" />

      {/* Center dot */}
      <circle cx="24" cy="24" r="2.5" fill="#3b82f6" />
    </svg>
  );
}

// ─── Main Overlay ───────────────────────────────────────────────────────────

const PlacementGuideOverlay = memo(function PlacementGuideOverlay() {
  const { placementMode, cursorGuidePoint } = usePlacementSlice();

  // Only render when in guided phase — zero DOM cost otherwise
  if (placementMode.phase !== "guided" || !placementMode.tool) return null;

  const descriptor = getAssetDescriptor(placementMode.tool);
  const { x, y } = cursorGuidePoint;

  // Don't show until the mouse has moved at least once
  if (x === 0 && y === 0) return null;

  return (
    <div
      className="absolute inset-0 z-30"
      style={{ pointerEvents: "none", overflow: "hidden" }}
    >
      {/* ── Reticle at cursor position ── */}
      <div
        className="absolute"
        style={{
          left: x - 24,
          top: y - 24,
          willChange: "transform",
          transition: "left 16ms linear, top 16ms linear",
        }}
      >
        <ReticleSVG />
      </div>

      {/* ── Tooltip below-right of cursor ── */}
      <div
        className="absolute flex items-start gap-2"
        style={{
          left: x + 28,
          top: y + 12,
          willChange: "transform",
          transition: "left 16ms linear, top 16ms linear",
          maxWidth: 260,
        }}
      >
        <div
          className="px-3.5 py-2.5 rounded-xl text-[12px] leading-[1.4] font-medium shadow-xl"
          style={{
            background: "rgba(15, 23, 42, 0.88)",
            backdropFilter: "blur(16px) saturate(180%)",
            WebkitBackdropFilter: "blur(16px) saturate(180%)",
            border: "1px solid rgba(148, 163, 184, 0.18)",
            color: "#e2e8f0",
          }}
        >
          {/* Icon + Label header */}
          <div
            className="flex items-center gap-1.5 mb-1"
            style={{ color: "#60a5fa" }}
          >
            <span className="text-[13px] font-semibold">{descriptor.label}</span>
          </div>

          {/* Instruction text */}
          <span style={{ color: "#94a3b8" }}>
            Cliquez sur la carte pour positionner votre projet
          </span>

          {/* Escape hint */}
          <div className="mt-1.5 pt-1.5" style={{ borderTop: "1px solid rgba(148,163,184,0.15)" }}>
            <span className="text-[10px]" style={{ color: "#64748b" }}>
              Appuyez sur <kbd className="px-1 py-0.5 rounded bg-slate-700/60 text-[9px] font-mono">Échap</kbd> pour annuler
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default PlacementGuideOverlay;
