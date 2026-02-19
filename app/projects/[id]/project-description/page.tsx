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
    MapPin,
    Upload,
    Info,
    Box,
    ArrowRight,
    Home,
    Droplets,
    Fence,
    HardHat,
    X,
    Printer,
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

type WizardStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

type NatureType = "new_construction" | "existing_extension" | "outdoor";
type LevelCount = 1 | 2 | 3;
type WorkType = "extension" | "change_destination" | "change_exterior";
type OutdoorLayout = "pool" | "fence_gate";

interface Job {
    id: string;
    nature: NatureType;
    levels: LevelCount;
    footprint: number;
    floorAreaEstimated: number;
    // Work on existing fields
    currentLivingArea?: number;
    workTypes?: WorkType[];
    // Outdoor fields
    outdoorLayout?: OutdoorLayout;
    poolSurfaceArea?: number;
    hasPoolEnclosure?: boolean;
    // Display label
    displayLabel?: string;
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

    const [step, setStep] = useState<WizardStep>(0);
    const [saving, setSaving] = useState(false);

    // Step 1 — Environment
    const [projectAddress, setProjectAddress] = useState("");
    const [nearPhoto, setNearPhoto] = useState<File | null>(null);
    const [farPhoto, setFarPhoto] = useState<File | null>(null);
    const [terrainInitial, setTerrainInitial] = useState("");
    const [accessVerts, setAccessVerts] = useState("");

    // Step 2 — Works
    const [jobs, setJobs] = useState<Job[]>([]);
    const [showAddJob, setShowAddJob] = useState(false);
    const [addNature, setAddNature] = useState<NatureType>("new_construction");
    const [addLevels, setAddLevels] = useState<LevelCount>(1);
    const [addFootprint, setAddFootprint] = useState<number>(0);
    // Work on existing specific
    const [addCurrentLivingArea, setAddCurrentLivingArea] = useState<number>(0);
    const [addWorkTypes, setAddWorkTypes] = useState<WorkType[]>([]);
    // Outdoor specific
    const [addOutdoorLayout, setAddOutdoorLayout] = useState<OutdoorLayout>("pool");
    const [addPoolSurfaceArea, setAddPoolSurfaceArea] = useState<number>(0);
    const [addHasPoolEnclosure, setAddHasPoolEnclosure] = useState(false);

    // Step 3 — Materials (detailed sections)
    // Standing Building (Exterior)
    const [matExtMaterial, setMatExtMaterial] = useState("");
    const [matExtColor, setMatExtColor] = useState("");
    // Roof
    const [roofType, setRoofType] = useState<"flat" | "dual_pitch" | "single_pitch" | "">("");
    const [roofCovering, setRoofCovering] = useState("");
    const [roofColor, setRoofColor] = useState("");
    // Non-independent Construction
    const [roofMaterial, setRoofMaterial] = useState("");
    // Wall(s)
    const [wallMaterial, setWallMaterial] = useState("");
    const [wallColor, setWallColor] = useState("");
    const [wallType, setWallType] = useState<string[]>([]);
    // Gutters and Downspouts
    const [gutterMaterial, setGutterMaterial] = useState("");
    const [gutterColor, setGutterColor] = useState("");
    // Surfaces and Coverings
    const [surfaceMaterial, setSurfaceMaterial] = useState("");
    const [surfaceColor, setSurfaceColor] = useState("");
    const [surfaceType, setSurfaceType] = useState<string[]>([]);
    // Fencing
    const [fenceMaterial, setFenceMaterial] = useState("");
    const [fenceColor, setFenceColor] = useState("");
    const [fenceType, setFenceType] = useState<string[]>([]);
    // Joinery & Blinds
    const [joineryMaterial, setJoineryMaterial] = useState("");
    const [joineryType, setJoineryType] = useState<string[]>([]);
    // Exterior (Additions)
    const [extRoofing, setExtRoofing] = useState("");
    // Surfaces and Coverings 2
    const [surface2Material, setSurface2Material] = useState("");
    const [surface2Color, setSurface2Color] = useState("");
    // Trimmings
    const [trimMaterial, setTrimMaterial] = useState("");
    const [trimColor, setTrimColor] = useState("");
    const [trimType, setTrimType] = useState<string[]>([]);
    // Joinery & Blinds 2
    const [joinery2Material, setJoinery2Material] = useState("");
    const [joinery2Type, setJoinery2Type] = useState<string[]>([]);

    // Step 4 — Applicant (personal info)
    const [applicantName, setApplicantName] = useState("");
    const [applicantFirstNames, setApplicantFirstNames] = useState("");
    const [applicantDob, setApplicantDob] = useState("");
    const [applicantCityOfBirth, setApplicantCityOfBirth] = useState("");
    const [applicantDepartment, setApplicantDepartment] = useState("");
    const [applicantResidenceType, setApplicantResidenceType] = useState("primary");
    const [applicantFunding, setApplicantFunding] = useState("equity");
    const [submitter, setSubmitter] = useState<SubmitterType | null>(null);
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [showAnalysisModal, setShowAnalysisModal] = useState(false);
    const [analysisProgress, setAnalysisProgress] = useState(0);
    const [analysisComplete, setAnalysisComplete] = useState(false);
    const [pluFile, setPluFile] = useState<File | null>(null);
    const [designValidated, setDesignValidated] = useState(false);
    const [selectedDoc, setSelectedDoc] = useState<string>("PC4 / DPC 8-1");

    // Project data
    const [projectName, setProjectName] = useState<string>("");
    useEffect(() => {
        fetch(`/api/projects/${projectId}`)
            .then((r) => r.json())
            .then((d) => {
                if (d.project?.name) setProjectName(d.project.name);
                if (d.project?.address) setProjectAddress(d.project.address);
            })
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

    // ─── Toggle work type for existing extension ─────────────────────────
    function toggleWorkType(wt: WorkType) {
        setAddWorkTypes((prev) =>
            prev.includes(wt) ? prev.filter((w) => w !== wt) : [...prev, wt]
        );
    }

    // ─── Add job ────────────────────────────────────────────────────────────
    function handleAddJob() {
        if (addNature === "outdoor") {
            // Outdoor uses pool surface area as footprint
            const fp = addOutdoorLayout === "pool" ? addPoolSurfaceArea : addFootprint;
            if (fp <= 0) return;
            const label =
                addOutdoorLayout === "pool"
                    ? (isEn ? "Pool" : "Piscine")
                    : (isEn ? "Fence / Gate" : "Clôture / Portail");
            setJobs((prev) => [
                ...prev,
                {
                    id: Date.now().toString(),
                    nature: addNature,
                    levels: 1,
                    footprint: fp,
                    floorAreaEstimated: 0,
                    outdoorLayout: addOutdoorLayout,
                    poolSurfaceArea: addOutdoorLayout === "pool" ? addPoolSurfaceArea : undefined,
                    hasPoolEnclosure: addOutdoorLayout === "pool" ? addHasPoolEnclosure : undefined,
                    displayLabel: label,
                },
            ]);
        } else if (addNature === "existing_extension") {
            if (addFootprint <= 0) return;
            setJobs((prev) => [
                ...prev,
                {
                    id: Date.now().toString(),
                    nature: addNature,
                    levels: addLevels,
                    footprint: addFootprint,
                    floorAreaEstimated: addFloorAreaEstimated,
                    currentLivingArea: addCurrentLivingArea,
                    workTypes: [...addWorkTypes],
                    displayLabel: isEn ? "Work on existing" : "Travaux sur existant",
                },
            ]);
        } else {
            if (addFootprint <= 0) return;
            setJobs((prev) => [
                ...prev,
                {
                    id: Date.now().toString(),
                    nature: addNature,
                    levels: addLevels,
                    footprint: addFootprint,
                    floorAreaEstimated: addFloorAreaEstimated,
                    displayLabel: isEn ? "New detached construction" : "Nouvelle construction",
                },
            ]);
        }
        // Reset form
        setAddFootprint(0);
        setAddLevels(1);
        setAddCurrentLivingArea(0);
        setAddWorkTypes([]);
        setAddOutdoorLayout("pool");
        setAddPoolSurfaceArea(0);
        setAddHasPoolEnclosure(false);
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
                        materials: {
                            exterior: { material: matExtMaterial, color: matExtColor },
                            roof: { type: roofType, covering: roofCovering, color: roofColor },
                            roofMaterial,
                            wall: { material: wallMaterial, color: wallColor, type: wallType },
                            gutter: { material: gutterMaterial, color: gutterColor },
                            surface: { material: surfaceMaterial, color: surfaceColor, type: surfaceType },
                            fencing: { material: fenceMaterial, color: fenceColor, type: fenceType },
                            joinery: { material: joineryMaterial, type: joineryType },
                            extRoofing,
                            surface2: { material: surface2Material, color: surface2Color },
                            trim: { material: trimMaterial, color: trimColor, type: trimType },
                            joinery2: { material: joinery2Material, type: joinery2Type },
                        },
                        applicant: {
                            name: applicantName,
                            firstNames: applicantFirstNames,
                            dob: applicantDob,
                            cityOfBirth: applicantCityOfBirth,
                            department: applicantDepartment,
                            residenceType: applicantResidenceType,
                            funding: applicantFunding,
                        },
                        submitterType: submitter,
                        dpcDetermination: dpcResult?.determination,
                    },
                }),
            });
            setStep(5);
        } catch (err) {
            console.error("Save failed:", err);
        }
        setSaving(false);
    }

    // ─── Progress bar ────────────────────────────────────────────────────────
    const progressPercent = step === 0 ? 5 : step === 1 ? 15 : step === 2 ? 30 : step === 3 ? 45 : step === 4 ? 55 : step === 5 ? 65 : step === 6 ? 75 : step === 7 ? 85 : 100;

    // Map step to stepper phase
    const stepperPhase = step <= 4 ? 1 : step <= 6 ? 2 : step === 7 ? 3 : 4;

    // Handle design validation
    function handleValidateDesign() {
        setDesignValidated(true);
        // After a short delay, move to complete file step
        setTimeout(() => setStep(8), 1200);
    }

    // Start analysis simulation
    function handleStartAnalysis() {
        setShowAnalysisModal(true);
        setAnalysisProgress(0);
        setAnalysisComplete(false);
        const interval = setInterval(() => {
            setAnalysisProgress(prev => {
                if (prev >= 100) {
                    clearInterval(interval);
                    setAnalysisComplete(true);
                    return 100;
                }
                return prev + Math.random() * 8 + 2;
            });
        }, 200);
    }

    function handleViewResults() {
        setShowAnalysisModal(false);
        setStep(6);
    }

    // ─── Render ──────────────────────────────────────────────────────────────
    return (
        <>
            <Navigation>
                <div className="min-h-screen bg-[#f5f6fa] p-4 lg:p-8">
                    <div className="max-w-6xl mx-auto">

                        {/* ── Top stepper ── */}
                        <div className="flex items-start justify-between mb-6 px-2">
                            {[
                                { n: 1, label: isEn ? "Description" : "Description" },
                                { n: 2, label: isEn ? "Regulation Analysis" : "Analyse Réglementation" },
                                { n: 3, label: isEn ? "3D Design" : "Conception 3D" },
                                { n: 4, label: isEn ? "Complete File" : "Dossier Complet" },
                            ].map((s, i) => (
                                <React.Fragment key={s.n}>
                                    <div className="flex flex-col items-center gap-1">
                                        <div className={cn(
                                            "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all",
                                            stepperPhase >= s.n
                                                ? "bg-indigo-600 border-indigo-600 text-white"
                                                : "bg-white border-slate-300 text-slate-400"
                                        )}>
                                            {s.n}
                                        </div>
                                        <span className={cn(
                                            "text-xs font-medium",
                                            stepperPhase >= s.n ? "text-indigo-600" : "text-slate-400"
                                        )}>{s.label}</span>
                                    </div>
                                    {i < 3 && (
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

                                {/* ══ STEP 0: Overview Landing ══ */}
                                {step === 0 && (
                                    <div className="space-y-5">
                                        {/* Next step card */}
                                        <div className="rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-500 p-6 text-white shadow-lg relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                                            <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
                                            <div className="relative z-10">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                                    <span className="text-xs font-bold uppercase tracking-widest text-indigo-200">
                                                        {isEn ? "Next step" : "Prochaine étape"}
                                                    </span>
                                                </div>
                                                <h2 className="text-xl font-bold mb-2">
                                                    {isEn ? "Describe your project" : "Décrivez votre projet"}
                                                </h2>
                                                <p className="text-sm text-indigo-100 mb-5 max-w-md">
                                                    {isEn
                                                        ? "Complete the technical description to allow the AI to generate your descriptive notice."
                                                        : "Complétez la description technique pour permettre à l'IA de générer votre notice descriptive."}
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => setStep(1)}
                                                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-indigo-700 font-semibold text-sm hover:bg-indigo-50 transition-colors shadow-sm"
                                                >
                                                    {isEn ? "Describe my project" : "Décrire mon projet"}
                                                    <ArrowRight className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* 3D Modeling card */}
                                        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                                            <div className="h-36 bg-gradient-to-br from-slate-200 via-slate-100 to-slate-50 flex items-center justify-center">
                                                <div className="flex items-center gap-2 text-slate-400">
                                                    <Box className="w-6 h-6" />
                                                    <span className="text-sm font-medium">{isEn ? "3D Modeling" : "Modélisation 3D"}</span>
                                                </div>
                                            </div>
                                            <div className="p-6">
                                                <h3 className="text-lg font-bold text-slate-900 mb-1">
                                                    {isEn ? "Access the smart editor" : "Accéder à l'éditeur intelligent"}
                                                </h3>
                                                <p className="text-sm text-slate-500 mb-4">
                                                    {isEn
                                                        ? "Access the modeling space to draw your project in 3D on the ground."
                                                        : "Accédez à l'espace de modélisation pour dessiner votre projet en 3D sur le terrain."}
                                                </p>
                                                <a
                                                    href={`/site-plan?project=${projectId}`}
                                                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-indigo-200 text-indigo-600 font-semibold text-sm hover:bg-indigo-50 transition-colors"
                                                >
                                                    <Box className="w-4 h-4" />
                                                    {isEn ? "Open the editor" : "Ouvrir l'éditeur"}
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ══ STEP 1: Environment ══ */}
                                {step === 1 && (
                                    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-sm">
                                        <h2 className="text-xl font-bold text-slate-900">
                                            {isEn ? "Project description" : "Description du projet"}
                                        </h2>

                                        {/* Sub-tabs */}
                                        <div className="flex items-center gap-1 flex-wrap">
                                            {[
                                                { label: isEn ? "1. Environment" : "1. Environnement", active: true },
                                                { label: isEn ? "2. Works" : "2. Travaux", active: false },
                                                { label: isEn ? "3. Materials" : "3. Matériaux", active: false },
                                                { label: isEn ? "4. Applicant" : "4. Demandeur", active: false },
                                            ].map((tab, i) => (
                                                <React.Fragment key={tab.label}>
                                                    <span
                                                        className={cn(
                                                            "px-3 py-1.5 rounded-full text-xs font-semibold",
                                                            tab.active
                                                                ? "bg-indigo-600 text-white"
                                                                : "bg-slate-100 text-slate-500"
                                                        )}
                                                    >
                                                        {tab.label}
                                                    </span>
                                                    {i < 3 && <div className="w-4 h-px bg-slate-300" />}
                                                </React.Fragment>
                                            ))}
                                        </div>

                                        <div className="space-y-5">
                                            <h3 className="text-base font-bold text-slate-900">
                                                {isEn ? "1. Project Environment" : "1. Environnement du projet"}
                                            </h3>

                                            {/* Address field */}
                                            <div className="space-y-2">
                                                <label className="text-sm font-semibold text-slate-800">
                                                    {isEn ? "Address of the plot" : "Adresse de la parcelle"}
                                                </label>
                                                <div className="relative">
                                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                    <input
                                                        type="text"
                                                        value={projectAddress}
                                                        onChange={(e) => setProjectAddress(e.target.value)}
                                                        className="w-full pl-9 pr-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                                        placeholder={isEn ? "Enter the plot address..." : "Entrez l'adresse de la parcelle..."}
                                                    />
                                                </div>
                                            </div>

                                            {/* AI auto-generation info card */}
                                            <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-4 flex items-start gap-3">
                                                <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="text-sm font-bold text-indigo-800">
                                                        {isEn ? "Automatic Instruction Manual Generation" : "Génération automatique de la notice descriptive"}
                                                    </p>
                                                    <p className="text-xs text-indigo-600 mt-1">
                                                        {isEn
                                                            ? "It's magic! Thanks to artificial intelligence, we'll analyze your photos to automatically generate a description of the property's initial condition in your property description. Take great photos!"
                                                            : "C'est magique ! Grâce à l'intelligence artificielle, nous analyserons vos photos pour générer automatiquement une description de l'état initial du bien dans votre description de propriété. Prenez de belles photos !"}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Photo upload areas */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-sm font-semibold text-slate-800">
                                                        {isEn ? "Photo of the immediate surroundings" : "Photo des abords immédiats"} <span className="text-red-500">*</span>
                                                    </label>
                                                    <label className="flex flex-col items-center justify-center gap-2 py-8 px-4 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-all">
                                                        <Upload className="w-6 h-6 text-slate-400" />
                                                        <span className="text-sm font-medium text-slate-600">
                                                            {nearPhoto ? nearPhoto.name : (isEn ? "Drag or click to add" : "Glisser ou cliquer pour ajouter")}
                                                        </span>
                                                        <span className="text-[11px] text-slate-400 text-center italic">
                                                            {isEn
                                                                ? "Take a close-up photo, focusing on the exact area where the work will take place."
                                                                : "Prenez une photo rapprochée, en vous concentrant sur la zone exacte des travaux."}
                                                        </span>
                                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => setNearPhoto(e.target.files?.[0] || null)} />
                                                    </label>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-sm font-semibold text-slate-800">
                                                        {isEn ? "Photo of the distant environment" : "Photo de l'environnement lointain"} <span className="text-red-500">*</span>
                                                    </label>
                                                    <label className="flex flex-col items-center justify-center gap-2 py-8 px-4 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-all">
                                                        <Upload className="w-6 h-6 text-slate-400" />
                                                        <span className="text-sm font-medium text-slate-600">
                                                            {farPhoto ? farPhoto.name : (isEn ? "Drag or click to add" : "Glisser ou cliquer pour ajouter")}
                                                        </span>
                                                        <span className="text-[11px] text-slate-400 text-center italic">
                                                            {isEn
                                                                ? "Preferably from a public space (street). The context must be visible: neighboring houses, street, general atmosphere."
                                                                : "De préférence depuis un espace public (rue). Le contexte doit être visible : maisons voisines, rue, ambiance générale."}
                                                        </span>
                                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => setFarPhoto(e.target.files?.[0] || null)} />
                                                    </label>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex justify-center pt-2">
                                            <button
                                                type="button"
                                                onClick={() => setStep(2)}
                                                className="flex items-center gap-2 px-8 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-all shadow-sm"
                                            >
                                                {isEn ? "Next: Works" : "Suivant : Travaux"} <ArrowRight className="w-4 h-4" />
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

                                        {/* Sub-tabs with connectors */}
                                        <div className="flex items-center gap-1 flex-wrap">
                                            {[
                                                { label: isEn ? "1. Environment" : "1. Environnement", active: false },
                                                { label: isEn ? "2. Works" : "2. Travaux", active: true },
                                                { label: isEn ? "3. Materials" : "3. Matériaux", active: false },
                                                { label: isEn ? "4. Applicant" : "4. Demandeur", active: false },
                                            ].map((tab, i) => (
                                                <React.Fragment key={tab.label}>
                                                    <span
                                                        className={cn(
                                                            "px-3 py-1.5 rounded-full text-xs font-semibold",
                                                            tab.active
                                                                ? "bg-indigo-600 text-white"
                                                                : "bg-slate-100 text-slate-500"
                                                        )}
                                                    >
                                                        {tab.label}
                                                    </span>
                                                    {i < 3 && <div className="w-4 h-px bg-slate-300" />}
                                                </React.Fragment>
                                            ))}
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-base font-bold text-slate-900">
                                                    {isEn ? "2. List of tasks" : "2. Liste des travaux"}
                                                </h3>
                                                {!showAddJob && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowAddJob(true)}
                                                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
                                                    >
                                                        <Plus className="w-3.5 h-3.5" /> {isEn ? "Add" : "Ajouter"}
                                                    </button>
                                                )}
                                            </div>

                                            {/* Jobs list */}
                                            {jobs.length === 0 && !showAddJob ? (
                                                <div className="rounded-xl border border-slate-200 px-5 py-10 text-center text-sm text-slate-400 italic">
                                                    {isEn ? 'No jobs entered. Click "Add" to begin.' : 'Aucun travail défini. Cliquez sur "Ajouter" pour commencer.'}
                                                </div>
                                            ) : jobs.length > 0 ? (
                                                <div className="space-y-3">
                                                    {jobs.map((job) => {
                                                        const jobIcon =
                                                            job.nature === "outdoor"
                                                                ? job.outdoorLayout === "pool" ? <Droplets className="w-4.5 h-4.5 text-indigo-500" /> : <Fence className="w-4.5 h-4.5 text-indigo-500" />
                                                                : job.nature === "existing_extension" ? <HardHat className="w-4.5 h-4.5 text-indigo-500" />
                                                                    : <Home className="w-4.5 h-4.5 text-indigo-500" />;
                                                        const jobLabel = job.displayLabel ||
                                                            (job.nature === "new_construction" ? (isEn ? "New detached construction" : "Nouvelle construction")
                                                                : job.nature === "existing_extension" ? (isEn ? "Work on existing" : "Travaux sur existant")
                                                                    : (isEn ? "Outdoor landscaping" : "Aménagement extérieur"));
                                                        return (
                                                            <div key={job.id} className="flex items-center gap-4 px-5 py-4 rounded-xl border border-slate-200 bg-white">
                                                                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                                                                    {jobIcon}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-sm font-bold text-slate-900">{jobLabel}</p>
                                                                    <p className="text-xs text-slate-400">
                                                                        {isEn ? "Footprint" : "Emprise au sol"} : {job.footprint} m²
                                                                    </p>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setJobs((prev) => prev.filter((j) => j.id !== job.id))}
                                                                    className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : null}

                                            {/* Add jobs form (shown when triggered from header button) */}
                                            {showAddJob && (
                                                <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
                                                    <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                                        <Plus className="w-4 h-4" />
                                                        {isEn ? "Add jobs" : "Ajouter des travaux"}
                                                    </p>

                                                    {/* Nature */}
                                                    <div className="space-y-3">
                                                        <label className="text-sm text-slate-600">
                                                            {isEn ? "What is the nature of your project?" : "Quelle est la nature de votre projet ?"}
                                                        </label>
                                                        <div className="flex flex-wrap gap-2">
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
                                                                        "px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all",
                                                                        addNature === opt.value
                                                                            ? "bg-white text-indigo-700 border-indigo-500"
                                                                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                                                                    )}
                                                                >
                                                                    {opt.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* ── Nature-specific fields ── */}

                                                    {/* === Work on existing: extra fields === */}
                                                    {addNature === "existing_extension" && (
                                                        <>
                                                            {/* Current living area */}
                                                            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-2">
                                                                <div className="flex items-center gap-2">
                                                                    <Home className="w-4 h-4 text-amber-600" />
                                                                    <span className="text-xs font-bold text-amber-700">
                                                                        {isEn ? "Current living area before renovations" : "Surface habitable actuelle avant travaux"}
                                                                    </span>
                                                                </div>
                                                                <input
                                                                    type="number"
                                                                    value={addCurrentLivingArea || ""}
                                                                    onChange={(e) => setAddCurrentLivingArea(Number(e.target.value))}
                                                                    className="w-full px-3 py-2.5 rounded-xl bg-white border border-amber-200 text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-300"
                                                                    placeholder="Ex: 80"
                                                                    min={0}
                                                                />
                                                                <p className="text-[10px] text-amber-600 flex items-center gap-1">
                                                                    <Info className="w-3 h-3" />
                                                                    {isEn
                                                                        ? 'You can find this information in your personal space on impot.gouv.fr, under the section "My real estate".'
                                                                        : 'Vous pouvez trouver cette information dans votre espace personnel sur impot.gouv.fr, rubrique "Mes biens immobiliers".'}
                                                                </p>
                                                            </div>

                                                            {/* Type of work */}
                                                            <div className="space-y-3">
                                                                <label className="text-sm text-slate-600">
                                                                    {isEn ? "Specify the type of work (Multiple choices possible):" : "Précisez le type de travaux (Choix multiples possibles) :"}
                                                                </label>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {([
                                                                        { value: "extension" as WorkType, label: isEn ? "Extension / Raising the Height" : "Extension / Surélévation" },
                                                                        { value: "change_destination" as WorkType, label: isEn ? "Change of destination" : "Changement de destination" },
                                                                        { value: "change_exterior" as WorkType, label: isEn ? "Change in exterior appearance" : "Modification de l'aspect extérieur" },
                                                                    ]).map((opt) => (
                                                                        <button
                                                                            key={opt.value}
                                                                            type="button"
                                                                            onClick={() => toggleWorkType(opt.value)}
                                                                            className={cn(
                                                                                "px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all relative",
                                                                                addWorkTypes.includes(opt.value)
                                                                                    ? "bg-white text-indigo-700 border-indigo-500"
                                                                                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                                                                            )}
                                                                        >
                                                                            {opt.label}
                                                                            {addWorkTypes.includes(opt.value) && (
                                                                                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center">
                                                                                    <Check className="w-2.5 h-2.5 text-white" />
                                                                                </span>
                                                                            )}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </>
                                                    )}

                                                    {/* === Outdoor landscaping: specific fields === */}
                                                    {addNature === "outdoor" && (
                                                        <>
                                                            {/* Layout */}
                                                            <div className="space-y-2">
                                                                <label className="text-xs font-semibold text-slate-600">
                                                                    {isEn ? "Specify the layout:" : "Précisez l'aménagement :"}
                                                                </label>
                                                                <div className="space-y-2">
                                                                    <label className="flex items-center gap-3 cursor-pointer">
                                                                        <input
                                                                            type="radio"
                                                                            name="outdoor-layout"
                                                                            checked={addOutdoorLayout === "pool"}
                                                                            onChange={() => setAddOutdoorLayout("pool")}
                                                                            className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                                                                        />
                                                                        <span className="text-sm text-slate-700 font-medium">{isEn ? "Pool" : "Piscine"}</span>
                                                                    </label>
                                                                    <label className="flex items-center gap-3 cursor-pointer">
                                                                        <input
                                                                            type="radio"
                                                                            name="outdoor-layout"
                                                                            checked={addOutdoorLayout === "fence_gate"}
                                                                            onChange={() => setAddOutdoorLayout("fence_gate")}
                                                                            className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                                                                        />
                                                                        <span className="text-sm text-slate-700 font-medium">{isEn ? "Fence / Gate" : "Clôture / Portail"}</span>
                                                                    </label>
                                                                </div>
                                                            </div>

                                                            {/* Pool surface area */}
                                                            {addOutdoorLayout === "pool" && (
                                                                <div className="space-y-3">
                                                                    <div className="space-y-1">
                                                                        <label className="text-xs font-semibold text-slate-600">
                                                                            {isEn ? "Pool surface area (m²)" : "Surface du bassin (m²)"}
                                                                        </label>
                                                                        <input
                                                                            type="number"
                                                                            value={addPoolSurfaceArea || ""}
                                                                            onChange={(e) => setAddPoolSurfaceArea(Number(e.target.value))}
                                                                            className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                                                            placeholder="Ex: 22"
                                                                            min={0}
                                                                        />
                                                                    </div>
                                                                    <label className="flex items-center gap-3 cursor-pointer">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={addHasPoolEnclosure}
                                                                            onChange={(e) => setAddHasPoolEnclosure(e.target.checked)}
                                                                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                                        />
                                                                        <span className="text-sm text-slate-700 font-medium">
                                                                            {isEn ? "Is there a pool enclosure?" : "Y a-t-il un abri de piscine ?"}
                                                                        </span>
                                                                    </label>
                                                                </div>
                                                            )}

                                                            {/* Fence/Gate footprint */}
                                                            {addOutdoorLayout === "fence_gate" && (
                                                                <div className="space-y-1">
                                                                    <label className="text-xs font-semibold text-slate-600">
                                                                        {isEn ? "Footprint (m²)" : "Emprise au sol (m²)"}
                                                                    </label>
                                                                    <input
                                                                        type="number"
                                                                        value={addFootprint || ""}
                                                                        onChange={(e) => setAddFootprint(Number(e.target.value))}
                                                                        className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                                                        placeholder="Ex: 10"
                                                                        min={0}
                                                                    />
                                                                </div>
                                                            )}
                                                        </>
                                                    )}

                                                    {/* === New construction & Work on existing: shared levels + footprint + floor area === */}
                                                    {addNature !== "outdoor" && (
                                                        <>
                                                            {/* Levels */}
                                                            <div className="space-y-3">
                                                                <label className="text-sm text-slate-600">
                                                                    {isEn ? "Number of levels" : "Nombre de niveaux"}
                                                                </label>
                                                                <div className="flex flex-wrap gap-2">
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
                                                                                "px-4 py-2 rounded-full text-sm font-medium border transition-all",
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
                                                                    <label className="text-sm text-slate-600">
                                                                        {isEn ? "Footprint (m²)" : "Emprise au sol (m²)"}
                                                                    </label>
                                                                    <input
                                                                        type="number"
                                                                        value={addFootprint || ""}
                                                                        onChange={(e) => setAddFootprint(Number(e.target.value))}
                                                                        className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                                                        placeholder="Ex: 22"
                                                                        min={0}
                                                                    />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <label className="text-sm text-slate-600 flex items-center gap-1">
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
                                                                                ? `Automatic calculation: (0.90 × Footprint × Levels) - Hoppers. Modifiable.`
                                                                                : `Calcul automatique : (0.90 × Emprise × Niveaux) - Trémies. Modifiable.`}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </>
                                                    )}

                                                    {/* Add to folder button */}
                                                    <button
                                                        type="button"
                                                        disabled={
                                                            addNature === "outdoor"
                                                                ? (addOutdoorLayout === "pool" ? addPoolSurfaceArea <= 0 : addFootprint <= 0)
                                                                : addFootprint <= 0
                                                        }
                                                        onClick={handleAddJob}
                                                        className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-40 hover:bg-indigo-700 transition-all text-sm"
                                                    >
                                                        {isEn ? "Add to folder" : "Ajouter au dossier"}
                                                    </button>
                                                    <div className="text-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowAddJob(false)}
                                                            className="text-xs text-slate-400 hover:text-slate-600 underline"
                                                        >
                                                            {isEn ? "Cancel" : "Annuler"}
                                                        </button>
                                                    </div>
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

                                        <div className="flex items-center justify-between pt-4">
                                            <button
                                                type="button"
                                                onClick={() => setStep(1)}
                                                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors font-medium"
                                            >
                                                {isEn ? "← Back" : "← Retour"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setStep(3)}
                                                disabled={jobs.length === 0}
                                                className="flex items-center gap-2 px-8 py-3 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-40 hover:bg-indigo-700 transition-all shadow-sm"
                                            >
                                                {isEn ? "Next: Materials" : "Suivant : Matériaux"} <ArrowRight className="w-4 h-4" />
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

                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-base font-bold text-slate-900">
                                                    {isEn ? "3. Details of the work and materials" : "3. Détail des ouvrages et matériaux"}
                                                </h3>
                                                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                                                    {isEn ? "CERFA SECTION" : "SECTION CERFA"}
                                                </span>
                                            </div>

                                            <p className="text-sm text-slate-500">
                                                {isEn
                                                    ? "Specify the materials and colors for each visible element. This information is mandatory and is included in the application notice."
                                                    : "Précisez les matériaux et coloris de chaque élément visible. Cette information est obligatoire et figure dans la notice descriptive."}
                                            </p>

                                            {/* ── Section 1: Standing Building (Exterior) ── */}
                                            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-base">🏗️</span>
                                                    <p className="text-sm font-bold text-slate-800">
                                                        {isEn ? "Standing Building (Exterior)" : "Gros œuvre (Extérieur)"}
                                                    </p>
                                                    <span className="ml-auto text-[10px] font-semibold text-slate-400 uppercase">CERFA</span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <label className="text-xs text-slate-500">{isEn ? "Material" : "Matériau"}</label>
                                                        <input type="text" value={matExtMaterial} onChange={e => setMatExtMaterial(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Breeze blocks, bricks, reinforced-wall / tiles..." : "Parpaings, briques, pré-mur / tuiles..."} />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs text-slate-500">{isEn ? "Color" : "Coloris"}</label>
                                                        <input type="text" value={matExtColor} onChange={e => setMatExtColor(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Ex: Basque Red / reinforced wall / tiles" : "Ex: Rouge basque / pré-mur / tuiles"} />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* ── Section 2: Roof ── */}
                                            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-base">🏠</span>
                                                    <p className="text-sm font-bold text-slate-800">{isEn ? "Roof" : "Toiture"}</p>
                                                    <span className="ml-auto text-[10px] font-semibold text-slate-400 uppercase">CERFA</span>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs text-slate-500">{isEn ? "Type" : "Type"}</label>
                                                    <select value={roofType} onChange={e => setRoofType(e.target.value as typeof roofType)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
                                                        <option value="">{isEn ? "Select..." : "Sélectionner..."}</option>
                                                        <option value="flat">{isEn ? "Flat roof / Terrance" : "Toiture plate / Terrasse"}</option>
                                                        <option value="dual_pitch">{isEn ? "Dual pitch" : "Deux pentes"}</option>
                                                        <option value="single_pitch">{isEn ? "Single pitch" : "Une pente"}</option>
                                                    </select>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <label className="text-xs text-slate-500">{isEn ? "Covering / Roofing" : "Couverture / Étanchéité"}</label>
                                                        <input type="text" value={roofCovering} onChange={e => setRoofCovering(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Ex: Canal tiles, CLT, Slates" : "Ex: Tuiles canal, CLT, Ardoises"} />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs text-slate-500">{isEn ? "Color" : "Coloris"}</label>
                                                        <input type="text" value={roofColor} onChange={e => setRoofColor(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Ex: Basque Red / Anthracite" : "Ex: Rouge basque / Anthracite"} />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* ── Section 3: Non-independent Construction ── */}
                                            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-base">🏗</span>
                                                    <p className="text-sm font-bold text-slate-800">{isEn ? "Non-independent Construction" : "Construction non indépendante"}</p>
                                                    <span className="ml-auto text-[10px] font-semibold text-slate-400 uppercase">CERFA</span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <label className="text-xs text-slate-500">{isEn ? "Roof" : "Toiture"}</label>
                                                        <select value={roofMaterial} onChange={e => setRoofMaterial(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
                                                            <option value="">{isEn ? "Select..." : "Sélectionner..."}</option>
                                                            <option value="tiles">{isEn ? "Tiles" : "Tuiles"}</option>
                                                            <option value="slate">{isEn ? "Slate" : "Ardoises"}</option>
                                                            <option value="metal">{isEn ? "Metal sheet" : "Bac acier"}</option>
                                                            <option value="flat">{isEn ? "Flat (EPDM/bitumen)" : "Plate (EPDM/bitume)"}</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* ── Section 4: Wall(s) ── */}
                                            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-base">🧱</span>
                                                    <p className="text-sm font-bold text-slate-800">{isEn ? "Wall(s)" : "Mur(s)"}</p>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <label className="text-xs text-slate-500">{isEn ? "Material" : "Matériau"}</label>
                                                        <input type="text" value={wallMaterial} onChange={e => setWallMaterial(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Ex: Plaster, Brick, Wood..." : "Ex: Enduit, Briques, Bois..."} />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs text-slate-500">{isEn ? "Color" : "Coloris"}</label>
                                                        <input type="text" value={wallColor} onChange={e => setWallColor(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Ex: White, Beige..." : "Ex: Blanc, Beige..."} />
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-xs text-slate-500">{isEn ? "Type" : "Type"}</label>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {(isEn
                                                            ? ["Rendered", "Smooth", "Scraped", "Stone", "Cladding", "Composite"]
                                                            : ["Enduit", "Lisse", "Gratté", "Pierre", "Bardage", "Composite"]
                                                        ).map(t => (
                                                            <button key={t} type="button" onClick={() => setWallType(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])} className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-all", wallType.includes(t) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50")}>{t}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <p className="text-[10px] text-indigo-500 cursor-pointer hover:underline">+ {isEn ? "Add one type of surfing" : "Ajouter un type de surfaçage"}</p>
                                            </div>

                                            {/* ── Section 5: Gutters and Downspouts ── */}
                                            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-base">🪥</span>
                                                    <p className="text-sm font-bold text-slate-800">{isEn ? "Gutters and Downspouts" : "Gouttières et descentes"}</p>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <label className="text-xs text-slate-500">{isEn ? "Material" : "Matériau"}</label>
                                                        <input type="text" value={gutterMaterial} onChange={e => setGutterMaterial(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Ex: Zinc, PVC, Aluminium..." : "Ex: Zinc, PVC, Aluminium..."} />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs text-slate-500">{isEn ? "Color" : "Coloris"}</label>
                                                        <input type="text" value={gutterColor} onChange={e => setGutterColor(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Ex: Zinc Grey" : "Ex: Gris zinc"} />
                                                    </div>
                                                </div>
                                                <p className="text-[10px] text-indigo-500 cursor-pointer hover:underline">+ {isEn ? "Add one type of surfing" : "Ajouter un type de surfaçage"}</p>
                                            </div>

                                            {/* ── Section 6: Surfaces and Coverings ── */}
                                            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-base">🪟</span>
                                                    <p className="text-sm font-bold text-slate-800">{isEn ? "Surfaces and Coverings" : "Surfaces et revêtements"}</p>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <label className="text-xs text-slate-500">{isEn ? "Covering for: all surfaces" : "Revêtement de : toutes surfaces"}</label>
                                                        <input type="text" value={surfaceMaterial} onChange={e => setSurfaceMaterial(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Ex: Porcelain Stoneware" : "Ex: Grès cérame"} />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs text-slate-500">{isEn ? "Flooring Features: (or others)" : "Caractéristiques de sol : (ou autres)"}</label>
                                                        <input type="text" value={surfaceColor} onChange={e => setSurfaceColor(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-xs text-slate-500">{isEn ? "Type" : "Type"}</label>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {(isEn
                                                            ? ["Terracotta", "Concrete", "Natural Stone", "Wood", "Composite"]
                                                            : ["Terre cuite", "Béton", "Pierre naturelle", "Bois", "Composite"]
                                                        ).map(t => (
                                                            <button key={t} type="button" onClick={() => setSurfaceType(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])} className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-all", surfaceType.includes(t) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50")}>{t}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <p className="text-[10px] text-indigo-500 cursor-pointer hover:underline">+ {isEn ? "Add one type" : "Ajouter un type"}</p>
                                            </div>

                                            {/* ── Section 7: Fencing ── */}
                                            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-base">🚧</span>
                                                    <p className="text-sm font-bold text-slate-800">{isEn ? "Fencing" : "Clôture"}</p>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <label className="text-xs text-slate-500">{isEn ? "Material" : "Matériau"}</label>
                                                        <input type="text" value={fenceMaterial} onChange={e => setFenceMaterial(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder="..." />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs text-slate-500">{isEn ? "Color" : "Coloris"}</label>
                                                        <input type="text" value={fenceColor} onChange={e => setFenceColor(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder="..." />
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-xs text-slate-500">{isEn ? "Type" : "Type"}</label>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {(isEn
                                                            ? ["Welded Mesh", "Flat Bars", "PVC", "Wooden", "Aluminium"]
                                                            : ["Panneaux soudés", "Barreaux plats", "PVC", "Bois", "Aluminium"]
                                                        ).map(t => (
                                                            <button key={t} type="button" onClick={() => setFenceType(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])} className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-all", fenceType.includes(t) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50")}>{t}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <p className="text-[10px] text-indigo-500 cursor-pointer hover:underline">+ {isEn ? "Add one type of finish" : "Ajouter un type de finition"}</p>
                                            </div>

                                            {/* ── Section 8: Joinery & Blinds ── */}
                                            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-base">🚪</span>
                                                    <p className="text-sm font-bold text-slate-800">{isEn ? "Joinery & Blinds" : "Menuiserie & Volets"}</p>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <label className="text-xs text-slate-500">{isEn ? "Material" : "Matériau"}</label>
                                                        <input type="text" value={joineryMaterial} onChange={e => setJoineryMaterial(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Ex: Aluminium, PVC, Wood" : "Ex: Aluminium, PVC, Bois"} />
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-xs text-slate-500">{isEn ? "Type" : "Type"}</label>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {(isEn
                                                            ? ["Shutter Blinds", "Hinged Shutters", "Accordion Shutters", "Folding Shutters", "Sliding Shutters"]
                                                            : ["Volets roulants", "Volets battants", "Persiennes", "Volets pliants", "Volets coulissants"]
                                                        ).map(t => (
                                                            <button key={t} type="button" onClick={() => setJoineryType(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])} className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-all", joineryType.includes(t) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50")}>{t}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <p className="text-[10px] text-indigo-500 cursor-pointer hover:underline">+ {isEn ? "Add one type of finish" : "Ajouter un type de finition"}</p>
                                            </div>

                                            {/* ── Section 9: Exterior (Additions) ── */}
                                            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-base">🏡</span>
                                                    <p className="text-sm font-bold text-slate-800">{isEn ? "Exterior (Additions)" : "Extérieur (Ajouts)"}</p>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs text-slate-500">{isEn ? "Roofing" : "Couverture"}</label>
                                                    <select value={extRoofing} onChange={e => setExtRoofing(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
                                                        <option value="">{isEn ? "Select..." : "Sélectionner..."}</option>
                                                        <option value="tiles">{isEn ? "Tiles" : "Tuiles"}</option>
                                                        <option value="metal">{isEn ? "Metal sheet" : "Bac acier"}</option>
                                                        <option value="flat">{isEn ? "EPDM / Bitumen" : "EPDM / Bitume"}</option>
                                                        <option value="polycarbonate">{isEn ? "Polycarbonate" : "Polycarbonate"}</option>
                                                    </select>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <label className="text-xs text-slate-500">{isEn ? "Aluminium (Zinc RAL)" : "Aluminium (Zinc RAL)"}</label>
                                                        <input type="text" value={surface2Material} onChange={e => setSurface2Material(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Ex: RAL 7016" : "Ex: RAL 7016"} />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs text-slate-500">{isEn ? "Color" : "Coloris"}</label>
                                                        <input type="text" value={surface2Color} onChange={e => setSurface2Color(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Window Grilles" : "Grilles de fenêtre"} />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* ── Section 10: Trimmings ── */}
                                            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-base">✨</span>
                                                    <p className="text-sm font-bold text-slate-800">{isEn ? "Trimmings" : "Finitions"}</p>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <label className="text-xs text-slate-500">{isEn ? "Material (Tin, Zinc, Alum...)" : "Matériau (Zinc, Alu…)"}</label>
                                                        <input type="text" value={trimMaterial} onChange={e => setTrimMaterial(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Ex: Galvanized steel" : "Ex: Acier galvanisé"} />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs text-slate-500">{isEn ? "Color" : "Coloris"}</label>
                                                        <input type="text" value={trimColor} onChange={e => setTrimColor(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Ex: RAL 7016" : "Ex: RAL 7016"} />
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-xs text-slate-500">{isEn ? "Type" : "Type"}</label>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {(isEn
                                                            ? ["Hat coping", "Capping", "Cover plate", "Gutter", "Glazed"]
                                                            : ["Chaperon", "Couvertine", "Bavette", "Gouttière", "Vitré"]
                                                        ).map(t => (
                                                            <button key={t} type="button" onClick={() => setTrimType(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])} className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-all", trimType.includes(t) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50")}>{t}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <p className="text-[10px] text-indigo-500 cursor-pointer hover:underline">+ {isEn ? "Add one type of cladding" : "Ajouter un type de bardage"}</p>
                                            </div>

                                            {/* ── Section 11: Joinery & Blinds 2 ── */}
                                            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-base">🚪</span>
                                                    <p className="text-sm font-bold text-slate-800">{isEn ? "Joinery & Blinds" : "Menuiserie & Volets"}</p>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <label className="text-xs text-slate-500">{isEn ? "Other blinds (RAL)" : "Autres volets (RAL)"}</label>
                                                        <input type="text" value={joinery2Material} onChange={e => setJoinery2Material(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Ex: RAL 7016, Anthracite" : "Ex: RAL 7016, Anthracite"} />
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-xs text-slate-500">{isEn ? "Type" : "Type"}</label>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {(isEn
                                                            ? ["Integrated roller shutter", "Motorised Shutter", "Window Shade / Curtain"]
                                                            : ["Volet roulant intégré", "Brise-soleil", "Store banne"]
                                                        ).map(t => (
                                                            <button key={t} type="button" onClick={() => setJoinery2Type(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])} className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-all", joinery2Type.includes(t) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50")}>{t}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <p className="text-[10px] text-indigo-500 cursor-pointer hover:underline">+ {isEn ? "Add one type of cladding" : "Ajouter un type de bardage"}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between pt-2">
                                            <button
                                                type="button"
                                                onClick={() => setStep(2)}
                                                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors font-medium"
                                            >
                                                {isEn ? "← Back" : "← Retour"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setStep(4)}
                                                className="flex items-center gap-2 px-8 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-all shadow-sm"
                                            >
                                                {isEn ? "Next: Applicant" : "Suivant : Demandeur"} <ArrowRight className="w-4 h-4" />
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

                                        <div className="rounded-xl border border-slate-200 p-5 space-y-5">
                                            <div>
                                                <h3 className="text-base font-bold text-slate-900">
                                                    {isEn ? "4. Applicant Information" : "4. Informations du demandeur"}
                                                </h3>
                                                <p className="text-sm text-slate-500 mt-1">
                                                    {isEn
                                                        ? "This information is needed for the automatic filling of the CERFA form."
                                                        : "Ces informations sont nécessaires pour le remplissage automatique du formulaire CERFA."}
                                                </p>
                                            </div>

                                            {/* Name + First name */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-sm font-semibold text-slate-700">
                                                        {isEn ? "Name (Usage or Birth)" : "Nom (d'usage ou de naissance)"}
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={applicantName}
                                                        onChange={e => setApplicantName(e.target.value)}
                                                        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm"
                                                        placeholder={isEn ? "Example: DUPONT" : "Exemple : DUPONT"}
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-sm font-semibold text-slate-700">
                                                        {isEn ? "First name(s)" : "Prénom(s)"}
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={applicantFirstNames}
                                                        onChange={e => setApplicantFirstNames(e.target.value)}
                                                        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm"
                                                        placeholder={isEn ? "Example: John, Peter" : "Exemple : Jean, Pierre"}
                                                    />
                                                </div>
                                            </div>

                                            {/* Date of birth, City, Department */}
                                            <div className="grid grid-cols-3 gap-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-sm font-semibold text-slate-700">
                                                        {isEn ? "Date of birth" : "Date de naissance"}
                                                    </label>
                                                    <input
                                                        type="date"
                                                        value={applicantDob}
                                                        onChange={e => setApplicantDob(e.target.value)}
                                                        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm"
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-sm font-semibold text-slate-700">
                                                        {isEn ? "City of birth" : "Commune de naissance"}
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={applicantCityOfBirth}
                                                        onChange={e => setApplicantCityOfBirth(e.target.value)}
                                                        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm"
                                                        placeholder={isEn ? "Example: Paris" : "Exemple : Paris"}
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-sm font-semibold text-slate-700">
                                                        {isEn ? "Department (No.)" : "Département (N°)"}
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={applicantDepartment}
                                                        onChange={e => setApplicantDepartment(e.target.value)}
                                                        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm"
                                                        placeholder={isEn ? "Example: 75" : "Exemple : 75"}
                                                    />
                                                </div>
                                            </div>

                                            {/* Type of Residence + Funding */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-sm font-semibold text-slate-700">
                                                        {isEn ? "Type of Residence" : "Type de résidence"}
                                                    </label>
                                                    <select
                                                        value={applicantResidenceType}
                                                        onChange={e => setApplicantResidenceType(e.target.value)}
                                                        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm bg-white"
                                                    >
                                                        <option value="primary">{isEn ? "Primary Residence" : "Résidence principale"}</option>
                                                        <option value="secondary">{isEn ? "Secondary Residence" : "Résidence secondaire"}</option>
                                                        <option value="rental">{isEn ? "Rental Property" : "Investissement locatif"}</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-sm font-semibold text-slate-700">
                                                        {isEn ? "Funding" : "Financement"}
                                                    </label>
                                                    <select
                                                        value={applicantFunding}
                                                        onChange={e => setApplicantFunding(e.target.value)}
                                                        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm bg-white"
                                                    >
                                                        <option value="equity">{isEn ? "Equity / Traditional Loan" : "Apport / Prêt classique"}</option>
                                                        <option value="ptz">{isEn ? "Zero-rate Loan (PTZ)" : "Prêt à taux zéro (PTZ)"}</option>
                                                        <option value="social">{isEn ? "Social Loan" : "Prêt social"}</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between pt-2">
                                            <button
                                                type="button"
                                                onClick={() => setStep(3)}
                                                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors font-medium"
                                            >
                                                {isEn ? "← Back" : "← Retour"}
                                            </button>
                                            <div className="flex items-center gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPreviewModal(true)}
                                                    className="flex items-center gap-2 px-5 py-3 rounded-xl border-2 border-indigo-500 text-indigo-600 font-semibold hover:bg-indigo-50 transition-all text-sm"
                                                >
                                                    <FileText className="w-4 h-4" />
                                                    {isEn ? "Preview the Notice" : "Aperçu de la notice"}
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={saving}
                                                    onClick={handleFinish}
                                                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-green-600 text-white font-semibold disabled:opacity-40 hover:bg-green-700 transition-all shadow-sm text-sm"
                                                >
                                                    {saving ? (
                                                        <><Loader2 className="w-4 h-4 animate-spin" /> {isEn ? "Saving…" : "Enregistrement…"}</>
                                                    ) : (
                                                        <><Check className="w-4 h-4" /> {isEn ? "Confirm the description" : "Valider la description"}</>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ══ STEP 5: PLU Regulation Analysis ══ */}
                                {step === 5 && (
                                    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-sm">
                                        <div className="flex items-center gap-2">
                                            <Check className="w-5 h-5 text-green-500" />
                                            <h2 className="text-xl font-bold text-slate-900">
                                                {isEn ? "2. Regulation Analysis (PLU)" : "2. Analyse de la réglementation (PLU)"}
                                            </h2>
                                        </div>
                                        <p className="text-sm text-slate-500">
                                            {isEn
                                                ? "Verification of your project's compliance with local urban planning rules."
                                                : "Vérification de la conformité de votre projet aux règles d'urbanisme locales."}
                                        </p>

                                        {/* Zone cards */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/30 p-4">
                                                <div className="flex items-center justify-between mb-2">
                                                    <h3 className="text-sm font-bold text-slate-900 uppercase">
                                                        {isEn ? "PLU ZONE DETECTED" : "ZONE PLU DÉTECTÉE"}
                                                    </h3>
                                                    <span className="text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
                                                        {isEn ? "Urban Zone (U)" : "Zone Urbaine (U)"}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-500 mt-1">
                                                    {isEn
                                                        ? "Dense zone generally allowing extensions up to 40m² under conditions."
                                                        : "Zone dense permettant généralement des extensions jusqu'à 40m² sous conditions."}
                                                </p>
                                                <button className="text-xs text-indigo-600 font-semibold mt-2 hover:underline">
                                                    {isEn ? "Edit manually" : "Modifier manuellement"}
                                                </button>
                                            </div>
                                            <div className="rounded-xl border-2 border-amber-200 bg-amber-50/30 p-4">
                                                <div className="flex items-center justify-between mb-2">
                                                    <h3 className="text-sm font-bold text-slate-900 uppercase">
                                                        {isEn ? "HERITAGE PROTECTION" : "PROTECTION PATRIMOINE"}
                                                    </h3>
                                                    <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                                                        {isEn ? "No easement" : "Aucune servitude"}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-500 mt-1">
                                                    {isEn
                                                        ? "No specific heritage constraint detected on the plot."
                                                        : "Pas de contrainte patrimoniale spécifique détectée sur la parcelle."}
                                                </p>
                                            </div>
                                        </div>

                                        {/* PLU Document Upload */}
                                        <div>
                                            <h3 className="text-sm font-bold text-slate-900 mb-3">
                                                {isEn ? "PLU Document (Optional)" : "Document du PLU (Facultatif)"}
                                            </h3>
                                            <div
                                                className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-indigo-400 transition-colors cursor-pointer"
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    if (e.dataTransfer.files[0]) setPluFile(e.dataTransfer.files[0]);
                                                }}
                                                onClick={() => {
                                                    const input = document.createElement("input");
                                                    input.type = "file";
                                                    input.accept = ".pdf";
                                                    input.onchange = (e) => {
                                                        const f = (e.target as HTMLInputElement).files?.[0];
                                                        if (f) setPluFile(f);
                                                    };
                                                    input.click();
                                                }}
                                            >
                                                <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                                                <p className="text-sm font-semibold text-slate-600">
                                                    {pluFile
                                                        ? pluFile.name
                                                        : isEn ? "Drop the regulation PDF here" : "Glisser le PDF du règlement ici"}
                                                </p>
                                                <p className="text-xs text-slate-400 mt-1">
                                                    {isEn
                                                        ? "AI will analyze this document to refine compliance."
                                                        : "L'IA analysera ce document pour affiner la conformité."}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Launch Analysis Button */}
                                        <div className="flex justify-center pt-2">
                                            <button
                                                type="button"
                                                onClick={handleStartAnalysis}
                                                className="flex items-center gap-2 px-8 py-4 rounded-xl bg-indigo-600 text-white font-bold text-base hover:bg-indigo-700 transition-all shadow-lg hover:shadow-xl"
                                            >
                                                <FileText className="w-5 h-5" />
                                                {isEn ? "Launch Compliance Analysis" : "Lancer l'analyse de conformité"}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* ══ STEP 6: Analysis Results ══ */}
                                {step === 6 && (
                                    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-sm">
                                        {/* Re-show the zone cards in compact form */}
                                        <div className="flex items-center gap-2">
                                            <Check className="w-5 h-5 text-green-500" />
                                            <h2 className="text-xl font-bold text-slate-900">
                                                {isEn ? "2. Regulation Analysis (PLU)" : "2. Analyse de la réglementation (PLU)"}
                                            </h2>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/30 p-4">
                                                <div className="flex items-center justify-between mb-1">
                                                    <h3 className="text-sm font-bold text-slate-900 uppercase">
                                                        {isEn ? "PLU ZONE DETECTED" : "ZONE PLU DÉTECTÉE"}
                                                    </h3>
                                                    <span className="text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
                                                        {isEn ? "Urban Zone (U)" : "Zone Urbaine (U)"}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-500">
                                                    {isEn ? "Dense zone allowing extensions up to 40m²." : "Zone dense permettant des extensions jusqu'à 40m²."}
                                                </p>
                                            </div>
                                            <div className="rounded-xl border-2 border-amber-200 bg-amber-50/30 p-4">
                                                <div className="flex items-center justify-between mb-1">
                                                    <h3 className="text-sm font-bold text-slate-900 uppercase">
                                                        {isEn ? "HERITAGE PROTECTION" : "PROTECTION PATRIMOINE"}
                                                    </h3>
                                                    <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                                                        {isEn ? "No easement" : "Aucune servitude"}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Conformity Results */}
                                        <div className="rounded-xl border border-green-200 bg-green-50/50 p-5 space-y-4">
                                            <div className="flex items-center gap-2">
                                                <Check className="w-6 h-6 text-green-600" />
                                                <div>
                                                    <h3 className="text-lg font-bold text-slate-900">
                                                        {isEn ? "Project Compliant" : "Projet Conforme"}
                                                    </h3>
                                                    <p className="text-sm text-slate-500">
                                                        {isEn
                                                            ? "The analysis revealed no major blocking issue."
                                                            : "L'analyse n'a révélé aucun point bloquant majeur."}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="space-y-3 ml-1">
                                                <div className="flex items-start gap-2.5">
                                                    <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-900">
                                                            {isEn ? "Ground Coverage (CES)" : "Emprise au sol (CES)"}
                                                        </p>
                                                        <p className="text-xs text-slate-500">
                                                            {isEn
                                                                ? "The total footprint remains below the authorized maximum of 40% (Article 9)."
                                                                : "L'emprise totale reste inférieure au maximum autorisé de 40% (Article 9)."}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-start gap-2.5">
                                                    <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-900">
                                                            {isEn ? "Building Height" : "Hauteur des constructions"}
                                                        </p>
                                                        <p className="text-xs text-slate-500">
                                                            {isEn
                                                                ? "Height compliant with respect to boundary setbacks (Article 10)."
                                                                : "Hauteur respectée par rapport aux limites séparatives (Article 10)."}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-start gap-2.5">
                                                    <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-900">
                                                            {isEn ? "Exterior Appearance" : "Aspect extérieur"}
                                                        </p>
                                                        <p className="text-xs text-slate-500">
                                                            {isEn
                                                                ? "Declared materials are authorized in this zone (Article 11)."
                                                                : "Les matériaux déclarés sont autorisés dans cette zone (Article 11)."}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Go to 3D */}
                                        <div className="flex justify-end pt-2">
                                            <button
                                                type="button"
                                                onClick={() => setStep(7)}
                                                className="text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                                            >
                                                {isEn ? "Go to 3D Design →" : "Passer à la conception 3D →"}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* ══ STEP 7: Conception 3D ══ */}
                                {step === 7 && (
                                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                                        <div className="flex flex-col items-center justify-center py-16 space-y-6">
                                            <div className="relative">
                                                <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center">
                                                    <Box className="w-8 h-8 text-indigo-500" />
                                                </div>
                                                {designValidated && (
                                                    <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shadow-md animate-bounce">
                                                        <Check className="w-3.5 h-3.5 text-white" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-center">
                                                <h2 className="text-2xl font-bold text-slate-900 mb-2">
                                                    {isEn ? "3D Design" : "Conception 3D"}
                                                </h2>
                                                <p className="text-sm text-slate-500 max-w-sm mx-auto">
                                                    {isEn
                                                        ? "The satellite drawing interface would be loaded here."
                                                        : "L'interface de dessin sur plan satellite serait chargée ici."}
                                                </p>
                                            </div>
                                            {designValidated ? (
                                                <div className="flex items-center gap-2 px-6 py-3 rounded-xl bg-green-100 text-green-700 font-bold text-base">
                                                    <Check className="w-5 h-5" />
                                                    {isEn ? "Design Validated" : "Conception Validée"}
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={handleValidateDesign}
                                                    className="flex items-center gap-2 px-8 py-4 rounded-xl bg-indigo-600 text-white font-bold text-base hover:bg-indigo-700 transition-all shadow-lg"
                                                >
                                                    {isEn ? "Simulate: Validate Design" : "Simuler : Valider la conception"}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* ══ STEP 8: Complete File / Dossier Complet ══ */}
                                {step === 8 && (
                                    <div className="space-y-0">

                                        {/* Full-width two panel layout */}
                                        <div className="flex gap-4">
                                            {/* Left: Document grid */}
                                            <div className="w-[380px] shrink-0">
                                                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <h2 className="text-lg font-bold text-slate-900">
                                                            {isEn ? "File Ready" : "Dossier Prêt"}
                                                        </h2>
                                                        <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold uppercase">
                                                            {isEn ? "COMPLETED" : "TERMINÉ"}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-slate-500 mb-5">
                                                        {isEn
                                                            ? "All documents of your PC file have been generated. Select one to preview."
                                                            : "Toutes les pièces de votre dossier PC ont été générées. Sélectionnez un document pour le visualiser."}
                                                    </p>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        {[
                                                            { code: "PC1", label: isEn ? "Site plan" : "Plan de situation" },
                                                            { code: "PC2", label: isEn ? "Site layout" : "Plan de masse" },
                                                            { code: "PC3", label: isEn ? "Cross section" : "Plan de coupe" },
                                                            { code: "PC4", label: isEn ? "Descriptive notice" : "Notice descriptive", key: "PC4 / DPC 8-1" },
                                                            { code: "PC5.1", label: isEn ? "Facades (Initial)" : "Plan des façades (État initial)" },
                                                            { code: "PC5.2", label: isEn ? "Facades (Project)" : "Plan des façades (Projet)" },
                                                        ].map((doc) => {
                                                            const docKey = doc.key || doc.code;
                                                            const isSelected = selectedDoc === docKey;
                                                            return (
                                                                <button
                                                                    key={doc.code}
                                                                    type="button"
                                                                    onClick={() => setSelectedDoc(docKey)}
                                                                    className={cn(
                                                                        "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center hover:shadow-md",
                                                                        isSelected
                                                                            ? "border-indigo-500 bg-indigo-50 shadow-sm"
                                                                            : "border-slate-200 hover:border-slate-300"
                                                                    )}
                                                                >
                                                                    <div className={cn(
                                                                        "w-10 h-12 rounded-lg flex items-center justify-center",
                                                                        isSelected ? "bg-indigo-100" : "bg-slate-100"
                                                                    )}>
                                                                        <FileText className={cn(
                                                                            "w-5 h-5",
                                                                            isSelected ? "text-indigo-600" : "text-slate-400"
                                                                        )} />
                                                                    </div>
                                                                    <div>
                                                                        <p className={cn(
                                                                            "text-[10px] font-bold uppercase",
                                                                            isSelected ? "text-indigo-600" : "text-slate-400"
                                                                        )}>{doc.code}</p>
                                                                        <p className="text-xs font-medium text-slate-700 leading-tight">{doc.label}</p>
                                                                    </div>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Right: Document preview */}
                                            <div className="flex-1 min-w-0">
                                                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                                    {/* Preview header */}
                                                    <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                                                        <div className="flex items-center gap-2">
                                                            <FileText className="w-4 h-4 text-slate-500" />
                                                            <span className="text-sm font-semibold text-slate-700">
                                                                {selectedDoc === "PC4 / DPC 8-1"
                                                                    ? (isEn ? "PC4 - Descriptive Notice" : "PC4 - Notice descriptive")
                                                                    : selectedDoc}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => window.print()}
                                                                className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                                                            >
                                                                <Printer className="w-4 h-4 text-slate-500" />
                                                            </button>
                                                            <button className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                                                                <Download className="w-4 h-4 text-slate-500" />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Document content preview */}
                                                    {selectedDoc === "PC4 / DPC 8-1" ? (
                                                        <div className="p-6 max-h-[70vh] overflow-y-auto">
                                                            <div className="border border-slate-200 rounded-lg overflow-hidden shadow-inner">
                                                                {/* Document header */}
                                                                <div className="bg-white px-8 py-6 border-b-2 border-slate-900">
                                                                    <div className="flex items-start justify-between">
                                                                        <div>
                                                                            <h1 className="text-xl font-black text-slate-900 uppercase tracking-wide">
                                                                                {isEn ? "DESCRIPTIVE NOTICE (PC4)" : "NOTICE DESCRIPTIVE (PC4)"}
                                                                            </h1>
                                                                            <p className="text-xs text-slate-500 mt-1">
                                                                                {isEn ? "Automatically generated by Urbanist Simulator" : "Généré automatiquement par Urbassist Simulator"}
                                                                            </p>
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <p className="text-base font-bold text-slate-900">{projectName || "—"}</p>
                                                                            <p className="text-xs text-slate-500">Ref: {projectId.slice(0, 6)}</p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex justify-between mt-4 pt-3 border-t border-slate-200">
                                                                        <div>
                                                                            <p className="text-[10px] font-bold text-slate-400 uppercase">{isEn ? "APPLICANT" : "DEMANDEUR"}</p>
                                                                            <p className="text-sm font-semibold text-slate-900">{applicantName || "—"}</p>
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <p className="text-[10px] font-bold text-slate-400 uppercase">{isEn ? "DATE OF PUBLICATION" : "DATE D'ÉDITION"}</p>
                                                                            <p className="text-sm font-bold text-slate-900">{new Date().toLocaleDateString(isEn ? "en-US" : "fr-FR")}</p>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Section 1 */}
                                                                <div className="px-8 py-4 border-b border-slate-100">
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                        <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">1</span>
                                                                        <h2 className="text-xs font-black text-slate-900 uppercase">{isEn ? "INITIAL STATE OF THE LAND AND ITS SURROUNDINGS" : "ÉTAT INITIAL DU TERRAIN ET SES ABORDS"}</h2>
                                                                    </div>
                                                                    <p className="text-xs text-slate-600 leading-relaxed">
                                                                        {isEn
                                                                            ? `The land on which we are planning the work is located at ${projectAddress || "[address missing]"}. The land is situated in an urban and residential area (Zone U) accessible via an existing public road. The plot has a relatively flat topography and is situated within an existing built-up area.`
                                                                            : `Le terrain sur lequel nous envisageons les travaux se situe au ${projectAddress || "[adresse manquante]"}. Le terrain se trouve dans une zone urbaine et pavillonnaire (Zone U) à laquelle on accède par la voie publique existante. La parcelle présente une topographie relativement plane et s'insère dans un tissu bâti existant.`}
                                                                    </p>
                                                                </div>

                                                                {/* Section 2 */}
                                                                <div className="px-8 py-4 border-b border-slate-100">
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                        <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">2</span>
                                                                        <h2 className="text-xs font-black text-slate-900 uppercase">{isEn ? "PROJECTED STATE" : "ÉTAT PROJETÉ"}</h2>
                                                                    </div>
                                                                    <p className="text-xs text-slate-600 leading-relaxed">
                                                                        {isEn
                                                                            ? "The proposed project does not involve any substantial alterations to the natural terrain, its surroundings, or its hydraulic features. The overall topography of the land will be preserved. Earthworks will be limited to what is strictly necessary for the foundations."
                                                                            : "Le projet implanté ne prévoit aucune modification substantielle du terrain naturel, de ses abords ainsi que de ses aménagements hydrauliques. La topographie globale du terrain sera conservée. Les travaux de terrassement seront limités au strict nécessaire."}
                                                                    </p>
                                                                </div>

                                                                {/* Section 3 */}
                                                                <div className="px-8 py-4 border-b border-slate-100">
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                        <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">3</span>
                                                                        <h2 className="text-xs font-black text-slate-900 uppercase">{isEn ? "LOCATION, ORGANIZATION, COMPOSITION AND VOLUME" : "IMPLANTATION, ORGANISATION, COMPOSITION ET VOLUME"}</h2>
                                                                    </div>
                                                                    <p className="text-xs text-slate-600 leading-relaxed">
                                                                        {isEn
                                                                            ? `The project was specifically designed with functionality and compliance. ${jobs.length > 0 ? `The new building will have a footprint of ${jobs[0]?.footprint || 0}m² over ${jobs[0]?.levels || 1} level(s).` : ""}`
                                                                            : `Le projet a été spécifiquement conçu pour la fonctionnalité et la conformité. ${jobs.length > 0 ? `Le nouveau bâtiment aura une emprise au sol de ${jobs[0]?.footprint || 0}m² sur ${jobs[0]?.levels || 1} niveau(x).` : ""}`}
                                                                    </p>
                                                                </div>

                                                                {/* Section 4 */}
                                                                <div className="px-8 py-4 border-b border-slate-100">
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                        <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">4</span>
                                                                        <h2 className="text-xs font-black text-slate-900 uppercase">{isEn ? "TREATMENT OF BUILDINGS, FENCES, VEGETATION" : "TRAITEMENT DES CONSTRUCTIONS, CLÔTURES, VÉGÉTATION"}</h2>
                                                                    </div>
                                                                    <p className="text-xs text-slate-600 leading-relaxed">
                                                                        {isEn
                                                                            ? "The perimeter of the plot, along the property lines, will remain as is. Open spaces will be maintained with vegetation."
                                                                            : "Le périmètre de la parcelle, le long des limites séparatives, restera en l'état. Les espaces ouverts seront maintenus avec de la végétation."}
                                                                    </p>
                                                                </div>

                                                                {/* Section 5 */}
                                                                <div className="px-8 py-4 border-b border-slate-100">
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                        <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">5</span>
                                                                        <h2 className="text-xs font-black text-slate-900 uppercase">{isEn ? "MATERIALS AND COLORS" : "MATÉRIAUX ET COULEURS"}</h2>
                                                                    </div>
                                                                    <div className="text-xs text-slate-600 leading-relaxed space-y-1">
                                                                        {matExtMaterial || wallMaterial || roofCovering ? (
                                                                            <>
                                                                                {wallMaterial && <p>• {isEn ? "Walls" : "Murs"}: {wallMaterial} ({wallColor || "—"})</p>}
                                                                                {roofCovering && <p>• {isEn ? "Roof" : "Toiture"}: {roofCovering} ({roofColor || "—"})</p>}
                                                                                {matExtMaterial && <p>• {isEn ? "Joinery" : "Menuiseries"}: {matExtMaterial} ({matExtColor || "—"})</p>}
                                                                            </>
                                                                        ) : (
                                                                            <p className="italic text-slate-400">{isEn ? "No materials specified yet." : "Aucun matériau spécifié."}</p>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Section 6 */}
                                                                <div className="px-8 py-4">
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                        <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">6</span>
                                                                        <h2 className="text-xs font-black text-slate-900 uppercase">{isEn ? "ACCESS AND PARKING" : "ACCÈS ET STATIONNEMENT"}</h2>
                                                                    </div>
                                                                    <p className="text-xs text-slate-600 leading-relaxed">
                                                                        {isEn
                                                                            ? "Access to the site will be via the existing entrance from the public road. Vehicle parking will continue to be available on the site."
                                                                            : "L'accès au site se fera par l'entrée existante depuis la voie publique. Le stationnement des véhicules continuera d'être disponible sur le site."}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        /* Placeholder for other documents */
                                                        <div className="flex flex-col items-center justify-center py-20 text-center">
                                                            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                                                                <FileText className="w-7 h-7 text-slate-400" />
                                                            </div>
                                                            <p className="text-sm font-semibold text-slate-700">{selectedDoc}</p>
                                                            <p className="text-xs text-slate-400 mt-1">
                                                                {isEn ? "Document preview will be generated here." : "L'aperçu du document sera généré ici."}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                    </div>
                                )}

                            </div>

                            {/* RIGHT: Administrative documents panel */}
                            {step !== 8 && (
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
                                            {ADMIN_DOCS.map((doc) => {
                                                const isReady = doc.unlocked || (doc.code === "PC4 / DPC 8-1" && step >= 5) || step >= 7;
                                                return (
                                                    <div key={doc.code} className={cn(
                                                        "px-4 py-3 flex items-center gap-3",
                                                        isReady && "bg-green-50/50 border-l-2 border-green-400"
                                                    )}>
                                                        <div className={cn(
                                                            "w-6 h-6 rounded-full flex items-center justify-center shrink-0",
                                                            isReady
                                                                ? "bg-emerald-100"
                                                                : "bg-slate-100"
                                                        )}>
                                                            {isReady ? (
                                                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                                            ) : (
                                                                <div className="w-2 h-2 rounded-full bg-slate-300" />
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[10px] font-bold text-slate-400 uppercase">{doc.code}</p>
                                                            <p className="text-xs font-medium text-slate-800 truncate">{doc.label}</p>
                                                        </div>
                                                        {isReady ? (
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-[10px] text-green-600 font-bold">
                                                                    {isEn ? "Ready" : "Prêt"}
                                                                </span>
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
                                                );
                                            })}
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
                            )}

                        </div>
                    </div>
                </div>
            </Navigation>

            {/* ══ PREVIEW NOTICE MODAL ══ */}
            {
                showPreviewModal && (
                    <div className="fixed inset-0 z-[9999] flex flex-col bg-slate-900/70 backdrop-blur-sm" style={{ zIndex: 9999 }}>
                        {/* Top bar */}
                        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white shrink-0 shadow-lg border-b border-slate-700">
                            <div className="flex items-center gap-2.5">
                                <FileText className="w-5 h-5 text-indigo-400" />
                                <span className="text-sm font-semibold">
                                    {isEn ? "Production Mode - Overview Notice" : "Mode Production - Aperçu de la notice"}
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => window.print()}
                                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-md"
                                >
                                    <Printer className="w-4 h-4" />
                                    Print / PDF
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowPreviewModal(false)}
                                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-500 text-slate-200 hover:bg-slate-700 hover:text-white transition-colors text-sm font-medium"
                                >
                                    Close
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Document body */}
                        <div className="flex-1 overflow-y-auto py-6 px-4">
                            <div className="max-w-[680px] mx-auto bg-white rounded-xl shadow-2xl overflow-hidden print:shadow-none">
                                {/* Header */}
                                <div className="bg-gradient-to-r from-slate-800 to-indigo-900 px-8 py-6">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h1 className="text-xl font-black text-white tracking-wide uppercase">
                                                {isEn ? "DESCRIPTIVE NOTICE (PC4)" : "NOTICE DESCRIPTIVE (PC4)"}
                                            </h1>
                                            <p className="text-xs text-indigo-300 mt-1">
                                                {isEn ? "Automatically generated by Urbanist Simulator" : "Généré automatiquement par Urbanist Simulator"}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-bold text-white">{projectName || "Project"}</p>
                                            <p className="text-xs text-indigo-300">Ref: {projectId.slice(-6)}</p>
                                        </div>
                                    </div>
                                    <div className="mt-4 flex items-center justify-between border-t border-white/20 pt-3">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">
                                                {isEn ? "APPLICANT" : "DEMANDEUR"}
                                            </p>
                                            <p className="text-sm text-white font-medium mt-0.5">
                                                {applicantName ? `${applicantName}${applicantFirstNames ? ` ${applicantFirstNames}` : ""}` : "—"}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">
                                                {isEn ? "PUBLICATION DATE" : "DATE DE PUBLICATION"}
                                            </p>
                                            <p className="text-lg font-bold text-white">
                                                {new Date().toLocaleDateString(isEn ? "en-US" : "fr-FR")}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Sections */}
                                <div className="px-8 py-6 space-y-7">
                                    {/* Section 1 */}
                                    <div>
                                        <div className="flex items-center gap-2.5 mb-3">
                                            <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">1</span>
                                            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                                                {isEn ? "INITIAL STATE OF THE LAND AND ITS SURROUNDINGS" : "ÉTAT INITIAL DU TERRAIN ET DE SES ABORDS"}
                                            </h2>
                                        </div>
                                        <p className="text-sm text-slate-600 leading-relaxed">
                                            {isEn
                                                ? `The land on which we are planning the work is located at ${projectAddress || "[address missing]"}. The land is situated in an urban and residential area (Zone U) accessible via an existing public road. The plot has a relatively flat topography and is situated within an existing built-up area.`
                                                : `Le terrain sur lequel sont projetés les travaux se situe au ${projectAddress || "[adresse manquante]"}. Le terrain est situé dans une zone urbaine et résidentielle (Zone U) accessible via une voie publique existante. La parcelle présente une topographie relativement plane et se situe dans une zone bâtie existante.`
                                            }
                                        </p>
                                    </div>

                                    {/* Section 2 */}
                                    <div>
                                        <div className="flex items-center gap-2.5 mb-3">
                                            <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">2</span>
                                            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                                                {isEn ? "PROJECTED STATE" : "ÉTAT PROJETÉ"}
                                            </h2>
                                        </div>
                                        <p className="text-sm text-slate-600 leading-relaxed">
                                            {isEn
                                                ? "The proposed project does not involve any substantial alterations to the natural terrain, its surroundings, or its hydraulic features. The overall topography of the land will be preserved. Earthworks will be limited to what is strictly necessary for the foundations of the buildings or extensions. The area surrounding the construction will be restored to its original condition after completion."
                                                : "Le projet proposé n'implique aucune altération substantielle du terrain naturel, de ses abords ou de ses caractéristiques hydrauliques. La topographie générale du terrain sera préservée. Les terrassements seront limités au strict nécessaire pour les fondations des bâtiments ou extensions. Les abords de la construction seront remis en état après achèvement des travaux."}
                                        </p>
                                    </div>

                                    {/* Section 3 */}
                                    <div>
                                        <div className="flex items-center gap-2.5 mb-3">
                                            <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">3</span>
                                            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                                                {isEn ? "LOCATION, ORGANIZATION, COMPOSITION AND VOLUME" : "IMPLANTATION, ORGANISATION, COMPOSITION ET VOLUME"}
                                            </h2>
                                        </div>
                                        <p className="text-sm text-slate-600 leading-relaxed">
                                            {(() => {
                                                const jobSummaries = jobs.map(j => {
                                                    const natureLabel = j.nature === "new_construction" ? (isEn ? "new, detached building" : "construction neuve détachée")
                                                        : j.nature === "existing_extension" ? (isEn ? "extension" : "extension")
                                                            : (isEn ? "outdoor layout" : "aménagement extérieur");
                                                    return isEn
                                                        ? `The ${natureLabel} will have a footprint of ${j.footprint}m² over ${j.levels} level${j.levels > 1 ? "s" : ""}. The planned ${natureLabel} will add ${j.floorAreaEstimated.toFixed(1)}m² of floor space and a footprint of ${j.footprint}m².`
                                                        : `La ${natureLabel} aura une emprise au sol de ${j.footprint}m² sur ${j.levels} niveau${j.levels > 1 ? "x" : ""}. L'extension prévue ajoutera ${j.floorAreaEstimated.toFixed(1)}m² de surface de plancher et une emprise de ${j.footprint}m².`;
                                                });
                                                const intro = isEn
                                                    ? "The project was specifically designed with functionality and compliance with current regulations in mind."
                                                    : "Le projet a été spécifiquement conçu dans un souci de fonctionnalité et de conformité avec la réglementation en vigueur.";
                                                const suffix = isEn
                                                    ? "It will be built adjacent to the existing structure, respecting regulatory setbacks. The design has been carefully considered to ensure harmonious integration with the surrounding built environment."
                                                    : "Il sera construit en tenant compte des retraits réglementaires. La conception a été soigneusement étudiée pour assurer une intégration harmonieuse avec l'environnement bâti environnant.";
                                                return `${intro} ${jobSummaries.join(" ")} ${suffix}`;
                                            })()}
                                        </p>
                                    </div>

                                    {/* Section 4 */}
                                    <div>
                                        <div className="flex items-center gap-2.5 mb-3">
                                            <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">4</span>
                                            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                                                {isEn ? "TREATMENT OF BUILDINGS, FENCES, VEGETATION" : "TRAITEMENT DES CONSTRUCTIONS, CLÔTURES, VÉGÉTATION"}
                                            </h2>
                                        </div>
                                        <p className="text-sm text-slate-600 leading-relaxed">
                                            {isEn
                                                ? "The perimeter of the plot, along the property lines and at the rear, will remain as is. Open spaces will be maintained with vegetation. No changes to the fences are planned."
                                                : "Le périmètre de la parcelle, le long des limites de propriété et en fond de parcelle, restera en l'état. Les espaces libres seront maintenus avec de la végétation. Aucune modification des clôtures n'est prévue."}
                                        </p>
                                    </div>

                                    {/* Section 5 */}
                                    <div>
                                        <div className="flex items-center gap-2.5 mb-3">
                                            <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">5</span>
                                            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                                                {isEn ? "MATERIALS AND COLORS" : "MATÉRIAUX ET COLORIS"}
                                            </h2>
                                        </div>
                                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                                            <p className="text-sm text-slate-600 leading-relaxed">
                                                {(() => {
                                                    const parts: string[] = [];
                                                    if (matExtMaterial || matExtColor) {
                                                        parts.push(isEn
                                                            ? `The facades will be treated with: ${matExtMaterial || "—"}, finish ${matExtColor || "—"}, color ${matExtColor || "—"}`
                                                            : `Les façades seront traitées avec : ${matExtMaterial || "—"}, finition ${matExtColor || "—"}, coloris ${matExtColor || "—"}`);
                                                    }
                                                    if (joineryMaterial) {
                                                        parts.push(isEn
                                                            ? `The exterior joinery will be in: ${joineryMaterial} ${trimColor || ""}`
                                                            : `Les menuiseries extérieures seront en : ${joineryMaterial} ${trimColor || ""}`);
                                                    }
                                                    if (roofCovering || roofColor) {
                                                        parts.push(isEn
                                                            ? `Roofing: ${roofCovering || "—"}, color ${roofColor || "—"}`
                                                            : `Toiture : ${roofCovering || "—"}, coloris ${roofColor || "—"}`);
                                                    }
                                                    if (gutterMaterial) {
                                                        parts.push(isEn ? `Gutters: ${gutterMaterial}` : `Gouttières : ${gutterMaterial}`);
                                                    }
                                                    return parts.length > 0 ? parts.join(". ") + "." : (isEn ? "No materials specified yet." : "Aucun matériau spécifié pour l'instant.");
                                                })()}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Section 6 */}
                                    <div>
                                        <div className="flex items-center gap-2.5 mb-3">
                                            <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">6</span>
                                            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                                                {isEn ? "ACCESS AND PARKING" : "ACCÈS ET STATIONNEMENT"}
                                            </h2>
                                        </div>
                                        <p className="text-sm text-slate-600 leading-relaxed">
                                            {isEn
                                                ? "Access to the site will be via the existing entrance from the public road. The project does not alter current access conditions. Vehicle parking will continue to be available on the site, with existing parking areas being maintained or redesigned as needed."
                                                : "L'accès au site se fera par l'entrée existante depuis la voie publique. Le projet ne modifie pas les conditions d'accès actuelles. Le stationnement des véhicules continuera d'être disponible sur le site, les aires de stationnement existantes étant maintenues ou réaménagées si nécessaire."}
                                        </p>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="px-8 py-4 border-t border-slate-100 text-center">
                                    <p className="text-xs text-indigo-400">
                                        {isEn
                                            ? `Document generated via Urbanist Proto v5.3 - urbassist.com - ${new Date().toLocaleDateString("en-US")}`
                                            : `Document généré via Urbanist Proto v5.3 - urbassist.com - ${new Date().toLocaleDateString("fr-FR")}`
                                        }
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            {/* ══ ANALYSIS PROGRESS MODAL ══ */}
            {showAnalysisModal && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" style={{ zIndex: 9999 }}>
                    <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center space-y-5">
                        <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mx-auto">
                            <FileText className="w-8 h-8 text-indigo-600" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900">
                            {isEn ? "Analysis in progress..." : "Analyse en cours..."}
                        </h3>
                        <p className="text-sm text-slate-500">
                            {isEn
                                ? "The AI is cross-referencing your project data with the simulated local PLU rules."
                                : "L'intelligence artificielle croise les données de votre projet avec les règles du PLU local simulé."}
                        </p>

                        {/* Progress bar */}
                        <div className="space-y-2">
                            <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                                <div
                                    className="h-full bg-indigo-600 rounded-full transition-all duration-300 ease-out"
                                    style={{ width: `${Math.min(analysisProgress, 100)}%` }}
                                />
                            </div>
                            <p className="text-xs text-slate-500">
                                {isEn ? "CES verification..." : "Vérification CES..."} {Math.min(Math.round(analysisProgress), 100)}%
                            </p>
                        </div>

                        {/* View Results button (appears when complete) */}
                        {analysisComplete && (
                            <button
                                type="button"
                                onClick={handleViewResults}
                                className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-bold text-base hover:bg-indigo-700 transition-colors shadow-md"
                            >
                                {isEn ? "View Results" : "Voir le résultat"}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ══ STICKY FINISH BAR (Step 8) ══ */}
            {step === 8 && (
                <div className="fixed bottom-0 left-0 right-0 z-[100] bg-white/90 backdrop-blur-xl border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
                    <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-sm">
                                <Check className="w-4.5 h-4.5 text-white" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-900">
                                    {isEn ? "Your file is ready!" : "Votre dossier est prêt !"}
                                </p>
                                <p className="text-xs text-slate-500">
                                    {isEn ? "All documents have been generated successfully" : "Tous les documents ont été générés avec succès"}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => router.push(`/projects/${projectId}/dashboard`)}
                            className="flex items-center gap-2.5 px-8 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/35 hover:-translate-y-0.5"
                        >
                            <Check className="w-4 h-4" />
                            {isEn ? "Finish & Go to Dashboard" : "Terminer & Tableau de bord"}
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
