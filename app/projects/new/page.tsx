"use client";

import React, { useEffect, useState, useCallback } from "react";
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
    ChevronUp,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

const ZoneMap = dynamic(
    () => import("@/components/dossier/ZoneMap").then((m) => m.ZoneMap),
    { ssr: false, loading: () => <div className="h-64 rounded-xl bg-slate-800/50 border border-white/10 flex items-center justify-center text-slate-500 text-sm">Loading map…</div> }
);

const DOSSIER_STORAGE_KEY = "urbassist_dossier";

export default function NewProjectPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    const [newName, setNewName] = useState("");
    const [newAddress, setNewAddress] = useState("");
    const [creating, setCreating] = useState(false);
    const [addressQuery, setAddressQuery] = useState("");
    const [addressSuggestions, setAddressSuggestions] = useState<{ label: string; city: string; postcode: string; coordinates?: number[] }[]>([]);
    const [selectedAddress, setSelectedAddress] = useState<{ label: string; city: string; postcode: string; coordinates: number[] } | null>(null);
    const [parcels, setParcels] = useState<{ id: string; section: string; number: string; area: number; geometry?: unknown }[]>([]);
    const [selectedParcelIds, setSelectedParcelIds] = useState<string[]>([]);
    const [pluInfo, setPluInfo] = useState<{ zoneType: string | null; zoneName: string | null; pluType?: string | null } | null>(null);
    const [manualPluZone, setManualPluZone] = useState<string>("");
    const [showManualPluEdit, setShowManualPluEdit] = useState(false);
    const [zoneFeatures, setZoneFeatures] = useState<unknown[]>([]);
    const [protectedAreas, setProtectedAreas] = useState<{ name: string; type: string }[]>([]);
    const [loadingAddress, setLoadingAddress] = useState(false);
    const [loadingCadastre, setLoadingCadastre] = useState(false);
    const [loadingPlu, setLoadingPlu] = useState(false);
    const [loadingProtectedAreas, setLoadingProtectedAreas] = useState(false);
    const [cadastreError, setCadastreError] = useState<string | null>(null);
    const [northAngleDegrees, setNorthAngleDegrees] = useState<number | null>(null);
    const [showAllProtected, setShowAllProtected] = useState(false);

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
        setCadastreError(null); setParcels([]); setPluInfo(null); setManualPluZone(""); setShowManualPluEdit(false); setZoneFeatures([]); setProtectedAreas([]);

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
            .then(async (r) => { if (!r.ok) return; const d = await r.json(); setProtectedAreas(Array.isArray(d.areas) ? d.areas : []); })
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

    if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
    if (!user) return <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4"><h1 className="text-2xl font-bold text-white">Connectez-vous</h1><Link href="/login" className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold">Se connecter</Link></div>;

    const totalSelectedArea = parcels.filter((p) => selectedParcelIds.includes(p.id)).reduce((s, p) => s + p.area, 0);
    const hasWarning = protectedAreas.some((a: { type: string }) => ["ABF", "FLOOD_ZONE", "HERITAGE"].includes(a.type));
    const visibleProtected = showAllProtected ? protectedAreas : protectedAreas.slice(0, 2);

    return (
        <Navigation>
            <form onSubmit={createProject} className="min-h-screen">
                <div className="p-4 lg:p-6 max-w-[1600px] mx-auto space-y-4">

                    {/* ── Header with back + title ── */}
                    <div className="flex items-center gap-3 mb-2">
                        <Link href="/projects" className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div className="flex-1 min-w-0">
                            <h1 className="text-xl font-bold text-white">Nouveau Projet</h1>
                            <p className="text-sm text-slate-500">Recherchez une adresse pour charger les données cadastrales</p>
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
                                        className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-slate-800/80 border border-white/10 text-white placeholder-slate-500 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all text-base"
                                        placeholder="Rechercher une adresse — ex: 12 Rue de la Gare, 38000 Grenoble"
                                    />
                                    {(loadingAddress || (selectedAddress && loadingCadastre)) && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-400 animate-spin" />}
                                </div>
                                {addressSuggestions.length > 0 && (
                                    <div className="absolute z-20 top-full left-0 right-0 mt-1 rounded-xl bg-slate-800 border border-white/10 overflow-hidden shadow-2xl">
                                        {addressSuggestions.map((a, i) => (
                                            <button key={i} type="button" onClick={() => selectAddress({ label: a.label, city: a.city, postcode: a.postcode, coordinates: a.coordinates })} className="w-full px-4 py-3 text-left text-sm text-white hover:bg-slate-700/80 flex items-center gap-3 transition-colors">
                                                <MapPin className="w-4 h-4 text-blue-400 shrink-0" /> <span className="truncate flex-1">{a.label}</span> <span className="text-slate-500 text-xs shrink-0">{a.postcode} {a.city}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <input
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                className="w-full px-4 py-3.5 rounded-xl bg-slate-800/80 border border-white/10 text-white placeholder-slate-500 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all"
                                placeholder="Nom du projet"
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
              Map is dominant — 3/4 of the width
              ═══════════════════════════════════════════════════════════════ */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

                        {/* ── LEFT: Map (dominant) ── */}
                        <div className="lg:col-span-8 xl:col-span-9 rounded-xl overflow-hidden border border-white/10 bg-slate-900 flex flex-col h-[520px]">
                            <div className="flex-1 flex items-center justify-center">
                                {!selectedAddress ? (
                                    <div className="flex flex-col items-center justify-center gap-3 text-slate-500 p-8">
                                        <div className="w-20 h-20 rounded-2xl bg-slate-800/80 flex items-center justify-center">
                                            <MapPin className="w-10 h-10 text-slate-600" />
                                        </div>
                                        <p className="text-sm text-center">Recherchez une adresse ci-dessus<br />pour afficher la carte</p>
                                    </div>
                                ) : loadingCadastre ? (
                                    <div className="flex flex-col items-center justify-center gap-4 text-slate-400 w-full h-full relative">
                                        <div className="absolute inset-0 overflow-hidden">
                                            <div className="absolute inset-0 bg-slate-800">
                                                <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: `linear-gradient(rgba(148,163,184,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.5) 1px, transparent 1px)`, backgroundSize: '48px 48px' }} />
                                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-32 rounded-lg border-2 border-dashed border-blue-500/30 bg-blue-500/5 animate-pulse" />
                                            </div>
                                        </div>
                                        <div className="relative z-10 flex flex-col items-center gap-3">
                                            <MapPin className="w-10 h-10 text-blue-400 animate-bounce" />
                                            <p className="text-sm font-medium text-slate-300">Chargement des parcelles…</p>
                                            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                                        </div>
                                    </div>
                                ) : (
                                    <ZoneMap
                                        center={{ lat: selectedAddress.coordinates[1], lng: selectedAddress.coordinates[0] }}
                                        parcels={parcels}
                                        selectedParcelIds={selectedParcelIds}
                                        onParcelSelect={(ids) => setSelectedParcelIds(ids)}
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
                        <div className="lg:col-span-4 xl:col-span-3 space-y-3 overflow-y-auto lg:h-[520px]">

                            {/* PARCELS */}
                            <div className="rounded-xl bg-slate-800/40 border border-white/10 overflow-hidden">
                                <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                                    <p className="text-sm font-semibold text-white">Parcelles</p>
                                    {selectedAddress && !loadingCadastre && parcels.length > 0 && (
                                        <span className="text-xs text-slate-500">{parcels.length} trouvées</span>
                                    )}
                                </div>
                                <div className="p-3">
                                    {(!selectedAddress || loadingCadastre) ? (
                                        <div className="space-y-2 animate-pulse">
                                            {[1, 2, 3].map((i) => (
                                                <div key={i} className="flex items-center gap-3 py-2 px-2 rounded-lg bg-slate-700/30">
                                                    <div className="w-3 h-3 rounded bg-slate-700" />
                                                    <div className="h-3 bg-slate-700 rounded flex-1" />
                                                    <div className="h-3 bg-slate-700 rounded w-10" />
                                                </div>
                                            ))}
                                        </div>
                                    ) : parcels.length > 0 ? (
                                        <>
                                            <div className="flex gap-1.5 mb-2">
                                                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedParcelIds(parcels.map((p) => p.id)); }} className="text-[11px] px-2 py-1 rounded-md bg-slate-700/60 text-slate-300 hover:bg-slate-600 border border-white/5">Tout</button>
                                                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedParcelIds([]); }} className="text-[11px] px-2 py-1 rounded-md bg-slate-700/60 text-slate-300 hover:bg-slate-600 border border-white/5">Aucune</button>
                                            </div>
                                            {cadastreError && <p className="text-[11px] text-amber-400 mb-2">{cadastreError}</p>}
                                            <div className="space-y-1 max-h-[240px] overflow-y-auto scrollbar-thin">
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
                                                                selected ? "bg-amber-500/15 text-amber-200 border-amber-500/30" : "bg-transparent text-slate-400 border-transparent hover:bg-slate-700/40 hover:border-white/5"
                                                            )}
                                                        >
                                                            <span className={cn("w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0", selected ? "border-amber-400 bg-amber-500/20" : "border-slate-600")}>
                                                                {selected && <Check className="w-2 h-2 text-amber-400" />}
                                                            </span>
                                                            <span className="px-1 py-0.5 rounded bg-slate-700/80 text-[9px] font-bold text-slate-400 uppercase shrink-0">{p.section}</span>
                                                            <span className="font-medium text-slate-200 flex-1">{isMain ? "★ " : ""}N°{p.number}</span>
                                                            <span className="tabular-nums text-slate-500">{p.area.toLocaleString()} m²</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            {/* Total */}
                                            {selectedParcelIds.length > 0 && (
                                                <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between px-1">
                                                    <span className="text-[11px] text-slate-500">{selectedParcelIds.length} sélectionnée{selectedParcelIds.length > 1 ? "s" : ""}</span>
                                                    <span className="text-sm font-bold text-emerald-400 tabular-nums">{totalSelectedArea.toLocaleString()} m²</span>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <p className="text-xs text-slate-500 py-3 text-center">Aucune parcelle trouvée</p>
                                    )}
                                </div>
                            </div>

                            {/* REGULATION */}
                            <div className="rounded-xl bg-slate-800/40 border border-white/10 overflow-hidden">
                                <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
                                    <Layers className="w-4 h-4 text-blue-400" />
                                    <p className="text-sm font-semibold text-white">Réglementation</p>
                                </div>
                                <div className="p-4">
                                    {!selectedAddress || loadingPlu ? (
                                        <div className="space-y-2 animate-pulse">
                                            <div className="h-4 bg-slate-700 rounded w-2/3" />
                                            <div className="h-3 bg-slate-700 rounded w-1/2" />
                                        </div>
                                    ) : showManualPluEdit ? (
                                        <div className="space-y-2">
                                            <input type="text" value={manualPluZone} onChange={(e) => setManualPluZone(e.target.value)} placeholder="UB, UC, AU..." className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-white/10 text-white text-sm placeholder-slate-500" autoFocus />
                                            <button type="button" onClick={() => { setShowManualPluEdit(false); if (manualPluZone.trim()) setPluInfo({ zoneType: manualPluZone.trim(), zoneName: manualPluZone.trim(), pluType: null }); }} className="text-xs text-blue-400 hover:text-blue-300">Enregistrer</button>
                                        </div>
                                    ) : pluInfo?.zoneType || pluInfo?.zoneName || manualPluZone.trim() ? (
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="px-2 py-1 rounded-md bg-blue-500/20 text-blue-400 text-sm font-bold">{manualPluZone.trim() || pluInfo?.zoneType || pluInfo?.zoneName}</span>
                                                <span className="text-[11px] text-slate-500">{pluInfo?.pluType === "PLUi" ? "PLU intercommunal" : pluInfo?.pluType === "RNU" ? "RNU" : pluInfo?.pluType === "CC" ? "Carte Communale" : "PLU"}</span>
                                            </div>
                                            <button type="button" onClick={() => { setShowManualPluEdit(true); if (!manualPluZone && (pluInfo?.zoneType || pluInfo?.zoneName)) setManualPluZone(pluInfo.zoneType || pluInfo.zoneName || ""); }} className="text-[11px] text-slate-500 hover:text-white inline-flex items-center gap-1 mt-1"><Pencil className="w-3 h-3" /> Modifier</button>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-slate-400">Non détectée — possiblement sous RNU</p>
                                    )}
                                </div>
                            </div>

                            {/* PROTECTED AREAS */}
                            <div className="rounded-xl bg-slate-800/40 border border-white/10 overflow-hidden">
                                <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
                                    <Shield className="w-4 h-4 text-amber-400" />
                                    <p className="text-sm font-semibold text-white flex-1">Zones protégées</p>
                                    {selectedAddress && !loadingProtectedAreas && protectedAreas.length > 0 && (
                                        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", hasWarning ? "bg-amber-500/20 text-amber-400" : "bg-blue-500/20 text-blue-400")}>
                                            {protectedAreas.length}
                                        </span>
                                    )}
                                </div>
                                <div className="p-3">
                                    {!selectedAddress || loadingProtectedAreas ? (
                                        <div className="space-y-2 animate-pulse">
                                            <div className="h-4 bg-slate-700 rounded w-full" />
                                            <div className="h-3 bg-slate-700 rounded w-2/3" />
                                        </div>
                                    ) : protectedAreas.length > 0 ? (
                                        <div className="space-y-1.5">
                                            {hasWarning && (
                                                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 flex items-start gap-2 mb-2">
                                                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                                    <p className="text-[11px] text-amber-200">Contraintes détectées — des autorisations supplémentaires peuvent s&apos;appliquer.</p>
                                                </div>
                                            )}
                                            {visibleProtected.map((area: { type: string; name: string; severity?: string; sourceUrl?: string | null; description?: string }, idx: number) => {
                                                const sevDot = area.severity === "high" ? "bg-red-400" : area.severity === "medium" ? "bg-amber-400" : "bg-blue-400";
                                                const typeLabel = area.type === "ABF" ? "ABF – Monuments historiques"
                                                    : area.type === "SUP" ? "Servitude d'utilité publique"
                                                        : area.type === "PRESCRIPTION" ? "Prescription PLU"
                                                            : area.type === "FLOOD_ZONE" ? "Zone inondable"
                                                                : area.type === "HERITAGE" ? "Site patrimonial"
                                                                    : area.type === "SEISMIC" ? "Zone sismique"
                                                                        : area.type;
                                                return (
                                                    <div key={idx} className="flex items-start gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-700/30 transition-colors">
                                                        <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${sevDot}`} />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-medium text-slate-300 truncate">{area.name}</p>
                                                            <p className="text-[10px] text-slate-500 uppercase tracking-wide">{typeLabel}</p>
                                                        </div>
                                                        {area.sourceUrl && <a href={area.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:text-blue-300 shrink-0">↗</a>}
                                                    </div>
                                                );
                                            })}
                                            {protectedAreas.length > 2 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setShowAllProtected(!showAllProtected)}
                                                    className="w-full text-center text-[11px] text-blue-400 hover:text-blue-300 py-1.5 flex items-center justify-center gap-1"
                                                >
                                                    {showAllProtected ? <><ChevronUp className="w-3 h-3" /> Réduire</> : <><ChevronDown className="w-3 h-3" /> Voir les {protectedAreas.length - 2} autres</>}
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-slate-400 py-1">Réglementation générale de construction</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Bottom action bar ── */}
                    <div className="flex items-center gap-3 py-3 border-t border-white/10 sticky bottom-0 bg-slate-950/90 backdrop-blur-lg -mx-4 px-4 lg:-mx-6 lg:px-6">
                        <Link href="/projects" className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-medium hover:bg-slate-700 transition-colors inline-flex items-center gap-2 border border-white/10">
                            <ArrowLeft className="w-4 h-4" /> Retour
                        </Link>
                        <div className="flex-1" />
                        {selectedParcelIds.length > 0 && (
                            <span className="text-sm text-slate-400 hidden sm:inline">
                                {selectedParcelIds.length} parcelle{selectedParcelIds.length > 1 ? "s" : ""} • <span className="text-emerald-400 font-semibold">{totalSelectedArea.toLocaleString()} m²</span>
                            </span>
                        )}
                        <button
                            type="submit"
                            disabled={creating || !newName.trim() || (parcels.length > 0 && selectedParcelIds.length === 0)}
                            className="px-8 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold disabled:opacity-40 hover:shadow-lg hover:shadow-purple-500/20 transition-all text-base"
                        >
                            {creating ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Création…</span> : "Créer le projet"}
                        </button>
                    </div>
                </div>
            </form>
        </Navigation>
    );
}
