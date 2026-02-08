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
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

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
  const [parcels, setParcels] = useState<{ id: string; section: string; number: string; area: number }[]>([]);
  const [selectedParcelIds, setSelectedParcelIds] = useState<string[]>([]);
  const [pluInfo, setPluInfo] = useState<{ zoneType: string | null; zoneName: string | null } | null>(null);
  const [protectedAreas, setProtectedAreas] = useState<{ name: string; type: string }[]>([]);
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [loadingCadastre, setLoadingCadastre] = useState(false);
  const [loadingPlu, setLoadingPlu] = useState(false);
  const [cadastreError, setCadastreError] = useState<string | null>(null);
  const [northAngleDegrees, setNorthAngleDegrees] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => setProjects(data.projects || []))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [user]);

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
    setProtectedAreas([]);
    fetch("/api/cadastre/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates: coords }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) {
          setCadastreError(d.error || "Cadastre lookup failed");
          setParcels([]);
          setNorthAngleDegrees(null);
          return;
        }
        setParcels(d.parcels || []);
        setNorthAngleDegrees(typeof d.northAngleDegrees === "number" ? d.northAngleDegrees : null);
      })
      .catch(() => {
        setCadastreError("Cadastre service unavailable. You can still create the project with the address.");
        setParcels([]);
      })
      .finally(() => setLoadingCadastre(false));
    fetch("/api/plu-detection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates: coords }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.zoneType || d.zoneName) setPluInfo({ zoneType: d.zoneType || null, zoneName: d.zoneName || null });
      })
      .finally(() => setLoadingPlu(false));
    fetch("/api/protected-areas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates: coords }),
    })
      .then((r) => r.json())
      .then((d) => setProtectedAreas(d.areas || []))
      .catch(() => {});
  }, []);

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const parcelIds = selectedParcelIds.length > 0 ? selectedParcelIds : parcels.map((p) => p.id);
      const parcelArea = selectedParcelIds.length > 0
        ? parcels.filter((p) => selectedParcelIds.includes(p.id)).reduce((sum, p) => sum + p.area, 0)
        : parcels.reduce((sum, p) => sum + p.area, 0) || parcels[0]?.area;
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          address: newAddress.trim() || undefined,
          municipality: selectedAddress?.city,
          coordinates: selectedAddress?.coordinates,
          parcelIds: parcelIds.length ? parcelIds : undefined,
          parcelArea,
          northAngle: northAngleDegrees != null ? northAngleDegrees : undefined,
          zoneType: pluInfo?.zoneType || pluInfo?.zoneName,
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
                <div className="flex items-center gap-2">
                  <Link
                    href={`/editor?project=${project.id}`}
                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-500/20 text-blue-400 font-medium hover:bg-blue-500/30"
                  >
                    Open <ArrowRight className="w-4 h-4" />
                  </Link>
                  <button
                    onClick={() => deleteProject(project.id)}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showNewModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-slate-900 rounded-2xl border border-white/10 w-full max-w-lg p-6 my-8">
              <h2 className="text-xl font-bold text-white mb-4">New Project</h2>
              <form onSubmit={createProject} className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Project name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-white/10 text-white"
                    placeholder="e.g. Villa Méditerranée"
                    required
                  />
                </div>
                <div className="relative">
                  <label className="block text-sm text-slate-400 mb-2">Search address</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      value={selectedAddress ? newAddress : addressQuery}
                      onChange={(e) => {
                        const v = e.target.value;
                        setAddressQuery(v);
                        setNewAddress(v);
                        if (selectedAddress) setSelectedAddress(null);
                      }}
                      onFocus={() => selectedAddress && setSelectedAddress(null)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-800 border border-white/10 text-white"
                      placeholder="123 Rue Example, 06000 Nice"
                    />
                    {loadingAddress && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
                    )}
                  </div>
                  {addressSuggestions.length > 0 && (
                    <div className="absolute z-10 top-full left-0 right-0 mt-1 rounded-xl bg-slate-800 border border-white/10 overflow-hidden">
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
                          className="w-full px-4 py-2 text-left text-sm text-white hover:bg-slate-700 flex items-center gap-2"
                        >
                          <MapPin className="w-4 h-4 text-slate-500 shrink-0" />
                          <span className="truncate">{a.label}</span>
                          <span className="text-slate-500 text-xs shrink-0">{a.postcode} {a.city}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-slate-500 mt-1">Type to search, or enter address manually</p>
                </div>
                {selectedAddress && (
                  <>
                    {loadingCadastre || loadingPlu ? (
                      <div className="flex items-center gap-2 text-slate-400 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading cadastre & PLU...
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {cadastreError && (
                          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-400">
                            {cadastreError}
                          </div>
                        )}
                        {pluInfo && (pluInfo.zoneType || pluInfo.zoneName) && (
                          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                            <span className="text-xs text-slate-400">PLU Zone</span>
                            <p className="text-sm font-medium text-blue-400">{pluInfo.zoneType || pluInfo.zoneName}</p>
                          </div>
                        )}
                        {protectedAreas.length > 0 && (
                          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <Shield className="w-3 h-3" /> Protected areas
                            </span>
                            <p className="text-xs text-amber-400 mt-1">{protectedAreas.map((a) => a.name).join(", ")}</p>
                          </div>
                        )}
                        {parcels.length > 0 && (
                          <div>
                            <p className="text-xs text-amber-400/90 mb-2 flex items-center gap-1">
                              <Shield className="w-3.5 h-3.5" />
                              You must select all parcels affected by your project. This is a regulatory requirement for permit applications.
                            </p>
                            <label className="block text-xs text-slate-400 mb-2">Select parcel(s) — multiple allowed</label>
                            <div className="flex flex-wrap gap-2">
                              {parcels.slice(0, 12).map((p) => {
                                const selected = selectedParcelIds.includes(p.id);
                                return (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedParcelIds((prev) =>
                                        prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                                      );
                                    }}
                                    className={cn(
                                      "px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                                      selected
                                        ? "bg-blue-500/30 text-blue-400 border border-blue-500/50"
                                        : "bg-slate-800 text-slate-300 border border-white/10 hover:border-white/20"
                                    )}
                                  >
                                    {p.section}{p.number} ({p.area}m²)
                                  </button>
                                );
                              })}
                            </div>
                            {selectedParcelIds.length > 0 && (
                              <p className="text-xs text-slate-500 mt-1">
                                {selectedParcelIds.length} parcel(s) selected · Total: {parcels.filter((p) => selectedParcelIds.includes(p.id)).reduce((s, p) => s + p.area, 0)}m²
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowNewModal(false)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-700 text-white font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold disabled:opacity-50"
                  >
                    {creating ? "Creating..." : "Create"}
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
