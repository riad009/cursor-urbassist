"use client";

import React, { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import Navigation from "@/components/layout/Navigation";
import {
  MapPin,
  Search,
  Loader2,
  ArrowRight,
  AlertTriangle,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ZoneMap } from "@/components/dossier/ZoneMap";

const DOSSIER_STORAGE_KEY = "urbassist_dossier";

function loadDossier(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(DOSSIER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDossier(data: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    const current = loadDossier();
    sessionStorage.setItem(DOSSIER_STORAGE_KEY, JSON.stringify({ ...current, ...data }));
  } catch {
    // ignore
  }
}

interface Parcel {
  id: string;
  section: string;
  number: string;
  area: number;
}

export default function DossierAddressPage() {
  const [addressQuery, setAddressQuery] = useState("");
  const [suggestions, setSuggestions] = useState<{ label: string; city: string; postcode: string; coordinates?: number[] }[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<{ label: string; city: string; postcode: string; coordinates: number[] } | null>(null);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [selectedParcelIds, setSelectedParcelIds] = useState<string[]>([]);
  const [pluZone, setPluZone] = useState<string | null>(null);
  const [pluName, setPluName] = useState<string | null>(null);
  const [pluType, setPluType] = useState<string | null>(null);
  const [zoneFeatures, setZoneFeatures] = useState<unknown[]>([]);
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [loadingCadastre, setLoadingCadastre] = useState(false);
  const [loadingPlu, setLoadingPlu] = useState(false);
  const [cadastreError, setCadastreError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const searchAddress = useCallback(() => {
    if (!addressQuery.trim() || addressQuery.length < 4) {
      setSuggestions([]);
      return;
    }
    setLoadingAddress(true);
    fetch("/api/address/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: addressQuery }),
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d) => setSuggestions(d.results || []))
      .catch(() => setSuggestions([]))
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
    setSuggestions([]);
    setLoadingCadastre(true);
    setLoadingPlu(true);
    setCadastreError(null);
    setParcels([]);
    setPluZone(null);
    setPluName(null);
    setPluType(null);
    setZoneFeatures([]);
    setSelectedParcelIds([]);

    fetch("/api/cadastre/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates: coords }),
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d) => {
        setParcels(d.parcels || []);
        if ((d.parcels || []).length > 0) setSelectedParcelIds((d.parcels as Parcel[]).map((p) => p.id));
      })
      .catch(() => setCadastreError("Indisponible"))
      .finally(() => setLoadingCadastre(false));

    fetch("/api/plu-detection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates: coords }),
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d) => {
        const plu = d.plu || {};
        const zone = plu.zoneType || plu.zoneName || d.zoneType || d.zoneName;
        setPluZone(zone || null);
        setPluName(plu.zoneName || plu.zoneType || zone || null);
        setPluType(plu.pluType || null);
        setZoneFeatures(Array.isArray(d.zoneFeatures) ? d.zoneFeatures : []);
      })
      .catch(() => setPluZone(null))
      .finally(() => setLoadingPlu(false));
  }, []);

  const toggleParcel = (id: string) => {
    setSelectedParcelIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const zoneMissing = !loadingPlu && !loadingCadastre && selectedAddress && pluZone === null && parcels.length === 0;
  const zoneDetected = pluZone != null && pluZone !== "";

  const handleContinue = () => {
    const totalArea = parcels
      .filter((p) => selectedParcelIds.includes(p.id))
      .reduce((sum, p) => sum + p.area, 0);
    saveDossier({
      step2: {
        address: selectedAddress?.label,
        city: selectedAddress?.city,
        postcode: selectedAddress?.postcode,
        coordinates: selectedAddress?.coordinates,
        parcels,
        parcelIds: selectedParcelIds,
        parcelArea: totalArea || parcels.reduce((s, p) => s + p.area, 0),
        pluZone: pluZone || null,
        pluName: pluName || null,
      },
    });
    setIsSubmitting(true);
    window.location.href = "/dossier/project-data";
  };

  const canContinue = selectedAddress != null;

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-2xl mx-auto">
        <div className="mb-8">
          <Link
            href="/dossier/qualification"
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            ← Qualify project
          </Link>
          <h1 className="text-2xl lg:text-3xl font-bold text-white mt-4">
            Address and zoning
          </h1>
          <p className="text-slate-400 mt-2">
            Enter the plot address. Cadastral parcels and zoning (PLU) will be shown.
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Project address
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={addressQuery}
                onChange={(e) => setAddressQuery(e.target.value)}
                placeholder="E.g. 12 Main Street, 06000 Nice"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-800 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
              {loadingAddress && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
              )}
            </div>
            {suggestions.length > 0 && (
              <ul className="mt-2 rounded-xl bg-slate-800 border border-white/10 overflow-hidden">
                {suggestions.slice(0, 5).map((a, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => selectAddress(a)}
                      className="w-full px-4 py-3 text-left text-sm text-white hover:bg-slate-700 flex items-center gap-2"
                    >
                      <MapPin className="w-4 h-4 text-slate-500 shrink-0" />
                      {a.label}
                      <span className="text-slate-500 text-xs">{a.postcode} {a.city}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {selectedAddress && (
            <>
              <div className="p-4 rounded-xl bg-slate-800/50 border border-white/10">
                <p className="text-sm font-medium text-white flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-400" />
                  {selectedAddress.label}
                </p>
                <p className="text-xs text-slate-500 mt-1">{selectedAddress.postcode} {selectedAddress.city}</p>
              </div>

              {(loadingCadastre || loadingPlu) && (
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading parcels and zoning…
                </div>
              )}

              {!loadingCadastre && !loadingPlu && parcels.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-white mb-2">Cadastral parcels</p>
                  <p className="text-xs text-slate-500 mb-2">Select all parcels concerned by the project.</p>
                  <div className="flex flex-wrap gap-2">
                    {parcels.slice(0, 12).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleParcel(p.id)}
                        className={cn(
                          "px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                          selectedParcelIds.includes(p.id)
                            ? "bg-blue-500/30 text-blue-300 border border-blue-500/50"
                            : "bg-slate-800 text-slate-400 border border-white/10 hover:border-white/20"
                        )}
                      >
                        {p.section} {p.number} — {p.area} m²
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!loadingCadastre && !loadingPlu && (
                <ZoneMap
                  center={
                    selectedAddress
                      ? { lat: selectedAddress.coordinates[1], lng: selectedAddress.coordinates[0] }
                      : null
                  }
                  parcels={parcels}
                  selectedParcelIds={selectedParcelIds}
                  zoneFeatures={zoneFeatures}
                  pluZone={pluZone}
                  pluName={pluName}
                  pluType={pluType}
                  className="mt-2"
                />
              )}

              {zoneMissing && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-200">
                        We could not identify the applicable regulation.
                      </p>
                      <p className="text-slate-300 text-sm mt-1">
                        You can upload the zoning (PLU) document to continue.
                      </p>
                      <Link
                        href="/regulations"
                        className="inline-flex items-center gap-2 mt-3 px-3 py-2 rounded-lg bg-amber-500/20 text-amber-300 text-sm font-medium hover:bg-amber-500/30 transition-colors"
                      >
                        <Upload className="w-4 h-4" />
                        Upload PLU document
                      </Link>
                    </div>
                  </div>
                </div>
              )}

              {cadastreError && (
                <p className="text-sm text-amber-400">Cadastre: {cadastreError}. You can continue and enter the address manually.</p>
              )}
            </>
          )}

          <div className="pt-4 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleContinue}
              disabled={!canContinue || isSubmitting}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:shadow-lg hover:shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
            <Link
              href="/dossier/qualification"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-800 border border-white/10 text-white font-medium hover:bg-slate-700 transition-colors"
            >
              Back
            </Link>
          </div>
        </div>

        <p className="mt-6 text-xs text-slate-500">
          La zone PLU (UA, UB, N, etc.) est détectée via le Géoportail de l’urbanisme. En cas de doute, vérifiez sur{" "}
          <a
            href="https://www.geoportail-urbanisme.gouv.fr"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            Verify on official Géoportail
          </a>{" "}
          when in doubt.
        </p>
      </div>
    </Navigation>
  );
}
