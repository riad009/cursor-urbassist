"use client";

import React, { use, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navigation from "@/components/layout/Navigation";
import {
    Loader2,
    Save,
    ArrowRight,
    MapPin,
    ClipboardList,
    ChevronDown,
    ChevronRight,
    FileCheck,
    Zap,
    CheckCircle2,
    AlertTriangle,
    Upload,
    FileText,
    X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";

interface ProjectData {
    id: string;
    name: string;
    address: string | null;
    projectType?: string | null;
    projectDescription?: Record<string, unknown> | null;
    regulatoryAnalysis?: { id: string } | null;
    coordinates?: string | null;
}

export default function ProjectDescriptionPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: projectId } = use(params);
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const { t } = useLanguage();

    const ROOF_TYPES = [
        { value: "flat", label: t("desc.roofFlat") },
        { value: "dual_pitch", label: t("desc.roofDualPitch") },
        { value: "single_pitch", label: t("desc.roofSinglePitch") },
    ];

    const VRD_NETWORKS = [
        { id: "electricity", label: t("desc.vrdElectricity") },
        { id: "drinking_water", label: t("desc.vrdWater") },
        { id: "wastewater", label: t("desc.vrdWastewater") },
        { id: "telecom", label: t("desc.vrdTelecom") },
        { id: "other", label: t("desc.vrdOther") },
    ];

    const [project, setProject] = useState<ProjectData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [expandedSections, setExpandedSections] = useState<Set<string>>(
        new Set(["description", "materials", "access"])
    );

    // Form state
    const [description, setDescription] = useState("");
    const [exteriorMaterials, setExteriorMaterials] = useState("");
    const [roofType, setRoofType] = useState("");
    const [accessInfo, setAccessInfo] = useState("");
    const [parkingExisting, setParkingExisting] = useState(0);
    const [parkingNew, setParkingNew] = useState(0);

    // Existing building
    const [existingBuildingInfo, setExistingBuildingInfo] = useState("");
    const [proposedProjectInfo, setProposedProjectInfo] = useState("");
    const [vrdConnections, setVrdConnections] = useState<Record<string, boolean>>({});

    // Regulation analysis
    const [showLaunchConfirm, setShowLaunchConfirm] = useState(false);
    const [launchingPlu, setLaunchingPlu] = useState(false);
    const [pluCreditsCost, setPluCreditsCost] = useState(3);

    // Regulatory document upload (multi-file)
    const [regulatoryFiles, setRegulatoryFiles] = useState<File[]>([]);
    const [uploadingRegDocs, setUploadingRegDocs] = useState(false);
    const [regDocsUploaded, setRegDocsUploaded] = useState(false);

    const isExistingBuilding = project?.projectType === "extension" || project?.projectType === "existing_extension";

    // Load project data
    useEffect(() => {
        if (!projectId || !user) {
            if (!authLoading) setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        fetch(`/api/projects/${projectId}`, { credentials: "include" })
            .then((r) => r.json())
            .then((data) => {
                if (cancelled) return;
                if (data.project) {
                    setProject(data.project);
                    // Restore saved description if any
                    const desc = data.project.projectDescription as Record<string, unknown> | null;
                    if (desc) {
                        setDescription((desc.description as string) || "");
                        setExteriorMaterials((desc.exteriorMaterials as string) || "");
                        setRoofType((desc.roofType as string) || "");
                        setAccessInfo((desc.accessInfo as string) || "");
                        setParkingExisting((desc.parkingExisting as number) || 0);
                        setParkingNew((desc.parkingNew as number) || 0);
                        setExistingBuildingInfo((desc.existingBuildingInfo as string) || "");
                        setProposedProjectInfo((desc.proposedProjectInfo as string) || "");
                        setVrdConnections((desc.vrdConnections as Record<string, boolean>) || {});
                    }
                }
            })
            .catch(() => { })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [projectId, user, authLoading]);

    // Load PLU credits cost
    useEffect(() => {
        fetch("/api/settings")
            .then((r) => r.json())
            .then((d) => setPluCreditsCost(d.pluAnalysisCredits ?? 3))
            .catch(() => { });
    }, []);

    const getFormData = useCallback(() => ({
        description,
        exteriorMaterials,
        roofType,
        accessInfo,
        parkingExisting,
        parkingNew,
        ...(isExistingBuilding ? {
            existingBuildingInfo,
            proposedProjectInfo,
            vrdConnections,
        } : {}),
    }), [description, exteriorMaterials, roofType, accessInfo, parkingExisting, parkingNew, isExistingBuilding, existingBuildingInfo, proposedProjectInfo, vrdConnections]);

    const handleSave = async () => {
        if (!projectId) return;
        setSaving(true);
        try {
            await fetch(`/api/projects/${projectId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectDescription: getFormData() }),
                credentials: "include",
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch {
            // silent
        }
        setSaving(false);
    };

    const handleLaunchPlu = async () => {
        if (!projectId) return;
        setShowLaunchConfirm(false);
        setLaunchingPlu(true);

        // First save the description
        try {
            await fetch(`/api/projects/${projectId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectDescription: getFormData() }),
                credentials: "include",
            });
        } catch {
            // continue anyway
        }

        // Launch PLU analysis
        try {
            const res = await fetch(`/api/projects/${projectId}/regulatory/auto`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
                credentials: "include",
            });
            if (res.ok) {
                router.push(`/projects/${projectId}`);
            } else {
                const err = await res.json().catch(() => ({}));
                alert(err.error || "PLU analysis failed. You can retry from the Overview page.");
                router.push(`/projects/${projectId}`);
            }
        } catch {
            alert("PLU analysis encountered an error. You can retry from the Overview page.");
            router.push(`/projects/${projectId}`);
        }
        setLaunchingPlu(false);
    };

    const toggleSection = (section: string) => {
        const next = new Set(expandedSections);
        if (next.has(section)) next.delete(section);
        else next.add(section);
        setExpandedSections(next);
    };

    const showLoading = authLoading || (!!user && !!projectId && loading);
    if (showLoading) {
        return (
            <Navigation>
                <div className="p-6 flex flex-col items-center justify-center min-h-[40vh] gap-3">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                    <p className="text-slate-400 text-sm">{t("common.loading")}</p>
                </div>
            </Navigation>
        );
    }

    if (!project) {
        return (
            <Navigation>
                <div className="p-6 max-w-2xl mx-auto">
                    <p className="text-slate-400">Project not found.</p>
                    <Link href="/projects" className="text-blue-600 hover:underline mt-2 inline-block">
                        ← {t("newProj.back")}
                    </Link>
                </div>
            </Navigation>
        );
    }

    const hasDescription = description.trim().length > 0;
    const hasRoofType = roofType.length > 0;
    const canLaunchPlu = hasDescription && hasRoofType && !!project.coordinates;

    const SectionHeader = ({ id, title, icon: Icon }: { id: string; title: string; icon: React.ElementType }) => (
        <button
            onClick={() => toggleSection(id)}
            className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
        >
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Icon className="w-5 h-5 text-blue-600" />
                {title}
            </h3>
            {expandedSections.has(id) ? (
                <ChevronDown className="w-5 h-5 text-slate-400" />
            ) : (
                <ChevronRight className="w-5 h-5 text-slate-400" />
            )}
        </button>
    );

    return (
        <Navigation>
            <div className="p-6 lg:p-8 max-w-3xl mx-auto">
                <Link
                    href={`/projects/${projectId}/payment`}
                    className="text-sm text-slate-400 hover:text-slate-900 inline-flex items-center gap-1 mb-6"
                >
                    {t("desc.backToPayment")}
                </Link>
                <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 mb-2 flex items-center gap-3">
                    <ClipboardList className="w-8 h-8 text-blue-600" />
                    {t("desc.title")}
                </h1>
                <p className="text-slate-400 mb-8">
                    {t("desc.subtitle")}
                </p>

                {project.address && (
                    <div className="mb-6 p-4 rounded-xl bg-white border border-slate-200 flex items-center gap-3">
                        <MapPin className="w-5 h-5 text-slate-400 shrink-0" />
                        <div>
                            <p className="font-medium text-slate-900">{project.name}</p>
                            <p className="text-sm text-slate-400">{project.address}</p>
                        </div>
                    </div>
                )}

                {/* Section 1: Project Description */}
                <div className="mb-4 rounded-2xl bg-white border border-slate-200 overflow-hidden">
                    <SectionHeader id="description" title={t("desc.projectDescription")} icon={ClipboardList} />
                    {expandedSections.has("description") && (
                        <div className="p-5 pt-0 space-y-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">
                                    {t("desc.generalDescription")} <span className="text-red-600">*</span>
                                </label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={5}
                                    placeholder={t("desc.descriptionPlaceholder")}
                                    className="w-full px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Section 2: Exterior Materials */}
                <div className="mb-4 rounded-2xl bg-white border border-slate-200 overflow-hidden">
                    <SectionHeader id="materials" title={t("desc.materialsAndRoof")} icon={ClipboardList} />
                    {expandedSections.has("materials") && (
                        <div className="p-5 pt-0 space-y-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">
                                    {t("desc.exteriorMaterials")}
                                </label>
                                <textarea
                                    value={exteriorMaterials}
                                    onChange={(e) => setExteriorMaterials(e.target.value)}
                                    rows={3}
                                    placeholder={t("desc.materialsPlaceholder")}
                                    className="w-full px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">
                                    {t("desc.roofType")} <span className="text-red-600">*</span>
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {ROOF_TYPES.map((rt) => (
                                        <button
                                            key={rt.value}
                                            type="button"
                                            onClick={() => setRoofType(rt.value)}
                                            className={`px-4 py-3 rounded-xl text-sm font-medium transition-all ${roofType === rt.value
                                                ? "bg-blue-500/30 border-2 border-blue-500 text-blue-200"
                                                : "bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200"
                                                }`}
                                        >
                                            {rt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Section 3: Access & Parking */}
                <div className="mb-4 rounded-2xl bg-white border border-slate-200 overflow-hidden">
                    <SectionHeader id="access" title={t("desc.accessAndParking")} icon={ClipboardList} />
                    {expandedSections.has("access") && (
                        <div className="p-5 pt-0 space-y-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">
                                    {t("desc.accessInfo")}
                                </label>
                                <textarea
                                    value={accessInfo}
                                    onChange={(e) => setAccessInfo(e.target.value)}
                                    rows={3}
                                    placeholder={t("desc.accessPlaceholder")}
                                    className="w-full px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-2">
                                        {t("desc.existingParking")}
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={parkingExisting}
                                        onChange={(e) => setParkingExisting(Number(e.target.value) || 0)}
                                        className="w-full px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-2">
                                        {t("desc.newParking")}
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={parkingNew}
                                        onChange={(e) => setParkingNew(Number(e.target.value) || 0)}
                                        className="w-full px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Section 4: Existing Building (conditional) */}
                {isExistingBuilding && (
                    <div className="mb-4 rounded-2xl bg-white border border-slate-200 overflow-hidden">
                        <SectionHeader id="existing" title={t("desc.existingBuilding")} icon={ClipboardList} />
                        {expandedSections.has("existing") && (
                            <div className="p-5 pt-0 space-y-4">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-2">
                                        {t("desc.existingBuildingInfo")}
                                    </label>
                                    <textarea
                                        value={existingBuildingInfo}
                                        onChange={(e) => setExistingBuildingInfo(e.target.value)}
                                        rows={3}
                                        placeholder={t("desc.existingBuildingPlaceholder")}
                                        className="w-full px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-2">
                                        {t("desc.proposedProject")}
                                    </label>
                                    <textarea
                                        value={proposedProjectInfo}
                                        onChange={(e) => setProposedProjectInfo(e.target.value)}
                                        rows={3}
                                        placeholder={t("desc.proposedProjectPlaceholder")}
                                        className="w-full px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                                    />
                                </div>

                                {/* VRD Connections */}
                                <div>
                                    <label className="block text-sm text-slate-400 mb-3">
                                        {t("desc.vrdQuestion")}
                                    </label>
                                    <div className="space-y-2">
                                        {VRD_NETWORKS.map((net) => (
                                            <label
                                                key={net.id}
                                                className="flex items-center gap-3 p-3 rounded-xl bg-slate-100 border border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={vrdConnections[net.id] || false}
                                                    onChange={(e) =>
                                                        setVrdConnections({
                                                            ...vrdConnections,
                                                            [net.id]: e.target.checked,
                                                        })
                                                    }
                                                    className="rounded border-slate-300 bg-slate-100 text-blue-500 focus:ring-blue-500"
                                                />
                                                <span className="text-sm text-slate-700">{net.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Save button */}
                <div className="mb-6">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 text-slate-900 font-medium hover:bg-slate-200 disabled:opacity-50 transition-colors"
                    >
                        {saving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : saved ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        {saved ? t("desc.saved") : t("desc.save")}
                    </button>
                </div>

                {/* Regulatory Document Upload (multi-file) */}
                <div className="mb-4 rounded-2xl bg-white border border-slate-200 overflow-hidden">
                    <SectionHeader id="plu_upload" title={t("desc.regDocs")} icon={FileText} />
                    {expandedSections.has("plu_upload") && (
                        <div className="p-5 pt-0 space-y-4">
                            <p className="text-xs text-slate-400">
                                {t("desc.regDocsInfo")}
                            </p>
                            {regDocsUploaded ? (
                                <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                    <span className="text-sm text-emerald-700">{regulatoryFiles.length} {t("desc.docsUploaded")}</span>
                                    <button
                                        onClick={() => { setRegDocsUploaded(false); setRegulatoryFiles([]); }}
                                        className="ml-auto p-1 rounded hover:bg-white/10"
                                    >
                                        <X className="w-4 h-4 text-slate-400" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    <label className="w-full flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100 hover:border-blue-200 transition-colors cursor-pointer">
                                        <Upload className="w-6 h-6" />
                                        <span className="text-sm">{regulatoryFiles.length > 0 ? `${regulatoryFiles.length} ${t("desc.filesSelected")}` : t("desc.selectPdf")}</span>
                                        <input
                                            type="file"
                                            accept=".pdf"
                                            multiple
                                            className="hidden"
                                            onChange={(e) => setRegulatoryFiles(Array.from(e.target.files || []))}
                                        />
                                    </label>
                                    {regulatoryFiles.length > 0 && (
                                        <div className="space-y-1">
                                            {regulatoryFiles.map((f, i) => (
                                                <div key={i} className="flex items-center gap-2 text-xs text-slate-600 px-2 py-1">
                                                    <FileText className="w-3.5 h-3.5 text-slate-500" />
                                                    <span className="truncate">{f.name}</span>
                                                    <span className="text-slate-500 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {regulatoryFiles.length > 0 && (
                                        <button
                                            onClick={async () => {
                                                setUploadingRegDocs(true);
                                                try {
                                                    for (const file of regulatoryFiles) {
                                                        const formData = new FormData();
                                                        formData.append("file", file);
                                                        formData.append("projectId", projectId);
                                                        formData.append("type", "plu_regulation");
                                                        await fetch(`/api/projects/${projectId}/upload`, {
                                                            method: "POST",
                                                            body: formData,
                                                            credentials: "include",
                                                        });
                                                    }
                                                    setRegDocsUploaded(true);
                                                } catch {
                                                    alert(t("desc.uploadError"));
                                                }
                                                setUploadingRegDocs(false);
                                            }}
                                            disabled={uploadingRegDocs}
                                            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-100 text-blue-700 text-sm font-medium hover:bg-blue-200 disabled:opacity-50"
                                        >
                                            {uploadingRegDocs ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                            {t("desc.upload")} {regulatoryFiles.length > 1 ? `${regulatoryFiles.length} ${t("desc.uploadFiles")}` : ""}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Regulation Analysis launch section */}
                <div className="p-6 rounded-2xl bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200">
                    <h2 className="text-lg font-semibold text-slate-900 mb-2 flex items-center gap-2">
                        <FileCheck className="w-5 h-5 text-blue-600" />
                        {t("desc.launchAnalysis")}
                    </h2>
                    <p className="text-sm text-slate-400 mb-4">
                        {t("desc.launchAnalysisInfo")}
                    </p>

                    {!canLaunchPlu && (
                        <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-700">
                                {!hasDescription && t("desc.fillDescription")}
                                {!hasRoofType && t("desc.selectRoof")}
                                {!project.coordinates && t("desc.missingCoords")}
                            </p>
                        </div>
                    )}

                    {project.regulatoryAnalysis ? (
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                            <span className="text-emerald-700 font-medium">{t("desc.analysisCompleted")}</span>
                            <Link
                                href={`/projects/${projectId}`}
                                className="ml-auto inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700"
                            >
                                {t("desc.viewSummary")} <ArrowRight className="w-4 h-4" />
                            </Link>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowLaunchConfirm(true)}
                            disabled={!canLaunchPlu || launchingPlu}
                            className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-slate-900 font-semibold hover:shadow-lg hover:shadow-blue-500/25 disabled:opacity-50 transition-all"
                        >
                            {launchingPlu ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    {t("desc.analysisInProgress")}
                                </>
                            ) : (
                                <>
                                    <Zap className="w-5 h-5" />
                                    {t("desc.launchAnalysis")}
                                </>
                            )}
                        </button>
                    )}
                </div>

                {/* Skip to overview */}
                <div className="mt-6 text-center">
                    <Link
                        href={`/projects/${projectId}`}
                        className="text-sm text-slate-500 hover:text-slate-600 transition-colors"
                    >
                        {t("desc.skipStep")}
                    </Link>
                </div>

                {/* Confirmation Modal */}
                {showLaunchConfirm && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                        onClick={() => setShowLaunchConfirm(false)}
                    >
                        <div
                            className="rounded-2xl bg-slate-100 border border-slate-200 p-6 max-w-md w-full mx-4 shadow-xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h3 className="text-lg font-semibold text-slate-900 mb-2">
                                {t("desc.confirmLaunch")}
                            </h3>
                            <p className="text-sm text-slate-400 mb-6">
                                {t("desc.confirmLaunchInfo")}{" "}
                                <span className="text-slate-900 font-medium">{pluCreditsCost} {t("desc.credits")}</span>.
                            </p>
                            <div className="flex gap-3 justify-end">
                                <button
                                    onClick={() => setShowLaunchConfirm(false)}
                                    className="px-4 py-2 rounded-xl bg-slate-100 text-slate-900 hover:bg-slate-200"
                                >
                                    {t("desc.cancel")}
                                </button>
                                <button
                                    onClick={handleLaunchPlu}
                                    disabled={launchingPlu}
                                    className="px-4 py-2 rounded-xl bg-blue-500/80 text-slate-900 font-medium hover:bg-blue-500 disabled:opacity-50 inline-flex items-center gap-2"
                                >
                                    {launchingPlu ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    {t("desc.launch")}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Navigation>
    );
}
