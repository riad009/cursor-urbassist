"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Navigation from "@/components/layout/Navigation";
import {
  ArrowRight,
  FileText,
  Map,
  Layers,
  Scissors,
  Building2,
  Image,
  Camera,
  FileCheck,
  Loader2,
  CheckCircle2,
  ShoppingCart,
  FileBarChart,
  Shield,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const DOSSIER_STORAGE_KEY = "urbassist_dossier";

// Prior Declaration (DP) – regulatory documents per CERFA
const DP_DOCUMENTS = [
  { cerfa: "DPC1", label: "Site plan", icon: Map },
  { cerfa: "DPC2", label: "Layout plan", icon: Layers },
  { cerfa: "DPC3", label: "Section plan", icon: Scissors },
  { cerfa: "DPC4", label: "Elevation and roof plans", icon: Building2 },
  { cerfa: "DPC5", label: "Representation of external appearance", icon: Image },
  { cerfa: "DPC6", label: "Graphic document", icon: FileBarChart },
  { cerfa: "DPC7", label: "Photograph of the immediate surroundings", icon: Camera },
  { cerfa: "DPC8", label: "Photograph of the distant surroundings", icon: Camera },
  { cerfa: "DPC8-1", label: "Descriptive note", icon: FileText },
];

// Building Permit (PC) – regulatory documents per CERFA
const PC_DOCUMENTS = [
  { cerfa: "PC1", label: "Site plan", icon: Map },
  { cerfa: "PC2", label: "Layout plan", icon: Layers },
  { cerfa: "PC3", label: "Section plan", icon: Scissors },
  { cerfa: "PC4", label: "Descriptive note", icon: FileText },
  { cerfa: "PC5", label: "Elevation and roof plans", icon: Building2 },
  { cerfa: "PC6", label: "Graphic document", icon: FileBarChart },
  { cerfa: "PC7", label: "Photograph of the immediate surroundings", icon: Camera },
  { cerfa: "PC8", label: "Photograph of the distant surroundings", icon: Camera },
];

// Optional for individual house projects (PC)
const PC_OPTIONAL_DOCUMENTS = [
  { cerfa: "PCMI13", label: "Seismic certificate", icon: Shield },
  { cerfa: "PCMI14", label: "RE2020 study", icon: FileCheck },
];

function loadDossier(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(DOSSIER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default function DossierDocumentsPage() {
  const { user, loading: authLoading } = useAuth();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dossier, setDossier] = useState<Record<string, unknown>>({});

  useEffect(() => {
    const d = loadDossier();
    setDossier(d);
    if (d.step2 === undefined && typeof window !== "undefined") {
      window.location.href = "/dossier/address";
    }
  }, []);

  const handleBuyAndStart = async () => {
    if (!user) {
      window.location.href = "/login?redirect=" + encodeURIComponent("/dossier/documents");
      return;
    }
    const isAdmin = user.role === "ADMIN";
    if (!isAdmin && typeof user.credits === "number" && user.credits < 1) {
      setError("You need at least 1 credit to create a project. Buy credits or subscribe in your account.");
      return;
    }
    const step2 = dossier.step2 as { address?: string; city?: string; postcode?: string; coordinates?: number[]; parcelIds?: string[]; parcelArea?: number; pluZone?: string | null } | undefined;
    const step1 = dossier.step1 as { description?: string; projectType?: string } | undefined;
    if (!step2?.address || !step2?.coordinates) {
      setError("Address missing. Go back to the Address and zoning step.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: (step1?.description as string)?.slice(0, 80) || "Planning application",
          address: step2.address,
          municipality: step2.city,
          coordinates: step2.coordinates,
          parcelIds: step2.parcelIds || [],
          parcelArea: step2.parcelArea ?? null,
          zoneType: step2.pluZone ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create project.");
        setCreating(false);
        return;
      }
      const projectId = data.project?.id;
      if (projectId) {
        window.location.href = `/projects/${projectId}`;
      } else {
        window.location.href = "/projects";
      }
    } catch {
      setError("Network error. Please try again.");
      setCreating(false);
    }
  };

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-2xl mx-auto">
        <div className="mb-8">
          <Link
            href="/dossier/determination"
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            ← DP or building permit
          </Link>
          <h1 className="text-2xl lg:text-3xl font-bold text-white mt-4">
            Application documents
          </h1>
          <p className="text-slate-400 mt-2">
            Here is what will be produced for your planning application.
          </p>
        </div>

        {(() => {
          const determination = (dossier.step4 as { determination?: string } | undefined)?.determination;
          const isPC = determination === "PC";
          const docs = isPC ? PC_DOCUMENTS : DP_DOCUMENTS;
          return (
            <>
              <p className="text-slate-400 text-sm mb-3">
                Documents required for {isPC ? "building permit (PC)" : "prior declaration (DP)"}:
              </p>
              <ul className="space-y-3 mb-6">
                {docs.map((doc) => (
                  <li
                    key={doc.cerfa}
                    className="flex items-center gap-3 p-4 rounded-xl bg-slate-800/50 border border-white/10"
                  >
                    <doc.icon className="w-5 h-5 text-blue-400 shrink-0" />
                    <span className="text-slate-300 font-mono text-sm w-16 shrink-0">{doc.cerfa}</span>
                    <span className="text-white font-medium">{doc.label}</span>
                  </li>
                ))}
              </ul>
              {isPC && (
                <div className="mb-6 p-4 rounded-xl bg-slate-800/30 border border-white/5">
                  <p className="text-slate-400 text-sm font-medium mb-2">Additional documents (individual house and annexes)</p>
                  <p className="text-slate-500 text-sm mb-3">May be required depending on project type and area:</p>
                  <ul className="space-y-2">
                    {PC_OPTIONAL_DOCUMENTS.map((doc) => (
                      <li key={doc.cerfa} className="flex items-center gap-3 text-sm">
                        <doc.icon className="w-4 h-4 text-slate-500 shrink-0" />
                        <span className="font-mono text-slate-400">{doc.cerfa}</span>
                        <span className="text-slate-400">{doc.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          );
        })()}

        <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-8">
          <p className="text-emerald-200 font-medium flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            All these documents will be generated automatically from your project.
          </p>
          <p className="text-slate-300 text-sm mt-2">
            You complete the plans (location, site, section, elevations), photos and notice. We guide you at each step.
          </p>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-sm mb-6">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={handleBuyAndStart}
            disabled={creating || authLoading}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:shadow-lg hover:shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {creating ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <ShoppingCart className="w-5 h-5" />
                Buy and start file production
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
          <Link
            href="/dossier/determination"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-800 border border-white/10 text-white font-medium hover:bg-slate-700 transition-colors"
          >
            Back
          </Link>
        </div>

        {!user && !authLoading && (
          <p className="mt-4 text-sm text-slate-500">
            You will need to sign in or create an account to create the project and use your credits.
          </p>
        )}
        {user && user.role !== "ADMIN" && typeof user.credits === "number" && user.credits < 1 && (
          <p className="mt-4 text-sm text-amber-200">
            You have 0 credits. <Link href="/admin" className="text-blue-400 hover:underline">Buy credits or subscribe</Link> to create a project.
          </p>
        )}
      </div>
    </Navigation>
  );
}
