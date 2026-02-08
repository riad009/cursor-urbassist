"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Navigation from "@/components/layout/Navigation";
import { ArrowRight, Loader2, Ruler, Building2, Home, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

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

interface Step3Data {
  isExtension?: boolean;
  isIndependentConstruction?: boolean;
  lengthM?: number | null;
  widthM?: number | null;
  heightM?: number | null;
  existingBuilding?: boolean;
  existingFloorAreaM2?: number | null;
  createsEnclosedFloorArea?: boolean;
  roofOverhangPlanned?: boolean;
  roofOverhangWidthM?: number | null;
}

export default function DossierProjectDataPage() {
  const [isExtension, setIsExtension] = useState<boolean | null>(null);
  const [isIndependentConstruction, setIsIndependentConstruction] = useState<boolean | null>(null);
  const [lengthM, setLengthM] = useState("");
  const [widthM, setWidthM] = useState("");
  const [heightM, setHeightM] = useState("");
  const [existingBuilding, setExistingBuilding] = useState<boolean | null>(null);
  const [existingFloorAreaM2, setExistingFloorAreaM2] = useState("");
  const [createsEnclosedFloorArea, setCreatesEnclosedFloorArea] = useState<boolean | null>(null);
  const [roofOverhangPlanned, setRoofOverhangPlanned] = useState<boolean | null>(null);
  const [roofOverhangWidthM, setRoofOverhangWidthM] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const d = loadDossier();
    if (d.step2 === undefined && typeof window !== "undefined") {
      window.location.href = "/dossier/address";
      return;
    }
    const step3 = (d.step3 || {}) as Step3Data;
    if (step3.isExtension != null) setIsExtension(step3.isExtension);
    if (step3.isIndependentConstruction != null) setIsIndependentConstruction(step3.isIndependentConstruction);
    if (step3.lengthM != null) setLengthM(String(step3.lengthM));
    if (step3.widthM != null) setWidthM(String(step3.widthM));
    if (step3.heightM != null) setHeightM(String(step3.heightM));
    if (step3.existingBuilding != null) setExistingBuilding(step3.existingBuilding);
    if (step3.existingFloorAreaM2 != null) setExistingFloorAreaM2(String(step3.existingFloorAreaM2));
    if (step3.createsEnclosedFloorArea != null) setCreatesEnclosedFloorArea(step3.createsEnclosedFloorArea);
    if (step3.roofOverhangPlanned != null) setRoofOverhangPlanned(step3.roofOverhangPlanned);
    if (step3.roofOverhangWidthM != null) setRoofOverhangWidthM(String(step3.roofOverhangWidthM));
  }, []);

  const handleContinue = () => {
    const len = lengthM.trim() ? parseFloat(lengthM.replace(",", ".")) : null;
    const wid = widthM.trim() ? parseFloat(widthM.replace(",", ".")) : null;
    const hei = heightM.trim() ? parseFloat(heightM.replace(",", ".")) : null;
    const existingArea = existingFloorAreaM2.trim() ? parseFloat(existingFloorAreaM2.replace(",", ".")) : null;
    const overhang = roofOverhangWidthM.trim() ? parseFloat(roofOverhangWidthM.replace(",", ".")) : null;
    saveDossier({
      step3: {
        isExtension: isExtension === true,
        isIndependentConstruction: isIndependentConstruction === true,
        lengthM: len,
        widthM: wid,
        heightM: hei,
        existingBuilding: existingBuilding === true,
        existingFloorAreaM2: existingArea,
        createsEnclosedFloorArea: createsEnclosedFloorArea === true,
        roofOverhangPlanned: roofOverhangPlanned === true,
        roofOverhangWidthM: overhang,
      },
    });
    setIsSubmitting(true);
    window.location.href = "/dossier/determination";
  };

  const canContinue =
    isExtension !== null ||
    (isIndependentConstruction !== null && isIndependentConstruction) ||
    (lengthM.trim() && widthM.trim() && heightM.trim());

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-2xl mx-auto">
        <div className="mb-8">
          <Link
            href="/dossier/address"
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            ← Address and zoning
          </Link>
          <h1 className="text-2xl lg:text-3xl font-bold text-white mt-4">
            Project data
          </h1>
          <p className="text-slate-400 mt-2">
            Answer the questions in order. Regulatory surfaces are calculated automatically.
          </p>
        </div>

        <div className="space-y-8">
          {/* 1. Extension vs independent */}
          <div>
            <p className="text-sm font-medium text-white mb-3 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-400" />
              1. Is your project an extension or a separate construction?
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsExtension(true);
                  setIsIndependentConstruction(false);
                }}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                  isExtension === true
                    ? "bg-blue-500/30 text-blue-300 border border-blue-500/50"
                    : "bg-slate-800/50 text-slate-300 border border-white/10 hover:border-white/20"
                )}
              >
                Extension (enlarging existing building)
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsExtension(false);
                  setIsIndependentConstruction(true);
                }}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                  isIndependentConstruction === true
                    ? "bg-blue-500/30 text-blue-300 border border-blue-500/50"
                    : "bg-slate-800/50 text-slate-300 border border-white/10 hover:border-white/20"
                )}
              >
                Standalone construction (shed, pool, house…)
              </button>
            </div>
          </div>

          {/* 2. Dimensions */}
          <div>
            <p className="text-sm font-medium text-white mb-3 flex items-center gap-2">
              <Ruler className="w-4 h-4 text-blue-400" />
              2. Project dimensions (length × width × height)
            </p>
            <p className="text-xs text-slate-500 mb-2">In metres. For a pool, give the basin; for a building, the built footprint.</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Length (m)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={lengthM}
                  onChange={(e) => setLengthM(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Width (m)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={widthM}
                  onChange={(e) => setWidthM(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Height (m)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={heightM}
                  onChange={(e) => setHeightM(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            </div>
          </div>

          {/* 3. Existing building */}
          <div>
            <p className="text-sm font-medium text-white mb-3 flex items-center gap-2">
              <Home className="w-4 h-4 text-blue-400" />
              3. Is there already a building on the plot?
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setExistingBuilding(true)}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                  existingBuilding === true
                    ? "bg-blue-500/30 text-blue-300 border border-blue-500/50"
                    : "bg-slate-800/50 text-slate-300 border border-white/10 hover:border-white/20"
                )}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setExistingBuilding(false)}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                  existingBuilding === false
                    ? "bg-blue-500/30 text-blue-300 border border-blue-500/50"
                    : "bg-slate-800/50 text-slate-300 border border-white/10 hover:border-white/20"
                )}
              >
                No
              </button>
            </div>
            {existingBuilding === true && (
              <div className="mt-3">
                <label className="block text-xs text-slate-500 mb-1">Existing floor area (m²)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={existingFloorAreaM2}
                  onChange={(e) => setExistingFloorAreaM2(e.target.value)}
                  placeholder="Ex. 95"
                  className="w-full max-w-[140px] px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            )}
          </div>

          {/* 4. Creates enclosed floor area */}
          <div>
            <p className="text-sm font-medium text-white mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400" />
              4. Does the project create enclosed floor area (habitable rooms)?
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCreatesEnclosedFloorArea(true)}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                  createsEnclosedFloorArea === true
                    ? "bg-blue-500/30 text-blue-300 border border-blue-500/50"
                    : "bg-slate-800/50 text-slate-300 border border-white/10 hover:border-white/20"
                )}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setCreatesEnclosedFloorArea(false)}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                  createsEnclosedFloorArea === false
                    ? "bg-blue-500/30 text-blue-300 border border-blue-500/50"
                    : "bg-slate-800/50 text-slate-300 border border-white/10 hover:border-white/20"
                )}
              >
                No (terrace, pool, open shed…)
              </button>
            </div>
          </div>

          {/* 5. Roof overhang */}
          <div>
            <p className="text-sm font-medium text-white mb-3">
              5. Is a roof overhang planned?
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setRoofOverhangPlanned(true)}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                  roofOverhangPlanned === true
                    ? "bg-blue-500/30 text-blue-300 border border-blue-500/50"
                    : "bg-slate-800/50 text-slate-300 border border-white/10 hover:border-white/20"
                )}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setRoofOverhangPlanned(false)}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                  roofOverhangPlanned === false
                    ? "bg-blue-500/30 text-blue-300 border border-blue-500/50"
                    : "bg-slate-800/50 text-slate-300 border border-white/10 hover:border-white/20"
                )}
              >
                No
              </button>
            </div>
            {roofOverhangPlanned === true && (
              <div className="mt-3">
                <label className="block text-xs text-slate-500 mb-1">Overhang width (m)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={roofOverhangWidthM}
                  onChange={(e) => setRoofOverhangWidthM(e.target.value)}
                  placeholder="Ex. 0.40"
                  className="w-full max-w-[140px] px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            )}
          </div>

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
                  See if DP or building permit
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
            <Link
              href="/dossier/address"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-800 border border-white/10 text-white font-medium hover:bg-slate-700 transition-colors"
            >
              Back
            </Link>
          </div>
        </div>

        <p className="mt-8 text-xs text-slate-500">
          Aucune question sur l’emprise au sol ou la surface de plancher : nous calculons tout pour vous.
        </p>
      </div>
    </Navigation>
  );
}
