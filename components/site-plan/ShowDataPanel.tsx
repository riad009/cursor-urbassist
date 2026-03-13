"use client";

import React, { useState } from "react";
import {
    X,
    ChevronDown,
    ChevronRight,
    MapPin,
    Layers,
    Ruler,
    Mountain,
    Grid3X3,
} from "lucide-react";
import type { ProcessedSiteData } from "@/types/processed-site-data";
import { cn } from "@/lib/utils";

interface ShowDataPanelProps {
    data: ProcessedSiteData | null;
    onClose: () => void;
}

function Section({
    icon: Icon,
    title,
    badge,
    color,
    children,
    defaultOpen = false,
}: {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    badge?: string;
    color: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="rounded-xl border border-slate-200/60 bg-white/70 backdrop-blur-sm overflow-hidden shadow-sm">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50/80 transition-colors"
            >
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", color)}>
                    <Icon className="w-4 h-4" />
                </div>
                <span className="text-sm font-semibold text-slate-900 flex-1 text-left">{title}</span>
                {badge && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        {badge}
                    </span>
                )}
                {open ? (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                )}
            </button>
            {open && <div className="px-4 pb-4 pt-1">{children}</div>}
        </div>
    );
}

function DataRow({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
            <span className="text-xs text-slate-500">{label}</span>
            <span className="text-xs font-semibold text-slate-700 tabular-nums">{value}</span>
        </div>
    );
}

export function ShowDataPanel({ data, onClose }: ShowDataPanelProps) {
    if (!data) {
        return (
            <div className="absolute right-0 top-0 bottom-0 w-[400px] bg-white/95 backdrop-blur-xl border-l border-slate-200 shadow-2xl z-50 flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                    <h2 className="text-base font-bold text-slate-900">Site Data</h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                        <X className="w-4 h-4 text-slate-500" />
                    </button>
                </div>
                <div className="flex-1 flex items-center justify-center">
                    <p className="text-sm text-slate-400 italic">No data available yet. Select parcels and wait for processing.</p>
                </div>
            </div>
        );
    }

    const totalPerimeter = data.edges.reduce((s, e) => s + e.lengthMeters, 0);
    const totalArea = data.parcels.reduce((s, p) => s + p.area, 0);
    const boundaryType = data.globalBoundary.geometry.type;
    const vertexCount = data.vertices3D.length;

    return (
        <div className="absolute right-0 top-0 bottom-0 w-[400px] bg-gradient-to-b from-slate-50/98 to-white/98 backdrop-blur-xl border-l border-slate-200 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/80 bg-white/80 backdrop-blur-sm shrink-0">
                <div>
                    <h2 className="text-base font-bold text-slate-900">Site Data</h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">All processed geospatial data</p>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                >
                    <X className="w-4 h-4 text-slate-500" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin min-h-0">

                {/* ── 1. Parcels ── */}
                <Section
                    icon={MapPin}
                    title="Parcels"
                    badge={`${data.parcels.length}`}
                    color="bg-blue-50 text-blue-600"
                    defaultOpen={true}
                >
                    <div className="space-y-0.5">
                        <DataRow label="Total parcels" value={data.parcels.length} />
                        <DataRow label="Total area" value={`${totalArea.toLocaleString()} m²`} />
                    </div>
                    {data.parcels.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                            {data.parcels.map((p) => (
                                <div
                                    key={p.id}
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100"
                                >
                                    <span className="px-1.5 py-0.5 rounded bg-blue-100 text-[9px] font-bold text-blue-600 uppercase">
                                        {p.section}
                                    </span>
                                    <span className="text-xs font-medium text-slate-700 flex-1">
                                        N°{p.number}
                                    </span>
                                    <span className="text-xs text-slate-500 tabular-nums">
                                        {p.area.toLocaleString()} m²
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </Section>

                {/* ── 2. Global Boundary ── */}
                <Section
                    icon={Layers}
                    title="Global Boundary"
                    badge={boundaryType}
                    color="bg-emerald-50 text-emerald-600"
                >
                    <div className="space-y-0.5">
                        <DataRow label="Geometry type" value={boundaryType} />
                        <DataRow label="Vertices" value={vertexCount} />
                        <DataRow label="Edges" value={data.edges.length} />
                        <DataRow label="Total perimeter" value={`${totalPerimeter.toFixed(1)} m`} />
                        <DataRow label="Contiguous" value={data.globalBoundary.properties?.isContiguous ? "Yes" : "No"} />
                    </div>
                    <div className="mt-3">
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-1.5">Reference Point</p>
                        <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-100 font-mono text-xs text-slate-600">
                            {data.refPoint.lat.toFixed(6)}°N, {data.refPoint.lng.toFixed(6)}°E
                        </div>
                    </div>
                </Section>

                {/* ── 3. Edge Measurements ── */}
                <Section
                    icon={Ruler}
                    title="Edge Measurements"
                    badge={`${data.edges.length}`}
                    color="bg-amber-50 text-amber-600"
                >
                    <div className="space-y-1">
                        {data.edges.map((e, i) => (
                            <div
                                key={i}
                                className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100"
                            >
                                <span className="text-[10px] text-slate-400 font-mono">
                                    Edge {i + 1}
                                </span>
                                <span className="text-xs font-bold text-slate-700 tabular-nums">
                                    {e.lengthMeters.toFixed(2)} m
                                </span>
                            </div>
                        ))}
                    </div>
                </Section>

                {/* ── 4. NGF Elevations ── */}
                <Section
                    icon={Mountain}
                    title="NGF Elevations"
                    badge={`${data.vertices3D.filter(v => v.elevation > 0).length} pts`}
                    color="bg-violet-50 text-violet-600"
                >
                    <div className="space-y-0.5">
                        <DataRow label="Min elevation" value={`${data.stats.minElevation.toFixed(2)} m`} />
                        <DataRow label="Max elevation" value={`${data.stats.maxElevation.toFixed(2)} m`} />
                        <DataRow label="Mean elevation" value={`${data.stats.meanElevation.toFixed(2)} m`} />
                        <DataRow label="Elevation range" value={`${(data.stats.maxElevation - data.stats.minElevation).toFixed(2)} m`} />
                        {data.stats.slopePercent != null && (
                            <DataRow label="Slope" value={`${data.stats.slopePercent.toFixed(1)} %`} />
                        )}
                    </div>
                    <div className="mt-3">
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-1.5">Corner Elevations</p>
                        <div className="space-y-1">
                            {data.vertices3D.filter(v => v.elevation > 0).map((v, i) => (
                                <div
                                    key={i}
                                    className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100"
                                >
                                    <span className="text-[10px] text-slate-400 font-mono">
                                        {v.lat.toFixed(5)}°N, {v.lng.toFixed(5)}°E
                                    </span>
                                    <span className="text-xs font-bold text-violet-600 tabular-nums">
                                        {v.elevation.toFixed(2)} m NGF
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </Section>

                {/* ── 5. Topography ── */}
                <Section
                    icon={Grid3X3}
                    title="Topography Data"
                    badge={`${data.topographyGrid?.length ?? 0} pts`}
                    color="bg-teal-50 text-teal-600"
                >
                    <div className="space-y-0.5">
                        <DataRow label="Grid points" value={data.topographyGrid?.length ?? 0} />
                        <DataRow label="Boundary vertices" value={data.vertices3D.length} />
                        <DataRow
                            label="Total elevation samples"
                            value={(data.vertices3D.length + (data.topographyGrid?.length ?? 0))}
                        />
                        <DataRow label="3D terrain ready" value={
                            (data.topographyGrid?.length ?? 0) > 0 ? "✓ Yes" : "✗ Boundary only"
                        } />
                    </div>
                    {(data.topographyGrid?.length ?? 0) > 0 && (
                        <div className="mt-3 px-3 py-2.5 rounded-lg bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-100">
                            <p className="text-xs text-teal-700 font-medium">
                                Dense topography grid loaded — {data.topographyGrid!.length} elevation samples
                                across the property for smooth 3D terrain rendering.
                            </p>
                        </div>
                    )}
                </Section>

            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-200/80 bg-white/80 backdrop-blur-sm shrink-0">
                <p className="text-[10px] text-slate-400 leading-relaxed">
                    Data source: IGN Apicarto (cadastre) · IGN RGE Alti (elevations) · Turf.js (geometry processing)
                </p>
            </div>
        </div>
    );
}
