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
  Trash2,
  Plus,
  Activity,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { cn } from "@/lib/utils";
import { Pencil } from "lucide-react";
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

// ─── Work Item (right panel list) ───────────────────────────────────────────
interface WorkItem {
  id: string;
  label: string;
  projectType: ProjectTypeChoice;
  floorAreaCreated: number;
  footprintCreated: number;
  existingFloorArea?: number;
  shelterHeight?: number;
  inUrbanZone: boolean;
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
  const [showCategoryCards, setShowCategoryCards] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoDetectModal, setAutoDetectModal] = useState<null | "documents" | "payment">(null);
  const [autoDetectPaying, setAutoDetectPaying] = useState(false);
  const [autoDetectError, setAutoDetectError] = useState<string | null>(null);
  const [autoDetectCerfa, setAutoDetectCerfa] = useState(false);
  const [autoDetectPlu, setAutoDetectPlu] = useState(false);
  // Quick-action (DP / PC) modal
  const [quickModal, setQuickModal] = useState<null | { step: "submitter" | "documents" | "payment" | "legal-entity"; type: "DP" | "PC" }>(null);
  const [quickModalPaying, setQuickModalPaying] = useState(false);
  const [quickModalError, setQuickModalError] = useState<string | null>(null);
  const [quickModalCerfa, setQuickModalCerfa] = useState(false);
  const [quickModalPlu, setQuickModalPlu] = useState(false);

  // Floor area manual edit mode
  const [editingFloorArea, setEditingFloorArea] = useState(false);
  const [manualTotalFloorArea, setManualTotalFloorArea] = useState<number>(0);

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

  // ── Work items (right panel) ──
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);

  function addWorkItem(item: Omit<WorkItem, "id">) {
    setWorkItems((prev) => [...prev, { ...item, id: Date.now().toString() }]);
  }

  function removeWorkItem(id: string) {
    setWorkItems((prev) => prev.filter((w) => w.id !== id));
  }

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
    if (manualTotalFloorArea > 0) return manualTotalFloorArea;
    return constructionFloorArea + extensionFloorArea;
  }, [constructionFloorArea, extensionFloorArea, manualTotalFloorArea]);

  // ─── Toggle helpers ────────────────────────────────────────────────

  function toggleCategory(cat: ProjectCategory) {
    setSelectedCategories((prev) => {
      // Accordion: only one category open at a time
      if (prev.has(cat)) {
        const next = new Set(prev);
        next.delete(cat);
        return next;
      }
      return new Set([cat]); // close all others, open only this one
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
        footprintCreated: constructionFootprint,
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
        footprintCreated: extensionFootprint,
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
      router.push(`/projects/${projectId}/documents`);
    } catch (err) {
      console.error("Save failed:", err);
    }
    setSaving(false);
  }

  // ─── Quick action: skip directly to documents ─────────────────────

  async function handleQuickAction(authType: "DP" | "PC") {
    setSaving(true);
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorizationType: authType,
          authorizationExplanation: authType === "DP"
            ? (isEn ? "Quick action: Preliminary Declaration selected" : "Action rapide : Déclaration Préalable sélectionnée")
            : (isEn ? "Quick action: Building Permit selected" : "Action rapide : Permis de Construire sélectionné"),
        }),
      });
      router.push(`/projects/${projectId}/documents`);
    } catch (err) {
      console.error("Quick action failed:", err);
    }
    setSaving(false);
  }

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
        <div className="max-w-7xl mx-auto">

          {/* Header */}
          <div className="text-center space-y-3 mb-8">
            <h1 className="text-3xl font-semibold text-slate-900">
              {isEn ? "What is your project?" : "Quel est votre projet ?"}
            </h1>
            <p className="text-base text-slate-500">
              {isEn ? "You can select multiple options." : "Vous pouvez cocher plusieurs options."}
            </p>
            {projectData?.zoneType && (
              <span className="inline-block px-3 py-1 rounded-md bg-blue-100 text-blue-600 text-sm font-semibold">
                Zone {projectData.zoneType} {isEn ? "detected" : "détectée"}
              </span>
            )}
          </div>

          {/* ═══ Quick Action / Shortcut Section (always full width) ═══ */}
          {step === "form" && (
            <div className="space-y-4 mb-5 max-w-2xl mx-auto">
              <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50/30 border border-blue-200/60 p-4 space-y-3">
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-slate-800">
                    {isEn
                      ? "Already know what type of authorization you need?"
                      : "Vous savez déjà quel type d'autorisation vous avez besoin ?"}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {isEn
                      ? "Go directly to document generation"
                      : "Accédez directement à la génération de documents"}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {/* DP Card */}
                  <button
                    type="button"
                    onClick={() => setQuickModal({ step: "documents", type: "DP" })}
                    className="group relative flex flex-row items-center gap-2.5 p-5 rounded-2xl bg-slate-100 border border-slate-200 text-left hover:bg-slate-50 hover:border-emerald-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-emerald-600" />
                    </div>
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {isEn ? "Preliminary Declaration" : "Déclaration Préalable"}
                    </p>
                  </button>

                  {/* PC Card */}
                  <button
                    type="button"
                    onClick={() => setQuickModal({ step: "submitter", type: "PC" })}
                    className="group relative flex flex-row items-center gap-2.5 p-5 rounded-2xl bg-slate-100 border border-slate-200 text-left hover:bg-slate-50 hover:border-purple-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                      <ClipboardCheck className="w-4 h-4 text-purple-600" />
                    </div>
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {isEn ? "Building Permit" : "Permis de Construire"}
                    </p>
                  </button>

                  {/* Auto-detect Card */}
                  <button
                    type="button"
                    onClick={() => setAutoDetectModal("documents")}
                    className="group relative flex flex-row items-center gap-2.5 p-5 rounded-2xl bg-slate-100 border border-slate-200 text-left hover:bg-slate-50 hover:border-slate-400 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <div className="w-7 h-7 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
                      <Info className="w-4 h-4 text-slate-600" />
                    </div>
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {isEn ? "I don't know" : "Je ne sais pas"}
                    </p>
                  </button>
                </div>
              </div>

              {/* Separator */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-sm text-slate-400 uppercase tracking-wider font-semibold">
                  {isEn ? "Or fill in your project" : "Ou renseignez votre projet"}
                </span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              {/* Title */}
              <div className="space-y-1 text-center max-w-2xl mx-auto">
                <p className="text-base text-slate-600 font-medium">
                  {isEn
                    ? "Fill in your project details so the system can determine the type of authorization"
                    : "Renseignez les détails de votre projet pour que le système détermine le type d'autorisation"}
                </p>
              </div>
            </div>
          )}

          {/* Smart guide banner — always above the two-column layout, always centered */}
          {step === "form" && (
            <div className="flex justify-center w-full mb-2">
              <button
                type="button"
                onClick={() => {
                  setShowCategoryCards((v) => {
                    if (v) setSelectedCategories(new Set());
                    return !v;
                  });
                }}
                className="relative w-full max-w-2xl rounded-2xl overflow-hidden text-left group transition-all duration-300 hover:-translate-y-0.5"
              >
                {/* Background: gray when open, gradient when closed */}
                <div className={`absolute inset-0 transition-all duration-300 ${showCategoryCards ? "bg-slate-100" : "bg-gradient-to-br from-violet-500 via-indigo-500 to-purple-600 group-hover:from-violet-600 group-hover:via-indigo-600 group-hover:to-purple-700"}`} />
                {/* Decorative blobs */}
                <div className="pointer-events-none absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
                <div className="pointer-events-none absolute -bottom-4 -left-4 w-24 h-24 rounded-full bg-indigo-300/20 blur-xl" />
                <div className="pointer-events-none absolute top-1/2 right-16 w-16 h-16 rounded-full bg-purple-300/15 blur-lg" />
                {/* Content */}
                <div className="relative flex items-center gap-4 p-4">
                  <div className={`shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg border transition-all duration-300 ${showCategoryCards ? "bg-slate-200 border-slate-300 shadow-slate-200/50" : "bg-white/20 backdrop-blur-sm border-white/20 shadow-black/10"}`}>
                    <ClipboardCheck className={`w-7 h-7 transition-colors duration-300 ${showCategoryCards ? "text-slate-600" : "text-white"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all duration-300 ${showCategoryCards ? "bg-violet-100 border-violet-200 text-violet-600" : "bg-white/20 border-white/30 text-white"}`}>
                        ✦ {isEn ? "Smart guide" : "Guide intelligent"}
                      </span>
                    </div>
                    <p className={`text-lg font-bold leading-snug transition-colors duration-300 ${showCategoryCards ? "text-slate-800" : "text-white"}`}>
                      {isEn ? "Describe your work or constructions" : "Décrivez vos travaux ou constructions"}
                    </p>
                    <p className={`text-sm mt-1 transition-colors duration-300 ${showCategoryCards ? "text-slate-500" : "text-white/70"}`}>
                      {isEn ? "We'll identify the exact permit you need in seconds." : "Nous identifions l'autorisation exacte dont vous avez besoin."}
                    </p>
                  </div>
                  <div className={`shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold border transition-all duration-200 shadow-md ${showCategoryCards ? "bg-white text-slate-600 border-slate-300 hover:bg-slate-50" : "bg-white/20 text-white border-white/30 group-hover:bg-white group-hover:text-violet-700 group-hover:border-white"}`}>
                    {showCategoryCards ? (isEn ? "Close" : "Fermer") : (isEn ? "Start" : "Commencer")}
                    <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${showCategoryCards ? "rotate-90" : "group-hover:translate-x-0.5"}`} />
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* Two-column layout for form step */}
          <div className={step === "form" ? "flex gap-6 items-start" : "max-w-3xl mx-auto"}>

            {/* LEFT COLUMN */}
            <div className={step === "form" ? "flex-1 min-w-0 space-y-5" : "space-y-6"}>

              {/* ═══ STEP: Main Form ═══ */}
              {step === "form" && (
                <div className="space-y-5">

                  {/* ── Category multi-select cards (side by side) – shown after clicking banner ── */}
                  {showCategoryCards && (
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
                  )}

                  {/* ═══ Total Floor Area Banner — shown at top once data exists ═══ */}
                  {showCategoryCards && (constructionFootprint > 0 || extensionFootprint > 0) && (
                    <div className="rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
                          {isEn ? "Total Floor Area Created" : "Surface de Plancher Totale Créée"}
                        </p>
                        <div className="flex items-center gap-2">
                          {!editingFloorArea && (
                            <button
                              type="button"
                              onClick={() => { setEditingFloorArea(true); setManualTotalFloorArea(totalFloorArea); }}
                              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 transition-all"
                            >
                              <Pencil className="w-3 h-3" />
                              {isEn ? "Edit" : "Modifier"}
                            </button>
                          )}
                          <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-500 uppercase tracking-wide">
                            {editingFloorArea ? (isEn ? "Manual" : "Manuel") : (isEn ? "Auto" : "Auto")}
                          </span>
                        </div>
                      </div>
                      {editingFloorArea ? (
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            value={manualTotalFloorArea || ""}
                            onChange={(e) => setManualTotalFloorArea(Number(e.target.value))}
                            className="w-32 px-3 py-2 rounded-lg bg-white border border-blue-300 text-slate-900 text-2xl font-semibold focus:ring-2 focus:ring-blue-500/20"
                            placeholder="0"
                            min={0}
                            autoFocus
                          />
                          <span className="text-lg text-slate-500">m²</span>
                          <button
                            type="button"
                            onClick={() => { setEditingFloorArea(false); setManualTotalFloorArea(0); }}
                            className="text-xs text-slate-400 hover:text-slate-600 underline"
                          >
                            {isEn ? "Reset to auto" : "Retour auto"}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-xl font-semibold text-slate-900">{totalFloorArea}</span>
                          <span className="text-sm text-slate-500">m²</span>
                        </div>
                      )}

                    </div>
                  )}

                  {/* ═══ Construction Indépendante Section ═══ */}
                  {selectedCategories.has("new_construction") && (
                    <div className="rounded-2xl bg-white border border-blue-200 p-6 space-y-5">
                      <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-blue-600" />
                        {isEn ? "Independent Construction" : "Construction Indépendante"}
                      </h3>

                      {/* Ground footprint */}
                      <div className="space-y-2">
                        <label className="text-base font-medium text-slate-700">
                          {isEn ? "What is the ground footprint (m²)?" : "Quelle est la surface au sol créée (m²) ?"}
                        </label>
                        <p className="text-sm text-slate-400">
                          {isEn ? "Outer contour of walls, not just interior" : "Contour extérieur des murs, pas uniquement l'intérieur"}
                        </p>
                        <input
                          type="number"
                          value={constructionFootprint || ""}
                          onChange={(e) => { setConstructionFootprint(Number(e.target.value)); setConstructionRange(null); }}
                          className="w-full px-4 py-3.5 rounded-xl bg-white border-2 border-slate-300 text-slate-900 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all placeholder:text-slate-500 placeholder:font-semibold"
                          placeholder="Ex: 40"
                          min={0}
                        />
                        <div className="flex flex-wrap gap-2">
                          {CONSTRUCTION_RANGES.map((r) => (
                            <button key={r.label} type="button"
                              onClick={() => { setConstructionRange(r); setConstructionFootprint(r.value); }}
                              className={cn("px-4 py-2 rounded-lg text-sm font-semibold transition-all border",
                                constructionRange?.label === r.label
                                  ? "bg-blue-100 text-blue-700 border-blue-300 ring-2 ring-blue-500/20"
                                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                              )}>
                              {r.label} <span className="text-slate-400 font-normal">(ex: {r.value})</span>
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

                      {/* Add project button */}
                      <button
                        type="button"
                        disabled={constructionFootprint <= 0}
                        onClick={() => {
                          const count = workItems.filter(w => w.projectType === "new_construction").length + 1;
                          addWorkItem({
                            label: isEn ? `Independent Construction ${count}` : `Construction Indépendante ${count}`,
                            projectType: "new_construction",
                            floorAreaCreated: constructionFloorArea,
                            footprintCreated: constructionFootprint,
                            inUrbanZone: isUrbanZone,
                          });
                        }}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-base font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                      >
                        <Plus className="w-5 h-5" />
                        {isEn ? "Add to analysis" : "Ajouter à l'analyse"}
                      </button>
                    </div>
                  )}

                  {/* ═══ Travaux sur Existant Section ═══ */}
                  {selectedCategories.has("existing_extension") && (
                    <div className="rounded-2xl bg-white border border-amber-200 p-4 space-y-3">
                      <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
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
                            className={cn("px-5 py-3 rounded-xl transition-all border text-left",
                              extensionSubTypes.has(sub.value)
                                ? "bg-amber-500/15 text-amber-700 border-amber-500/40 ring-2 ring-amber-500/20"
                                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                            )}>
                            <span className="block font-medium text-base">{sub.label}</span>
                            <span className="block text-sm text-slate-400 mt-0.5">{sub.desc}</span>
                          </button>
                        ))}
                      </div>

                      {/* Current surface + Ground footprint — inline */}
                      <div className="grid grid-cols-2 gap-3">
                        {/* Existing declared surface */}
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-slate-700">
                            {isEn ? "Current declared surface (m²)" : "Surface actuelle déclarée (m²)"}
                          </label>
                          <input
                            type="number"
                            value={existingArea || ""}
                            onChange={(e) => setExistingArea(Number(e.target.value))}
                            className="w-full px-3 py-2.5 rounded-xl bg-white border-2 border-slate-300 text-slate-900 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all placeholder:text-slate-400"
                            placeholder="Ex: 110"
                            min={0}
                          />
                        </div>

                        {/* Ground footprint of extension */}
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-slate-700">
                            {isEn ? "Ground footprint of extension (m²)" : "Surface au sol de l'extension (m²)"}
                          </label>
                          <input
                            type="number"
                            value={extensionFootprint || ""}
                            onChange={(e) => { setExtensionFootprint(Number(e.target.value)); setExtensionRange(null); }}
                            className="w-full px-3 py-2.5 rounded-xl bg-white border-2 border-slate-300 text-slate-900 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all placeholder:text-slate-400"
                            placeholder="Ex: 50"
                            min={0}
                          />
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {EXTENSION_RANGES.map((r) => (
                              <button key={r.label} type="button"
                                onClick={() => { setExtensionRange(r); setExtensionFootprint(r.value); }}
                                className={cn("px-3 py-1 rounded-lg text-xs font-semibold transition-all border",
                                  extensionRange?.label === r.label
                                    ? "bg-amber-100 text-amber-700 border-amber-500/40 ring-2 ring-amber-500/20"
                                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                                )}>
                                {r.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Floor area override (left) + Level selector (right) — inline */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-slate-700">
                            {isEn ? "Floor area created / transformed (m²)" : "Surface de plancher créée / transformée (m²)"}
                          </label>
                          <input
                            type="number"
                            value={extensionFloorAreaOverride || ""}
                            onChange={(e) => setExtensionFloorAreaOverride(Number(e.target.value))}
                            className="w-full px-3 py-2.5 rounded-xl bg-white border-2 border-slate-300 text-slate-900 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all placeholder:text-slate-400"
                            placeholder="Ex: 18"
                            min={0}
                          />
                        </div>
                        <LevelSelector
                          label={isEn ? "Extension levels" : "Niveaux de l'extension"}
                          levels={extensionLevels}
                          setLevels={setExtensionLevels}
                          isEn={isEn}
                        />
                      </div>

                      {/* Add project button */}
                      <button
                        type="button"
                        disabled={extensionFootprint <= 0}
                        onClick={() => {
                          const count = workItems.filter(w => w.projectType === "existing_extension").length + 1;
                          const subLabel = extensionSubTypes.has("extend") ? (isEn ? "Extension" : "Extension")
                            : extensionSubTypes.has("convert") ? (isEn ? "Conversion" : "Aménagement")
                              : extensionSubTypes.has("renovate") ? (isEn ? "Renovation" : "Rénovation")
                                : (isEn ? "Works on Existing" : "Travaux sur Existant");
                          addWorkItem({
                            label: `${subLabel} ${count}`,
                            projectType: "existing_extension",
                            floorAreaCreated: extensionFloorArea,
                            footprintCreated: extensionFootprint,
                            existingFloorArea: existingArea || undefined,
                            inUrbanZone: isUrbanZone,
                          });
                        }}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-base font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                      >
                        <Plus className="w-5 h-5" />
                        {isEn ? "Add to analysis" : "Ajouter à l'analyse"}
                      </button>
                    </div>
                  )}

                  {/* ═══ Aménagement Extérieur Section ═══ */}
                  {selectedCategories.has("outdoor") && (
                    <div className="rounded-2xl bg-white border border-emerald-500/20 p-6 space-y-5">
                      <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
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
                        className="w-full px-4 py-3.5 rounded-xl bg-white border-2 border-slate-300 text-slate-900 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all placeholder:text-slate-500 placeholder:font-semibold"
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
                      <div className="space-y-2">
                        <label className="text-base font-medium text-slate-700">
                          {isEn ? "Total ground surface occupied (m²)" : "Surface totale occupée au sol (m²)"}
                        </label>
                        <input
                          type="number"
                          value={outdoorSurface || ""}
                          onChange={(e) => setOutdoorSurface(Number(e.target.value))}
                          className="w-full px-4 py-3.5 rounded-xl bg-white border-2 border-slate-300 text-slate-900 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all placeholder:text-slate-500 placeholder:font-semibold"
                          placeholder="Ex: 30"
                          min={0}
                        />
                      </div>

                      {/* Add project button */}
                      <button
                        type="button"
                        disabled={outdoorTags.size === 0 && !outdoorFreeText}
                        onClick={() => {
                          const count = workItems.filter(w =>
                            w.projectType === "outdoor_fence" || w.projectType === "swimming_pool" || w.projectType === "outdoor_other"
                          ).length + 1;
                          const mainTag = outdoorTags.has("swimming_pool") ? "swimming_pool"
                            : outdoorTags.has("fence_gate") ? "outdoor_fence"
                              : "outdoor_other";
                          const tagLabel = outdoorTags.has("swimming_pool") ? (isEn ? "Pool" : "Piscine")
                            : outdoorTags.has("fence_gate") ? (isEn ? "Fence / Gate" : "Clôture / Portail")
                              : outdoorTags.has("raised_terrace") ? (isEn ? "Raised Terrace" : "Terrasse Surlevée")
                                : (isEn ? "Outdoor Work" : "Aménagement Extérieur");
                          addWorkItem({
                            label: `${tagLabel} ${count}`,
                            projectType: mainTag as ProjectTypeChoice,
                            floorAreaCreated: outdoorSurface,
                            footprintCreated: outdoorSurface,
                            shelterHeight: hasPoolShelter ? poolShelterHeight : 0,
                            inUrbanZone: isUrbanZone,
                          });
                        }}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-base font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                      >
                        <Plus className="w-5 h-5" />
                        {isEn ? "Add to analysis" : "Ajouter à l'analyse"}
                      </button>
                    </div>
                  )}

                  {/* ═══ Total Floor Area Banner — now shown at top, removed from here ═══ */}

                  {/* Continue button */}
                  {showCategoryCards && (
                    <button
                      type="button"
                      onClick={handleContinue}
                      disabled={!canContinue}
                      className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white text-base font-bold disabled:opacity-40 hover:shadow-lg hover:shadow-purple-500/20 transition-all flex items-center justify-center gap-2"
                    >
                      {isEn ? "Next: List of documents" : "Suivant : Liste des documents"} <ChevronRight className="w-5 h-5" />
                    </button>
                  )}
                </div>
              )}

              {/* ═══ STEP: Submitter Type ═══ */}
              {step === "check-submitter" && (
                <div className="space-y-4">
                  <BackButton onClick={goBack} />
                  <p className="text-center text-slate-700 text-lg font-semibold">
                    {t("auth.submitterTitle")}
                  </p>
                  <p className="text-center text-slate-500 text-sm">
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
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white text-base font-bold disabled:opacity-40 hover:shadow-lg hover:shadow-purple-500/20 transition-all flex items-center justify-center gap-2"
                  >
                    {isEn ? "See result" : "Voir le résultat"} <ChevronRight className="w-5 h-5" />
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

                  {/* Continue to documents */}
                  {result.determination !== "NONE" && (
                    <button
                      type="button"
                      onClick={saveAndContinue}
                      disabled={saving}
                      className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white text-base font-bold disabled:opacity-40 hover:shadow-lg hover:shadow-purple-500/20 transition-all flex items-center justify-center gap-2"
                    >
                      {saving ? (
                        <><Loader2 className="w-5 h-5 animate-spin" /> {isEn ? "Saving…" : "Enregistrement…"}</>
                      ) : (
                        <>{isEn ? "Next: List of documents" : "Suivant : Liste des documents"} <ChevronRight className="w-5 h-5" /></>
                      )}
                    </button>
                  )}

                  {result.determination === "NONE" && (
                    <NextStepButton canProceed={true} nextHref={`/projects/${projectId}`} nextLabel={isEn ? "Continue" : "Continuer"} />
                  )}
                </div>
              )}

            </div>{/* end LEFT COLUMN */}

            {/* RIGHT COLUMN — Live Analysis Panel (only shown on form step when banner is expanded) */}
            {step === "form" && showCategoryCards && (
              <div className="w-[480px] shrink-0 sticky top-6 self-start">
                <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm">
                  {/* Panel header */}
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {isEn ? "Authorization Analysis" : "Analyse type d'autorisation"}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {isEn ? "Auto-updated as you fill in your works" : "Mise à jour automatique selon vos travaux"}
                      </p>
                    </div>
                  </div>

                  {workItems.length === 0 ? (
                    /* Empty state */
                    <div className="px-5 py-10 flex flex-col items-center gap-3 text-center">
                      <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                        <Activity className="w-5 h-5 text-slate-300" />
                      </div>
                      <p className="text-sm text-slate-400 leading-relaxed max-w-[200px]">
                        {isEn
                          ? "Add projects using the buttons below each category to see the analysis here."
                          : "Ajoutez des travaux via les boutons sous chaque catégorie pour voir l'analyse ici."}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {/* Global summary */}
                      <div className="px-5 py-4 bg-slate-50/60 space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          {isEn ? "Global Summary" : "Synthèse Globale"}
                        </p>
                        {(() => {
                          const totalCreated = workItems.reduce((sum, w) => sum + w.floorAreaCreated, 0);
                          const totalExisting = workItems.reduce((sum, w) => sum + (w.existingFloorArea || 0), 0);
                          const totalAfter = totalExisting + totalCreated;
                          const architectNeeded = totalAfter >= 150 || totalCreated >= 150;
                          return (
                            <div className="space-y-2">
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-500">{isEn ? "Floor area created" : "Surface créée"}</span>
                                <span className="font-semibold text-slate-900">{totalCreated.toFixed(1)} m²</span>
                              </div>
                              {totalExisting > 0 && (
                                <div className="flex justify-between text-xs">
                                  <span className="text-slate-500">{isEn ? "Total after works" : "Totale après travaux"}</span>
                                  <span className="font-semibold text-slate-900">{totalAfter.toFixed(1)} m²</span>
                                </div>
                              )}
                              {architectNeeded && (
                                <div className="flex items-start gap-2 mt-2 p-2.5 rounded-lg bg-red-50 border border-red-200">
                                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                                  <p className="text-[11px] font-semibold text-red-700 uppercase tracking-wide">
                                    {isEn ? "Architect required" : "Architecte obligatoire"}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Work items list */}
                      <div className="px-5 py-3 space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                          {isEn ? `Works list (${workItems.length})` : `Liste des travaux (${workItems.length})`}
                        </p>
                        {workItems.map((item) => {
                          const res = calculateDpPc({
                            projectType: item.projectType,
                            floorAreaCreated: item.floorAreaCreated,
                            footprintCreated: item.footprintCreated,
                            existingFloorArea: item.existingFloorArea,
                            shelterHeight: item.shelterHeight,
                            inUrbanZone: item.inUrbanZone,
                          });
                          const badgeColor =
                            res.determination === "PC" || res.determination === "ARCHITECT_REQUIRED"
                              ? "bg-amber-100 text-amber-700 border-amber-300"
                              : res.determination === "DP"
                                ? "bg-blue-100 text-blue-700 border-blue-300"
                                : "bg-emerald-100 text-emerald-700 border-emerald-300";
                          const badgeLabel =
                            res.determination === "PC" ? (isEn ? "BUILDING PERMIT" : "PERMIS DE CONSTRUIRE")
                              : res.determination === "ARCHITECT_REQUIRED" ? (isEn ? "PERMIT + ARCHITECT" : "PC + ARCHITECTE")
                                : res.determination === "DP" ? (isEn ? "PRIOR DECLARATION" : "DÉCLARATION PRÉALABLE")
                                  : (isEn ? "NO AUTHORIZATION" : "AUCUNE AUTORISATION");
                          return (
                            <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-semibold text-slate-900 leading-snug flex-1">{item.label}</p>
                                <button
                                  type="button"
                                  onClick={() => removeWorkItem(item.id)}
                                  className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeColor}`}>
                                  {badgeLabel}
                                </span>
                              </div>
                              {item.floorAreaCreated > 0 && (
                                <p className="text-[11px] text-slate-400">
                                  {isEn ? "Floor" : "Plancher"}: {item.floorAreaCreated.toFixed(1)} m²
                                  {item.footprintCreated > 0 && ` | ${isEn ? "Footprint" : "Emprise"}: ${item.footprintCreated} m²`}
                                </p>
                              )}
                              <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-3">{res.explanation}</p>
                            </div>
                          );
                        })}
                      </div>

                      {/* Footer */}
                      <div className="px-5 py-3">
                        <p className="text-[10px] text-slate-400 leading-relaxed italic">
                          {isEn
                            ? "Results are indicative. Consult your town hall or local PLU for final validation."
                            : "Ces résultats sont donnés à titre indicatif. Consultez votre mairie ou le PLU local pour validation définitive."}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>{/* end two-column wrapper */}

        </div>{/* end max-w-7xl */}
      </div>

      {/* ═══ Auto Detection Modal ═══ */}
      {autoDetectModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setAutoDetectModal(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

            {/* ── Step 1: Document List ── */}
            {autoDetectModal === "documents" && (
              <div className="p-6 space-y-5">
                {/* Header */}
                <div className="text-center space-y-2">
                  <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto">
                    <FileText className="w-7 h-7 text-violet-600" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {isEn ? "Complete list of potential parts" : "Liste complète des pièces potentielles"}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {isEn
                      ? "Here is the list of required parts. Select the additional options:"
                      : "Voici la liste des pièces requises. Sélectionnez les options supplémentaires :"}
                  </p>
                </div>

                {/* Documents — show all PC documents (most complete set) */}
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="grid grid-cols-2 gap-px bg-slate-100">
                    {getDocumentsForType("PC").map((doc) => (
                      <div key={doc.code} className="bg-white px-4 py-3 flex items-start gap-2">
                        <Check className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">{doc.code}</p>
                          <p className="text-xs font-medium text-slate-800 leading-snug">{doc.label}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Optional add-ons */}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setAutoDetectCerfa(v => !v)}
                    className={`w-full rounded-xl border-2 px-4 py-3 flex items-center gap-3 text-left transition-colors ${autoDetectCerfa ? "border-violet-400 bg-violet-50" : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                  >
                    <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${autoDetectCerfa ? "border-violet-500 bg-violet-500" : "border-slate-300"
                      }`}>
                      {autoDetectCerfa && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-800">
                        {isEn ? "Pre-filled CERFA form" : "Formulaire CERFA pré-rempli"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {isEn ? "Save time: we automatically fill in the administrative fields." : "Gagnez du temps : nous remplissons automatiquement les champs administratifs."}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-violet-600">5€</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoDetectPlu(v => !v)}
                    className={`w-full rounded-xl border-2 px-4 py-3 flex items-center gap-3 text-left transition-colors ${autoDetectPlu ? "border-violet-400 bg-violet-50" : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                  >
                    <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${autoDetectPlu ? "border-violet-500 bg-violet-500" : "border-slate-300"
                      }`}>
                      {autoDetectPlu && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-800">
                        {isEn ? "Analysis of the regulations (PLU)" : "Analyse du règlement (PLU)"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {isEn ? "Verification of your project's compliance with local regulations." : "Vérification de la conformité de votre projet avec le règlement local."}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-violet-600">€15</span>
                  </button>
                </div>

                {/* Note */}
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                  <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5 mb-1">
                    <Info className="w-3.5 h-3.5" />
                    {isEn ? "Note – Detached House & Outbuildings" : "Note – Maison individuelle & annexes"}
                  </p>
                  <p className="text-xs text-amber-700">
                    {isEn ? "For the projects in question, also plan for:" : "Pour les projets concernés, prévoir également :"}
                  </p>
                  <ul className="text-xs text-amber-700 mt-1 space-y-0.5 list-disc list-inside">
                    <li>PCMI14-2: {isEn ? "RE2020 Certificate" : "Attestation RE2020"}</li>
                    <li>PCMI13: {isEn ? "Seismic Certificate" : "Attestation parasismique"}</li>
                  </ul>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setAutoDetectModal(null)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
                  >
                    {isEn ? "← Back to the simulator" : "← Retour au simulateur"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoDetectModal("payment")}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-semibold hover:shadow-lg hover:shadow-purple-500/20 transition-all"
                  >
                    {isEn ? "Confirm and access the editor" : "Confirmer et accéder à l'éditeur"}
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 2: Payment ── */}
            {autoDetectModal === "payment" && (
              <div className="p-6 space-y-5">
                {/* Header */}
                <div className="text-center space-y-1">
                  <h2 className="text-2xl font-bold text-slate-900">
                    {isEn ? "Access our smart editor" : "Accéder à notre éditeur intelligent"}
                  </h2>
                  <p className="text-sm text-slate-500">{projectData?.name}</p>
                </div>

                {/* Package card */}
                <div className="rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="bg-violet-50 px-5 py-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-violet-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-violet-700">
                        {isEn ? "Complete Urban Planning File" : "Dossier Urbanisme Complet"}
                      </p>
                      <p className="text-xs text-violet-500">
                        {isEn ? "Automatic DP or PC detection" : "Détection automatique DP ou PC"}
                      </p>
                    </div>
                    <span className="text-lg font-bold text-violet-600">AUTO</span>
                  </div>
                  <div className="px-5 py-4 space-y-2 border-t border-slate-100">
                    <div className="flex items-center gap-2 text-sm text-slate-700">
                      <FileText className="w-4 h-4 text-violet-400" />
                      <span>{isEn ? "7 regulatory documents" : "7 documents réglementaires"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-400 line-through">
                      <div className="w-4 h-4 rounded-full border-2 border-slate-200 shrink-0" />
                      <span>{isEn ? "Automatic regulatory analysis" : "Analyse réglementaire automatique"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-400 line-through">
                      <div className="w-4 h-4 rounded-full border-2 border-slate-200 shrink-0" />
                      <span>{isEn ? "Automatic CERFA form completion" : "Remplissage automatique du CERFA"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-700">
                      <Check className="w-4 h-4 text-violet-500" />
                      <span>{isEn ? "Site plan + floor plan" : "Plan de situation + plan de masse"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-700">
                      <Check className="w-4 h-4 text-violet-500" />
                      <span>{isEn ? "Automatically generated graphic elements" : "Éléments graphiques générés automatiquement"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-700">
                      <Check className="w-4 h-4 text-violet-500" />
                      <span>{isEn ? "Descriptive information automatically generated" : "Informations descriptives générées automatiquement"}</span>
                    </div>
                  </div>
                </div>

                {/* Price */}
                <div className="rounded-xl border border-slate-200 px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{isEn ? "Complete file" : "Dossier complet"}</p>
                    <p className="text-xs text-slate-500">{isEn ? "Current balance: 0 credits" : "Solde actuel : 0 crédits"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-slate-900">€ 89.00</p>
                    <p className="text-xs text-slate-500">{isEn ? "by file" : "par dossier"}</p>
                  </div>
                </div>

                {autoDetectError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-600">
                    {autoDetectError}
                  </div>
                )}

                {/* CTA */}
                <button
                  type="button"
                  disabled={autoDetectPaying}
                  onClick={async () => {
                    setAutoDetectPaying(true);
                    setAutoDetectError(null);
                    try {
                      const res = await fetch("/api/stripe/checkout", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ projectId, type: "credits", packageId: "credits-10" }),
                      });
                      const data = await res.json();
                      if (!res.ok) { setAutoDetectError(data.error || "Payment failed"); return; }
                      if (data.url) window.location.href = data.url;
                      else if (data.success) router.push(`/projects/${projectId}`);
                    } catch { setAutoDetectError(isEn ? "Payment failed" : "Paiement échoué"); }
                    finally { setAutoDetectPaying(false); }
                  }}
                  className="w-full py-3.5 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50 hover:bg-blue-700 hover:shadow-lg transition-all flex items-center justify-center gap-2 text-base"
                >
                  {autoDetectPaying ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> {isEn ? "Processing…" : "Traitement…"}</>
                  ) : (
                    <>{isEn ? "Confirm and access the editor" : "Confirmer et accéder à l'éditeur"}</>
                  )}
                </button>

                <p className="text-center text-xs text-slate-400">
                  {isEn ? "← Back" : "← Retour"}{" "}
                  <button
                    type="button"
                    onClick={() => setAutoDetectModal("documents")}
                    className="underline hover:text-slate-600"
                  >
                    {isEn ? "to document list" : "à la liste des documents"}
                  </button>
                </p>
              </div>
            )}
          </div>
        </div>
      )}


      {/* ═══ Quick-Action (DP / PC) Modal ═══ */}
      {quickModal && (() => {
        const isDP = quickModal.type === "DP";
        const accent = isDP
          ? { bg: "bg-emerald-50", icon: "bg-emerald-100 text-emerald-600", badge: "text-emerald-600", btn: "from-emerald-500 to-teal-500" }
          : { bg: "bg-purple-50", icon: "bg-purple-100 text-purple-600", badge: "text-purple-600", btn: "from-purple-500 to-violet-600" };
        const docs = getDocumentsForType(quickModal.type);
        const typeLabel = isDP
          ? (isEn ? "Preliminary Declaration" : "Déclaration Préalable")
          : (isEn ? "Building Permit" : "Permis de Construire");
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setQuickModal(null); }}
          >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

              {/* ── Step 0: Who submits? (PC only) ── */}
              {quickModal.step === "submitter" && (
                <div className="p-8 space-y-6">
                  <div className="space-y-1">
                    <h2 className="text-2xl font-bold text-slate-900">
                      {isEn ? "Who submits the application?" : "Qui dépose la demande ?"}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {isEn
                        ? "This information determines whether an architect is required for a building permit."
                        : "Cette information détermine si un architecte est requis pour un permis de construire."}
                    </p>
                  </div>
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => setQuickModal({ ...quickModal, step: "documents" })}
                      className="w-full flex items-center justify-between px-5 py-4 rounded-xl border-2 border-purple-300 bg-purple-50 text-left hover:bg-purple-100 transition-colors"
                    >
                      <span className="font-semibold text-slate-900">{isEn ? "Particular" : "Particulier"}</span>
                      <div className="w-5 h-5 rounded-full border-2 border-purple-400 shrink-0" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickModal({ ...quickModal, step: "legal-entity" })}
                      className="w-full flex items-center justify-between px-5 py-4 rounded-xl border-2 border-slate-200 bg-white text-left hover:bg-slate-50 transition-colors"
                    >
                      <span className="font-semibold text-slate-900 text-sm">
                        {isEn
                          ? "Legal entity (real estate investment company, corporation, etc.)"
                          : "Personne morale (SCI, société, etc.)"}
                      </span>
                      <div className="w-5 h-5 rounded-full border-2 border-slate-300 shrink-0" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">
                    <button type="button" onClick={() => setQuickModal(null)} className="underline hover:text-slate-600">
                      {isEn ? "← Back to the simulator" : "← Retour au simulateur"}
                    </button>
                  </p>
                </div>
              )}

              {/* ── Legal entity warning ── */}
              {quickModal.step === "legal-entity" && (
                <div className="p-8 space-y-5 text-center">
                  <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                    <AlertTriangle className="w-8 h-8 text-red-500" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-xl font-bold text-red-600">
                      {isEn ? "Mandatory Architect's Opinion" : "Avis d'architecte obligatoire"}
                    </h2>
                    <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 text-left">
                      {isEn
                        ? "Legal entities (SCI, companies, etc.) must use an architect for any Building Permit, regardless of the surface area."
                        : "Les personnes morales (SCI, sociétés, etc.) doivent obligatoirement recourir à un architecte pour tout Permis de Construire, quelle que soit la surface."}
                    </div>
                    <p className="text-sm font-bold text-slate-800 pt-1">
                      {isEn
                        ? "Our platform does not handle cases requiring the signature of an architect."
                        : "Notre plateforme ne traite pas les cas nécessitant la signature d'un architecte."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuickModal(null)}
                    className="px-8 py-3 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-700 transition-colors"
                  >
                    {isEn ? "Back to the simulator" : "Retour au simulateur"}
                  </button>
                </div>
              )}

              {/* ── Document list ── */}
              {quickModal.step === "documents" && (
                <div className="p-6 space-y-5">
                  <div className="text-center space-y-2">
                    <div className={`w-14 h-14 rounded-2xl ${accent.icon} flex items-center justify-center mx-auto`}>
                      {isDP ? <FileText className="w-7 h-7" /> : <ClipboardCheck className="w-7 h-7" />}
                    </div>
                    <h2 className="text-xl font-bold text-slate-900">
                      {isEn ? `Generate my ${typeLabel}` : `Générer ma ${typeLabel}`}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {isEn
                        ? "Here is the list of required parts. Select the additional options:"
                        : "Voici la liste des pièces requises. Sélectionnez les options supplémentaires :"}
                    </p>
                  </div>

                  {/* Documents grid */}
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="grid grid-cols-2 gap-px bg-slate-100">
                      {docs.map((doc) => (
                        <div key={doc.code} className="bg-white px-4 py-3 flex items-start gap-2">
                          <Check className={`w-4 h-4 shrink-0 mt-0.5 ${isDP ? "text-emerald-500" : "text-purple-500"}`} />
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">{doc.code}</p>
                            <p className="text-xs font-medium text-slate-800 leading-snug">{doc.label}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Optional add-ons */}
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setQuickModalCerfa(v => !v)}
                      className={`w-full rounded-xl border-2 px-4 py-3 flex items-center gap-3 text-left transition-colors ${quickModalCerfa ? "border-purple-400 bg-purple-50" : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                    >
                      <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${quickModalCerfa ? "border-purple-500 bg-purple-500" : "border-slate-300"
                        }`}>
                        {quickModalCerfa && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-800">
                          {isEn ? "Pre-filled CERFA form" : "Formulaire CERFA pré-rempli"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {isEn ? "Save time: we automatically fill in the administrative fields." : "Gain de temps : nous remplissons automatiquement les champs administratifs."}
                        </p>
                      </div>
                      <span className={`text-sm font-bold ${accent.badge}`}>5€</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickModalPlu(v => !v)}
                      className={`w-full rounded-xl border-2 px-4 py-3 flex items-center gap-3 text-left transition-colors ${quickModalPlu ? "border-purple-400 bg-purple-50" : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                    >
                      <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${quickModalPlu ? "border-purple-500 bg-purple-500" : "border-slate-300"
                        }`}>
                        {quickModalPlu && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-800">
                          {isEn ? "Analysis of the regulations (PLU)" : "Analyse de la réglementation (PLU)"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {isEn ? "Verification of your project's compliance with local regulations." : "Vérification de la conformité de votre projet aux règles locales."}
                        </p>
                      </div>
                      <span className={`text-sm font-bold ${accent.badge}`}>€15</span>
                    </button>
                  </div>

                  {/* Note */}
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                    <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5 mb-1">
                      <Info className="w-3.5 h-3.5" />
                      {isEn ? "Note – Detached House & Outbuildings" : "Note – Maison individuelle & annexes"}
                    </p>
                    <p className="text-xs text-amber-700">
                      {isEn ? "For the projects in question, also plan for:" : "Pour les projets concernés, prévoir également :"}
                    </p>
                    <ul className="text-xs text-amber-700 mt-1 space-y-0.5 list-disc list-inside">
                      <li>PCMI14-2: {isEn ? "RE2020 Certificate" : "Attestation RE2020"}</li>
                      <li>PCMI13: {isEn ? "Seismic Certificate" : "Attestation parasismique"}</li>
                    </ul>
                  </div>

                  {/* CTA */}
                  <button
                    type="button"
                    onClick={() => setQuickModal({ ...quickModal, step: "payment" })}
                    className={`w-full py-3 rounded-xl bg-gradient-to-r ${accent.btn} text-white font-semibold hover:shadow-lg transition-all`}
                  >
                    {isEn ? "Confirm and access the editor" : "Confirmer et accéder à l'éditeur"}
                  </button>
                  <p className="text-center text-xs text-slate-400">
                    <button
                      type="button"
                      onClick={() => setQuickModal(isDP ? null : { ...quickModal, step: "submitter" })}
                      className="underline hover:text-slate-600"
                    >
                      {isEn ? "← Back" : "← Retour"}
                    </button>
                  </p>
                </div>
              )}

              {/* ── Payment ── */}
              {quickModal.step === "payment" && (
                <div className="p-6 space-y-5">
                  <div className="text-center space-y-1">
                    <h2 className="text-2xl font-bold text-slate-900">
                      {isEn ? "Access our smart editor" : "Accéder à notre éditeur intelligent"}
                    </h2>
                    <p className="text-sm text-slate-500">{projectData?.name}</p>
                  </div>

                  {/* Package card */}
                  <div className="rounded-2xl border border-slate-200 overflow-hidden">
                    <div className={`${accent.bg} px-5 py-4 flex items-center gap-3`}>
                      <div className={`w-10 h-10 rounded-xl ${accent.icon} flex items-center justify-center`}>
                        {isDP ? <FileText className="w-5 h-5" /> : <ClipboardCheck className="w-5 h-5" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-900">{typeLabel}</p>
                        <p className={`text-xs ${accent.badge}`}>
                          {isDP ? (isEn ? "Complete DP file" : "Dossier DP complet") : (isEn ? "Complete PC file" : "Dossier PC complet")}
                        </p>
                      </div>
                      <span className={`text-lg font-bold ${accent.badge}`}>{quickModal.type}</span>
                    </div>
                    <div className="px-5 py-4 space-y-2 border-t border-slate-100">
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <FileText className={`w-4 h-4 ${accent.badge}`} />
                        <span>{isDP ? "9" : "12"} {isEn ? "regulatory documents" : "documents réglementaires"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-400 line-through">
                        <div className="w-4 h-4 rounded-full border-2 border-slate-200 shrink-0" />
                        <span>{isEn ? "Automatic regulatory analysis" : "Analyse réglementaire automatique"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-400 line-through">
                        <div className="w-4 h-4 rounded-full border-2 border-slate-200 shrink-0" />
                        <span>{isEn ? "Automatic CERFA form completion" : "Remplissage automatique du CERFA"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <Check className={`w-4 h-4 ${accent.badge}`} />
                        <span>{isEn ? "Site plan + floor plan" : "Plan de situation + plan de masse"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <Check className={`w-4 h-4 ${accent.badge}`} />
                        <span>{isEn ? "Automatically generated graphic elements" : "Éléments graphiques générés automatiquement"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <Check className={`w-4 h-4 ${accent.badge}`} />
                        <span>{isEn ? "Descriptive information automatically generated" : "Informations descriptives générées automatiquement"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="rounded-xl border border-slate-200 px-5 py-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{isEn ? "Complete file" : "Dossier complet"}</p>
                      <p className="text-xs text-slate-500">{isEn ? "Current balance: 0 credits" : "Solde actuel : 0 crédits"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-slate-900">€ 89.00</p>
                      <p className="text-xs text-slate-500">{isEn ? "by file" : "par dossier"}</p>
                    </div>
                  </div>

                  {quickModalError && (
                    <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-600">
                      {quickModalError}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={quickModalPaying}
                    onClick={async () => {
                      setQuickModalPaying(true);
                      setQuickModalError(null);
                      try {
                        const res = await fetch("/api/stripe/checkout", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ projectId, type: "credits", packageId: "credits-10" }),
                        });
                        const data = await res.json();
                        if (!res.ok) { setQuickModalError(data.error || "Payment failed"); return; }
                        if (data.url) window.location.href = data.url;
                        else if (data.success) router.push(`/projects/${projectId}`);
                      } catch { setQuickModalError(isEn ? "Payment failed" : "Paiement échoué"); }
                      finally { setQuickModalPaying(false); }
                    }}
                    className="w-full py-3.5 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50 hover:bg-blue-700 hover:shadow-lg transition-all flex items-center justify-center gap-2 text-base"
                  >
                    {quickModalPaying ? (
                      <><Loader2 className="w-5 h-5 animate-spin" /> {isEn ? "Processing…" : "Traitement…"}</>
                    ) : (
                      <>{isEn ? "Confirm and access the editor" : "Confirmer et accéder à l'éditeur"}</>
                    )}
                  </button>

                  <p className="text-center text-xs text-slate-400">
                    <button
                      type="button"
                      onClick={() => setQuickModal({ ...quickModal, step: "documents" })}
                      className="underline hover:text-slate-600"
                    >
                      {isEn ? "← Back to document list" : "← Retour à la liste des documents"}
                    </button>
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })()}


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
        "relative flex flex-col items-center gap-3 p-5 rounded-xl border transition-all text-center",
        selected
          ? `${c.bg} ${c.border} ring-2 ${c.ring}`
          : `bg-white border-slate-200 hover:${c.bg} hover:${c.border}`
      )}
    >
      {selected && (
        <div className={cn("absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center", c.check)}>
          <Check className="w-3.5 h-3.5" />
        </div>
      )}
      <div className={cn("w-14 h-14 rounded-xl flex items-center justify-center", c.bg, c.icon)}>
        {icon}
      </div>
      <p className="text-base font-medium text-slate-900 leading-tight">{title}</p>
      <p className="text-sm text-slate-400">{description}</p>
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
    <div className="space-y-1">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <div className="flex gap-2 h-[42px]">
        {[
          { value: 1, label: isEn ? "Ground floor" : "RDC" },
          { value: 2, label: isEn ? "R+1" : "R+1" },
          { value: 3, label: isEn ? "R+2" : "R+2" },
        ].map((lvl) => (
          <button
            key={lvl.value}
            type="button"
            onClick={() => setLevels(lvl.value)}
            className={cn(
              "flex-1 rounded-xl text-xs font-semibold transition-all border text-center",
              levels === lvl.value
                ? "bg-blue-100 text-blue-700 border-blue-300 ring-2 ring-blue-500/20"
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
