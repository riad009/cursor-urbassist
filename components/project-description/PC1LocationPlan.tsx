"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, GeoJSON, ScaleControl, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { jsPDF } from "jspdf";
import {
    Download,
    Loader2,
    ArrowLeft,
    Satellite,
    Map as MapIcon,
    Grid3X3,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/language-context";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PC1Project {
    address?: string | null;
    coordinates?: string | null;
    parcelGeometry?: string | null;
    parcelIds?: string | null;
    authorizationType?: string | null;
    name?: string | null;
}

interface PC1LocationPlanProps {
    project: PC1Project | null;
    projectId: string;
}

type MapLayer = "AERIAL" | "IGN" | "CADASTRE";

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseCoordinates(raw: string | null | undefined): [number, number] | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length >= 2) {
            return [parsed[1], parsed[0]]; // [lat, lng] from [lng, lat]
        }
        const lat = parsed.lat ?? parsed.latitude;
        const lng = parsed.lng ?? parsed.longitude;
        if (typeof lat === "number" && typeof lng === "number") {
            return [lat, lng];
        }
    } catch { /* invalid JSON */ }
    return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseGeoJSON(raw: string | null | undefined): any | null {
    if (!raw) return null;
    try {
        return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch { return null; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toFeatureCollection(geoJSON: any): GeoJSON.FeatureCollection {
    if (!geoJSON) return { type: "FeatureCollection", features: [] };
    if (geoJSON.type === "FeatureCollection") return geoJSON;
    if (geoJSON.type === "Feature") return { type: "FeatureCollection", features: [geoJSON] };
    return { type: "FeatureCollection", features: [{ type: "Feature", geometry: geoJSON, properties: {} }] };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeCentroid(geoJSON: any): [number, number] | null {
    const fc = toFeatureCollection(geoJSON);
    const coords: number[][] = [];
    for (const feature of fc.features) {
        const geom = feature.geometry;
        if (!geom) continue;
        if (geom.type === "Polygon") {
            coords.push(...geom.coordinates[0]);
        } else if (geom.type === "MultiPolygon") {
            for (const poly of geom.coordinates) coords.push(...poly[0]);
        }
    }
    if (coords.length === 0) return null;
    const sumLng = coords.reduce((s: number, c: number[]) => s + c[0], 0);
    const sumLat = coords.reduce((s: number, c: number[]) => s + c[1], 0);
    return [sumLat / coords.length, sumLng / coords.length];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeBounds(geoJSON: any): L.LatLngBounds | null {
    try {
        const layer = L.geoJSON(toFeatureCollection(geoJSON));
        const bounds = layer.getBounds();
        if (bounds.isValid()) return bounds;
    } catch { /* ignore */ }
    return null;
}

function formatDateFR(): string {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

function sanitizeFilename(s: string): string {
    return s.replace(/[^a-zA-Z0-9àâäéèêëïîôùûüçÀÂÄÉÈÊËÏÎÔÙÛÜÇ_\- ]/g, "").replace(/\s+/g, "_").slice(0, 80);
}

/** Returns the proxied tile URL for React-Leaflet TileLayer */
function getTileUrl(layer: MapLayer): string {
    return `/api/map-tiles?layer=${layer}&z={z}&x={x}&y={y}`;
}

const TAB_CONFIG: { key: MapLayer; icon: React.ReactNode; labelFr: string; labelEn: string }[] = [
    { key: "AERIAL", icon: <Satellite className="w-4 h-4" />, labelFr: "Aérien", labelEn: "Aerial" },
    { key: "IGN", icon: <MapIcon className="w-4 h-4" />, labelFr: "IGN Plan", labelEn: "IGN Plan" },
    { key: "CADASTRE", icon: <Grid3X3 className="w-4 h-4" />, labelFr: "Cadastre", labelEn: "Cadastre" },
];

const PARCEL_STYLE: L.PathOptions = {
    color: "#ef4444",
    weight: 3,
    opacity: 0.9,
    fillColor: "#f97316",
    fillOpacity: 0.15,
    dashArray: "6 4",
};

// ─── Sub-components ─────────────────────────────────────────────────────────

function FitBounds({ geoJSON }: { geoJSON: GeoJSON.FeatureCollection }) {
    const map = useMap();
    useEffect(() => {
        const bounds = computeBounds(geoJSON);
        if (bounds) {
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 });
        }
    }, [map, geoJSON]);
    return null;
}

/** Static north arrow — always points up, no click handler */
function NorthArrow() {
    return (
        <div className="absolute top-3 right-3 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg shadow-md p-2 pointer-events-none select-none">
            <svg width="36" height="48" viewBox="0 0 36 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <polygon points="18,2 12,22 18,18 24,22" fill="#1e293b" stroke="#1e293b" strokeWidth="1" />
                <polygon points="18,18 12,22 18,42 24,22" fill="#94a3b8" stroke="#1e293b" strokeWidth="1" />
                <text x="18" y="10" textAnchor="middle" fontSize="9" fontWeight="bold" fill="white">N</text>
            </svg>
        </div>
    );
}

// ─── PDF Cartouche Drawer ───────────────────────────────────────────────────

function drawPDFCartouche(
    doc: jsPDF,
    address: string,
    parcelRef: string,
    authType: string,
    layerLabel: string,
    pageIndex: number
) {
    const W = 420;
    const cartY = 245;
    const cartH = 45;
    const margin = 10;

    // Background
    doc.setFillColor(31, 41, 55);
    doc.rect(margin, cartY, W - margin * 2, cartH, "F");

    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("PC1 \u2014 PLAN DE SITUATION DU TERRAIN", margin + 8, cartY + 10);

    // Layer + page
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Vue : ${layerLabel}  |  Page ${pageIndex + 1}/3`, W - margin - 8, cartY + 10, { align: "right" });

    // Details row
    const detY = cartY + 20;
    const col1X = margin + 8;
    doc.setFontSize(7);

    doc.setFont("helvetica", "bold");
    doc.text("Adresse :", col1X, detY);
    doc.setFont("helvetica", "normal");
    doc.text(address || "\u2014", col1X + 20, detY);

    doc.setFont("helvetica", "bold");
    doc.text("Parcelle :", col1X, detY + 6);
    doc.setFont("helvetica", "normal");
    doc.text(parcelRef || "\u2014", col1X + 20, detY + 6);

    doc.setFont("helvetica", "bold");
    doc.text("Type :", col1X, detY + 12);
    doc.setFont("helvetica", "normal");
    doc.text(authType === "DP" ? "D\u00e9claration Pr\u00e9alable (DP)" : "Permis de Construire (PC)", col1X + 20, detY + 12);

    // Scale
    const col2X = W / 2 - 20;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("\u00c9chelle 1 : 2 500", col2X, detY);

    // Graphic scale bar
    const barX = col2X;
    const barY = detY + 6;
    // At 1:2500, 40mm on paper = 100m real
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.5);
    doc.line(barX, barY, barX + 80, barY);
    const scaleTicks = [
        { m: 0, x: 0 },
        { m: 100, x: 40 },
        { m: 500, x: 80 },
    ];
    doc.setFontSize(5);
    for (const t of scaleTicks) {
        doc.line(barX + t.x, barY - 1.5, barX + t.x, barY + 1.5);
        doc.text(`${t.m}m`, barX + t.x, barY + 5, { align: "center" });
    }

    // Date + north arrow
    const col3X = W - margin - 55;
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text("Date :", col3X, detY);
    doc.setFont("helvetica", "normal");
    doc.text(formatDateFR(), col3X + 13, detY);

    // North arrow triangle
    const naX = W - margin - 18;
    const naY = detY + 6;
    doc.setFillColor(255, 255, 255);
    doc.triangle(naX, naY - 6, naX - 3, naY + 2, naX + 3, naY + 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.text("N", naX, naY - 8, { align: "center" });
}

// ─── Server-side map image fetcher ──────────────────────────────────────────

async function fetchComposedMapImage(
    lat: number,
    lng: number,
    layer: MapLayer,
    zoom: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parcelGeoJson?: any
): Promise<string> {
    const res = await fetch("/api/location-plan/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, zoom, layer, parcelGeoJson }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server returned ${res.status}: ${text}`);
    }

    const data = await res.json();
    return data.image;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function PC1LocationPlan({ project, projectId }: PC1LocationPlanProps) {
    const router = useRouter();
    const { t } = useLanguage();
    const isEn = t("auth.next") === "Next";
    const mapContainerRef = useRef<HTMLDivElement>(null);

    const [activeLayer, setActiveLayer] = useState<MapLayer>("AERIAL");
    const [mapReady, setMapReady] = useState(false);
    const [pdfGenerating, setPdfGenerating] = useState(false);
    const [pdfProgress, setPdfProgress] = useState("");

    // ── Parse project data ──────────────────────────────────────────────
    const center = useMemo(() => {
        if (!project) return null;
        const fromCoords = parseCoordinates(project.coordinates);
        if (fromCoords) return fromCoords;
        const geoJSON = parseGeoJSON(project.parcelGeometry);
        if (geoJSON) return computeCentroid(geoJSON);
        return null;
    }, [project]);

    const geoJSONData = useMemo(() => {
        const parsed = parseGeoJSON(project?.parcelGeometry);
        if (!parsed) return null;
        return toFeatureCollection(parsed);
    }, [project?.parcelGeometry]);

    const parcelRef = useMemo(() => {
        const ids = project?.parcelIds;
        if (!ids) return isEn ? "Not specified" : "Non renseign\u00e9e";
        return ids;
    }, [project?.parcelIds, isEn]);

    const address = project?.address || (isEn ? "Not specified" : "Non renseign\u00e9e");
    const authType = project?.authorizationType || "PC";

    // ── PDF Export (server-side tile composition) ────────────────────────
    const handlePDFExport = useCallback(async () => {
        if (!center) return;
        setPdfGenerating(true);

        try {
            const doc = new jsPDF({
                orientation: "landscape",
                unit: "mm",
                format: [420, 297],
            });

            const PDF_ZOOM = 16;
            const parcelGeo = parseGeoJSON(project?.parcelGeometry);

            const layers: { key: MapLayer; label: string }[] = [
                { key: "AERIAL", label: "Vue A\u00e9rienne (Orthophoto)" },
                { key: "IGN", label: "IGN Plan Topographique" },
                { key: "CADASTRE", label: "Cadastre (Parcellaire)" },
            ];

            for (let i = 0; i < layers.length; i++) {
                const { key, label } = layers[i];
                setPdfProgress(isEn
                    ? `Composing ${label} (${i + 1}/3)...`
                    : `Composition ${label} (${i + 1}/3)...`);

                if (i > 0) doc.addPage([420, 297], "landscape");

                // Fetch composed map image from server
                const mapImage = await fetchComposedMapImage(
                    center[0],
                    center[1],
                    key,
                    PDF_ZOOM,
                    parcelGeo
                );

                // Place map image — x=10, y=10, width=400, height=230 (mm)
                doc.addImage(mapImage, "JPEG", 10, 10, 400, 230);

                // Draw cartouche below at y=245
                drawPDFCartouche(
                    doc,
                    project?.address || "",
                    project?.parcelIds || "",
                    authType,
                    label,
                    i
                );
            }

            const filename = `PC1_Plan_Situation_${sanitizeFilename(project?.address || "projet")}.pdf`;
            doc.save(filename);
        } catch (err) {
            console.error("PDF generation error:", err);
            alert(isEn
                ? "PDF generation failed. Please try again."
                : "La g\u00e9n\u00e9ration du PDF a \u00e9chou\u00e9. Veuillez r\u00e9essayer.");
        } finally {
            setPdfGenerating(false);
            setPdfProgress("");
        }
    }, [center, project, authType, isEn]);

    // ── Loading / error states ──────────────────────────────────────────
    if (!project) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
        );
    }

    if (!center) {
        return (
            <div className="bg-white px-8 py-12 text-center space-y-3">
                <MapIcon className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-slate-600">
                    {isEn ? "No coordinates available for this project" : "Aucune coordonn\u00e9e disponible pour ce projet"}
                </p>
                <p className="text-xs text-slate-400">
                    {isEn ? "Please ensure the project has valid parcel data." : "Veuillez v\u00e9rifier que le projet dispose de donn\u00e9es parcellaires valides."}
                </p>
                <button
                    type="button"
                    onClick={() => router.push(`/site-plan?project=${projectId}`)}
                    className="inline-flex items-center gap-2 px-4 py-2 mt-3 rounded-lg bg-indigo-50 text-indigo-600 text-sm font-semibold hover:bg-indigo-100 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    {isEn ? "Back to editor" : "Retour \u00e0 l'\u00e9diteur"}
                </button>
            </div>
        );
    }

    return (
        <div className="bg-white">
            {/* ── Header ────────────────────────────────────────────────── */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-4 text-white">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-wider">
                            PC1 — {isEn ? "SITE LOCATION PLAN" : "PLAN DE SITUATION"}
                        </h2>
                        <p className="text-xs text-slate-300 mt-0.5">
                            {isEn ? "Location of the project site" : "Localisation du terrain du projet"}
                        </p>
                    </div>
                    <div className="text-right text-xs text-slate-300">
                        <p>{isEn ? "Scale: 1 : 2 500" : "\u00c9chelle : 1 : 2 500"}</p>
                        <p>{formatDateFR()}</p>
                    </div>
                </div>
            </div>

            {/* ── Tab Switcher ───────────────────────────────────────────── */}
            <div className="flex items-center gap-1 px-4 py-2 bg-slate-50 border-b border-slate-200">
                {TAB_CONFIG.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveLayer(tab.key)}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                            activeLayer === tab.key
                                ? "bg-indigo-600 text-white shadow-sm"
                                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                        )}
                    >
                        {tab.icon}
                        {isEn ? tab.labelEn : tab.labelFr}
                    </button>
                ))}
                <div className="flex-1" />
                <button
                    type="button"
                    onClick={handlePDFExport}
                    disabled={pdfGenerating}
                    className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                        pdfGenerating
                            ? "bg-slate-100 text-slate-400 cursor-wait"
                            : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                    )}
                >
                    {pdfGenerating ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {isEn ? "Generating..." : "G\u00e9n\u00e9ration..."}</>
                    ) : (
                        <><Download className="w-3.5 h-3.5" /> {isEn ? "Export PDF" : "Exporter PDF"}</>
                    )}
                </button>
            </div>

            {/* ── PDF Progress Banner ───────────────────────────────────── */}
            {pdfGenerating && pdfProgress && (
                <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-200 text-xs text-indigo-700 font-medium flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {pdfProgress}
                </div>
            )}

            {/* ── Map ───────────────────────────────────────────────────── */}
            <div className="relative" ref={mapContainerRef} style={{ height: 420 }}>
                <MapContainer
                    center={center}
                    zoom={16}
                    style={{ height: "100%", width: "100%" }}
                    zoomControl={true}
                    attributionControl={false}
                    whenReady={() => setMapReady(true)}
                >
                    {/*
                      BUG 2 FIX: key={activeLayer} forces full TileLayer remount
                      when the tab changes, so the URL actually updates.
                    */}
                    <TileLayer
                        key={activeLayer}
                        url={getTileUrl(activeLayer)}
                        attribution="IGN G&eacute;oportail"
                        maxZoom={19}
                        tileSize={256}
                    />
                    {geoJSONData && geoJSONData.features.length > 0 && (
                        <>
                            <GeoJSON
                                key={`parcel-${activeLayer}`}
                                data={geoJSONData}
                                style={() => PARCEL_STYLE}
                            />
                            <FitBounds geoJSON={geoJSONData} />
                        </>
                    )}
                    <ScaleControl position="bottomleft" metric={true} imperial={false} />
                </MapContainer>
                {/* Static north arrow — always points up, no interaction */}
                <NorthArrow />
                {!mapReady && (
                    <div className="absolute inset-0 z-[1000] bg-white/80 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                    </div>
                )}
            </div>

            {/* ── Info Cards ────────────────────────────────────────────── */}
            <div className="px-6 py-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                            {isEn ? "Project Address" : "Adresse du projet"}
                        </p>
                        <p className="text-sm font-semibold text-slate-800">{address}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                            {isEn ? "Authorization Type" : "Type d'autorisation"}
                        </p>
                        <p className="text-sm font-semibold text-slate-800">
                            {authType === "DP" ? "D\u00e9claration Pr\u00e9alable (DP)" : "Permis de Construire (PC)"}
                        </p>
                    </div>
                </div>

                {/* ── Cartouche ──────────────────────────────────────────── */}
                <div className="border-2 border-slate-800 rounded-lg overflow-hidden">
                    <div className="bg-slate-800 px-5 py-2.5">
                        <h3 className="text-xs font-black text-white uppercase tracking-widest">
                            PC1 — PLAN DE SITUATION DU TERRAIN
                        </h3>
                    </div>
                    <div className="grid grid-cols-3 divide-x divide-slate-200">
                        {/* Left */}
                        <div className="px-4 py-3 space-y-1.5">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">
                                {isEn ? "Address" : "Adresse"}
                            </p>
                            <p className="text-xs font-semibold text-slate-800 leading-tight">{address}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-2">
                                {isEn ? "Cadastral Reference" : "R\u00e9f\u00e9rence cadastrale"}
                            </p>
                            <p className="text-xs text-slate-700">{parcelRef}</p>
                        </div>
                        {/* Center */}
                        <div className="px-4 py-3 flex flex-col items-center justify-center">
                            <p className="text-base font-black text-slate-900">{"\u00c9chelle 1 : 2 500"}</p>
                            <div className="mt-2 flex items-end gap-0">
                                <div className="flex flex-col items-center">
                                    <div className="w-px h-2 bg-slate-800" />
                                    <span className="text-[7px] text-slate-500 mt-0.5">0</span>
                                </div>
                                <div className="h-1 bg-slate-800" style={{ width: 25 }} />
                                <div className="flex flex-col items-center">
                                    <div className="w-px h-2 bg-slate-800" />
                                    <span className="text-[7px] text-slate-500 mt-0.5">100m</span>
                                </div>
                                <div className="h-1 bg-slate-400" style={{ width: 25 }} />
                                <div className="flex flex-col items-center">
                                    <div className="w-px h-2 bg-slate-800" />
                                    <span className="text-[7px] text-slate-500 mt-0.5">200m</span>
                                </div>
                                <div className="h-1 bg-slate-800" style={{ width: 50 }} />
                                <div className="flex flex-col items-center">
                                    <div className="w-px h-2 bg-slate-800" />
                                    <span className="text-[7px] text-slate-500 mt-0.5">500m</span>
                                </div>
                            </div>
                        </div>
                        {/* Right */}
                        <div className="px-4 py-3 space-y-1.5">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Date</p>
                            <p className="text-xs font-semibold text-slate-800">{formatDateFR()}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-2">
                                {isEn ? "Authorization" : "Autorisation"}
                            </p>
                            <p className="text-xs font-semibold text-slate-800">
                                {authType === "DP" ? "DP" : "PC"}
                            </p>
                            {/* Inline north arrow */}
                            <div className="flex items-center gap-1 mt-1.5">
                                <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
                                    <polygon points="8,1 4,12 8,10 12,12" fill="#1e293b" />
                                    <polygon points="8,10 4,12 8,19 12,12" fill="#94a3b8" />
                                </svg>
                                <span className="text-[8px] font-bold text-slate-500 uppercase">Nord</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Back navigation ────────────────────────────────────── */}
                <div className="flex items-center gap-4 pt-2">
                    <button
                        type="button"
                        onClick={() => router.push(`/site-plan?project=${projectId}`)}
                        className="inline-flex items-center gap-1.5 text-sm text-indigo-600 font-semibold hover:text-indigo-800 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        {isEn ? "Back to editor" : "\u2190 Retour \u00e0 l'\u00e9diteur"}
                    </button>
                </div>
            </div>
        </div>
    );
}
