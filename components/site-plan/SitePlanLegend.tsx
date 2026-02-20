"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";

interface LegendItem {
    id: string;
    label: string;
    color: string;
    style?: "solid" | "dashed" | "dotted";
    category: string;
}

const SURFACE_ITEMS: LegendItem[] = [
    // Permeable
    { id: "natural_green", label: "Natural Green (Permeable)", color: "#22c55e", category: "Permeable" },
    // Semi-permeable
    { id: "gravel", label: "Gravel", color: "#a8a29e", category: "Semi-Permeable" },
    { id: "evergreen_system", label: "Evergreen System", color: "#65a30d", category: "Semi-Permeable" },
    { id: "pavers_pedestals", label: "Pavers / Pedestals", color: "#d4d4d4", category: "Semi-Permeable" },
    { id: "drainage_pavement", label: "Drainage Paving", color: "#94a3b8", category: "Semi-Permeable" },
    { id: "vegetated_flat_roof", label: "Vegetated Roof", color: "#4ade80", category: "Semi-Permeable" },
    // Impermeable
    { id: "asphalt", label: "Asphalt", color: "#44403c", category: "Impermeable" },
    { id: "bitumen", label: "Bitumen", color: "#292524", category: "Impermeable" },
    { id: "concrete", label: "Concrete", color: "#78716c", category: "Impermeable" },
    { id: "standard_roof", label: "Standard Roof", color: "#b45309", category: "Impermeable" },
    { id: "building", label: "Building Footprint", color: "#3b82f6", category: "Impermeable" },
];

const VRD_ITEMS: LegendItem[] = [
    { id: "electricity", label: "Electricity", color: "#fbbf24", style: "dashed", category: "VRD" },
    { id: "water", label: "Drinking Water", color: "#3b82f6", style: "dashed", category: "VRD" },
    { id: "wastewater", label: "Wastewater", color: "#78716c", style: "dashed", category: "VRD" },
    { id: "stormwater", label: "Stormwater", color: "#22d3ee", style: "dashed", category: "VRD" },
    { id: "telecom", label: "Telecom", color: "#a855f7", style: "dashed", category: "VRD" },
    { id: "gas", label: "Gas", color: "#ef4444", style: "dashed", category: "VRD" },
];

const MARKER_ITEMS: LegendItem[] = [
    { id: "elevation", label: "Elevation Point", color: "#0ea5e9", category: "Markers" },
    { id: "section", label: "Section Line", color: "#ec4899", style: "dashed", category: "Markers" },
    { id: "viewpoint", label: "Viewpoint (PC7/PC8)", color: "#6366f1", category: "Markers" },
    { id: "vegetation", label: "Existing Vegetation", color: "#22c55e", category: "Markers" },
    { id: "parcel", label: "Land Parcel Boundary", color: "#22c55e", category: "Markers" },
];

interface SectionProps {
    title: string;
    items: LegendItem[];
    defaultOpen?: boolean;
}

function LegendSection({ title, items, defaultOpen = true }: SectionProps) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div className="border-b border-slate-100 last:border-b-0">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-semibold text-slate-700 uppercase tracking-wider hover:bg-slate-50 transition-colors"
            >
                {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                {title}
            </button>
            {open && (
                <div className="px-3 pb-2 space-y-1">
                    {items.map((item) => (
                        <div key={item.id} className="flex items-center gap-2">
                            {item.style === "dashed" ? (
                                <svg width="20" height="10" className="shrink-0">
                                    <line
                                        x1="0" y1="5" x2="20" y2="5"
                                        stroke={item.color} strokeWidth="2.5"
                                        strokeDasharray="4 2"
                                    />
                                </svg>
                            ) : (
                                <div
                                    className="w-3.5 h-3.5 rounded-sm shrink-0 border border-white/30"
                                    style={{ backgroundColor: item.color }}
                                />
                            )}
                            <span className="text-[11px] text-slate-600 leading-tight">{item.label}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

interface SitePlanLegendProps {
    className?: string;
    isOpen?: boolean;
    onToggle?: () => void;
}

export function SitePlanLegend({ className, isOpen = false, onToggle }: SitePlanLegendProps) {
    if (!isOpen) return null;

    return (
        <div className={cn(
            "absolute bottom-4 left-20 z-30 w-60 bg-white/95 backdrop-blur-sm rounded-xl border border-slate-200 shadow-xl overflow-hidden",
            className
        )}>
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Legend</h3>
                {onToggle && (
                    <button onClick={onToggle} className="text-xs text-slate-400 hover:text-slate-700 transition-colors">✕</button>
                )}
            </div>
            <div className="max-h-80 overflow-y-auto">
                <LegendSection title="Surfaces" items={SURFACE_ITEMS} defaultOpen />
                <LegendSection title="Utility Networks (VRD)" items={VRD_ITEMS} defaultOpen />
                <LegendSection title="Markers & References" items={MARKER_ITEMS} defaultOpen={false} />
            </div>
        </div>
    );
}
