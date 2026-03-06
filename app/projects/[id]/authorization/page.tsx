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
  Home,
  X,
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
  getDocumentsForProject,
  DP_DOCUMENTS,
  PC_DOCUMENTS,
  DPC11_DOCUMENT,
  type AuthorizationDocument,
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
  changeOfUse?: boolean;
  facadeModification?: boolean;
  localDeliberation?: boolean;
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
  const [constructionFloorAreaOverride, setConstructionFloorAreaOverride] = useState<number | null | undefined>(undefined);

  // ── Travaux sur Existant state ──
  const [extensionSubTypes, setExtensionSubTypes] = useState<Set<ExtensionSubType>>(new Set());
  const [existingArea, setExistingArea] = useState<number>(0);
  const [extensionFootprint, setExtensionFootprint] = useState<number>(0);
  const [extensionLevels, setExtensionLevels] = useState<number>(1);
  const [extensionRange, setExtensionRange] = useState<AreaRange | null>(null);
  const [extensionFloorAreaOverride, setExtensionFloorAreaOverride] = useState<number | null | undefined>(undefined);

  // ── Aménagement Extérieur state ──
  const [outdoorTags, setOutdoorTags] = useState<Set<OutdoorTag>>(new Set());
  const [outdoorFreeText, setOutdoorFreeText] = useState("");
  const [outdoorSurface, setOutdoorSurface] = useState<number>(0);

  // ── Pool shelter (shown when swimming_pool tag is selected) ──
  const [poolShelterHeight, setPoolShelterHeight] = useState<number>(0);
  const [hasPoolShelter, setHasPoolShelter] = useState<boolean | null>(null);
  const [fenceLocalDeliberation, setFenceLocalDeliberation] = useState(false);

  // ── Zone detection (auto from address) ──
  const [isUrbanZone, setIsUrbanZone] = useState(true);
  // API-derived DP threshold — overrides hardcoded inUrbanZone logic
  const [dpThreshold, setDpThreshold] = useState<number>(40);
  const [isRnu, setIsRnu] = useState(false);
  // Simulated heritage protection (clickable override)
  const [simIsProtectedZone, setSimIsProtectedZone] = useState(false);

  // ── Submitter ──
  const [submitterType, setSubmitterType] = useState<SubmitterType | null>(null);

  // ── Result ──
  const [result, setResult] = useState<{
    determination: DeterminationType;
    explanation: string;
    architectRequired?: boolean;
    cannotOffer?: boolean;
    projectType?: ProjectTypeChoice;
    changeOfUse?: boolean;
    facadeModification?: boolean;
    shelterHeight?: number;
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
    regulatoryType?: string;
    isProtectedZone?: boolean;
    coordinates?: [number, number];
    citycode?: string;
  } | null>(null);

  // Load project data
  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.project) {
          const proj = d.project;
          // Parse coordinates if stored as JSON string
          let coords: [number, number] | undefined;
          if (proj.coordinates) {
            try {
              const parsed = typeof proj.coordinates === "string" ? JSON.parse(proj.coordinates) : proj.coordinates;
              if (parsed.lng && parsed.lat) coords = [parsed.lng, parsed.lat];
            } catch { /* */ }
          }
          setProjectData({
            name: proj.name,
            zoneType: proj.regulatoryAnalysis?.zoneType ?? proj.zoneType,
            address: proj.address,
            regulatoryType: proj.regulatoryType,
            isProtectedZone: (proj.protectedAreas ?? []).some(
              (a: { type: string }) => ["ABF", "HERITAGE", "MONUMENT_HISTORIQUE", "SITE_PATRIMONIAL"].includes(a.type)
            ),
            coordinates: coords,
            citycode: proj.citycode,
          });
          // Sync the simulated heritage state
          const isProtected = (proj.protectedAreas ?? []).some(
            (a: { type: string }) => ["ABF", "HERITAGE", "MONUMENT_HISTORIQUE", "SITE_PATRIMONIAL"].includes(a.type)
          );
          setSimIsProtectedZone(isProtected);
          // Auto-detect urban zone from PLU zone
          const zone = (proj.regulatoryAnalysis?.zoneType || proj.zoneType || "").toUpperCase();
          if (zone.startsWith("U") || zone.startsWith("AU")) {
            setIsUrbanZone(true);
            setDpThreshold(40);
          } else if (zone === "RNU") {
            setIsUrbanZone(false);
            setDpThreshold(20);
            setIsRnu(true);
          } else if (zone.startsWith("A") || zone.startsWith("N")) {
            setIsUrbanZone(false);
            setDpThreshold(20);
          }
          // When zone is empty (no data / white zone), keep defaults (urban=true, dpThreshold=40)
          // Use stored dpThreshold if available from previous decision
          const desc = proj.projectDescription;
          if (desc?.dpThreshold) {
            setDpThreshold(desc.dpThreshold);
          }
          if (desc?.isRnu !== undefined) {
            setIsRnu(desc.isRnu);
          }
        }
      })
      .catch(() => { });
  }, [projectId]);

  // ─── Computed floor areas ──────────────────────────────────────────

  const constructionFloorArea = useMemo(() => {
    if (!selectedCategories.has("new_construction") || constructionFootprint <= 0) return 0;
    if (constructionFloorAreaOverride != null && constructionFloorAreaOverride > 0) return constructionFloorAreaOverride;
    return estimateFloorAreaCreated(constructionFootprint, constructionLevels);
  }, [selectedCategories, constructionFootprint, constructionLevels, constructionFloorAreaOverride]);

  const extensionFloorArea = useMemo(() => {
    if (!selectedCategories.has("existing_extension") || extensionFootprint <= 0) return 0;
    if (extensionFloorAreaOverride != null && extensionFloorAreaOverride > 0) return extensionFloorAreaOverride;
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
      // Single-select: deselect if already selected, otherwise select only this one
      if (prev.has(tag)) return new Set<OutdoorTag>();
      return new Set<OutdoorTag>([tag]);
    });
  }

  // ─── Compute result ─────────────────────────────────────────────────

  function computeResult() {
    // Determine strictest result across all selected categories
    let strictest: { determination: DeterminationType; explanation: string; architectRequired?: boolean; projectType?: ProjectTypeChoice; changeOfUse?: boolean; facadeModification?: boolean; shelterHeight?: number } = {
      determination: "NONE",
      explanation: "",
      projectType: "new_construction",
    };

    const severity: Record<string, number> = { NONE: 0, DP: 1, PC: 2, ARCHITECT_REQUIRED: 3, REVIEW: 1 };

    // Construction Indépendante
    if (selectedCategories.has("new_construction") && constructionFootprint > 0) {
      const r = calculateDpPc({
        projectType: "new_construction",
        floorAreaCreated: constructionFloorArea,
        footprintCreated: constructionFootprint,
        inUrbanZone: isUrbanZone,
        dpThreshold,
        submitterType: submitterType || undefined,
      });
      if ((severity[r.determination] || 0) > (severity[strictest.determination] || 0)) {
        strictest = { ...r, projectType: "new_construction" };
      }
    }

    // Extension
    if (selectedCategories.has("existing_extension") && extensionFootprint > 0) {
      const changeOfUse = extensionSubTypes.has("convert");
      const facadeModification = extensionSubTypes.has("renovate");
      const r = calculateDpPc({
        projectType: "existing_extension",
        floorAreaCreated: extensionFloorArea,
        footprintCreated: extensionFootprint,
        existingFloorArea: existingArea || undefined,
        inUrbanZone: isUrbanZone,
        dpThreshold,
        submitterType: submitterType || undefined,
        changeOfUse,
        facadeModification,
      });
      if ((severity[r.determination] || 0) > (severity[strictest.determination] || 0)) {
        strictest = { ...r, projectType: "existing_extension", changeOfUse, facadeModification };
      }
    }

    // Outdoor
    if (selectedCategories.has("outdoor")) {
      if (outdoorTags.has("fence_gate")) {
        const r = calculateDpPc({ projectType: "outdoor_fence", floorAreaCreated: 0 });
        if ((severity[r.determination] || 0) > (severity[strictest.determination] || 0)) {
          strictest = { ...r, projectType: "outdoor_fence" };
        }
      }
      if (outdoorTags.has("swimming_pool") && outdoorSurface > 0) {
        const r = calculateDpPc({
          projectType: "swimming_pool",
          floorAreaCreated: outdoorSurface,
          shelterHeight: hasPoolShelter ? poolShelterHeight : 0,
        });
        if ((severity[r.determination] || 0) > (severity[strictest.determination] || 0)) {
          strictest = { ...r, projectType: "swimming_pool", shelterHeight: hasPoolShelter ? poolShelterHeight : 0 };
        }
      }
      if (outdoorTags.has("raised_terrace") || outdoorFreeText) {
        const r = calculateDpPc({ projectType: "outdoor_other", floorAreaCreated: 0 });
        if ((severity[r.determination] || 0) > (severity[strictest.determination] || 0)) {
          strictest = { ...r, projectType: "outdoor_other" };
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

  async function handleContinue() {
    const tempResult = computeResult();

    // If result is PC, ask about submitter first
    if (tempResult.determination === "PC" && !submitterType) {
      setStep("check-submitter");
      return;
    }

    // Save and navigate directly to documents (result step removed)
    const r = computeResult();
    setResult(r);
    await saveAndContinue(r);
  }

  async function handleSubmitterNext() {
    const r = computeResult();
    setResult(r);
    await saveAndContinue(r);
  }

  function goBack() {
    if (step === "check-submitter") {
      setStep("form");
    }
  }

  // ─── Save & Continue ────────────────────────────────────────────────

  async function saveAndContinue(overrideResult?: typeof result) {
    const r = overrideResult ?? result;
    if (!r) return;
    setSaving(true);
    try {
      const categories = Array.from(selectedCategories);
      const projectType = categories.length === 1
        ? (categories[0] === "new_construction" ? "construction"
          : categories[0] === "existing_extension" ? "extension"
            : "outdoor")
        : "mixed";

      // ── Call server-side Decision API for authoritative result ──────
      let serverDecision: {
        determination: string;
        explanation: string;
        architectRequired: boolean;
        dpThreshold: number;
        isUrbanZone: boolean;
        isRnu: boolean;
        isProtectedZone: boolean;
        requiresDpc11: boolean;
        timelineAdjustmentMonths: number;
      } | null = null;

      try {
        const decisionRes = await fetch("/api/decision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            projectType: r.projectType ?? (categories[0] ?? "new_construction"),
            floorAreaCreated: totalFloorArea,
            footprintCreated: constructionFootprint || extensionFootprint || outdoorSurface,
            existingFloorArea: existingArea || undefined,
            coordinates: projectData?.coordinates,
            citycode: projectData?.citycode,
            submitterType,
            changeOfUse: r.changeOfUse,
            facadeModification: r.facadeModification,
            shelterHeight: r.shelterHeight,
          }),
        });
        if (decisionRes.ok) {
          serverDecision = await decisionRes.json();
        }
      } catch {
        // Server decision failed — fall back to client-side result
        console.warn("Server decision API unavailable, using client-side result");
      }

      // Prefer server decision, fall back to client preview
      const finalDetermination = serverDecision?.determination
        ?? (r.determination === "ARCHITECT_REQUIRED" ? "PC" : r.determination);
      const finalExplanation = serverDecision?.explanation ?? r.explanation;

      await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorizationType: finalDetermination === "ARCHITECT_REQUIRED" ? "PC" : finalDetermination,
          authorizationExplanation: finalExplanation,
          projectType,
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
            architectRequired: serverDecision?.architectRequired ?? r.architectRequired ?? false,
            wantPluAnalysis,
            wantCerfa,
            isUrbanZone: serverDecision?.isUrbanZone ?? isUrbanZone,
            dpThreshold: serverDecision?.dpThreshold ?? dpThreshold,
            isRnu: serverDecision?.isRnu ?? isRnu,
            isProtectedZone: serverDecision?.isProtectedZone ?? false,
            requiresDpc11: serverDecision?.requiresDpc11 ?? false,
            timelineAdjustmentMonths: serverDecision?.timelineAdjustmentMonths ?? 0,
            poolShelterHeight: poolShelterHeight || undefined,
            decisionSource: serverDecision ? "server" : "client",
          },
        }),
      });
      router.push(`/projects/${projectId}/payment`);
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
      router.push(`/projects/${projectId}/payment`);
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
                {dpThreshold && <span className="ml-1 text-xs opacity-70">(seuil DP : {dpThreshold} m²)</span>}
              </span>
            )}
          </div>

          {/* ═══ RNU Warning Banner ═══ */}
          {isRnu && (
            <div className="max-w-2xl mx-auto mb-4 rounded-xl bg-amber-50 border border-amber-300 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-800">
                  {isEn ? "Land subject to RNU" : "Terrain soumis au RNU"}
                </p>
                <p className="text-sm text-amber-700">
                  {isEn
                    ? "Buildability limited to urban continuity. The preliminary declaration threshold remains at 20 m²."
                    : "Constructibilité limitée à la continuité de l'urbanisation. Le seuil de déclaration préalable reste à 20 m²."}
                </p>
              </div>
            </div>
          )}

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

          {/* Smart guide banner — ALWAYS visible as accordion toggle */}
          {step === "form" && (
            <div className="flex justify-center w-full mb-2">
              <button
                type="button"
                onClick={() => {
                  setShowCategoryCards((v) => {
                    if (v) {
                      setSelectedCategories(new Set());
                    } else {
                      // Auto-select new construction by default when opening
                      setSelectedCategories(new Set(["new_construction"]));
                    }
                    return !v;
                  });
                }}
                className={`relative w-full max-w-2xl rounded-2xl overflow-hidden text-center group transition-all duration-300 hover:-translate-y-0.5 ${
                  showCategoryCards
                    ? "border-2 border-indigo-200 hover:border-indigo-400 hover:shadow-md"
                    : "hover:shadow-xl hover:shadow-violet-500/30"
                }`}
              >
                {/* Background */}
                <div className={`absolute inset-0 transition-all duration-300 ${
                  showCategoryCards
                    ? "bg-indigo-50 group-hover:bg-indigo-100"
                    : "bg-indigo-600 group-hover:bg-indigo-700"
                }`} />
                {/* Decorative blobs — only when closed */}
                {!showCategoryCards && (
                  <>
                    <div className="pointer-events-none absolute -top-6 -right-6 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
                    <div className="pointer-events-none absolute -bottom-4 -left-4 w-32 h-32 rounded-full bg-indigo-300/20 blur-xl" />
                  </>
                )}
                {/* Content */}
                <div className={`relative flex flex-col items-center gap-3 px-8 transition-all duration-300 ${showCategoryCards ? "py-5" : "py-10"}`}>
                  {/* Icon circle */}
                  <div className={`rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                    showCategoryCards
                      ? "w-11 h-11 bg-indigo-100 border-indigo-300"
                      : "w-16 h-16 bg-white/20 border-white/30"
                  }`}>
                    <ClipboardCheck className={`transition-colors duration-300 ${showCategoryCards ? "w-5 h-5 text-indigo-600" : "w-8 h-8 text-white"}`} />
                  </div>
                  {/* Title */}
                  <p className={`font-bold leading-snug transition-colors duration-300 ${
                    showCategoryCards ? "text-base text-indigo-700" : "text-xl text-white"
                  }`}>
                    {isEn ? "Describe your work or constructions." : "Décrivez vos travaux ou constructions."}
                  </p>
                  {/* Subtitle */}
                  <p className={`text-sm transition-colors duration-300 ${showCategoryCards ? "text-indigo-400" : "text-white/75"}`}>
                    {showCategoryCards
                      ? (isEn ? "Click to close the guide." : "Cliquez pour fermer le guide.")
                      : (isEn ? "We will guide you to quickly identify the permit required for your project." : "Nous vous guidons pour identifier rapidement l'autorisation requise.")}
                  </p>
                </div>
              </button>
            </div>
          )}

          {/* Two-column layout for form step */}
          <div className={step === "form" ? "flex gap-6 items-stretch" : "max-w-3xl mx-auto"}>

            {/* LEFT COLUMN */}
            <div className={step === "form" ? "flex-1 min-w-0 space-y-5" : "space-y-6"}>

              {/* ═══ STEP: Main Form ═══ */}
              {step === "form" && (
                <div className="space-y-5">

                  {/* ── Regulatory Context Card ── */}
                  {showCategoryCards && (
                    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                      {/* Card header */}
                      <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <Home className="w-4 h-4 text-indigo-500" />
                            <h3 className="text-sm font-bold text-slate-900">
                              {isEn ? "Regulatory Context" : "Contexte Réglementaire"}
                            </h3>
                          </div>
                          <p className="text-xs text-slate-500">
                            {isEn ? "Automatic simulation of local urban planning regulations" : "Simulation automatique des règles d'urbanisme locales"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            // Refresh: reset zone to auto-detected
                            const zone = (projectData?.zoneType || "").toUpperCase();
                            if (zone.startsWith("U") || zone.startsWith("AU")) { setIsUrbanZone(true); setDpThreshold(40); setIsRnu(false); }
                            else if (zone === "RNU") { setIsUrbanZone(false); setDpThreshold(20); setIsRnu(true); }
                            else if (zone.startsWith("A") || zone.startsWith("N")) { setIsUrbanZone(false); setDpThreshold(20); setIsRnu(false); }
                          }}
                          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          <Activity className="w-3.5 h-3.5" />
                          {isEn ? "Generate another location" : "Simuler un autre lieu"}
                        </button>
                      </div>

                      {/* Project location bar */}
                      <div className="mx-6 mb-4 rounded-xl bg-slate-900 px-4 py-3 text-center">
                        <p className="text-sm font-bold text-white uppercase tracking-wide">
                          {isEn ? "PROJECT" : "PROJET"} – {(projectData?.address?.split(",").slice(-2, -1)[0] || projectData?.address || "–").trim().toUpperCase()}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center justify-center gap-1">
                          <span>📍</span>
                          <span>{projectData?.address || (isEn ? "Address not available" : "Adresse non disponible")}</span>
                        </p>
                      </div>

                      {/* Two regulation panels */}
                      <div className="px-6 pb-5 grid grid-cols-2 gap-3">
                        {/* Zone panel — clickable to toggle */}
                        <button
                          type="button"
                          onClick={(e) => {
                            // Cycle through: Urban → Natural/Agri → RNU → Urban
                            if (isUrbanZone && !isRnu) { setIsUrbanZone(false); setDpThreshold(20); setIsRnu(false); }
                            else if (!isUrbanZone && !isRnu) { setIsUrbanZone(false); setDpThreshold(20); setIsRnu(true); }
                            else { setIsUrbanZone(true); setDpThreshold(40); setIsRnu(false); }
                            // Blur immediately so the browser does NOT auto-scroll to keep this button in view
                            e.currentTarget.blur();
                          }}
                          className="text-left rounded-xl border border-slate-200 p-3 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors flex flex-col"
                          style={{height: "130px", overflow: "hidden"}}
                        >
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                            {isEn ? "Applicable Regulations" : "Réglementation Applicable"}
                          </p>
                          {isRnu ? (
                            <>
                              <p className="text-sm font-bold text-orange-600">
                                {isEn ? "RNU Zone" : "Zone RNU"}
                              </p>
                              <div className="flex items-start gap-1.5 mt-1">
                                <span className="text-orange-500 text-xs">⚠</span>
                                <p className="text-xs text-slate-600 leading-snug">
                                  {isEn ? "National urban rules apply. Extension limited to 20m²." : "Règlement national d'urbanisme. Extension limitée à 20m²."}
                                </p>
                              </div>
                            </>
                          ) : isUrbanZone ? (
                            <>
                              <p className="text-sm font-bold text-indigo-700">
                                {isEn ? "Urban Zone (U)" : "Zone Urbaine (U)"}
                              </p>
                              <div className="flex items-start gap-1.5 mt-1">
                                <Check className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                                <p className="text-xs text-slate-600 leading-snug">
                                  {isEn ? "Densely populated area. Extension threshold raised to 40m²." : "Zone densément peuplée. Seuil extension relevé à 40m²."}
                                </p>
                              </div>
                            </>
                          ) : (
                            <>
                              <p className="text-sm font-bold text-orange-600">
                                {isEn ? "Natural/Agricultural Area (N/A)" : "Zone Nat./Agricole (N/A)"}
                              </p>
                              <div className="flex items-start gap-1.5 mt-1">
                                <span className="text-orange-500 text-xs">⚠</span>
                                <p className="text-xs text-slate-600 leading-snug">
                                  {isEn ? "Outside urban area. Extension limited to 20m²." : "Hors zone urbaine. Extension limitée à 20m²."}
                                </p>
                              </div>
                            </>
                          )}
                        </button>

                        {/* ABF / Heritage panel — clickable to toggle */}
                        <button
                          type="button"
                          onClick={() => setSimIsProtectedZone(v => !v)}
                          className="text-left rounded-xl border border-slate-200 p-3 hover:border-amber-300 hover:bg-amber-50/40 transition-colors flex flex-col"
                          style={{height: "130px", overflow: "hidden"}}
                        >
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                            {isEn ? "Heritage Protection" : "Protection Patrimoniale"}
                          </p>
                          {simIsProtectedZone ? (
                            <>
                              <p className="text-sm font-bold text-orange-600">
                                {isEn ? "Protected Area (ABF)" : "Zone Protégée (ABF)"}
                              </p>
                              <div className="flex items-start gap-1.5 mt-1">
                                <span className="text-orange-500 text-xs">⚠</span>
                                <p className="text-xs text-slate-600 leading-snug">
                                  {isEn ? "Site classified or surroundings of a historical monument (AC1)." : "Site classé ou abords d'un monument historique (AC1)."}
                                </p>
                              </div>
                            </>
                          ) : (
                            <>
                              <p className="text-sm font-bold text-emerald-700">
                                {isEn ? "Unprotected Sector" : "Secteur Non Protégé"}
                              </p>
                              <div className="flex items-start gap-1.5 mt-1">
                                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                <p className="text-xs text-slate-600 leading-snug">
                                  {isEn ? "No specific heritage constraints." : "Aucune contrainte patrimoniale spécifique."}
                                </p>
                              </div>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Hint */}
                      <div className="px-6 pb-4">
                        <p className="text-xs text-indigo-500 italic text-center">
                          {isEn ? "Click on the areas above to manually simulate other constraints." : "Cliquez sur les zones ci-dessus pour simuler d'autres contraintes."}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ── Add Jobs Card with integrated type selector ── */}
                  {showCategoryCards && (
                    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                      {/* Card header */}
                      <div className="px-6 pt-5 pb-4 border-b border-slate-100">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-slate-900">+</span>
                            <h3 className="text-base font-bold text-slate-900">
                              {isEn ? "Add jobs" : "Ajouter des travaux"}
                            </h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setShowCategoryCards(false); setSelectedCategories(new Set()); }}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-sm text-slate-500">
                          {isEn ? "What is the nature of your project?" : "Quelle est la nature de votre projet ?"}
                        </p>
                      </div>
                      {/* Inline type buttons */}
                      <div className="px-6 py-4 grid grid-cols-3 gap-3">
                        <button
                          type="button"
                          onClick={() => toggleCategory("new_construction")}
                          className={cn(
                            "flex flex-col items-start gap-2 px-4 py-4 rounded-xl border-2 text-left transition-all",
                            selectedCategories.has("new_construction")
                              ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-500/20"
                              : "bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
                          )}
                        >
                          <Building2 className={cn("w-5 h-5", selectedCategories.has("new_construction") ? "text-white" : "text-indigo-500")} />
                          <span className="text-sm font-semibold leading-snug">
                            {isEn ? "New detached construction" : "Construction neuve"}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleCategory("existing_extension")}
                          className={cn(
                            "flex flex-col items-start gap-2 px-4 py-4 rounded-xl border-2 text-left transition-all",
                            selectedCategories.has("existing_extension")
                              ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-500/20"
                              : "bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
                          )}
                        >
                          <Hammer className={cn("w-5 h-5", selectedCategories.has("existing_extension") ? "text-white" : "text-amber-500")} />
                          <span className="text-sm font-semibold leading-snug">
                            {isEn ? "Work on existing" : "Travaux sur existant"}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleCategory("outdoor")}
                          className={cn(
                            "flex flex-col items-start gap-2 px-4 py-4 rounded-xl border-2 text-left transition-all",
                            selectedCategories.has("outdoor")
                              ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-500/20"
                              : "bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
                          )}
                        >
                          <TreePine className={cn("w-5 h-5", selectedCategories.has("outdoor") ? "text-white" : "text-emerald-500")} />
                          <span className="text-sm font-semibold leading-snug">
                            {isEn ? "Outdoor landscaping" : "Aménagement extérieur"}
                          </span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Total Floor Area Banner removed as per requirements */}

                  {/* ═══ Construction Indépendante Section ═══ */}
                  {selectedCategories.has("new_construction") && (
                    <div className="rounded-2xl bg-blue-50/40 border border-blue-200/60 p-6 space-y-5">

                      {/* Level selector */}
                      <LevelSelector
                        label={isEn ? "Number of levels" : "Nombre de niveaux"}
                        levels={constructionLevels}
                        setLevels={setConstructionLevels}
                        isEn={isEn}
                      />

                      {/* Footprint + Floor area side by side */}
                      <div className="grid grid-cols-2 gap-4">
                        {/* Footprint input */}
                        <div className="space-y-1.5">
                          <label className="text-sm font-semibold text-slate-700">
                            {isEn ? "Footprint (m²)" : "Emprise au sol (m²)"}
                          </label>
                          <input
                            type="number"
                            value={constructionFootprint || ""}
                            onChange={(e) => { setConstructionFootprint(Number(e.target.value)); setConstructionRange(null); }}
                            className="w-full px-4 py-3 rounded-xl bg-white border-2 border-indigo-300 text-slate-900 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all"
                            placeholder={isEn ? "e.g. 22" : "ex. 22"}
                            min={0}
                          />
                        </div>
                        {/* Floor area (auto-estimated) */}
                        <div className="space-y-1.5">
                          <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                            {isEn ? "Floor area (estimated)" : "Surface de plancher (estimée)"}
                            <span className="text-slate-400">🧮</span>
                          </label>
                          <input
                            type="number"
                            value={constructionFloorAreaOverride === undefined ? (constructionFloorArea > 0 ? parseFloat(constructionFloorArea.toFixed(2)) : "") : (constructionFloorAreaOverride !== null ? constructionFloorAreaOverride : "")}
                            onChange={(e) => setConstructionFloorAreaOverride(e.target.value === "" ? null : Number(e.target.value))}
                            className={cn(
                              "w-full px-4 py-3 rounded-xl border-2 text-base font-bold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400",
                              constructionFloorArea > 0
                                ? "bg-indigo-50 border-indigo-300 text-indigo-700 focus:border-indigo-400"
                                : "bg-slate-50 border-slate-200 text-slate-400"
                            )}
                            placeholder="—"
                            min={0}
                            step={0.01}
                          />
                          {constructionFootprint > 0 && (
                            <p className="text-[10px] text-slate-400">
                              = {constructionFootprint} m² × {constructionLevels} {constructionLevels > 1 ? (isEn ? "levels" : "niveaux") : (isEn ? "level" : "niveau")} × 0.9
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Add to folder button */}
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
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-base font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                      >
                        {isEn ? "Add to folder" : "Ajouter au dossier"}
                      </button>
                    </div>
                  )}

                  {/* ═══ Travaux sur Existant Section ═══ */}
                  {selectedCategories.has("existing_extension") && (
                    <div className="rounded-2xl bg-amber-50/40 border border-amber-200/60 p-6 space-y-5">

                      {/* Current living area — yellow box */}
                      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-2">
                        <label className="text-sm font-bold text-amber-900 flex items-center gap-2">
                          <Home className="w-4 h-4" />
                          {isEn ? "Current living area before renovations" : "Surface habitable actuelle avant travaux"}
                        </label>
                        <input
                          type="number"
                          value={existingArea || ""}
                          onChange={(e) => setExistingArea(Number(e.target.value))}
                          className="w-full px-4 py-3 rounded-xl bg-white border-2 border-amber-200 text-slate-900 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all"
                          placeholder={isEn ? "Example: 100" : "Exemple : 100"}
                          min={0}
                        />
                        <div className="flex items-start gap-2">
                          <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                          <p className="text-xs text-amber-800 leading-snug">
                            {isEn
                              ? 'You can find this information in your personal space on impot.gouv.fr, under the section "My real estate".'
                              : 'Vous pouvez retrouver cette information sur votre espace impot.gouv.fr, rubrique "Mes biens immobiliers".'}
                          </p>
                        </div>
                      </div>

                      {/* Specify the type of work (multi-select) */}
                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-slate-700">
                          {isEn ? "Specify the type of work (Multiple choices possible):" : "Précisez le type de travaux (Plusieurs choix possibles) :"}
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                          {([
                            { value: "extend" as ExtensionSubType, label: isEn ? "Extension / Raising the Height" : "Extension / Surélévation" },
                            { value: "convert" as ExtensionSubType, label: isEn ? "Change of destination" : "Changement de destination" },
                            { value: "renovate" as ExtensionSubType, label: isEn ? "Change in exterior appearance" : "Modification aspect extérieur" },
                          ]).map((sub) => (
                            <button key={sub.value} type="button"
                              onClick={() => toggleExtensionSubType(sub.value)}
                              className={cn("relative group px-4 py-3 rounded-xl transition-all border-2 text-center",
                                extensionSubTypes.has(sub.value)
                                  ? "bg-indigo-50 text-indigo-700 border-indigo-400 ring-2 ring-indigo-500/20"
                                  : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
                              )}>
                              <span className="block font-medium text-sm leading-snug">{sub.label}</span>
                              <Info className="w-3.5 h-3.5 text-slate-400 mx-auto mt-1.5" />
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Level selector */}
                      <LevelSelector
                        label={isEn ? "Number of levels" : "Nombre de niveaux"}
                        levels={extensionLevels}
                        setLevels={setExtensionLevels}
                        isEn={isEn}
                      />

                      {/* Footprint + Floor area side by side */}
                      <div className="grid grid-cols-2 gap-4">
                        {/* Footprint input */}
                        <div className="space-y-1.5">
                          <label className="text-sm font-semibold text-slate-700">
                            {isEn ? "Footprint (m²)" : "Emprise au sol (m²)"}
                          </label>
                          <input
                            type="number"
                            value={extensionFootprint || ""}
                            onChange={(e) => { setExtensionFootprint(Number(e.target.value)); setExtensionRange(null); }}
                            className="w-full px-4 py-3 rounded-xl bg-white border-2 border-amber-300 text-slate-900 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all"
                            placeholder={isEn ? "e.g. 22" : "ex. 22"}
                            min={0}
                          />
                        </div>
                        {/* Floor area (editable) */}
                        <div className="space-y-1.5">
                          <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                            {isEn ? "Floor area (estimated)" : "Surface de plancher (estimée)"}
                            <span className="text-slate-400">🧮</span>
                          </label>
                          <input
                            type="number"
                            value={extensionFloorAreaOverride === undefined ? (extensionFloorArea > 0 ? parseFloat(extensionFloorArea.toFixed(2)) : "") : (extensionFloorAreaOverride !== null ? extensionFloorAreaOverride : "")}
                            onChange={(e) => setExtensionFloorAreaOverride(e.target.value === "" ? null : Number(e.target.value))}
                            className={cn(
                              "w-full px-4 py-3 rounded-xl border-2 text-base font-bold transition-all focus:outline-none focus:ring-2 focus:ring-amber-400",
                              extensionFloorArea > 0
                                ? "bg-amber-50 border-amber-300 text-amber-700 focus:border-amber-400"
                                : "bg-slate-50 border-slate-200 text-slate-400"
                            )}
                            placeholder="—"
                            min={0}
                            step={0.01}
                          />
                          {extensionFootprint > 0 && (
                            <p className="text-[10px] text-slate-400">
                              = {extensionFootprint} m² × {extensionLevels} {extensionLevels > 1 ? (isEn ? "levels" : "niveaux") : (isEn ? "level" : "niveau")} × 0.9
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Add to folder button */}
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
                            changeOfUse: extensionSubTypes.has("convert"),
                            facadeModification: extensionSubTypes.has("renovate"),
                          });
                        }}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-base font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                      >
                        {isEn ? "Add to folder" : "Ajouter au dossier"}
                      </button>
                    </div>
                  )}

                  {/* ═══ Aménagement Extérieur Section ═══ */}
                  {selectedCategories.has("outdoor") && (
                    <div className="rounded-2xl bg-white border border-emerald-500/20 p-6 space-y-5">

                      {/* Specify the layout — radio-style like client simulation */}
                      <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-3">
                        <p className="text-sm font-semibold text-slate-700">
                          {isEn ? "Specify the layout:" : "Précisez l'aménagement :"}
                        </p>
                        <div className="space-y-2">
                          {([
                            { value: "swimming_pool" as OutdoorTag, label: isEn ? "Pool" : "Piscine" },
                            { value: "fence_gate" as OutdoorTag, label: isEn ? "Fence / Gate" : "Clôture / Portail" },
                          ]).map((tag) => (
                            <label key={tag.value} className="flex items-center gap-3 cursor-pointer group">
                              <span className={cn(
                                "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                                outdoorTags.has(tag.value)
                                  ? "border-indigo-500 bg-indigo-500"
                                  : "border-slate-300 bg-white group-hover:border-slate-400"
                              )}>
                                {outdoorTags.has(tag.value) && (
                                  <span className="w-2 h-2 rounded-full bg-white" />
                                )}
                              </span>
                              <span className={cn(
                                "text-sm font-medium transition-colors",
                                outdoorTags.has(tag.value) ? "text-slate-900" : "text-slate-600"
                              )}>
                                {tag.label}
                              </span>
                              <input
                                type="radio"
                                name="outdoor_layout"
                                className="sr-only"
                                checked={outdoorTags.has(tag.value)}
                                onChange={() => toggleOutdoorTag(tag.value)}
                              />
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* ── Pool fields ── */}
                      {outdoorTags.has("swimming_pool") && (
                        <>
                          {/* Pool surface area */}
                          <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700">
                              {isEn ? "Pool surface area (m²)" : "Surface de la piscine (m²)"}
                            </label>
                            <input
                              type="number"
                              value={outdoorSurface || ""}
                              onChange={(e) => setOutdoorSurface(Number(e.target.value))}
                              className="w-full px-4 py-3 rounded-xl bg-white border-2 border-slate-300 text-slate-900 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all"
                              placeholder={isEn ? "e.g. 50" : "ex. 50"}
                              min={0}
                            />
                          </div>

                          {/* Is there a pool enclosure? — checkbox style like client demo */}
                          <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-3">
                            <label className="flex items-center gap-3 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={hasPoolShelter === true}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setHasPoolShelter(true);
                                  } else {
                                    setHasPoolShelter(false);
                                    setPoolShelterHeight(0);
                                  }
                                }}
                                className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="text-sm font-medium text-slate-700">
                                {isEn ? "Is there a pool enclosure?" : "Y a-t-il un abri de piscine ?"}
                              </span>
                            </label>
                            {hasPoolShelter && (
                              <div className="space-y-1 ml-8">
                                <label className="text-xs text-slate-500 font-medium">
                                  {isEn ? "Shelter height (m)" : "Hauteur de l'abri (m)"}
                                </label>
                                <input
                                  type="number"
                                  value={poolShelterHeight || ""}
                                  onChange={(e) => setPoolShelterHeight(Number(e.target.value))}
                                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm"
                                  placeholder="0.05"
                                  step={0.01} min={0}
                                />
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {/* ── Fence / Gate — local deliberation checkbox ── */}
                      {outdoorTags.has("fence_gate") && (
                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-1">
                          <label className="flex items-start gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={fenceLocalDeliberation}
                              onChange={(e) => setFenceLocalDeliberation(e.target.checked)}
                              className="w-5 h-5 mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <div>
                              <span className="text-sm font-semibold text-slate-800 block">
                                {isEn ? "Local deliberation?" : "Délibération locale ?"}
                              </span>
                              <span className="text-xs text-slate-500 leading-snug block mt-0.5">
                                {isEn
                                  ? "Has the municipality introduced the requirement for prior authorization (DP) for fences (or protected areas)?"
                                  : "La commune a-t-elle instauré l'obligation de déclaration préalable (DP) pour les clôtures (ou zones protégées) ?"}
                              </span>
                            </div>
                          </label>
                        </div>
                      )}

                      {/* ── Other option — text description + surface area ── */}
                      {!outdoorTags.has("swimming_pool") && !outdoorTags.has("fence_gate") && (
                        <>
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={outdoorFreeText}
                              onChange={(e) => setOutdoorFreeText(e.target.value)}
                              className="w-full px-4 py-3.5 rounded-xl bg-white border-2 border-slate-300 text-slate-900 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all placeholder:text-slate-400 placeholder:font-normal"
                              placeholder={isEn ? "Other (Carport, Wooden shed…)" : "Autre (Carport, Abri bois…)"}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700">
                              {isEn ? "Total ground surface occupied (m²)" : "Surface totale occupée au sol (m²)"}
                            </label>
                            <input
                              type="number"
                              value={outdoorSurface || ""}
                              onChange={(e) => setOutdoorSurface(Number(e.target.value))}
                              className="w-full px-4 py-3.5 rounded-xl bg-white border-2 border-slate-300 text-slate-900 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all"
                              placeholder={isEn ? "e.g. 50" : "ex. 50"}
                              min={0}
                            />
                          </div>
                        </>
                      )}

                      {/* Add to folder button */}
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
                              : outdoorFreeText || (isEn ? "Other" : "Autre");
                          addWorkItem({
                            label: `${tagLabel} ${count}`,
                            projectType: mainTag as ProjectTypeChoice,
                            floorAreaCreated: outdoorSurface,
                            footprintCreated: outdoorSurface,
                            shelterHeight: hasPoolShelter ? poolShelterHeight : 0,
                            inUrbanZone: isUrbanZone,
                            localDeliberation: outdoorTags.has("fence_gate") ? fenceLocalDeliberation : undefined,
                          });
                        }}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-base font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                      >
                        {isEn ? "Add to folder" : "Ajouter au dossier"}
                      </button>
                    </div>
                  )}

                  {/* ═══ Total Floor Area Banner — now shown at top, removed from here ═══ */}

                  {/* Continue button — only shown when at least one work item has been added */}
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
                    {saving ? (
                      <><Loader2 className="w-5 h-5 animate-spin" /> {isEn ? "Saving…" : "Enregistrement…"}</>
                    ) : (
                      <>{isEn ? "Continue" : "Continuer"} <ChevronRight className="w-5 h-5" /></>
                    )}
                  </button>
                </div>
              )}



            </div>{/* end LEFT COLUMN */}

            {/* RIGHT COLUMN — Live Analysis Panel */}
            {step === "form" && showCategoryCards && (
              <div className="w-[480px] shrink-0 sticky top-6" style={{alignSelf: "stretch"}}>
                <div
                  className="rounded-2xl overflow-hidden shadow-lg flex flex-col h-full"
                  style={{background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4338ca 100%)", minHeight: "520px"}}
                >
                  {/* Panel header */}
                  <div className="px-5 py-4 border-b border-white/10 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                    <div>
                      <p className="text-sm font-bold text-white">
                        {isEn ? "Analysis of the type of authorization required" : "Analyse type d'autorisation"}
                      </p>
                      <p className="text-[11px] text-indigo-300 mt-0.5">
                        {isEn ? "Automatic updates based on your work" : "Mise à jour automatique selon vos travaux"}
                      </p>
                    </div>
                  </div>

                  {/* ── Overall Summary — always shown ── */}
                  <div className="px-5 py-4 border-b border-white/10 space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">
                      {isEn ? "Overall Summary" : "Synthèse Globale"}
                    </p>
                    {(() => {
                      const newItems = workItems.filter(w => w.projectType === "new_construction");
                      const existingItems = workItems.filter(w => w.projectType === "existing_extension");
                      const totalNewCreated = newItems.reduce((s, w) => s + w.floorAreaCreated, 0);
                      const totalExisting = existingItems.reduce((s, w) => s + (w.existingFloorArea || 0), 0);
                      const totalExistingCreated = existingItems.reduce((s, w) => s + w.floorAreaCreated, 0);
                      const architectNeeded = workItems.some((item) => {
                        const r = calculateDpPc({
                          projectType: item.projectType, floorAreaCreated: item.floorAreaCreated,
                          footprintCreated: item.footprintCreated, existingFloorArea: item.existingFloorArea,
                          shelterHeight: item.shelterHeight, inUrbanZone: item.inUrbanZone,
                          changeOfUse: item.changeOfUse,
                          facadeModification: item.facadeModification,
                        });
                        return r.determination === "ARCHITECT_REQUIRED";
                      });

                      if (workItems.length === 0) return (
                        <div className="space-y-2">
                          {/* Default: No architect required badge */}
                          <div className="flex items-center gap-2 p-3 rounded-xl" style={{background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)"}}>
                            <Check className="w-4 h-4 text-green-400 shrink-0" />
                            <div>
                              <p className="text-xs font-bold text-green-300">{isEn ? "No architect required" : "Architecte non requis"}</p>
                              <p className="text-[11px] text-green-400/80 mt-0.5">{isEn ? "Architect thresholds not reached." : "Seuils d'architecte non atteints."}</p>
                            </div>
                          </div>
                        </div>
                      );

                      return (
                        <div className="space-y-2">
                          {/* New buildings section */}
                          {newItems.length > 0 && (
                            <div className="rounded-xl overflow-hidden" style={{background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)"}}>
                              <div className="px-3 py-2 border-b border-white/10">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">{isEn ? "New Buildings" : "Nouvelles Constructions"}</p>
                              </div>
                              <div className="px-3 py-2 flex items-center justify-between">
                                <span className="text-xs text-indigo-200">{isEn ? "Created" : "Créée"}</span>
                                <span className="text-sm font-bold text-white">{totalNewCreated.toFixed(1)} m²</span>
                              </div>
                            </div>
                          )}
                          {/* Existing work section */}
                          {existingItems.length > 0 && (
                            <div className="rounded-xl overflow-hidden" style={{background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)"}}>
                              <div className="px-3 py-2 border-b border-white/10">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">{isEn ? "Work on Existing" : "Travaux sur Existant"}</p>
                              </div>
                              <div className="px-3 py-2 flex items-center justify-between">
                                <span className="text-xs text-indigo-200">{isEn ? "Existing" : "Existant"}</span>
                                <span className="text-sm font-bold text-white">{totalExisting > 0 ? `${totalExisting.toFixed(1)} m²` : "—"}</span>
                              </div>
                              <div className="px-3 py-2 flex items-center justify-between border-t border-white/10">
                                <span className="text-xs text-indigo-200">{isEn ? "Created" : "Créée"}</span>
                                <span className="text-sm font-bold text-white">{totalExistingCreated.toFixed(1)} m²</span>
                              </div>
                              <div className="px-3 py-2 flex items-center justify-between border-t border-white/10 bg-white/5">
                                <span className="text-xs font-semibold text-indigo-200">{isEn ? "Total After Works" : "Total après travaux"}</span>
                                <span className="text-sm font-bold text-white">{(totalExisting + totalExistingCreated).toFixed(1)} m²</span>
                              </div>
                            </div>
                          )}
                          {/* Architect status */}
                          {architectNeeded ? (
                            <div className="flex items-center gap-2 p-3 rounded-xl" style={{background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)"}}>
                              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                              <div>
                                <p className="text-xs font-bold text-red-300 uppercase tracking-wide">{isEn ? "Architect Required" : "Architecte Obligatoire"}</p>
                                <p className="text-[11px] text-red-400/80 mt-0.5">{isEn ? "Architect thresholds reached." : "Seuils d'architecte atteints."}</p>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 p-3 rounded-xl" style={{background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)"}}>
                              <Check className="w-4 h-4 text-green-400 shrink-0" />
                              <div>
                                <p className="text-xs font-bold text-green-300">{isEn ? "No architect required" : "Architecte non requis"}</p>
                                <p className="text-[11px] text-green-400/80 mt-0.5">{isEn ? "Architect thresholds not reached." : "Seuils d'architecte non atteints."}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* ── List of works ── */}
                  <div className="px-5 py-4 flex-1 space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">
                      {isEn ? `List of works (${workItems.length})` : `Liste des travaux (${workItems.length})`}
                    </p>
                    {workItems.length === 0 ? (
                      <p className="text-[11px] text-indigo-400 italic">
                        {isEn ? "Add all the work you plan to do to this folder." : "Ajoutez tous vos travaux à ce dossier."}
                      </p>
                    ) : workItems.map((item) => {
                      const res = calculateDpPc({
                        projectType: item.projectType, floorAreaCreated: item.floorAreaCreated,
                        footprintCreated: item.footprintCreated, existingFloorArea: item.existingFloorArea,
                        shelterHeight: item.shelterHeight, inUrbanZone: item.inUrbanZone,
                        changeOfUse: item.changeOfUse,
                        facadeModification: item.facadeModification,
                      });
                      const badgeColor =
                        res.determination === "PC" || res.determination === "ARCHITECT_REQUIRED"
                          ? "bg-amber-400/25 text-amber-300 border-amber-400/40"
                          : res.determination === "DP"
                            ? "bg-blue-400/25 text-blue-300 border-blue-400/40"
                            : "bg-emerald-400/25 text-emerald-300 border-emerald-400/40";
                      const badgeLabel =
                        res.determination === "PC" ? (isEn ? "BUILDING PERMIT" : "PERMIS DE CONSTRUIRE")
                          : res.determination === "ARCHITECT_REQUIRED" ? (isEn ? "BUILDING PERMIT" : "PERMIS DE CONSTRUIRE")
                            : res.determination === "DP" ? (isEn ? "PRELIMINARY DECLARATION" : "DÉCLARATION PRÉALABLE")
                              : (isEn ? "NO AUTHORIZATION" : "AUCUNE AUTORISATION");
                      // Override explanation for fence with local deliberation
                      let explanationText = res.explanation;
                      if (item.projectType === "outdoor_fence" && item.localDeliberation) {
                        explanationText = isEn
                          ? "The fence is subject to public consultation by local resolution."
                          : "La clôture est soumise à déclaration préalable par délibération locale.";
                      } else if (item.projectType === "outdoor_fence" && !item.localDeliberation) {
                        explanationText = isEn
                          ? "Fences do not require authorization (no local deliberation)."
                          : "Les clôtures ne nécessitent pas d'autorisation (pas de délibération locale).";
                      }
                      // Split explanation into bullet points
                      const bullets = explanationText
                        ? explanationText.split(/\. (?=[A-ZÀ-Ö]|[a-zà-ö])/).filter(Boolean)
                        : [];
                      return (
                        <div key={item.id} className="rounded-xl p-3 space-y-2" style={{background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)"}}>
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-bold text-white leading-snug flex-1">{item.label}</p>
                            <button
                              type="button"
                              onClick={() => removeWorkItem(item.id)}
                              className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center bg-red-500/20 text-red-400 border border-red-400/30 hover:bg-red-500/30 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeColor}`}>
                            {badgeLabel}
                          </span>
                          {(item.floorAreaCreated > 0 || item.footprintCreated > 0) && (
                            <p className="text-[11px] text-indigo-300">
                              {item.floorAreaCreated > 0 && `• ${isEn ? "Floor area" : "Plancher"}: ${item.floorAreaCreated.toFixed(1)} m²`}
                              {item.footprintCreated > 0 && ` | ${isEn ? "Footprint" : "Emprise"}: ${item.footprintCreated} m²`}
                            </p>
                          )}
                          {bullets.length > 0 && (
                            <ul className="space-y-0.5">
                              {bullets.slice(0, 4).map((b, i) => (
                                <li key={i} className="text-[11px] text-indigo-300/80 leading-relaxed flex gap-1">
                                  <span className="shrink-0 mt-0.5">•</span>
                                  <span>{b.replace(/\.$/, '')}.</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {res.determination === "ARCHITECT_REQUIRED" && (
                            <p className="text-[11px] text-amber-300 font-semibold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              {isEn ? "Architect Signature Required" : "Signature Architecte Requise"}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer */}
                  <div className="px-5 py-3 border-t border-white/10">
                    <p className="text-[10px] text-indigo-400/70 leading-relaxed italic">
                      {isEn
                        ? "These results are indicative only. Consult your town hall or the local urban development plan (PLU) for final confirmation."
                        : "Ces résultats sont donnés à titre indicatif. Consultez votre mairie ou le PLU local pour validation définitive."}
                    </p>
                  </div>
                </div>
              </div>
            )}

          </div>{/* end two-column wrapper */}

          {/* ═══ Bottom Bar — appears once items are added ═══ */}
          {step === "form" && showCategoryCards && workItems.length > 0 && (
            <div
              className="mt-6 rounded-2xl bg-white border border-slate-200 shadow-[0_4px_24px_rgba(0,0,0,0.08)] px-6 py-5 flex items-center justify-between"
              style={{ animation: "slide-up 0.35s cubic-bezier(0.16,1,0.3,1)" }}
            >
              <div>
                <p className="text-base font-bold text-slate-900">
                  {isEn ? "Is your application complete?" : "Votre dossier est-il complet ?"}
                </p>
                <p className="text-sm text-slate-500 mt-0.5">
                  {isEn ? "Proceed to the next step to obtain the parts list." : "Passez à l'étape suivante pour obtenir la liste des pièces."}
                </p>
              </div>
              <button
                type="button"
                onClick={handleContinue}
                className="shrink-0 px-8 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-base font-semibold transition-all shadow-md hover:shadow-lg hover:shadow-indigo-500/25 flex items-center gap-2"
              >
                {isEn ? "See the required documents" : "Voir les documents requis"} <span className="text-lg">→</span>
              </button>
            </div>
          )}

        </div>{/* end max-w-7xl */}
      </div >



      {/* ═══ Auto Detection Modal ═══ */}
      {
        autoDetectModal && (
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

                  {/* Documents — show all PC documents with dual DPC codes (most complete set) */}
                  {(() => {
                    // Build merged list: PC docs with dual DPC codes, plus DPC 11 if ABF
                    const hasABF = projectData?.isProtectedZone ?? false;
                    const mergedDocs = PC_DOCUMENTS.map((doc) => ({
                      ...doc,
                      displayCode: doc.dualCode ? `${doc.code} / ${doc.dualCode}` : doc.code,
                    }));
                    // Add DPC 11 only for the "I don't know" merged view if ABF (as a DP-specific doc)
                    const allDocs = hasABF
                      ? [...mergedDocs, { ...DPC11_DOCUMENT, displayCode: DPC11_DOCUMENT.code }]
                      : mergedDocs;
                    return (
                      <div className="rounded-xl border border-slate-200 overflow-hidden">
                        <div className="grid grid-cols-2 gap-px bg-slate-100">
                          {allDocs.map((doc) => (
                            <div key={doc.code} className="bg-white px-4 py-3 flex items-start gap-2">
                              <Check className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">{(doc as { displayCode?: string }).displayCode || doc.code}</p>
                                <p className="text-xs font-medium text-slate-800 leading-snug">{doc.label}</p>
                                {doc.tag === "ABF" && (
                                  <p className="text-[10px] text-amber-600 mt-0.5">{isEn ? "Required in ABF zone only" : "Requis en zone ABF uniquement"}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Note — Detached House & Outbuildings */}
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

                  {/* Note — single-family houses & annexes (PC only, PCMI docs not applicable to DP) */}

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
                        <span>{isEn ? `${getDocumentsForType("PC").length} regulatory documents` : `${getDocumentsForType("PC").length} documents réglementaires`}</span>
                      </div>
                      <div className={`flex items-center gap-2 text-sm ${autoDetectPlu ? "text-slate-700" : "text-slate-400 line-through"}`}>
                        {autoDetectPlu ? <Check className="w-4 h-4 text-violet-500" /> : <div className="w-4 h-4 rounded-full border-2 border-slate-200 shrink-0" />}
                        <span>{isEn ? "Automatic regulatory analysis" : "Analyse réglementaire automatique"}</span>
                      </div>
                      <div className={`flex items-center gap-2 text-sm ${autoDetectCerfa ? "text-slate-700" : "text-slate-400 line-through"}`}>
                        {autoDetectCerfa ? <Check className="w-4 h-4 text-violet-500" /> : <div className="w-4 h-4 rounded-full border-2 border-slate-200 shrink-0" />}
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
                      <p className="text-2xl font-bold text-slate-900">€ {(89 + (autoDetectCerfa ? 5 : 0) + (autoDetectPlu ? 15 : 0)).toFixed(2)}</p>
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
                          body: JSON.stringify({
                            projectId,
                            type: "credits",
                            packageId: "credits-10",
                            successUrl: `/projects/${projectId}/payment?success=true&returnTo=project-description`,
                          }),
                        });
                        const data = await res.json();
                        if (!res.ok) { setAutoDetectError(data.error || "Payment failed"); return; }
                        if (data.url) window.location.href = data.url;
                        else if (data.success) router.push(`/projects/${projectId}/project-description`);
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
        )
      }


      {/* ═══ Quick-Action (DP / PC) Modal ═══ */}
      {
        quickModal && (() => {
          const isDP = quickModal.type === "DP";
          const accent = isDP
            ? { bg: "bg-emerald-50", icon: "bg-emerald-100 text-emerald-600", badge: "text-emerald-600", btn: "from-emerald-500 to-teal-500" }
            : { bg: "bg-purple-50", icon: "bg-purple-100 text-purple-600", badge: "text-purple-600", btn: "from-purple-500 to-violet-600" };
          const docs = getDocumentsForProject(quickModal.type, { hasABF: projectData?.isProtectedZone ?? false });
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
                              <div className="flex items-center gap-1.5">
                                <p className="text-[10px] font-bold text-slate-400 uppercase">{doc.code}</p>
                                {doc.tag === "ABF" && (
                                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">ABF</span>
                                )}
                              </div>
                              <p className="text-xs font-medium text-slate-800 leading-snug">{doc.label}</p>
                              {doc.tag === "ABF" && doc.description && (
                                <p className="text-[10px] text-amber-600 mt-0.5">{doc.description}</p>
                              )}
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


                    {/* Note — single-family houses & annexes (PC only) */}
                    {!isDP && (
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
                    )}

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
                          <span>{docs.length} {isEn ? "regulatory documents" : "documents réglementaires"}</span>
                        </div>
                        <div className={`flex items-center gap-2 text-sm ${quickModalPlu ? "text-slate-700" : "text-slate-400 line-through"}`}>
                          {quickModalPlu ? <Check className={`w-4 h-4 ${accent.badge}`} /> : <div className="w-4 h-4 rounded-full border-2 border-slate-200 shrink-0" />}
                          <span>{isEn ? "Automatic regulatory analysis" : "Analyse réglementaire automatique"}</span>
                        </div>
                        <div className={`flex items-center gap-2 text-sm ${quickModalCerfa ? "text-slate-700" : "text-slate-400 line-through"}`}>
                          {quickModalCerfa ? <Check className={`w-4 h-4 ${accent.badge}`} /> : <div className="w-4 h-4 rounded-full border-2 border-slate-200 shrink-0" />}
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
                        <p className="text-2xl font-bold text-slate-900">€ {(89 + (quickModalCerfa ? 5 : 0) + (quickModalPlu ? 15 : 0)).toFixed(2)}</p>
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
                          else if (data.success) router.push(`/projects/${projectId}/project-description`);
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
        })()
      }


    </Navigation >
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
    <div className="space-y-2">
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      <div className="flex flex-wrap gap-2">
        {[
          { value: 1, label: isEn ? "Ground floor (ground floor)" : "Rez-de-chaussée (plain-pied)" },
          { value: 2, label: isEn ? "Ground floor + 1st floor" : "RDC + 1 étage" },
          { value: 3, label: isEn ? "Ground floor + 2 floors" : "RDC + 2 étages" },
        ].map((lvl) => (
          <button
            key={lvl.value}
            type="button"
            onClick={() => setLevels(lvl.value)}
            className={cn(
              "px-4 py-2.5 rounded-xl text-sm font-medium transition-all border",
              levels === lvl.value
                ? "bg-amber-100 text-amber-800 border-amber-300"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
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
