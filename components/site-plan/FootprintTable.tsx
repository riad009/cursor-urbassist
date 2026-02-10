"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export interface FootprintData {
  existingFootprint: number; // m²
  projectedFootprint: number; // m²
  maxFootprint: number; // m² (from PLU CES)
  roofOverhang: number; // m² additional from overhangs
  includeOverhangInFootprint: boolean; // PLU rule
  totalSiteArea: number; // m² parcel area
  greenSpaceArea: number; // m²
  requiredGreenPct: number; // % from PLU
  maxCoverageRatio: number; // CES from PLU
  surfacesByType: Record<string, number>;
}

interface FootprintTableProps {
  data: FootprintData;
  className?: string;
}

export function FootprintTable({ data, className }: FootprintTableProps) {
  const effectiveFootprint = data.includeOverhangInFootprint
    ? data.projectedFootprint + data.roofOverhang
    : data.projectedFootprint;

  const totalFootprint = data.existingFootprint + effectiveFootprint;
  const remaining = Math.max(0, data.maxFootprint - totalFootprint);
  const coverageRatio =
    data.totalSiteArea > 0 ? totalFootprint / data.totalSiteArea : 0;
  const greenPct =
    data.totalSiteArea > 0
      ? (data.greenSpaceArea / data.totalSiteArea) * 100
      : 0;

  const isFootprintCompliant = totalFootprint <= data.maxFootprint;
  const isGreenCompliant = greenPct >= data.requiredGreenPct;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Footprint Summary */}
      <div className="p-3 rounded-xl bg-slate-800/50 border border-white/5">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
            Footprint (m²)
          </h4>
          {isFootprintCompliant ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-400" />
          )}
        </div>
        <div className="space-y-1.5 text-xs">
          <Row label="Existing buildings" value={data.existingFootprint} />
          <Row label="Projected buildings" value={effectiveFootprint} accent="amber" />
          {data.includeOverhangInFootprint && data.roofOverhang > 0 && (
            <Row
              label="  incl. roof overhang"
              value={data.roofOverhang}
              accent="orange"
              note="PLU counts overhang"
            />
          )}
          <div className="border-t border-white/10 pt-1.5">
            <Row
              label="Total footprint"
              value={totalFootprint}
              accent={isFootprintCompliant ? "emerald" : "red"}
              bold
            />
          </div>
          <Row label="Max allowed (CES)" value={data.maxFootprint} />
          <Row
            label="Remaining"
            value={remaining}
            accent={remaining > 0 ? "emerald" : "red"}
          />
          <div className="border-t border-white/10 pt-1.5">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Coverage ratio (CES)</span>
              <span
                className={cn(
                  "font-mono font-semibold",
                  coverageRatio <= data.maxCoverageRatio
                    ? "text-emerald-400"
                    : "text-red-400"
                )}
              >
                {(coverageRatio * 100).toFixed(1)}% / {(data.maxCoverageRatio * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Surface Breakdown */}
      <div className="p-3 rounded-xl bg-slate-800/50 border border-white/5">
        <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-2">
          Surface Breakdown (m²)
        </h4>
        <div className="space-y-1.5 text-xs">
          <Row
            label="Total site area"
            value={data.totalSiteArea}
            bold
          />
          {Object.entries(data.surfacesByType).map(([type, area]) => (
            <Row
              key={type}
              label={type.charAt(0).toUpperCase() + type.slice(1)}
              value={area}
              color={SURFACE_COLORS[type]}
            />
          ))}
        </div>
      </div>

      {/* Green Space */}
      <div className="p-3 rounded-xl bg-slate-800/50 border border-white/5">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
            Green Space
          </h4>
          {isGreenCompliant ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          )}
        </div>
        <div className="space-y-1.5 text-xs">
          <Row label="Green space area" value={data.greenSpaceArea} accent="emerald" />
          <Row
            label="Available (non-built)"
            value={Math.max(0, data.totalSiteArea - totalFootprint)}
          />
          <div className="border-t border-white/10 pt-1.5 flex justify-between items-center">
            <span className="text-slate-400">
              Green % (min. {data.requiredGreenPct}%)
            </span>
            <span
              className={cn(
                "font-mono font-semibold",
                isGreenCompliant ? "text-emerald-400" : "text-amber-400"
              )}
            >
              {greenPct.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-2 h-2 rounded-full bg-slate-700 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              isGreenCompliant ? "bg-emerald-500" : "bg-amber-500"
            )}
            style={{ width: `${Math.min(100, greenPct)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// Helper row component
function Row({
  label,
  value,
  accent,
  bold,
  note,
  color,
}: {
  label: string;
  value: number;
  accent?: string;
  bold?: boolean;
  note?: string;
  color?: string;
}) {
  const valueColor = accent
    ? `text-${accent}-400`
    : color
      ? ""
      : "text-white";

  return (
    <div className="flex justify-between items-center">
      <span className={cn("text-slate-400", bold && "text-white font-medium")}>
        {label}
        {note && (
          <span className="ml-1 text-[10px] text-orange-400">({note})</span>
        )}
      </span>
      <span
        className={cn("font-mono", bold && "font-semibold", valueColor)}
        style={color ? { color } : undefined}
      >
        {value.toFixed(1)}
      </span>
    </div>
  );
}

const SURFACE_COLORS: Record<string, string> = {
  green: "#22c55e",
  gravel: "#a8a29e",
  concrete: "#78716c",
  asphalt: "#44403c",
  building: "#3b82f6",
};
