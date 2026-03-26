"use client";

/**
 * ProjectToolbar — Render-Isolated Right-Side Panel (Mandate 2)
 *
 * React.memo'd. Reads ONLY useActiveToolSlice() + useSummarySlice() from Zustand.
 * Clicking a tool button → Zustand state update → ONLY this component re-renders.
 * The canvas wrapper (SitePlanEditorV2) stays completely frozen.
 *
 * Contains:
 *  - OUTILS: 2-column tool grid (Sélection, Bâtiment, Parking, etc.)
 *  - TABLEAU RÉCAPITULATIF: Live summary from compliance report
 */

import React, { memo } from "react";
import {
  MousePointer2,
  Home,
  Car,
  Waves,
  Pentagon,
  Zap,
  TreePine,
  Shrub,
} from "lucide-react";

import {
  useActiveToolSlice,
  useSummarySlice,
  type EditorTool,
} from "@/store/useUrbAssistProjectStore";

// ─── Tool Definitions ─────────────────────────────────────────────────────────

const TOOLS: { id: EditorTool; label: string; Icon: React.ElementType }[] = [
  { id: "select",  label: "Sélection",  Icon: MousePointer2 },
  { id: "house",   label: "Maison",     Icon: Home },
  { id: "garage",  label: "Garage",     Icon: Car },
  { id: "pool",    label: "Piscine",    Icon: Waves },
  { id: "parking", label: "Parking",    Icon: Car },
  { id: "garden",  label: "Jardin",     Icon: TreePine },
  { id: "terrace", label: "Terrasse",   Icon: Pentagon },
  { id: "access",  label: "Accès",      Icon: Zap },
  { id: "vrd",     label: "Réseau",     Icon: Zap },
  { id: "freeform",label: "Forme libre",Icon: Pentagon },
];

// ─── Tool Grid ──────────────────────────────────────────────────────────────

const ToolGrid = memo(function ToolGrid() {
  const { activeTool, setActiveTool } = useActiveToolSlice();

  return (
    <div className="grid grid-cols-2 gap-2">
      {TOOLS.map(({ id, label, Icon }) => {
        const isActive = activeTool === id;
        return (
          <button
            key={id}
            onClick={() => setActiveTool(id)}
            className={`
              flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl
              transition-all duration-150 text-xs font-medium
              ${isActive
                ? "bg-blue-50 text-blue-700 ring-2 ring-blue-200 shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-slate-200"
              }
            `}
          >
            {React.createElement(Icon, { size: 20, strokeWidth: isActive ? 2.2 : 1.5 })}
            {label}
          </button>
        );
      })}
    </div>
  );
});

// ─── Summary Table ──────────────────────────────────────────────────────────

const SummaryTable = memo(function SummaryTable() {
  const { complianceReport, objectCount } = useSummarySlice();

  const parcelArea = complianceReport?.parcelAreaM2 ?? 0;
  const buildingArea = complianceReport?.totalBuildingAreaM2 ?? 0;
  const coveragePct = complianceReport?.coverageRatio
    ? (complianceReport.coverageRatio * 100).toFixed(1)
    : "0.0";
  const isOver = complianceReport?.coverageExceeded ?? false;

  return (
    <div className="space-y-3">
      {/* Parcel area */}
      <div className="border border-slate-200 rounded-xl p-3 bg-white">
        <div className="text-[11px] text-slate-500 font-medium">Surface de la parcelle</div>
        <div className="text-2xl font-bold text-slate-900 mt-0.5">
          {parcelArea > 0 ? parcelArea.toFixed(1) : "—"} m²
        </div>
        <div className="text-[11px] text-slate-400 mt-1">
          Bâtiments existants : {objectCount} (rendus: {objectCount})
        </div>
      </div>

      {/* Coverage breakdown */}
      <div className="border border-slate-200 rounded-xl p-3 bg-white space-y-2">
        <div className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
          Espaces verts et espaces libres
        </div>
        {buildingArea > 0 && (
          <div className="flex justify-between text-xs text-slate-600">
            <span>Building (imp.)</span>
            <span className="font-mono">{buildingArea.toFixed(1)} m²</span>
          </div>
        )}
        <div className="border-t border-slate-100 pt-2 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-600">CES (emprise)</span>
            <span className={`font-bold font-mono ${isOver ? "text-red-600" : "text-emerald-600"}`}>
              {coveragePct}%
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-600">Espaces verts</span>
            <span className="font-bold font-mono text-emerald-600">
              {parcelArea > 0 ? ((1 - (complianceReport?.coverageRatio ?? 0)) * 100).toFixed(1) : "0.0"}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

// ─── Main Export ─────────────────────────────────────────────────────────────

const ProjectToolbar = memo(function ProjectToolbar() {
  return (
    <div className="w-72 bg-slate-50 border-l border-slate-200 overflow-y-auto shrink-0 flex flex-col">
      {/* Tool Grid */}
      <div className="p-4 border-b border-slate-200">
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3">
          Outils
        </h3>
        <ToolGrid />
      </div>

      {/* Summary Table */}
      <div className="p-4 flex-1">
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3">
          Tableau récapitulatif
        </h3>
        <SummaryTable />
      </div>
    </div>
  );
});

export default ProjectToolbar;
