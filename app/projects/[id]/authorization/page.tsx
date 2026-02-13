"use client";

import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navigation from "@/components/layout/Navigation";
import {
  FileCheck,
  Loader2,
  ArrowRight,
  MapPin,
  Building2,
  ClipboardList,
  Info,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { calculateDpPc, type ProjectTypeChoice, type DeterminationType } from "@/lib/dp-pc-calculator";

export default function AuthorizationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [project, setProject] = useState<{
    id: string;
    name: string;
    address: string | null;
    parcelArea?: number | null;
    projectType?: string | null;
    regulatoryAnalysis?: { zoneType?: string | null } | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [determination, setDetermination] = useState<DeterminationType | null>(null);
  const [explanation, setExplanation] = useState("");
  const [shortcutUsed, setShortcutUsed] = useState(false);
  const [projectTypes, setProjectTypes] = useState<ProjectTypeChoice[]>(["new_construction"]);

  const toggleProjectType = (type: ProjectTypeChoice) => {
    setProjectTypes((prev) => {
      if (prev.includes(type)) {
        const next = prev.filter((t) => t !== type);
        return next.length === 0 ? [type] : next; // At least one must be selected
      }
      return [...prev, type];
    });
  };
  const [floorAreaCreated, setFloorAreaCreated] = useState(80);
  const [existingFloorArea, setExistingFloorArea] = useState(0);
  const [groundAreaExtension, setGroundAreaExtension] = useState<number | undefined>();

  useEffect(() => {
    if (!projectId || !user) {
      if (!authLoading) setLoading(false);
      return;
    }
    let cancelled = false;
    let willRetry = false;
    setLoading(true);
    fetch(`/api/projects/${projectId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.project) {
          setProject(data.project);
          return;
        }
        if (data.error === "Unauthorized") return;
        // Project may have just been created: retry once after a short delay
        willRetry = true;
        setTimeout(() => {
          if (cancelled) return;
          fetch(`/api/projects/${projectId}`, { credentials: "include" })
            .then((r2) => r2.json())
            .then((data2) => {
              if (!cancelled && data2.project) setProject(data2.project);
            })
            .catch(() => { })
            .finally(() => {
              if (!cancelled) setLoading(false);
            });
        }, 600);
      })
      .catch(() => { })
      .finally(() => {
        if (!cancelled && !willRetry) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, user, authLoading]);

  const zoneType = project?.regulatoryAnalysis?.zoneType ?? "";
  const inUrbanZone = /^(U|AU|AUD|UD|UA|UB|UC|UE|UF|UG|UH|UI|UJ|UK|UL|UM|UN|UP|UQ|UR|US|UT|UU|UV|UW|UX|UY|UZ)/i.test(
    String(zoneType)
  );

  const handleShortcut = (type: "DP" | "PC") => {
    setDetermination(type);
    setExplanation(
      type === "DP"
        ? "Vous avez indiqué qu'une déclaration préalable suffit pour votre projet."
        : "Vous avez indiqué qu'un permis de construire est requis pour votre projet."
    );
    setShortcutUsed(true);
  };

  const handleCalculate = () => {
    // Use most restrictive type: existing_extension > new_construction > outdoor
    const effectiveType: ProjectTypeChoice = projectTypes.includes("existing_extension")
      ? "existing_extension"
      : projectTypes.includes("new_construction")
        ? "new_construction"
        : "outdoor";
    const result = calculateDpPc({
      projectType: effectiveType,
      floorAreaCreated,
      existingFloorArea: effectiveType === "existing_extension" ? existingFloorArea : undefined,
      groundAreaExtension: effectiveType === "existing_extension" ? groundAreaExtension : undefined,
      inUrbanZone,
    });
    setDetermination(result.determination);
    setExplanation(result.explanation);
    setShortcutUsed(false);
  };

  const handleContinue = async () => {
    if (!determination || !projectId || determination === "REVIEW") return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorizationType: determination,
          authorizationExplanation: explanation,
        }),
        credentials: "include",
      });
      if (res.ok) {
        router.push(`/projects/${projectId}/payment`);
      }
    } catch {
      // fallback
      router.push(`/projects/${projectId}/payment?auth=${determination}`);
    }
    setSaving(false);
  };

  const showLoading = authLoading || (!!user && !!projectId && loading);
  if (showLoading) {
    return (
      <Navigation>
        <div className="p-6 flex flex-col items-center justify-center min-h-[40vh] gap-3">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-slate-400 text-sm">Loading project…</p>
        </div>
      </Navigation>
    );
  }

  if (!project) {
    return (
      <Navigation>
        <div className="p-6 max-w-2xl mx-auto">
          <p className="text-slate-400">Project not found.</p>
          <Link href="/projects" className="text-blue-400 hover:underline mt-2 inline-block">
            ← Back to projects
          </Link>
        </div>
      </Navigation>
    );
  }

  const canContinue = determination && determination !== "REVIEW";
  const displayLabel =
    determination === "DP"
      ? "Déclaration Préalable"
      : determination === "PC"
        ? "Permis de Construire"
        : determination === "ARCHITECT_REQUIRED"
          ? "Permis de Construire + Architecte"
          : null;

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-2xl mx-auto">
        <Link
          href={`/projects/${projectId}`}
          className="text-sm text-slate-400 hover:text-white inline-flex items-center gap-1 mb-6"
        >
          ← Project overview
        </Link>
        <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <FileCheck className="w-8 h-8 text-blue-400" />
          Type d&apos;autorisation
        </h1>
        <p className="text-slate-400 mb-8">
          Déterminez si votre projet nécessite une déclaration préalable ou un permis de construire.
        </p>

        {project.address && (
          <div className="mb-6 p-4 rounded-xl bg-slate-800/50 border border-white/10 flex items-center gap-3">
            <MapPin className="w-5 h-5 text-slate-400 shrink-0" />
            <div>
              <p className="font-medium text-white">{project.name}</p>
              <p className="text-sm text-slate-400">{project.address}</p>
              {zoneType ? (
                <p className="text-xs text-slate-500 mt-1">Zone: {zoneType}</p>
              ) : (
                <p className="text-xs text-slate-500 mt-1 italic">
                  We were unable to automatically detect your PLU or RNU zone. We will help you determine it after your project has been validated.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mb-8 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-sm text-slate-300">
            Le système vous aide à identifier le type d&apos;autorisation requis. En zone PLU (U, AU, AUD…),
            les règles dépendent des surfaces créées et existantes.
          </p>
        </div>

        {/* Shortcut for advanced users */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">Vous savez déjà ?</h2>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => handleShortcut("DP")}
              className={`px-6 py-3 rounded-xl font-medium transition-all ${determination === "DP" && shortcutUsed
                  ? "bg-emerald-500/30 border-2 border-emerald-500 text-emerald-300"
                  : "bg-slate-800 border border-white/10 text-slate-200 hover:bg-slate-700"
                }`}
            >
              Déclaration Préalable
            </button>
            <button
              type="button"
              onClick={() => handleShortcut("PC")}
              className={`px-6 py-3 rounded-xl font-medium transition-all ${determination === "PC" && shortcutUsed
                  ? "bg-amber-500/30 border-2 border-amber-500 text-amber-300"
                  : "bg-slate-800 border border-white/10 text-slate-200 hover:bg-slate-700"
                }`}
            >
              Permis de Construire
            </button>
          </div>
        </div>

        {/* Or calculate */}
        <div className="mb-8 p-5 rounded-xl bg-slate-800/50 border border-white/10">
          <h2 className="text-lg font-semibold text-white mb-4">Ou laisser le système calculer</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">Type de projet (plusieurs choix possibles)</label>
              <div className="space-y-2">
                {[
                  { value: "new_construction" as ProjectTypeChoice, label: "Construction neuve" },
                  { value: "existing_extension" as ProjectTypeChoice, label: "Extension d'un bâtiment existant" },
                  { value: "outdoor" as ProjectTypeChoice, label: "Aménagement extérieur" },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${projectTypes.includes(opt.value)
                        ? "bg-blue-500/20 border-2 border-blue-500 text-blue-200"
                        : "bg-slate-700 border border-white/10 text-slate-300 hover:bg-slate-600"
                      }`}
                  >
                    <input
                      type="checkbox"
                      checked={projectTypes.includes(opt.value)}
                      onChange={() => toggleProjectType(opt.value)}
                      className="rounded border-white/20 bg-slate-800 text-blue-500 focus:ring-blue-500 w-4 h-4"
                    />
                    <span className="text-sm font-medium">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">
                Surface de plancher créée (m²)
              </label>
              <input
                type="number"
                min={0}
                value={floorAreaCreated}
                onChange={(e) => setFloorAreaCreated(Number(e.target.value) || 0)}
                className="w-full px-4 py-2.5 rounded-lg bg-slate-700 border border-white/10 text-white"
              />
            </div>
            {projectTypes.includes("existing_extension") && (
              <>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">
                    Surface existante avant travaux (m²)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={existingFloorArea}
                    onChange={(e) => setExistingFloorArea(Number(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-700 border border-white/10 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">
                    Emprise au sol de l&apos;extension (m²)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={groundAreaExtension ?? ""}
                    onChange={(e) =>
                      setGroundAreaExtension(e.target.value ? Number(e.target.value) : undefined)
                    }
                    placeholder="Optionnel"
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-700 border border-white/10 text-white"
                  />
                </div>
              </>
            )}
            <button
              type="button"
              onClick={handleCalculate}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500/20 text-blue-300 font-medium hover:bg-blue-500/30"
            >
              <ClipboardList className="w-4 h-4" />
              Calculer le type d&apos;autorisation
            </button>
          </div>
        </div>

        {explanation && (
          <div className="mb-8 p-5 rounded-xl bg-slate-800/50 border border-white/10">
            <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-emerald-400" />
              {displayLabel ?? determination}
            </h3>
            <p className="text-slate-300 text-sm">{explanation}</p>
          </div>
        )}

        <div className="flex gap-3">
          <Link
            href={`/projects/${projectId}`}
            className="px-5 py-2.5 rounded-xl bg-slate-700 text-white font-medium hover:bg-slate-600"
          >
            Retour
          </Link>
          <button
            onClick={handleContinue}
            disabled={!canContinue || saving}
            className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:shadow-lg disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Continuer vers le paiement
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>
    </Navigation>
  );
}
