"use client";

import React, { useState, use, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navigation from "@/components/layout/Navigation";
import { NextStepButton } from "@/components/NextStepButton";
import {
  FileText,
  ClipboardCheck,
  HelpCircle,
  Building2,
  Hammer,
  TreePine,
  ChevronRight,
  ChevronLeft,
  Calculator,
  Loader2,
  AlertTriangle,
  Check,
  Droplets,
  Fence,
  PenTool,
  User,
  Briefcase,
  Info,
  Shield,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import {
  calculateDpPc,
  estimateFloorAreaCreated,
  type DpPcInput,
  type ProjectTypeChoice,
  type SubmitterType,
  type DeterminationType,
} from "@/lib/dp-pc-calculator";
import {
  getDocumentsForType,
} from "@/lib/authorization-documents";

// ─── Types ──────────────────────────────────────────────────────────────────

type WizardStep =
  | "choice"           // DP / PC / Check for me
  | "check-category"   // Independent / Extension / Outdoor
  | "outdoor-detail"   // Swimming pool / Fence / Other
  | "check-area"       // Surface area input
  | "pool-shelter"     // Swimming pool shelter height
  | "check-submitter"  // Individual vs Company (only for PC)
  | "result";          // Final result + documents + options

type ProjectCategory = "new_construction" | "existing_extension" | "outdoor";
type OutdoorSubType = "swimming_pool" | "fence_gate" | "free_text";

interface AreaRange {
  label: string;
  min: number;
  max: number;
  value: number;
}

const NEW_CONSTRUCTION_RANGES: AreaRange[] = [
  { label: "< 5 m²", min: 0, max: 4.99, value: 3 },
  { label: "5 – 20 m²", min: 5, max: 20, value: 12 },
  { label: "> 20 m²", min: 20.01, max: 999, value: 30 },
];

const EXTENSION_RANGES_URBAN: AreaRange[] = [
  { label: "< 20 m²", min: 0, max: 19.99, value: 10 },
  { label: "20 – 40 m²", min: 20, max: 40, value: 30 },
  { label: "> 40 m²", min: 40.01, max: 999, value: 50 },
];

const EXTENSION_RANGES_NON_URBAN: AreaRange[] = [
  { label: "< 20 m²", min: 0, max: 19.99, value: 10 },
  { label: "> 20 m²", min: 20.01, max: 999, value: 30 },
];

const POOL_RANGES: AreaRange[] = [
  { label: "< 10 m²", min: 0, max: 9.99, value: 6 },
  { label: "10 – 100 m²", min: 10, max: 100, value: 40 },
  { label: "> 100 m²", min: 100.01, max: 999, value: 120 },
];

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AuthorizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const { user } = useAuth();
  const router = useRouter();

  // Wizard state
  const [step, setStep] = useState<WizardStep>("choice");
  const [saving, setSaving] = useState(false);

  // Choice: direct DP/PC or "check for me"
  const [directChoice, setDirectChoice] = useState<"DP" | "PC" | null>(null);

  // Check for me state
  const [category, setCategory] = useState<ProjectCategory | null>(null);
  const [outdoorSubType, setOutdoorSubType] = useState<OutdoorSubType | null>(null);
  const [freeTextDescription, setFreeTextDescription] = useState("");

  // Area inputs
  const [floorArea, setFloorArea] = useState<number>(0);
  const [existingArea, setExistingArea] = useState<number>(0);
  const [selectedRange, setSelectedRange] = useState<AreaRange | null>(null);
  const [useEstimator, setUseEstimator] = useState(false);
  const [footprint, setFootprint] = useState<number>(0);
  const [levels, setLevels] = useState<number>(1);
  const [isUrbanZone, setIsUrbanZone] = useState(true);

  // Pool
  const [shelterHeight, setShelterHeight] = useState<number>(0);
  const [hasShelter, setHasShelter] = useState<boolean | null>(null);

  // Submitter
  const [submitterType, setSubmitterType] = useState<SubmitterType | null>(null);

  // Result
  const [result, setResult] = useState<{
    determination: DeterminationType;
    explanation: string;
    architectRequired?: boolean;
    cannotOffer?: boolean;
  } | null>(null);

  // Options
  const [wantPluAnalysis, setWantPluAnalysis] = useState(true);
  const [wantCerfa, setWantCerfa] = useState(true);

  // Project data for context
  const [projectData, setProjectData] = useState<{
    name?: string;
    zoneType?: string;
    address?: string;
  } | null>(null);

  // Load project data
  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.project) {
          setProjectData({
            name: d.project.name,
            zoneType: d.project.zoneType,
            address: d.project.address,
          });
          // Auto-detect urban zone from PLU zone
          const zone = (d.project.zoneType || "").toUpperCase();
          if (zone.startsWith("U") || zone.startsWith("AU")) {
            setIsUrbanZone(true);
          } else if (zone === "RNU" || zone.startsWith("A") || zone.startsWith("N")) {
            setIsUrbanZone(false);
          }
        }
      })
      .catch(() => { });
  }, [projectId]);

  // Estimator effect
  useEffect(() => {
    if (useEstimator && footprint > 0 && levels >= 1) {
      setFloorArea(estimateFloorAreaCreated(footprint, levels));
    }
  }, [useEstimator, footprint, levels]);

  // ─── Compute result ─────────────────────────────────────────────────

  function computeResult() {
    let projectType: ProjectTypeChoice;
    let area = floorArea;

    if (directChoice) {
      // Direct choice path
      setResult({
        determination: directChoice,
        explanation: directChoice === "DP"
          ? "Vous avez choisi une Déclaration Préalable. Voici les documents nécessaires à votre dossier."
          : "Vous avez choisi un Permis de Construire. Voici les documents nécessaires à votre dossier.",
      });
      return;
    }

    // Check for me path
    if (category === "outdoor") {
      if (outdoorSubType === "fence_gate") {
        projectType = "outdoor_fence";
        area = 0;
      } else if (outdoorSubType === "swimming_pool") {
        projectType = "swimming_pool";
      } else if (outdoorSubType === "free_text") {
        projectType = "outdoor_other";
        area = 0;
      } else {
        projectType = "outdoor";
        area = 0;
      }
    } else if (category === "new_construction") {
      projectType = "new_construction";
    } else {
      projectType = "existing_extension";
    }

    // Use range value if selected and no custom area
    if (selectedRange && area === 0) {
      area = selectedRange.value;
    }

    const input: DpPcInput = {
      projectType,
      floorAreaCreated: area,
      existingFloorArea: category === "existing_extension" ? existingArea : undefined,
      inUrbanZone: isUrbanZone,
      submitterType: submitterType || undefined,
      shelterHeight: outdoorSubType === "swimming_pool" ? shelterHeight : undefined,
    };

    const dpPcResult = calculateDpPc(input);
    setResult(dpPcResult);
  }

  // ─── Navigation helpers ─────────────────────────────────────────────

  function handleDirectChoice(choice: "DP" | "PC") {
    setDirectChoice(choice);
    computeDirectResult(choice);
    setStep("result");
  }

  function computeDirectResult(choice: "DP" | "PC") {
    setResult({
      determination: choice,
      explanation: choice === "DP"
        ? "Vous avez choisi une Déclaration Préalable. Voici les documents nécessaires à votre dossier."
        : "Vous avez choisi un Permis de Construire. Voici les documents nécessaires à votre dossier.",
    });
  }

  function handleCheckForMe() {
    setStep("check-category");
  }

  function handleCategorySelect(cat: ProjectCategory) {
    setCategory(cat);
    if (cat === "outdoor") {
      setStep("outdoor-detail");
    } else {
      setStep("check-area");
    }
  }

  function handleOutdoorSubType(sub: OutdoorSubType) {
    setOutdoorSubType(sub);
    if (sub === "fence_gate") {
      // Fence always DP, go to result directly
      const fenceResult = calculateDpPc({ projectType: "outdoor_fence", floorAreaCreated: 0 });
      setResult(fenceResult);
      setStep("result");
    } else if (sub === "swimming_pool") {
      setStep("check-area");
    } else {
      // free text → result with REVIEW
      setResult({
        determination: "REVIEW",
        explanation: "Pour cet aménagement extérieur, le type d'autorisation dépend de la nature exacte des travaux. Nous vous recommandons de vérifier auprès de votre mairie.",
      });
      setStep("result");
    }
  }

  function handleAreaNext() {
    if (outdoorSubType === "swimming_pool" && floorArea >= 10 && floorArea <= 100) {
      setStep("pool-shelter");
    } else {
      // Compute and check if submitter question is needed
      computeAndCheckSubmitter();
    }
  }

  function handlePoolShelterNext() {
    computeAndCheckSubmitter();
  }

  function computeAndCheckSubmitter() {
    // Temporarily compute to check if we need submitter question
    let projectType: ProjectTypeChoice;
    let area = floorArea;

    if (category === "outdoor" && outdoorSubType === "swimming_pool") {
      projectType = "swimming_pool";
    } else if (category === "new_construction") {
      projectType = "new_construction";
    } else {
      projectType = "existing_extension";
    }

    if (selectedRange && area === 0) {
      area = selectedRange.value;
    }

    const input: DpPcInput = {
      projectType,
      floorAreaCreated: area,
      existingFloorArea: category === "existing_extension" ? existingArea : undefined,
      inUrbanZone: isUrbanZone,
      shelterHeight: outdoorSubType === "swimming_pool" ? shelterHeight : undefined,
    };

    const tempResult = calculateDpPc(input);

    // Only ask for submitter if result is PC (not DP or NONE)
    if (tempResult.determination === "PC") {
      setStep("check-submitter");
    } else {
      setResult(tempResult);
      setStep("result");
    }
  }

  function handleSubmitterNext() {
    computeResult();
    setStep("result");
  }

  function goBack() {
    switch (step) {
      case "check-category":
        setStep("choice");
        break;
      case "outdoor-detail":
        setStep("check-category");
        break;
      case "check-area":
        if (category === "outdoor") {
          setStep("outdoor-detail");
        } else {
          setStep("check-category");
        }
        break;
      case "pool-shelter":
        setStep("check-area");
        break;
      case "check-submitter":
        if (outdoorSubType === "swimming_pool") {
          if (floorArea >= 10 && floorArea <= 100) {
            setStep("pool-shelter");
          } else {
            setStep("check-area");
          }
        } else {
          setStep("check-area");
        }
        break;
      case "result":
        if (directChoice) {
          setDirectChoice(null);
          setResult(null);
          setStep("choice");
        } else {
          setResult(null);
          // Go back to the step before result
          if (category === "outdoor" && outdoorSubType === "fence_gate") {
            setStep("outdoor-detail");
          } else if (category === "outdoor" && outdoorSubType === "free_text") {
            setStep("outdoor-detail");
          } else if (submitterType) {
            setStep("check-submitter");
          } else {
            setStep("check-area");
          }
        }
        break;
    }
  }

  // ─── Save & Continue ────────────────────────────────────────────────

  async function saveAndContinue() {
    if (!result) return;
    setSaving(true);
    try {
      const determination = result.determination === "ARCHITECT_REQUIRED" ? "PC" : result.determination;
      await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorizationType: determination,
          authorizationExplanation: result.explanation,
          projectType: category === "new_construction" ? "construction"
            : category === "existing_extension" ? "extension"
              : category === "outdoor" ? "outdoor"
                : undefined,
          projectDescription: {
            category,
            outdoorSubType,
            freeTextDescription: freeTextDescription || undefined,
            floorAreaCreated: floorArea || undefined,
            existingFloorArea: existingArea || undefined,
            submitterType,
            architectRequired: result.architectRequired || false,
            wantPluAnalysis,
            wantCerfa,
            isUrbanZone,
            shelterHeight: shelterHeight || undefined,
          },
        }),
      });
      router.push(`/projects/${projectId}/payment`);
    } catch (err) {
      console.error("Save failed:", err);
    }
    setSaving(false);
  }

  // ─── Step Progress ──────────────────────────────────────────────────

  const stepLabels = ["Type", "Détails", "Résultat"];
  const stepIndex = step === "choice" ? 0
    : step === "result" ? 2
      : 1;

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <Navigation>
      <div className="min-h-screen p-4 lg:p-8">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-white">
              Autorisation d&apos;urbanisme
            </h1>
            {projectData?.name && (
              <p className="text-sm text-slate-400">{projectData.name}</p>
            )}
            {projectData?.zoneType && (
              <span className="inline-block px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-400 text-xs font-semibold">
                Zone {projectData.zoneType}
              </span>
            )}
          </div>

          {/* Step progress */}
          <div className="flex items-center justify-center gap-2">
            {stepLabels.map((label, i) => (
              <React.Fragment key={label}>
                {i > 0 && <div className={cn("w-12 h-0.5", i <= stepIndex ? "bg-blue-500" : "bg-slate-700")} />}
                <div className="flex items-center gap-1.5">
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                    i < stepIndex ? "bg-blue-500 text-white" :
                      i === stepIndex ? "bg-blue-500/20 text-blue-400 ring-2 ring-blue-500/50" :
                        "bg-slate-800 text-slate-500"
                  )}>
                    {i < stepIndex ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className={cn("text-xs font-medium hidden sm:inline", i === stepIndex ? "text-blue-400" : "text-slate-500")}>
                    {label}
                  </span>
                </div>
              </React.Fragment>
            ))}
          </div>

          {/* ═══ STEP: Initial Choice ═══ */}
          {step === "choice" && (
            <div className="space-y-4">
              <p className="text-center text-slate-300 text-sm">
                De quelle autorisation avez-vous besoin ?
              </p>
              <div className="grid gap-3">
                <ChoiceCard
                  icon={<FileText className="w-6 h-6" />}
                  title="Déclaration Préalable (DP)"
                  description="Travaux légers : petites extensions, clôtures, piscines, modifications extérieures"
                  color="emerald"
                  onClick={() => handleDirectChoice("DP")}
                />
                <ChoiceCard
                  icon={<ClipboardCheck className="w-6 h-6" />}
                  title="Permis de Construire (PC)"
                  description="Constructions importantes, extensions > 40 m², changement de destination"
                  color="purple"
                  onClick={() => handleDirectChoice("PC")}
                />
                <ChoiceCard
                  icon={<HelpCircle className="w-6 h-6" />}
                  title="Je ne sais pas, vérifiez pour moi"
                  description="Répondez à quelques questions pour déterminer l'autorisation requise"
                  color="blue"
                  onClick={handleCheckForMe}
                  highlight
                />
              </div>
            </div>
          )}

          {/* ═══ STEP: Category Selection ═══ */}
          {step === "check-category" && (
            <div className="space-y-4">
              <BackButton onClick={goBack} />
              <p className="text-center text-slate-300 text-sm">
                Quel type de projet réalisez-vous ?
              </p>
              <p className="text-center text-slate-500 text-xs">
                Vous pouvez sélectionner une seule catégorie
              </p>
              <div className="grid gap-3">
                <ChoiceCard
                  icon={<Building2 className="w-6 h-6" />}
                  title="Construction indépendante"
                  description="Maison, garage, abri de jardin, annexe, carport, serre"
                  color="blue"
                  onClick={() => handleCategorySelect("new_construction")}
                />
                <ChoiceCard
                  icon={<Hammer className="w-6 h-6" />}
                  title="Travaux sur bâtiment existant"
                  description="Extension, surélévation, modification de façade, changement d'usage"
                  color="amber"
                  onClick={() => handleCategorySelect("existing_extension")}
                />
                <ChoiceCard
                  icon={<TreePine className="w-6 h-6" />}
                  title="Aménagement extérieur"
                  description="Piscine, clôture, portail, terrasse, mur"
                  color="emerald"
                  onClick={() => handleCategorySelect("outdoor")}
                />
              </div>
            </div>
          )}

          {/* ═══ STEP: Outdoor Detail ═══ */}
          {step === "outdoor-detail" && (
            <div className="space-y-4">
              <BackButton onClick={goBack} />
              <p className="text-center text-slate-300 text-sm">
                Quel type d&apos;aménagement extérieur ?
              </p>
              <div className="grid gap-3">
                <ChoiceCard
                  icon={<Droplets className="w-6 h-6" />}
                  title="Piscine"
                  description="Bassin, abri de piscine, couverture"
                  color="blue"
                  onClick={() => handleOutdoorSubType("swimming_pool")}
                />
                <ChoiceCard
                  icon={<Fence className="w-6 h-6" />}
                  title="Clôture et/ou portail"
                  description="Soumis à déclaration préalable"
                  color="emerald"
                  onClick={() => handleOutdoorSubType("fence_gate")}
                  badge="→ DP"
                />
                <ChoiceCard
                  icon={<PenTool className="w-6 h-6" />}
                  title="Autre aménagement"
                  description="Terrasse, mur, abri de jardin fixe, etc."
                  color="slate"
                  onClick={() => handleOutdoorSubType("free_text")}
                />
              </div>
              {outdoorSubType === "free_text" && (
                <div className="rounded-xl bg-slate-800/60 border border-white/10 p-4">
                  <label className="text-sm text-slate-300 mb-2 block">Décrivez votre projet :</label>
                  <textarea
                    value={freeTextDescription}
                    onChange={(e) => setFreeTextDescription(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-slate-700/60 border border-white/10 text-white placeholder-slate-500 text-sm resize-none"
                    rows={3}
                    placeholder="Ex: Terrasse en bois de 25 m², muret de soutènement..."
                  />
                </div>
              )}
            </div>
          )}

          {/* ═══ STEP: Area Input ═══ */}
          {step === "check-area" && (
            <div className="space-y-4">
              <BackButton onClick={goBack} />
              <p className="text-center text-slate-300 text-sm">
                {outdoorSubType === "swimming_pool"
                  ? "Quelle est la surface du bassin ?"
                  : category === "new_construction"
                    ? "Quelle surface de plancher allez-vous créer ?"
                    : "Quelle surface de plancher l'extension va-t-elle créer ?"}
              </p>

              {/* Quick range buttons */}
              <div className="flex flex-wrap gap-2 justify-center">
                {(outdoorSubType === "swimming_pool"
                  ? POOL_RANGES
                  : category === "new_construction"
                    ? NEW_CONSTRUCTION_RANGES
                    : isUrbanZone
                      ? EXTENSION_RANGES_URBAN
                      : EXTENSION_RANGES_NON_URBAN
                ).map((range) => (
                  <button
                    key={range.label}
                    type="button"
                    onClick={() => {
                      setSelectedRange(range);
                      setFloorArea(range.value);
                      setUseEstimator(false);
                    }}
                    className={cn(
                      "px-4 py-2.5 rounded-xl text-sm font-medium transition-all border",
                      selectedRange?.label === range.label
                        ? "bg-blue-500/20 text-blue-400 border-blue-500/40 ring-2 ring-blue-500/20"
                        : "bg-slate-800/60 text-slate-300 border-white/10 hover:bg-slate-700/60 hover:border-white/20"
                    )}
                  >
                    {range.label}
                  </button>
                ))}
              </div>

              {/* Or precise input */}
              <div className="rounded-xl bg-slate-800/40 border border-white/10 p-4 space-y-3">
                <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">
                  Ou saisissez une valeur précise
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={floorArea || ""}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setFloorArea(v);
                      setSelectedRange(null);
                      setUseEstimator(false);
                    }}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-slate-700/60 border border-white/10 text-white text-sm"
                    placeholder={outdoorSubType === "swimming_pool" ? "Surface du bassin (m²)" : "Surface de plancher (m²)"}
                    min={0}
                  />
                  <span className="text-slate-400 text-sm font-medium">m²</span>
                </div>

                {/* Floor area estimator (not for pools) */}
                {outdoorSubType !== "swimming_pool" && (
                  <div className="border-t border-white/5 pt-3">
                    <button
                      type="button"
                      onClick={() => setUseEstimator(!useEstimator)}
                      className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <Calculator className="w-3.5 h-3.5" />
                      {useEstimator ? "Masquer l'estimateur" : "Estimer à partir de l'emprise au sol"}
                    </button>
                    {useEstimator && (
                      <div className="mt-3 space-y-2">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] text-slate-500 mb-1 block">Emprise au sol (m²)</label>
                            <input
                              type="number"
                              value={footprint || ""}
                              onChange={(e) => setFootprint(Number(e.target.value))}
                              className="w-full px-3 py-2 rounded-lg bg-slate-700/60 border border-white/10 text-white text-sm"
                              min={0}
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-slate-500 mb-1 block">Nombre de niveaux</label>
                            <input
                              type="number"
                              value={levels}
                              onChange={(e) => setLevels(Math.max(1, Number(e.target.value)))}
                              className="w-full px-3 py-2 rounded-lg bg-slate-700/60 border border-white/10 text-white text-sm"
                              min={1}
                            />
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Estimation : {footprint} × {levels} × 0,79 = <span className="text-blue-400 font-semibold">{estimateFloorAreaCreated(footprint, levels)} m²</span>
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Existing area for extensions */}
              {category === "existing_extension" && (
                <div className="rounded-xl bg-slate-800/40 border border-white/10 p-4 space-y-2">
                  <label className="text-sm text-slate-300">
                    Surface de plancher existante du bâtiment (m²)
                  </label>
                  <input
                    type="number"
                    value={existingArea || ""}
                    onChange={(e) => setExistingArea(Number(e.target.value))}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-700/60 border border-white/10 text-white text-sm"
                    placeholder="Ex: 120"
                    min={0}
                  />
                  <p className="text-[11px] text-slate-500">
                    Utilisé pour vérifier le seuil des 150 m² (architecte obligatoire)
                  </p>
                </div>
              )}

              {/* Urban zone toggle for extensions */}
              {category === "existing_extension" && (
                <div className="rounded-xl bg-slate-800/40 border border-white/10 p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-300">Zone urbaine (PLU)</p>
                    <p className="text-[11px] text-slate-500">
                      {isUrbanZone ? "Seuil DP : 40 m²" : "Seuil DP : 20 m²"}
                      {projectData?.zoneType && <span className="ml-1 text-blue-400">• Zone {projectData.zoneType} détectée</span>}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsUrbanZone(!isUrbanZone)}
                    className={cn(
                      "w-12 h-6 rounded-full transition-colors relative",
                      isUrbanZone ? "bg-blue-500" : "bg-slate-600"
                    )}
                  >
                    <div className={cn(
                      "w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform",
                      isUrbanZone ? "translate-x-6" : "translate-x-0.5"
                    )} />
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={handleAreaNext}
                disabled={floorArea <= 0 && !selectedRange}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold disabled:opacity-40 hover:shadow-lg hover:shadow-purple-500/20 transition-all flex items-center justify-center gap-2"
              >
                Continuer <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ═══ STEP: Pool Shelter ═══ */}
          {step === "pool-shelter" && (
            <div className="space-y-4">
              <BackButton onClick={goBack} />
              <p className="text-center text-slate-300 text-sm">
                La piscine a-t-elle un abri ou une couverture ?
              </p>
              <div className="grid gap-3">
                <ChoiceCard
                  icon={<Check className="w-6 h-6" />}
                  title="Oui, avec abri"
                  description="Abri haut, couverture fixe ou télescopique"
                  color="amber"
                  selected={hasShelter === true}
                  onClick={() => setHasShelter(true)}
                />
                <ChoiceCard
                  icon={<Droplets className="w-6 h-6" />}
                  title="Non, piscine ouverte"
                  description="Sans couverture fixe"
                  color="blue"
                  selected={hasShelter === false}
                  onClick={() => { setHasShelter(false); setShelterHeight(0); }}
                />
              </div>
              {hasShelter && (
                <div className="rounded-xl bg-slate-800/40 border border-white/10 p-4 space-y-2">
                  <label className="text-sm text-slate-300">Hauteur de l&apos;abri (m)</label>
                  <input
                    type="number"
                    value={shelterHeight || ""}
                    onChange={(e) => setShelterHeight(Number(e.target.value))}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-700/60 border border-white/10 text-white text-sm"
                    placeholder="Ex: 1.80"
                    step={0.1}
                    min={0}
                  />
                  <p className="text-[11px] text-slate-500">
                    Abri &gt; 1,80 m de haut → Permis de Construire requis
                  </p>
                </div>
              )}
              <button
                type="button"
                onClick={handlePoolShelterNext}
                disabled={hasShelter === null || (hasShelter && shelterHeight <= 0)}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold disabled:opacity-40 hover:shadow-lg hover:shadow-purple-500/20 transition-all flex items-center justify-center gap-2"
              >
                Continuer <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ═══ STEP: Submitter Type ═══ */}
          {step === "check-submitter" && (
            <div className="space-y-4">
              <BackButton onClick={goBack} />
              <p className="text-center text-slate-300 text-sm">
                Qui dépose le dossier ?
              </p>
              <p className="text-center text-slate-500 text-xs">
                Les personnes morales (sociétés) doivent obligatoirement recourir à un architecte
              </p>
              <div className="grid gap-3">
                <ChoiceCard
                  icon={<User className="w-6 h-6" />}
                  title="Particulier"
                  description="Personne physique (individu)"
                  color="blue"
                  selected={submitterType === "individual"}
                  onClick={() => setSubmitterType("individual")}
                />
                <ChoiceCard
                  icon={<Briefcase className="w-6 h-6" />}
                  title="Entreprise / Société"
                  description="Personne morale (SCI, SARL, SAS…)"
                  color="amber"
                  selected={submitterType === "company"}
                  onClick={() => setSubmitterType("company")}
                />
              </div>
              <button
                type="button"
                onClick={handleSubmitterNext}
                disabled={!submitterType}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold disabled:opacity-40 hover:shadow-lg hover:shadow-purple-500/20 transition-all flex items-center justify-center gap-2"
              >
                Voir le résultat <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ═══ STEP: Result ═══ */}
          {step === "result" && result && (
            <div className="space-y-4">
              <BackButton onClick={goBack} />

              {/* Determination badge */}
              <div className={cn(
                "rounded-2xl border p-6 text-center space-y-3",
                result.determination === "DP" ? "bg-emerald-500/10 border-emerald-500/30" :
                  result.determination === "PC" ? "bg-purple-500/10 border-purple-500/30" :
                    result.determination === "ARCHITECT_REQUIRED" ? "bg-amber-500/10 border-amber-500/30" :
                      result.determination === "NONE" ? "bg-slate-800/40 border-white/10" :
                        "bg-blue-500/10 border-blue-500/30"
              )}>
                <div className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-lg font-bold",
                  result.determination === "DP" ? "bg-emerald-500/20 text-emerald-400" :
                    result.determination === "PC" ? "bg-purple-500/20 text-purple-400" :
                      result.determination === "ARCHITECT_REQUIRED" ? "bg-amber-500/20 text-amber-400" :
                        result.determination === "NONE" ? "bg-slate-700/50 text-slate-300" :
                          "bg-blue-500/20 text-blue-400"
                )}>
                  {result.determination === "DP" && <FileText className="w-5 h-5" />}
                  {result.determination === "PC" && <ClipboardCheck className="w-5 h-5" />}
                  {result.determination === "ARCHITECT_REQUIRED" && <AlertTriangle className="w-5 h-5" />}
                  {result.determination === "NONE" && <Check className="w-5 h-5" />}
                  {result.determination === "REVIEW" && <Info className="w-5 h-5" />}
                  {result.determination === "DP" ? "Déclaration Préalable"
                    : result.determination === "PC" ? "Permis de Construire"
                      : result.determination === "ARCHITECT_REQUIRED" ? "Architecte Obligatoire"
                        : result.determination === "NONE" ? "Aucune autorisation requise"
                          : "Vérification requise"}
                </div>
                <p className="text-sm text-slate-300 leading-relaxed max-w-lg mx-auto">
                  {result.explanation}
                </p>
              </div>

              {/* Architect warning */}
              {result.architectRequired && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-300">Architecte obligatoire</p>
                    <p className="text-xs text-amber-200/70 mt-1">
                      La surface totale après travaux dépasse 150 m². Le recours à un architecte est obligatoire.
                      UrbAssist peut préparer votre dossier, mais vous devrez faire valider les plans par un architecte DPLG.
                    </p>
                  </div>
                </div>
              )}

              {/* Document list */}
              {(result.determination === "DP" || result.determination === "PC" || result.determination === "ARCHITECT_REQUIRED") && (
                <div className="rounded-xl bg-slate-800/40 border border-white/10 overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-semibold text-white">
                      Documents requis
                    </span>
                    <span className="ml-auto text-xs text-slate-500">
                      {getDocumentsForType(result.determination === "ARCHITECT_REQUIRED" ? "PC" : result.determination).length} documents
                    </span>
                  </div>
                  <div className="p-3 space-y-1 max-h-[240px] overflow-y-auto">
                    {getDocumentsForType(result.determination === "ARCHITECT_REQUIRED" ? "PC" : result.determination).map((doc, i) => (
                      <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-700/30 text-xs text-slate-300">
                        <span className="w-5 h-5 rounded-md bg-slate-700/60 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">
                          {i + 1}
                        </span>
                        <span className="flex-1">{doc.label}</span>
                        <Check className="w-3.5 h-3.5 text-emerald-500/40" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Optional features */}
              {(result.determination === "DP" || result.determination === "PC" || result.determination === "ARCHITECT_REQUIRED") && (
                <div className="rounded-xl bg-slate-800/40 border border-white/10 p-4 space-y-3">
                  <p className="text-sm font-semibold text-white">Options</p>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={wantPluAnalysis}
                      onChange={(e) => setWantPluAnalysis(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={cn(
                      "w-5 h-5 rounded-md border flex items-center justify-center transition-all",
                      wantPluAnalysis ? "bg-blue-500/20 border-blue-500 text-blue-400" : "border-slate-600 group-hover:border-slate-500"
                    )}>
                      {wantPluAnalysis && <Check className="w-3 h-3" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-slate-200">Analyse réglementaire</p>
                      <p className="text-[11px] text-slate-500">Analyse automatique du PLU/RNU applicable à votre parcelle</p>
                    </div>
                    <Shield className="w-4 h-4 text-blue-400/40" />
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={wantCerfa}
                      onChange={(e) => setWantCerfa(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={cn(
                      "w-5 h-5 rounded-md border flex items-center justify-center transition-all",
                      wantCerfa ? "bg-blue-500/20 border-blue-500 text-blue-400" : "border-slate-600 group-hover:border-slate-500"
                    )}>
                      {wantCerfa && <Check className="w-3 h-3" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-slate-200">Remplissage CERFA</p>
                      <p className="text-[11px] text-slate-500">Pré-remplissage automatique du formulaire officiel</p>
                    </div>
                    <FileText className="w-4 h-4 text-blue-400/40" />
                  </label>
                </div>
              )}

              {/* Continue to payment */}
              {result.determination !== "NONE" && (
                <button
                  type="button"
                  onClick={saveAndContinue}
                  disabled={saving}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold disabled:opacity-40 hover:shadow-lg hover:shadow-purple-500/20 transition-all flex items-center justify-center gap-2 text-base"
                >
                  {saving ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Enregistrement…</>
                  ) : (
                    <>Continuer vers le paiement <ChevronRight className="w-5 h-5" /></>
                  )}
                </button>
              )}

              {result.determination === "NONE" && (
                <NextStepButton canProceed={true} nextHref={`/projects/${projectId}`} nextLabel="Continuer" />
              )}
            </div>
          )}

        </div>
      </div>
    </Navigation>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
    >
      <ChevronLeft className="w-4 h-4" />
      Retour
    </button>
  );
}

function ChoiceCard({
  icon,
  title,
  description,
  color,
  onClick,
  highlight,
  selected,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
  onClick: () => void;
  highlight?: boolean;
  selected?: boolean;
  badge?: string;
}) {
  const colorMap: Record<string, { bg: string; border: string; icon: string; ring: string }> = {
    blue: { bg: "bg-blue-500/10", border: "border-blue-500/30", icon: "text-blue-400", ring: "ring-blue-500/30" },
    emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", icon: "text-emerald-400", ring: "ring-emerald-500/30" },
    purple: { bg: "bg-purple-500/10", border: "border-purple-500/30", icon: "text-purple-400", ring: "ring-purple-500/30" },
    amber: { bg: "bg-amber-500/10", border: "border-amber-500/30", icon: "text-amber-400", ring: "ring-amber-500/30" },
    slate: { bg: "bg-slate-700/30", border: "border-white/10", icon: "text-slate-400", ring: "ring-white/10" },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-4 p-4 rounded-xl border transition-all text-left group",
        selected ? `${c.bg} ${c.border} ring-2 ${c.ring}` :
          highlight ? `${c.bg} ${c.border} hover:ring-2 hover:${c.ring}` :
            `bg-slate-800/40 border-white/10 hover:${c.bg} hover:${c.border}`
      )}
    >
      <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", c.bg, c.icon)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
      {badge && (
        <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-400 shrink-0">
          {badge}
        </span>
      )}
      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 shrink-0" />
    </button>
  );
}
