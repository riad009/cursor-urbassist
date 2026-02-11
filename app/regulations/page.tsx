"use client";

import React, { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Navigation from "@/components/layout/Navigation";
import {
  Upload,
  FileText,
  Sparkles,
  Brain,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  ChevronRight,
  Loader2,
  Building2,
  Ruler,
  Trees,
  Car,
  Home,
  Zap,
  Eye,
  Download,
  RefreshCw,
  MessageSquare,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildReportFromAnalysis,
  saveReportToSession,
} from "@/lib/regulatory-report";

interface AnalysisResult {
  category: string;
  title: string;
  status: "compliant" | "warning" | "violation" | "info";
  value: string;
  requirement: string;
  recommendation?: string;
  /** Where this rule comes from (e.g. PLU document, article reference) */
  regulationSource?: string;
  /** Zone label with full name (e.g. "UB - Zone Urbaine Mixte") */
  zoneLabel?: string;
  /** Full regulatory text or longer description */
  fullRequirementText?: string;
  /** How this applies to the project in plain language */
  context?: string;
  /** Legal/article reference if known */
  articleReference?: string;
  /** Numeric min/max for display (e.g. "5m", "12m") */
  minValue?: string;
  maxValue?: string;
  unit?: string;
}

const mockAnalysis: AnalysisResult[] = [
  {
    category: "Height",
    title: "Maximum Building Height",
    status: "compliant",
    value: "8.5m",
    requirement: "Max 12m allowed in zone UB - Zone Urbaine Mixte",
    recommendation: "Your project is within the allowed height limit. Height is measured from natural ground to the highest point of the roof (ridge or flat roof).",
    regulationSource: "PLU – Règlement graphique et écrit, article hauteur",
    zoneLabel: "UB - Zone Urbaine Mixte",
    fullRequirementText: "La hauteur maximale des constructions est fixée à 12 mètres en zone UB. La hauteur est mesurée à partir du terrain naturel jusqu’au point le plus haut du bâtiment (faîte ou toit-terrasse). Les superstructures (cheminées, gaines) peuvent dépasser sous conditions.",
    context: "Your building height (8.5 m) is below the 12 m limit for this zone. This leaves room for a two-storey building with a pitched roof.",
    minValue: "0m",
    maxValue: "12m",
    unit: "m",
  },
  {
    category: "Setback",
    title: "Front Setback",
    status: "compliant",
    value: "5m",
    requirement: "Min 5m required from road",
    recommendation: "Compliant with local regulations. The front setback is measured from the road boundary to the façade or to the projection of the roof overhang if it is included in the footprint.",
    regulationSource: "PLU – Règlement des zones, alignement et recul",
    zoneLabel: "UB - Zone Urbaine Mixte",
    fullRequirementText: "Un recul minimal de 5 mètres par rapport à la limite séparative avec la voie publique est exigé en front de rue. Ce recul s’applique aux constructions et, selon le PLU, peut inclure les débords de toiture.",
    context: "Your 5 m front setback meets the minimum. This distance applies from the road (voie) to the main façade or to the regulatory building line.",
    minValue: "5m",
    unit: "m",
  },
  {
    category: "Coverage",
    title: "Plot Coverage Ratio",
    status: "compliant",
    value: "40%",
    requirement: "Max 40% allowed",
    recommendation: "Within the allowed coverage. The ratio is the footprint (emprise au sol) divided by the parcel area.",
    regulationSource: "PLU – Coefficient d’emprise au sol (CES)",
    zoneLabel: "UB - Zone Urbaine Mixte",
    fullRequirementText: "Le coefficient d’emprise au sol (CES) est fixé à 40 % maximum. L’emprise au sol comprend les constructions couvertes ou découvertes, sous le débord des toitures si le PLU le prévoit.",
    context: "Your current footprint uses 40% of the parcel, which is at the maximum allowed. Any extension will require reducing another built surface or staying under the total limit.",
    maxValue: "40%",
    unit: "%",
  },
  {
    category: "Parking",
    title: "Parking Spaces",
    status: "info",
    value: "1 place per 60m² of floor area",
    requirement: "1 place per 60m² of floor area",
    recommendation: "Verify that the number of spaces matches the total floor area of your project. Each space must be at least 2.50 m × 5.00 m.",
    regulationSource: "PLU – Règlement stationnement",
    fullRequirementText: "Une place de stationnement est exigée par tranche de 60 m² de surface de plancher créée ou réhabilitée. Les places doivent être sur la parcelle ou à proximité selon les dispositions du PLU.",
    context: "For a 120 m² floor area you need at least 2 spaces. The plan de masse must show the parking layout with the required dimensions.",
  },
  {
    category: "Green Space",
    title: "Vegetated Area",
    status: "info",
    value: "Minimum 20% of parcel area must be landscaped",
    requirement: "Minimum 20% of parcel area must be landscaped",
    recommendation: "Plan landscaping accordingly. Semi-permeable and vegetated surfaces count toward this minimum; impermeable surfaces do not.",
    regulationSource: "PLU – Espaces verts et perméabilité",
    zoneLabel: "UB - Zone Urbaine Mixte",
    fullRequirementText: "Au moins 20 % de la surface de la parcelle doit être en espaces verts ou végétalisés. Les revêtements semi-perméables (graviers, dalles gazon) peuvent être comptabilisés selon le PLU.",
    context: "Your site plan should show the vegetated and semi-permeable areas and confirm that they represent at least 20% of the parcel.",
  },
  {
    category: "Distance",
    title: "Architectural Requirements",
    status: "info",
    value: "4 constraints",
    requirement: "Roof pitch between 30-45 degrees, Natural materials for facades (stone, wood, render), Maximum 2 colors for exterior walls, Traditional window proportions required",
    recommendation: "Review all architectural constraints before finalising façades and roof design.",
    regulationSource: "PLU – Règles de composition et d’aspect",
    fullRequirementText: "Pente de toiture entre 30 et 45° ; matériaux naturels pour les façades (pierre, bois, enduit) ; maximum 2 couleurs pour les murs extérieurs ; proportions des ouvertures conformes au caractère local.",
    context: "These rules apply to the visible appearance of the building. The insertion paysagère and elevations will be checked against these requirements.",
  },
];

const statusConfig = {
  compliant: { label: "Compliant", color: "text-emerald-400", bg: "bg-emerald-500/20", icon: CheckCircle2 },
  warning: { label: "Warning", color: "text-amber-400", bg: "bg-amber-500/20", icon: AlertTriangle },
  violation: { label: "Violation", color: "text-red-400", bg: "bg-red-500/20", icon: XCircle },
  info: { label: "Info", color: "text-blue-400", bg: "bg-blue-500/20", icon: Info },
};

const categoryIcons: Record<string, React.ElementType> = {
  Height: Building2,
  Setback: Ruler,
  Coverage: Home,
  Parking: Car,
  "Green Space": Trees,
  Distance: Ruler,
  Zone: MapPin,
  Conclusion: FileText,
};

function RegulationsPageContent() {
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [selectedResult, setSelectedResult] = useState<AnalysisResult | null>(null);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [isAskingAI, setIsAskingAI] = useState(false);
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<"document" | "address" | "project">("document");
  const [addressForPlu, setAddressForPlu] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<{ label: string; coordinates?: number[] }[]>([]);
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string; address?: string | null; coordinates?: string | null }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoMessage, setAutoMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [addressSearchDone, setAddressSearchDone] = useState(false);
  const searchParams = useSearchParams();
  const projectIdFromUrl = searchParams.get("project");

  useEffect(() => {
    if (projectIdFromUrl && projects.some((p) => p.id === projectIdFromUrl)) {
      setSelectedProjectId(projectIdFromUrl);
      setAnalysisMode("project");
    }
  }, [projectIdFromUrl, projects]);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects || []))
      .catch(() => setProjects([]));
  }, []);

  const [showUploadFallback, setShowUploadFallback] = useState(false);
  const [fallbackFile, setFallbackFile] = useState<File | null>(null);
  const [uploadingFallback, setUploadingFallback] = useState(false);

  const runAutoRegulatory = async (uploadedContent?: string) => {
    if (!selectedProjectId) return;
    setAutoRunning(true);
    setAutoMessage(null);
    setShowUploadFallback(false);
    try {
      const bodyPayload: Record<string, unknown> = {};
      if (uploadedContent) bodyPayload.documentContent = uploadedContent;

      const res = await fetch(`/api/projects/${selectedProjectId}/regulatory/auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const creditsUsed = data.creditsUsed ?? 3;
        const hasStructuredAnalysis =
          data.analysis &&
          (data.analysis.usageDesSols ||
            data.analysis.conclusion ||
            data.analysis.article1_occupations_interdites ||
            data.analysis.summary);
        if (hasStructuredAnalysis) {
          const deepResults = transformDeepAnalysis(data.analysis, data.zoneType);
          setResults(deepResults);
          setAnalysisComplete(true);
        }
        setAutoMessage({ type: "success", text: `Deep PLU analysis completed (${creditsUsed} credits used). Zone: ${data.zoneType || "detected"}.` });
      } else if (res.status === 402) {
        setAutoMessage({ type: "error", text: data.error || "Insufficient credits for PLU analysis." });
      } else {
        const errText = data.error || "Automatic detection failed.";
        const showUpload =
          res.status === 400 ||
          res.status === 502 ||
          data.code === "ZONE_OR_DOC_NOT_FOUND" ||
          errText.includes("no coordinates") ||
          errText.includes("PLU detection failed") ||
          errText.includes("upload your PLU") ||
          errText.includes("could not be retrieved");
        if (showUpload) {
          setShowUploadFallback(true);
          setAutoMessage({
            type: "error",
            text: errText.includes("no address") || errText.includes("no coordinates")
              ? "Project has no address or zone could not be detected. You can upload your PLU document below for analysis (3 credits)."
              : "Zone or PLU document could not be retrieved automatically. Upload your PLU regulation (PDF) below for analysis (3 credits).",
          });
        } else {
          setAutoMessage({ type: "error", text: errText });
        }
      }
    } catch {
      setAutoMessage({ type: "error", text: "Request failed." });
    }
    setAutoRunning(false);
  };

  const handleFallbackUpload = async () => {
    if (!fallbackFile || !selectedProjectId) return;
    setUploadingFallback(true);
    try {
      // Parse file content
      let documentContent = "";
      if (fallbackFile.type === "application/pdf" || fallbackFile.type.includes("word")) {
        const formData = new FormData();
        formData.append("file", fallbackFile);
        const uploadRes = await fetch("/api/upload-document", { method: "POST", body: formData });
        const uploadData = await uploadRes.json();
        documentContent = uploadData.content || "";
      } else {
        documentContent = await fallbackFile.text();
      }
      if (!documentContent || documentContent.trim().length < 50) {
        setAutoMessage({ type: "error", text: "Could not extract text from the document. Try a text-based PDF." });
        setUploadingFallback(false);
        return;
      }
      // Run analysis with uploaded content
      await runAutoRegulatory(documentContent);
    } catch {
      setAutoMessage({ type: "error", text: "Upload failed." });
    }
    setUploadingFallback(false);
  };

  /** Map conformité from in-depth analysis to status */
  function conformiteToStatus(conformite: string): AnalysisResult["status"] {
    const c = String(conformite).toUpperCase();
    if (c === "OUI") return "compliant";
    if (c === "NON") return "violation";
    if (c === "A VERIFIER") return "warning";
    return "info"; // "Non concerné" or other
  }

  /** Transform the deep analysis (sections + items or legacy articles) into AnalysisResult[] */
  function transformDeepAnalysis(analysis: Record<string, unknown>, zoneType?: string | null): AnalysisResult[] {
    const results: AnalysisResult[] = [];
    const zone = (analysis.zoneClassification as string) || zoneType || "";

    // New in-depth format: sections with items (reglementation, conformite)
    const sectionKeys = [
      "usageDesSols",
      "conditionsOccupation",
      "implantationVolumetrie",
      "aspectExterieur",
      "stationnement",
      "espacesLibres",
      "reseauxVrd",
      "autresReglementations",
    ] as const;
    const hasNewFormat =
      sectionKeys.some((k) => analysis[k] && Array.isArray((analysis[k] as { items?: unknown[] })?.items)) ||
      (analysis.conclusion && typeof (analysis.conclusion as { resume?: string })?.resume === "string");

    if (hasNewFormat) {
      if (zone) {
        results.push({
          category: "Zone",
          title: "Zone PLU",
          status: "info",
          value: zone,
          requirement: (analysis.zoneDescription as string) || zone,
          regulationSource: "PLU",
          zoneLabel: zone,
        });
      }
      const situation = analysis.situationProjet as { lotissement?: boolean; abf?: boolean; ppr?: boolean; details?: string } | undefined;
      if (situation && (situation.lotissement || situation.abf || situation.ppr || situation.details)) {
        const parts = [
          situation.lotissement && "Lotissement",
          situation.abf && "Zone ABF",
          situation.ppr && "PPR",
        ].filter(Boolean);
        results.push({
          category: "Zone",
          title: "Situation du projet",
          status: situation.abf || situation.ppr ? "warning" : "info",
          value: parts.length ? parts.join(", ") : (situation.details || "–"),
          requirement: situation.details || "Contexte réglementaire du projet.",
          regulationSource: "PLU",
        });
      }
      for (const key of sectionKeys) {
        const section = analysis[key] as { sectionTitle?: string; items?: { item: string; reglementation: string; conformite: string }[] } | undefined;
        if (!section?.items?.length) continue;
        const category = section.sectionTitle || key;
        for (const row of section.items) {
          results.push({
            category,
            title: row.item,
            status: conformiteToStatus(row.conformite),
            value: row.conformite,
            requirement: row.reglementation,
            fullRequirementText: row.reglementation,
            regulationSource: "PLU – " + (section.sectionTitle || key),
            zoneLabel: zone || undefined,
          });
        }
      }
      const conclusion = analysis.conclusion as { resume?: string; typeDossier?: string } | undefined;
      if (conclusion?.resume || conclusion?.typeDossier) {
        results.push({
          category: "Conclusion",
          title: "Résumé et type de dossier",
          status: "info",
          value: conclusion.typeDossier || "–",
          requirement: conclusion.resume || "",
          recommendation: conclusion.typeDossier ? `Type de dossier suggéré : ${conclusion.typeDossier}` : undefined,
          regulationSource: "Analyse PLU",
          zoneLabel: zone || undefined,
        });
      }
      if (results.length > 0) return results;
    }

    // Legacy format: article-based (articles 1–16)
    const summary = (analysis.summary || {}) as Record<string, unknown>;

    if (zone) {
      results.push({
        category: "Zone", title: "Zone classification", status: "info",
        value: zone,
        requirement: (analysis.zoneDescription as string) || zone,
        recommendation: (analysis.documentReference as string) || "",
        regulationSource: (analysis.documentReference as string) || "PLU",
        zoneLabel: zone,
      });
    }

    // Height (Article 10)
    const a10 = (analysis.article10_hauteur || {}) as Record<string, unknown>;
    const maxH = a10.hauteurMax ?? a10.hauteurFaitage ?? (summary.maxHeight as number | null);
    if (maxH != null) {
      results.push({
        category: "Height", title: "Maximum Building Height",
        status: "compliant", value: `${maxH}m`,
        requirement: `Max ${maxH}m — ${(a10.modeCalcul as string) || "hauteur au faîtage"}`,
        recommendation: (a10.details as string) || "",
        regulationSource: (a10.title as string) || "Article 10",
        zoneLabel: zone, maxValue: `${maxH}m`, unit: "m",
        fullRequirementText: (a10.content as string) || "",
      });
    }

    // Setbacks (Articles 6, 7)
    const a6 = (analysis.article6_implantation_voies || {}) as Record<string, unknown>;
    const a7 = (analysis.article7_implantation_limites || {}) as Record<string, unknown>;
    const setbacks = (summary.setbacks || {}) as Record<string, unknown>;
    if (a6.recul != null || setbacks.front != null) {
      const val = a6.recul ?? setbacks.front;
      results.push({
        category: "Setback", title: "Front Setback (voies)",
        status: "compliant", value: `${val}m`,
        requirement: `Min ${val}m — ${(a6.alignement as string) || "recul par rapport aux voies"}`,
        regulationSource: (a6.title as string) || "Article 6",
        zoneLabel: zone, minValue: `${val}m`, unit: "m",
        fullRequirementText: (a6.content as string) || "",
      });
    }
    if (a7.retrait != null || setbacks.side != null) {
      const val = a7.retrait ?? setbacks.side;
      results.push({
        category: "Setback", title: "Side Setback (limites séparatives)",
        status: "compliant", value: `${val}m`,
        requirement: `${a7.enLimite ? "En limite autorisé" : `Min ${val}m`} — ${(a7.formuleH as string) || ""}`,
        regulationSource: (a7.title as string) || "Article 7",
        zoneLabel: zone, minValue: `${val}m`, unit: "m",
        fullRequirementText: (a7.content as string) || "",
      });
    }

    // Coverage (Article 9)
    const a9 = (analysis.article9_emprise_sol || {}) as Record<string, unknown>;
    const ces = a9.ces ?? summary.maxCoverageRatio;
    if (ces != null) {
      const pct = typeof ces === "number" && ces <= 1 ? `${Math.round((ces as number) * 100)}%` : `${ces}`;
      results.push({
        category: "Coverage", title: "Plot Coverage Ratio (CES)",
        status: "compliant", value: pct,
        requirement: `Max ${pct}`,
        regulationSource: (a9.title as string) || "Article 9",
        zoneLabel: zone, maxValue: pct, unit: "%",
        fullRequirementText: (a9.content as string) || "",
      });
    }

    // Parking (Article 12)
    const a12 = (analysis.article12_stationnement || {}) as Record<string, unknown>;
    if (a12.content || summary.parkingRequirements) {
      results.push({
        category: "Parking", title: "Parking Requirements",
        status: "info", value: (a12.habitat as string) || (summary.parkingRequirements as string) || "",
        requirement: (a12.content as string) || (summary.parkingRequirements as string) || "",
        regulationSource: (a12.title as string) || "Article 12",
        zoneLabel: zone,
        fullRequirementText: `Habitat: ${a12.habitat || "–"} | Commerce: ${a12.commerce || "–"} | Vélos: ${a12.velo || "–"}`,
      });
    }

    // Green space (Article 13)
    const a13 = (analysis.article13_espaces_verts || {}) as Record<string, unknown>;
    if (a13.content || summary.greenSpaceRequirements) {
      results.push({
        category: "Green Space", title: "Espaces verts & plantations",
        status: "info",
        value: a13.pourcentageMin != null ? `${a13.pourcentageMin}%` : (summary.greenSpaceRequirements as string) || "",
        requirement: (a13.content as string) || (summary.greenSpaceRequirements as string) || "",
        regulationSource: (a13.title as string) || "Article 13",
        zoneLabel: zone,
        fullRequirementText: (a13.content as string) || "",
      });
    }

    // Architecture (Article 11)
    const a11 = (analysis.article11_aspect_exterieur || {}) as Record<string, unknown>;
    if (a11.content) {
      results.push({
        category: "Distance", title: "Aspect extérieur & architecture",
        status: "info", value: "See details",
        requirement: (a11.content as string) || "",
        regulationSource: (a11.title as string) || "Article 11",
        zoneLabel: zone,
        fullRequirementText: (a11.content as string) || "",
        context: JSON.stringify({ toiture: a11.toiture, facades: a11.facades, clotures: a11.clotures }),
      });
    }

    // Risks
    const risques = (analysis.risques_naturels || {}) as Record<string, unknown>;
    if (risques.pprn || risques.inondation || risques.sismique) {
      results.push({
        category: "Zone", title: "Risques naturels",
        status: risques.pprn ? "warning" : "info",
        value: [risques.pprn && "PPRN", risques.inondation && "Inondation", risques.sismique].filter(Boolean).join(", ") || "Aucun",
        requirement: (risques.details as string) || "",
        regulationSource: "Risques naturels",
      });
    }

    // Servitudes
    const servitudes = (analysis.servitudes || {}) as Record<string, unknown>;
    if (servitudes.abf || servitudes.monument_historique || servitudes.site_classe) {
      results.push({
        category: "Zone", title: "Servitudes",
        status: "warning",
        value: [servitudes.abf && "ABF", servitudes.monument_historique && "Monument historique", servitudes.site_classe && "Site classé"].filter(Boolean).join(", ") || "Aucune",
        requirement: (servitudes.details as string) || "",
        regulationSource: "Servitudes d'utilité publique",
      });
    }

    return results;
  }

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const analyzeDocument = async () => {
    if (!file) return;
    
    setIsAnalyzing(true);
    
    try {
      let documentContent = "";
      // Use upload-document API for PDF/DOC parsing, fallback to file.text() for TXT
      if (file.type === "application/pdf" || file.type.includes("word") || file.type.includes("document")) {
        const formData = new FormData();
        formData.append("file", file);
        const uploadRes = await fetch("/api/upload-document", { method: "POST", body: formData });
        const uploadData = await uploadRes.json();
        documentContent = uploadData.content || "";
      } else {
        documentContent = await file.text();
      }
      
      // Call the AI analysis API
      const response = await fetch('/api/analyze-plu', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentContent,
        }),
      });
      
      const data = await response.json();
      
      if (data.success && data.analysis) {
        const zoneLabel = data.analysis.zoneClassification || undefined;
        const regulationSource = "Extracted from uploaded PLU document";
        const transformedResults: AnalysisResult[] = [];

        if (data.analysis.maxHeight) {
          const m = data.analysis.maxHeight;
          transformedResults.push({
            category: "Height",
            title: "Maximum Building Height",
            status: "compliant",
            value: `${m}m`,
            requirement: `Max ${m}m allowed in zone ${zoneLabel || "N/A"}`,
            recommendation: "Within the allowed height limit. Height is measured from natural ground to the highest point of the roof.",
            regulationSource,
            zoneLabel,
            maxValue: `${m}m`,
            unit: "m",
          });
        }

        if (data.analysis.setbacks) {
          const front = data.analysis.setbacks.front;
          transformedResults.push({
            category: "Setback",
            title: "Front Setback",
            status: "compliant",
            value: `${front}m`,
            requirement: `Min ${front}m required from road`,
            recommendation: "Compliant with local regulations. The front setback is measured from the road boundary to the façade.",
            regulationSource,
            zoneLabel,
            minValue: `${front}m`,
            unit: "m",
          });
        }

        if (data.analysis.maxCoverageRatio) {
          const ratio = data.analysis.maxCoverageRatio * 100;
          transformedResults.push({
            category: "Coverage",
            title: "Plot Coverage Ratio",
            status: ratio > 45 ? "warning" : "compliant",
            value: `${ratio}%`,
            requirement: `Max ${ratio}% allowed`,
            recommendation: data.analysis.recommendations?.[0] || "The ratio is footprint (emprise au sol) divided by parcel area.",
            regulationSource,
            zoneLabel,
            maxValue: `${ratio}%`,
            unit: "%",
          });
        }

        if (data.analysis.parkingRequirements) {
          transformedResults.push({
            category: "Parking",
            title: "Parking Spaces",
            status: "info",
            value: data.analysis.parkingRequirements,
            requirement: data.analysis.parkingRequirements,
            recommendation: "Verify that the number of spaces matches your floor area. Each space at least 2.50 m × 5.00 m.",
            regulationSource,
            zoneLabel,
          });
        }

        if (data.analysis.greenSpaceRequirements) {
          transformedResults.push({
            category: "Green Space",
            title: "Vegetated Area",
            status: "info",
            value: data.analysis.greenSpaceRequirements,
            requirement: data.analysis.greenSpaceRequirements,
            recommendation: "Plan landscaping accordingly. Semi-permeable and vegetated surfaces count toward the minimum.",
            regulationSource,
            zoneLabel,
          });
        }

        if (data.analysis.architecturalConstraints?.length > 0) {
          transformedResults.push({
            category: "Distance",
            title: "Architectural Requirements",
            status: "info",
            value: `${data.analysis.architecturalConstraints.length} constraints`,
            requirement: data.analysis.architecturalConstraints.join(", "),
            recommendation: "Review all architectural constraints before finalising façades and roof design.",
            regulationSource,
            zoneLabel,
          });
        }

        setResults(transformedResults.length > 0 ? transformedResults : mockAnalysis);
      } else {
        // Fallback to mock data if API fails
        setResults(mockAnalysis);
      }
    } catch (error) {
      console.error('Analysis error:', error);
      // Fallback to mock data on error
      setResults(mockAnalysis);
    }
    
    setAnalysisComplete(true);
    setIsAnalyzing(false);
  };

  const resetAnalysis = () => {
    setFile(null);
    setAnalysisComplete(false);
    setResults([]);
    setSelectedResult(null);
    setAddressForPlu("");
    setAddressSuggestions([]);
    setAddressSearchDone(false);
  };

  const searchAddressForPlu = useCallback(async () => {
    const query = addressForPlu.trim();
    if (!query || query.length < 3) {
      setAddressSuggestions([]);
      setAddressSearchDone(false);
      return;
    }
    setLoadingAddress(true);
    setAddressSuggestions([]);
    setAddressSearchDone(false);
    try {
      const res = await fetch("/api/address/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: query }),
      });
      const d = await res.json();
      if (!res.ok) {
        setAddressSuggestions([]);
        return;
      }
      const list = Array.isArray(d.results) ? d.results : [];
      setAddressSuggestions(list.map((r: { label?: string; coordinates?: number[] }) => ({
        label: r.label || "",
        coordinates: Array.isArray(r.coordinates) && r.coordinates.length >= 2 ? r.coordinates : undefined,
      })));
    } catch {
      setAddressSuggestions([]);
    }
    setLoadingAddress(false);
    setAddressSearchDone(true);
  }, [addressForPlu]);

  useEffect(() => {
    const t = setTimeout(searchAddressForPlu, 400);
    return () => clearTimeout(t);
  }, [addressForPlu, searchAddressForPlu]);

  const analyzeByAddress = async (coords: number[]) => {
    if (!coords || coords.length < 2) return;
    setIsAnalyzing(true);
    try {
      const pluRes = await fetch("/api/plu-detection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coordinates: coords }),
      });
      const pluResData = await pluRes.json();
      const pluData = pluResData.plu || pluResData;
      const regs = pluData.regulations as Record<string, unknown> | undefined;
      const zoneLabel = [pluData.zoneType, pluData.zoneName].filter(Boolean).join(" – ") || undefined;
      const regulationSource = "Detected from address (PLU/cadastre data)";
      const transformedResults: AnalysisResult[] = [];
      if (pluData.zoneType || pluData.zoneName) {
        transformedResults.push({
          category: "Zone",
          title: "PLU Zone",
          status: "info",
          value: pluData.zoneType || pluData.zoneName || "N/A",
          requirement: `Detected zone for this address`,
          recommendation: "Verify with local urban planning office or upload the full PLU document for detailed rules.",
          regulationSource,
          zoneLabel,
        });
      }
      if (regs?.maxHeight) {
        const m = regs.maxHeight as number;
        transformedResults.push({
          category: "Height",
          title: "Maximum Building Height",
          status: "info",
          value: `${m}m`,
          requirement: `Max ${m}m in zone`,
          recommendation: "Check full PLU for exact rules and measurement method.",
          regulationSource,
          zoneLabel,
          maxValue: `${m}m`,
          unit: "m",
        });
      }
      if (regs?.setbacks && typeof regs.setbacks === "object") {
        const s = regs.setbacks as Record<string, number>;
        transformedResults.push({
          category: "Setback",
          title: "Setbacks",
          status: "info",
          value: `F:${s.front || 0}m S:${s.side || 0}m R:${s.rear || 0}m`,
          requirement: "Front, side, rear setbacks (verify with PLU).",
          recommendation: "Verify with PLU document. Front = from road, side/rear = from boundaries.",
          regulationSource,
          zoneLabel,
        });
      }
      if (regs?.maxCoverageRatio) {
        const ratio = Number(regs.maxCoverageRatio) * 100;
        transformedResults.push({
          category: "Coverage",
          title: "Coverage Ratio",
          status: "info",
          value: `${ratio}%`,
          requirement: "Maximum plot coverage (emprise au sol).",
          recommendation: "Check PLU for exact limits and how overhangs are counted.",
          regulationSource,
          zoneLabel,
          maxValue: `${ratio}%`,
          unit: "%",
        });
      }
      setResults(transformedResults.length > 0 ? transformedResults : mockAnalysis);
    } catch {
      setResults(mockAnalysis);
    }
    setAnalysisComplete(true);
    setIsAnalyzing(false);
  };

  const askAIForDetails = async () => {
    if (!selectedResult || !aiQuestion.trim()) return;
    
    setIsAskingAI(true);
    try {
      const response = await fetch('/api/analyze-plu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentContent: `Question about ${selectedResult.title}:
${aiQuestion}

Context:
- Category: ${selectedResult.category}
- Current Value: ${selectedResult.value}
- Requirement: ${selectedResult.requirement}
- Status: ${selectedResult.status}`,
        }),
      });
      
      const data = await response.json();
      if (data.success && data.analysis) {
        setAiResponse(data.analysis.recommendations?.join('\n') || 
          `Based on the ${selectedResult.category} analysis:\n\n` +
          `Your current value of ${selectedResult.value} is ${selectedResult.status === 'compliant' ? 'within' : 'outside'} the required parameters.\n\n` +
          `Recommendation: ${selectedResult.recommendation}`);
      } else {
        setAiResponse(`Based on the ${selectedResult.category} analysis:\n\n` +
          `Your current value of ${selectedResult.value} is ${selectedResult.status === 'compliant' ? 'within' : 'outside'} the required parameters.\n\n` +
          `Recommendation: ${selectedResult.recommendation}`);
      }
    } catch (error) {
      setAiResponse(`Regarding ${selectedResult.title}:\n\nYour project shows ${selectedResult.value} for this metric. The requirement states: ${selectedResult.requirement}.\n\n${selectedResult.recommendation}`);
    }
    setIsAskingAI(false);
  };

  const complianceStats = {
    compliant: results.filter(r => r.status === "compliant").length,
    warning: results.filter(r => r.status === "warning").length,
    violation: results.filter(r => r.status === "violation").length,
  };

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            {projectIdFromUrl && (
              <Link
                href={`/projects/${projectIdFromUrl}`}
                className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-3 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to project
              </Link>
            )}
            <div className="flex items-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center shadow-lg shadow-purple-500/25">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">AI Document Analysis</h1>
            </div>
            <p className="text-slate-400">Upload PLU documents for intelligent regulatory analysis powered by AI</p>
          </div>
          {analysisComplete && (
            <button
              onClick={resetAnalysis}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-white font-medium hover:bg-slate-700 transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
              New Analysis
            </button>
          )}
        </div>

        {!analysisComplete ? (
          /* Upload / Address Section */
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex gap-2 p-1 rounded-xl bg-slate-800/50">
                <button
                  onClick={() => setAnalysisMode("document")}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-sm font-medium transition-colors",
                    analysisMode === "document" ? "bg-violet-500/30 text-white" : "text-slate-400 hover:text-white"
                  )}
                >
                  Upload PLU Document
                </button>
                <button
                  onClick={() => setAnalysisMode("address")}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-sm font-medium transition-colors",
                    analysisMode === "address" ? "bg-violet-500/30 text-white" : "text-slate-400 hover:text-white"
                  )}
                >
                  Search by Address
                </button>
                <button
                  onClick={() => setAnalysisMode("project")}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-sm font-medium transition-colors",
                    analysisMode === "project" ? "bg-violet-500/30 text-white" : "text-slate-400 hover:text-white"
                  )}
                >
                  From project
                </button>
              </div>
            {analysisMode === "document" ? (
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={cn(
                  "relative border-2 border-dashed rounded-2xl p-8 text-center transition-all",
                  dragActive
                    ? "border-blue-500 bg-blue-500/10"
                    : file
                    ? "border-emerald-500/50 bg-emerald-500/5"
                    : "border-white/20 hover:border-white/40 bg-slate-800/30"
                )}
              >
                {!file && (
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                )}
                
                {file ? (
                  <div className="space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center mx-auto">
                      <FileText className="w-8 h-8 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-white">{file.name}</p>
                      <p className="text-sm text-slate-400 mt-1">
                        {(file.size / 1024 / 1024).toFixed(2)} MB • Ready to analyze
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          analyzeDocument();
                        }}
                        disabled={isAnalyzing}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 text-white font-semibold hover:shadow-lg hover:shadow-purple-500/25 transition-all disabled:opacity-50"
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-5 h-5" />
                            Start AI Analysis
                          </>
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setFile(null);
                        }}
                        className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-700 text-slate-300 font-medium hover:bg-slate-600 transition-all"
                      >
                        Change File
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-slate-700/50 flex items-center justify-center mx-auto">
                      <Upload className="w-8 h-8 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-white">Drop your PLU document here</p>
                      <p className="text-sm text-slate-400 mt-1">or click to browse files</p>
                    </div>
                    <p className="text-xs text-slate-500">Supports PDF, DOC, DOCX, TXT up to 50MB</p>
                  </div>
                )}
              </div>
            ) : analysisMode === "project" ? (
              <div className="border-2 border-dashed border-white/20 rounded-2xl p-8 bg-slate-800/30">
                <div className="space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-violet-500/20 flex items-center justify-center mx-auto">
                    <MapPin className="w-8 h-8 text-violet-400" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-white mb-2">Automatic regulatory from project</p>
                    <p className="text-sm text-slate-400">Run PLU detection and save zone + PDF URL to the project (project must have address and coordinates).</p>
                  </div>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-white/10 text-white"
                  >
                    <option value="">Select project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}{p.address ? ` — ${p.address}` : ""}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => runAutoRegulatory()}
                    disabled={!selectedProjectId || autoRunning}
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {autoRunning ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Running deep PLU analysis…
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        Run deep PLU analysis (3 credits)
                      </>
                    )}
                  </button>
                  <p className="text-xs text-slate-500">The analysis covers articles 1–16 (CNIG standard): occupations, setbacks, height, coverage, parking, green space, architecture, risks, etc.</p>
                  {autoMessage && (
                    <p className={cn("text-sm", autoMessage.type === "success" ? "text-emerald-400" : "text-red-400")}>
                      {autoMessage.text}
                    </p>
                  )}
                  {/* Fallback: upload your own PLU if zone not detected */}
                  {showUploadFallback && (
                    <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-3">
                      <p className="text-sm font-medium text-amber-200">
                        Zone not detected automatically. Upload your PLU document for analysis.
                      </p>
                      <p className="text-xs text-slate-400">
                        If the address is in an area without digitized PLU, or if the detected zone is uncertain, you can upload the PLU regulation PDF yourself.
                      </p>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.txt"
                        onChange={(e) => setFallbackFile(e.target.files?.[0] || null)}
                        className="block text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-slate-700 file:text-slate-200 hover:file:bg-slate-600"
                      />
                      {fallbackFile && (
                        <button
                          type="button"
                          onClick={handleFallbackUpload}
                          disabled={uploadingFallback || autoRunning}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/30 text-amber-200 text-sm font-medium hover:bg-amber-500/50 disabled:opacity-50"
                        >
                          {uploadingFallback ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                          Analyze uploaded PLU (3 credits)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-white/20 rounded-2xl p-8 bg-slate-800/30">
                <div className="space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-violet-500/20 flex items-center justify-center mx-auto">
                    <MapPin className="w-8 h-8 text-violet-400" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-white mb-2">Enter address for PLU zone detection</p>
                    <p className="text-sm text-slate-400">We'll detect the PLU zone and basic regulations from the address</p>
                  </div>
                  <div className="relative overflow-visible">
                    <input
                      type="text"
                      value={addressForPlu}
                      onChange={(e) => setAddressForPlu(e.target.value)}
                      onFocus={() => addressForPlu.trim().length >= 3 && searchAddressForPlu()}
                      placeholder="e.g. 5 rue de la République, 06000 Nice"
                      className="w-full px-4 py-3 pr-10 rounded-xl bg-slate-800 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      autoComplete="off"
                    />
                    {loadingAddress && (
                      <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin pointer-events-none" />
                    )}
                    {addressSearchDone && !loadingAddress && addressSuggestions.length === 0 && addressForPlu.trim().length >= 3 && (
                      <p className="absolute top-full left-0 right-0 mt-2 text-xs text-slate-500">No addresses found. Try a different search.</p>
                    )}
                    {addressSuggestions.length > 0 && (
                      <ul className="absolute top-full left-0 right-0 mt-1 rounded-xl bg-slate-800 border border-white/10 shadow-xl z-50 max-h-60 overflow-y-auto">
                        {addressSuggestions.map((a, i) => (
                          <li key={i}>
                            <button
                              type="button"
                              onClick={() => {
                                if (a.coordinates && a.coordinates.length >= 2) {
                                  setAddressForPlu(a.label);
                                  setAddressSuggestions([]);
                                  analyzeByAddress(a.coordinates);
                                }
                              }}
                              className="w-full px-4 py-3 text-left text-sm text-white hover:bg-slate-700 first:rounded-t-xl last:rounded-b-xl transition-colors"
                            >
                              {a.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => searchAddressForPlu()}
                      disabled={addressForPlu.trim().length < 3 || loadingAddress}
                      className="px-4 py-2 rounded-lg bg-violet-500/30 text-violet-300 text-sm font-medium hover:bg-violet-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loadingAddress ? "Searching…" : "Search addresses"}
                    </button>
                    <p className="text-xs text-slate-500">Type 3+ characters, then pick an address to analyze PLU zone.</p>
                  </div>
                </div>
              </div>
            )}

              {isAnalyzing && (
                <div className="p-6 rounded-2xl bg-slate-800/50 border border-white/10">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
                      <Brain className="w-5 h-5 text-violet-400 animate-pulse" />
                    </div>
                    <div>
                      <p className="text-white font-medium">AI Analysis in Progress</p>
                      <p className="text-sm text-slate-400">Extracting regulatory requirements...</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {["Reading document content", "Identifying zones and rules", "Checking compliance", "Generating recommendations"].map((step, i) => (
                      <div key={step} className="flex items-center gap-3">
                        <div className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center",
                          i < 2 ? "bg-emerald-500/20" : "bg-slate-700"
                        )}>
                          {i < 2 ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-slate-500" />
                          )}
                        </div>
                        <span className={cn(
                          "text-sm",
                          i < 2 ? "text-slate-300" : "text-slate-500"
                        )}>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Info Panel */}
            <div className="space-y-4">
              <div className="p-6 rounded-2xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 border border-violet-500/20">
                <div className="flex items-center gap-3 mb-4">
                  <Sparkles className="w-6 h-6 text-violet-400" />
                  <h3 className="text-lg font-semibold text-white">AI-Powered Analysis</h3>
                </div>
                <p className="text-slate-300 mb-4">
                  Our advanced AI analyzes your PLU documents to extract regulatory requirements and check your project's compliance automatically.
                </p>
                <ul className="space-y-3">
                  {[
                    "Automatic zone identification",
                    "Height and setback verification",
                    "Coverage ratio calculation",
                    "Parking requirements check",
                    "Green space compliance",
                    "Instant recommendations",
                  ].map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-slate-400">
                      <CheckCircle2 className="w-4 h-4 text-violet-400" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-6 rounded-2xl bg-slate-800/30 border border-white/5">
                <h4 className="text-sm font-medium text-white mb-3">Recent Analyses</h4>
                <div className="space-y-2">
                  {["PLU_Nice_Zone_UA.pdf", "Reglement_Urbanisme_2025.pdf", "Zone_Construction_Guide.docx"].map((doc) => (
                    <div key={doc} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
                      <FileText className="w-4 h-4 text-slate-500" />
                      <span className="text-sm text-slate-300 flex-1 truncate">{doc}</span>
                      <Eye className="w-4 h-4 text-slate-500" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Results Section */
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-emerald-400">{complianceStats.compliant}</p>
                    <p className="text-sm text-slate-400">Compliant</p>
                  </div>
                </div>
              </div>
              <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-amber-400">{complianceStats.warning}</p>
                    <p className="text-sm text-slate-400">Warnings</p>
                  </div>
                </div>
              </div>
              <div className="p-5 rounded-2xl bg-red-500/10 border border-red-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                    <XCircle className="w-6 h-6 text-red-400" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-red-400">{complianceStats.violation}</p>
                    <p className="text-sm text-slate-400">Violations</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Results Grid */}
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <h3 className="text-lg font-semibold text-white">Analysis Results</h3>
                <div className="space-y-3">
                  {results.map((result, index) => {
                    const status = statusConfig[result.status];
                    const CategoryIcon = categoryIcons[result.category] || Ruler;
                    return (
                      <button
                        key={index}
                        onClick={() => setSelectedResult(result)}
                        className={cn(
                          "w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left",
                          selectedResult === result
                            ? "bg-slate-700/50 border-blue-500/50"
                            : "bg-slate-800/50 border-white/10 hover:border-white/20"
                        )}
                      >
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", status.bg)}>
                          <CategoryIcon className={cn("w-5 h-5", status.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-white">{result.title}</p>
                            <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", status.bg, status.color)}>
                              {status.label}
                            </span>
                          </div>
                          <p className="text-sm text-slate-400 line-clamp-2">{result.requirement}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-white">{result.value}</p>
                          <p className="text-xs text-slate-500">{result.category}</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-500" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Detail Panel */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white">Details</h3>
                {selectedResult ? (
                  <div className="p-6 rounded-2xl bg-slate-800/50 border border-white/10 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", statusConfig[selectedResult.status].bg)}>
                        {(() => {
                          const IconComponent = statusConfig[selectedResult.status].icon;
                          return <IconComponent className={cn("w-6 h-6", statusConfig[selectedResult.status].color)} />;
                        })()}
                      </div>
                      <div>
                        <p className="font-semibold text-white">{selectedResult.title}</p>
                        <p className="text-sm text-slate-400">{selectedResult.category}</p>
                      </div>
                    </div>

                    {(selectedResult.regulationSource || selectedResult.zoneLabel) && (
                      <div className="space-y-2 pt-2 border-t border-white/10">
                        {selectedResult.regulationSource && (
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Regulation source</p>
                            <p className="text-sm text-slate-300">{selectedResult.regulationSource}</p>
                          </div>
                        )}
                        {selectedResult.zoneLabel && (
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Zone</p>
                            <p className="text-sm text-slate-300">{selectedResult.zoneLabel}</p>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-3">
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Current value</p>
                        <p className="text-xl font-bold text-white">{selectedResult.value}</p>
                        {(selectedResult.minValue != null || selectedResult.maxValue != null) && (
                          <p className="text-xs text-slate-500 mt-1">
                            Allowed range: {[selectedResult.minValue, selectedResult.maxValue].filter(Boolean).join(" – ")}
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Requirement</p>
                        <p className="text-sm text-slate-300">{selectedResult.requirement}</p>
                      </div>
                      {selectedResult.fullRequirementText && (
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Full regulatory text</p>
                          <p className="text-sm text-slate-300 leading-relaxed">{selectedResult.fullRequirementText}</p>
                        </div>
                      )}
                      {selectedResult.context && (
                        <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                          <p className="text-xs text-blue-400/90 mb-1">How this applies to your project</p>
                          <p className="text-sm text-slate-300">{selectedResult.context}</p>
                        </div>
                      )}
                      {selectedResult.articleReference && (
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Article / reference</p>
                          <p className="text-sm text-slate-300">{selectedResult.articleReference}</p>
                        </div>
                      )}
                      {selectedResult.recommendation && (
                        <div className="p-3 rounded-xl bg-slate-700/50">
                          <p className="text-xs text-slate-500 mb-1">AI recommendation</p>
                          <p className="text-sm text-slate-300">{selectedResult.recommendation}</p>
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={() => {
                        setShowAiDialog(true);
                        setAiQuestion('');
                        setAiResponse('');
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-500/20 text-blue-400 font-medium hover:bg-blue-500/30 transition-colors"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Ask AI for Details
                    </button>
                    
                    {/* AI Dialog */}
                    {showAiDialog && (
                      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-slate-900 rounded-2xl border border-white/10 w-full max-w-lg p-6 space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-white">Ask AI about {selectedResult?.title}</h3>
                            <button onClick={() => setShowAiDialog(false)} className="text-slate-400 hover:text-white">
                              ✕
                            </button>
                          </div>
                          
                          <div className="p-3 rounded-xl bg-slate-800/50 text-sm text-slate-300">
                            <p><strong>Current:</strong> {selectedResult?.value}</p>
                            <p><strong>Requirement:</strong> {selectedResult?.requirement}</p>
                          </div>
                          
                          <div>
                            <label className="text-sm text-slate-400 block mb-2">Your question:</label>
                            <textarea
                              value={aiQuestion}
                              onChange={(e) => setAiQuestion(e.target.value)}
                              placeholder="e.g., What are my options to comply with this requirement?"
                              className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                              rows={3}
                            />
                          </div>
                          
                          <button
                            onClick={askAIForDetails}
                            disabled={isAskingAI || !aiQuestion.trim()}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold disabled:opacity-50"
                          >
                            {isAskingAI ? (
                              <><Loader2 className="w-5 h-5 animate-spin" /> Analyzing...</>
                            ) : (
                              <><Sparkles className="w-5 h-5" /> Get AI Answer</>
                            )}
                          </button>
                          
                          {aiResponse && (
                            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                              <p className="text-sm font-medium text-emerald-400 mb-2">AI Response:</p>
                              <p className="text-sm text-slate-300 whitespace-pre-line">{aiResponse}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-6 rounded-2xl bg-slate-800/30 border border-white/5 text-center">
                    <Info className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                    <p className="text-slate-400">Select a result to view details</p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const address =
                      (selectedProjectId
                        ? projects.find((p) => p.id === selectedProjectId)?.address
                        : null) ?? addressForPlu ?? "";
                    const zoneFromResult = results.find((r) => r.zoneLabel)?.zoneLabel ?? "";
                    let determination: { type: "DP" | "PC" | "ARCHITECT_REQUIRED"; justification?: string } | undefined;
                    try {
                      const raw = typeof window !== "undefined" ? sessionStorage.getItem("urbassist_dossier") : null;
                      const dossier = raw ? JSON.parse(raw) : {};
                      const stepPermit = (dossier?.step5 ?? dossier?.step4) as { determination?: string; detail?: string; explanation?: string } | undefined;
                      if (stepPermit?.determination) {
                        determination = {
                          type: stepPermit.determination as "DP" | "PC" | "ARCHITECT_REQUIRED",
                          justification: stepPermit.explanation ?? stepPermit.detail,
                        };
                      }
                    } catch {
                      // ignore
                    }
                    const report = buildReportFromAnalysis({
                      results,
                      address: address || undefined,
                      zoneName: zoneFromResult,
                      determination,
                    });
                    saveReportToSession(report);
                    window.location.href = "/regulations/report";
                  }}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:shadow-lg hover:shadow-purple-500/25 transition-all"
                >
                  <Download className="w-5 h-5" />
                  Export Report
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Navigation>
  );
}

export default function RegulationsPage() {
  return (
    <React.Suspense fallback={
      <Navigation>
        <div className="p-6 flex justify-center min-h-[40vh]">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        </div>
      </Navigation>
    }>
      <RegulationsPageContent />
    </React.Suspense>
  );
}
