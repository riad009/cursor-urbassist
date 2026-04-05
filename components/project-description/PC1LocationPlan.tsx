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
    municipality?: string | null;
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

// ─── PDF: Draw compass rose ─────────────────────────────────────────────────

function drawCompassRose(doc: jsPDF, cx: number, cy: number, r: number) {
    doc.setFillColor(26, 26, 46);
    doc.triangle(cx, cy - r, cx - r * 0.15, cy, cx + r * 0.15, cy, "F");
    doc.setFillColor(160, 160, 160);
    doc.triangle(cx, cy + r, cx - r * 0.15, cy, cx + r * 0.15, cy, "F");
    doc.setFillColor(26, 26, 46);
    doc.triangle(cx + r * 0.7, cy, cx, cy - r * 0.1, cx, cy + r * 0.1, "F");
    doc.setFillColor(160, 160, 160);
    doc.triangle(cx - r * 0.7, cy, cx, cy - r * 0.1, cx, cy + r * 0.1, "F");
    doc.setDrawColor(26, 26, 46);
    doc.setLineWidth(0.5);
    doc.circle(cx, cy, r * 0.12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(26, 26, 46);
    doc.text("N", cx, cy - r - 3, { align: "center" });
    doc.text("S", cx, cy + r + 6, { align: "center" });
    doc.text("E", cx + r * 0.7 + 5, cy + 2.5);
    doc.text("O", cx - r * 0.7 - 8, cy + 2.5);
}

// ─── PDF: Draw map header bar ───────────────────────────────────────────────

function drawMapHeader(
    doc: jsPDF,
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    fontSize: number = 7
) {
    doc.setFillColor(26, 26, 46);
    doc.rect(x, y, w, h, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(fontSize);
    doc.text(text, x + 3, y + h - 2);
}

// ─── PDF: Draw title block ──────────────────────────────────────────────────

function drawTitleBlock(
    doc: jsPDF,
    address: string,
    parcelRef: string,
    commune: string,
    authType: string
) {
    const W = 420;

    doc.setFillColor(26, 26, 46);
    doc.rect(0, 255, W, 42, "F");

    // Row 1: info columns
    const cols = [8, 115, 225, 330];
    const labels = ["ADRESSE", "PARCELLE", "COMMUNE", "AUTORISATION"];
    const values = [
        address || "Non renseigné",
        parcelRef || "Non renseigné",
        commune || "Non renseigné",
        authType === "DP" ? "Déclaration Préalable" : "Permis de Construire",
    ];

    doc.setFontSize(5.5);
    doc.setTextColor(180, 180, 180);
    doc.setFont("helvetica", "normal");
    cols.forEach((x, i) => {
        doc.text(labels[i], x, 261);
    });

    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    cols.forEach((x, i) => {
        doc.text(values[i], x, 267);
    });

    // Divider
    doc.setDrawColor(100, 100, 120);
    doc.setLineWidth(0.2);
    doc.line(8, 271, W - 8, 271);

    // INDICE
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.setFont("helvetica", "normal");
    doc.text("INDICE", 8, 277);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text("0", 8, 284);

    // Date
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text(formatDateFR(), 30, 277);

    // Document title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text("PLAN DE SITUATION", W / 2, 282, { align: "center" });

    // PCMI number
    doc.setFontSize(14);
    doc.text("PCMI 1", W - 12, 282, { align: "right" });

    // Fine print
    doc.setFont("helvetica", "normal");
    doc.setFontSize(4.5);
    doc.setTextColor(120, 120, 140);
    doc.text(
        "Document ne pouvant servir à l'exécution des travaux — Il appartient au maître d'œuvre de réaliser toutes les études techniques nécessaires.",
        8,
        293
    );
    doc.setFontSize(4);
    doc.text(`Généré par Urbassist — urbassist.com — ${formatDateFR()}`, W - 8, 293, {
        align: "right",
    });
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
        if (!ids) return isEn ? "Not specified" : "Non renseignée";
        return ids;
    }, [project?.parcelIds, isEn]);

    const address = project?.address || (isEn ? "Not specified" : "Non renseignée");
    const authType = project?.authorizationType || "PC";

    // ── PDF Export — SINGLE PAGE with all 3 views ───────────────────────
    const handlePDFExport = useCallback(async () => {
        if (!center) return;
        setPdfGenerating(true);
        setPdfProgress(isEn ? "Composing map views..." : "Composition des vues cartographiques...");

        try {
            // Fetch all 3 map images in one API call
            const response = await fetch("/api/location-plan/export-pdf", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    lat: center[0],
                    lng: center[1],
                    parcelGeoJson: parseGeoJSON(project?.parcelGeometry),
                    projectData: {
                        address: project?.address,
                        parcelRef: project?.parcelIds,
                        commune: project?.municipality ?? "",
                        authorizationType: project?.authorizationType ?? "PC",
                    },
                }),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Server returned ${response.status}: ${text}`);
            }

            const { ignImage, cadastreImage, aerialImage } = await response.json();

            setPdfProgress(isEn ? "Assembling PDF..." : "Assemblage du PDF...");

            // Create single A3 landscape PDF
            const doc = new jsPDF({
                orientation: "landscape",
                unit: "mm",
                format: [420, 297],
            });

            // ── IGN map — left half ─────────────────────────────────────
            drawMapHeader(doc, 10, 10, 200, 8, "PLAN IGN — 1/5000ème", 7);
            if (ignImage) {
                try {
                    doc.addImage(`data:image/jpeg;base64,${ignImage}`, "JPEG", 10, 18, 200, 235);
                } catch {
                    drawPlaceholder(doc, 10, 18, 200, 235, "IGN Plan indisponible");
                }
            } else {
                drawPlaceholder(doc, 10, 18, 200, 235, "IGN Plan indisponible");
            }

            // ── Compass rose ────────────────────────────────────────────
            drawCompassRose(doc, 250, 38, 18);

            // ── Cadastre — top right ────────────────────────────────────
            drawMapHeader(doc, 215, 75, 195, 8, "PLAN DE COMPOSITION CADASTRALE — 1/2000ème", 6);
            if (cadastreImage) {
                try {
                    doc.addImage(`data:image/jpeg;base64,${cadastreImage}`, "JPEG", 215, 83, 195, 80);
                } catch {
                    drawPlaceholder(doc, 215, 83, 195, 80, "Cadastre indisponible");
                }
            } else {
                drawPlaceholder(doc, 215, 83, 195, 80, "Cadastre indisponible");
            }

            // ── Aerial — bottom right ───────────────────────────────────
            drawMapHeader(doc, 215, 168, 195, 7, "VUE AÉRIENNE — 1/2000ème", 6);
            if (aerialImage) {
                try {
                    doc.addImage(`data:image/jpeg;base64,${aerialImage}`, "JPEG", 215, 175, 195, 78);
                } catch {
                    drawPlaceholder(doc, 215, 175, 195, 78, "Vue aérienne indisponible");
                }
            } else {
                drawPlaceholder(doc, 215, 175, 195, 78, "Vue aérienne indisponible");
            }

            // ── Border + dividers ───────────────────────────────────────
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.5);
            doc.rect(10, 10, 400, 243);

            doc.setDrawColor(80, 80, 80);
            doc.setLineWidth(0.3);
            doc.line(210, 10, 210, 253);
            doc.line(215, 163, 410, 163);

            // ── Title block ─────────────────────────────────────────────
            drawTitleBlock(
                doc,
                project?.address || "",
                project?.parcelIds || "",
                project?.municipality || "",
                authType
            );

            // ── Save — ONE PAGE only ────────────────────────────────────
            const filename = `PC1_Plan_Situation_${sanitizeFilename(project?.address || "projet")}.pdf`;
            doc.save(filename);
        } catch (err) {
            console.error("PC1 PDF generation error:", err);
            alert(
                isEn
                    ? "PDF generation failed. Please try again."
                    : "La génération du PDF a échoué. Veuillez réessayer."
            );
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
                    {isEn ? "No coordinates available for this project" : "Aucune coordonnée disponible pour ce projet"}
                </p>
                <p className="text-xs text-slate-400">
                    {isEn ? "Please ensure the project has valid parcel data." : "Veuillez vérifier que le projet dispose de données parcellaires valides."}
                </p>
                <button
                    type="button"
                    onClick={() => router.push(`/site-plan?project=${projectId}`)}
                    className="inline-flex items-center gap-2 px-4 py-2 mt-3 rounded-lg bg-indigo-50 text-indigo-600 text-sm font-semibold hover:bg-indigo-100 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    {isEn ? "Back to editor" : "Retour à l'éditeur"}
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
                        <p>{isEn ? "Scale: 1 : 2 500" : "Échelle : 1 : 2 500"}</p>
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
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {isEn ? "Generating..." : "Génération..."}</>
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
                {/* Static north arrow */}
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
                            {authType === "DP" ? "Déclaration Préalable (DP)" : "Permis de Construire (PC)"}
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
                                {isEn ? "Cadastral Reference" : "Référence cadastrale"}
                            </p>
                            <p className="text-xs text-slate-700">{parcelRef}</p>
                        </div>
                        {/* Center */}
                        <div className="px-4 py-3 flex flex-col items-center justify-center">
                            <p className="text-base font-black text-slate-900">{"Échelle 1 : 2 500"}</p>
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
                        {isEn ? "Back to editor" : "← Retour à l'éditeur"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Placeholder helper ─────────────────────────────────────────────────────

function drawPlaceholder(
    doc: jsPDF,
    x: number,
    y: number,
    w: number,
    h: number,
    text: string
) {
    doc.setFillColor(248, 250, 252);
    doc.rect(x, y, w, h, "F");
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(9);
    doc.text(text, x + w / 2, y + h / 2, { align: "center" });
}
