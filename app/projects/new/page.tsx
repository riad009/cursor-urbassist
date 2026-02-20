"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navigation from "@/components/layout/Navigation";
import {
    MapPin,
    Loader2,
    Search,
    Shield,
    AlertTriangle,
    Check,
    Pencil,
    ArrowLeft,
    Layers,
    ChevronDown,
    Info,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { cn } from "@/lib/utils";
import { processProtections } from "@/lib/sup-classification";
import dynamic from "next/dynamic";

const ZoneMap = dynamic(
    () => import("@/components/dossier/ZoneMap").then((m) => m.ZoneMap),
    { ssr: false, loading: () => <div className="h-64 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 text-sm">Loading map…</div> }
);

const DOSSIER_STORAGE_KEY = "urbassist_dossier";

export default function NewProjectPage() {
    const { user, loading: authLoading } = useAuth();
    const { t } = useLanguage();
    const router = useRouter();

    const [newName, setNewName] = useState("");
    const [newAddress, setNewAddress] = useState("");
    const [creating, setCreating] = useState(false);
    const [addressQuery, setAddressQuery] = useState("");
    const [addressSuggestions, setAddressSuggestions] = useState<{ label: string; city: string; postcode: string; coordinates?: number[] }[]>([]);
    const [selectedAddress, setSelectedAddress] = useState<{ label: string; city: string; postcode: string; coordinates: number[] } | null>(null);
    const [parcels, setParcels] = useState<{ id: string; section: string; number: string; area: number; geometry?: unknown; commune?: string }[]>([]);
    const [selectedParcelIds, setSelectedParcelIds] = useState<string[]>([]);
    const [pluInfo, setPluInfo] = useState<{ zoneType: string | null; zoneName: string | null; pluType?: string | null } | null>(null);
    const [manualPluZone, setManualPluZone] = useState<string>("");
    const [showManualPluEdit, setShowManualPluEdit] = useState(false);
    const [zoneFeatures, setZoneFeatures] = useState<unknown[]>([]);
    const [protectedAreas, setProtectedAreas] = useState<{ name: string; type: string }[]>([]);
    const [heritageSummary, setHeritageSummary] = useState<{
        inHeritageZone: boolean; requiresABF: boolean;
        nearestMonument: { name: string; distance: number | null; type: "classé" | "inscrit" } | null;
        heritageTypes: string[]; detectedZones: { type: string; name: string; distance: number | null }[];
    } | null>(null);
    const [loadingAddress, setLoadingAddress] = useState(false);
    const [loadingCadastre, setLoadingCadastre] = useState(false);
    const [loadingPlu, setLoadingPlu] = useState(false);
    const [loadingProtectedAreas, setLoadingProtectedAreas] = useState(false);
    const [cadastreError, setCadastreError] = useState<string | null>(null);
    const [showSecondary, setShowSecondary] = useState(false);
    const [northAngleDegrees, setNorthAngleDegrees] = useState<number | null>(null);


    // When user clicks a surrounding skeleton parcel, add it to the sidebar list
    const handleViewportParcelClicked = React.useCallback((newParcels: typeof parcels) => {
        setParcels((prev) => {
            const ids = new Set(prev.map((p) => p.id));
            const toAdd = newParcels.filter((p) => !ids.has(p.id));
            if (toAdd.length === 0) return prev;
            return [...prev, ...toAdd];
        });
    }, []);

    // Pre-fill from dossier flow
    useEffect(() => {
        if (typeof window === "undefined") return;
        const fromDossier = new URLSearchParams(window.location.search).get("from") === "dossier";
        if (!fromDossier) return;
        try {
            const raw = sessionStorage.getItem(DOSSIER_STORAGE_KEY);
            if (!raw) return;
            const dossier = JSON.parse(raw) as {
                step1?: {
                    address?: string; city?: string; postcode?: string; coordinates?: number[];
                    parcels?: { id: string; section: string; number: string; area: number }[];
                    parcelIds?: string[]; pluZone?: string | null; pluName?: string | null;
                };
                step3?: { description?: string };
            };
            const step1 = dossier?.step1;
            const step3 = dossier?.step3;
            if (step1?.address && step1?.coordinates?.length) {
                setNewAddress(step1.address);
                setSelectedAddress({ label: step1.address, city: step1.city || "", postcode: step1.postcode || "", coordinates: step1.coordinates });
                if (Array.isArray(step1.parcels)) setParcels(step1.parcels);
                if (Array.isArray(step1.parcelIds)) setSelectedParcelIds(step1.parcelIds);
                if (step1.pluZone != null || step1.pluName != null) setPluInfo({ zoneType: step1.pluZone ?? null, zoneName: step1.pluName ?? null });
                if (step1.pluZone) setManualPluZone(step1.pluZone);
            }
            if (step3?.description) setNewName(step3.description.slice(0, 80));
        } catch { /* ignore */ }
    }, []);

    const searchAddress = useCallback(() => {
        if (!addressQuery.trim() || addressQuery.length < 4) { setAddressSuggestions([]); return; }
        setLoadingAddress(true);
        fetch("/api/address/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: addressQuery }) })
            .then((r) => r.json())
            .then((d) => setAddressSuggestions(d.results || []))
            .catch(() => setAddressSuggestions([]))
            .finally(() => setLoadingAddress(false));
    }, [addressQuery]);

    useEffect(() => { const t = setTimeout(searchAddress, 400); return () => clearTimeout(t); }, [addressQuery, searchAddress]);

    const selectAddress = useCallback((addr: { label: string; city: string; postcode: string; coordinates?: number[] }) => {
        const coords = addr.coordinates;
        if (!coords || coords.length < 2) return;
        setSelectedAddress({ ...addr, coordinates: coords });
        setNewAddress(addr.label);
        setAddressSuggestions([]);
        setLoadingCadastre(true); setLoadingPlu(true); setLoadingProtectedAreas(true);
        setCadastreError(null); setParcels([]); setPluInfo(null); setManualPluZone(""); setShowManualPluEdit(false); setZoneFeatures([]); setProtectedAreas([]); setHeritageSummary(null);

        // 1) CADASTRE
        fetch("/api/cadastre/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coordinates: coords, bufferMeters: 120 }) })
            .then(async (r) => { const d = await r.json(); if (!r.ok) { setCadastreError(d.error || "Failed"); return; } const list = (d.parcels || []) as { id: string; section: string; number: string; area: number; geometry?: unknown }[]; setParcels(list); setNorthAngleDegrees(typeof d.northAngleDegrees === "number" ? d.northAngleDegrees : null); if (d.source === "estimated") setCadastreError("Données estimées (API IGN indisponible)."); if (list.length > 0) setSelectedParcelIds([list[0].id]); })
            .catch(() => setCadastreError("Données cadastrales indisponibles."))
            .finally(() => setLoadingCadastre(false));

        // 2) PLU
        fetch("/api/plu-detection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coordinates: coords, address: addr.label }) })
            .then(async (r) => { if (!r.ok) return; const d = await r.json(); const plu = d.plu ?? {}; if (plu.zoneType || plu.zoneName) setPluInfo({ zoneType: plu.zoneType || null, zoneName: plu.zoneName || null, pluType: plu.pluType ?? null }); setZoneFeatures(Array.isArray(d.zoneFeatures) ? d.zoneFeatures : []); })
            .catch(() => { })
            .finally(() => setLoadingPlu(false));

        // 3) PROTECTED AREAS
        fetch("/api/protected-areas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coordinates: coords }) })
            .then(async (r) => { if (!r.ok) return; const d = await r.json(); setProtectedAreas(Array.isArray(d.areas) ? d.areas : []); if (d.heritageSummary) setHeritageSummary(d.heritageSummary); })
            .catch(() => { })
            .finally(() => setLoadingProtectedAreas(false));
    }, []);

    const createProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;
        setCreating(true);
        try {
            let projectType: string | undefined;
            try { const raw = sessionStorage.getItem(DOSSIER_STORAGE_KEY); const dossier = raw ? (JSON.parse(raw) as { step2?: { projectTypes?: string[] } }) : {}; const types = dossier?.step2?.projectTypes ?? []; if (types.includes("new_construction")) projectType = "construction"; else if (types.includes("existing_extension")) projectType = "extension"; else if (types.includes("outdoor")) projectType = "outdoor"; } catch { /* ignore */ }
            const parcelIds = selectedParcelIds.length > 0 ? selectedParcelIds : parcels.map((p) => p.id);
            const parcelArea = selectedParcelIds.length > 0 ? parcels.filter((p) => selectedParcelIds.includes(p.id)).reduce((s, p) => s + p.area, 0) : parcels.reduce((s, p) => s + p.area, 0) || parcels[0]?.area;
            const res = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName.trim(), description: newName.trim() || undefined, address: newAddress.trim() || undefined, municipality: selectedAddress?.city, coordinates: selectedAddress?.coordinates, parcelIds: parcelIds.length ? parcelIds : undefined, parcelArea, northAngle: northAngleDegrees != null ? northAngleDegrees : undefined, zoneType: manualPluZone.trim() || pluInfo?.zoneType || pluInfo?.zoneName, projectType: projectType || undefined, protectedAreas: protectedAreas.length > 0 ? protectedAreas.map((a) => ({ type: a.type, name: a.name, description: (a as { description?: string }).description, constraints: (a as { constraints?: unknown }).constraints, sourceUrl: (a as { sourceUrl?: string }).sourceUrl })) : undefined }) });
            const data = await res.json();
            if (data.project) { router.push(`/projects/${data.project.id}/authorization`); return; }
        } catch (err) { console.error(err); }
        setCreating(false);
    };

    const classified = useMemo(() => processProtections(protectedAreas), [protectedAreas]);

    if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
    if (!user) return <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4"><h1 className="text-2xl font-bold text-slate-900">{t("newProj.signIn")}</h1><Link href="/login" className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold">{t("newProj.signInBtn")}</Link></div>;

    const totalSelectedArea = parcels.filter((p) => selectedParcelIds.includes(p.id)).reduce((s, p) => s + p.area, 0);
    const hasWarning = classified.criticalItems.length > 0;

    return (
        <Navigation>
            <form onSubmit={createProject} className="min-h-screen">
                <div className="p-4 lg:p-6 max-w-[1600px] mx-auto space-y-4">

                    {/* ── Header with back + title ── */}
                    <div className="flex items-center gap-3 mb-2">
                        <Link href="/projects" className="p-2 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div className="flex-1 min-w-0">
                            <h1 className="text-xl font-bold text-slate-900">{t("newProj.title")}</h1>
                            <p className="text-sm text-slate-500">{t("newProj.subtitle")}</p>
                        </div>
                    </div>

                    {/* ── Address bar — full width, prominent ── */}
                    <div className="relative">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="md:col-span-2 relative">
                                <div className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                    <input
                                        type="text"
                                        value={selectedAddress ? newAddress : addressQuery}
                                        onChange={(e) => {
                                            const v = e.target.value; setAddressQuery(v); setNewAddress(v);
                                            if (selectedAddress) { setSelectedAddress(null); setPluInfo(null); setZoneFeatures([]); setParcels([]); setSelectedParcelIds([]); setProtectedAreas([]); setCadastreError(null); setNorthAngleDegrees(null); }
                                        }}
                                        onFocus={() => { if (selectedAddress) { setSelectedAddress(null); setPluInfo(null); setZoneFeatures([]); setParcels([]); setSelectedParcelIds([]); setProtectedAreas([]); setCadastreError(null); setNorthAngleDegrees(null); } }}
                                        className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-base"
                                        placeholder={t("newProj.searchPlaceholder")}
                                    />
                                    {(loadingAddress || (selectedAddress && loadingCadastre)) && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-400 animate-spin" />}
                                </div>
                                {addressSuggestions.length > 0 && (
                                    <div className="absolute z-20 top-full left-0 right-0 mt-1 rounded-xl bg-white border border-slate-200 overflow-hidden shadow-xl">
                                        {addressSuggestions.map((a, i) => (
                                            <button key={i} type="button" onClick={() => selectAddress({ label: a.label, city: a.city, postcode: a.postcode, coordinates: a.coordinates })} className="w-full px-4 py-3 text-left text-sm text-slate-900 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                                                <MapPin className="w-4 h-4 text-blue-500 shrink-0" /> <span className="truncate flex-1">{a.label}</span> <span className="text-slate-400 text-xs shrink-0">{a.postcode} {a.city}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <input
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                className="w-full px-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                                placeholder={t("newProj.projectName")}
                                required
                            />
                        </div>
                        {selectedAddress && (
                            <p className="flex items-center gap-2 mt-2 text-sm text-blue-400">
                                <MapPin className="w-3.5 h-3.5 shrink-0" />
                                {selectedAddress.label} — {selectedAddress.postcode} {selectedAddress.city}
                            </p>
                        )}
                    </div>

                    {/* ═══════════════════════════════════════════════════════════════
              MAIN CONTENT: Map (left) + Sidebar (right)
              ═══════════════════════════════════════════════════════════════ */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

                        {/* ── LEFT: Map (dominant) ── */}
                        <div className="lg:col-span-8 xl:col-span-9 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex flex-col h-[700px] shadow-sm">
                            <div className="flex-1 flex items-center justify-center">
                                {!selectedAddress ? (
                                    <div className="flex flex-col items-center justify-center gap-3 text-slate-500 p-8">
                                        <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center">
                                            <MapPin className="w-10 h-10 text-slate-300" />
                                        </div>
                                        <p className="text-sm text-center">{t("newProj.searchAbove").split("\n").map((line, i) => <React.Fragment key={i}>{line}{i === 0 && <br />}</React.Fragment>)}</p>
                                    </div>
                                ) : loadingCadastre ? (
                                    <div className="flex flex-col items-center justify-center gap-4 text-slate-400 w-full h-full relative">
                                        <div className="absolute inset-0 overflow-hidden">
                                            <div className="absolute inset-0 bg-slate-100">
                                                <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: `linear-gradient(rgba(148,163,184,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.5) 1px, transparent 1px)`, backgroundSize: '48px 48px' }} />
                                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-32 rounded-lg border-2 border-dashed border-blue-500/30 bg-blue-500/5 animate-pulse" />
                                            </div>
                                        </div>
                                        <div className="relative z-10 flex flex-col items-center gap-3">
                                            <MapPin className="w-10 h-10 text-blue-400 animate-bounce" />
                                            <p className="text-sm font-medium text-slate-600">{t("newProj.loadingParcels")}</p>
                                            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                                        </div>
                                    </div>
                                ) : (
                                    <ZoneMap
                                        center={{ lat: selectedAddress.coordinates[1], lng: selectedAddress.coordinates[0] }}
                                        parcels={parcels}
                                        selectedParcelIds={selectedParcelIds}
                                        onParcelSelect={(ids) => setSelectedParcelIds(ids)}
                                        onViewportParcelsLoaded={handleViewportParcelClicked}
                                        zoneFeatures={[]}
                                        pluZone={pluInfo?.zoneType ?? null}
                                        pluName={pluInfo?.zoneName ?? null}
                                        pluType={pluInfo?.pluType ?? null}
                                        showRegulationSidebar={false}
                                        className="h-full w-full"
                                    />
                                )}
                            </div>
                        </div>

                        {/* ── RIGHT: Sidebar panel ── */}
                        <div className="lg:col-span-4 xl:col-span-3 flex flex-col lg:h-[700px] gap-2.5">

                            {/* TOP: Regulation + Protections & Servitudes stacked */}
                            <div className="space-y-2.5 shrink-0">

                                {/* REGULATION — compact card */}
                                <div className="rounded-xl bg-white border border-slate-200 overflow-hidden shadow-sm">
                                    <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                                            <Layers className="w-3.5 h-3.5 text-blue-500" />
                                        </div>
                                        <p className="text-sm font-semibold text-slate-900">{t("newProj.zonePlu")}</p>
                                    </div>
                                    <div className="px-4 py-3">
                                        {!selectedAddress ? (
                                            <p className="text-xs text-slate-400 italic">Sélectionnez une adresse pour détecter la zone</p>
                                        ) : loadingPlu ? (
                                            <div className="space-y-2 animate-pulse">
                                                <div className="h-5 bg-slate-100 rounded-md w-24" />
                                                <div className="h-3 bg-slate-100 rounded w-16" />
                                            </div>
                                        ) : showManualPluEdit ? (
                                            <div className="space-y-2">
                                                <input type="text" value={manualPluZone} onChange={(e) => setManualPluZone(e.target.value)} placeholder="UB, UC, AU..." className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-xs placeholder-slate-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 transition-all" autoFocus />
                                                <button type="button" onClick={() => { setShowManualPluEdit(false); if (manualPluZone.trim()) setPluInfo({ zoneType: manualPluZone.trim(), zoneName: manualPluZone.trim(), pluType: null }); }} className="text-xs text-blue-500 hover:text-blue-600 font-medium">{t("newProj.savePlu")}</button>
                                            </div>
                                        ) : pluInfo?.zoneType || pluInfo?.zoneName || manualPluZone.trim() ? (
                                            <div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-sm font-bold border border-blue-100">{manualPluZone.trim() || pluInfo?.zoneType || pluInfo?.zoneName}</span>
                                                    <span className="text-xs text-slate-500 font-medium">{pluInfo?.pluType === "PLUi" ? "PLUi" : pluInfo?.pluType === "RNU" ? "RNU" : pluInfo?.pluType === "CC" ? "CC" : "PLU"}</span>
                                                </div>
                                                <button type="button" onClick={() => { setShowManualPluEdit(true); if (!manualPluZone && (pluInfo?.zoneType || pluInfo?.zoneName)) setManualPluZone(pluInfo.zoneType || pluInfo.zoneName || ""); }} className="text-[11px] text-slate-400 hover:text-slate-700 inline-flex items-center gap-1 mt-1.5 transition-colors"><Pencil className="w-3 h-3" /> {t("newProj.modify")}</button>
                                            </div>
                                        ) : (
                                            <p className="text-xs text-slate-400 italic">{t("newProj.notDetected")}</p>
                                        )}
                                    </div>
                                </div>

                                {/* PROTECTIONS & SERVITUDES */}
                                <div className="rounded-xl bg-white border border-slate-200 overflow-hidden flex flex-col shadow-sm max-h-[280px]">
                                    <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 shrink-0">
                                        <div className="w-6 h-6 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                                            <Shield className="w-3.5 h-3.5 text-amber-500" />
                                        </div>
                                        <p className="text-sm font-semibold text-slate-900 flex-1 truncate">{t("newProj.protectionsServitudes")}</p>
                                        {selectedAddress && !loadingProtectedAreas && (classified.criticalItems.length + classified.secondaryItems.length) > 0 && (
                                            <span className={cn("text-[10px] font-bold min-w-[22px] h-[22px] flex items-center justify-center rounded-full", hasWarning ? "bg-amber-100 text-amber-600" : "bg-blue-100 text-blue-600")}>
                                                {classified.criticalItems.reduce((s, i) => s + i.count, 0) + classified.secondaryItems.reduce((s, i) => s + i.count, 0)}
                                            </span>
                                        )}
                                    </div>
                                    <div className="px-4 py-3 overflow-y-auto flex-1 min-h-0">
                                        {!selectedAddress ? (
                                            <p className="text-xs text-slate-400 italic">Sélectionnez une adresse pour analyser les servitudes</p>
                                        ) : loadingProtectedAreas ? (
                                            <div className="space-y-2 animate-pulse">
                                                <div className="h-4 bg-slate-100 rounded-md w-full" />
                                                <div className="h-4 bg-slate-100 rounded-md w-3/4" />
                                            </div>
                                        ) : (classified.criticalItems.length + classified.secondaryItems.length) > 0 ? (
                                            <div className="space-y-2">

                                                {/* ── Heritage / ABF status banner — prominent ── */}
                                                {(() => {
                                                    const hasHeritage = classified.criticalItems.some(
                                                        (i) => i.type === "ABF" || i.type === "HERITAGE" ||
                                                            ["AC1", "AC2", "AC4"].some((c) => (i.categorie ?? "").startsWith(c))
                                                    );
                                                    if (!hasHeritage) return null;
                                                    const nm = heritageSummary?.nearestMonument;
                                                    return (
                                                        <div className="rounded-lg bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200/60 p-2.5 space-y-1.5">
                                                            <div className="flex items-center gap-1.5">
                                                                <AlertTriangle className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                                                                <p className="text-xs font-bold text-orange-600">{t("newProj.heritageProtected")}</p>
                                                            </div>
                                                            {nm && (
                                                                <div className="pl-5 space-y-1">
                                                                    <p className="text-[11px] text-orange-600 font-semibold truncate">
                                                                        🏛 {nm.name}
                                                                    </p>
                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                        {nm.distance != null && (
                                                                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-orange-100/80 text-orange-600 font-medium">
                                                                                à {nm.distance}m
                                                                            </span>
                                                                        )}
                                                                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-orange-100/80 text-orange-600 font-medium">
                                                                            {nm.type === "classé" ? "Classé" : "Inscrit"}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            <p className="text-[10px] text-orange-500 pl-5 leading-relaxed">{t("newProj.heritageAbfNote")}</p>
                                                            {heritageSummary && heritageSummary.heritageTypes.length > 0 && (
                                                                <div className="flex gap-1 pl-5 flex-wrap mt-0.5">
                                                                    {heritageSummary.heritageTypes.map((ht) => (
                                                                        <span key={ht} className="text-[8px] px-1.5 py-0.5 rounded-full bg-orange-100/80 text-orange-500 font-semibold">
                                                                            {ht.replace(/_/g, " ")}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()}

                                                {/* ── CRITICAL ITEMS — always visible ── */}
                                                {classified.criticalItems.map((item, idx) => {
                                                    const typeColor = item.type === "ABF" || (item.categorie ?? "").startsWith("AC") ? "bg-orange-400" : item.type === "FLOOD_ZONE" || (item.categorie ?? "").startsWith("PM") ? "bg-amber-400" : "bg-blue-400";
                                                    const typeBadgeBg = item.type === "ABF" || (item.categorie ?? "").startsWith("AC") ? "bg-orange-50 text-orange-500 border-orange-100" : item.type === "FLOOD_ZONE" || (item.categorie ?? "").startsWith("PM") ? "bg-amber-50 text-amber-500 border-amber-100" : "bg-blue-50 text-blue-500 border-blue-100";
                                                    return (
                                                        <div key={`crit-${idx}`} className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-slate-50/80 border border-slate-100 transition-colors">
                                                            <span className={`w-2 h-2 rounded-full shrink-0 ${typeColor}`} />
                                                            <p className="text-xs text-slate-700 font-medium truncate flex-1">{item.label}</p>
                                                            {item.count > 1 && <span className="text-[9px] text-slate-400 font-medium shrink-0">×{item.count}</span>}
                                                            <span className={`text-[8px] uppercase shrink-0 font-bold px-1.5 py-0.5 rounded-md border ${typeBadgeBg}`}>{item.type === "ABF" ? "ABF" : item.type === "FLOOD_ZONE" ? "RISQUE" : item.type === "HERITAGE" ? "PATRI" : item.categorie || item.type}</span>
                                                        </div>
                                                    );
                                                })}

                                                {/* ── SECONDARY ITEMS — collapsed by default ── */}
                                                {classified.secondaryItems.length > 0 && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowSecondary(!showSecondary); }}
                                                            className="w-full flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg text-[11px] text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors border border-dashed border-slate-200 mt-0.5"
                                                        >
                                                            <ChevronDown className={cn("w-3 h-3 transition-transform", showSecondary && "rotate-180")} />
                                                            <span className="font-medium">{showSecondary ? "Masquer" : "Voir"} {classified.secondaryItems.reduce((s, i) => s + i.count, 0)} {t("newProj.secondaryServitudes")}</span>
                                                        </button>
                                                        {showSecondary && classified.secondaryItems.map((item, idx) => (
                                                            <div key={`sec-${idx}`} className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors">
                                                                <Info className="w-3 h-3 text-slate-400 shrink-0" />
                                                                <p className="text-xs text-slate-600 truncate flex-1">{item.label}</p>
                                                                {item.count > 1 && <span className="text-[9px] text-slate-400 shrink-0">×{item.count}</span>}
                                                                <span className="text-[8px] text-slate-400 uppercase shrink-0 font-medium">{item.categorie || item.type}</span>
                                                            </div>
                                                        ))}
                                                    </>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 py-1">
                                                <div className="w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                                                    <Check className="w-3 h-3 text-emerald-500" />
                                                </div>
                                                <p className="text-xs text-emerald-600 font-medium">{t("newProj.noHeritageConstraint")}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* PARCELS — takes remaining space, scrollable internally */}
                            <div className="rounded-xl bg-white border border-slate-200 overflow-hidden flex flex-col flex-1 min-h-0 shadow-sm">
                                <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between shrink-0">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                                            <MapPin className="w-3.5 h-3.5 text-slate-500" />
                                        </div>
                                        <p className="text-sm font-semibold text-slate-900">{t("newProj.parcels")}</p>
                                    </div>
                                    {selectedAddress && !loadingCadastre && parcels.length > 0 && (
                                        <span className="text-xs text-slate-500 font-medium bg-slate-50 px-2.5 py-0.5 rounded-full">{parcels.length} {t("newProj.found")}</span>
                                    )}
                                </div>
                                <div className="p-2 flex-1 overflow-y-auto scrollbar-thin min-h-0">
                                    {!selectedAddress ? (
                                        <p className="text-xs text-slate-400 italic px-2 py-3">Sélectionnez une adresse pour charger les parcelles</p>
                                    ) : loadingCadastre ? (
                                        <div className="space-y-1.5 animate-pulse px-1">
                                            {[1, 2, 3].map((i) => (
                                                <div key={i} className="flex items-center gap-2 py-2 px-2.5 rounded-lg bg-slate-50">
                                                    <div className="w-3.5 h-3.5 rounded bg-slate-200" />
                                                    <div className="h-3.5 bg-slate-200 rounded flex-1" />
                                                    <div className="h-3.5 bg-slate-200 rounded w-12" />
                                                </div>
                                            ))}
                                        </div>
                                    ) : parcels.length > 0 ? (
                                        <>
                                            <div className="flex gap-1.5 mb-2 px-1">
                                                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedParcelIds(parcels.map((p) => p.id)); }} className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 font-medium transition-colors">{t("newProj.all")}</button>
                                                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedParcelIds([]); }} className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 font-medium transition-colors">{t("newProj.none")}</button>
                                            </div>
                                            {cadastreError && <p className="text-[10px] text-amber-500 mb-1.5 px-2 font-medium">{cadastreError}</p>}
                                            <div className="space-y-0.5">
                                                {parcels.map((p) => {
                                                    const selected = selectedParcelIds.includes(p.id);
                                                    const isMain = parcels[0]?.id === p.id;
                                                    const toggle = () => setSelectedParcelIds((prev) => prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]);
                                                    return (
                                                        <div key={p.id} role="button" tabIndex={0} aria-pressed={selected}
                                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }}
                                                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}
                                                            className={cn(
                                                                "flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-all cursor-pointer border",
                                                                selected ? "bg-blue-50/80 text-blue-700 border-blue-200" : "bg-transparent text-slate-600 border-transparent hover:bg-slate-50 hover:border-slate-200"
                                                            )}
                                                        >
                                                            <span className={cn("w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors", selected ? "border-blue-500 bg-blue-500" : "border-slate-300")}>
                                                                {selected && <Check className="w-2.5 h-2.5 text-white" />}
                                                            </span>
                                                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[9px] font-bold text-slate-500 uppercase shrink-0 min-w-[28px] text-center">{p.section}</span>
                                                            <span className="font-medium text-slate-800 flex-1 truncate">{isMain ? "★ " : ""}N°{p.number}</span>
                                                            <span className="tabular-nums text-slate-400 shrink-0 font-medium">{p.area.toLocaleString()} m²</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </>
                                    ) : (
                                        <p className="text-xs text-slate-400 py-3 text-center italic">{t("newProj.noParcel")}</p>
                                    )}
                                </div>
                                {/* Total surface — pinned at bottom of parcels */}
                                {selectedParcelIds.length > 0 && (
                                    <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between shrink-0 bg-gradient-to-r from-slate-50 to-white">
                                        <span className="text-xs text-slate-500 font-medium">{selectedParcelIds.length} {t("newProj.selected")}{selectedParcelIds.length > 1 ? "s" : ""}</span>
                                        <span className="text-base font-bold text-emerald-600 tabular-nums">{totalSelectedArea.toLocaleString()} m²</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ── Bottom action bar ── */}
                    <div className="flex items-center gap-3 py-3 border-t border-slate-200 sticky bottom-0 bg-white/90 backdrop-blur-lg -mx-4 px-4 lg:-mx-6 lg:px-6">
                        <Link href="/projects" className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-medium hover:bg-slate-200 transition-colors inline-flex items-center gap-2 border border-slate-200">
                            <ArrowLeft className="w-4 h-4" /> {t("newProj.back")}
                        </Link>
                        <div className="flex-1" />
                        {selectedParcelIds.length > 0 && (
                            <span className="text-sm text-slate-400 hidden sm:inline">
                                {selectedParcelIds.length} {selectedParcelIds.length > 1 ? t("newProj.parcels_plural") : t("newProj.parcel")} • <span className="text-emerald-600 font-semibold">{totalSelectedArea.toLocaleString()} m²</span>
                            </span>
                        )}
                        <button
                            type="submit"
                            disabled={creating || !newName.trim() || (parcels.length > 0 && selectedParcelIds.length === 0)}
                            className="flex-1 max-w-md py-3.5 rounded-full bg-indigo-600 text-white font-semibold disabled:opacity-40 hover:bg-indigo-700 hover:shadow-xl hover:shadow-indigo-500/30 transition-all text-base tracking-wide"
                        >
                            {creating ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t("newProj.creating")}</span> : (t("newProj.createProject") === "Create Project" ? "Next: What is your project?" : "Suivant : Quel est votre projet ?")}
                        </button>
                    </div>
                </div>
            </form>
        </Navigation>
    );
}
