/**
 * VrdToolbar.tsx — VRD & Site Access Drawing Toolbar
 *
 * Enterprise-grade floating panel for selecting VRD network types and
 * access/driveway drawing. Shows visual indicators matching each network's
 * line style (dashes, colors).
 *
 * When a tool is active, the button gets an "active" ring + darker bg.
 * Clicking the same tool again cancels drawing.
 */

"use client";

import React, { useCallback, useState, useEffect } from "react";
import {
  Droplets,
  Zap,
  Wifi,
  Flame,
  CloudRain,
  CircleDot,
  Car,
  X,
} from "lucide-react";
import {
  VRD_TYPE_CONFIGS,
  type VrdNetworkId,
  type UseVrdDrawingReturn,
} from "@/hooks/useVrdDrawing";

// ─── Icon map by VRD type ───────────────────────────────────────────────────

const VRD_ICONS: Record<VrdNetworkId, React.ReactNode> = {
  water: <Droplets className="w-3.5 h-3.5" />,
  electricity: <Zap className="w-3.5 h-3.5" />,
  wastewater: <CircleDot className="w-3.5 h-3.5" />,
  stormwater: <CloudRain className="w-3.5 h-3.5" />,
  telecom: <Wifi className="w-3.5 h-3.5" />,
  gas: <Flame className="w-3.5 h-3.5" />,
  access: <Car className="w-3.5 h-3.5" />,
};

// ─── Line style SVG preview ─────────────────────────────────────────────────

function LinePreview({
  color,
  dash,
  isPolygon,
}: {
  color: string;
  dash: number[] | null;
  isPolygon: boolean;
}) {
  if (isPolygon) {
    return (
      <svg width="28" height="12" viewBox="0 0 28 12" className="shrink-0">
        <rect
          x="1"
          y="1"
          width="26"
          height="10"
          rx="2"
          fill={color + "40"}
          stroke={color}
          strokeWidth="1.5"
        />
      </svg>
    );
  }

  return (
    <svg width="28" height="12" viewBox="0 0 28 12" className="shrink-0">
      <line
        x1="2"
        y1="6"
        x2="26"
        y2="6"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={dash ? dash.join(" ") : "none"}
      />
    </svg>
  );
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface VrdToolbarProps {
  /** The hook return from useVrdDrawing */
  vrdDrawing: UseVrdDrawingReturn;
  /** Optional CSS class for positioning */
  className?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function VrdToolbar({ vrdDrawing, className = "" }: VrdToolbarProps) {
  const [activeTypeId, setActiveTypeId] = useState<VrdNetworkId | null>(null);

  // Sync with hook's internal state
  useEffect(() => {
    const interval = setInterval(() => {
      const hookType = vrdDrawing.getActiveType();
      if (hookType !== activeTypeId) {
        setActiveTypeId(hookType);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [vrdDrawing, activeTypeId]);

  const handleSelect = useCallback(
    (typeId: VrdNetworkId) => {
      if (activeTypeId === typeId) {
        // Already active — cancel
        vrdDrawing.cancelDrawing();
        setActiveTypeId(null);
      } else {
        vrdDrawing.startDrawing(typeId);
        setActiveTypeId(typeId);
      }
    },
    [activeTypeId, vrdDrawing]
  );

  const handleCancel = useCallback(() => {
    vrdDrawing.cancelDrawing();
    setActiveTypeId(null);
  }, [vrdDrawing]);

  // Separate networks from access
  const networkTypes = VRD_TYPE_CONFIGS.filter((c) => !c.isPolygon);
  const accessTypes = VRD_TYPE_CONFIGS.filter((c) => c.isPolygon);

  return (
    <div
      className={`
        flex flex-col gap-1 p-2.5 rounded-xl
        bg-slate-900/90 backdrop-blur-md
        border border-slate-700/40
        shadow-xl
        ${className}
      `}
      style={{ width: 210 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          VRD & Access
        </span>
        {activeTypeId && (
          <button
            onClick={handleCancel}
            className="p-0.5 rounded hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 transition-colors"
            title="Cancel drawing (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Network Lines */}
      <div className="space-y-0.5">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 pl-1">
          Networks
        </span>
        {networkTypes.map((config) => {
          const isActive = activeTypeId === config.id;
          return (
            <button
              key={config.id}
              onClick={() => handleSelect(config.id)}
              className={`
                w-full flex items-center gap-2 px-2 py-1.5 rounded-lg
                text-[11px] font-medium transition-all duration-150
                ${
                  isActive
                    ? "bg-slate-700/80 text-white ring-2 shadow-md"
                    : "bg-transparent text-slate-300 hover:bg-slate-800/60 hover:text-slate-100"
                }
              `}
              style={{
                boxShadow: isActive
                  ? `0 0 0 2px ${config.color}80`
                  : undefined,
              }}
            >
              <span style={{ color: config.color }}>{VRD_ICONS[config.id]}</span>
              <LinePreview
                color={config.color}
                dash={config.dash}
                isPolygon={false}
              />
              <span className="flex-1 text-left truncate">{config.label}</span>
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="h-px bg-slate-700/40 my-1" />

      {/* Access / Driveways */}
      <div className="space-y-0.5">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 pl-1">
          Access
        </span>
        {accessTypes.map((config) => {
          const isActive = activeTypeId === config.id;
          return (
            <button
              key={config.id}
              onClick={() => handleSelect(config.id)}
              className={`
                w-full flex items-center gap-2 px-2 py-1.5 rounded-lg
                text-[11px] font-medium transition-all duration-150
                ${
                  isActive
                    ? "bg-slate-700/80 text-white ring-2 shadow-md"
                    : "bg-transparent text-slate-300 hover:bg-slate-800/60 hover:text-slate-100"
                }
              `}
              style={{
                boxShadow: isActive
                  ? `0 0 0 2px ${config.color}80`
                  : undefined,
              }}
            >
              <span style={{ color: config.color }}>{VRD_ICONS[config.id]}</span>
              <LinePreview
                color={config.color}
                dash={config.dash}
                isPolygon={true}
              />
              <span className="flex-1 text-left truncate">{config.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active drawing hint */}
      {activeTypeId && (
        <div className="mt-1 px-2 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20">
          <p className="text-[10px] text-amber-300/90 leading-snug">
            <strong>Click</strong> to add vertices.{" "}
            {VRD_TYPE_CONFIGS.find((c) => c.id === activeTypeId)?.isPolygon
              ? "Close the area"
              : "Draw the route"}{" "}
            with <strong>Double-click</strong> or <strong>Enter</strong>.
          </p>
          <p className="text-[9px] text-amber-300/60 mt-0.5">
            Press <strong>Esc</strong> to cancel.
          </p>
        </div>
      )}
    </div>
  );
}
