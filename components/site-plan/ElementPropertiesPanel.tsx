"use client";

import React, { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Maximize2,
  Layers,
  Home,
  RotateCcw,
  Sliders,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BuildingDetail } from "./BuildingDetailPanel";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ElementPropertiesPanelProps {
  building: BuildingDetail | null;
  onSizeChange: (
    id: string,
    patch: {
      width?: number;
      depth?: number;
      wallHeights?: BuildingDetail["wallHeights"];
      altitudeM?: number;
    }
  ) => void;
  onRoofChange: (id: string, roof: Partial<BuildingDetail["roof"]>) => void;
  /** Whether the element is a non-building (pool, garden, parking, etc.) */
  className?: string;
}

const ROOF_TYPES = [
  { id: "flat", label: "Flat", icon: "▬" },
  { id: "gable", label: "Gable", icon: "∧" },
  { id: "hip", label: "Hip", icon: "⌂" },
  { id: "shed", label: "Shed", icon: "⁄" },
] as const;

// ─── Slider Row ──────────────────────────────────────────────────────────────

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  color = "blue",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  color?: "blue" | "amber" | "emerald" | "rose";
  onChange: (v: number) => void;
}) {
  const accent = {
    blue: "accent-blue-500",
    amber: "accent-amber-500",
    emerald: "accent-emerald-500",
    rose: "accent-rose-500",
  }[color];
  const textColor = {
    blue: "text-blue-400",
    amber: "text-amber-400",
    emerald: "text-emerald-400",
    rose: "text-rose-400",
  }[color];

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-[11px] text-slate-400 font-medium">{label}</label>
        <span className={cn("text-[13px] font-mono font-bold tabular-nums", textColor)}>
          {value.toFixed(unit === "°" ? 0 : 1)}
          {unit ?? " m"}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn("w-full h-1.5 rounded-full cursor-pointer", accent)}
      />
    </div>
  );
}

// ─── Section Header ──────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  label,
  open,
  onToggle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center justify-between w-full group"
    >
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-blue-400" />
        <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
          {label}
        </span>
      </div>
      {open ? (
        <ChevronUp className="w-3 h-3 text-slate-500 group-hover:text-slate-300 transition-colors" />
      ) : (
        <ChevronDown className="w-3 h-3 text-slate-500 group-hover:text-slate-300 transition-colors" />
      )}
    </button>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ElementPropertiesPanel({
  building,
  onSizeChange,
  onRoofChange,
  className,
}: ElementPropertiesPanelProps) {
  const [sizeOpen, setSizeOpen] = useState(true);
  const [wallOpen, setWallOpen] = useState(true);
  const [roofOpen, setRoofOpen] = useState(true);

  if (!building) return null;

  const isFlatLandscape =
    building.name === "garden" ||
    building.name === "pool" ||
    building.name === "parking" ||
    building.name === "terrace";

  const isPool = building.name === "pool";
  const isGarden = building.name === "garden";
  const hasWalls = !isFlatLandscape;
  const hasRoof =
    !isPool && !isGarden && building.name !== "parking" && building.name !== "terrace";

  const totalH =
    (building.wallHeights.ground || 0) +
    (building.wallHeights.first || 0) +
    (building.wallHeights.second || 0);

  return (
    <div
      className={cn(
        "absolute bottom-20 left-4 z-30 w-72 rounded-2xl overflow-hidden shadow-2xl border border-white/10",
        "bg-slate-900/95 backdrop-blur-xl",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/10 bg-gradient-to-r from-blue-900/40 to-slate-800/40">
        <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
          <Sliders className="w-3.5 h-3.5 text-blue-400" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-white truncate">{building.name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</p>
          <p className="text-[10px] text-slate-400">
            {building.width} × {building.depth} m
            {totalH > 0 ? ` · H ${totalH.toFixed(1)} m` : ""}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <div className="px-1.5 py-0.5 rounded bg-blue-500/20 border border-blue-500/30">
            <span className="text-[9px] font-bold text-blue-400 uppercase">LIVE</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto">

        {/* SIZE SECTION */}
        <div className="space-y-3">
          <SectionHeader
            icon={Maximize2}
            label="Footprint"
            open={sizeOpen}
            onToggle={() => setSizeOpen(!sizeOpen)}
          />
          {sizeOpen && (
            <div className="space-y-3 pl-1">
              <SliderRow
                label="Width"
                value={building.width}
                min={2}
                max={30}
                step={0.5}
                onChange={(v) => onSizeChange(building.id, { width: v })}
              />
              <SliderRow
                label="Depth"
                value={building.depth}
                min={2}
                max={25}
                step={0.5}
                color="emerald"
                onChange={(v) => onSizeChange(building.id, { depth: v })}
              />
            </div>
          )}
        </div>

        {/* WALL HEIGHTS (only for buildings) */}
        {hasWalls && (
          <div className="space-y-3 border-t border-white/8 pt-3">
            <SectionHeader
              icon={Home}
              label="Wall Heights"
              open={wallOpen}
              onToggle={() => setWallOpen(!wallOpen)}
            />
            {wallOpen && (
              <div className="space-y-3 pl-1">
                {building.wallHeights.ground > 0 && (
                  <SliderRow
                    label="Ground floor"
                    value={building.wallHeights.ground}
                    min={2}
                    max={6}
                    step={0.1}
                    color="amber"
                    onChange={(v) =>
                      onSizeChange(building.id, {
                        wallHeights: { ...building.wallHeights, ground: v },
                      })
                    }
                  />
                )}
                {building.wallHeights.first > 0 && (
                  <SliderRow
                    label="First floor"
                    value={building.wallHeights.first}
                    min={0}
                    max={5}
                    step={0.1}
                    color="amber"
                    onChange={(v) =>
                      onSizeChange(building.id, {
                        wallHeights: { ...building.wallHeights, first: v },
                      })
                    }
                  />
                )}
                {building.wallHeights.second > 0 && (
                  <SliderRow
                    label="Second floor"
                    value={building.wallHeights.second}
                    min={0}
                    max={4}
                    step={0.1}
                    color="amber"
                    onChange={(v) =>
                      onSizeChange(building.id, {
                        wallHeights: { ...building.wallHeights, second: v },
                      })
                    }
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* ROOF (only for buildings) */}
        {hasRoof && (
          <div className="space-y-3 border-t border-white/8 pt-3">
            <SectionHeader
              icon={Layers}
              label="Roof"
              open={roofOpen}
              onToggle={() => setRoofOpen(!roofOpen)}
            />
            {roofOpen && (
              <div className="space-y-3 pl-1">
                {/* Roof type picker */}
                <div className="grid grid-cols-4 gap-1.5">
                  {ROOF_TYPES.map((rt) => (
                    <button
                      key={rt.id}
                      type="button"
                      onClick={() =>
                        onRoofChange(building.id, {
                          type: rt.id as BuildingDetail["roof"]["type"],
                          pitch: rt.id === "flat" ? 0 : Math.max(15, building.roof.pitch || 35),
                          overhang: rt.id === "flat" ? 0 : building.roof.overhang || 0.4,
                        })
                      }
                      className={cn(
                        "flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg border text-center transition-all",
                        building.roof.type === rt.id
                          ? "border-blue-500 bg-blue-500/25 text-white"
                          : "border-white/10 bg-slate-800/60 text-slate-300 hover:border-white/20"
                      )}
                    >
                      <span className="text-lg font-mono leading-none">{rt.icon}</span>
                      <span className="text-[9px]">{rt.label}</span>
                    </button>
                  ))}
                </div>
                {/* Pitch slider (non-flat) */}
                {building.roof.type !== "flat" && (
                  <SliderRow
                    label="Pitch"
                    value={building.roof.pitch || 35}
                    min={15}
                    max={55}
                    step={1}
                    unit="°"
                    color="rose"
                    onChange={(v) => onRoofChange(building.id, { pitch: v })}
                  />
                )}
                {/* Overhang slider (non-flat) */}
                {building.roof.type !== "flat" && (
                  <SliderRow
                    label="Overhang"
                    value={building.roof.overhang || 0.4}
                    min={0}
                    max={1.5}
                    step={0.05}
                    color="rose"
                    onChange={(v) => onRoofChange(building.id, { overhang: v })}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Hint */}
        <div className="border-t border-white/8 pt-3">
          <p className="text-[10px] text-slate-500 flex items-center gap-1.5">
            <RotateCcw className="w-3 h-3 flex-shrink-0" />
            Changes sync instantly to 3D view
          </p>
        </div>
      </div>
    </div>
  );
}
