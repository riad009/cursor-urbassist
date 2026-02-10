"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Navigation from "@/components/layout/Navigation";
import {
  FolderKanban,
  Plus,
  MapPin,
  FileText,
  Loader2,
  Trash2,
  ArrowRight,
  Search,
  ChevronDown,
  Shield,
  AlertTriangle,
  Check,
  CheckSquare,
  Square,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

const ZoneMap = dynamic(
  () => import("@/components/dossier/ZoneMap").then((m) => m.ZoneMap),
  { ssr: false, loading: () => <div className="h-64 rounded-xl bg-slate-800/50 border border-white/10 flex items-center justify-center text-slate-500 text-sm">Loading map…</div> }
);

interface Project {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  status: string;
  updatedAt: string;
  regulatoryAnalysis?: { id: string; zoneType: string | null } | null;
  _count?: { documents: number };
}

const DOSSIER_STORAGE_KEY = "urbassist_dossier";

export default function ProjectsPage() {
  const { user, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [creating, setCreating] = useState(false);
  const [addressQuery, setAddressQuery] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<{ label: string; city: string; postcode: string; coordinates?: number[] }[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<{ label: string; city: string; postcode: string; coordinates: number[] } | null>(null);
  const [parcels, setParcels] = useState<{ id: string; section: string; number: string; area: number; geometry?: unknown }[]>([]);
  const [selectedParcelIds, setSelectedParcelIds] = useState<string[]>([]);
  const [pluInfo, setPluInfo] = useState<{ zoneType: string | null; zoneName: string | null; pluType?: string | null } | null>(null);
  const [zoneFeatures, setZoneFeatures] = useState<unknown[]>([]);
  const [protectedAreas, setProtectedAreas] = useState<{ name: string; type: string }[]>([]);
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [loadingCadastre, setLoadingCadastre] = useState(false);
  const [loadingPlu, setLoadingPlu] = useState(false);
  const [cadastreError, setCadastreError] = useState<string | null>(null);
  const [northAngleDegrees, setNorthAngleDegrees] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    fetch("/api/projects", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setProjects(data.projects || []))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [user]);

  // Pre-fill from dossier flow (step1 = address + parcels, step2 = project types, step3 = description)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromDossier = new URLSearchParams(window.location.search).get("from") === "dossier";
    if (!fromDossier) return;
    try {
      const raw = sessionStorage.getItem(DOSSIER_STORAGE_KEY);
      if (!raw) return;
      const dossier = JSON.parse(raw) as {
        step1?: {
          address?: string;
          city?: string;
          postcode?: string;
          coordinates?: number[];
          parcels?: { id: string; section: string; number: string; area: number }[];
          parcelIds?: string[];
          pluZone?: string | null;
          pluName?: string | null;
        };
        step3?: { description?: string };
      };
      const step1 = dossier?.step1;
      const step3 = dossier?.step3;
      if (step1?.address && step1?.coordinates?.length) {
        setShowNewModal(true);
        setNewAddress(step1.address);
        setSelectedAddress({
          label: step1.address,
          city: step1.city || "",
          postcode: step1.postcode || "",
          coordinates: step1.coordinates,
        });
        if (Array.isArray(step1.parcels)) setParcels(step1.parcels);
        if (Array.isArray(step1.parcelIds)) setSelectedParcelIds(step1.parcelIds);
        if (step1.pluZone != null || step1.pluName != null) setPluInfo({ zoneType: step1.pluZone ?? null, zoneName: step1.pluName ?? null });
      }
      if (step1 || step3?.description) {
        setShowNewModal(true);
        if (typeof step3?.description === "string" && step3.description.trim()) setNewName(step3.description.slice(0, 80));
      }
    } catch {
      // ignore
    }
  }, []);

  const searchAddress = useCallback(() => {
    if (!addressQuery.trim() || addressQuery.length < 4) {
      setAddressSuggestions([]);
      return;
    }
    setLoadingAddress(true);
    fetch("/api/address/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: addressQuery }),
    })
      .then((r) => r.json())
      .then((d) => setAddressSuggestions(d.results || []))
      .catch(() => setAddressSuggestions([]))
      .finally(() => setLoadingAddress(false));
  }, [addressQuery]);

  useEffect(() => {
    const t = setTimeout(searchAddress, 400);
    return () => clearTimeout(t);
  }, [addressQuery, searchAddress]);

  const selectAddress = useCallback((addr: { label: string; city: string; postcode: string; coordinates?: number[] }) => {
    const coords = addr.coordinates;
    if (!coords || coords.length < 2) return;
    setSelectedAddress({ ...addr, coordinates: coords });
    setNewAddress(addr.label);
    setAddressSuggestions([]);
    setLoadingCadastre(true);
    setLoadingPlu(true);
    setCadastreError(null);
    setParcels([]);
    setPluInfo(null);
    setZoneFeatures([]);
    setProtectedAreas([]);
    fetch("/api/address/geo-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates: coords }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) {
          setCadastreError(d.error || "Failed to load location data");
          setParcels([]);
          setNorthAngleDegrees(null);
          setLoadingCadastre(false);
          setLoadingPlu(false);
          return;
        }
        const list = (d.parcels || []) as { id: string; section: string; number: string; area: number; geometry?: unknown; coordinates?: number[] }[];
        setParcels(list);
        setNorthAngleDegrees(typeof d.northAngleDegrees === "number" ? d.northAngleDegrees : null);
        if (d.cadastreError) setCadastreError(d.cadastreError);
        if (list.length > 0) {
          setSelectedParcelIds([]);
        }
        const plu = d.plu ?? {};
        if (plu.zoneType || plu.zoneName) setPluInfo({ zoneType: plu.zoneType || null, zoneName: plu.zoneName || null, pluType: plu.pluType ?? null });
        setZoneFeatures(Array.isArray(d.zoneFeatures) ? d.zoneFeatures : []);
        setProtectedAreas(Array.isArray(d.protectedAreas) ? d.protectedAreas : []);
      })
      .catch(() => {
        setCadastreError("Location data unavailable. You can still create the project with the address.");
        setParcels([]);
      })
      .finally(() => {
        setLoadingCadastre(false);
        setLoadingPlu(false);
      });
  }, []);

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      let projectType: string | undefined;
      try {
        const raw = sessionStorage.getItem(DOSSIER_STORAGE_KEY);
        const dossier = raw ? (JSON.parse(raw) as { step2?: { projectTypes?: string[] } }) : {};
        const types = dossier?.step2?.projectTypes ?? [];
        if (types.includes("new_construction")) projectType = "construction";
        else if (types.includes("existing_extension")) projectType = "extension";
        else if (types.includes("outdoor")) projectType = "outdoor";
      } catch {
        // ignore
      }
      const parcelIds = selectedParcelIds.length > 0 ? selectedParcelIds : parcels.map((p) => p.id);
      const parcelArea = selectedParcelIds.length > 0
        ? parcels.filter((p) => selectedParcelIds.includes(p.id)).reduce((sum, p) => sum + p.area, 0)
        : parcels.reduce((sum, p) => sum + p.area, 0) || parcels[0]?.area;
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newName.trim() || undefined,
          address: newAddress.trim() || undefined,
          municipality: selectedAddress?.city,
          coordinates: selectedAddress?.coordinates,
          parcelIds: parcelIds.length ? parcelIds : undefined,
          parcelArea,
          northAngle: northAngleDegrees != null ? northAngleDegrees : undefined,
          zoneType: pluInfo?.zoneType || pluInfo?.zoneName,
          projectType: projectType || undefined,
          protectedAreas: protectedAreas.length > 0 ? protectedAreas.map((a) => ({ type: a.type, name: a.name, description: (a as { description?: string }).description, constraints: (a as { constraints?: unknown }).constraints, sourceUrl: (a as { sourceUrl?: string }).sourceUrl })) : undefined,
        }),
      });
      const data = await res.json();
      if (data.project) {
        setProjects((p) => [data.project, ...p]);
        setShowNewModal(false);
        setNewName("");
        setNewAddress("");
        setSelectedAddress(null);
        setParcels([]);
        setSelectedParcelIds([]);
      setPluInfo(null);
      setZoneFeatures([]);
      setProtectedAreas([]);
      setNorthAngleDegrees(null);
      }
    } catch (err) {
      console.error(err);
    }
    setCreating(false);
  };

  const deleteProject = async (id: string) => {
    if (!confirm("Delete this project?")) return;
    try {
      await fetch(`/api/projects/${id}`, { method: "DELETE" });
      setProjects((p) => p.filter((x) => x.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <h1 className="text-2xl font-bold text-white">Sign in to view projects</h1>
        <Link
          href="/login"
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <FolderKanban className="w-8 h-8 text-blue-400" />
              Projects
            </h1>
            <p className="text-slate-400 mt-1">
              Manage your construction projects • {user.credits} credits
            </p>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:shadow-lg hover:shadow-purple-500/25"
          >
            <Plus className="w-5 h-5" />
            New Project
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16 rounded-2xl bg-slate-800/30 border border-white/10">
            <FolderKanban className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">No projects yet</h2>
            <p className="text-slate-400 mb-6">Create your first project to get started</p>
            <button
              onClick={() => setShowNewModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold"
            >
              <Plus className="w-5 h-5" />
              Create Project
            </button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                className="group rounded-xl bg-slate-800/50 border border-white/10 p-5 hover:border-white/20 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                    <MapPin className="w-6 h-6 text-blue-400" />
                  </div>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      project.status === "COMPLETED"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-blue-500/20 text-blue-400"
                    }`}
                  >
                    {project.status}
                  </span>
                </div>
                <h3 className="font-semibold text-white mb-1">{project.name}</h3>
                {project.address && (
                  <p className="text-sm text-slate-500 mb-3 truncate">{project.address}</p>
                )}
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-4">
                  {project.regulatoryAnalysis && (
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      PLU analyzed
                    </span>
                  )}
                  {project._count?.documents ? (
                    <span>{project._count.documents} documents</span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/projects/${project.id}`}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-500/20 text-blue-400 font-medium hover:bg-blue-500/30"
                    >
                      Dashboard <ArrowRight className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => deleteProject(project.id)}
                      className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <Link
                    href={`/editor?project=${project.id}`}
                    className="text-center text-sm text-slate-500 hover:text-slate-300 py-1"
                  >
                    Open site plan →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {showNewModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-slate-900 rounded-2xl border border-white/10 w-full max-w-6xl my-8 shadow-xl">
              <div className="flex items-start justify-between p-6 pb-4 border-b border-white/10">
                <div>
                  <h2 className="text-2xl font-bold text-white">New Project</h2>
                  <p className="text-slate-400 mt-1">Enter the project address first to load parcels and PLU zone.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={createProject} className="p-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <label className="block text-sm font-medium text-slate-400 mb-2">Project address</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        value={selectedAddress ? newAddress : addressQuery}
                        onChange={(e) => {
                          const v = e.target.value;
                          setAddressQuery(v);
                          setNewAddress(v);
                          if (selectedAddress) {
                            setSelectedAddress(null);
                            setPluInfo(null);
                            setZoneFeatures([]);
                            setParcels([]);
                            setSelectedParcelIds([]);
                            setProtectedAreas([]);
                            setCadastreError(null);
                            setNorthAngleDegrees(null);
                          }
                        }}
                        onFocus={() => {
                          if (selectedAddress) {
                            setSelectedAddress(null);
                            setPluInfo(null);
                            setZoneFeatures([]);
                            setParcels([]);
                            setSelectedParcelIds([]);
                            setProtectedAreas([]);
                            setCadastreError(null);
                            setNorthAngleDegrees(null);
                          }
                        }}
                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-800 border border-white/10 text-white placeholder-slate-500"
                        placeholder="123 Rue Example, 06000 Nice"
                      />
                      {(loadingAddress || (selectedAddress && (loadingCadastre || loadingPlu))) && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
                      )}
                    </div>
                    {addressSuggestions.length > 0 && (
                      <div className="absolute z-20 top-full left-0 right-0 mt-1 rounded-xl bg-slate-800 border border-white/10 overflow-hidden shadow-xl">
                        {addressSuggestions.map((a, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => selectAddress({
                              label: a.label,
                              city: a.city,
                              postcode: a.postcode,
                              coordinates: a.coordinates,
                            })}
                            className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-slate-700 flex items-center gap-2"
                          >
                            <MapPin className="w-4 h-4 text-slate-500 shrink-0" />
                            <span className="truncate">{a.label}</span>
                            <span className="text-slate-500 text-xs shrink-0">{a.postcode} {a.city}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedAddress && (
                      <p className="flex items-center gap-2 mt-2 text-sm text-slate-300">
                        <MapPin className="w-4 h-4 text-blue-400 shrink-0" />
                        {selectedAddress.label} — {selectedAddress.postcode} {selectedAddress.city}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Project name</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-white/10 text-white placeholder-slate-500"
                      placeholder="e.g. Villa Méditerranée"
                      required
                    />
                  </div>
                </div>

                {/* Preload: always show three info cards — skeleton when no address or loading, real when loaded */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl bg-slate-800/80 border border-white/10 p-4">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-slate-500" /> PLU Zone
                    </p>
                    {!selectedAddress || loadingCadastre || loadingPlu ? (
                      <div className="space-y-2 animate-pulse">
                        <div className="h-4 bg-slate-700 rounded w-3/4" />
                        <div className="h-3 bg-slate-700 rounded w-1/2" />
                      </div>
                    ) : pluInfo?.zoneType || pluInfo?.zoneName ? (
                      <>
                        <p className="text-sm font-semibold text-blue-400">{pluInfo.zoneType || pluInfo.zoneName}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{pluInfo?.pluType === "PLUi" ? "PLU intercommunal" : "PLU communal"}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-slate-500">Non détectée</p>
                        <p className="text-xs text-slate-500 mt-0.5">PLU peut être indisponible pour cette adresse ou zone non couverte.</p>
                      </>
                    )}
                  </div>
                  <div className="rounded-xl bg-slate-800/80 border border-white/10 p-4">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Shield className="w-4 h-4 text-slate-500" /> Protected areas
                    </p>
                    {!selectedAddress || loadingCadastre || loadingPlu ? (
                      <div className="space-y-2 animate-pulse">
                        <div className="h-4 bg-slate-700 rounded w-full" />
                        <div className="h-3 bg-slate-700 rounded w-2/3" />
                      </div>
                    ) : (
                      <p className="text-sm text-slate-300">
                        {protectedAreas.length > 0 ? protectedAreas.map((a) => a.name).join(", ") : "General construction regulations"}
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl bg-slate-800/80 border border-white/10 p-4">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Total land area</p>
                    {!selectedAddress || loadingCadastre || loadingPlu ? (
                      <div className="space-y-2 animate-pulse">
                        <div className="h-6 bg-slate-700 rounded w-1/2" />
                        <div className="h-3 bg-slate-700 rounded w-1/3" />
                      </div>
                    ) : (
                      <>
                        <p className="text-lg font-bold text-emerald-400 tabular-nums">
                          {parcels.filter((p) => selectedParcelIds.includes(p.id)).reduce((s, p) => s + p.area, 0) || 0} m²
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {selectedParcelIds.length} parcel{selectedParcelIds.length !== 1 ? "s" : ""} selected
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* Two-column: parcel list (left) + map (right). Map is larger for better visibility */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 min-h-[400px]">
                  <div className="lg:col-span-1 space-y-3 overflow-y-auto max-h-[520px]">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-white">Parcels</p>
                        {selectedAddress && !loadingCadastre && !loadingPlu && parcels.length > 0 && (
                          <span className="text-xs text-slate-500">{parcels.length} found</span>
                        )}
                      </div>
                      {(!selectedAddress || loadingCadastre || loadingPlu) ? (
                        <div className="space-y-2 animate-pulse">
                          {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="flex items-center gap-3 py-2.5">
                              <div className="w-4 h-4 rounded bg-slate-700" />
                              <div className="h-4 bg-slate-700 rounded flex-1" />
                              <div className="h-4 bg-slate-700 rounded w-12" />
                            </div>
                          ))}
                        </div>
                      ) : parcels.length > 0 ? (
                        <>
                          <div className="flex gap-2 mb-2" role="group" aria-label="Parcel selection">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedParcelIds(parcels.map((p) => p.id));
                              }}
                              className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 border border-white/10"
                              aria-label="Select all parcels"
                            >
                              All
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedParcelIds([]);
                              }}
                              className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 border border-white/10"
                              aria-label="Select no parcels"
                            >
                              None
                            </button>
                          </div>
                          {cadastreError && (
                            <p className="text-xs text-amber-400 mb-2">Cadastre: {cadastreError}</p>
                          )}
                          <div className="space-y-1" role="list">
                            {parcels.map((p) => {
                              const selected = selectedParcelIds.includes(p.id);
                              const isMain = parcels[0]?.id === p.id;
                              const toggle = () => {
                                setSelectedParcelIds((prev) => {
                                  if (prev.includes(p.id)) return prev.filter((x) => x !== p.id);
                                  return [...prev, p.id];
                                });
                              };
                              return (
                                <div
                                  key={p.id}
                                  role="button"
                                  tabIndex={0}
                                  aria-pressed={selected}
                                  aria-label={`Select parcel ${p.section} N°${p.number}`}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    toggle();
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      toggle();
                                    }
                                  }}
                                  className={cn(
                                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors border cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50",
                                    selected
                                      ? "bg-amber-500/20 text-amber-200 border-amber-500/40"
                                      : "bg-slate-800/50 text-slate-300 border-transparent hover:bg-slate-800 hover:border-white/10"
                                  )}
                                >
                                  <span className="flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center pointer-events-none">
                                    {selected ? <Check className="w-2.5 h-2.5 text-amber-400" /> : null}
                                  </span>
                                  <span className="flex-1 min-w-0 font-medium">
                                    {isMain ? "Principale " : ""}Section {p.section} N°{p.number}
                                  </span>
                                  <span className="flex-shrink-0 text-slate-400 tabular-nums">{p.area} m²</span>
                                  {selected && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                                </div>
                              );
                            })}
                          </div>
                          <p className="text-xs text-slate-500 mt-2">Select one or more parcels. You can own several parcels.</p>
                        </>
                      ) : (
                        <p className="text-sm text-slate-500 py-4">No parcels at this address. Enter another address or create without parcels.</p>
                      )}
                    </div>
                    {selectedAddress && !loadingCadastre && !loadingPlu && (
                      <div className="rounded-xl bg-slate-800/50 border border-white/10 p-3">
                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Applicable regulation</p>
                        <p className="text-sm text-slate-200">
                          {pluInfo?.zoneType || pluInfo?.zoneName
                            ? `Zone ${pluInfo.zoneType || pluInfo.zoneName}${pluInfo.zoneName && pluInfo.zoneName !== pluInfo.zoneType ? ` – ${pluInfo.zoneName}` : ""}`
                            : "Aucune zone PLU détectée à cette adresse (données peut-être indisponibles)."}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">Plan Local d&apos;Urbanisme{pluInfo?.pluType === "PLUi" ? " (PLUi)" : " (PLU)"}</p>
                      </div>
                    )}
                  </div>
                  <div className="lg:col-span-3 rounded-xl overflow-hidden border border-white/10 bg-slate-900 min-h-[420px] flex flex-col">
                    <p className="text-sm font-medium text-white px-3 py-2 border-b border-white/10">Map</p>
                    <div className="flex-1 min-h-[380px] flex items-center justify-center">
                      {!selectedAddress || loadingCadastre || loadingPlu ? (
                        <div className="flex flex-col items-center justify-center gap-2 text-slate-500">
                          <MapPin className="w-12 h-12 text-slate-600" />
                          <p className="text-sm">Search for an address to load the map</p>
                        </div>
                      ) : selectedAddress ? (
                        <ZoneMap
                          center={{ lat: selectedAddress.coordinates[1], lng: selectedAddress.coordinates[0] }}
                          parcels={parcels}
                          selectedParcelIds={selectedParcelIds}
                          onParcelSelect={(ids) => setSelectedParcelIds(ids)}
                          zoneFeatures={zoneFeatures}
                          pluZone={pluInfo?.zoneType ?? null}
                          pluName={pluInfo?.zoneName ?? null}
                          pluType={pluInfo?.pluType ?? null}
                          showRegulationSidebar={false}
                          className="h-full w-full min-h-[380px]"
                        />
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setShowNewModal(false)}
                    className="px-5 py-2.5 rounded-xl bg-slate-700 text-white font-medium hover:bg-slate-600"
                  >
                    Retour
                  </button>
                  <button
                    type="submit"
                    disabled={creating || (parcels.length > 0 && selectedParcelIds.length === 0)}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold disabled:opacity-50 hover:shadow-lg hover:shadow-purple-500/20"
                  >
                    {creating ? "Creating…" : "Create project"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Navigation>
  );
}
