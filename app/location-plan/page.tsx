"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Navigation from "@/components/layout/Navigation";
import {
  MapPin,
  Loader2,
  Search,
  Map,
  Satellite,
  Layers,
  Download,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { LocationMap } from "@/components/location-plan/LocationMap";
import { getNextStep } from "@/lib/step-flow";
import { NextStepButton } from "@/components/NextStepButton";

export default function LocationPlanPage() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [projects, setProjects] = useState<
    { id: string; name: string; address?: string | null; coordinates?: string | null }[]
  >([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [addressQuery, setAddressQuery] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<
    { label: string; coordinates?: number[] }[]
  >([]);
  const [selectedCoords, setSelectedCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [baseLayer, setBaseLayer] = useState<"street" | "satellite" | "ign">("street");
  const [cadastralOverlay, setCadastralOverlay] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(6);
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [selectedParcelIds, setSelectedParcelIds] = useState<string[]>([]);

  const projectIdFromUrl = searchParams.get("project");

  useEffect(() => {
    if (!user) return;
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects || []))
      .catch(() => setProjects([]));
  }, [user]);

  useEffect(() => {
    if (projectIdFromUrl && projects.some((p) => p.id === projectIdFromUrl)) {
      setSelectedProjectId(projectIdFromUrl);
    }
  }, [projectIdFromUrl, projects]);

  useEffect(() => {
    if (!selectedProjectId) return;
    const project = projects.find((p) => p.id === selectedProjectId) as { id: string; coordinates?: string | null; address?: string | null; parcelIds?: string } | undefined;
    if (!project?.coordinates) return;
    try {
      const c = JSON.parse(project.coordinates);
      const lat = Array.isArray(c) ? c[1] : c.lat;
      const lng = Array.isArray(c) ? c[0] : c.lng;
      if (lat != null && lng != null) setSelectedCoords({ lat, lng });
    } catch {
      setSelectedCoords(null);
    }
    // Auto location plan: ensure document exists when address + parcels are set
    if (project?.address && (project?.parcelIds || project?.coordinates)) {
      fetch(`/api/projects/${selectedProjectId}/location-plan/ensure`, { method: "POST" }).catch(() => {});
    }
  }, [selectedProjectId, projects]);

  const searchAddress = useCallback(async () => {
    if (!addressQuery.trim() || addressQuery.length < 3) {
      setAddressSuggestions([]);
      return;
    }
    setLoadingAddress(true);
    try {
      const res = await fetch("/api/address/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addressQuery }),
      });
      const d = await res.json();
      setAddressSuggestions(d.results || []);
    } catch {
      setAddressSuggestions([]);
    }
    setLoadingAddress(false);
  }, [addressQuery]);

  useEffect(() => {
    const t = setTimeout(searchAddress, 400);
    return () => clearTimeout(t);
  }, [addressQuery, searchAddress]);

  const selectAddress = (coords: number[]) => {
    if (coords.length >= 2) {
      setSelectedCoords({ lng: coords[0], lat: coords[1] });
      setAddressSuggestions([]);
      setSelectedParcelIds([]);
    }
  };

  const exportMap = () => {
    const url = selectedCoords
      ? `https://www.openstreetmap.org/?mlat=${selectedCoords.lat}&mlon=${selectedCoords.lng}#map=18/${selectedCoords.lat}/${selectedCoords.lng}`
      : "https://www.openstreetmap.org/#map=6/46.6/1.9";
    window.open(url, "_blank");
  };

  return (
    <Navigation>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        <div className="flex flex-1 min-h-0">
          {/* Left sidebar - like reference */}
          <div className="w-80 shrink-0 p-4 flex flex-col gap-6 bg-slate-900/50 border-r border-white/5 overflow-y-auto">
            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-400" />
                Location Plan
              </h1>
              <p className="text-slate-400 text-sm mt-1">
                Interactive map with cadastral overlay and aerial view.
              </p>
            </div>

            {/* Search Address */}
            <div>
              <h3 className="text-sm font-semibold text-white mb-2">Search Address</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={addressQuery}
                  onChange={(e) => setAddressQuery(e.target.value)}
                  placeholder="Enter an address in France..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
                {loadingAddress && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
                )}
              </div>
              {addressSuggestions.length > 0 && (
                <div className="mt-1 rounded-lg bg-slate-800 border border-white/10 overflow-hidden">
                  {addressSuggestions.slice(0, 5).map((a, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => a.coordinates && selectAddress(a.coordinates)}
                      className="w-full px-3 py-2 text-left text-sm text-white hover:bg-slate-700"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {user && projects.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-white mb-2">From project</h3>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-white text-sm"
                >
                  <option value="">Select project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {selectedProjectId && (
                  <div className="mt-3 space-y-2">
                    <NextStepButton
                      canProceed={!!selectedCoords}
                      nextHref={`/editor?project=${selectedProjectId}`}
                      nextLabel={getNextStep("/location-plan", selectedProjectId)?.label ?? "Next: Site Plan"}
                      disabledMessage="Select a location (address or map) to continue"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Base Layer */}
            <div>
              <h3 className="text-sm font-semibold text-white mb-2">Base Layer</h3>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setBaseLayer("street")}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    baseLayer === "street"
                      ? "bg-blue-500/30 text-blue-400 border border-blue-500/50"
                      : "bg-slate-800/50 text-slate-400 border border-transparent hover:bg-slate-700/50"
                  )}
                >
                  <Map className="w-4 h-4" />
                  Street Map
                </button>
                <button
                  type="button"
                  onClick={() => setBaseLayer("satellite")}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    baseLayer === "satellite"
                      ? "bg-blue-500/30 text-blue-400 border border-blue-500/50"
                      : "bg-slate-800/50 text-slate-400 border border-transparent hover:bg-slate-700/50"
                  )}
                >
                  <Satellite className="w-4 h-4" />
                  Satellite
                </button>
                <button
                  type="button"
                  onClick={() => setBaseLayer("ign")}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    baseLayer === "ign"
                      ? "bg-blue-500/30 text-blue-400 border border-blue-500/50"
                      : "bg-slate-800/50 text-slate-400 border border-transparent hover:bg-slate-700/50"
                  )}
                >
                  <Layers className="w-4 h-4" />
                  IGN Ortho
                </button>
              </div>
            </div>

            {/* Overlays */}
            <div>
              <h3 className="text-sm font-semibold text-white mb-2">Overlays</h3>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-300 flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  Cadastral Parcels
                </span>
                <button
                  type="button"
                  onClick={() => setCadastralOverlay(!cadastralOverlay)}
                  className={cn(
                    "relative w-11 h-6 rounded-full transition-colors",
                    cadastralOverlay ? "bg-blue-500" : "bg-slate-600"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                      cadastralOverlay ? "left-6" : "left-1"
                    )}
                  />
                </button>
              </div>
              {cadastralOverlay && (
                <p className="text-xs text-slate-500 mt-1">
                  Click parcels on the map to select or deselect.
                </p>
              )}
            </div>

            {/* Selected parcels */}
            {cadastralOverlay && selectedParcelIds.length > 0 && (
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <h3 className="text-sm font-semibold text-white mb-2">Selected parcels</h3>
                <p className="text-xs text-slate-400 mb-2">
                  {selectedParcelIds.length} parcel{selectedParcelIds.length !== 1 ? "s" : ""} selected. Click on the map to add or remove.
                </p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedParcelIds.map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-700/80 text-slate-200 text-xs font-mono"
                    >
                      {id}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedParcelIds([])}
                  className="text-xs font-medium text-blue-400 hover:text-blue-300"
                >
                  Clear selection
                </button>
              </div>
            )}

            {/* Map Info */}
            <div>
              <h3 className="text-sm font-semibold text-white mb-2">Map Info</h3>
              <div className="text-sm text-slate-400">
                Zoom Level: <span className="text-white font-medium">{zoomLevel}</span>
              </div>
            </div>
          </div>

          {/* Main map area */}
          <div className="flex-1 flex flex-col min-w-0 relative">
            <div className="absolute top-4 right-4 z-[1000]">
              <button
                type="button"
                onClick={exportMap}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium shadow-lg"
              >
                <Download className="w-4 h-4" />
                Export Map
              </button>
            </div>

            <div className="flex-1 min-h-0 relative">
              <LocationMap
                center={selectedCoords}
                zoom={zoomLevel}
                baseLayer={baseLayer}
                cadastralOverlay={cadastralOverlay}
                onZoomChange={setZoomLevel}
                selectedParcelIds={selectedParcelIds}
                onParcelSelect={setSelectedParcelIds}
                className="absolute inset-0 w-full h-full"
              />
              {!selectedCoords && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <MapPin className="w-20 h-20 text-slate-500 mb-4 opacity-50" />
                  <p className="text-slate-500 text-lg">
                    Search for an address to view location on the map.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Navigation>
  );
}
