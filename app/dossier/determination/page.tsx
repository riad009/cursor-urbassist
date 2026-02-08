"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Navigation from "@/components/layout/Navigation";
import { ArrowRight, CheckCircle2, XCircle, AlertTriangle, Loader2, FileText } from "lucide-react";
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

type ResultKind = "DP" | "PC" | "ARCHITECT_REQUIRED";

interface DeterminationResult {
  kind: ResultKind;
  message: string;
  detail?: string;
}

/** Urban zones where DP extension up to 40 m² is possible (PLU zones U, UD, AUD, etc.) */
function isUrbanZone(zone: string): boolean {
  const z = zone.toUpperCase().trim();
  if (!z) return false;
  if (z.startsWith("U") || z === "AU" || z === "AUD" || z.startsWith("UD")) return true;
  return /^U[A-Z]*$/.test(z) || /^AUD?$/i.test(z);
}

function computeDetermination(d: Record<string, unknown>): DeterminationResult {
  const step2 = (d.step2 || {}) as { pluZone?: string | null; parcelArea?: number };
  const step3 = (d.step3 || {}) as {
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
  };

  const zone = (step2.pluZone || "").trim();
  const zoneLabel = zone || "unspecified";
  const isUrban = isUrbanZone(zone);
  const len = step3.lengthM ?? 0;
  const wid = step3.widthM ?? 0;
  const hei = step3.heightM ?? 0;
  const createdFootprint = len && wid ? len * wid : 0;
  const existingArea = step3.existingFloorAreaM2 ?? 0;
  const createsEnclosed = step3.createsEnclosedFloorArea === true;
  const isExtension = step3.isExtension === true;
  const isNewConstruction = step3.isIndependentConstruction === true;

  // Platform calculates created area and total; we never ask user for footprint or floor area.
  const floors = hei > 0 ? Math.max(1, Math.ceil(hei / 2.5)) : 1;
  const createdFloorArea = createsEnclosed ? len * wid * Math.min(floors, 2) : 0;
  const totalFloorAreaAfter = (step3.existingBuilding ? existingArea : 0) + createdFloorArea;

  // Architect mandatory: L.431-1 — created or total > 150 m² (or SCI; not collected here)
  if (createsEnclosed && (createdFloorArea > 150 || totalFloorAreaAfter > 150)) {
    return {
      kind: "ARCHITECT_REQUIRED",
      message: "This project requires a mandatory architect.",
      detail: "This project requires a mandatory architect. We cannot process this application on the platform.",
    };
  }

  // ——— Prior Declaration (DP) ———
  // Independent projects < 20 m² created area → DP possible
  if (isNewConstruction && createdFloorArea > 0 && createdFloorArea < 20) {
    return {
      kind: "DP",
      message: "Prior declaration (DP)",
      detail: `The created area is ${Math.round(createdFloorArea)} m² for an independent construction. A prior declaration is sufficient.`,
    };
  }

  // Extension WITHOUT enclosed floor (terrace, pool, open shed): use footprint for message and thresholds
  if (isExtension && !createsEnclosed && createdFootprint > 0) {
    const totalAfter = (step3.existingBuilding ? existingArea : 0) + 0; // no new floor area
    if (isUrban && createdFootprint <= 40 && totalAfter <= 150) {
      return {
        kind: "DP",
        message: "Prior declaration (DP)",
        detail: `The created footprint is ${Math.round(createdFootprint)} m² in an urban zone, for an extension (no enclosed floor). Total floor area after works is ${Math.round(totalAfter)} m². A prior declaration is sufficient.`,
      };
    }
    if (createdFootprint > 40 || totalAfter > 150) {
      return {
        kind: "PC",
        message: "Building permit (PC)",
        detail: `Extension with footprint ${Math.round(createdFootprint)} m² (over 40 m²) or total floor area over 150 m². A building permit is required. Zone: ${zoneLabel}.`,
      };
    }
    return {
      kind: "DP",
      message: "Prior declaration (DP)",
      detail: `The created footprint is ${Math.round(createdFootprint)} m² for an extension (no enclosed floor). In zone ${zoneLabel}, a prior declaration may apply; verify with your town hall.`,
    };
  }

  // Extensions WITH enclosed floor: up to 40 m² only if urban zone AND total after work ≤ 150 m²
  if (isExtension && isUrban) {
    if (createdFloorArea <= 40 && totalFloorAreaAfter <= 150) {
      return {
        kind: "DP",
        message: "Prior declaration (DP)",
        detail: `The created area is ${Math.round(createdFloorArea)} m² in an urban zone, for an extension. Total after works is ${Math.round(totalFloorAreaAfter)} m². A prior declaration is sufficient.`,
      };
    }
    return {
      kind: "PC",
      message: "Building permit (PC)",
      detail: `Extension in urban zone: created area ${Math.round(createdFloorArea)} m² (over 40 m²) or total after works ${Math.round(totalFloorAreaAfter)} m² (over 150 m²). A building permit is required.`,
    };
  }

  // Extension with enclosed floor, not in urban zone
  if (isExtension) {
    if (createdFloorArea > 40 || totalFloorAreaAfter > 150) {
      return {
        kind: "PC",
        message: "Building permit (PC)",
        detail: `Extension with created area ${Math.round(createdFloorArea)} m² or total ${Math.round(totalFloorAreaAfter)} m². A building permit is required. Zone: ${zoneLabel}.`,
      };
    }
    return {
      kind: "DP",
      message: "Prior declaration (DP)",
      detail: `The created area is ${Math.round(createdFloorArea)} m² for an extension. In zone ${zoneLabel}, a prior declaration may apply; verify with your town hall.`,
    };
  }

  // ——— Building Permit (PC) ———
  // Independent construction > 20 m²
  if (isNewConstruction && (createdFloorArea >= 20 || createdFootprint >= 20)) {
    return {
      kind: "PC",
      message: "Building permit (PC)",
      detail: `Independent construction of ${Math.round(createdFloorArea || createdFootprint)} m². A building permit is required.`,
    };
  }

  // Pool / annex without enclosed floor: small footprint → DP possible
  if (!createsEnclosed && createdFootprint > 0 && createdFootprint < 20) {
    return {
      kind: "DP",
      message: "Prior declaration (DP)",
      detail: `Project (${Math.round(createdFootprint)} m²) does not create enclosed floor area. A prior declaration is generally sufficient. Zone: ${zoneLabel}.`,
    };
  }
  if (!createsEnclosed && createdFootprint >= 20) {
    return {
      kind: "PC",
      message: "Building permit (PC)",
      detail: `Project footprint ${Math.round(createdFootprint)} m² without enclosed floor. A building permit is generally required. Zone: ${zoneLabel}.`,
    };
  }

  // Default by size
  if (createdFloorArea > 40 || totalFloorAreaAfter > 150) {
    return {
      kind: "PC",
      message: "Building permit (PC)",
      detail: `Created area ${Math.round(createdFloorArea)} m² or total ${Math.round(totalFloorAreaAfter)} m². A building permit is required. Zone: ${zoneLabel}.`,
    };
  }

  return {
    kind: "DP",
    message: "Prior declaration (DP)",
    detail: `The created area is ${Math.round(createdFloorArea || createdFootprint)} m². In zone ${zoneLabel}, a prior declaration may be sufficient. Verify with your town hall.`,
  };
}

export default function DossierDeterminationPage() {
  const [result, setResult] = useState<DeterminationResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const d = loadDossier();
    if (!d.step2 && typeof window !== "undefined") {
      window.location.href = "/dossier/address";
      return;
    }
    if (!d.step3 && typeof window !== "undefined") {
      window.location.href = "/dossier/project-data";
      return;
    }
    const res = computeDetermination(d);
    setResult(res);
    saveDossier({ step4: { determination: res.kind, message: res.message, detail: res.detail } });
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <Navigation>
        <div className="p-6 lg:p-8 max-w-2xl mx-auto flex items-center justify-center min-h-[40vh]">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        </div>
      </Navigation>
    );
  }

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-2xl mx-auto">
        <div className="mb-8">
          <Link
            href="/dossier/project-data"
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            ← Project data
          </Link>
          <h1 className="text-2xl lg:text-3xl font-bold text-white mt-4">
            Your project requires
          </h1>
          <p className="text-slate-400 mt-2">
            Result based on project type, surfaces and zoning.
          </p>
        </div>

        {result && (
          <div className="space-y-6">
            {result.kind === "ARCHITECT_REQUIRED" && (
              <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20">
                <div className="flex items-start gap-3">
                  <XCircle className="w-8 h-8 text-red-400 shrink-0" />
                  <div>
                    <p className="text-lg font-semibold text-red-200">{result.message}</p>
                    <p className="text-slate-300 mt-2">{result.detail}</p>
                  </div>
                </div>
              </div>
            )}

            {result.kind === "DP" && (
              <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-lg font-semibold text-emerald-200">
                      ✅ Prior declaration (DP)
                    </p>
                    <p className="text-slate-300 mt-2">{result.detail}</p>
                  </div>
                </div>
              </div>
            )}

            {result.kind === "PC" && (
              <div className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-start gap-3">
                  <FileText className="w-8 h-8 text-amber-400 shrink-0" />
                  <div>
                    <p className="text-lg font-semibold text-amber-200">
                      ✅ Building permit (PC)
                    </p>
                    <p className="text-slate-300 mt-2">{result.detail}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              {result.kind !== "ARCHITECT_REQUIRED" && (
                <Link
                  href="/dossier/documents"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:shadow-lg hover:shadow-purple-500/25 transition-all"
                >
                  View document list and purchase
                  <ArrowRight className="w-5 h-5" />
                </Link>
              )}
              <Link
                href="/dossier/project-data"
                className={cn(
                  "inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border font-medium transition-colors",
                  result.kind === "ARCHITECT_REQUIRED"
                    ? "bg-slate-800 border-white/10 text-white hover:bg-slate-700"
                    : "bg-slate-800 border-white/10 text-white hover:bg-slate-700"
                )}
              >
                Edit data
              </Link>
            </div>
          </div>
        )}

        <div className="mt-8 p-4 rounded-xl bg-slate-800/30 border border-white/5 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
          <p className="text-sm text-slate-400">
            This result is an estimate. Only the town hall can confirm the type of permit. When in doubt, apply for a building permit.
          </p>
        </div>
      </div>
    </Navigation>
  );
}
