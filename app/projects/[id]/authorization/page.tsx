"use client";

import React, { useState, use, useEffect, useMemo } from "react";
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
  Loader2,
  AlertTriangle,
  Check,
  Droplets,
  Fence,
  User,
  Briefcase,
  Info,
  Shield,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
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
  | "form"            // Main form with multi-select categories
  | "check-submitter" // Individual vs Company (only for PC)
  | "result";         // Final result + documents + options

type ProjectCategory = "new_construction" | "existing_extension" | "outdoor";
type ExtensionSubType = "extend" | "convert" | "renovate";
type OutdoorTag = "swimming_pool" | "fence_gate" | "raised_terrace";

interface AreaRange {
  label: string;
  min: number;
  max: number;
  value: number;
}

const CONSTRUCTION_RANGES: AreaRange[] = [
  { label: "< 20 m²", min: 0, max: 19.99, value: 20 },
  { label: "20 – 40 m²", min: 20, max: 40, value: 30 },
  { label: "> 40 m²", min: 40.01, max: 999, value: 50 },
];

const EXTENSION_RANGES: AreaRange[] = [
  { label: "< 20 m²", min: 0, max: 19.99, value: 20 },
  { label: "20 – 40 m²", min: 20, max: 40, value: 30 },
  { label: "> 40 m²", min: 40.01, max: 999, value: 50 },
];

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AuthorizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const { user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const isEn = t("auth.next") === "Next";

  // Wizard state
  const [step, setStep] = useState<WizardStep>("form");
  const [saving, setSaving] = useState(false);

  // ── Multi-select categories ──
  const [selectedCategories, setSelectedCategories] = useState<Set<ProjectCategory>>(new Set());

  // ── Construction Indépendante state ──
  const [constructionFootprint, setConstructionFootprint] = useState<number>(0);
  const [constructionLevels, setConstructionLevels] = useState<number>(1);
  const [constructionRange, setConstructionRange] = useState<AreaRange | null>(null);

  // ── Travaux sur Existant state ──
  const [extensionSubTypes, setExtensionSubTypes] = useState<Set<ExtensionSubType>>(new Set());
  const [existingArea, setExistingArea] = useState<number>(0);
  const [extensionFootprint, setExtensionFootprint] = useState<number>(0);
  const [extensionLevels, setExtensionLevels] = useState<number>(1);
  const [extensionRange, setExtensionRange] = useState<AreaRange | null>(null);
  const [extensionFloorAreaOverride, setExtensionFloorAreaOverride] = useState<number>(0);

  // ── Aménagement Extérieur state ──
  const [outdoorTags, setOutdoorTags] = useState<Set<OutdoorTag>>(new Set());
  const [outdoorFreeText, setOutdoorFreeText] = useState("");
  const [outdoorSurface, setOutdoorSurface] = useState<number>(0);

  // ── Pool shelter (shown when swimming_pool tag is selected) ──
  const [poolShelterHeight, setPoolShelterHeight] = useState<number>(0);
  const [hasPoolShelter, setHasPoolShelter] = useState<boolean | null>(null);

  // ── Zone detection (auto from address) ──
  const [isUrbanZone, setIsUrbanZone] = useState(true);

  // ── Submitter ──
  const [submitterType, setSubmitterType] = useState<SubmitterType | null>(null);

  // ── Result ──
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

  // ─── Computed floor areas ──────────────────────────────────────────

  const constructionFloorArea = useMemo(() => {
    if (!selectedCategories.has("new_construction") || constructionFootprint <= 0) return 0;
    return estimateFloorAreaCreated(constructionFootprint, constructionLevels);
  }, [selectedCategories, constructionFootprint, constructionLevels]);

  const extensionFloorArea = useMemo(() => {
    if (!selectedCategories.has("existing_extension") || extensionFootprint <= 0) return 0;
    if (extensionFloorAreaOverride > 0) return extensionFloorAreaOverride;
    return estimateFloorAreaCreated(extensionFootprint, extensionLevels);
  }, [selectedCategories, extensionFootprint, extensionLevels, extensionFloorAreaOverride]);

  const totalFloorArea = useMemo(() => {
    return constructionFloorArea + extensionFloorArea;
  }, [constructionFloorArea, extensionFloorArea]);

  // ─── Toggle helpers ────────────────────────────────────────────────

  function toggleCategory(cat: ProjectCategory) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function toggleExtensionSubType(sub: ExtensionSubType) {
    setExtensionSubTypes((prev) => {
      const next = new Set(prev);
      if (next.has(sub)) next.delete(sub);
      else next.add(sub);
      return next;
    });
  }

  function toggleOutdoorTag(tag: OutdoorTag) {
    setOutdoorTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  // ─── Compute result ─────────────────────────────────────────────────

  function computeResult() {
    // Determine strictest result across all selected categories
    let strictest: { determination: DeterminationType; explanation: string; architectRequired?: boolean } = {
      determination: "NONE",
      explanation: "",
    };

    const severity: Record<string, number> = { NONE: 0, DP: 1, PC: 2, ARCHITECT_REQUIRED: 3, REVIEW: 1 };

    // Construction Indépendante
    if (selectedCategories.has("new_construction") && constructionFootprint > 0) {
      const r = calculateDpPc({
        projectType: "new_construction",
        floorAreaCreated: constructionFloorArea,
        inUrbanZone: isUrbanZone,
        submitterType: submitterType || undefined,
      });
      if ((severity[r.determination] || 0) > (severity[strictest.determination] || 0)) {
        strictest = r;
      }
    }

    // Extension
    if (selectedCategories.has("existing_extension") && extensionFootprint > 0) {
      const r = calculateDpPc({
        projectType: "existing_extension",
        floorAreaCreated: extensionFloorArea,
        existingFloorArea: existingArea || undefined,
        inUrbanZone: isUrbanZone,
        submitterType: submitterType || undefined,
      });
      if ((severity[r.determination] || 0) > (severity[strictest.determination] || 0)) {
        strictest = r;
      }
    }

    // Outdoor
    if (selectedCategories.has("outdoor")) {
      if (outdoorTags.has("fence_gate")) {
        const r = calculateDpPc({ projectType: "outdoor_fence", floorAreaCreated: 0 });
        if ((severity[r.determination] || 0) > (severity[strictest.determination] || 0)) {
          strictest = r;
        }
      }
      if (outdoorTags.has("swimming_pool") && outdoorSurface > 0) {
        const r = calculateDpPc({
          projectType: "swimming_pool",
          floorAreaCreated: outdoorSurface,
          shelterHeight: hasPoolShelter ? poolShelterHeight : 0,
        });
        if ((severity[r.determination] || 0) > (severity[strictest.determination] || 0)) {
          strictest = r;
        }
      }
      if (outdoorTags.has("raised_terrace") || outdoorFreeText) {
        const r = calculateDpPc({ projectType: "outdoor_other", floorAreaCreated: 0 });
        if ((severity[r.determination] || 0) > (severity[strictest.determination] || 0)) {
          strictest = r;
        }
      }
    }

    // If nothing selected or all zero, provide a generic explanation
    if (strictest.determination === "NONE" && selectedCategories.size === 0) {
      strictest.explanation = isEn
        ? "Please select at least one project category."
        : "Veuillez sélectionner au moins une catégorie de projet.";
    }

    return strictest;
  }

  function handleContinue() {
    const tempResult = computeResult();

    // If result is PC, ask about submitter first
    if (tempResult.determination === "PC" && !submitterType) {
      setStep("check-submitter");
      return;
    }

    // Final result - recompute with submitter
    setResult(computeResult());
    setStep("result");
  }

  function handleSubmitterNext() {
    setResult(computeResult());
    setStep("result");
  }

  function goBack() {
    if (step === "check-submitter") {
      setStep("form");
    } else if (step === "result") {
      setResult(null);
      if (submitterType) {
        setStep("check-submitter");
      } else {
        setStep("form");
      }
    }
  }

  // ─── Save & Continue ────────────────────────────────────────────────

  async function saveAndContinue() {
    if (!result) return;
    setSaving(true);
    try {
      const determination = result.determination === "ARCHITECT_REQUIRED" ? "PC" : result.determination;
      const categories = Array.from(selectedCategories);
      await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorizationType: determination,
          authorizationExplanation: result.explanation,
          projectType: categories.length === 1
            ? (categories[0] === "new_construction" ? "construction"
              : categories[0] === "existing_extension" ? "extension"
                : "outdoor")
            : "mixed",
          projectDescription: {
            categories,
            extensionSubTypes: Array.from(extensionSubTypes),
            outdoorTags: Array.from(outdoorTags),
            outdoorFreeText: outdoorFreeText || undefined,
            constructionFootprint: constructionFootprint || undefined,
            constructionLevels,
            constructionFloorArea: constructionFloorArea || undefined,
            extensionFootprint: extensionFootprint || undefined,
            extensionLevels,
            extensionFloorArea: extensionFloorArea || undefined,
            existingFloorArea: existingArea || undefined,
            outdoorSurface: outdoorSurface || undefined,
            totalFloorArea: totalFloorArea || undefined,
            submitterType,
            architectRequired: result.architectRequired || false,
            wantPluAnalysis,
            wantCerfa,
            isUrbanZone,
            poolShelterHeight: poolShelterHeight || undefined,
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

  const stepLabels = [isEn ? "Project" : "Projet", isEn ? "Details" : "Détails", isEn ? "Result" : "Résultat"];
  const stepIndex = step === "form" ? 1
    : step === "result" ? 2
      : 1;

  // Can continue?
  const canContinue = selectedCategories.size > 0 && (
    (selectedCategories.has("new_construction") && constructionFootprint > 0) ||
    (selectedCategories.has("existing_extension") && extensionFootprint > 0) ||
    (selectedCategories.has("outdoor") && (outdoorTags.size > 0 || outdoorFreeText.length > 0))
  );

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <Navigation>
      <div className="min-h-screen p-4 lg:p-8">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-slate-900">
              {isEn ? "What is your project?" : "Quel est votre projet ?"}
            </h1>
            <p className="text-sm text-slate-400">
              {isEn ? "You can select multiple options." : "Vous pouvez cocher plusieurs options."}
            </p>
            {projectData?.zoneType && (
              <span className="inline-block px-2 py-0.5 rounded-md bg-blue-100 text-blue-600 text-xs font-semibold">
                Zone {projectData.zoneType} {isEn ? "detected" : "détectée"}
              </span>
            )}
          </div>

          {/* Step progress */}
          <div className="flex items-center justify-center gap-2">
            {stepLabels.map((label, i) => (
              <React.Fragment key={label}>
                {i > 0 && <div className={cn("w-12 h-0.5", i <= stepIndex ? "bg-blue-500" : "bg-slate-100")} />}
                <div className="flex items-center gap-1.5">
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                    i < stepIndex ? "bg-blue-500 text-slate-900" :
                      i === stepIndex ? "bg-blue-100 text-blue-600 ring-2 ring-blue-300" :
                        "bg-slate-100 text-slate-500"
                  )}>
                    {i < stepIndex ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className={cn("text-xs font-medium hidden sm:inline", i === stepIndex ? "text-blue-600" : "text-slate-500")}>
                    {label}
                  </span>
                </div>
              </React.Fragment>
            ))}
          </div>

          {/* ═══ STEP: Main Form ═══ */}
          {step === "form" && (
            <div className="space-y-5">

              {/* ── Category multi-select cards (side by side) ── */}
              <div className="grid grid-cols-3 gap-3">
                <CategoryCard
                  icon={<Building2 className="w-7 h-7" />}
                  title={isEn ? "Independent Construction" : "Construction Indépendante"}
                  description={isEn ? "House, garage, shed…" : "Maison, garage, abri…"}
                  selected={selectedCategories.has("new_construction")}
                  onClick={() => toggleCategory("new_construction")}
                  color="blue"
                />
                <CategoryCard
                  icon={<Hammer className="w-7 h-7" />}
                  title={isEn ? "Works on Existing" : "Travaux sur Existant"}
                  description={isEn ? "Extension, conversion…" : "Extension, aménagement…"}
                  selected={selectedCategories.has("existing_extension")}
                  onClick={() => toggleCategory("existing_extension")}
                  color="amber"
                />
                <CategoryCard
                  icon={<TreePine className="w-7 h-7" />}
                  title={isEn ? "Outdoor Development" : "Aménagement Extérieur"}
                  description={isEn ? "Pool, fence…" : "Piscine, clôture…"}
                  selected={selectedCategories.has("outdoor")}
                  onClick={() => toggleCategory("outdoor")}
                  color="emerald"
                />
              </div>

              {/* ═══ Construction Indépendante Section ═══ */}
              {selectedCategories.has("new_construction") && (
                <div className="rounded-2xl bg-white border border-blue-200 p-5 space-y-4">
                  <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-blue-600" />
                    {isEn ? "Independent Construction" : "Construction Indépendante"}
                  </h3>

                  {/* Ground footprint */}
                  <div className="space-y-2">
                    <label className="text-sm text-slate-600">
                      {isEn ? "What is the ground footprint (m²)?" : "Quelle est la surface au sol créée (m²) ?"}
                    </label>
                    <p className="text-[11px] text-slate-500">
                      {isEn ? "Outer contour of walls, not just interior" : "Contour extérieur des murs, pas uniquement l'intérieur"}
                    </p>
                    <input
                      type="number"
                      value={constructionFootprint || ""}
                      onChange={(e) => { setConstructionFootprint(Number(e.target.value)); setConstructionRange(null); }}
                      className="w-full px-4 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-sm"
                      placeholder="Ex: 40"
                      min={0}
                    />
                    <div className="flex flex-wrap gap-2">
                      {CONSTRUCTION_RANGES.map((r) => (
                        <button key={r.label} type="button"
                          onClick={() => { setConstructionRange(r); setConstructionFootprint(r.value); }}
                          className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                            constructionRange?.label === r.label
                              ? "bg-blue-100 text-blue-600 border-blue-300 ring-2 ring-blue-500/20"
                              : "bg-white text-slate-400 border-slate-200 hover:bg-slate-50"
                          )}>
                          {r.label} <span className="text-slate-500">(ex: {r.value})</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Level selector */}
                  <LevelSelector
                    label={isEn ? "Number of levels" : "Nombre de niveaux"}
                    levels={constructionLevels}
                    setLevels={setConstructionLevels}
                    isEn={isEn}
                  />
                </div>
              )}

              {/* ═══ Travaux sur Existant Section ═══ */}
              {selectedCategories.has("existing_extension") && (
                <div className="rounded-2xl bg-white border border-amber-200 p-5 space-y-4">
                  <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <Hammer className="w-5 h-5 text-amber-600" />
                    {isEn ? "Works on Existing Building" : "Travaux sur Existant"}
                  </h3>

                  {/* Sub-type tags */}
                  <div className="flex flex-wrap gap-2">
                    {([
                      { value: "extend" as ExtensionSubType, label: isEn ? "I'm extending" : "J'agrandis", desc: isEn ? "Extension / Super-elevation" : "Extension / Surélévation" },
                      { value: "convert" as ExtensionSubType, label: isEn ? "I'm converting" : "J'aménage", desc: isEn ? "Change of destination, garage…" : "Changement destination, garage…" },
                      { value: "renovate" as ExtensionSubType, label: isEn ? "I'm renovating" : "Je rénove", desc: isEn ? "Roof, facade…" : "Toiture, façade…" },
                    ]).map((sub) => (
                      <button key={sub.value} type="button"
                        onClick={() => toggleExtensionSubType(sub.value)}
                        className={cn("px-4 py-2.5 rounded-xl text-sm font-medium transition-all border text-left",
                          extensionSubTypes.has(sub.value)
                            ? "bg-amber-500/15 text-amber-700 border-amber-500/40 ring-2 ring-amber-500/20"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        )}>
                        <span className="block font-semibold">{sub.label}</span>
                        <span className="block text-[11px] text-slate-500 mt-0.5">{sub.desc}</span>
                      </button>
                    ))}
                  </div>

                  {/* Existing declared surface */}
                  <div className="space-y-1">
                    <label className="text-sm text-slate-600 font-medium">
                      {isEn ? "Current declared surface (m²)" : "Surface actuelle déclarée (m²)"}
                    </label>
                    <p className="text-[11px] text-slate-500 italic">
                      {isEn ? "Available on impots.gouv.fr (My properties)" : "Disponible sur impots.gouv.fr (Mes biens immobiliers)"}
                    </p>
                    <input
                      type="number"
                      value={existingArea || ""}
                      onChange={(e) => setExistingArea(Number(e.target.value))}
                      className="w-full px-4 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-sm"
                      placeholder="Ex: 110"
                      min={0}
                    />
                  </div>

                  {/* Ground footprint */}
                  <div className="space-y-2">
                    <label className="text-sm text-slate-600">
                      {isEn ? "What is the ground footprint of the extension (m²)?" : "Quelle est la surface au sol créée par l'extension (m²) ?"}
                    </label>
                    <input
                      type="number"
                      value={extensionFootprint || ""}
                      onChange={(e) => { setExtensionFootprint(Number(e.target.value)); setExtensionRange(null); }}
                      className="w-full px-4 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-sm"
                      placeholder="Ex: 50"
                      min={0}
                    />
                    <div className="flex flex-wrap gap-2">
                      {EXTENSION_RANGES.map((r) => (
                        <button key={r.label} type="button"
                          onClick={() => { setExtensionRange(r); setExtensionFootprint(r.value); }}
                          className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                            extensionRange?.label === r.label
                              ? "bg-amber-100 text-amber-600 border-amber-500/40 ring-2 ring-amber-500/20"
                              : "bg-white text-slate-400 border-slate-200 hover:bg-slate-50"
                          )}>
                          {r.label} <span className="text-slate-500">(ex: {r.value})</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Level selector */}
                  <LevelSelector
                    label={isEn ? "Extension levels" : "Niveaux de l'extension"}
                    levels={extensionLevels}
                    setLevels={setExtensionLevels}
                    isEn={isEn}
                  />

                  {/* Floor area override */}
                  <div className="space-y-1">
                    <label className="text-sm text-slate-600">
                      {isEn ? "Floor area created / transformed (m²)" : "Surface de plancher créée / transformée (m²)"}
                    </label>
                    <input
                      type="number"
                      value={extensionFloorAreaOverride || ""}
                      onChange={(e) => setExtensionFloorAreaOverride(Number(e.target.value))}
                      className="w-full px-4 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-sm"
                      placeholder="Ex: 18"
                      min={0}
                    />
                  </div>
                </div>
              )}

              {/* ═══ Aménagement Extérieur Section ═══ */}
              {selectedCategories.has("outdoor") && (
                <div className="rounded-2xl bg-white border border-emerald-500/20 p-5 space-y-4">
                  <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <TreePine className="w-5 h-5 text-emerald-600" />
                    {isEn ? "Outdoor Development" : "Aménagement Extérieur"}
                  </h3>

                  {/* Tag pills */}
                  <div className="flex flex-wrap gap-2">
                    {([
                      { value: "swimming_pool" as OutdoorTag, label: isEn ? "Pool" : "Piscine" },
                      { value: "fence_gate" as OutdoorTag, label: isEn ? "Fence / Gate" : "Clôture / Portail" },
                      { value: "raised_terrace" as OutdoorTag, label: isEn ? "Raised terrace" : "Terrasse surélevée" },
                    ]).map((tag) => (
                      <button key={tag.value} type="button"
                        onClick={() => toggleOutdoorTag(tag.value)}
                        className={cn("px-4 py-2 rounded-xl text-sm font-medium transition-all border",
                          outdoorTags.has(tag.value)
                            ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/40 ring-2 ring-emerald-500/20"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        )}>
                        {tag.label}
                      </button>
                    ))}
                  </div>

                  {/* Free text for other */}
                  <input
                    type="text"
                    value={outdoorFreeText}
                    onChange={(e) => setOutdoorFreeText(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-sm"
                    placeholder={isEn ? "Other (Carport, Wooden shed…)" : "Autre (Carport, Abri bois…)"}
                  />

                  {/* Pool shelter question */}
                  {outdoorTags.has("swimming_pool") && (
                    <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-3">
                      <p className="text-sm text-slate-600 font-medium">
                        {isEn ? "Will the pool have a shelter?" : "La piscine aura-t-elle un abri ?"}
                      </p>
                      <div className="flex gap-2">
                        <button type="button"
                          onClick={() => setHasPoolShelter(true)}
                          className={cn("px-4 py-2 rounded-xl text-sm font-medium border transition-all",
                            hasPoolShelter === true
                              ? "bg-amber-100 text-amber-700 border-amber-500/40 ring-2 ring-amber-500/20"
                              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                          )}>
                          {isEn ? "Yes" : "Oui"}
                        </button>
                        <button type="button"
                          onClick={() => { setHasPoolShelter(false); setPoolShelterHeight(0); }}
                          className={cn("px-4 py-2 rounded-xl text-sm font-medium border transition-all",
                            hasPoolShelter === false
                              ? "bg-blue-100 text-blue-700 border-blue-300 ring-2 ring-blue-500/20"
                              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                          )}>
                          {isEn ? "No" : "Non"}
                        </button>
                      </div>
                      {hasPoolShelter && (
                        <div className="space-y-1">
                          <label className="text-xs text-slate-400">{isEn ? "Shelter height (m)" : "Hauteur de l'abri (m)"}</label>
                          <input
                            type="number"
                            value={poolShelterHeight || ""}
                            onChange={(e) => setPoolShelterHeight(Number(e.target.value))}
                            className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-sm"
                            placeholder="Ex: 1.80"
                            step={0.1} min={0}
                          />
                          <p className="text-[11px] text-slate-500">
                            {isEn ? "Shelter > 1.80 m → Building Permit required" : "Abri > 1,80 m → Permis de Construire requis"}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Total ground surface for outdoor */}
                  <div className="space-y-1">
                    <label className="text-sm text-slate-600">
                      {isEn ? "Total ground surface occupied (m²)" : "Surface totale occupée au sol (m²)"}
                    </label>
                    <input
                      type="number"
                      value={outdoorSurface || ""}
                      onChange={(e) => setOutdoorSurface(Number(e.target.value))}
                      className="w-full px-4 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-sm"
                      placeholder="Ex: 30"
                      min={0}
                    />
                  </div>
                </div>
              )}

              {/* ═══ Total Floor Area Banner ═══ */}
              {(constructionFootprint > 0 || extensionFootprint > 0) && (
                <div className="rounded-xl bg-gradient-to-r from-slate-50 to-white border border-blue-200 p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                      {isEn ? "TOTAL FLOOR AREA CREATED" : "SURFACE DE PLANCHER TOTALE CRÉÉE"}
                    </p>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-md bg-slate-200 text-slate-600 uppercase tracking-wide">
                      {isEn ? "Auto calc." : "Calcul auto"}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-slate-900">
                      {totalFloorArea}
                    </span>
                    <span className="text-lg text-slate-600">m²</span>
                  </div>

                  {/* Breakdown */}
                  {selectedCategories.size > 1 && (
                    <div className="text-[11px] text-slate-500 space-y-0.5 border-t border-slate-100 pt-2 mt-2">
                      {constructionFloorArea > 0 && (
                        <p>{isEn ? "Construction" : "Construction"}: {constructionFootprint} × 0.79 × {constructionLevels} = {constructionFloorArea} m²</p>
                      )}
                      {extensionFloorArea > 0 && (
                        <p>{isEn ? "Extension" : "Extension"}: {extensionFloorAreaOverride > 0 ? `${extensionFloorAreaOverride} m² (manual)` : `${extensionFootprint} × 0.79 × ${extensionLevels} = ${extensionFloorArea} m²`}</p>
                      )}
                    </div>
                  )}

                  <p className="text-[11px] text-slate-500">
                    Surface Plancher = {isEn ? "Footprint" : "Emprise"} × 0.79 × {isEn ? "Levels" : "Niveaux"}. {isEn ? "This value defines the file type." : "C'est cette valeur qui définit le type de dossier."}
                  </p>
                </div>
              )}

              {/* Continue button */}
              <button
                type="button"
                onClick={handleContinue}
                disabled={!canContinue}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-slate-900 font-semibold disabled:opacity-40 hover:shadow-lg hover:shadow-purple-500/20 transition-all flex items-center justify-center gap-2"
              >
                {isEn ? "Continue" : "Continuer"} <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ═══ STEP: Submitter Type ═══ */}
          {step === "check-submitter" && (
            <div className="space-y-4">
              <BackButton onClick={goBack} />
              <p className="text-center text-slate-600 text-sm">
                {t("auth.submitterTitle")}
              </p>
              <p className="text-center text-slate-500 text-xs">
                {isEn ? "Legal entities (companies) must use an architect" : "Les personnes morales (sociétés) doivent obligatoirement recourir à un architecte"}
              </p>
              <div className="grid gap-3">
                <ChoiceCard
                  icon={<User className="w-6 h-6" />}
                  title={t("auth.individual")}
                  description={t("auth.individualDesc")}
                  color="blue"
                  selected={submitterType === "individual"}
                  onClick={() => setSubmitterType("individual")}
                />
                <ChoiceCard
                  icon={<Briefcase className="w-6 h-6" />}
                  title={t("auth.company")}
                  description={t("auth.companyDesc")}
                  color="amber"
                  selected={submitterType === "company"}
                  onClick={() => setSubmitterType("company")}
                />
              </div>
              <button
                type="button"
                onClick={handleSubmitterNext}
                disabled={!submitterType}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-slate-900 font-semibold disabled:opacity-40 hover:shadow-lg hover:shadow-purple-500/20 transition-all flex items-center justify-center gap-2"
              >
                {isEn ? "See result" : "Voir le résultat"} <ChevronRight className="w-4 h-4" />
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
                result.determination === "DP" ? "bg-emerald-50 border-emerald-200" :
                  result.determination === "PC" ? "bg-purple-50 border-purple-200" :
                    result.determination === "ARCHITECT_REQUIRED" ? "bg-amber-50 border-amber-200" :
                      result.determination === "NONE" ? "bg-white border-slate-200" :
                        "bg-blue-50 border-blue-200"
              )}>
                <div className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-lg font-bold",
                  result.determination === "DP" ? "bg-emerald-100 text-emerald-600" :
                    result.determination === "PC" ? "bg-purple-100 text-purple-600" :
                      result.determination === "ARCHITECT_REQUIRED" ? "bg-amber-100 text-amber-600" :
                        result.determination === "NONE" ? "bg-slate-100 text-slate-600" :
                          "bg-blue-100 text-blue-600"
                )}>
                  {result.determination === "DP" && <FileText className="w-5 h-5" />}
                  {result.determination === "PC" && <ClipboardCheck className="w-5 h-5" />}
                  {result.determination === "ARCHITECT_REQUIRED" && <AlertTriangle className="w-5 h-5" />}
                  {result.determination === "NONE" && <Check className="w-5 h-5" />}
                  {result.determination === "REVIEW" && <Info className="w-5 h-5" />}
                  {result.determination === "DP" ? t("auth.dp")
                    : result.determination === "PC" ? t("auth.pc")
                      : result.determination === "ARCHITECT_REQUIRED" ? (isEn ? "Architect Required" : "Architecte Obligatoire")
                        : result.determination === "NONE" ? t("auth.none")
                          : (isEn ? "Review Required" : "Vérification requise")}
                </div>
                <p className="text-sm text-slate-600 leading-relaxed max-w-lg mx-auto">
                  {result.explanation}
                </p>
              </div>

              {/* Architect warning */}
              {result.architectRequired && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-700">{isEn ? "Architect required" : "Architecte obligatoire"}</p>
                    <p className="text-xs text-amber-700 mt-1">
                      {t("auth.architectWarning")}
                    </p>
                  </div>
                </div>
              )}

              {/* Document list */}
              {(result.determination === "DP" || result.determination === "PC" || result.determination === "ARCHITECT_REQUIRED") && (
                <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-semibold text-slate-900">
                      {t("auth.documentsProduced")}
                    </span>
                    <span className="ml-auto text-xs text-slate-500">
                      {getDocumentsForType(result.determination === "ARCHITECT_REQUIRED" ? "PC" : result.determination).length} documents
                    </span>
                  </div>
                  <div className="p-3 space-y-1 max-h-[240px] overflow-y-auto">
                    {getDocumentsForType(result.determination === "ARCHITECT_REQUIRED" ? "PC" : result.determination).map((doc, i) => (
                      <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-50 text-xs text-slate-600">
                        <span className="w-5 h-5 rounded-md bg-slate-50 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">
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
                <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-3">
                  <p className="text-sm font-semibold text-slate-900">{t("auth.additionalOptions")}</p>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input type="checkbox" checked={wantPluAnalysis} onChange={(e) => setWantPluAnalysis(e.target.checked)} className="sr-only" />
                    <div className={cn("w-5 h-5 rounded-md border flex items-center justify-center transition-all",
                      wantPluAnalysis ? "bg-blue-100 border-blue-500 text-blue-600" : "border-slate-600 group-hover:border-slate-500"
                    )}>
                      {wantPluAnalysis && <Check className="w-3 h-3" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-slate-700">{t("auth.pluAnalysis")}</p>
                      <p className="text-[11px] text-slate-500">{t("auth.pluAnalysisDesc")}</p>
                    </div>
                    <Shield className="w-4 h-4 text-blue-600/40" />
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input type="checkbox" checked={wantCerfa} onChange={(e) => setWantCerfa(e.target.checked)} className="sr-only" />
                    <div className={cn("w-5 h-5 rounded-md border flex items-center justify-center transition-all",
                      wantCerfa ? "bg-blue-100 border-blue-500 text-blue-600" : "border-slate-600 group-hover:border-slate-500"
                    )}>
                      {wantCerfa && <Check className="w-3 h-3" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-slate-700">{t("auth.cerfaFill")}</p>
                      <p className="text-[11px] text-slate-500">{t("auth.cerfaFillDesc")}</p>
                    </div>
                    <FileText className="w-4 h-4 text-blue-600/40" />
                  </label>
                </div>
              )}

              {/* Continue to payment */}
              {result.determination !== "NONE" && (
                <button
                  type="button"
                  onClick={saveAndContinue}
                  disabled={saving}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-slate-900 font-semibold disabled:opacity-40 hover:shadow-lg hover:shadow-purple-500/20 transition-all flex items-center justify-center gap-2 text-base"
                >
                  {saving ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {isEn ? "Saving…" : "Enregistrement…"}</>
                  ) : (
                    <>{t("auth.continuePayment")} <ChevronRight className="w-5 h-5" /></>
                  )}
                </button>
              )}

              {result.determination === "NONE" && (
                <NextStepButton canProceed={true} nextHref={`/projects/${projectId}`} nextLabel={isEn ? "Continue" : "Continuer"} />
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
  const { t } = useLanguage();
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-900 transition-colors"
    >
      <ChevronLeft className="w-4 h-4" />
      {t("auth.back")}
    </button>
  );
}

function CategoryCard({
  icon,
  title,
  description,
  selected,
  onClick,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  color: "blue" | "amber" | "emerald";
}) {
  const colorMap = {
    blue: { bg: "bg-blue-50", border: "border-blue-200", icon: "text-blue-600", ring: "ring-blue-200", check: "bg-blue-500 text-slate-900" },
    amber: { bg: "bg-amber-50", border: "border-amber-200", icon: "text-amber-600", ring: "ring-amber-200", check: "bg-amber-500 text-slate-900" },
    emerald: { bg: "bg-emerald-50", border: "border-emerald-200", icon: "text-emerald-600", ring: "ring-emerald-200", check: "bg-emerald-500 text-slate-900" },
  };
  const c = colorMap[color];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center gap-2 p-4 rounded-xl border transition-all text-center",
        selected
          ? `${c.bg} ${c.border} ring-2 ${c.ring}`
          : `bg-white border-slate-200 hover:${c.bg} hover:${c.border}`
      )}
    >
      {selected && (
        <div className={cn("absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center", c.check)}>
          <Check className="w-3 h-3" />
        </div>
      )}
      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.bg, c.icon)}>
        {icon}
      </div>
      <p className="text-sm font-semibold text-slate-900 leading-tight">{title}</p>
      <p className="text-[11px] text-slate-400">{description}</p>
    </button>
  );
}

function LevelSelector({
  label,
  levels,
  setLevels,
  isEn,
}: {
  label: string;
  levels: number;
  setLevels: (v: number) => void;
  isEn: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm text-slate-600 font-medium">{label}</label>
      <div className="grid grid-cols-3 gap-2">
        {[
          { value: 1, label: isEn ? "Ground floor" : "Rez-de-chaussée" },
          { value: 2, label: isEn ? "R+1 (1 Floor)" : "R+1 (Étage)" },
          { value: 3, label: isEn ? "R+2 (2 Floors)" : "R+2 (2 Étages)" },
        ].map((lvl) => (
          <button
            key={lvl.value}
            type="button"
            onClick={() => setLevels(lvl.value)}
            className={cn(
              "py-2.5 px-3 rounded-xl text-sm font-medium transition-all border text-center",
              levels === lvl.value
                ? "bg-blue-100 text-blue-600 border-blue-300 ring-2 ring-blue-500/20"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            )}
          >
            {lvl.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChoiceCard({
  icon,
  title,
  description,
  color,
  onClick,
  selected,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
  onClick: () => void;
  selected?: boolean;
}) {
  const colorMap: Record<string, { bg: string; border: string; icon: string; ring: string }> = {
    blue: { bg: "bg-blue-50", border: "border-blue-200", icon: "text-blue-600", ring: "ring-blue-200" },
    emerald: { bg: "bg-emerald-50", border: "border-emerald-200", icon: "text-emerald-600", ring: "ring-emerald-200" },
    purple: { bg: "bg-purple-50", border: "border-purple-200", icon: "text-purple-600", ring: "ring-purple-500/30" },
    amber: { bg: "bg-amber-50", border: "border-amber-200", icon: "text-amber-600", ring: "ring-amber-200" },
    slate: { bg: "bg-slate-50", border: "border-slate-200", icon: "text-slate-400", ring: "ring-slate-200" },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-4 p-4 rounded-xl border transition-all text-left group",
        selected ? `${c.bg} ${c.border} ring-2 ${c.ring}` :
          `bg-white border-slate-200 hover:${c.bg} hover:${c.border}`
      )}
    >
      <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", c.bg, c.icon)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 shrink-0" />
    </button>
  );
}
