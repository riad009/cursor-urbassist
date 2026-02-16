"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Navigation from "@/components/layout/Navigation";
import {
    Loader2,
    Download,
    ArrowLeft,
    MapPin,
    Maximize2,
    RotateCcw,
    Map,
    Layers,
    FileText,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { jsPDF } from "jspdf";

type PageFormat = "A4" | "A3";
type PageOrientation = "portrait" | "landscape";

interface MapViews {
    aerial: string | null;
    ign: string | null;
    plan: string | null;
    cadastre: string | null;
}

interface ProjectInfo {
    id: string;
    name: string;
    address: string | null;
    coordinates: string | null;
    parcelIds: string;
}

// MM dimensions for each format
const PAGE_DIMS: Record<PageFormat, { w: number; h: number }> = {
    A4: { w: 210, h: 297 },
    A3: { w: 297, h: 420 },
};

const SCALE_OPTIONS = [
    { label: "1:500", zoom: 17 },
    { label: "1:1000", zoom: 16 },
    { label: "1:2000", zoom: 15 },
    { label: "1:5000", zoom: 14 },
    { label: "1:10000", zoom: 13 },
    { label: "1:25000", zoom: 12 },
];

function SitePlanDocumentContent() {
    const searchParams = useSearchParams();
    const projectId = searchParams.get("project");
    const { user } = useAuth();

    const [project, setProject] = useState<ProjectInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [mapViews, setMapViews] = useState<MapViews | null>(null);
    const [loadingMaps, setLoadingMaps] = useState(false);
    const [format, setFormat] = useState<PageFormat>("A3");
    const [orientation, setOrientation] = useState<PageOrientation>("landscape");
    const [scale, setScale] = useState(SCALE_OPTIONS[1]); // 1:1000
    const [exportingPdf, setExportingPdf] = useState(false);
    const previewRef = useRef<HTMLDivElement>(null);

    // Computed page dimensions
    const pageDims = PAGE_DIMS[format];
    const pageW = orientation === "landscape" ? pageDims.h : pageDims.w;
    const pageH = orientation === "landscape" ? pageDims.w : pageDims.h;

    // Load project
    useEffect(() => {
        if (!projectId || !user) {
            setLoading(false);
            return;
        }
        fetch(`/api/projects/${projectId}`, { credentials: "include" })
            .then((r) => r.json())
            .then((data) => {
                if (data.project) setProject(data.project);
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [projectId, user]);

    // Load map tiles
    const loadMaps = useCallback(async () => {
        if (!project?.coordinates) return;
        setLoadingMaps(true);
        try {
            const coords = JSON.parse(project.coordinates);
            const res = await fetch(
                `/api/map-tiles?lat=${coords.lat}&lng=${coords.lng}&zoom=${scale.zoom}`
            );
            const data = await res.json();
            if (data.views) setMapViews(data.views);
        } catch {
            // silent
        }
        setLoadingMaps(false);
    }, [project?.coordinates, scale.zoom]);

    useEffect(() => {
        if (project?.coordinates) loadMaps();
    }, [project?.coordinates, loadMaps]);

    // Export PDF
    const exportPdf = async () => {
        setExportingPdf(true);
        try {
            const pdf = new jsPDF({
                orientation: orientation === "landscape" ? "landscape" : "portrait",
                unit: "mm",
                format: format.toLowerCase() as "a3" | "a4",
            });

            const margin = 10;
            const titleH = 20;
            const contentW = pageW - margin * 2;
            const contentH = pageH - margin * 2 - titleH;

            // Title bar
            pdf.setFillColor(30, 41, 59);
            pdf.rect(0, 0, pageW, titleH + margin, "F");
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(14);
            pdf.text(`Plan de situation — ${project?.name || "Projet"}`, margin, margin + 8);
            pdf.setFontSize(9);
            pdf.text(project?.address || "", margin, margin + 14);
            pdf.text(`Échelle: ${scale.label}  |  Format: ${format} ${orientation}`, pageW - margin - 80, margin + 8);

            const viewY = margin + titleH + 5;
            const viewGap = 5;

            // Layout: 3 views stacked or side-by-side based on orientation
            if (orientation === "landscape") {
                // 3 columns
                const viewW = (contentW - viewGap * 2) / 3;
                const viewH = contentH - 10;
                const views = [
                    { label: "Vue aérienne", data: mapViews?.aerial },
                    { label: "Carte IGN", data: mapViews?.ign },
                    { label: "Vue cadastrale", data: mapViews?.cadastre || mapViews?.plan },
                ];
                views.forEach((v, i) => {
                    const x = margin + i * (viewW + viewGap);
                    // View border
                    pdf.setDrawColor(100, 116, 139);
                    pdf.setLineWidth(0.3);
                    pdf.rect(x, viewY, viewW, viewH);
                    // Label
                    pdf.setTextColor(30, 41, 59);
                    pdf.setFontSize(8);
                    pdf.text(v.label, x + 2, viewY + viewH + 4);
                    // Image
                    if (v.data) {
                        try {
                            pdf.addImage(
                                `data:image/png;base64,${v.data}`,
                                "PNG",
                                x + 0.5,
                                viewY + 0.5,
                                viewW - 1,
                                viewH - 1
                            );
                        } catch {
                            pdf.setTextColor(150);
                            pdf.text("Image unavailable", x + viewW / 2 - 15, viewY + viewH / 2);
                        }
                    } else {
                        pdf.setTextColor(150);
                        pdf.setFontSize(10);
                        pdf.text("Image unavailable", x + viewW / 2 - 15, viewY + viewH / 2);
                    }
                    // Project marker (center point)
                    pdf.setFillColor(239, 68, 68);
                    pdf.circle(x + viewW / 2, viewY + viewH / 2, 2, "F");
                    pdf.setDrawColor(255, 255, 255);
                    pdf.setLineWidth(0.5);
                    pdf.circle(x + viewW / 2, viewY + viewH / 2, 2, "S");
                });
            } else {
                // 3 rows (portrait)
                const viewW = contentW;
                const viewH = (contentH - viewGap * 2 - 15) / 3;
                const views = [
                    { label: "Vue aérienne", data: mapViews?.aerial },
                    { label: "Carte IGN", data: mapViews?.ign },
                    { label: "Vue cadastrale", data: mapViews?.cadastre || mapViews?.plan },
                ];
                views.forEach((v, i) => {
                    const y = viewY + i * (viewH + viewGap);
                    pdf.setDrawColor(100, 116, 139);
                    pdf.setLineWidth(0.3);
                    pdf.rect(margin, y, viewW, viewH);
                    pdf.setTextColor(30, 41, 59);
                    pdf.setFontSize(8);
                    pdf.text(v.label, margin + 2, y + viewH + 4);
                    if (v.data) {
                        try {
                            pdf.addImage(
                                `data:image/png;base64,${v.data}`,
                                "PNG",
                                margin + 0.5,
                                y + 0.5,
                                viewW - 1,
                                viewH - 1
                            );
                        } catch {
                            pdf.setTextColor(150);
                            pdf.text("Image unavailable", margin + viewW / 2 - 15, y + viewH / 2);
                        }
                    } else {
                        pdf.setTextColor(150);
                        pdf.setFontSize(10);
                        pdf.text("Image unavailable", margin + viewW / 2 - 15, y + viewH / 2);
                    }
                    pdf.setFillColor(239, 68, 68);
                    pdf.circle(margin + viewW / 2, y + viewH / 2, 2, "F");
                    pdf.setDrawColor(255, 255, 255);
                    pdf.setLineWidth(0.5);
                    pdf.circle(margin + viewW / 2, y + viewH / 2, 2, "S");
                });
            }

            // Footer
            pdf.setTextColor(148, 163, 184);
            pdf.setFontSize(7);
            pdf.text(
                `Généré par UrbAssist — ${new Date().toLocaleDateString("fr-FR")}  |  Parcelles: ${project?.parcelIds || "—"}`,
                margin,
                pageH - 3
            );

            pdf.save(`plan-situation-${project?.name?.replace(/\s+/g, "_") || "projet"}.pdf`);
        } catch (err) {
            console.error("PDF export error:", err);
            alert("Erreur lors de l'export PDF");
        }
        setExportingPdf(false);
    };

    if (loading) {
        return (
            <Navigation>
                <div className="p-6 flex flex-col items-center justify-center min-h-[40vh] gap-3">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                    <p className="text-slate-400 text-sm">Chargement du projet…</p>
                </div>
            </Navigation>
        );
    }

    if (!project) {
        return (
            <Navigation>
                <div className="p-6 max-w-2xl mx-auto">
                    <p className="text-slate-400">Projet non trouvé.</p>
                    <Link href="/projects" className="text-blue-600 hover:underline mt-2 inline-block">
                        ← Retour aux projets
                    </Link>
                </div>
            </Navigation>
        );
    }

    const previewScaleFactor = orientation === "landscape" ? Math.min(900 / pageW, 600 / pageH) : Math.min(600 / pageW, 800 / pageH);
    const previewW = pageW * previewScaleFactor;
    const previewH = pageH * previewScaleFactor;

    return (
        <Navigation>
            <div className="p-4 lg:p-6">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                        <Link
                            href={`/projects/${project.id}`}
                            className="text-sm text-slate-400 hover:text-slate-900 inline-flex items-center gap-1"
                        >
                            <ArrowLeft className="w-4 h-4" /> Résumé
                        </Link>
                        <h1 className="text-xl lg:text-2xl font-bold text-slate-900 flex items-center gap-2">
                            <FileText className="w-6 h-6 text-blue-600" />
                            Plan de Situation
                        </h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={loadMaps}
                            disabled={loadingMaps}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm hover:bg-slate-200 disabled:opacity-50"
                        >
                            <RotateCcw className={`w-4 h-4 ${loadingMaps ? "animate-spin" : ""}`} />
                            Rafraîchir
                        </button>
                        <button
                            onClick={exportPdf}
                            disabled={exportingPdf || !mapViews}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/80 text-slate-900 font-medium text-sm hover:bg-blue-500 disabled:opacity-50"
                        >
                            {exportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            Exporter PDF
                        </button>
                    </div>
                </div>

                {/* Project info bar */}
                {project.address && (
                    <div className="mb-4 p-3 rounded-xl bg-white border border-slate-200 flex items-center gap-3 text-sm">
                        <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="text-slate-900 font-medium">{project.name}</span>
                        <span className="text-slate-400">—</span>
                        <span className="text-slate-400">{project.address}</span>
                    </div>
                )}

                {/* Controls */}
                <div className="flex flex-wrap items-center gap-3 mb-6 p-4 rounded-xl bg-white border border-slate-200">
                    {/* Format */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Format</span>
                        <div className="flex rounded-lg overflow-hidden border border-slate-200">
                            {(["A4", "A3"] as PageFormat[]).map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setFormat(f)}
                                    className={`px-3 py-1.5 text-sm font-medium ${format === f
                                            ? "bg-blue-500/30 text-blue-200"
                                            : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                                        }`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Orientation */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Orientation</span>
                        <div className="flex rounded-lg overflow-hidden border border-slate-200">
                            {(["landscape", "portrait"] as PageOrientation[]).map((o) => (
                                <button
                                    key={o}
                                    onClick={() => setOrientation(o)}
                                    className={`px-3 py-1.5 text-sm font-medium capitalize ${orientation === o
                                            ? "bg-blue-500/30 text-blue-200"
                                            : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                                        }`}
                                >
                                    {o === "landscape" ? "Paysage" : "Portrait"}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Scale */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Échelle</span>
                        <select
                            value={scale.label}
                            onChange={(e) => {
                                const found = SCALE_OPTIONS.find((s) => s.label === e.target.value);
                                if (found) setScale(found);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                        >
                            {SCALE_OPTIONS.map((s) => (
                                <option key={s.label} value={s.label}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex-1" />
                    <span className="text-xs text-slate-500">
                        {Math.round(pageW)} × {Math.round(pageH)} mm
                    </span>
                </div>

                {/* Preview */}
                <div className="flex justify-center">
                    <div
                        ref={previewRef}
                        className="bg-white rounded-lg shadow-2xl overflow-hidden relative"
                        style={{
                            width: `${previewW}px`,
                            height: `${previewH}px`,
                        }}
                    >
                        {/* Title bar */}
                        <div
                            className="bg-slate-100 text-slate-900 px-4 py-2 flex items-center justify-between"
                            style={{ height: `${30 * previewScaleFactor}px` }}
                        >
                            <div>
                                <p className="font-semibold" style={{ fontSize: `${10 * previewScaleFactor}px` }}>
                                    Plan de situation — {project.name}
                                </p>
                                <p className="text-slate-600" style={{ fontSize: `${7 * previewScaleFactor}px` }}>
                                    {project.address}
                                </p>
                            </div>
                            <p className="text-slate-400" style={{ fontSize: `${7 * previewScaleFactor}px` }}>
                                {scale.label} | {format} {orientation === "landscape" ? "Paysage" : "Portrait"}
                            </p>
                        </div>

                        {/* Map views */}
                        <div
                            className={`flex-1 p-2 gap-2 ${orientation === "landscape" ? "flex flex-row" : "flex flex-col"
                                }`}
                            style={{
                                height: `${previewH - 30 * previewScaleFactor - 16 * previewScaleFactor}px`,
                            }}
                        >
                            {loadingMaps ? (
                                <div className="flex-1 flex items-center justify-center">
                                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                                </div>
                            ) : (
                                <>
                                    {/* View 1: Aerial */}
                                    <div className="flex-1 border border-slate-300 rounded relative overflow-hidden bg-slate-100">
                                        {mapViews?.aerial ? (
                                            <img
                                                src={`data:image/png;base64,${mapViews.aerial}`}
                                                alt="Vue aérienne"
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-slate-400 text-xs">
                                                <Map className="w-4 h-4 mr-1" /> Vue aérienne
                                            </div>
                                        )}
                                        {/* Marker */}
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-red-500 rounded-full border-2 border-white shadow-lg" />
                                        <span
                                            className="absolute bottom-1 left-1 bg-white text-slate-900 px-1.5 py-0.5 rounded text-[9px]"
                                        >
                                            Vue aérienne
                                        </span>
                                    </div>

                                    {/* View 2: IGN */}
                                    <div className="flex-1 border border-slate-300 rounded relative overflow-hidden bg-slate-100">
                                        {mapViews?.ign ? (
                                            <img
                                                src={`data:image/png;base64,${mapViews.ign}`}
                                                alt="Carte IGN"
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-slate-400 text-xs">
                                                <Layers className="w-4 h-4 mr-1" /> Carte IGN
                                            </div>
                                        )}
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-red-500 rounded-full border-2 border-white shadow-lg" />
                                        <span
                                            className="absolute bottom-1 left-1 bg-white text-slate-900 px-1.5 py-0.5 rounded text-[9px]"
                                        >
                                            Carte IGN
                                        </span>
                                    </div>

                                    {/* View 3: Cadastral */}
                                    <div className="flex-1 border border-slate-300 rounded relative overflow-hidden bg-slate-100">
                                        {(mapViews?.cadastre || mapViews?.plan) ? (
                                            <img
                                                src={`data:image/png;base64,${mapViews.cadastre || mapViews.plan}`}
                                                alt="Vue cadastrale"
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-slate-400 text-xs">
                                                <Maximize2 className="w-4 h-4 mr-1" /> Vue cadastrale
                                            </div>
                                        )}
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-red-500 rounded-full border-2 border-white shadow-lg" />
                                        <span
                                            className="absolute bottom-1 left-1 bg-white text-slate-900 px-1.5 py-0.5 rounded text-[9px]"
                                        >
                                            Vue cadastrale
                                        </span>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Footer */}
                        <div
                            className="bg-slate-50 border-t border-slate-200 px-3 flex items-center justify-between text-slate-500"
                            style={{ height: `${16 * previewScaleFactor}px`, fontSize: `${6 * previewScaleFactor}px` }}
                        >
                            <span>Généré par UrbAssist — {new Date().toLocaleDateString("fr-FR")}</span>
                            <span>Parcelles: {project.parcelIds || "—"}</span>
                        </div>
                    </div>
                </div>

                {/* Bottom navigation */}
                <div className="mt-6 flex items-center justify-between max-w-3xl mx-auto">
                    <Link
                        href={`/projects/${project.id}`}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm hover:bg-slate-200"
                    >
                        <ArrowLeft className="w-4 h-4" /> Retour au résumé
                    </Link>
                    <button
                        onClick={exportPdf}
                        disabled={exportingPdf || !mapViews}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-slate-900 font-semibold hover:shadow-lg disabled:opacity-50"
                    >
                        {exportingPdf ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                        Exporter en PDF
                    </button>
                </div>
            </div>
        </Navigation>
    );
}

export default function SitePlanDocumentPage() {
    return (
        <React.Suspense
            fallback={
                <Navigation>
                    <div className="p-6 flex items-center justify-center min-h-[40vh]">
                        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                    </div>
                </Navigation>
            }
        >
            <SitePlanDocumentContent />
        </React.Suspense>
    );
}
