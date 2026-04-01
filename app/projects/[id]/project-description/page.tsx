"use client";

import React, { useState, use, useEffect, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
    Pencil,
    Search,
    Sparkles,
    Ruler,
    Building2,
    Palette,
    TreePine,
    Car,
    Shield,
    Layers,
    ExternalLink,
    Cpu,
    Mountain,
    ChevronRight as ChevronRightIcon,
} from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import MaterialsStep from "@/components/project-description/MaterialsStep";
import PluDocumentManager from "@/components/project-description/PluDocumentManager";
import FeasibilityMatrix, { FeasibilityMatrixSkeleton } from "@/components/feasibility/FeasibilityMatrix";
import type { FeasibilityReport } from "@/lib/feasibility-matrix";
import { compileProjectBrief } from "@/lib/prompt-compiler";
import { cn } from "@/lib/utils";
import {
    calculateDpPc,
    estimateFloorAreaCreated,
    type ProjectTypeChoice,
    type SubmitterType,
} from "@/lib/dp-pc-calculator";
import { useUrbAssistProjectStore } from "@/store/useUrbAssistProjectStore";

// ─── Types ──────────────────────────────────────────────────────────────────

type WizardStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

type NatureType = "new_construction" | "existing_extension" | "outdoor";
type LevelCount = 1 | 2 | 3;
type WorkType = "extension" | "change_destination" | "change_exterior";
type OutdoorLayout = "pool" | "fence_gate" | "other";

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

// Per-job materials
interface RoofEntry { roofShape: string; mainMaterial: string; tint: string; soffitCladding: string; }
interface GutterEntry { material: string; tint: string; }
interface FacadeEntry { coating: string; finishing: string; tint: string; }
interface JoineryEntry { materials: string; shutters: string; }
interface JobMaterials {
    roofs: RoofEntry[];
    gutters: GutterEntry[];
    facades: FacadeEntry[];
    joineries: JoineryEntry[];
    // Change of destination specific
    workDescription?: string;
    facadeModification?: boolean;
    // Pool specific
    linerColor?: string;
    copingStones?: string;
    shelterMaterials?: string;
}

// ─── Document lists by authorization type ───────────────────────────────────

type DocEntry = { code: string; labelEn: string; labelFr: string; unlocked: boolean; photoType?: "near" | "far" };

const DP_DOCS: DocEntry[] = [
    { code: "DPC1", labelEn: "DPC1 - Site plan", labelFr: "DPC1 - Plan de situation", unlocked: true },
    { code: "DPC2", labelEn: "DPC2 - Site plan", labelFr: "DPC2 - Plan de masse", unlocked: false },
    { code: "DPC3", labelEn: "DPC3 - Cutting Plan", labelFr: "DPC3 - Plan de coupe", unlocked: false },
    { code: "DPC4", labelEn: "DPC4 - Plan of facades and roofs", labelFr: "DPC4 - Plan des façades et toitures", unlocked: false },
    { code: "DPC5", labelEn: "DPC5 - Representation of the external appearance", labelFr: "DPC5 - Représentation de l'aspect extérieur", unlocked: false },
    { code: "DPC6", labelEn: "DPC6 - Graphic document (3D landscape insertion)", labelFr: "DPC6 - Document graphique (insertion paysagère 3D)", unlocked: false },
    { code: "DPC7", labelEn: "DPC7 - Photography of the immediate environment", labelFr: "DPC7 - Photographie de l'environnement proche", unlocked: false, photoType: "near" },
    { code: "DPC8", labelEn: "DPC8 - Far Environment Photography", labelFr: "DPC8 - Photographie de l'environnement lointain", unlocked: false, photoType: "far" },
    { code: "DPC8-1", labelEn: "DPC8-1 - Product Description", labelFr: "DPC8-1 - Notice descriptive", unlocked: false },
    { code: "CERFA", labelEn: "Pre-filled CERFA form", labelFr: "Formulaire CERFA pré-rempli", unlocked: false },
];

const PC_DOCS: DocEntry[] = [
    { code: "PC1", labelEn: "PC1 - Site plan", labelFr: "PC1 - Plan de situation", unlocked: true },
    { code: "PC2", labelEn: "PC2 - Site layout plan", labelFr: "PC2 - Plan de masse", unlocked: false },
    { code: "PC3", labelEn: "PC3 - Cross-section plan", labelFr: "PC3 - Plan de coupe", unlocked: false },
    { code: "PC4", labelEn: "PC4 - Descriptive notice", labelFr: "PC4 - Notice descriptive", unlocked: false },
    { code: "PC5", labelEn: "PC5 - Facades and roofs plan", labelFr: "PC5 - Plan des façades et toitures", unlocked: false },
    { code: "PC6", labelEn: "PC6 - 3D landscape insertion", labelFr: "PC6 - Insertion paysagère 3D", unlocked: false },
    { code: "PC7", labelEn: "PC7 - Photography of the immediate environment", labelFr: "PC7 - Photographie de l'environnement proche", unlocked: false, photoType: "near" },
    { code: "PC8", labelEn: "PC8 - Far Environment Photography", labelFr: "PC8 - Photographie de l'environnement lointain", unlocked: false, photoType: "far" },
    { code: "PCMI", labelEn: "PCMI - Materials notice", labelFr: "PCMI - Notice matériaux", unlocked: false },
    { code: "CERFA", labelEn: "Pre-filled CERFA form", labelFr: "Formulaire CERFA pré-rempli", unlocked: false },
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
    const searchParams = useSearchParams();
    const isEn = t("auth.next") === "Next";

    const [step, setStep] = useState<WizardStep>(0);
    const [saving, setSaving] = useState(false);
    const [initialLoading, setInitialLoading] = useState(false);
    const [authorizationType, setAuthorizationType] = useState<string>("PC");

    // Step 1 — Environment
    const [projectAddress, setProjectAddress] = useState("");
    const [nearPhoto, setNearPhoto] = useState<File | null>(null);
    const [farPhoto, setFarPhoto] = useState<File | null>(null);
    const [terrainInitial, setTerrainInitial] = useState("");
    const [accessVerts, setAccessVerts] = useState("");

    // Photo upload state
    const [nearPhotoPreview, setNearPhotoPreview] = useState<string | null>(null);
    const [farPhotoPreview, setFarPhotoPreview] = useState<string | null>(null);
    const [nearPhotoUploaded, setNearPhotoUploaded] = useState(false);
    const [farPhotoUploaded, setFarPhotoUploaded] = useState(false);
    const [uploadingNear, setUploadingNear] = useState(false);
    const [uploadingFar, setUploadingFar] = useState(false);

    // AI photo analysis state
    const [analyzingPhotos, setAnalyzingPhotos] = useState(false);
    const [photoAnalysis, setPhotoAnalysis] = useState<Record<string, string> | null>(null);
    const [analysisError, setAnalysisError] = useState<string | null>(null);

    // Address editing
    const [editingAddress, setEditingAddress] = useState(false);
    const [addressQuery, setAddressQuery] = useState("");
    const [addressSuggestions, setAddressSuggestions] = useState<{ label: string; city: string; postcode: string; coordinates?: number[] }[]>([]);
    const [loadingAddressSearch, setLoadingAddressSearch] = useState(false);

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

    // Step 3 — Materials (per-job)
    const [existingFacade, setExistingFacade] = useState("");
    const [existingRoof, setExistingRoof] = useState("");
    const [jobMaterials, setJobMaterials] = useState<Record<string, JobMaterials>>({});

    // Legacy compat — keep old variable names for save/export references
    const matExtMaterial = existingFacade;
    const matExtColor = "";
    const roofType = "" as "flat" | "dual_pitch" | "single_pitch" | "";
    const roofCovering = "";
    const roofColor = "";
    const roofMaterial = "";
    const wallMaterial = "";
    const wallColor = "";
    const wallType: string[] = [];
    const gutterMaterial = "";
    const gutterColor = "";
    const surfaceMaterial = "";
    const surfaceColor = "";
    const surfaceType: string[] = [];
    const fenceMaterial = "";
    const fenceColor = "";
    const fenceType: string[] = [];
    const joineryMaterial = "";
    const joineryType: string[] = [];
    const extRoofing = "";
    const surface2Material = "";
    const surface2Color = "";
    const trimMaterial = "";
    const trimColor = "";
    const trimType: string[] = [];
    const joinery2Material = "";
    const joinery2Type: string[] = [];

    // Helper to create default materials for a job
    function defaultJobMaterials(): JobMaterials {
        return {
            roofs: [{ roofShape: "", mainMaterial: "", tint: "", soffitCladding: "" }],
            gutters: [{ material: "", tint: "" }],
            facades: [{ coating: "", finishing: "", tint: "" }],
            joineries: [{ materials: "", shutters: "" }],
        };
    }

    // Ensure materials exist for a job
    function getJobMat(jobId: string): JobMaterials {
        return jobMaterials[jobId] || defaultJobMaterials();
    }

    function updateJobMat(jobId: string, updater: (m: JobMaterials) => JobMaterials) {
        setJobMaterials(prev => ({ ...prev, [jobId]: updater(prev[jobId] || defaultJobMaterials()) }));
    }

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
    const [pluDocUrl, setPluDocUrl] = useState<string | null>(null);
    const [useAutoDoc, setUseAutoDoc] = useState(true);
    const [lotissementFile, setLotissementFile] = useState<File | null>(null);
    const [pluDocReady, setPluDocReady] = useState(false);
    const [designValidated, setDesignValidated] = useState(false);
    const [selectedDoc, setSelectedDoc] = useState<string>("PC4 / DPC 8-1");

    // ── Captured document images (Blob URLs from site-plan editor) ─────────────
    // Blob URLs are memory-safe and live in the Zustand store.
    // They do NOT survive sessionStorage (Blob URLs are opaque references).
    const [capturedImages, setCapturedImages] = useState<Record<string, string | null>>({});
    useEffect(() => {
        if (step !== 8) return;
        const docs = useUrbAssistProjectStore.getState().generatedDocuments;
        setCapturedImages({ ...docs });

        // MANDATE 3: Cleanup blob URLs when leaving Step 8 or unmounting
        return () => {
            // Don't revoke if user might return — only revoke store copies
            // The store's revokeGeneratedDocuments handles its own cleanup
        };
    }, [step]);

    // ── Detect return from Intelligence Editor (designed=1 URL param) ─────────
    useEffect(() => {
        const designed = searchParams.get("designed");
        if (designed === "1") {
            setDesignValidated(true);
            setStep(7);
        }
    }, [searchParams]);

    // Confirmation modal & generation tracking
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [generationCount, setGenerationCount] = useState(0);
    const [generatedStatement, setGeneratedStatement] = useState<{ text: string; sections: Record<string, string> } | null>(null);
    const [generationError, setGenerationError] = useState<string | null>(null);
    // PLU analysis result (from /api/analyze-plu)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [pluAnalysisResult, setPluAnalysisResult] = useState<{ analysis: any; pluRules: any } | null>(null);
    // Feasibility matrix state
    const [projectIntent, setProjectIntent] = useState("");
    const [userNotes, setUserNotes] = useState("");
    const [briefAutoCompiled, setBriefAutoCompiled] = useState(false);
    const [feasibilityReport, setFeasibilityReport] = useState<FeasibilityReport | null>(null);
    const [feasibilitySource, setFeasibilitySource] = useState<"gemini" | "fallback" | null>(null);
    const [feasibilityLoading, setFeasibilityLoading] = useState(false);

    // Real project/zone data
    const [projectName, setProjectName] = useState<string>("");
    const [projectZoneType, setProjectZoneType] = useState<string>("");
    const [projectProtectedAreas, setProjectProtectedAreas] = useState<{ type: string; name: string }[]>([]);

    // ── Auto-compile brief when entering Step 5 (Regulation Analysis) ──────
    useEffect(() => {
        if (step === 5 && !projectIntent.trim() && jobs.length > 0) {
            const compiled = compileProjectBrief(jobs, jobMaterials, {
                zone: projectZoneType,
                address: projectAddress,
                authType: authorizationType,
                isEn,
            });
            setProjectIntent(compiled);
            setBriefAutoCompiled(true);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step]);

    useEffect(() => {
        setInitialLoading(true);
        fetch(`/api/projects/${projectId}`)
            .then((r) => r.json())
            .then((d) => {
                if (d.project?.name) setProjectName(d.project.name);
                if (d.project?.address) setProjectAddress(d.project.address);
                if (d.project?.regulatoryAnalysis?.zoneType) setProjectZoneType(d.project.regulatoryAnalysis.zoneType);
                if (d.project?.protectedAreas) setProjectProtectedAreas(d.project.protectedAreas);
                if (d.project?.pluAnalysisCount) setGenerationCount(d.project.pluAnalysisCount);
                if (d.project?.authorizationType) setAuthorizationType(d.project.authorizationType);

                // ── PLU PDF URL — strict fallback chain ──────────────────
                // Priority 1: Direct PDF URL from regulatoryAnalysis (stored by GPU API)
                const storedPdfUrl = d.project?.regulatoryAnalysis?.pdfUrl;
                if (storedPdfUrl) {
                    setPluDocUrl(storedPdfUrl);
                }
                // Priority 2: If zone detected but no pdfUrl → live re-fetch via plu-detection
                // This handles cases where the DB record was created before the fix was added
                else if (d.project?.regulatoryAnalysis?.zoneType && d.project?.coordinates) {
                    try {
                        const coords = JSON.parse(d.project.coordinates);
                        const coordArray = Array.isArray(coords) ? coords : [coords.lng ?? coords.longitude, coords.lat ?? coords.latitude];
                        if (coordArray.length >= 2 && (coordArray[0] !== 0 || coordArray[1] !== 0)) {
                            fetch("/api/plu-detection", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ coordinates: coordArray }),
                            })
                                .then(r => r.ok ? r.json() : null)
                                .then(data => {
                                    if (data?.plu?.pdfUrl) {
                                        setPluDocUrl(data.plu.pdfUrl);
                                    }
                                    // If API returns null pdfUrl → leave pluDocUrl as null.
                                    // PluDocumentManager handles this: shows "No downloadable regulation"
                                    // and forces the user to upload manually.
                                })
                                .catch(() => { /* silent - PluDocumentManager handles null */ });
                        }
                    } catch { /* malformed coordinates - pluDocUrl stays null, user uploads manually */ }
                }

                // ── Pre-populate jobs from authorization data ──────────────
                const desc = d.project?.projectDescription;
                console.log("Project description data from DB:", desc);
                if (desc) {
                    // Priority 1: If jobs were previously saved by this page, restore them
                    if (Array.isArray(desc.jobs) && desc.jobs.length > 0) {
                        console.log("Restoring saved jobs:", desc.jobs);
                        setJobs(desc.jobs);
                    }
                    // Priority 2: If individual workItems were saved from authorization page
                    else if (Array.isArray(desc.workItems) && desc.workItems.length > 0) {
                        console.log("Converting authorization workItems to jobs:", desc.workItems);
                        const preJobs: Job[] = desc.workItems.map((w: {
                            id: string; label: string; projectType: string;
                            floorAreaCreated: number; footprintCreated: number;
                            existingFloorArea?: number; shelterHeight?: number;
                            changeOfUse?: boolean; facadeModification?: boolean;
                        }) => {
                            const nature: NatureType = w.projectType === "new_construction" ? "new_construction"
                                : w.projectType === "existing_extension" ? "existing_extension"
                                    : "outdoor";

                            const job: Job = {
                                id: w.id || `auth-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                                nature,
                                levels: 1 as LevelCount,
                                footprint: Number(w.footprintCreated) || 0,
                                floorAreaEstimated: Number(w.floorAreaCreated) || 0,
                                displayLabel: w.label,
                            };

                            // Extension-specific fields
                            if (nature === "existing_extension") {
                                job.currentLivingArea = Number(w.existingFloorArea) || undefined;
                                const workTypes: WorkType[] = [];
                                if (w.changeOfUse) workTypes.push("change_destination");
                                if (w.facadeModification) workTypes.push("change_exterior");
                                if (workTypes.length === 0) workTypes.push("extension");
                                job.workTypes = workTypes;
                            }

                            // Outdoor-specific fields
                            if (nature === "outdoor") {
                                const lowerLabel = (w.label || "").toLowerCase();
                                if (lowerLabel.includes("pool") || lowerLabel.includes("piscine")) {
                                    job.outdoorLayout = "pool";
                                    job.poolSurfaceArea = Number(w.footprintCreated) || 0;
                                } else if (lowerLabel.includes("fence") || lowerLabel.includes("clôture") || lowerLabel.includes("gate") || lowerLabel.includes("portail")) {
                                    job.outdoorLayout = "fence_gate";
                                } else {
                                    job.outdoorLayout = "other";
                                }
                            }

                            return job;
                        });

                        console.log("Pre-populated jobs from workItems:", preJobs);
                        setJobs(preJobs);
                    }
                    // Priority 3: Fall back to inferring from summary fields
                    else {
                        const cats: string[] = Array.isArray(desc.categories) ? desc.categories : [];
                        const hasConstruction = cats.includes("new_construction") || Number(desc.constructionFootprint) > 0;
                        const hasExtension = cats.includes("existing_extension") || Number(desc.extensionFootprint) > 0 || (Array.isArray(desc.extensionSubTypes) && desc.extensionSubTypes.length > 0);
                        const hasOutdoor = cats.includes("outdoor") || (Array.isArray(desc.outdoorTags) && desc.outdoorTags.length > 0);

                        const preJobs: Job[] = [];
                        const ts = Date.now();

                        if (hasConstruction) {
                            const fp = Number(desc.constructionFootprint) || 0;
                            const levels = (desc.constructionLevels === 2 ? 2 : desc.constructionLevels === 3 ? 3 : 1) as LevelCount;
                            preJobs.push({
                                id: `auth-construction-${ts}`,
                                nature: "new_construction",
                                levels,
                                footprint: fp,
                                floorAreaEstimated: Number(desc.constructionFloorArea) || estimateFloorAreaCreated(fp, levels),
                                displayLabel: isEn ? "Independent Construction 1" : "Construction Indépendante 1",
                            });
                        }

                        if (hasExtension) {
                            const fp = Number(desc.extensionFootprint) || 0;
                            const levels = (desc.extensionLevels === 2 ? 2 : desc.extensionLevels === 3 ? 3 : 1) as LevelCount;
                            preJobs.push({
                                id: `auth-extension-${ts + 1}`,
                                nature: "existing_extension",
                                levels,
                                footprint: fp,
                                floorAreaEstimated: Number(desc.extensionFloorArea) || estimateFloorAreaCreated(fp, levels),
                                currentLivingArea: Number(desc.existingFloorArea) || undefined,
                                workTypes: Array.isArray(desc.extensionSubTypes) ? desc.extensionSubTypes as WorkType[] : undefined,
                                displayLabel: isEn ? "Work on existing" : "Travaux sur existant",
                            });
                        }

                        if (hasOutdoor) {
                            const tags: string[] = Array.isArray(desc.outdoorTags) ? desc.outdoorTags : [];
                            if (tags.includes("swimming_pool")) {
                                preJobs.push({
                                    id: `auth-pool-${ts + 2}`,
                                    nature: "outdoor", levels: 1, footprint: Number(desc.outdoorSurface) || 0,
                                    floorAreaEstimated: 0, outdoorLayout: "pool",
                                    poolSurfaceArea: Number(desc.outdoorSurface) || 0,
                                    displayLabel: isEn ? "Pool" : "Piscine",
                                });
                            }
                            if (tags.includes("fence_gate")) {
                                preJobs.push({
                                    id: `auth-fence-${ts + 3}`,
                                    nature: "outdoor", levels: 1, footprint: 0,
                                    floorAreaEstimated: 0, outdoorLayout: "fence_gate",
                                    displayLabel: isEn ? "Fence / Gate" : "Clôture / Portail",
                                });
                            }
                        }

                        if (preJobs.length > 0) {
                            console.log("Pre-populated jobs from summary fields:", preJobs);
                            setJobs(preJobs);
                        }
                    }
                }
            })
            .catch(() => { })
            .finally(() => setInitialLoading(false));
    }, [projectId]);

    // ─── Estimated floor area for add-job form ──────────────────────────────
    const addFloorAreaEstimated = useMemo(() => {
        if (addFootprint <= 0) return 0;
        return estimateFloorAreaCreated(addFootprint, addLevels);
    }, [addFootprint, addLevels]);

    // ─── Address search (debounced) ─────────────────────────────────────
    const searchAddress = useCallback(() => {
        if (!addressQuery.trim() || addressQuery.length < 4) { setAddressSuggestions([]); return; }
        setLoadingAddressSearch(true);
        fetch("/api/address/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: addressQuery }) })
            .then((r) => r.json())
            .then((d) => setAddressSuggestions(d.results || []))
            .catch(() => setAddressSuggestions([]))
            .finally(() => setLoadingAddressSearch(false));
    }, [addressQuery]);

    useEffect(() => { const timer = setTimeout(searchAddress, 300); return () => clearTimeout(timer); }, [addressQuery, searchAddress]);

    const selectAddress = useCallback((addr: { label: string; city: string; postcode: string; coordinates?: number[] }) => {
        setProjectAddress(addr.label);
        setAddressQuery("");
        setAddressSuggestions([]);
        setEditingAddress(false);
        // Persist updated address to backend
        fetch(`/api/projects/${projectId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                address: addr.label,
                municipality: addr.city,
                coordinates: addr.coordinates,
            }),
        }).catch(() => { /* silent */ });
    }, [projectId]);

    // ─── Photo upload handler ──────────────────────────────────────────
    const uploadPhoto = useCallback(async (file: File, type: "near_photo" | "far_photo") => {
        const isNear = type === "near_photo";
        if (isNear) { setUploadingNear(true); } else { setUploadingFar(true); }

        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("type", type);

            const res = await fetch(`/api/projects/${projectId}/upload`, {
                method: "POST",
                body: formData,
            });

            // Create preview URL regardless of upload result
            const previewUrl = URL.createObjectURL(file);
            if (isNear) {
                setNearPhoto(file);
                setNearPhotoPreview(previewUrl);
                setNearPhotoUploaded(true);
            } else {
                setFarPhoto(file);
                setFarPhotoPreview(previewUrl);
                setFarPhotoUploaded(true);
            }

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: "Unknown error" }));
                console.warn("Photo upload to server failed:", res.status, errData.error || errData);
                // Photo still works locally — AI analysis will try server copy first, then fall back
            }
        } catch (err) {
            // Even on network error, still show the photo locally
            const previewUrl = URL.createObjectURL(file);
            if (isNear) {
                setNearPhoto(file);
                setNearPhotoPreview(previewUrl);
                setNearPhotoUploaded(true);
            } else {
                setFarPhoto(file);
                setFarPhotoPreview(previewUrl);
                setFarPhotoUploaded(true);
            }
            console.warn("Photo upload network error:", err);
        } finally {
            if (isNear) { setUploadingNear(false); } else { setUploadingFar(false); }
        }
    }, [projectId]);

    // ─── AI photo analysis handler ─────────────────────────────────────
    const analyzePhotosWithAI = useCallback(async () => {
        setAnalyzingPhotos(true);
        setAnalysisError(null);

        try {
            // Send photos directly via FormData
            const formData = new FormData();
            if (nearPhoto) formData.append("near_photo", nearPhoto);
            if (farPhoto) formData.append("far_photo", farPhoto);

            const res = await fetch(`/api/projects/${projectId}/analyze-photos`, {
                method: "POST",
                body: formData,
            });

            const data = await res.json();

            if (res.ok && data.analysis) {
                console.log("AI Photo Analysis result:", data.analysis);
                setPhotoAnalysis(data.analysis);
                // Auto-fill terrain description — try multiple fallback fields
                const autoText = data.analysis.fullDescriptionFr
                    || data.analysis.terrainDescriptionFr
                    || data.analysis.terrainDescription
                    || data.analysis.existingConditionsFr
                    || "";
                if (autoText) {
                    setTerrainInitial(autoText);
                }
            } else {
                setAnalysisError(data.error || "Analysis failed");
            }
        } catch {
            setAnalysisError("Network error — please try again.");
        } finally {
            setAnalyzingPhotos(false);
        }
    }, [projectId, nearPhoto, farPhoto]);

    // ─── Recalculate DP/PC determination whenever jobs change ────────────
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

    // ─── CRITICAL FIX: Sync dpcResult → authorizationType ──────────────
    // When the user adds/removes jobs, dpcResult recalculates the determination.
    // We MUST sync this back to authorizationType so activeDocs updates.
    useEffect(() => {
        if (!dpcResult) return;
        const det = dpcResult.determination;
        // Map determination to authorization type (strict, case-insensitive)
        const upper = det.toUpperCase();
        let resolved: string;
        if (upper === "PC" || upper === "ARCHITECT_REQUIRED") {
            resolved = "PC";
        } else if (upper === "DP") {
            resolved = "DP";
        } else {
            // NONE or unknown → don't change (keep the DB-fetched value)
            return;
        }
        setAuthorizationType((prev) => {
            if (prev !== resolved) {
                console.log(`[project-description] authorizationType synced: ${prev} → ${resolved} (from dpcResult.determination: ${det})`);
            }
            return resolved;
        });
    }, [dpcResult]);

    // ─── Dynamic document list based on authorization type ─────────────
    const activeDocs = useMemo(() => {
        const upper = (authorizationType || "").toUpperCase();
        if (upper === "PC" || upper === "ARCHITECT_REQUIRED") return PC_DOCS;
        if (upper === "DP") return DP_DOCS;
        // Fallback: use PC_DOCS (never default to DP silently)
        return PC_DOCS;
    }, [authorizationType]);

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
                            existingFacade,
                            existingRoof,
                            jobMaterials,
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

    // Show confirmation modal before starting analysis
    function handleRequestAnalysis() {
        setShowConfirmModal(true);
    }

    // Actually start the real AI analysis after user confirms
    async function handleStartAnalysis() {
        setShowConfirmModal(false);
        setShowAnalysisModal(true);
        setAnalysisProgress(0);
        setAnalysisComplete(false);
        setGenerationError(null);

        // Validate: need either a PDF file or auto-fetched URL
        const hasDoc = !!pluFile || (useAutoDoc && !!pluDocUrl);
        if (!hasDoc) {
            setGenerationError("Veuillez uploader un document PLU en PDF ou utiliser le document auto-détecté.");
            setAnalysisProgress(100);
            setAnalysisComplete(true);
            return;
        }

        // Animate progress while waiting for API
        const interval = setInterval(() => {
            setAnalysisProgress(prev => {
                if (prev >= 90) {
                    clearInterval(interval);
                    return 90; // Hold at 90% until API responds
                }
                return prev + Math.random() * 4 + 0.5;
            });
        }, 500);

        try {
            // ── Build a single unified FormData payload ──────────────────
            const formData = new FormData();

            // a) PLU document: user-uploaded file takes priority over auto-detected URL
            if (pluFile) {
                formData.append("pluPdfFile", pluFile);
            } else if (useAutoDoc && pluDocUrl) {
                formData.append("pluPdfUrl", pluDocUrl);
            }

            // b) Optional lotissement (subdivision rules) file
            if (lotissementFile) {
                formData.append("lotissementFile", lotissementFile);
            }

            // c) Project brief: the auto-compiled + user-edited text from the textarea
            const fullBrief = [projectIntent.trim(), userNotes.trim()].filter(Boolean).join("\n\n");
            if (fullBrief) {
                formData.append("projectBrief", fullBrief);
            }

            // d) Context metadata
            formData.append("pluZone", projectZoneType || "non spécifiée");
            formData.append("isABFZone", String(projectProtectedAreas.length > 0));
            formData.append("parcelAddress", projectAddress || "non précisée");

            // ── Single request to the unified analyze-plu endpoint ───────
            const res = await fetch("/api/analyze-plu", {
                method: "POST",
                body: formData,
            });
            // Safe JSON parsing — backend might return HTML on crash
            const contentType = res.headers.get("content-type") || "";
            if (!contentType.includes("application/json")) {
                throw new Error("Le serveur d'analyse a rencontré une erreur interne. Veuillez réessayer dans quelques instants.");
            }
            const data: Record<string, unknown> = await res.json();

            if (!res.ok) {
                throw new Error((data.error as string) || "L'analyse du document a échoué.");
            }

            clearInterval(interval);

            if (data.success) {
                console.log(`[PLU] Analysis complete — source: ${data.source}, pluRules confidence: ${(data.pluRules as Record<string, unknown>)?.extractionConfidence}`);

                const isFallbackSource = data.source === "fallback";

                // Warn user if the auto-detected PDF was a placeholder
                if (data.placeholderDetected) {
                    const sugUrl = data.suggestedUrl as string | undefined;
                    setGenerationError(
                        `⚠ Le document auto-détecté est un placeholder (pas le vrai règlement). ` +
                        (sugUrl
                            ? `Les vrais documents sont disponibles ici : ${sugUrl}. Téléchargez le règlement depuis ce lien et importez-le manuellement.`
                            : `Veuillez télécharger le règlement depuis le site de votre collectivité et l'importer manuellement.`)
                    );
                }

                // Always store the PLU analysis result (even fallback) so Step 6 can render
                setPluAnalysisResult({ analysis: data.analysis as object, pluRules: data.pluRules as object });
                setGenerationCount(prev => prev + 1);
                setAnalysisProgress(isFallbackSource ? 50 : 95);


                // ── Chain feasibility matrix generation ──────────────────
                // CRITICAL: Always run this regardless of analyze-plu source.
                // Even with fallback PluRules, the feasibility analysis can
                // independently extract regulations from the PDF.
                try {
                    setFeasibilityLoading(true);
                    const intent = fullBrief
                        || jobs.map(j => {
                            const label = j.displayLabel || j.nature;
                            const area = j.floorAreaEstimated > 0 ? ` de ${j.floorAreaEstimated}m²` : (j.footprint > 0 ? ` de ${j.footprint}m²` : "");
                            return `${label}${area}`;
                        }).join(", ") || "Projet de construction";

                    const feasFormData = new FormData();
                    if (pluFile) {
                        feasFormData.append("pdfFile", pluFile);
                    } else if (useAutoDoc && pluDocUrl) {
                        feasFormData.append("pdfUrl", pluDocUrl);
                    }
                    feasFormData.append("pluZone", projectZoneType || "non spécifiée");
                    feasFormData.append("projectIntent", intent);

                    const feasRes = await fetch("/api/generate-feasibility", {
                        method: "POST",
                        body: feasFormData,
                    });

                    // Safe JSON parsing — backend might return HTML on crash
                    const feasContentType = feasRes.headers.get("content-type") || "";
                    if (feasContentType.includes("application/json")) {
                        const feasData = await feasRes.json();
                        if (feasRes.ok && feasData.success && feasData.report) {
                            setFeasibilityReport(feasData.report);
                            setFeasibilitySource(feasData.source || "gemini");
                        } else {
                            console.warn("Feasibility analysis failed:", feasData.error);
                            // Set fallback source so UI shows warning badge
                            if (isFallbackSource) {
                                setFeasibilitySource("fallback");
                            }
                        }
                    } else {
                        console.warn("Feasibility API returned non-JSON response");
                        if (isFallbackSource) {
                            setFeasibilitySource("fallback");
                        }
                    }
                } catch (feasErr) {
                    console.warn("Feasibility analysis error:", feasErr);
                    if (isFallbackSource) {
                        setFeasibilitySource("fallback");
                    }
                } finally {
                    setFeasibilityLoading(false);
                }

                setAnalysisProgress(100);
                setAnalysisComplete(true);
            } else {
                setGenerationError((data.error as string) || "L'analyse du document a échoué.");
                setAnalysisProgress(100);
                setAnalysisComplete(true);
            }
        } catch (err) {
            clearInterval(interval);
            console.error("PLU Analysis failed:", err);
            setGenerationError(err instanceof Error ? err.message : "Erreur de connexion. Veuillez réessayer.");
            setAnalysisProgress(100);
            setAnalysisComplete(true);
        }
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
                                                    {isEn ? "Next step: Describe your project" : "Prochaine étape : Décrivez votre projet"}
                                                </h2>
                                                <p className="text-sm text-indigo-100 mb-5 max-w-md">
                                                    {isEn
                                                        ? "Complete the technical description and your personal information to automatically generate your CERFA."
                                                        : "Complétez la description technique et vos informations personnelles pour générer automatiquement votre CERFA."}
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
                                                <div className="flex items-center justify-between">
                                                    <label className="text-sm font-semibold text-slate-800">
                                                        {isEn ? "Address of the plot" : "Adresse de la parcelle"}
                                                    </label>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setEditingAddress(!editingAddress);
                                                            if (!editingAddress) {
                                                                setAddressQuery(projectAddress);
                                                                setAddressSuggestions([]);
                                                            }
                                                        }}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-semibold hover:bg-indigo-100 hover:text-indigo-700 transition-all border border-indigo-200 hover:border-indigo-300 hover:shadow-sm"
                                                    >
                                                        <Pencil className="w-3 h-3" />
                                                        {editingAddress
                                                            ? (isEn ? "Cancel" : "Annuler")
                                                            : (isEn ? "Change address" : "Changer l'adresse")}
                                                    </button>
                                                </div>
                                                {editingAddress ? (
                                                    <div className="relative">
                                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500" />
                                                        <input
                                                            type="text"
                                                            value={addressQuery}
                                                            onChange={(e) => setAddressQuery(e.target.value)}
                                                            autoFocus
                                                            className="w-full pl-9 pr-10 py-3 rounded-xl bg-white border-2 border-indigo-300 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all"
                                                            placeholder={isEn ? "Search for an address..." : "Rechercher une adresse..."}
                                                        />
                                                        {loadingAddressSearch && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 animate-spin" />}
                                                        {addressSuggestions.length > 0 && (
                                                            <div className="absolute z-30 top-full left-0 right-0 mt-1 rounded-xl bg-white border border-slate-200 overflow-hidden shadow-xl max-h-60 overflow-y-auto">
                                                                {addressSuggestions.map((a, i) => (
                                                                    <button
                                                                        key={i}
                                                                        type="button"
                                                                        onClick={() => selectAddress(a)}
                                                                        className="w-full px-4 py-3 text-left text-sm text-slate-900 hover:bg-indigo-50 flex items-center gap-3 transition-colors border-b border-slate-50 last:border-b-0"
                                                                    >
                                                                        <MapPin className="w-4 h-4 text-indigo-500 shrink-0" />
                                                                        <span className="truncate flex-1">{a.label}</span>
                                                                        <span className="text-slate-400 text-xs shrink-0">{a.postcode} {a.city}</span>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="relative">
                                                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                        {initialLoading ? (
                                                            <div className="w-full pl-9 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 text-sm animate-pulse">
                                                                {isEn ? "Loading address..." : "Chargement de l'adresse..."}
                                                            </div>
                                                        ) : (
                                                            <input
                                                                type="text"
                                                                value={projectAddress}
                                                                readOnly
                                                                className="w-full pl-9 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm cursor-default"
                                                                placeholder={isEn ? "No address set" : "Aucune adresse définie"}
                                                            />
                                                        )}
                                                    </div>
                                                )}
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
                                                {/* Near photo */}
                                                <div className="space-y-2">
                                                    <label className="text-sm font-semibold text-slate-800">
                                                        {isEn ? "Photo of the immediate surroundings" : "Photo des abords immédiats"} <span className="text-red-500">*</span>
                                                    </label>
                                                    <label className={cn(
                                                        "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-all overflow-hidden",
                                                        nearPhotoUploaded
                                                            ? "border-emerald-400 bg-emerald-50/30"
                                                            : "border-slate-300 bg-slate-50/50 hover:border-indigo-300 hover:bg-indigo-50/30",
                                                        nearPhotoPreview ? "p-1" : "py-8 px-4"
                                                    )}>
                                                        {uploadingNear ? (
                                                            <div className="py-8 flex flex-col items-center gap-2">
                                                                <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                                                                <span className="text-xs text-indigo-600 font-medium">{isEn ? "Uploading..." : "Envoi en cours..."}</span>
                                                            </div>
                                                        ) : nearPhotoPreview ? (
                                                            <div className="relative w-full">
                                                                <img src={nearPhotoPreview} alt="Near environment" className="w-full h-32 object-cover rounded-lg" />
                                                                <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                                                                    <Check className="w-3 h-3 text-white" />
                                                                </div>
                                                                <p className="text-[10px] text-slate-500 mt-1 px-1 truncate">{nearPhoto?.name}</p>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <Upload className="w-6 h-6 text-slate-400" />
                                                                <span className="text-sm font-medium text-slate-600">
                                                                    {isEn ? "Drag or click to add" : "Glisser ou cliquer pour ajouter"}
                                                                </span>
                                                                <span className="text-[11px] text-slate-400 text-center italic">
                                                                    {isEn
                                                                        ? "Take a close-up photo, focusing on the exact area where the work will take place."
                                                                        : "Prenez une photo rapprochée, en vous concentrant sur la zone exacte des travaux."}
                                                                </span>
                                                            </>
                                                        )}
                                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                                            const f = e.target.files?.[0];
                                                            if (f) uploadPhoto(f, "near_photo");
                                                        }} />
                                                    </label>
                                                </div>
                                                {/* Far photo */}
                                                <div className="space-y-2">
                                                    <label className="text-sm font-semibold text-slate-800">
                                                        {isEn ? "Photo of the distant environment" : "Photo de l'environnement lointain"} <span className="text-red-500">*</span>
                                                    </label>
                                                    <label className={cn(
                                                        "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-all overflow-hidden",
                                                        farPhotoUploaded
                                                            ? "border-emerald-400 bg-emerald-50/30"
                                                            : "border-slate-300 bg-slate-50/50 hover:border-indigo-300 hover:bg-indigo-50/30",
                                                        farPhotoPreview ? "p-1" : "py-8 px-4"
                                                    )}>
                                                        {uploadingFar ? (
                                                            <div className="py-8 flex flex-col items-center gap-2">
                                                                <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                                                                <span className="text-xs text-indigo-600 font-medium">{isEn ? "Uploading..." : "Envoi en cours..."}</span>
                                                            </div>
                                                        ) : farPhotoPreview ? (
                                                            <div className="relative w-full">
                                                                <img src={farPhotoPreview} alt="Far environment" className="w-full h-32 object-cover rounded-lg" />
                                                                <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                                                                    <Check className="w-3 h-3 text-white" />
                                                                </div>
                                                                <p className="text-[10px] text-slate-500 mt-1 px-1 truncate">{farPhoto?.name}</p>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <Upload className="w-6 h-6 text-slate-400" />
                                                                <span className="text-sm font-medium text-slate-600">
                                                                    {isEn ? "Drag or click to add" : "Glisser ou cliquer pour ajouter"}
                                                                </span>
                                                                <span className="text-[11px] text-slate-400 text-center italic">
                                                                    {isEn
                                                                        ? "Preferably from a public space (street). The context must be visible: neighboring houses, street, general atmosphere."
                                                                        : "De préférence depuis un espace public (rue). Le contexte doit être visible : maisons voisines, rue, ambiance générale."}
                                                                </span>
                                                            </>
                                                        )}
                                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                                            const f = e.target.files?.[0];
                                                            if (f) uploadPhoto(f, "far_photo");
                                                        }} />
                                                    </label>
                                                </div>
                                            </div>

                                            {/* AI Analysis button — appears after at least one photo uploaded */}
                                            {(nearPhotoUploaded || farPhotoUploaded) && (
                                                <div className="space-y-3">
                                                    <button
                                                        type="button"
                                                        onClick={analyzePhotosWithAI}
                                                        disabled={analyzingPhotos}
                                                        className={cn(
                                                            "w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all",
                                                            analyzingPhotos
                                                                ? "bg-violet-100 text-violet-400 cursor-wait"
                                                                : "bg-gradient-to-r from-violet-500 to-purple-600 text-white hover:shadow-lg hover:shadow-purple-500/20"
                                                        )}
                                                    >
                                                        {analyzingPhotos ? (
                                                            <>
                                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                                {isEn ? "Analyzing with AI..." : "Analyse IA en cours..."}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Sparkles className="w-4 h-4" />
                                                                {isEn ? "✨ Analyze photos with AI" : "✨ Analyser les photos avec l'IA"}
                                                            </>
                                                        )}
                                                    </button>

                                                    {analysisError && (
                                                        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                                                            {analysisError}
                                                        </div>
                                                    )}

                                                    {photoAnalysis && (
                                                        <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 p-4 space-y-3">
                                                            <div className="flex items-center gap-2">
                                                                <Check className="w-4 h-4 text-emerald-600" />
                                                                <p className="text-sm font-bold text-emerald-800">
                                                                    {isEn ? "AI Analysis Complete" : "Analyse IA terminée"}
                                                                </p>
                                                            </div>
                                                            <div className="space-y-2 text-xs text-emerald-700">
                                                                {(photoAnalysis.terrainDescriptionFr || photoAnalysis.terrainDescription) && (
                                                                    <div>
                                                                        <span className="font-semibold">🏗 {isEn ? "Terrain:" : "Terrain :"}</span>
                                                                        <p className="mt-0.5">{isEn ? (photoAnalysis.terrainDescription || photoAnalysis.terrainDescriptionFr) : (photoAnalysis.terrainDescriptionFr || photoAnalysis.terrainDescription)}</p>
                                                                    </div>
                                                                )}
                                                                {(photoAnalysis.existingConditionsFr || photoAnalysis.existingConditions) && (
                                                                    <div>
                                                                        <span className="font-semibold">🏠 {isEn ? "Existing conditions:" : "État existant :"}</span>
                                                                        <p className="mt-0.5">{isEn ? (photoAnalysis.existingConditions || photoAnalysis.existingConditionsFr) : (photoAnalysis.existingConditionsFr || photoAnalysis.existingConditions)}</p>
                                                                    </div>
                                                                )}
                                                                {(photoAnalysis.vegetationFr || photoAnalysis.vegetation) && (
                                                                    <div>
                                                                        <span className="font-semibold">🌿 {isEn ? "Vegetation:" : "Végétation :"}</span>
                                                                        <p className="mt-0.5">{isEn ? (photoAnalysis.vegetation || photoAnalysis.vegetationFr) : (photoAnalysis.vegetationFr || photoAnalysis.vegetation)}</p>
                                                                    </div>
                                                                )}
                                                                {(photoAnalysis.surroundingsFr || photoAnalysis.surroundings) && (
                                                                    <div>
                                                                        <span className="font-semibold">🏘 {isEn ? "Surroundings:" : "Environnement :"}</span>
                                                                        <p className="mt-0.5">{isEn ? (photoAnalysis.surroundings || photoAnalysis.surroundingsFr) : (photoAnalysis.surroundingsFr || photoAnalysis.surroundings)}</p>
                                                                    </div>
                                                                )}
                                                                {(photoAnalysis.atmosphereFr || photoAnalysis.atmosphere) && (
                                                                    <div>
                                                                        <span className="font-semibold">🌤 {isEn ? "Atmosphere:" : "Ambiance :"}</span>
                                                                        <p className="mt-0.5">{isEn ? (photoAnalysis.atmosphere || photoAnalysis.atmosphereFr) : (photoAnalysis.atmosphereFr || photoAnalysis.atmosphere)}</p>
                                                                    </div>
                                                                )}
                                                                {(photoAnalysis.accessibilityFr || photoAnalysis.accessibility) && (
                                                                    <div>
                                                                        <span className="font-semibold">🚗 {isEn ? "Access:" : "Accès :"}</span>
                                                                        <p className="mt-0.5">{isEn ? (photoAnalysis.accessibility || photoAnalysis.accessibilityFr) : (photoAnalysis.accessibilityFr || photoAnalysis.accessibility)}</p>
                                                                    </div>
                                                                )}
                                                                {(photoAnalysis.notableFeaturesFr || photoAnalysis.notableFeatures) && (
                                                                    <div>
                                                                        <span className="font-semibold">📌 {isEn ? "Notable features:" : "Éléments notables :"}</span>
                                                                        <p className="mt-0.5">{isEn ? (photoAnalysis.notableFeatures || photoAnalysis.notableFeaturesFr) : (photoAnalysis.notableFeaturesFr || photoAnalysis.notableFeatures)}</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Editable terrain description textarea */}
                                                    {photoAnalysis && (terrainInitial || photoAnalysis.fullDescriptionFr || photoAnalysis.terrainDescriptionFr) && (
                                                        <div className="space-y-2">
                                                            <label className="text-sm font-semibold text-slate-800">
                                                                {isEn ? "Terrain Description (AI-generated, editable)" : "Description du terrain (générée par IA, modifiable)"}
                                                            </label>
                                                            <textarea
                                                                value={terrainInitial || photoAnalysis.fullDescriptionFr || photoAnalysis.terrainDescriptionFr || ""}
                                                                onChange={(e) => setTerrainInitial(e.target.value)}
                                                                rows={5}
                                                                className="w-full px-4 py-3 rounded-xl bg-white border-2 border-emerald-200 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 transition-all resize-y"
                                                                placeholder={isEn ? "AI-generated terrain description will appear here..." : "La description du terrain générée par l'IA apparaîtra ici..."}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
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
                                                                    <span className="text-red-500 ml-0.5">*</span>
                                                                </label>
                                                                {addWorkTypes.length === 0 && (
                                                                    <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 shadow-sm">
                                                                        <div className="relative shrink-0">
                                                                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                                                                            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                                                        </div>
                                                                        <p className="text-xs font-semibold text-amber-700">
                                                                            {isEn ? "Please select at least one type of work to continue." : "Veuillez sélectionner au moins un type de travaux pour continuer."}
                                                                        </p>
                                                                    </div>
                                                                )}
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
                                                                : addNature === "existing_extension"
                                                                    ? (addFootprint <= 0 || addWorkTypes.length === 0)
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
                                                            ? (isEn ? "Preliminary Declaration (DP) required" : "Déclaration Préalable (DP) requise")
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
                                    <MaterialsStep
                                        isEn={isEn}
                                        jobs={jobs}
                                        existingFacade={existingFacade}
                                        setExistingFacade={setExistingFacade}
                                        existingRoof={existingRoof}
                                        setExistingRoof={setExistingRoof}
                                        jobMaterials={jobMaterials}
                                        updateJobMat={updateJobMat}
                                        getJobMat={getJobMat}
                                        setStep={setStep}
                                    />
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

                                        {/* Zone cards — real data */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/30 p-4">
                                                <div className="flex items-center justify-between mb-2">
                                                    <h3 className="text-sm font-bold text-slate-900 uppercase">
                                                        {isEn ? "PLU ZONE DETECTED" : "ZONE PLU DÉTECTÉE"}
                                                    </h3>
                                                    <span className="text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
                                                        {projectZoneType
                                                            ? `Zone ${projectZoneType.toUpperCase()}`
                                                            : (isEn ? "Not detected" : "Non détectée")}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-500 mt-1">
                                                    {projectZoneType && (projectZoneType.toUpperCase().startsWith("U") || projectZoneType.toUpperCase().startsWith("AU"))
                                                        ? (isEn
                                                            ? "Dense zone generally allowing extensions up to 40m² under conditions."
                                                            : "Zone dense permettant généralement des extensions jusqu'à 40m² sous conditions.")
                                                        : projectZoneType
                                                            ? (isEn ? "Rural or natural zone — DP threshold at 20m²." : "Zone rurale/naturelle — seuil DP à 20m².")
                                                            : (isEn ? "No PLU zone detected for this location." : "Aucune zone PLU détectée pour cette localisation.")}
                                                </p>
                                                <button className="text-xs text-indigo-600 font-semibold mt-2 hover:underline">
                                                    {isEn ? "Edit manually" : "Modifier manuellement"}
                                                </button>
                                            </div>
                                            <div className={`rounded-xl border-2 p-4 ${projectProtectedAreas.length > 0 ? "border-amber-200 bg-amber-50/30" : "border-green-200 bg-green-50/30"}`}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <h3 className="text-sm font-bold text-slate-900 uppercase">
                                                        {isEn ? "Protected Area" : "Zone Protégée"}
                                                    </h3>
                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                                        projectProtectedAreas.length > 0
                                                            ? "text-amber-600 bg-amber-100"
                                                            : "text-green-600 bg-green-100"
                                                    }`}>
                                                        {projectProtectedAreas.length > 0
                                                            ? (isEn ? `${projectProtectedAreas.length} zone(s) detected` : `${projectProtectedAreas.length} zone(s) détectée(s)`)
                                                            : (isEn ? "No easement" : "Aucune servitude")}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-500 mt-1">
                                                    {projectProtectedAreas.length > 0
                                                        ? projectProtectedAreas.slice(0, 3).map(a => a.name).join(", ")
                                                        : (isEn
                                                            ? "No specific heritage constraint detected on the plot."
                                                            : "Pas de contrainte patrimoniale spécifique détectée sur la parcelle.")}
                                                </p>
                                            </div>
                                        </div>

                                        {/* PLU Document Manager */}
                                        <PluDocumentManager
                                            autoFetchedUrl={pluDocUrl}
                                            zoneType={projectZoneType}
                                            pluFile={pluFile}
                                            onPluFileChange={setPluFile}
                                            useAutoDoc={useAutoDoc}
                                            onUseAutoDocChange={setUseAutoDoc}
                                            lotissementFile={lotissementFile}
                                            onLotissementChange={setLotissementFile}
                                            onDocumentReady={setPluDocReady}
                                            isEn={isEn}
                                        />

                                        {/* Project Intent — Auto-Compiled Brief */}
                                        <div className="space-y-3">
                                            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                                <Pencil className="w-4 h-4 text-emerald-500" />
                                                {isEn ? "Project Brief for AI Analysis" : "Brief Projet pour l'Analyse IA"}
                                                {briefAutoCompiled && (
                                                    <span className="text-[10px] font-medium bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                                                        {isEn ? "Auto-generated from Step 1" : "Auto-généré depuis l'Étape 1"}
                                                    </span>
                                                )}
                                            </h3>

                                            {/* Auto-compiled brief preview */}
                                            <div className="relative">
                                                <textarea
                                                    value={projectIntent}
                                                    onChange={(e) => {
                                                        setProjectIntent(e.target.value);
                                                        setBriefAutoCompiled(false);
                                                    }}
                                                    rows={8}
                                                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs font-mono leading-relaxed placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-300 transition-shadow resize-y"
                                                />
                                                {briefAutoCompiled && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const compiled = compileProjectBrief(jobs, jobMaterials, {
                                                                zone: projectZoneType,
                                                                address: projectAddress,
                                                                authType: authorizationType,
                                                                isEn,
                                                            });
                                                            setProjectIntent(compiled);
                                                            setBriefAutoCompiled(true);
                                                        }}
                                                        className="absolute top-2 right-2 text-[10px] font-medium text-indigo-600 hover:text-indigo-800 bg-white/80 backdrop-blur-sm border border-indigo-200 px-2 py-1 rounded-lg transition-colors"
                                                    >
                                                        ↻ {isEn ? "Recompile" : "Recompiler"}
                                                    </button>
                                                )}
                                            </div>

                                            {/* Additional notes */}
                                            <div>
                                                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                                                    {isEn ? "Additional notes (optional)" : "Notes supplémentaires (optionnel)"}
                                                </label>
                                                <textarea
                                                    value={userNotes}
                                                    onChange={(e) => setUserNotes(e.target.value)}
                                                    rows={2}
                                                    placeholder={isEn
                                                        ? "Add any extra context for the AI analysis: specific concerns, neighbor constraints, materials that must match..."
                                                        : "Ajoutez tout contexte supplémentaire pour l'analyse IA : contraintes voisinage, matériaux imposés, préoccupations spécifiques..."}
                                                    className="w-full mt-1 px-4 py-2.5 rounded-xl bg-white border border-dashed border-slate-300 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-300 transition-shadow resize-none"
                                                />
                                            </div>

                                            <p className="text-[10px] text-slate-400">
                                                {isEn
                                                    ? "This brief is auto-compiled from your works and materials. Edit freely — your changes are preserved."
                                                    : "Ce brief est compilé automatiquement depuis vos travaux et matériaux. Modifiez librement — vos changements sont préservés."}
                                            </p>
                                        </div>

                                        {/* Launch Analysis Button + Back */}
                                        <div className="flex items-center justify-between pt-2">
                                            <button
                                                type="button"
                                                onClick={() => setStep(4)}
                                                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors font-medium"
                                            >
                                                {isEn ? "← Back" : "← Retour"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleRequestAnalysis}
                                                disabled={!pluDocReady}
                                                className={`flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-base transition-all shadow-lg ${
                                                    pluDocReady
                                                        ? "bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-xl"
                                                        : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                                                }`}
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
                                                        {projectZoneType
                                                            ? (isEn ? `Zone ${projectZoneType}` : `Zone ${projectZoneType}`)
                                                            : (isEn ? "Not detected" : "Non détectée")}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-500">
                                                    {projectZoneType && (projectZoneType.toUpperCase().startsWith("U") || projectZoneType.toUpperCase().startsWith("AU"))
                                                        ? (isEn ? "Dense zone allowing extensions up to 40m²." : "Zone dense permettant des extensions jusqu'à 40m².")
                                                        : projectZoneType
                                                            ? (isEn ? "Rural or natural zone — DP threshold at 20m²." : "Zone rurale/naturelle — seuil DP à 20m².")
                                                            : (isEn ? "No PLU zone detected." : "Aucune zone PLU détectée.")}
                                                </p>
                                            </div>
                                            <div className={`rounded-xl border-2 p-4 ${projectProtectedAreas.length > 0 ? "border-amber-200 bg-amber-50/30" : "border-green-200 bg-green-50/30"}`}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <h3 className="text-sm font-bold text-slate-900 uppercase">
                                                        {isEn ? "Protected Area" : "Zone Protégée"}
                                                    </h3>
                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                                        projectProtectedAreas.length > 0
                                                            ? "text-amber-600 bg-amber-100"
                                                            : "text-green-600 bg-green-100"
                                                    }`}>
                                                        {projectProtectedAreas.length > 0
                                                            ? (isEn ? `${projectProtectedAreas.length} zone(s) detected` : `${projectProtectedAreas.length} zone(s) détectée(s)`)
                                                            : (isEn ? "No constraint" : "Aucune contrainte")}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-500 mt-1">
                                                    {projectProtectedAreas.length > 0
                                                        ? projectProtectedAreas.slice(0, 3).map(a => a.name).join(", ")
                                                        : (isEn ? "No heritage constraint detected on the plot." : "Aucune contrainte patrimoniale détectée sur la parcelle.")}
                                                </p>
                                            </div>
                                        </div>

                                        {/* ── Extracted PLU Rules Dashboard ── */}
                                        {(() => {
                                            const rules = pluAnalysisResult?.pluRules;
                                            const analysis = pluAnalysisResult?.analysis;
                                            const notSpecified = isEn ? "Not specified in document" : "Non précisé dans le document";
                                            const formatVal = (v: number | string | null | undefined, unit?: string) => {
                                                if (v === null || v === undefined) return notSpecified;
                                                if (typeof v === "number") return `${v}${unit || ""}`;
                                                return String(v);
                                            };
                                            const formatPercent = (v: number | null | undefined) => {
                                                if (v === null || v === undefined) return notSpecified;
                                                return `${Math.round(v * 100)} %`;
                                            };
                                            const hasRules = !!rules;

                                            return (
                                                <div className="space-y-5">
                                                    {/* Section Header */}
                                                    <div className="flex items-center gap-2">
                                                        <Sparkles className="w-5 h-5 text-indigo-500" />
                                                        <h3 className="text-lg font-bold text-slate-900">
                                                            {isEn ? "Extracted Urban Planning Rules" : "Règles d'Urbanisme Extraites"}
                                                        </h3>
                                                        {rules?.extractionConfidence && (
                                                            <span className={`ml-auto text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                                                                rules.extractionConfidence === "high" ? "bg-green-100 text-green-700" :
                                                                rules.extractionConfidence === "medium" ? "bg-amber-100 text-amber-700" :
                                                                "bg-red-100 text-red-700"
                                                            }`}>
                                                                {rules.extractionConfidence === "high" ? (isEn ? "High confidence" : "Confiance élevée") :
                                                                 rules.extractionConfidence === "medium" ? (isEn ? "Medium confidence" : "Confiance moyenne") :
                                                                 (isEn ? "Low confidence" : "Confiance faible")}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-slate-500 -mt-3">
                                                        {isEn
                                                            ? "These rules were automatically extracted from your PLU document by AI. Compliance cross-check will occur in Phase 2 after the site plan is drawn."
                                                            : "Ces règles ont été automatiquement extraites de votre document PLU par l'IA. Le croisement de conformité se fera en Phase 2, après le dessin du plan de masse."}
                                                    </p>

                                                    {/* ── Numeric Rules Cards ── */}
                                                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                                                        {/* CES */}
                                                        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                                                                    <Box className="w-4 h-4 text-indigo-600" />
                                                                </div>
                                                                <h4 className="text-xs font-bold text-slate-500 uppercase">
                                                                    {isEn ? "Ground Coverage (CES)" : "Emprise au sol (CES)"}
                                                                </h4>
                                                            </div>
                                                            <p className={`text-lg font-bold ${rules?.maxCoverageRatio != null ? "text-slate-900" : "text-slate-400 text-sm"}`}>
                                                                {formatPercent(rules?.maxCoverageRatio)}
                                                            </p>
                                                        </div>

                                                        {/* Max Height */}
                                                        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                                                                    <Building2 className="w-4 h-4 text-amber-600" />
                                                                </div>
                                                                <h4 className="text-xs font-bold text-slate-500 uppercase">
                                                                    {isEn ? "Max Height (Eave)" : "Hauteur Max (Égout)"}
                                                                </h4>
                                                            </div>
                                                            <p className={`text-lg font-bold ${rules?.maxHeight != null ? "text-slate-900" : "text-slate-400 text-sm"}`}>
                                                                {formatVal(rules?.maxHeight, " m")}
                                                            </p>
                                                        </div>

                                                        {/* Max Ridge Height */}
                                                        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                                                                    <Building2 className="w-4 h-4 text-orange-600" />
                                                                </div>
                                                                <h4 className="text-xs font-bold text-slate-500 uppercase">
                                                                    {isEn ? "Max Height (Ridge)" : "Hauteur Max (Faîtage)"}
                                                                </h4>
                                                            </div>
                                                            <p className={`text-lg font-bold ${rules?.maxRidgeHeight != null ? "text-slate-900" : "text-slate-400 text-sm"}`}>
                                                                {formatVal(rules?.maxRidgeHeight, " m")}
                                                            </p>
                                                        </div>

                                                        {/* Green Space */}
                                                        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                                                                    <TreePine className="w-4 h-4 text-green-600" />
                                                                </div>
                                                                <h4 className="text-xs font-bold text-slate-500 uppercase">
                                                                    {isEn ? "Green Space Min" : "Espaces Verts Min"}
                                                                </h4>
                                                            </div>
                                                            <p className={`text-lg font-bold ${rules?.greenSpaceMinPercent != null ? "text-slate-900" : "text-slate-400 text-sm"}`}>
                                                                {rules?.greenSpaceMinPercent != null ? `${rules.greenSpaceMinPercent} %` : notSpecified}
                                                            </p>
                                                        </div>

                                                        {/* Parking */}
                                                        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                                                                    <Car className="w-4 h-4 text-blue-600" />
                                                                </div>
                                                                <h4 className="text-xs font-bold text-slate-500 uppercase">
                                                                    {isEn ? "Parking" : "Stationnement"}
                                                                </h4>
                                                            </div>
                                                            <p className={`text-sm font-semibold ${rules?.parkingRequirements ? "text-slate-900" : "text-slate-400"}`}>
                                                                {rules?.parkingRequirements || notSpecified}
                                                            </p>
                                                        </div>

                                                        {/* Max Fence Height */}
                                                        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center">
                                                                    <Fence className="w-4 h-4 text-slate-600" />
                                                                </div>
                                                                <h4 className="text-xs font-bold text-slate-500 uppercase">
                                                                    {isEn ? "Max Fence Height" : "Clôture Max"}
                                                                </h4>
                                                            </div>
                                                            <p className={`text-lg font-bold ${rules?.maxFenceHeight != null ? "text-slate-900" : "text-slate-400 text-sm"}`}>
                                                                {formatVal(rules?.maxFenceHeight, " m")}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* ── Setbacks Card ── */}
                                                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
                                                        <div className="flex items-center gap-2 mb-3">
                                                            <Ruler className="w-5 h-5 text-violet-500" />
                                                            <h4 className="text-sm font-bold text-slate-900">
                                                                {isEn ? "Required Setbacks" : "Retraits Réglementaires"}
                                                            </h4>
                                                        </div>
                                                        <div className="grid grid-cols-3 gap-3">
                                                            {(["front", "side", "rear"] as const).map((key) => {
                                                                const label = key === "front"
                                                                    ? (isEn ? "Front (Road)" : "Façade (Voie)")
                                                                    : key === "side"
                                                                        ? (isEn ? "Side (Boundaries)" : "Latéral (Limites)")
                                                                        : (isEn ? "Rear" : "Fond de parcelle");
                                                                const val = rules?.setbacks?.[key];
                                                                return (
                                                                    <div key={key} className="text-center rounded-lg border border-slate-200 bg-white p-3">
                                                                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{label}</p>
                                                                        <p className={`text-base font-bold ${val != null ? "text-slate-900" : "text-slate-400 text-xs"}`}>
                                                                            {val != null
                                                                                ? (typeof val === "number" ? `${val} m` : val)
                                                                                : notSpecified}
                                                                        </p>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>

                                                    {/* ── Qualitative Rules ── */}
                                                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 space-y-4">
                                                        <div className="flex items-center gap-2">
                                                            <Palette className="w-5 h-5 text-rose-500" />
                                                            <h4 className="text-sm font-bold text-slate-900">
                                                                {isEn ? "Architectural & Material Rules" : "Règles Architecturales & Matériaux"}
                                                            </h4>
                                                        </div>

                                                        {/* Roof Rules */}
                                                        <div className="space-y-2">
                                                            <p className="text-xs font-bold text-slate-600 uppercase">
                                                                {isEn ? "Roof" : "Toiture"}
                                                            </p>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {(rules?.allowedRoofTypes?.length ?? 0) > 0
                                                                    ? rules!.allowedRoofTypes.map((t: string, i: number) => (
                                                                        <span key={i} className="inline-flex items-center text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2.5 py-0.5">✓ {t}</span>
                                                                    ))
                                                                    : <span className="text-xs text-slate-400 italic">{notSpecified}</span>}
                                                            </div>
                                                            {rules?.roofSlopeRange && (
                                                                <p className="text-xs text-slate-600">
                                                                    <span className="font-semibold">{isEn ? "Slope:" : "Pente :"}</span> {rules.roofSlopeRange}
                                                                </p>
                                                            )}
                                                            {(rules?.allowedRoofMaterials?.length ?? 0) > 0 && (
                                                                <div className="flex flex-wrap gap-1.5">
                                                                    {rules!.allowedRoofMaterials.map((m: string, i: number) => (
                                                                        <span key={i} className="inline-flex items-center text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5">{m}</span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {(rules?.forbiddenRoofMaterials?.length ?? 0) > 0 && (
                                                                <div className="flex flex-wrap gap-1.5">
                                                                    {rules!.forbiddenRoofMaterials.map((m: string, i: number) => (
                                                                        <span key={i} className="inline-flex items-center text-xs bg-red-50 text-red-700 border border-red-200 rounded-full px-2.5 py-0.5">✕ {m}</span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>

                                                        <hr className="border-slate-200" />

                                                        {/* Facade Rules */}
                                                        <div className="space-y-2">
                                                            <p className="text-xs font-bold text-slate-600 uppercase">
                                                                {isEn ? "Facade" : "Façades"}
                                                            </p>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {(rules?.allowedFacadeMaterials?.length ?? 0) > 0
                                                                    ? rules!.allowedFacadeMaterials.map((m: string, i: number) => (
                                                                        <span key={i} className="inline-flex items-center text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2.5 py-0.5">✓ {m}</span>
                                                                    ))
                                                                    : <span className="text-xs text-slate-400 italic">{isEn ? "No restrictions specified" : "Aucune restriction précisée"}</span>}
                                                            </div>
                                                            {(rules?.forbiddenFacadeMaterials?.length ?? 0) > 0 && (
                                                                <div className="flex flex-wrap gap-1.5">
                                                                    {rules!.forbiddenFacadeMaterials.map((m: string, i: number) => (
                                                                        <span key={i} className="inline-flex items-center text-xs bg-red-50 text-red-700 border border-red-200 rounded-full px-2.5 py-0.5">✕ {m}</span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {(rules?.allowedFacadeColors?.length ?? 0) > 0 && (
                                                                <div className="mt-1">
                                                                    <p className="text-[10px] font-semibold text-slate-500 mb-1">{isEn ? "Colors" : "Couleurs"}</p>
                                                                    <div className="flex flex-wrap gap-1.5">
                                                                        {rules!.allowedFacadeColors.map((c: string, i: number) => (
                                                                            <span key={i} className="inline-flex items-center text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2.5 py-0.5">{c}</span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <hr className="border-slate-200" />

                                                        {/* Joinery */}
                                                        <div className="space-y-2">
                                                            <p className="text-xs font-bold text-slate-600 uppercase">
                                                                {isEn ? "Joinery / Windows" : "Menuiseries"}
                                                            </p>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {(rules?.allowedJoineryMaterials?.length ?? 0) > 0
                                                                    ? rules!.allowedJoineryMaterials.map((m: string, i: number) => (
                                                                        <span key={i} className="inline-flex items-center text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2.5 py-0.5">✓ {m}</span>
                                                                    ))
                                                                    : <span className="text-xs text-slate-400 italic">{notSpecified}</span>}
                                                            </div>
                                                        </div>

                                                        {/* Annexes */}
                                                        {rules?.annexRules && (
                                                            <>
                                                                <hr className="border-slate-200" />
                                                                <div className="space-y-1">
                                                                    <p className="text-xs font-bold text-slate-600 uppercase">
                                                                        {isEn ? "Annexes (Garage, Pool, Garden Shed)" : "Annexes (Garage, Piscine, Abri)"}
                                                                    </p>
                                                                    <p className="text-xs text-slate-700">{rules.annexRules}</p>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>

                                                    {/* ── Heritage / ABF Section ── */}
                                                    {(rules?.architectRequired || rules?.abfSpecificConstraints || rules?.heritageNotes) && (
                                                        <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-5 space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <Shield className="w-5 h-5 text-amber-600" />
                                                                <h4 className="text-sm font-bold text-slate-900">
                                                                    {isEn ? "Heritage / ABF Constraints" : "Contraintes Patrimoniales / ABF"}
                                                                </h4>
                                                            </div>
                                                            {rules?.architectRequired && (
                                                                <p className="text-xs text-amber-800 font-semibold flex items-center gap-1">
                                                                    <AlertTriangle className="w-3.5 h-3.5" />
                                                                    {isEn ? "ABF architect approval required" : "Avis de l'Architecte des Bâtiments de France requis"}
                                                                </p>
                                                            )}
                                                            {rules?.abfSpecificConstraints && (
                                                                <p className="text-xs text-slate-700">{rules.abfSpecificConstraints}</p>
                                                            )}
                                                            {rules?.heritageNotes && (
                                                                <p className="text-xs text-slate-600 italic">{rules.heritageNotes}</p>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* ── AI Notes ── */}
                                                    {rules?.notes && rules.notes.trim().length > 0 && (
                                                        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                                                            <div className="flex items-start gap-2">
                                                                <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                                                                <p className="text-xs text-blue-800">{rules.notes}</p>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* ── Phase 2 Notice ── */}
                                                    <div className="rounded-lg border border-indigo-200 bg-indigo-50/30 p-3">
                                                        <div className="flex items-start gap-2">
                                                            <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                                                            <p className="text-xs text-indigo-700">
                                                                {isEn
                                                                    ? "Compliance verification will be performed automatically in Phase 2 once the site plan is drawn and building dimensions are defined."
                                                                    : "La vérification de conformité sera effectuée automatiquement en Phase 2, une fois le plan de masse dessiné et les dimensions du bâtiment définies."}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* ── No rules fallback ── */}
                                                    {!hasRules && (
                                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
                                                            <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                                            <p className="text-sm text-slate-500">
                                                                {isEn
                                                                    ? "No PLU rules extracted yet. Upload the PLU document and run the analysis."
                                                                    : "Aucune règle PLU extraite pour l'instant. Uploadez le document PLU et lancez l'analyse."}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                        {/* ── Feasibility Matrix (ANALYSE DE LA REGLEMENTATION) ── */}
                                        {feasibilityLoading && (
                                            <div className="mt-6">
                                                <div className="flex items-center gap-2 mb-4">
                                                    <Sparkles className="w-5 h-5 text-indigo-500" />
                                                    <h3 className="text-lg font-bold text-slate-900">
                                                        {isEn ? "Regulatory Analysis" : "Analyse de la Réglementation"}
                                                    </h3>
                                                </div>
                                                <FeasibilityMatrixSkeleton />
                                            </div>
                                        )}

                                        {feasibilityReport && !feasibilityLoading && (
                                            <div className="mt-6">
                                                <div className="flex items-center gap-2 mb-4">
                                                    <Sparkles className="w-5 h-5 text-indigo-500" />
                                                    <h3 className="text-lg font-bold text-slate-900">
                                                        {isEn ? "Regulatory Analysis" : "Analyse de la Réglementation"}
                                                    </h3>
                                                    {feasibilitySource === "fallback" && (
                                                        <span className="ml-auto text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                            <AlertTriangle className="w-3 h-3" />
                                                            {isEn ? "Default analysis" : "Analyse par défaut"}
                                                        </span>
                                                    )}
                                                </div>
                                                <FeasibilityMatrix
                                                    report={feasibilityReport}
                                                    address={projectAddress}
                                                    zone={projectZoneType}
                                                    protectedAreas={projectProtectedAreas}
                                                    isEn={isEn}
                                                />
                                            </div>
                                        )}

                                        {/* Back + Go to 3D */}
                                        <div className="flex items-center justify-between pt-2">
                                            <button
                                                type="button"
                                                onClick={() => setStep(5)}
                                                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors font-medium"
                                            >
                                                {isEn ? "← Back to Analysis" : "← Retour à l'analyse"}
                                            </button>
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
                                    <div className="space-y-5">

                                        {/* ── Header card ── */}
                                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                            {/* Gradient banner */}
                                            <div style={{
                                                background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 45%, #4c1d95 100%)",
                                                padding: "32px 32px 28px",
                                                position: "relative",
                                                overflow: "hidden",
                                            }}>
                                                {/* Decorative grid pattern */}
                                                <div style={{
                                                    position: "absolute", inset: 0,
                                                    backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
                                                    backgroundSize: "24px 24px",
                                                }} />
                                                {/* Decorative glow */}
                                                <div style={{
                                                    position: "absolute", top: "-40px", right: "-40px",
                                                    width: 220, height: 220,
                                                    borderRadius: "50%",
                                                    background: "radial-gradient(circle, rgba(167,139,250,0.25) 0%, transparent 70%)",
                                                }} />

                                                <div style={{ position: "relative", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24 }}>
                                                    <div>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                                                            <div style={{
                                                                width: 42, height: 42, borderRadius: 12,
                                                                background: "rgba(167,139,250,0.2)",
                                                                border: "1px solid rgba(167,139,250,0.4)",
                                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                            }}>
                                                                <Cpu style={{ width: 20, height: 20, color: "#c4b5fd" }} />
                                                            </div>
                                                            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#a78bfa" }}>
                                                                Intelligence Editor
                                                            </span>
                                                        </div>
                                                        <h2 style={{ fontSize: 26, fontWeight: 800, color: "#fff", margin: 0, lineHeight: 1.2 }}>
                                                            {isEn ? "2D + 3D Design Workspace" : "Espace de conception 2D + 3D"}
                                                        </h2>
                                                        <p style={{ marginTop: 8, fontSize: 13, color: "rgba(196,181,253,0.9)", maxWidth: 420, lineHeight: 1.5 }}>
                                                            {isEn
                                                                ? "Design your site plan on a satellite base, sculpt the terrain in 3D, place buildings and validate PLU compliance — all in one professional workspace."
                                                                : "Dessinez votre plan de masse sur fond satellite, sculptez le terrain en 3D, posez les bâtiments et validez la conformité PLU — dans un seul espace professionnel."}
                                                        </p>
                                                    </div>

                                                    {/* Validated badge */}
                                                    {designValidated && (
                                                        <div style={{
                                                            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                                                            background: "rgba(74,222,128,0.12)",
                                                            border: "1px solid rgba(74,222,128,0.35)",
                                                            borderRadius: 14, padding: "12px 18px",
                                                            animation: "fadeIn 0.4s ease",
                                                        }}>
                                                            <div style={{
                                                                width: 36, height: 36, borderRadius: "50%",
                                                                background: "rgba(74,222,128,0.2)",
                                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                            }}>
                                                                <Check style={{ width: 18, height: 18, color: "#4ade80" }} />
                                                            </div>
                                                            <span style={{ fontSize: 11, fontWeight: 700, color: "#4ade80", textAlign: "center", lineHeight: 1.3 }}>
                                                                {isEn ? "Design\nSaved" : "Conception\nSauvegardée"}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Feature grid */}
                                            <div style={{ padding: "24px 28px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                                                {([
                                                    {
                                                        icon: <Layers style={{ width: 15, height: 15, color: "#6366f1" }} />,
                                                        color: "rgba(99,102,241,0.08)",
                                                        border: "rgba(99,102,241,0.18)",
                                                        title: isEn ? "2D Site Plan" : "Plan de masse 2D",
                                                        desc: isEn ? "Draw on satellite imagery, snap-to-grid, dimension labels, parcel outlines, VRD networks" : "Dessin sur fond satellite, grille magnétique, cotations, parcelles cadastrales, réseaux VRD",
                                                    },
                                                    {
                                                        icon: <Mountain style={{ width: 15, height: 15, color: "#7c3aed" }} />,
                                                        color: "rgba(124,58,237,0.08)",
                                                        border: "rgba(124,58,237,0.18)",
                                                        title: isEn ? "3D Terrain Viewer" : "Visualisation 3D du terrain",
                                                        desc: isEn ? "Real IGN RGE Alti® elevation data, sculpt terrain, height exaggeration, shadow & lighting" : "Données IGN RGE Alti® réelles, sculpture du terrain, exagération de hauteur, ombres",
                                                    },
                                                    {
                                                        icon: <Building2 style={{ width: 15, height: 15, color: "#0891b2" }} />,
                                                        color: "rgba(8,145,178,0.08)",
                                                        border: "rgba(8,145,178,0.18)",
                                                        title: isEn ? "Smart Building Placement" : "Placement intelligent des bâtiments",
                                                        desc: isEn ? "Guided & free creation modes, roof configurator, wall heights, building openings & overhang" : "Modes guidé & libre, configurateur de toiture, hauteurs, ouvertures & débords",
                                                    },
                                                    {
                                                        icon: <Shield style={{ width: 15, height: 15, color: "#16a34a" }} />,
                                                        color: "rgba(22,163,74,0.08)",
                                                        border: "rgba(22,163,74,0.18)",
                                                        title: isEn ? "Live PLU Compliance" : "Conformité PLU en temps réel",
                                                        desc: isEn ? "Real-time setback, coverage & green space checks against your extracted PLU rules" : "Vérification en temps réel des reculs, CES et espaces verts selon les règles PLU extraites",
                                                    },
                                                ] as const).map((feat, fi) => (
                                                    <div key={fi} style={{
                                                        background: feat.color,
                                                        border: `1px solid ${feat.border}`,
                                                        borderRadius: 12,
                                                        padding: "14px 16px",
                                                    }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                                                            {feat.icon}
                                                            <span style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}>{feat.title}</span>
                                                        </div>
                                                        <p style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5, margin: 0 }}>{feat.desc}</p>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* CTA footer */}
                                            <div style={{
                                                padding: "0 28px 24px",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                gap: 16,
                                            }}>
                                                <div>
                                                    {designValidated ? (
                                                        <p style={{ fontSize: 12, color: "#16a34a", fontWeight: 600, margin: 0 }}>
                                                            ✓ {isEn ? "Your design has been saved. You can re-open the editor at any time." : "Votre conception a été sauvegardée. Vous pouvez rouvrir l\'éditeur à tout moment."}
                                                        </p>
                                                    ) : (
                                                        <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
                                                            {isEn
                                                                ? "Click \"Open Editor\" to launch the full 2D & 3D workspace. Your work is auto-saved."
                                                                : "Cliquez sur \"Ouvrir l\'éditeur\" pour lancer l\'espace de travail 2D & 3D complet. Votre travail est sauvegardé automatiquement."}
                                                        </p>
                                                    )}
                                                </div>
                                                <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                                                    {/* Open editor button */}
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const returnTo = encodeURIComponent(
                                                                `/projects/${projectId}/project-description?designed=1`
                                                            );
                                                            router.push(`/site-plan?project=${projectId}&returnTo=${returnTo}`);
                                                        }}
                                                        style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: 8,
                                                            padding: "11px 22px",
                                                            background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
                                                            color: "#fff",
                                                            fontWeight: 700,
                                                            fontSize: 13,
                                                            borderRadius: 12,
                                                            border: "none",
                                                            cursor: "pointer",
                                                            boxShadow: "0 4px 16px rgba(79,70,229,0.4)",
                                                            transition: "all 0.18s ease",
                                                            letterSpacing: "0.01em",
                                                            whiteSpace: "nowrap",
                                                        }}
                                                        onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-1px)")}
                                                        onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}
                                                    >
                                                        <ExternalLink style={{ width: 14, height: 14 }} />
                                                        {designValidated
                                                            ? (isEn ? "Re-open Editor" : "Rouvrir l\'éditeur")
                                                            : (isEn ? "Open Intelligence Editor" : "Ouvrir l\'éditeur Intelligence")}
                                                    </button>

                                                    {/* Continue to complete file — only shown when validated */}
                                                    {designValidated && (
                                                        <button
                                                            type="button"
                                                            onClick={handleValidateDesign}
                                                            style={{
                                                                display: "flex",
                                                                alignItems: "center",
                                                                gap: 8,
                                                                padding: "11px 22px",
                                                                background: "#16a34a",
                                                                color: "#fff",
                                                                fontWeight: 700,
                                                                fontSize: 13,
                                                                borderRadius: 12,
                                                                border: "none",
                                                                cursor: "pointer",
                                                                boxShadow: "0 4px 16px rgba(22,163,74,0.3)",
                                                                transition: "all 0.18s ease",
                                                                whiteSpace: "nowrap",
                                                            }}
                                                            onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-1px)")}
                                                            onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}
                                                        >
                                                            <Check style={{ width: 14, height: 14 }} />
                                                            {isEn ? "Continue to Complete File →" : "Continuer vers le dossier complet →"}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* ── Back navigation ── */}
                                        <div className="flex items-center justify-between pt-1">
                                            <button
                                                type="button"
                                                onClick={() => setStep(6)}
                                                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors font-medium"
                                            >
                                                {isEn ? "← Back to Analysis" : "← Retour à l'analyse"}
                                            </button>
                                            {!designValidated && (
                                                <p className="text-xs text-slate-400 italic">
                                                    {isEn ? "Open the editor and return here to continue" : "Ouvrez l'éditeur et revenez ici pour continuer"}
                                                </p>
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
                                                    ) : selectedDoc === "PC1" ? (
                                                        /* ═══ PC1 — Plan de situation ═══ */
                                                        <div className="bg-white">
                                                            {/* Document header */}
                                                            <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-8 py-5 text-white">
                                                                <div className="flex items-center justify-between">
                                                                    <div>
                                                                        <h2 className="text-sm font-black uppercase tracking-wider">PC1 — {isEn ? "Site Location Plan" : "Plan de Situation"}</h2>
                                                                        <p className="text-xs text-slate-300 mt-1">{isEn ? "Location of the project site" : "Localisation du terrain du projet"}</p>
                                                                    </div>
                                                                    <div className="text-right text-xs text-slate-300">
                                                                        <p>{isEn ? "Scale: 1/2500 to 1/25000" : "Échelle : 1/2500 à 1/25000"}</p>
                                                                        <p>{new Date().toLocaleDateString(isEn ? 'en-GB' : 'fr-FR')}</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            {/* Content */}
                                                            <div className="px-8 py-6 space-y-5">
                                                                <div className="grid grid-cols-2 gap-4">
                                                                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{isEn ? "Project Address" : "Adresse du projet"}</p>
                                                                        <p className="text-sm font-semibold text-slate-800">{projectAddress || (isEn ? "Not specified" : "Non renseignée")}</p>
                                                                    </div>
                                                                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{isEn ? "Applicant" : "Demandeur"}</p>
                                                                        <p className="text-sm font-semibold text-slate-800">{applicantName ? `${applicantFirstNames} ${applicantName}` : (isEn ? "Not specified" : "Non renseigné")}</p>
                                                                    </div>
                                                                </div>
                                                                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{isEn ? "Cadastral Reference" : "Référence cadastrale"}</p>
                                                                    <p className="text-sm text-slate-700">{isEn ? "Section and plot number as indicated in the site plan." : "Section et numéro de parcelle tels qu'indiqués dans le plan de masse."}</p>
                                                                </div>
                                                                {/* Captured image or SVG fallback */}
                                                                <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 min-h-[280px]">
                                                                    {capturedImages['PC1'] ? (
                                                                        <div>
                                                                            <img src={capturedImages['PC1']} alt="Plan de situation — neighborhood map" className="w-full h-auto max-h-[400px] object-contain" crossOrigin="anonymous" />
                                                                            <div className="px-4 py-2 bg-slate-100 border-t border-slate-200 text-xs text-slate-500 text-center">
                                                                                {isEn ? "Neighborhood map — OpenStreetMap © contributors" : "Carte de voisinage — OpenStreetMap © contributeurs"}
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="flex flex-col items-center gap-3 py-12">
                                                                            <MapPin className="w-10 h-10 text-blue-400" />
                                                                            <p className="text-sm text-slate-500 font-medium">{isEn ? "Neighborhood map not yet generated" : "Carte de voisinage non encore générée"}</p>
                                                                            <p className="text-xs text-slate-400">{isEn ? "Return to the editor and click \"Continue to Complete File\" to auto-generate from coordinates." : "Retournez à l'éditeur et cliquez « Continuer vers le dossier complet » pour générer automatiquement depuis les coordonnées."}</p>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-2 text-xs text-slate-400">
                                                                    <Mountain className="w-3.5 h-3.5" />
                                                                    <span>{isEn ? "North is oriented upwards" : "Le Nord est orienté vers le haut"}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : selectedDoc === "PC2" ? (
                                                        /* ═══ PC2 — Plan de masse ═══ */
                                                        <div className="bg-white">
                                                            <div className="bg-gradient-to-r from-emerald-800 to-emerald-700 px-8 py-5 text-white">
                                                                <div className="flex items-center justify-between">
                                                                    <div>
                                                                        <h2 className="text-sm font-black uppercase tracking-wider">PC2 — {isEn ? "Site Layout Plan" : "Plan de Masse"}</h2>
                                                                        <p className="text-xs text-emerald-200 mt-1">{isEn ? "Detailed layout of buildings and surfaces" : "Implantation détaillée des constructions et surfaces"}</p>
                                                                    </div>
                                                                    <div className="text-right text-xs text-emerald-200">
                                                                        <p>{isEn ? "Scale: 1/100 to 1/500" : "Échelle : 1/100 à 1/500"}</p>
                                                                        <p>{new Date().toLocaleDateString(isEn ? 'en-GB' : 'fr-FR')}</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="px-6 py-5">
                                                                {capturedImages['PC2'] ? (
                                                                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                                                        <img src={capturedImages['PC2']} alt="Plan de masse" className="w-full h-auto" />
                                                                    </div>
                                                                ) : (
                                                                    <div className="border-2 border-dashed border-emerald-200 rounded-xl bg-emerald-50/50 flex flex-col items-center justify-center py-16">
                                                                        <Layers className="w-10 h-10 text-emerald-400 mb-3" />
                                                                        <p className="text-sm text-emerald-700 font-medium">{isEn ? "Site layout captured from the editor" : "Plan de masse capturé depuis l'éditeur"}</p>
                                                                        <p className="text-xs text-emerald-500 mt-1">{isEn ? "Return to the editor to generate" : "Retournez à l'éditeur pour générer"}</p>
                                                                    </div>
                                                                )}
                                                                <div className="mt-4 grid grid-cols-3 gap-3">
                                                                    <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-100">
                                                                        <p className="text-[10px] text-slate-400 font-bold uppercase">{isEn ? "Total Footprint" : "Emprise totale"}</p>
                                                                        <p className="text-lg font-bold text-slate-800">{jobs.reduce((s, j) => s + (j.footprint || 0), 0)} m²</p>
                                                                    </div>
                                                                    <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-100">
                                                                        <p className="text-[10px] text-slate-400 font-bold uppercase">{isEn ? "Levels" : "Niveaux"}</p>
                                                                        <p className="text-lg font-bold text-slate-800">{jobs[0]?.levels || '—'}</p>
                                                                    </div>
                                                                    <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-100">
                                                                        <p className="text-[10px] text-slate-400 font-bold uppercase">{isEn ? "Type" : "Type"}</p>
                                                                        <p className="text-lg font-bold text-slate-800">{authorizationType}</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : selectedDoc === "PC3" ? (
                                                        /* ═══ PC3 — Cross section ═══ */
                                                        <div className="bg-white">
                                                            <div className="bg-gradient-to-r from-amber-800 to-amber-700 px-8 py-5 text-white">
                                                                <div className="flex items-center justify-between">
                                                                    <div>
                                                                        <h2 className="text-sm font-black uppercase tracking-wider">PC3 — {isEn ? "Cross Section" : "Plan en Coupe"}</h2>
                                                                        <p className="text-xs text-amber-200 mt-1">{isEn ? "Terrain and building profile" : "Profil du terrain et de la construction"}</p>
                                                                    </div>
                                                                    <div className="text-right text-xs text-amber-200">
                                                                        <p>{isEn ? "Scale: 1/100 to 1/200" : "Échelle : 1/100 à 1/200"}</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="px-6 py-5">
                                                                {capturedImages['PC3'] ? (
                                                                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                                                        <img src={capturedImages['PC3']} alt="Cross section — orthographic side view" className="w-full h-auto" />
                                                                        <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 text-center">
                                                                            {isEn ? "Orthographic side view — captured from the 3D terrain editor" : "Vue latérale orthographique — capturée depuis l'éditeur 3D"}
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="border-2 border-dashed border-amber-200 rounded-xl bg-amber-50/50 p-8 text-center">
                                                                        <Mountain className="w-10 h-10 text-amber-300 mx-auto mb-3" />
                                                                        <p className="text-sm font-semibold text-amber-700">{isEn ? "Cross-section not yet captured" : "Coupe non encore capturée"}</p>
                                                                        <p className="text-xs text-amber-500 mt-1">{isEn ? "Return to the site plan editor and click \"Continue to Complete File\" to generate this view." : "Retournez à l'éditeur de plan de masse et cliquez « Continuer vers le dossier complet » pour générer cette vue."}</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : selectedDoc === "PC5.1" ? (
                                                        /* ═══ PC5.1 — Facades (Initial State) ═══ */
                                                        <div className="bg-white">
                                                            <div className="bg-gradient-to-r from-violet-800 to-violet-700 px-8 py-5 text-white">
                                                                <div className="flex items-center justify-between">
                                                                    <div>
                                                                        <h2 className="text-sm font-black uppercase tracking-wider">PC5.1 — {isEn ? "Facades – Initial State" : "Façades – État Initial"}</h2>
                                                                        <p className="text-xs text-violet-200 mt-1">{isEn ? "Current state before construction" : "État actuel avant travaux"}</p>
                                                                    </div>
                                                                    <div className="text-right text-xs text-violet-200">
                                                                        <p>{isEn ? "Scale: 1/100" : "Échelle : 1/100"}</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="px-6 py-5">
                                                                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white p-6">
                                                                    <svg viewBox="0 0 600 200" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                                                                        {/* Ground */}
                                                                        <rect x="0" y="160" width="600" height="40" fill="#f0fdf4" />
                                                                        <line x1="0" y1="160" x2="600" y2="160" stroke="#65a30d" strokeWidth="2" />
                                                                        {/* Grass texture */}
                                                                        {Array.from({ length: 30 }).map((_, i) => (
                                                                            <line key={i} x1={20 + i * 19} y1="160" x2={15 + i * 19} y2="152" stroke="#86efac" strokeWidth="1" />
                                                                        ))}
                                                                        {/* Empty plot indication */}
                                                                        <text x="300" y="100" fontSize="14" fill="#94a3b8" textAnchor="middle" fontStyle="italic">
                                                                            {isEn ? "Vacant/undeveloped plot" : "Terrain vierge / non bâti"}
                                                                        </text>
                                                                        <text x="300" y="125" fontSize="10" fill="#cbd5e1" textAnchor="middle">
                                                                            {projectAddress || (isEn ? "Address not specified" : "Adresse non renseignée")}
                                                                        </text>
                                                                        {/* Property boundaries */}
                                                                        <line x1="50" y1="40" x2="50" y2="160" stroke="#6366f1" strokeWidth="1.5" strokeDasharray="8 4" />
                                                                        <line x1="550" y1="40" x2="550" y2="160" stroke="#6366f1" strokeWidth="1.5" strokeDasharray="8 4" />
                                                                        <text x="50" y="35" fontSize="8" fill="#6366f1" textAnchor="middle">{isEn ? "Property limit" : "Limite de propriété"}</text>
                                                                        <text x="550" y="35" fontSize="8" fill="#6366f1" textAnchor="middle">{isEn ? "Property limit" : "Limite de propriété"}</text>
                                                                        {/* Sky */}
                                                                        <text x="300" y="20" fontSize="8" fill="#93c5fd" textAnchor="middle">{isEn ? "(No existing construction)" : "(Aucune construction existante)"}</text>
                                                                    </svg>
                                                                </div>
                                                                <div className="mt-4 bg-violet-50 rounded-xl p-4 border border-violet-100">
                                                                    <p className="text-xs font-semibold text-violet-800 mb-1">{isEn ? "Current State Description" : "Description de l'état actuel"}</p>
                                                                    <p className="text-xs text-violet-600 leading-relaxed">
                                                                        {isEn
                                                                            ? `The plot located at ${projectAddress || '—'} is currently undeveloped. The terrain is ${terrainInitial || 'generally flat'} with natural vegetation.`
                                                                            : `La parcelle située ${projectAddress || '—'} est actuellement non bâtie. Le terrain est ${terrainInitial || 'globalement plat'} avec de la végétation naturelle.`}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : selectedDoc === "PC5.2" ? (
                                                        /* ═══ PC5.2 — Facades (Project) ═══ */
                                                        <div className="bg-white">
                                                            <div className="bg-gradient-to-r from-rose-800 to-rose-700 px-8 py-5 text-white">
                                                                <div className="flex items-center justify-between">
                                                                    <div>
                                                                        <h2 className="text-sm font-black uppercase tracking-wider">PC5.2 — {isEn ? "Facades – Project" : "Façades – Projet"}</h2>
                                                                        <p className="text-xs text-rose-200 mt-1">{isEn ? "Proposed construction appearance" : "Aspect de la construction projetée"}</p>
                                                                    </div>
                                                                    <div className="text-right text-xs text-rose-200">
                                                                        <p>{isEn ? "Scale: 1/100" : "Échelle : 1/100"}</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="px-6 py-5">
                                                                {capturedImages['PC5.2'] ? (
                                                                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                                                        <img src={capturedImages['PC5.2']} alt="3D facade view" className="w-full h-auto" />
                                                                        <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 text-center">
                                                                            {isEn ? "3D perspective — captured from the site plan editor" : "Perspective 3D — capturée depuis l'éditeur de plan de masse"}
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="border-2 border-dashed border-rose-200 rounded-xl bg-rose-50/50 p-8 text-center">
                                                                        <Layers className="w-10 h-10 text-rose-300 mx-auto mb-3" />
                                                                        <p className="text-sm font-semibold text-rose-700">{isEn ? "Facade view not yet captured" : "Vue de façade non encore capturée"}</p>
                                                                        <p className="text-xs text-rose-500 mt-1">{isEn ? "Return to the site plan editor and click \"Continue to Complete File\" to generate this orthographic front view from your 3D model." : "Retournez à l'éditeur de plan de masse et cliquez « Continuer vers le dossier complet » pour générer cette vue frontale orthographique depuis votre modèle 3D."}</p>
                                                                    </div>
                                                                )}
                                                                {/* Materials summary */}
                                                                <div className="mt-4 grid grid-cols-2 gap-3">
                                                                    <div className="bg-rose-50 rounded-lg p-3 border border-rose-100">
                                                                        <p className="text-[10px] font-bold text-rose-400 uppercase">{isEn ? "Walls" : "Murs"}</p>
                                                                        <p className="text-sm font-medium text-rose-800">{existingFacade || wallMaterial || (isEn ? "To be defined" : "À définir")}</p>
                                                                    </div>
                                                                    <div className="bg-rose-50 rounded-lg p-3 border border-rose-100">
                                                                        <p className="text-[10px] font-bold text-rose-400 uppercase">{isEn ? "Roofing" : "Toiture"}</p>
                                                                        <p className="text-sm font-medium text-rose-800">{roofCovering || roofMaterial || (isEn ? "To be defined" : "À définir")}</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        /* Fallback for any unhandled document codes */
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

                                        {/* ── MANDATE 4 & 5: Navigation + Print/Download ── */}
                                        <div className="flex items-center justify-between pt-4 pb-2">
                                            <div className="flex items-center gap-3">
                                                {/* Back to 3D Editor */}
                                                <button
                                                    type="button"
                                                    onClick={() => setStep(7)}
                                                    className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors font-medium"
                                                >
                                                    {isEn ? "← Back to 3D Editor" : "← Retour à l'éditeur 3D"}
                                                </button>
                                                <span className="text-slate-300">|</span>
                                                {/* Re-open Intelligence Editor */}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const returnTo = encodeURIComponent(
                                                            `/projects/${projectId}/project-description?designed=1`
                                                        );
                                                        router.push(`/site-plan?project=${projectId}&returnTo=${returnTo}`);
                                                    }}
                                                    className="flex items-center gap-1.5 text-sm text-indigo-500 hover:text-indigo-700 transition-colors font-medium"
                                                >
                                                    {isEn ? "Re-open Site Plan Editor" : "Rouvrir l'éditeur de plan de masse"}
                                                </button>
                                            </div>
                                            {/* Download Full Dossier */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    // Add print-dossier class to body for @media print styles
                                                    document.body.classList.add('printing-dossier');
                                                    window.print();
                                                    // Remove after print dialog closes
                                                    setTimeout(() => document.body.classList.remove('printing-dossier'), 1000);
                                                }}
                                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white transition-all shadow-md hover:shadow-lg"
                                            >
                                                <Download className="w-4 h-4" />
                                                {isEn ? "Download Full Dossier (PDF)" : "Télécharger le dossier complet (PDF)"}
                                            </button>
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
                                                    {isEn ? "Your administrative documents" : "Vos pièces administratives"}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold uppercase">
                                                    {authorizationType || "—"}
                                                </span>
                                                <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 transition-colors">
                                                    <Download className="w-3 h-3" />
                                                    {isEn ? "Export all" : "Tout exporter"}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Document list */}
                                        <div className="divide-y divide-slate-50">
                                            {activeDocs.map((doc: DocEntry) => {
                                                const isPhotoReady = doc.photoType === "near" ? nearPhotoUploaded : doc.photoType === "far" ? farPhotoUploaded : false;
                                                const isReady = doc.unlocked
                                                    || isPhotoReady
                                                    || (doc.code.includes("8-1") && step >= 5)
                                                    || (doc.code === "PC4" && step >= 5)
                                                    || (doc.code === "PCMI" && step >= 4)
                                                    || (doc.code === "CERFA" && step >= 5)
                                                    || step >= 7;
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
                                                            <p className="text-xs font-medium text-slate-800 truncate">{isEn ? doc.labelEn : doc.labelFr}</p>
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

            {/* ══ CONFIRMATION MODAL ══ */}
            {showConfirmModal && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" style={{ zIndex: 9999 }}>
                    <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 space-y-5">
                        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
                            <AlertTriangle className="w-8 h-8 text-amber-600" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 text-center">
                            {isEn ? "Confirm your project description" : "Confirmez votre description de projet"}
                        </h3>
                        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-2">
                            <p className="text-sm text-amber-800 font-medium">
                                {isEn
                                    ? "Please confirm that your project description is final. Any further modification will result in additional billing."
                                    : "Veuillez confirmer que votre description de projet est définitive. Toute modification ultérieure entraînera une facturation supplémentaire."}
                            </p>
                            <ul className="text-xs text-amber-700 space-y-1 ml-4 list-disc">
                                <li>{isEn ? "The generation consumes Gemini AI tokens" : "La génération consomme des tokens IA Gemini"}</li>
                                <li>{isEn ? "First generation is included" : "La première génération est incluse"}</li>
                                <li>{isEn ? "Any major modification → additional billing" : "Toute modification majeure → facturation additionnelle"}</li>
                            </ul>
                        </div>
                        {generationCount > 0 && (
                            <div className="rounded-xl bg-blue-50 border border-blue-200 p-3">
                                <p className="text-xs text-blue-700 font-medium">
                                    {isEn
                                        ? `This is a re-generation (${generationCount} previous). 2 credits will be deducted.`
                                        : `Ceci est une re-génération (${generationCount} précédente${generationCount > 1 ? "s" : ""}). 2 crédits seront déduits.`}
                                </p>
                            </div>
                        )}
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setShowConfirmModal(false)}
                                className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-colors"
                            >
                                {isEn ? "Cancel" : "Annuler"}
                            </button>
                            <button
                                type="button"
                                onClick={handleStartAnalysis}
                                className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-colors shadow-md"
                            >
                                {isEn ? "Confirm & Generate" : "Confirmer & Générer"}
                            </button>
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
                            {analysisComplete
                                ? (generationError
                                    ? (isEn ? "Generation Error" : "Erreur de génération")
                                    : (isEn ? "Analysis Complete!" : "Analyse terminée !"))
                                : (isEn ? "Analysis in progress..." : "Analyse en cours...")}
                        </h3>
                        <p className="text-sm text-slate-500">
                            {analysisComplete
                                ? (generationError
                                    ? generationError
                                    : (isEn
                                        ? "Your descriptive notice has been generated by AI. Review the compliance results."
                                        : "Votre notice descriptive a été générée par l'IA. Consultez les résultats de conformité."))
                                : (isEn
                                    ? "The AI is generating your descriptive notice and cross-referencing with PLU rules..."
                                    : "L'IA génère votre notice descriptive et croise avec les règles du PLU...")}
                        </p>

                        {/* Progress bar */}
                        <div className="space-y-2">
                            <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-300 ease-out ${generationError ? "bg-red-500" : "bg-indigo-600"}`}
                                    style={{ width: `${Math.min(analysisProgress, 100)}%` }}
                                />
                            </div>
                            <p className="text-xs text-slate-500">
                                {analysisComplete
                                    ? (generationError ? (isEn ? "Failed" : "Échoué") : (isEn ? "Complete" : "Terminé"))
                                    : `${isEn ? "Generating notice..." : "Génération de la notice..."} ${Math.min(Math.round(analysisProgress), 100)}%`}
                            </p>
                        </div>

                        {/* View Results button (appears when complete) */}
                        {analysisComplete && !generationError && (
                            <button
                                type="button"
                                onClick={handleViewResults}
                                className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-bold text-base hover:bg-indigo-700 transition-colors shadow-md"
                            >
                                {isEn ? "View Results" : "Voir le résultat"}
                            </button>
                        )}
                        {analysisComplete && generationError && (
                            <button
                                type="button"
                                onClick={() => { setShowAnalysisModal(false); setGenerationError(null); }}
                                className="w-full py-3.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-base hover:bg-slate-200 transition-colors"
                            >
                                {isEn ? "Close" : "Fermer"}
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
