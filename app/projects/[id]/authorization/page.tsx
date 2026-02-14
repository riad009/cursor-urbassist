"use client";

import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navigation from "@/components/layout/Navigation";
import {
  FileCheck,
  Loader2,
  ArrowRight,
  ArrowLeft,
  MapPin,
  Building2,
  ClipboardList,
  Info,
  HelpCircle,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Waves,
  Home,
  PaintBucket,
  User,
  Briefcase,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  calculateDpPc,
  type ProjectTypeChoice,
  type DeterminationType,
  type SubmitterType,
} from "@/lib/dp-pc-calculator";
import {
  DP_DOCUMENTS,
  PC_DOCUMENTS,
  PC_ADDITIONAL_NOTES,
  getDocumentsForType,
} from "@/lib/authorization-documents";

type WizardStep = "choice" | "check-project" | "check-area" | "check-shelter" | "check-submitter" | "result";

type CheckProjectType = "new_construction" | "existing_extension" | "swimming_pool";

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

  // Wizard state
  const [wizardStep, setWizardStep] = useState<WizardStep>("choice");
  const [determination, setDetermination] = useState<DeterminationType | null>(null);
  const [explanation, setExplanation] = useState("");
  const [architectRequired, setArchitectRequired] = useState(false);
  const [cannotOffer, setCannotOffer] = useState(false);

  // "Check for me" state
  const [checkProjectType, setCheckProjectType] = useState<CheckProjectType | null>(null);
  const [checkArea, setCheckArea] = useState(20);
  const [checkExistingArea, setCheckExistingArea] = useState(0);
  const [checkShelterHeight, setCheckShelterHeight] = useState(1.5);
  const [checkSubmitterType, setCheckSubmitterType] = useState<SubmitterType | null>(null);

  // Options
  const [wantPluAnalysis, setWantPluAnalysis] = useState(false);
  const [wantCerfaFill, setWantCerfaFill] = useState(false);

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

  // ── Direct shortcut (DP or PC) ──

  const handleDirectChoice = (type: "DP" | "PC") => {
    setDetermination(type);
    setExplanation(
      type === "DP"
        ? "Vous avez indiqué qu'une déclaration préalable suffit pour votre projet."
        : "Vous avez indiqué qu'un permis de construire est requis pour votre projet."
    );
    setArchitectRequired(false);
    setCannotOffer(false);
    setWizardStep("result");
  };

  // ── "Check for me" wizard navigation ──

  const handleCheckStart = () => {
    setWizardStep("check-project");
    setCheckProjectType(null);
    setDetermination(null);
    setExplanation("");
  };

  const handleCheckProjectNext = () => {
    if (!checkProjectType) return;
    setWizardStep("check-area");
  };

  const handleCheckAreaNext = () => {
    if (checkProjectType === "swimming_pool" && checkArea >= 10 && checkArea <= 100) {
      // Ask about shelter height
      setWizardStep("check-shelter");
      return;
    }
    // Calculate and see if we need to ask submitter type
    performCalculation();
  };

  const handleCheckShelterNext = () => {
    performCalculation();
  };

  const performCalculation = (overrideSubmitter?: SubmitterType) => {
    if (!checkProjectType) return;

    const submitter = overrideSubmitter ?? checkSubmitterType ?? undefined;
    const result = calculateDpPc({
      projectType: checkProjectType,
      floorAreaCreated: checkArea,
      existingFloorArea: checkProjectType === "existing_extension" ? checkExistingArea : undefined,
      inUrbanZone,
      submitterType: submitter,
      shelterHeight: checkProjectType === "swimming_pool" ? checkShelterHeight : undefined,
    });

    // If PC is determined and we haven't asked submitter type yet, ask now
    if (
      (result.determination === "PC" || result.determination === "ARCHITECT_REQUIRED") &&
      !overrideSubmitter &&
      !checkSubmitterType
    ) {
      setDetermination(result.determination);
      setExplanation(result.explanation);
      setArchitectRequired(result.architectRequired ?? false);
      setCannotOffer(result.cannotOffer ?? false);
      setWizardStep("check-submitter");
      return;
    }

    setDetermination(result.determination);
    setExplanation(result.explanation);
    setArchitectRequired(result.architectRequired ?? false);
    setCannotOffer(result.cannotOffer ?? false);
    setWizardStep("result");
  };

  const handleSubmitterChoice = (type: SubmitterType) => {
    setCheckSubmitterType(type);
    performCalculation(type);
  };

  // ── Continue to payment ──

  const handleContinue = async () => {
    if (!determination || !projectId || determination === "REVIEW" || determination === "NONE") return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorizationType: determination === "ARCHITECT_REQUIRED" ? "PC" : determination,
          authorizationExplanation: explanation,
          wantPluAnalysis,
          wantCerfaFill,
          architectRequired,
        }),
        credentials: "include",
      });
      if (res.ok) {
        router.push(`/projects/${projectId}/payment`);
      }
    } catch {
      router.push(`/projects/${projectId}/payment?auth=${determination}`);
    }
    setSaving(false);
  };

  // ── Render ──

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

  const documents = getDocumentsForType(determination);
  const isPC = determination === "PC" || determination === "ARCHITECT_REQUIRED";
  const canContinue = determination && determination !== "REVIEW" && determination !== "NONE" && !cannotOffer;

  const displayLabel =
    determination === "DP"
      ? "Déclaration Préalable"
      : determination === "PC"
        ? "Permis de Construire"
        : determination === "ARCHITECT_REQUIRED"
          ? "Permis de Construire + Architecte obligatoire"
          : determination === "NONE"
            ? "Aucune autorisation nécessaire"
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
          De quoi avez-vous besoin ?
        </h1>
        <p className="text-slate-400 mb-8">
          Déterminez le type d&apos;autorisation requis pour votre projet et découvrez les documents qui seront produits.
        </p>

        {/* Project info bar */}
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
                  Zone PLU/RNU non détectée automatiquement.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* STEP: choice — Three main options */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {wizardStep === "choice" && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => handleDirectChoice("DP")}
              className="w-full flex items-start gap-4 p-5 rounded-2xl bg-slate-800/50 border border-white/10 text-left hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/30">
                <ClipboardList className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-white text-lg">Déclaration Préalable</p>
                <p className="text-sm text-slate-400 mt-1">
                  Je sais que j&apos;ai besoin d&apos;une déclaration préalable de travaux.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleDirectChoice("PC")}
              className="w-full flex items-start gap-4 p-5 rounded-2xl bg-slate-800/50 border border-white/10 text-left hover:border-amber-500/40 hover:bg-amber-500/5 transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0 group-hover:bg-amber-500/30">
                <Building2 className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <p className="font-semibold text-white text-lg">Permis de Construire</p>
                <p className="text-sm text-slate-400 mt-1">
                  Je sais que j&apos;ai besoin d&apos;un permis de construire.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={handleCheckStart}
              className="w-full flex items-start gap-4 p-5 rounded-2xl bg-slate-800/50 border border-white/10 text-left hover:border-blue-500/40 hover:bg-blue-500/5 transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0 group-hover:bg-blue-500/30">
                <HelpCircle className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <p className="font-semibold text-white text-lg">Vérifiez pour moi</p>
                <p className="text-sm text-slate-400 mt-1">
                  Je ne sais pas, aidez-moi à déterminer le type d&apos;autorisation nécessaire.
                </p>
              </div>
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* STEP: check-project — "What is your project?" */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {wizardStep === "check-project" && (
          <div className="space-y-5">
            <div className="mb-2 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-sm text-slate-300">
                Répondez à quelques questions pour déterminer automatiquement le type d&apos;autorisation requis.
              </p>
            </div>

            <h2 className="text-lg font-semibold text-white">Quel est votre projet ?</h2>
            <div className="space-y-3">
              {([
                { value: "new_construction" as CheckProjectType, label: "Construction neuve (indépendante)", icon: Home, desc: "Maison, garage, abri de jardin, annexe…" },
                { value: "existing_extension" as CheckProjectType, label: "Travaux sur bâtiment existant", icon: PaintBucket, desc: "Extension, surélévation, modification de façade, changement d'usage…" },
                { value: "swimming_pool" as CheckProjectType, label: "Piscine", icon: Waves, desc: "Construction d'une piscine avec ou sans abri" },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCheckProjectType(opt.value)}
                  className={`w-full flex items-start gap-4 p-4 rounded-xl text-left transition-all ${checkProjectType === opt.value
                      ? "bg-blue-500/20 border-2 border-blue-500 ring-1 ring-blue-500/30"
                      : "bg-slate-800/50 border border-white/10 hover:bg-slate-800 hover:border-white/20"
                    }`}
                >
                  <opt.icon className={`w-5 h-5 shrink-0 mt-0.5 ${checkProjectType === opt.value ? "text-blue-400" : "text-slate-500"}`} />
                  <div>
                    <p className={`font-medium ${checkProjectType === opt.value ? "text-blue-200" : "text-white"}`}>
                      {opt.label}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setWizardStep("choice")}
                className="px-5 py-2.5 rounded-xl bg-slate-700 text-white font-medium hover:bg-slate-600 inline-flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Retour
              </button>
              <button
                type="button"
                onClick={handleCheckProjectNext}
                disabled={!checkProjectType}
                className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:shadow-lg disabled:opacity-50"
              >
                Suivant <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* STEP: check-area — "What surface area?" */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {wizardStep === "check-area" && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-white">
              {checkProjectType === "swimming_pool"
                ? "Quelle est la surface du bassin ?"
                : "Quelle surface sera créée ?"}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">
                  {checkProjectType === "swimming_pool"
                    ? "Surface du bassin (m²)"
                    : "Surface de plancher créée (m²)"}
                </label>
                <input
                  type="number"
                  min={0}
                  value={checkArea}
                  onChange={(e) => setCheckArea(Number(e.target.value) || 0)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-white/10 text-white text-lg font-medium"
                />
              </div>

              {checkProjectType === "existing_extension" && (
                <div>
                  <label className="block text-sm text-slate-400 mb-2">
                    Surface existante avant travaux (m²)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={checkExistingArea}
                    onChange={(e) => setCheckExistingArea(Number(e.target.value) || 0)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-white/10 text-white"
                  />
                </div>
              )}

              {/* Quick reference */}
              <div className="p-3 rounded-xl bg-slate-800/50 border border-white/10">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Rappel des seuils</p>
                {checkProjectType === "new_construction" && (
                  <ul className="text-xs text-slate-500 space-y-1">
                    <li>• Moins de 5 m² → Aucune autorisation</li>
                    <li>• 5 à 20 m² → Déclaration préalable</li>
                    <li>• Plus de 20 m² → Permis de construire</li>
                    <li>• Surface totale {">"} 150 m² → Architecte obligatoire</li>
                  </ul>
                )}
                {checkProjectType === "existing_extension" && (
                  <ul className="text-xs text-slate-500 space-y-1">
                    <li>• Moins de 20 m² → Déclaration préalable</li>
                    <li>• 20 à 40 m² en zone urbaine → Vérification surface totale</li>
                    <li>• Plus de 40 m² → Permis de construire</li>
                    <li>• Surface totale {">"} 150 m² → Architecte obligatoire</li>
                  </ul>
                )}
                {checkProjectType === "swimming_pool" && (
                  <ul className="text-xs text-slate-500 space-y-1">
                    <li>• Moins de 10 m² → Aucune autorisation</li>
                    <li>• 10 à 100 m² → Déclaration préalable</li>
                    <li>• Abri {">"} 1,80 m → Permis de construire</li>
                    <li>• Plus de 100 m² → Permis de construire</li>
                  </ul>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setWizardStep("check-project")}
                className="px-5 py-2.5 rounded-xl bg-slate-700 text-white font-medium hover:bg-slate-600 inline-flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Retour
              </button>
              <button
                type="button"
                onClick={handleCheckAreaNext}
                className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:shadow-lg"
              >
                Suivant <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* STEP: check-shelter — Swimming pool shelter height */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {wizardStep === "check-shelter" && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-white">Votre piscine a-t-elle un abri ?</h2>
            <p className="text-sm text-slate-400">
              Si l&apos;abri dépasse 1,80 m de hauteur, un permis de construire est nécessaire au lieu d&apos;une déclaration préalable.
            </p>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => { setCheckShelterHeight(0); handleCheckShelterNext(); }}
                className="w-full p-4 rounded-xl bg-slate-800/50 border border-white/10 text-left hover:bg-slate-800 hover:border-white/20 transition-all"
              >
                <p className="font-medium text-white">Pas d&apos;abri</p>
                <p className="text-xs text-slate-500 mt-0.5">Piscine à ciel ouvert</p>
              </button>
              <button
                type="button"
                onClick={() => { setCheckShelterHeight(1.5); handleCheckShelterNext(); }}
                className="w-full p-4 rounded-xl bg-slate-800/50 border border-white/10 text-left hover:bg-slate-800 hover:border-white/20 transition-all"
              >
                <p className="font-medium text-white">Abri ≤ 1,80 m</p>
                <p className="text-xs text-slate-500 mt-0.5">Couverture basse ou volet roulant</p>
              </button>
              <button
                type="button"
                onClick={() => { setCheckShelterHeight(2.0); handleCheckShelterNext(); }}
                className="w-full p-4 rounded-xl bg-slate-800/50 border border-white/10 text-left hover:bg-slate-800 hover:border-white/20 transition-all"
              >
                <p className="font-medium text-white">Abri {">"} 1,80 m</p>
                <p className="text-xs text-slate-500 mt-0.5">Abri haut permettant de se tenir debout</p>
              </button>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setWizardStep("check-area")}
                className="px-5 py-2.5 rounded-xl bg-slate-700 text-white font-medium hover:bg-slate-600 inline-flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Retour
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* STEP: check-submitter — Individual or company? */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {wizardStep === "check-submitter" && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-white">
              Déposez-vous en tant que particulier ou entreprise ?
            </h2>
            <p className="text-sm text-slate-400">
              Si vous déposez en tant qu&apos;entreprise (personne morale), le recours à un architecte est obligatoire pour un permis de construire.
            </p>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => handleSubmitterChoice("individual")}
                className="w-full flex items-center gap-4 p-5 rounded-xl bg-slate-800/50 border border-white/10 text-left hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all"
              >
                <User className="w-6 h-6 text-emerald-400" />
                <div>
                  <p className="font-medium text-white">Particulier</p>
                  <p className="text-xs text-slate-500 mt-0.5">Personne physique</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleSubmitterChoice("company")}
                className="w-full flex items-center gap-4 p-5 rounded-xl bg-slate-800/50 border border-white/10 text-left hover:border-amber-500/40 hover:bg-amber-500/5 transition-all"
              >
                <Briefcase className="w-6 h-6 text-amber-400" />
                <div>
                  <p className="font-medium text-white">Entreprise</p>
                  <p className="text-xs text-slate-500 mt-0.5">Personne morale (SCI, SARL, etc.)</p>
                </div>
              </button>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setWizardStep("check-area")}
                className="px-5 py-2.5 rounded-xl bg-slate-700 text-white font-medium hover:bg-slate-600 inline-flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Retour
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* STEP: result — Determination + Document list + Options */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {wizardStep === "result" && (
          <div className="space-y-6">
            {/* Determination result */}
            {explanation && (
              <div className={`p-5 rounded-xl border ${determination === "NONE"
                  ? "bg-slate-800/50 border-slate-500/30"
                  : determination === "DP"
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : determination === "ARCHITECT_REQUIRED"
                      ? "bg-red-500/10 border-red-500/30"
                      : "bg-amber-500/10 border-amber-500/30"
                }`}>
                <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
                  {determination === "NONE" ? (
                    <CheckCircle2 className="w-5 h-5 text-slate-400" />
                  ) : determination === "DP" ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : determination === "ARCHITECT_REQUIRED" ? (
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                  ) : (
                    <Building2 className="w-5 h-5 text-amber-400" />
                  )}
                  {displayLabel ?? determination}
                </h3>
                <p className="text-slate-300 text-sm">{explanation}</p>
                {cannotOffer && (
                  <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-xs text-red-300">
                      <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                      Ce type de projet nécessite le recours à un architecte. Notre plateforme ne peut pas prendre en charge ce dossier.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Document list — show for DP and PC */}
            {determination && determination !== "NONE" && determination !== "REVIEW" && (
              <div className="p-5 rounded-xl bg-slate-800/50 border border-white/10">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-400" />
                  Documents qui seront produits
                </h3>
                <ul className="space-y-2">
                  {documents.map((doc) => (
                    <li
                      key={doc.code}
                      className="flex items-center gap-3 p-3 rounded-xl bg-slate-700/50 border border-white/5"
                    >
                      <span className="text-xs font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-1 rounded shrink-0">
                        {doc.code}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white">{doc.label}</p>
                        {doc.description && (
                          <p className="text-xs text-slate-500 mt-0.5">{doc.description}</p>
                        )}
                      </div>
                      <CheckCircle2 className="w-4 h-4 text-emerald-500/50 shrink-0" />
                    </li>
                  ))}
                </ul>
                {isPC && (
                  <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <p className="text-xs font-medium text-amber-300 mb-1.5">
                      <Info className="w-3.5 h-3.5 inline mr-1" />
                      Notes pour les maisons individuelles
                    </p>
                    <ul className="text-xs text-slate-400 space-y-1">
                      {PC_ADDITIONAL_NOTES.map((note, i) => (
                        <li key={i}>• {note}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Optional features */}
            {determination && determination !== "NONE" && determination !== "REVIEW" && !cannotOffer && (
              <div className="p-5 rounded-xl bg-slate-800/50 border border-white/10">
                <h3 className="font-semibold text-white mb-4">Options complémentaires</h3>
                <div className="space-y-3">
                  <label
                    className={`flex items-start gap-3 p-4 rounded-xl cursor-pointer transition-all ${wantPluAnalysis
                        ? "bg-blue-500/15 border-2 border-blue-500 ring-1 ring-blue-500/20"
                        : "bg-slate-700/50 border border-white/10 hover:bg-slate-700"
                      }`}
                  >
                    <input
                      type="checkbox"
                      checked={wantPluAnalysis}
                      onChange={(e) => setWantPluAnalysis(e.target.checked)}
                      className="mt-1 rounded border-white/20 bg-slate-800 text-blue-500 focus:ring-blue-500 w-4 h-4"
                    />
                    <div>
                      <p className={`font-medium text-sm ${wantPluAnalysis ? "text-blue-200" : "text-white"}`}>
                        Analyse PLU / RNU
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Vérification automatique de la conformité de votre projet avec le règlement d&apos;urbanisme applicable.
                        Cette analyse sera intégrée dans votre plan de masse et votre notice descriptive.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-3 p-4 rounded-xl cursor-pointer transition-all ${wantCerfaFill
                        ? "bg-blue-500/15 border-2 border-blue-500 ring-1 ring-blue-500/20"
                        : "bg-slate-700/50 border border-white/10 hover:bg-slate-700"
                      }`}
                  >
                    <input
                      type="checkbox"
                      checked={wantCerfaFill}
                      onChange={(e) => setWantCerfaFill(e.target.checked)}
                      className="mt-1 rounded border-white/20 bg-slate-800 text-blue-500 focus:ring-blue-500 w-4 h-4"
                    />
                    <div>
                      <p className={`font-medium text-sm ${wantCerfaFill ? "text-blue-200" : "text-white"}`}>
                        Pré-remplissage CERFA automatique
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Remplissage automatique du formulaire CERFA de votre autorisation d&apos;urbanisme à partir des informations du projet.
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* PLU analysis suggestion when not selected */}
            {determination && determination !== "NONE" && determination !== "REVIEW" && !cannotOffer && !wantPluAnalysis && (
              <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-slate-300">
                    <span className="font-medium text-blue-300">Conseil :</span> L&apos;analyse PLU/RNU est recommandée
                    pour vérifier la conformité réglementaire de votre projet et générer une notice descriptive complète.
                  </p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setWizardStep("choice");
                  setDetermination(null);
                  setExplanation("");
                  setArchitectRequired(false);
                  setCannotOffer(false);
                  setCheckProjectType(null);
                  setCheckSubmitterType(null);
                }}
                className="px-5 py-2.5 rounded-xl bg-slate-700 text-white font-medium hover:bg-slate-600 inline-flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Recommencer
              </button>
              {canContinue && (
                <button
                  onClick={handleContinue}
                  disabled={saving}
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
              )}
              {determination === "NONE" && (
                <Link
                  href={`/projects/${projectId}`}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-700 text-white font-semibold hover:bg-slate-600"
                >
                  Retour au projet <ArrowRight className="w-5 h-5" />
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </Navigation>
  );
}
