"use client";

import React, { useState, use, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Navigation from "@/components/layout/Navigation";
import {
    ChevronRight,
    ChevronLeft,
    Plus,
    Trash2,
    Check,
    Loader2,
    FileText,
    Eye,
    Download,
    AlertTriangle,
} from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { cn } from "@/lib/utils";
import {
    calculateDpPc,
    estimateFloorAreaCreated,
    type ProjectTypeChoice,
    type SubmitterType,
} from "@/lib/dp-pc-calculator";

// ─── Types ──────────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3 | 4;

type NatureType = "new_construction" | "existing_extension" | "outdoor";
type LevelCount = 1 | 2 | 3;

interface Job {
    id: string;
    nature: NatureType;
    levels: LevelCount;
    footprint: number;
    floorAreaEstimated: number;
}

// ─── Document list (right panel) ────────────────────────────────────────────

const ADMIN_DOCS = [
    { code: "PC1 / DPC1", label: "Site plan", unlocked: true },
    { code: "PC2 / DPC2", label: "Site plan", unlocked: false },
    { code: "PC3", label: "Cutting Plan", unlocked: false },
    { code: "PC4 / DPC 8-1", label: "Descriptive notice", unlocked: false },
    { code: "PC5 / DPC4", label: "Plan of facades and roofs", unlocked: false },
    { code: "PC6 / DPC6", label: "3D Landscape Insertion", unlocked: false },
];

// ─── Main Component ─────────────────────────────────────────────────────────

export default function ProjectDescriptionPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id: projectId } = use(params);
    const { t } = useLanguage();
    const router = useRouter();
    const isEn = t("auth.next") === "Next";

    const [step, setStep] = useState<WizardStep>(1);
    const [saving, setSaving] = useState(false);

    // Step 1 — Environment
    const [terrainInitial, setTerrainInitial] = useState("");
    const [accessVerts, setAccessVerts] = useState("");

    // Step 2 — Works
    const [jobs, setJobs] = useState<Job[]>([]);
    const [showAddJob, setShowAddJob] = useState(false);
    const [addNature, setAddNature] = useState<NatureType>("new_construction");
    const [addLevels, setAddLevels] = useState<LevelCount>(1);
    const [addFootprint, setAddFootprint] = useState<number>(0);

    // Step 3 — Materials
    const [exteriorMaterials, setExteriorMaterials] = useState("");
    const [roofType, setRoofType] = useState<"flat" | "dual_pitch" | "single_pitch" | "">("");

    // Step 4 — Applicant
    const [submitter, setSubmitter] = useState<SubmitterType | null>(null);

    // Project data
    const [projectName, setProjectName] = useState<string>("");
    useEffect(() => {
        fetch(`/api/projects/${projectId}`)
            .then((r) => r.json())
            .then((d) => { if (d.project?.name) setProjectName(d.project.name); })
            .catch(() => { });
    }, [projectId]);

    // ─── Estimated floor area for add-job form ──────────────────────────────
    const addFloorAreaEstimated = useMemo(() => {
        if (addFootprint <= 0) return 0;
        return estimateFloorAreaCreated(addFootprint, addLevels);
    }, [addFootprint, addLevels]);

    // ─── Overall DPC calculation from jobs ──────────────────────────────────
    const dpcResult = useMemo(() => {
        if (jobs.length === 0) return null;
        const severity: Record<string, number> = { NONE: 0, DP: 1, PC: 2, ARCHITECT_REQUIRED: 3, REVIEW: 1 };
        let strictest = { determination: "NONE" as string, explanation: "" };
        for (const job of jobs) {
            const projectType: ProjectTypeChoice =
                job.nature === "new_construction" ? "new_construction"
                    : job.nature === "existing_extension" ? "existing_extension"
                        : "outdoor_other";
            const r = calculateDpPc({
                projectType,
                floorAreaCreated: job.floorAreaEstimated,
                footprintCreated: job.footprint,
                submitterType: submitter || undefined,
            });
            if ((severity[r.determination] || 0) > (severity[strictest.determination] || 0)) {
                strictest = r;
            }
        }
        return strictest;
    }, [jobs, submitter]);

    // ─── Add job ────────────────────────────────────────────────────────────
    function handleAddJob() {
        if (addFootprint <= 0) return;
        setJobs((prev) => [
            ...prev,
            {
                id: Date.now().toString(),
                nature: addNature,
                levels: addLevels,
                footprint: addFootprint,
                floorAreaEstimated: addFloorAreaEstimated,
            },
        ]);
        setAddFootprint(0);
        setAddLevels(1);
        setShowAddJob(false);
    }

    // ─── Save & finish ───────────────────────────────────────────────────────
    async function handleFinish() {
        setSaving(true);
        try {
            const determination = dpcResult?.determination === "ARCHITECT_REQUIRED" ? "PC"
                : dpcResult?.determination === "DP" ? "DP"
                    : dpcResult?.determination === "PC" ? "PC"
                        : "PC"; // default to PC if unknown

            await fetch(`/api/projects/${projectId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    authorizationType: determination,
                    authorizationExplanation: dpcResult?.explanation || "Auto-detected from project description",
                    projectDescription: {
                        terrainInitial,
                        accessVerts,
                        jobs,
                        exteriorMaterials,
                        roofType,
                        submitterType: submitter,
                        dpcDetermination: dpcResult?.determination,
                    },
                }),
            });
            router.push(`/projects/${projectId}/dashboard`);
        } catch (err) {
            console.error("Save failed:", err);
        }
        setSaving(false);
    }

    // ─── Progress bar ────────────────────────────────────────────────────────
    const progressPercent = step === 1 ? 5 : step === 2 ? 30 : step === 3 ? 65 : 90;

    // ─── Render ──────────────────────────────────────────────────────────────
    return (
        <Navigation>
            <div className="min-h-screen bg-[#f5f6fa] p-4 lg:p-8">
                <div className="max-w-6xl mx-auto">

                    {/* ── Top stepper ── */}
                    <div className="flex items-start justify-between mb-6 px-2">
                        {[
                            { n: 1, label: isEn ? "Description" : "Description" },
                            { n: 2, label: isEn ? "3D Design" : "Conception 3D" },
                            { n: 3, label: isEn ? "Export" : "Export" },
                        ].map((s, i) => (
                            <React.Fragment key={s.n}>
                                <div className="flex flex-col items-center gap-1">
                                    <div className={cn(
                                        "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all",
                                        step >= s.n
                                            ? "bg-indigo-600 border-indigo-600 text-white"
                                            : "bg-white border-slate-300 text-slate-400"
                                    )}>
                                        {s.n}
                                    </div>
                                    <span className={cn(
                                        "text-xs font-medium",
                                        step >= s.n ? "text-indigo-600" : "text-slate-400"
                                    )}>{s.label}</span>
                                </div>
                                {i < 2 && (
                                    <div className="flex-1 h-px bg-slate-200 mt-4 mx-3" />
                                )}
                            </React.Fragment>
                        ))}
                    </div>

                    {/* ── Progress bar ── */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-slate-500">{isEn ? "Progress of the case" : "Avancement du dossier"}</span>
                            <span className="text-xs font-semibold text-slate-700">{progressPercent} %</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                            <div
                                className="h-full rounded-full bg-indigo-600 transition-all duration-500"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                    </div>

                    {/* ── Two-column layout ── */}
                    <div className="flex gap-6 items-start">

                        {/* LEFT: Step content */}
                        <div className="flex-1 min-w-0">

                            {/* ══ STEP 1: Environment ══ */}
                            {step === 1 && (
                                <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-sm">
                                    <h2 className="text-xl font-bold text-slate-900">
                                        {isEn ? "Project description" : "Description du projet"}
                                    </h2>

                                    {/* Sub-tabs */}
                                    <div className="flex gap-2 flex-wrap">
                                        {[
                                            { label: isEn ? "1. Environment" : "1. Environnement", active: true },
                                            { label: isEn ? "2. Works" : "2. Travaux", active: false },
                                            { label: isEn ? "3. Materials" : "3. Matériaux", active: false },
                                            { label: isEn ? "4. Applicant" : "4. Demandeur", active: false },
                                        ].map((tab) => (
                                            <span
                                                key={tab.label}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-xs font-semibold",
                                                    tab.active
                                                        ? "bg-indigo-600 text-white"
                                                        : "bg-slate-100 text-slate-500"
                                                )}
                                            >
                                                {tab.label}
                                            </span>
                                        ))}
                                    </div>

                                    <div className="space-y-5">
                                        <h3 className="text-base font-bold text-slate-900">
                                            {isEn ? "1. Environment & Terrain" : "1. Environnement & Terrain"}
                                        </h3>
                                        <p className="text-sm text-slate-500 -mt-3">
                                            {isEn
                                                ? "Describe the initial state of the land. This information will be used to write the landscape insertion notice."
                                                : "Décrivez l'état initial du terrain. Ces informations permettront de rédiger la notice d'insertion paysagère."}
                                        </p>

                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-slate-800">
                                                {isEn ? "Initial state of the land and its surroundings" : "État initial du terrain et ses abords"}
                                            </label>
                                            <p className="text-xs text-slate-400">
                                                {isEn
                                                    ? "Describe the current land, neighboring buildings, existing vegetation."
                                                    : "Décrivez le terrain actuel, les constructions voisines, la végétation existante."}
                                            </p>
                                            <textarea
                                                value={terrainInitial}
                                                onChange={(e) => setTerrainInitial(e.target.value)}
                                                rows={4}
                                                className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                                                placeholder={isEn ? "e.g. Flat land, no existing buildings…" : "ex. Terrain plat, sans construction existante…"}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-slate-800">
                                                {isEn ? "Access and green space development" : "Aménagement des accès et espaces verts"}
                                            </label>
                                            <p className="text-xs text-slate-400">
                                                {isEn
                                                    ? "Specify if vegetation is preserved, if trees are felled, and how access is made."
                                                    : "Précisez si la végétation est conservée, si des arbres sont abattus, et comment se font les accès."}
                                            </p>
                                            <textarea
                                                value={accessVerts}
                                                onChange={(e) => setAccessVerts(e.target.value)}
                                                rows={4}
                                                className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                                                placeholder={isEn ? "e.g. Existing trees preserved, new driveway on the north side…" : "ex. Arbres existants conservés, nouvelle allée côté nord…"}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex justify-end pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setStep(2)}
                                            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-all shadow-sm"
                                        >
                                            {isEn ? "Next: Works" : "Suivant : Travaux"} <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* ══ STEP 2: Works ══ */}
                            {step === 2 && (
                                <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5 shadow-sm">
                                    <h2 className="text-xl font-bold text-slate-900">
                                        {isEn ? "Project description" : "Description du projet"}
                                    </h2>

                                    {/* Sub-tabs */}
                                    <div className="flex gap-2 flex-wrap">
                                        {[
                                            { label: isEn ? "1. Environment" : "1. Environnement", active: false },
                                            { label: isEn ? "2. Works" : "2. Travaux", active: true },
                                            { label: isEn ? "3. Materials" : "3. Matériaux", active: false },
                                            { label: isEn ? "4. Applicant" : "4. Demandeur", active: false },
                                        ].map((tab) => (
                                            <span
                                                key={tab.label}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-xs font-semibold",
                                                    tab.active
                                                        ? "bg-indigo-600 text-white"
                                                        : "bg-slate-100 text-slate-500"
                                                )}
                                            >
                                                {tab.label}
                                            </span>
                                        ))}
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <h3 className="text-base font-bold text-slate-900">
                                                {isEn ? "2. List of desired tasks" : "2. Liste des travaux souhaités"}
                                            </h3>
                                            <p className="text-sm text-slate-500 mt-1">
                                                {isEn
                                                    ? "Check the list of works below. Any changes here will update the type of authorization required (DP/PC)."
                                                    : "Vérifiez la liste des travaux ci-dessous. Toute modification mettra à jour le type d'autorisation requis (DP/PC)."}
                                            </p>
                                        </div>

                                        {/* Jobs list */}
                                        <div className="rounded-xl border border-slate-200 overflow-hidden">
                                            {jobs.length === 0 ? (
                                                <div className="px-5 py-8 text-center text-sm text-slate-400">
                                                    {isEn ? "No projects defined. Please add jobs." : "Aucun projet défini. Veuillez ajouter des travaux."}
                                                </div>
                                            ) : (
                                                <div className="divide-y divide-slate-100">
                                                    {jobs.map((job) => {
                                                        const projectType: ProjectTypeChoice =
                                                            job.nature === "new_construction" ? "new_construction"
                                                                : job.nature === "existing_extension" ? "existing_extension"
                                                                    : "outdoor_other";
                                                        const r = calculateDpPc({
                                                            projectType,
                                                            floorAreaCreated: job.floorAreaEstimated,
                                                            footprintCreated: job.footprint,
                                                        });
                                                        const badge =
                                                            r.determination === "PC" || r.determination === "ARCHITECT_REQUIRED"
                                                                ? "bg-amber-100 text-amber-700 border-amber-300"
                                                                : r.determination === "DP"
                                                                    ? "bg-blue-100 text-blue-700 border-blue-300"
                                                                    : "bg-slate-100 text-slate-500 border-slate-200";
                                                        const badgeLabel =
                                                            r.determination === "PC" || r.determination === "ARCHITECT_REQUIRED" ? "PC"
                                                                : r.determination === "DP" ? "DP" : "—";
                                                        const natureLabel =
                                                            job.nature === "new_construction" ? (isEn ? "New detached construction" : "Nouvelle construction")
                                                                : job.nature === "existing_extension" ? (isEn ? "Work on existing" : "Travaux sur existant")
                                                                    : (isEn ? "Outdoor landscaping" : "Aménagement extérieur");
                                                        return (
                                                            <div key={job.id} className="flex items-center gap-3 px-4 py-3">
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-sm font-semibold text-slate-900">{natureLabel}</p>
                                                                    <p className="text-xs text-slate-400">
                                                                        {job.footprint} m² · {job.levels === 1 ? (isEn ? "Ground floor" : "RDC") : job.levels === 2 ? "R+1" : "R+2"}
                                                                        {" · "}{isEn ? "Floor area" : "Surface plancher"}: {job.floorAreaEstimated.toFixed(1)} m²
                                                                    </p>
                                                                </div>
                                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge}`}>
                                                                    {badgeLabel}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setJobs((prev) => prev.filter((j) => j.id !== job.id))}
                                                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        {/* Add jobs button / form */}
                                        {!showAddJob ? (
                                            <button
                                                type="button"
                                                onClick={() => setShowAddJob(true)}
                                                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 text-sm font-semibold hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/40 transition-all"
                                            >
                                                <Plus className="w-4 h-4" /> {isEn ? "+ Add jobs" : "+ Ajouter des travaux"}
                                            </button>
                                        ) : (
                                            <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-5 space-y-4">
                                                <p className="text-sm font-bold text-slate-800">
                                                    <Plus className="w-4 h-4 inline mr-1" />
                                                    {isEn ? "Add jobs" : "Ajouter des travaux"}
                                                </p>

                                                {/* Nature */}
                                                <div className="space-y-2">
                                                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                                                        {isEn ? "What is the nature of your project?" : "Quelle est la nature de votre projet ?"}
                                                    </label>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        {([
                                                            { value: "new_construction" as NatureType, label: isEn ? "New detached construction" : "Nouvelle construction" },
                                                            { value: "existing_extension" as NatureType, label: isEn ? "Work on existing" : "Travaux sur existant" },
                                                            { value: "outdoor" as NatureType, label: isEn ? "Outdoor landscaping" : "Aménagement extérieur" },
                                                        ]).map((opt) => (
                                                            <button
                                                                key={opt.value}
                                                                type="button"
                                                                onClick={() => setAddNature(opt.value)}
                                                                className={cn(
                                                                    "px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all text-center",
                                                                    addNature === opt.value
                                                                        ? "bg-indigo-600 text-white border-indigo-600"
                                                                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                                                                )}
                                                            >
                                                                {opt.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Levels */}
                                                <div className="space-y-2">
                                                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                                                        {isEn ? "Number of levels" : "Nombre de niveaux"}
                                                    </label>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        {([
                                                            { value: 1 as LevelCount, label: isEn ? "Ground floor (ground floor)" : "RDC (rez-de-chaussée)" },
                                                            { value: 2 as LevelCount, label: isEn ? "Ground floor + 1st floor" : "RDC + R+1" },
                                                            { value: 3 as LevelCount, label: isEn ? "Ground floor + 2 floors" : "RDC + R+2" },
                                                        ]).map((opt) => (
                                                            <button
                                                                key={opt.value}
                                                                type="button"
                                                                onClick={() => setAddLevels(opt.value)}
                                                                className={cn(
                                                                    "px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all text-center",
                                                                    addLevels === opt.value
                                                                        ? "bg-indigo-600 text-white border-indigo-600"
                                                                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                                                                )}
                                                            >
                                                                {opt.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Footprint + Floor area */}
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <label className="text-xs font-semibold text-slate-600">
                                                            {isEn ? "Footprint (m²)" : "Emprise au sol (m²)"}
                                                        </label>
                                                        <input
                                                            type="number"
                                                            value={addFootprint || ""}
                                                            onChange={(e) => setAddFootprint(Number(e.target.value))}
                                                            className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                                            placeholder="Ex: 2222"
                                                            min={0}
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                                                            {isEn ? "Floor area (estimated)" : "Surface plancher (estimée)"} 🧮
                                                        </label>
                                                        <div className={cn(
                                                            "w-full px-3 py-2.5 rounded-xl border text-sm font-bold",
                                                            addFloorAreaEstimated > 0
                                                                ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                                                                : "bg-slate-50 border-slate-200 text-slate-400"
                                                        )}>
                                                            {addFloorAreaEstimated > 0 ? `${addFloorAreaEstimated.toFixed(2)}` : "—"}
                                                        </div>
                                                        {addFootprint > 0 && (
                                                            <p className="text-[10px] text-slate-400">
                                                                {isEn
                                                                    ? `Automatic calculation: ${addLevels === 1 ? "0.95" : addLevels === 2 ? "0.90" : "0.82"} × Footprint × Levels. Modifiable.`
                                                                    : `Calcul automatique: ${addLevels === 1 ? "0.95" : addLevels === 2 ? "0.90" : "0.82"} × Emprise × Niveaux. Modifiable.`}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                <button
                                                    type="button"
                                                    disabled={addFootprint <= 0}
                                                    onClick={handleAddJob}
                                                    className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-40 hover:bg-indigo-700 transition-all"
                                                >
                                                    {isEn ? "Add to folder" : "Ajouter au dossier"}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowAddJob(false)}
                                                    className="text-xs text-slate-400 hover:text-slate-600 underline"
                                                >
                                                    {isEn ? "Cancel" : "Annuler"}
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* DPC result banner */}
                                    {dpcResult && dpcResult.determination !== "NONE" && (
                                        <div className={cn(
                                            "rounded-xl p-4 flex items-start gap-3",
                                            dpcResult.determination === "DP"
                                                ? "bg-blue-50 border border-blue-200"
                                                : "bg-amber-50 border border-amber-200"
                                        )}>
                                            <div className={cn(
                                                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm",
                                                dpcResult.determination === "DP"
                                                    ? "bg-blue-100 text-blue-700"
                                                    : "bg-amber-100 text-amber-700"
                                            )}>
                                                {dpcResult.determination === "DP" ? "DP" : "PC"}
                                            </div>
                                            <div>
                                                <p className={cn(
                                                    "text-sm font-bold",
                                                    dpcResult.determination === "DP" ? "text-blue-700" : "text-amber-700"
                                                )}>
                                                    {dpcResult.determination === "DP"
                                                        ? (isEn ? "Prior Declaration (DP) required" : "Déclaration Préalable (DP) requise")
                                                        : (isEn ? "Building Permit (PC) required" : "Permis de Construire (PC) requis")}
                                                </p>
                                                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{dpcResult.explanation}</p>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setStep(1)}
                                            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-700 transition-colors"
                                        >
                                            <ChevronLeft className="w-4 h-4" /> {isEn ? "← Back" : "← Retour"}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setStep(3)}
                                            disabled={jobs.length === 0}
                                            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-40 hover:bg-indigo-700 transition-all shadow-sm"
                                        >
                                            {isEn ? "Next: Materials" : "Suivant : Matériaux"} <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* ══ STEP 3: Materials ══ */}
                            {step === 3 && (
                                <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-sm">
                                    <h2 className="text-xl font-bold text-slate-900">
                                        {isEn ? "Project description" : "Description du projet"}
                                    </h2>

                                    {/* Sub-tabs */}
                                    <div className="flex gap-2 flex-wrap">
                                        {[
                                            { label: isEn ? "1. Environment" : "1. Environnement", active: false },
                                            { label: isEn ? "2. Works" : "2. Travaux", active: false },
                                            { label: isEn ? "3. Materials" : "3. Matériaux", active: true },
                                            { label: isEn ? "4. Applicant" : "4. Demandeur", active: false },
                                        ].map((tab) => (
                                            <span
                                                key={tab.label}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-xs font-semibold",
                                                    tab.active
                                                        ? "bg-indigo-600 text-white"
                                                        : "bg-slate-100 text-slate-500"
                                                )}
                                            >
                                                {tab.label}
                                            </span>
                                        ))}
                                    </div>

                                    <div className="space-y-5">
                                        <h3 className="text-base font-bold text-slate-900">
                                            {isEn ? "3. Materials & Roof" : "3. Matériaux & Toiture"}
                                        </h3>

                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-slate-800">
                                                {isEn ? "Exterior materials" : "Matériaux extérieurs"}
                                            </label>
                                            <textarea
                                                value={exteriorMaterials}
                                                onChange={(e) => setExteriorMaterials(e.target.value)}
                                                rows={4}
                                                className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                                                placeholder={isEn ? "e.g. Rendered walls, wooden cladding, aluminum frames…" : "ex. Murs enduits, bardage bois, menuiseries aluminium…"}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-slate-800">
                                                {isEn ? "Roof type" : "Type de toiture"}
                                            </label>
                                            <div className="grid grid-cols-3 gap-3">
                                                {([
                                                    { value: "flat" as const, label: isEn ? "Flat roof" : "Toiture plate" },
                                                    { value: "dual_pitch" as const, label: isEn ? "Dual pitch" : "Deux pentes" },
                                                    { value: "single_pitch" as const, label: isEn ? "Single pitch" : "Une pente" },
                                                ]).map((rt) => (
                                                    <button
                                                        key={rt.value}
                                                        type="button"
                                                        onClick={() => setRoofType(rt.value)}
                                                        className={cn(
                                                            "px-4 py-3 rounded-xl text-sm font-medium border transition-all",
                                                            roofType === rt.value
                                                                ? "bg-indigo-600 text-white border-indigo-600"
                                                                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                                                        )}
                                                    >
                                                        {rt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setStep(2)}
                                            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-700 transition-colors"
                                        >
                                            <ChevronLeft className="w-4 h-4" /> {isEn ? "← Back" : "← Retour"}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setStep(4)}
                                            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-all shadow-sm"
                                        >
                                            {isEn ? "Next: Applicant" : "Suivant : Demandeur"} <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* ══ STEP 4: Applicant ══ */}
                            {step === 4 && (
                                <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-sm">
                                    <h2 className="text-xl font-bold text-slate-900">
                                        {isEn ? "Project description" : "Description du projet"}
                                    </h2>

                                    {/* Sub-tabs */}
                                    <div className="flex gap-2 flex-wrap">
                                        {[
                                            { label: isEn ? "1. Environment" : "1. Environnement", active: false },
                                            { label: isEn ? "2. Works" : "2. Travaux", active: false },
                                            { label: isEn ? "3. Materials" : "3. Matériaux", active: false },
                                            { label: isEn ? "4. Applicant" : "4. Demandeur", active: true },
                                        ].map((tab) => (
                                            <span
                                                key={tab.label}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-xs font-semibold",
                                                    tab.active
                                                        ? "bg-indigo-600 text-white"
                                                        : "bg-slate-100 text-slate-500"
                                                )}
                                            >
                                                {tab.label}
                                            </span>
                                        ))}
                                    </div>

                                    <div className="space-y-4">
                                        <h3 className="text-base font-bold text-slate-900">
                                            {isEn ? "4. Who is the applicant?" : "4. Qui est le demandeur ?"}
                                        </h3>
                                        <p className="text-sm text-slate-500">
                                            {isEn
                                                ? "This determines whether an architect is required for a building permit."
                                                : "Cela détermine si un architecte est requis pour un permis de construire."}
                                        </p>

                                        <div className="space-y-3">
                                            <button
                                                type="button"
                                                onClick={() => setSubmitter("individual")}
                                                className={cn(
                                                    "w-full flex items-center justify-between px-5 py-4 rounded-xl border-2 text-left transition-all",
                                                    submitter === "individual"
                                                        ? "border-indigo-500 bg-indigo-50"
                                                        : "border-slate-200 bg-white hover:bg-slate-50"
                                                )}
                                            >
                                                <div>
                                                    <p className="font-semibold text-slate-900">{isEn ? "Individual (Particular)" : "Particulier"}</p>
                                                    <p className="text-xs text-slate-500 mt-0.5">
                                                        {isEn ? "Natural person, private individual" : "Personne physique, particulier"}
                                                    </p>
                                                </div>
                                                <div className={cn(
                                                    "w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center",
                                                    submitter === "individual" ? "border-indigo-500 bg-indigo-500" : "border-slate-300"
                                                )}>
                                                    {submitter === "individual" && <Check className="w-3 h-3 text-white" />}
                                                </div>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setSubmitter("company")}
                                                className={cn(
                                                    "w-full flex items-center justify-between px-5 py-4 rounded-xl border-2 text-left transition-all",
                                                    submitter === "company"
                                                        ? "border-amber-500 bg-amber-50"
                                                        : "border-slate-200 bg-white hover:bg-slate-50"
                                                )}
                                            >
                                                <div>
                                                    <p className="font-semibold text-slate-900">{isEn ? "Legal entity (company, SCI…)" : "Personne morale (société, SCI…)"}</p>
                                                    <p className="text-xs text-slate-500 mt-0.5">
                                                        {isEn ? "Company, real estate investment company, etc." : "Société, SCI, etc."}
                                                    </p>
                                                </div>
                                                <div className={cn(
                                                    "w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center",
                                                    submitter === "company" ? "border-amber-500 bg-amber-500" : "border-slate-300"
                                                )}>
                                                    {submitter === "company" && <Check className="w-3 h-3 text-white" />}
                                                </div>
                                            </button>
                                        </div>

                                        {submitter === "company" && (
                                            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
                                                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                                <p className="text-sm text-amber-700">
                                                    {isEn
                                                        ? "Legal entities must use an architect for any Building Permit, regardless of the surface area."
                                                        : "Les personnes morales doivent obligatoirement recourir à un architecte pour tout Permis de Construire, quelle que soit la surface."}
                                                </p>
                                            </div>
                                        )}

                                        {/* Final DPC summary */}
                                        {dpcResult && dpcResult.determination !== "NONE" && (
                                            <div className={cn(
                                                "rounded-xl p-4 border",
                                                dpcResult.determination === "DP"
                                                    ? "bg-blue-50 border-blue-200"
                                                    : "bg-amber-50 border-amber-200"
                                            )}>
                                                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">
                                                    {isEn ? "Authorization determined" : "Autorisation déterminée"}
                                                </p>
                                                <p className={cn(
                                                    "text-lg font-bold",
                                                    dpcResult.determination === "DP" ? "text-blue-700" : "text-amber-700"
                                                )}>
                                                    {dpcResult.determination === "DP"
                                                        ? (isEn ? "Prior Declaration (DP)" : "Déclaration Préalable (DP)")
                                                        : (isEn ? "Building Permit (PC)" : "Permis de Construire (PC)")}
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setStep(3)}
                                            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-700 transition-colors"
                                        >
                                            <ChevronLeft className="w-4 h-4" /> {isEn ? "← Back" : "← Retour"}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={!submitter || saving}
                                            onClick={handleFinish}
                                            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-40 hover:bg-indigo-700 transition-all shadow-sm"
                                        >
                                            {saving ? (
                                                <><Loader2 className="w-4 h-4 animate-spin" /> {isEn ? "Saving…" : "Enregistrement…"}</>
                                            ) : (
                                                <><Check className="w-4 h-4" /> {isEn ? "Return to Dashboard" : "Retour au tableau de bord"}</>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* RIGHT: Administrative documents panel */}
                        <div className="w-[300px] shrink-0 sticky top-6 self-start">
                            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                                {/* Panel header */}
                                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-bold text-slate-900">
                                            {isEn ? "Your administrative documents" : "Vos documents administratifs"}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold uppercase">
                                            AUTO
                                        </span>
                                        <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 transition-colors">
                                            <Download className="w-3 h-3" />
                                            {isEn ? "Export all" : "Tout exporter"}
                                        </button>
                                    </div>
                                </div>

                                {/* Document list */}
                                <div className="divide-y divide-slate-50">
                                    {ADMIN_DOCS.map((doc) => (
                                        <div key={doc.code} className="px-4 py-3 flex items-center gap-3">
                                            <div className={cn(
                                                "w-6 h-6 rounded-full flex items-center justify-center shrink-0",
                                                doc.unlocked
                                                    ? "bg-emerald-100"
                                                    : "bg-slate-100"
                                            )}>
                                                {doc.unlocked ? (
                                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                                ) : (
                                                    <div className="w-2 h-2 rounded-full bg-slate-300" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase">{doc.code}</p>
                                                <p className="text-xs font-medium text-slate-800 truncate">{doc.label}</p>
                                            </div>
                                            {doc.unlocked ? (
                                                <div className="flex items-center gap-1.5">
                                                    <button className="text-slate-400 hover:text-slate-600 transition-colors">
                                                        <Eye className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button className="text-slate-400 hover:text-slate-600 transition-colors">
                                                        <Download className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-[10px] text-slate-400 font-medium">
                                                    {isEn ? "On hold" : "En attente"}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* DPC badge at bottom */}
                                {dpcResult && dpcResult.determination !== "NONE" && (
                                    <div className={cn(
                                        "mx-4 mb-4 mt-2 rounded-xl px-4 py-3 text-center",
                                        dpcResult.determination === "DP"
                                            ? "bg-blue-50 border border-blue-200"
                                            : "bg-amber-50 border border-amber-200"
                                    )}>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
                                            {isEn ? "Detected type" : "Type détecté"}
                                        </p>
                                        <p className={cn(
                                            "text-xl font-black",
                                            dpcResult.determination === "DP" ? "text-blue-700" : "text-amber-700"
                                        )}>
                                            {dpcResult.determination === "DP" ? "DP" : "PC"}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </Navigation>
    );
}
