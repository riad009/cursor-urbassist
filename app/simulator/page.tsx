"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
    Home,
    Plus,
    Trash2,
    Info,
    CheckCircle2,
    AlertTriangle,
    FileText,
    Building2,
    Hammer,
    Droplets,
    Fence,
    RefreshCw,
} from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import Navigation from "@/components/layout/Navigation";
import {
    calculateDpPc,
    type DpPcInput,
    type DpPcResult,
    type ProjectTypeChoice,
} from "@/lib/dp-pc-calculator";

// ─── Types ──────────────────────────────────────────────────────────────────

type SimProjectType =
    | "change_of_use"
    | "extension"
    | "new_construction"
    | "swimming_pool"
    | "fence_gate";

interface SimProject {
    id: string;
    type: SimProjectType;
    floorArea: number;
    footprint: number;
}

interface ProjectAnalysis {
    project: SimProject;
    result: DpPcResult;
    totalAfterWork: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PROJECT_TYPE_OPTIONS: {
    value: SimProjectType;
    labelFr: string;
    labelEn: string;
    icon: React.ReactNode;
}[] = [
        {
            value: "change_of_use",
            labelFr: "Changement de destination / Rénovation",
            labelEn: "Change of Use / Renovation",
            icon: <RefreshCw className="w-5 h-5" />,
        },
        {
            value: "extension",
            labelFr: "Extension",
            labelEn: "Extension",
            icon: <Hammer className="w-5 h-5" />,
        },
        {
            value: "new_construction",
            labelFr: "Construction Indépendante",
            labelEn: "New Independent Construction",
            icon: <Building2 className="w-5 h-5" />,
        },
        {
            value: "swimming_pool",
            labelFr: "Piscine",
            labelEn: "Swimming Pool",
            icon: <Droplets className="w-5 h-5" />,
        },
        {
            value: "fence_gate",
            labelFr: "Clôture / Portail",
            labelEn: "Fence / Gate",
            icon: <Fence className="w-5 h-5" />,
        },
    ];

function getProjectLabel(type: SimProjectType, isEn: boolean): string {
    const opt = PROJECT_TYPE_OPTIONS.find((o) => o.value === type);
    return opt ? (isEn ? opt.labelEn : opt.labelFr) : type;
}

function getProjectIcon(type: SimProjectType): React.ReactNode {
    const opt = PROJECT_TYPE_OPTIONS.find((o) => o.value === type);
    return opt?.icon ?? <Building2 className="w-5 h-5" />;
}

function mapToCalculatorType(type: SimProjectType): {
    projectType: ProjectTypeChoice;
    changeOfUseOrFacade?: boolean;
} {
    switch (type) {
        case "change_of_use":
            return { projectType: "existing_extension", changeOfUseOrFacade: true };
        case "extension":
            return { projectType: "existing_extension" };
        case "new_construction":
            return { projectType: "new_construction" };
        case "swimming_pool":
            return { projectType: "swimming_pool" };
        case "fence_gate":
            return { projectType: "outdoor_fence" };
    }
}

// ─── Toggle Switch ──────────────────────────────────────────────────────────

function ToggleSwitch({
    checked,
    onChange,
    label,
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
}) {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className="flex items-center gap-3 group"
        >
            <div
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${checked ? "bg-indigo-500" : "bg-slate-300"
                    }`}
            >
                <div
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? "translate-x-5" : "translate-x-0"
                        }`}
                />
            </div>
            <span className="text-sm font-medium text-slate-700">{label}</span>
        </button>
    );
}

// ─── Authorization Badge ────────────────────────────────────────────────────

function AuthBadge({
    determination,
    isEn,
}: {
    determination: string;
    isEn: boolean;
}) {
    const config: Record<
        string,
        { bg: string; text: string; labelFr: string; labelEn: string }
    > = {
        NONE: {
            bg: "bg-emerald-500",
            text: "text-white",
            labelFr: "AUCUNE AUTORISATION",
            labelEn: "NO AUTHORIZATION",
        },
        DP: {
            bg: "bg-blue-500",
            text: "text-white",
            labelFr: "DÉCLARATION PRÉALABLE",
            labelEn: "PRELIMINARY DECLARATION",
        },
        PC: {
            bg: "bg-purple-600",
            text: "text-white",
            labelFr: "PERMIS DE CONSTRUIRE",
            labelEn: "BUILDING PERMIT",
        },
        ARCHITECT_REQUIRED: {
            bg: "bg-amber-500",
            text: "text-white",
            labelFr: "ARCHITECTE OBLIGATOIRE",
            labelEn: "ARCHITECT REQUIRED",
        },
        REVIEW: {
            bg: "bg-slate-500",
            text: "text-white",
            labelFr: "VÉRIFICATION REQUISE",
            labelEn: "REVIEW REQUIRED",
        },
    };

    const c = config[determination] || config.REVIEW;

    return (
        <span
            className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${c.bg} ${c.text}`}
        >
            {isEn ? c.labelEn : c.labelFr}
        </span>
    );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function SimulatorPage() {
    const { locale } = useLanguage();
    const isEn = locale === "en";

    // ── Field context ──
    const [existingFloorArea, setExistingFloorArea] = useState<number>(100);
    const [isUrbanZone, setIsUrbanZone] = useState(true);

    // ── Work file (list of projects) ──
    const [projects, setProjects] = useState<SimProject[]>([]);

    // ── Add project form ──
    const [formType, setFormType] = useState<SimProjectType>("new_construction");
    const [formFloorArea, setFormFloorArea] = useState<string>("");
    const [formFootprint, setFormFootprint] = useState<string>("");

    // ── Add project ──
    const addProject = useCallback(() => {
        const floorArea = parseFloat(formFloorArea) || 0;
        const footprint = parseFloat(formFootprint) || 0;
        if (floorArea <= 0 && footprint <= 0 && formType !== "fence_gate") return;

        const newProject: SimProject = {
            id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: formType,
            floorArea: floorArea,
            footprint: footprint,
        };

        setProjects((prev) => [...prev, newProject]);
        setFormFloorArea("");
        setFormFootprint("");
    }, [formType, formFloorArea, formFootprint]);

    // ── Remove project ──
    const removeProject = useCallback((id: string) => {
        setProjects((prev) => prev.filter((p) => p.id !== id));
    }, []);

    // ── Compute analysis for each project ──
    const analyses: ProjectAnalysis[] = useMemo(() => {
        // For extensions/change of use, cumulative floor area matters
        let cumulativeExtension = 0;

        return projects.map((project) => {
            const mapping = mapToCalculatorType(project.type);

            const isExtensionType =
                project.type === "change_of_use" || project.type === "extension";

            if (isExtensionType) {
                cumulativeExtension += project.floorArea;
            }

            const totalAfterWork = isExtensionType
                ? existingFloorArea + cumulativeExtension
                : existingFloorArea;

            const input: DpPcInput = {
                projectType: mapping.projectType,
                floorAreaCreated: project.floorArea,
                footprintCreated: project.footprint > 0 ? project.footprint : undefined,
                existingFloorArea: isExtensionType ? existingFloorArea : undefined,
                changeOfUseOrFacade: mapping.changeOfUseOrFacade,
                inUrbanZone: isUrbanZone,
            };

            const result = calculateDpPc(input);

            return { project, result, totalAfterWork };
        });
    }, [projects, existingFloorArea, isUrbanZone]);

    // ── Overall summary ──
    const totalProjectedArea = useMemo(() => {
        const extensionAreas = projects
            .filter((p) => p.type === "change_of_use" || p.type === "extension")
            .reduce((sum, p) => sum + p.floorArea, 0);
        return existingFloorArea + extensionAreas;
    }, [projects, existingFloorArea]);

    const architectRequired = useMemo(() => {
        return totalProjectedArea > 150;
    }, [totalProjectedArea]);

    // ─── Render ────────────────────────────────────────────────────────

    return (
        <Navigation>
            <div className="min-h-screen bg-slate-50">
                {/* Header */}
                <div className="bg-white border-b border-slate-200 px-6 py-4">
                    <div className="max-w-7xl mx-auto flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                                <Building2 className="w-5 h-5 text-white" />
                            </div>
                            <h1 className="text-lg font-bold text-slate-900">
                                {isEn ? "Urban Planning Simulator" : "Simulateur d'Urbanisme"}
                            </h1>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-500 px-2 py-1 rounded-md bg-slate-100 border border-slate-200">
                                V1.0 • France
                            </span>
                        </div>
                    </div>
                </div>

                {/* Main content — two-panel layout */}
                <div className="max-w-7xl mx-auto px-4 lg:px-6 py-6">
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                        {/* ═══ LEFT PANEL ═══ */}
                        <div className="lg:col-span-3 space-y-6">
                            {/* ── Field Context ── */}
                            <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
                                <div className="flex items-center gap-2 mb-4">
                                    <Home className="w-5 h-5 text-slate-600" />
                                    <h2 className="text-base font-semibold text-slate-900">
                                        {isEn ? "Field context" : "Contexte du terrain"}
                                    </h2>
                                </div>

                                <div className="flex flex-col sm:flex-row sm:items-end gap-6">
                                    {/* Existing floor area */}
                                    <div className="flex-1 space-y-1.5">
                                        <label className="text-sm text-slate-600">
                                            {isEn
                                                ? "Existing floor area (m²)"
                                                : "Surface de plancher existante (m²)"}
                                        </label>
                                        <input
                                            type="number"
                                            value={existingFloorArea || ""}
                                            onChange={(e) =>
                                                setExistingFloorArea(Number(e.target.value) || 0)
                                            }
                                            className="w-full px-4 py-2.5 rounded-xl bg-white border-2 border-slate-200 text-slate-900 text-base font-semibold focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all outline-none"
                                            placeholder="100"
                                            min={0}
                                        />
                                    </div>

                                    {/* PLU toggle */}
                                    <div className="flex items-center">
                                        <ToggleSwitch
                                            checked={isUrbanZone}
                                            onChange={setIsUrbanZone}
                                            label={isEn ? "Urban Zone (PLU)" : "Zone Urbaine (PLU)"}
                                        />
                                    </div>
                                </div>

                                {/* PLU info */}
                                {isUrbanZone && (
                                    <div className="mt-4 flex items-start gap-2 px-4 py-3 rounded-xl bg-blue-50 border border-blue-100">
                                        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                                        <p className="text-xs text-blue-700">
                                            {isEn
                                                ? "The urban zone allows for an extension threshold of up to 40m² (subject to conditions). Check your Local Urban Development Plan (PLU)."
                                                : "La zone urbaine autorise un seuil d'extension jusqu'à 40m² (sous conditions). Vérifiez votre Plan Local d'Urbanisme (PLU)."}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* ── Work File ── */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h2 className="text-base font-semibold text-slate-900">
                                        {isEn ? "Work file" : "Dossier de travail"}
                                    </h2>
                                    <span className="text-sm text-slate-400">
                                        {projects.length}{" "}
                                        {isEn ? "project(s)" : "projet(s)"}
                                    </span>
                                </div>

                                {projects.length === 0 ? (
                                    <div className="rounded-2xl bg-white border border-dashed border-slate-300 p-8 text-center">
                                        <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                        <p className="text-sm text-slate-400">
                                            {isEn
                                                ? "No projects added yet. Use the form below to add one."
                                                : "Aucun projet ajouté. Utilisez le formulaire ci-dessous."}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {projects.map((project, idx) => (
                                            <div
                                                key={project.id}
                                                className="group rounded-xl bg-white border border-slate-200 px-4 py-3 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow animate-slide-up"
                                                style={{ animationDelay: `${idx * 50}ms` }}
                                            >
                                                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500 shrink-0">
                                                    {getProjectIcon(project.type)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-slate-900 truncate">
                                                        {getProjectLabel(project.type, isEn)}
                                                    </p>
                                                    <p className="text-xs text-slate-400">
                                                        {isEn ? "Floor area" : "Surface de plancher"} :{" "}
                                                        {project.floorArea} m²
                                                        {project.footprint > 0 &&
                                                            `   ${isEn ? "Footprint" : "Emprise"} : ${project.footprint} m²`}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => removeProject(project.id)}
                                                    className="p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                                                    title={isEn ? "Remove" : "Supprimer"}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Connecting line */}
                                {projects.length > 0 && (
                                    <div className="flex justify-center py-2">
                                        <div className="w-px h-6 bg-slate-200" />
                                    </div>
                                )}
                            </div>

                            {/* ── Add a Project Form ── */}
                            <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
                                <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2 mb-4">
                                    <Plus className="w-5 h-5 text-indigo-500" />
                                    {isEn ? "Add a project" : "Ajouter un projet"}
                                </h3>

                                {/* Project type */}
                                <div className="space-y-1.5 mb-4">
                                    <label className="text-sm text-slate-600 font-medium">
                                        {isEn ? "Project type" : "Type de projet"}
                                    </label>
                                    <select
                                        value={formType}
                                        onChange={(e) =>
                                            setFormType(e.target.value as SimProjectType)
                                        }
                                        className="w-full px-4 py-2.5 rounded-xl bg-white border-2 border-slate-200 text-slate-900 text-sm font-medium focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all outline-none appearance-none cursor-pointer"
                                    >
                                        {PROJECT_TYPE_OPTIONS.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                                {isEn ? opt.labelEn : opt.labelFr}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Area inputs — only show for types that need them */}
                                {formType !== "fence_gate" && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                                        <div className="space-y-1.5">
                                            <label className="text-sm text-slate-600">
                                                {isEn
                                                    ? "Floor area created (m²)"
                                                    : "Surface de plancher créée (m²)"}
                                            </label>
                                            <input
                                                type="number"
                                                value={formFloorArea}
                                                onChange={(e) => setFormFloorArea(e.target.value)}
                                                className="w-full px-4 py-2.5 rounded-xl bg-white border-2 border-slate-200 text-slate-900 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all outline-none"
                                                placeholder={isEn ? "Example: 25" : "Exemple : 25"}
                                                min={0}
                                            />
                                            <p className="text-[11px] text-slate-400">
                                                {isEn
                                                    ? "Enclosed and covered, height > 1.80m"
                                                    : "Clos et couvert, hauteur > 1,80m"}
                                            </p>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-sm text-slate-600">
                                                {isEn
                                                    ? "Ground footprint created (m²)"
                                                    : "Emprise au sol créée (m²)"}
                                            </label>
                                            <input
                                                type="number"
                                                value={formFootprint}
                                                onChange={(e) => setFormFootprint(e.target.value)}
                                                className="w-full px-4 py-2.5 rounded-xl bg-white border-2 border-slate-200 text-slate-900 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all outline-none"
                                                placeholder={isEn ? "Example: 0" : "Exemple : 0"}
                                                min={0}
                                            />
                                            <p className="text-[11px] text-slate-400">
                                                {isEn
                                                    ? "Vertical projection of the volume"
                                                    : "Projection verticale du volume"}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={addProject}
                                    disabled={
                                        formType !== "fence_gate" &&
                                        (parseFloat(formFloorArea) || 0) <= 0 &&
                                        (parseFloat(formFootprint) || 0) <= 0
                                    }
                                    className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold text-sm hover:shadow-lg hover:shadow-indigo-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    <Plus className="w-4 h-4" />
                                    {isEn ? "Add to folder" : "Ajouter au dossier"}
                                </button>
                            </div>
                        </div>

                        {/* ═══ RIGHT PANEL — Real-Time Analysis ═══ */}
                        <div className="lg:col-span-2">
                            <div className="lg:sticky lg:top-6">
                                <div className="rounded-2xl bg-gradient-to-b from-slate-800 to-slate-900 text-white p-6 shadow-xl border border-slate-700/50">
                                    {/* Header */}
                                    <div className="flex items-center gap-2 mb-5">
                                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                        <h2 className="text-base font-bold">
                                            {isEn ? "Real-Time Analysis" : "Analyse en Temps Réel"}
                                        </h2>
                                    </div>
                                    <p className="text-xs text-slate-400 -mt-3 mb-5">
                                        {isEn
                                            ? "Automatic update according to regulations"
                                            : "Mise à jour automatique selon la réglementation"}
                                    </p>

                                    {/* Overall Summary */}
                                    <div className="rounded-xl bg-slate-700/50 p-4 mb-5 border border-slate-600/30">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                                            {isEn ? "OVERALL SUMMARY" : "RÉSUMÉ GÉNÉRAL"}
                                        </p>
                                        <div className="flex items-center justify-between mb-4">
                                            <span className="text-sm text-slate-300">
                                                {isEn
                                                    ? "Total Projected Area"
                                                    : "Surface Totale Projetée"}
                                            </span>
                                            <span className="text-2xl font-bold text-white">
                                                {totalProjectedArea.toFixed(1)}{" "}
                                                <span className="text-base font-normal text-slate-400">
                                                    m²
                                                </span>
                                            </span>
                                        </div>

                                        {/* Architect status */}
                                        <div
                                            className={`rounded-lg px-3 py-2.5 flex items-center gap-2 ${architectRequired
                                                    ? "bg-amber-500/20 border border-amber-500/30"
                                                    : "bg-emerald-500/20 border border-emerald-500/30"
                                                }`}
                                        >
                                            {architectRequired ? (
                                                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                                            ) : (
                                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                            )}
                                            <div>
                                                <p
                                                    className={`text-sm font-semibold ${architectRequired
                                                            ? "text-amber-300"
                                                            : "text-emerald-300"
                                                        }`}
                                                >
                                                    {architectRequired
                                                        ? isEn
                                                            ? "Architect required"
                                                            : "Architecte obligatoire"
                                                        : isEn
                                                            ? "No architect required"
                                                            : "Pas d'architecte requis"}
                                                </p>
                                                <p className="text-[11px] text-slate-400">
                                                    {architectRequired
                                                        ? isEn
                                                            ? "Total floor area exceeds 150 m²."
                                                            : "La surface de plancher totale dépasse 150 m²."
                                                        : isEn
                                                            ? "Architect thresholds not reached."
                                                            : "Seuils architecte non atteints."}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Details per project */}
                                    {analyses.length > 0 && (
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                                                {isEn ? "DETAILS PER PROJECT" : "DÉTAILS PAR PROJET"}
                                            </p>
                                            <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                                                {analyses.map(({ project, result, totalAfterWork }) => (
                                                    <div
                                                        key={project.id}
                                                        className="rounded-xl bg-slate-700/40 border border-slate-600/30 p-4 space-y-3 animate-slide-up"
                                                    >
                                                        {/* Title + badge */}
                                                        <div className="flex items-start justify-between gap-2">
                                                            <h4 className="text-sm font-semibold text-white leading-tight">
                                                                {getProjectLabel(project.type, isEn)}
                                                            </h4>
                                                            <AuthBadge
                                                                determination={result.determination}
                                                                isEn={isEn}
                                                            />
                                                        </div>

                                                        {/* Reasoning bullets */}
                                                        <ul className="space-y-1.5">
                                                            {/* Area info */}
                                                            {project.type !== "fence_gate" && (
                                                                <li className="flex items-start gap-2 text-xs text-slate-300">
                                                                    <span className="text-slate-500 mt-0.5">
                                                                        •
                                                                    </span>
                                                                    <span>
                                                                        {project.type === "new_construction"
                                                                            ? isEn
                                                                                ? `Independent construction of ${project.floorArea}m² (floor area) / ${project.footprint}m² (footprint).`
                                                                                : `Construction indépendante de ${project.floorArea}m² (plancher) / ${project.footprint}m² (emprise).`
                                                                            : project.type === "swimming_pool"
                                                                                ? isEn
                                                                                    ? `Pool area: ${project.floorArea}m².`
                                                                                    : `Surface piscine : ${project.floorArea}m².`
                                                                                : isEn
                                                                                    ? `Total extensions/amenities: ${project.floorArea}m² floor area / ${project.footprint}m² footprint.`
                                                                                    : `Total extensions/aménagements : ${project.floorArea}m² plancher / ${project.footprint}m² emprise.`}
                                                                    </span>
                                                                </li>
                                                            )}

                                                            {/* Total after work — for extension types */}
                                                            {(project.type === "change_of_use" ||
                                                                project.type === "extension") && (
                                                                    <li className="flex items-start gap-2 text-xs text-slate-300">
                                                                        <span className="text-slate-500 mt-0.5">
                                                                            •
                                                                        </span>
                                                                        <span>
                                                                            {isEn
                                                                                ? `Total area after work: ${totalAfterWork}m².`
                                                                                : `Surface totale après travaux : ${totalAfterWork}m².`}
                                                                        </span>
                                                                    </li>
                                                                )}

                                                            {/* Zone info */}
                                                            <li className="flex items-start gap-2 text-xs text-slate-300">
                                                                <span className="text-slate-500 mt-0.5">•</span>
                                                                <span>
                                                                    {isUrbanZone
                                                                        ? isEn
                                                                            ? "Urban Zone (PLU)."
                                                                            : "Zone Urbaine (PLU)."
                                                                        : isEn
                                                                            ? "Non-urban zone."
                                                                            : "Zone non urbaine."}
                                                                </span>
                                                            </li>

                                                            {/* Threshold info */}
                                                            <li className="flex items-start gap-2 text-xs text-slate-300">
                                                                <span className="text-slate-500 mt-0.5">•</span>
                                                                <span>
                                                                    {project.type === "new_construction"
                                                                        ? Math.max(
                                                                            project.floorArea,
                                                                            project.footprint
                                                                        ) < 5
                                                                            ? isEn
                                                                                ? "Surface area < 5m²."
                                                                                : "Surface < 5m²."
                                                                            : Math.max(
                                                                                project.floorArea,
                                                                                project.footprint
                                                                            ) <= 20
                                                                                ? isEn
                                                                                    ? "Surface area between 5 and 20m²."
                                                                                    : "Surface entre 5 et 20m²."
                                                                                : isEn
                                                                                    ? "Surface area > 20m²."
                                                                                    : "Surface > 20m²."
                                                                        : project.type === "swimming_pool"
                                                                            ? project.floorArea < 10
                                                                                ? isEn
                                                                                    ? "Pool area < 10m²."
                                                                                    : "Piscine < 10m²."
                                                                                : project.floorArea <= 100
                                                                                    ? isEn
                                                                                        ? "Pool area between 10 and 100m²."
                                                                                        : "Piscine entre 10 et 100m²."
                                                                                    : isEn
                                                                                        ? "Pool area > 100m²."
                                                                                        : "Piscine > 100m²."
                                                                            : project.type === "fence_gate"
                                                                                ? isEn
                                                                                    ? "Treated as a fence/gate (declaration required)."
                                                                                    : "Clôture/portail (déclaration requise)."
                                                                                : isEn
                                                                                    ? `Cumulative extensions ≤ ${isUrbanZone ? 40 : 20}m² (or ≤ ${isUrbanZone ? 20 : 20}m² if the total threshold is exceeded).`
                                                                                    : `Extensions cumulées ≤ ${isUrbanZone ? 40 : 20}m² (ou ≤ 20m² si le seuil total est dépassé).`}
                                                                </span>
                                                            </li>
                                                        </ul>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Empty state */}
                                    {analyses.length === 0 && (
                                        <div className="rounded-xl bg-slate-700/30 border border-dashed border-slate-600 p-6 text-center">
                                            <p className="text-sm text-slate-400">
                                                {isEn
                                                    ? "Add projects to see the analysis"
                                                    : "Ajoutez des projets pour voir l'analyse"}
                                            </p>
                                        </div>
                                    )}

                                    {/* Footer disclaimer */}
                                    <p className="text-[10px] text-slate-500 text-center mt-5 italic">
                                        {isEn
                                            ? "These results are indicative only. Consult your town hall or the local urban development plan (PLU) for final confirmation."
                                            : "Ces résultats sont indicatifs. Consultez votre mairie ou le plan local d'urbanisme (PLU) pour confirmation."}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Navigation>
    );
}
