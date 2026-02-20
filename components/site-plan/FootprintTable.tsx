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

const SURFACE_CLASSIFICATION: Record<string, "permeable" | "semi-permeable" | "impermeable"> = {
  natural_green: "permeable",
  gravel: "semi-permeable",
  evergreen_system: "semi-permeable",
  pavers_pedestals: "semi-permeable",
  drainage_pavement: "semi-permeable",
  vegetated_flat_roof: "semi-permeable",
  asphalt: "impermeable",
  bitumen: "impermeable",
  concrete: "impermeable",
  standard_roof: "impermeable",
  building: "impermeable",
  // legacy
  green: "permeable",
};

const SURFACE_COLORS: Record<string, string> = {
  natural_green: "#22c55e",
  gravel: "#a8a29e",
  evergreen_system: "#65a30d",
  pavers_pedestals: "#d4d4d4",
  drainage_pavement: "#94a3b8",
  vegetated_flat_roof: "#4ade80",
  asphalt: "#44403c",
  bitumen: "#292524",
  concrete: "#78716c",
  standard_roof: "#b45309",
  building: "#3b82f6",
  // legacy
  green: "#22c55e",
};

const SURFACE_LABELS: Record<string, string> = {
  natural_green: "Natural Green",
  gravel: "Gravel",
  evergreen_system: "Evergreen System",
  pavers_pedestals: "Pavers / Pedestals",
  drainage_pavement: "Drainage Paving",
  vegetated_flat_roof: "Vegetated Roof",
  asphalt: "Asphalt",
  bitumen: "Bitumen",
  concrete: "Concrete",
  standard_roof: "Standard Roof",
  building: "Building",
  green: "Green",
};

const TIER_COLORS = {
  permeable: "#22c55e",
  "semi-permeable": "#f59e0b",
  impermeable: "#ef4444",
};

const TIER_LABELS = {
  permeable: "Permeable",
  "semi-permeable": "Semi-Permeable",
  impermeable: "Impermeable",
};

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

  // 3-tier surface breakdown
  const tiers = { permeable: 0, "semi-permeable": 0, impermeable: 0 } as Record<string, number>;
  const tierSurfaces = {
    permeable: [] as { type: string; area: number }[],
    "semi-permeable": [] as { type: string; area: number }[],
    impermeable: [] as { type: string; area: number }[],
  } as Record<string, { type: string; area: number }[]>;

  Object.entries(data.surfacesByType).forEach(([type, area]) => {
    if (area <= 0) return;
    const tier = SURFACE_CLASSIFICATION[type] || "impermeable";
    tiers[tier] += area;
    tierSurfaces[tier].push({ type, area });
  });

  const totalSurfaces = tiers.permeable + tiers["semi-permeable"] + tiers.impermeable;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Footprint Summary */}
      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
            Footprint (m²)
          </h4>
          {isFootprintCompliant ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-500" />
          )}
        </div>
        <div className="space-y-1.5 text-xs">
          <Row label="Existing buildings" value={data.existingFootprint} />
          <Row label="Projected buildings" value={effectiveFootprint} accent="amber" />
          {data.includeOverhangInFootprint && data.roofOverhang > 0 && (
            <Row label="  incl. roof overhang" value={data.roofOverhang} accent="orange" note="PLU counts overhang" />
          )}
          <div className="border-t border-slate-200 pt-1.5">
            <Row label="Total footprint" value={totalFootprint} accent={isFootprintCompliant ? "emerald" : "red"} bold />
          </div>
          <Row label="Max allowed (CES)" value={data.maxFootprint} />
          <Row label="Remaining" value={remaining} accent={remaining > 0 ? "emerald" : "red"} />
          <div className="border-t border-slate-200 pt-1.5">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Coverage ratio (CES)</span>
              <span className={cn("font-mono font-semibold", coverageRatio <= data.maxCoverageRatio ? "text-emerald-600" : "text-red-500")}>
                {(coverageRatio * 100).toFixed(1)}% / {(data.maxCoverageRatio * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3-Tier Surface Breakdown */}
      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
        <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-2">
          Surface Classification
        </h4>

        {/* Stacked bar */}
        {totalSurfaces > 0 && (
          <div className="h-3 rounded-full bg-slate-200 overflow-hidden flex mb-2">
            {(["permeable", "semi-permeable", "impermeable"] as const).map((tier) => {
              const pct = totalSurfaces > 0 ? (tiers[tier] / totalSurfaces) * 100 : 0;
              if (pct <= 0) return null;
              return (
                <div
                  key={tier}
                  className="h-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: TIER_COLORS[tier] }}
                  title={`${TIER_LABELS[tier]}: ${pct.toFixed(1)}%`}
                />
              );
            })}
          </div>
        )}

        <div className="space-y-2">
          {(["permeable", "semi-permeable", "impermeable"] as const).map((tier) => (
            <div key={tier} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TIER_COLORS[tier] }} />
                  <span className="text-xs font-medium text-slate-700">{TIER_LABELS[tier]}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-600">{tiers[tier].toFixed(1)} m²</span>
                  {data.totalSiteArea > 0 && (
                    <span className="text-[10px] font-mono text-slate-400">
                      ({((tiers[tier] / data.totalSiteArea) * 100).toFixed(1)}%)
                    </span>
                  )}
                </div>
              </div>
              {tierSurfaces[tier].length > 0 && (
                <div className="pl-4 space-y-0.5">
                  {tierSurfaces[tier].map(({ type, area }) => (
                    <Row
                      key={type}
                      label={SURFACE_LABELS[type] || type.charAt(0).toUpperCase() + type.slice(1)}
                      value={area}
                      color={SURFACE_COLORS[type]}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Green Space */}
      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
            Green Space
          </h4>
          {isGreenCompliant ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          )}
        </div>
        <div className="space-y-1.5 text-xs">
          <Row label="Green space area" value={data.greenSpaceArea} accent="emerald" />
          <Row label="Available (non-built)" value={Math.max(0, data.totalSiteArea - totalFootprint)} />
          <div className="border-t border-slate-200 pt-1.5 flex justify-between items-center">
            <span className="text-slate-500">
              Green % (min. {data.requiredGreenPct}%)
            </span>
            <span className={cn("font-mono font-semibold", isGreenCompliant ? "text-emerald-600" : "text-amber-500")}>
              {greenPct.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", isGreenCompliant ? "bg-emerald-500" : "bg-amber-500")}
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
  const accentColors: Record<string, string> = {
    amber: "text-amber-600", orange: "text-orange-500",
    emerald: "text-emerald-600", red: "text-red-500",
  };
  const valueColor = accent ? accentColors[accent] || "text-slate-900" : color ? "" : "text-slate-900";

  return (
    <div className="flex justify-between items-center">
      <span className={cn("text-slate-500", bold && "text-slate-900 font-medium")}>
        {label}
        {note && (
          <span className="ml-1 text-[10px] text-orange-500">({note})</span>
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
