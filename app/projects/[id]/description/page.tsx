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

interface ProjectData {
    id: string;
    name: string;
    address: string | null;
    projectType?: string | null;
    projectDescription?: Record<string, unknown> | null;
    regulatoryAnalysis?: { id: string } | null;
    coordinates?: string | null;
}

const ROOF_TYPES = [
    { value: "flat", label: "Toit plat (Flat roof)" },
    { value: "dual_pitch", label: "Toit à deux pentes (Dual-pitch roof)" },
    { value: "single_pitch", label: "Toit monopente (Single-pitch roof)" },
];

const VRD_NETWORKS = [
    { id: "electricity", label: "Électricité" },
    { id: "drinking_water", label: "Eau potable" },
    { id: "wastewater", label: "Eaux usées" },
    { id: "telecom", label: "Télécommunications" },
    { id: "other", label: "Autres réseaux" },
];

export default function ProjectDescriptionPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: projectId } = use(params);
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();

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
                    <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                    <p className="text-slate-400 text-sm">Loading project…</p>
                </div>
            </Navigation>
        );
    }

    if (!project) {
        return (
            <Navigation>
                <div className="p-6 max-w-2xl mx-auto">
                    <p className="text-slate-400">Project not found.</p>
                    <Link href="/projects" className="text-blue-400 hover:underline mt-2 inline-block">
                        ← Back to projects
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
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Icon className="w-5 h-5 text-blue-400" />
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
                    className="text-sm text-slate-400 hover:text-white inline-flex items-center gap-1 mb-6"
                >
                    ← Retour au paiement
                </Link>
                <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2 flex items-center gap-3">
                    <ClipboardList className="w-8 h-8 text-blue-400" />
                    Description détaillée du projet
                </h1>
                <p className="text-slate-400 mb-8">
                    Complétez les informations de votre projet avant de lancer l&apos;analyse réglementaire.
                </p>

                {project.address && (
                    <div className="mb-6 p-4 rounded-xl bg-slate-800/50 border border-white/10 flex items-center gap-3">
                        <MapPin className="w-5 h-5 text-slate-400 shrink-0" />
                        <div>
                            <p className="font-medium text-white">{project.name}</p>
                            <p className="text-sm text-slate-400">{project.address}</p>
                        </div>
                    </div>
                )}

                {/* Section 1: Project Description */}
                <div className="mb-4 rounded-2xl bg-slate-800/50 border border-white/10 overflow-hidden">
                    <SectionHeader id="description" title="Description du projet" icon={ClipboardList} />
                    {expandedSections.has("description") && (
                        <div className="p-5 pt-0 space-y-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">
                                    Description générale du projet <span className="text-red-400">*</span>
                                </label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={5}
                                    placeholder="Décrivez votre projet de construction : type de bâtiment, nombre de niveaux, surface, usage prévu…"
                                    className="w-full px-4 py-3 rounded-xl bg-slate-700 border border-white/10 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Section 2: Exterior Materials */}
                <div className="mb-4 rounded-2xl bg-slate-800/50 border border-white/10 overflow-hidden">
                    <SectionHeader id="materials" title="Matériaux et toiture" icon={ClipboardList} />
                    {expandedSections.has("materials") && (
                        <div className="p-5 pt-0 space-y-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">
                                    Matériaux extérieurs
                                </label>
                                <textarea
                                    value={exteriorMaterials}
                                    onChange={(e) => setExteriorMaterials(e.target.value)}
                                    rows={3}
                                    placeholder="Ex : Enduit lissé blanc cassé (RAL 9010), parement pierre naturelle en soubassement…"
                                    className="w-full px-4 py-3 rounded-xl bg-slate-700 border border-white/10 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">
                                    Type de toiture <span className="text-red-400">*</span>
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {ROOF_TYPES.map((rt) => (
                                        <button
                                            key={rt.value}
                                            type="button"
                                            onClick={() => setRoofType(rt.value)}
                                            className={`px-4 py-3 rounded-xl text-sm font-medium transition-all ${roofType === rt.value
                                                ? "bg-blue-500/30 border-2 border-blue-500 text-blue-200"
                                                : "bg-slate-700 border border-white/10 text-slate-300 hover:bg-slate-600"
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
                <div className="mb-4 rounded-2xl bg-slate-800/50 border border-white/10 overflow-hidden">
                    <SectionHeader id="access" title="Accès et stationnement" icon={ClipboardList} />
                    {expandedSections.has("access") && (
                        <div className="p-5 pt-0 space-y-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">
                                    Informations d&apos;accès
                                </label>
                                <textarea
                                    value={accessInfo}
                                    onChange={(e) => setAccessInfo(e.target.value)}
                                    rows={3}
                                    placeholder="Ex : Accès véhicule depuis la rue principale via une allée de 3,5 m. Accès piéton par le jardin."
                                    className="w-full px-4 py-3 rounded-xl bg-slate-700 border border-white/10 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-2">
                                        Places de stationnement existantes
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={parkingExisting}
                                        onChange={(e) => setParkingExisting(Number(e.target.value) || 0)}
                                        className="w-full px-4 py-3 rounded-xl bg-slate-700 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-2">
                                        Places de stationnement à créer
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={parkingNew}
                                        onChange={(e) => setParkingNew(Number(e.target.value) || 0)}
                                        className="w-full px-4 py-3 rounded-xl bg-slate-700 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Section 4: Existing Building (conditional) */}
                {isExistingBuilding && (
                    <div className="mb-4 rounded-2xl bg-slate-800/50 border border-white/10 overflow-hidden">
                        <SectionHeader id="existing" title="Bâtiment existant" icon={ClipboardList} />
                        {expandedSections.has("existing") && (
                            <div className="p-5 pt-0 space-y-4">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-2">
                                        Informations sur le bâtiment existant
                                    </label>
                                    <textarea
                                        value={existingBuildingInfo}
                                        onChange={(e) => setExistingBuildingInfo(e.target.value)}
                                        rows={3}
                                        placeholder="Décrivez le bâtiment existant : année de construction, surface, nombre de niveaux…"
                                        className="w-full px-4 py-3 rounded-xl bg-slate-700 border border-white/10 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-2">
                                        Informations sur le projet proposé
                                    </label>
                                    <textarea
                                        value={proposedProjectInfo}
                                        onChange={(e) => setProposedProjectInfo(e.target.value)}
                                        rows={3}
                                        placeholder="Décrivez les travaux envisagés sur le bâtiment existant…"
                                        className="w-full px-4 py-3 rounded-xl bg-slate-700 border border-white/10 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                                    />
                                </div>

                                {/* VRD Connections */}
                                <div>
                                    <label className="block text-sm text-slate-400 mb-3">
                                        Le bâtiment est-il raccordé aux réseaux (VRD) ?
                                    </label>
                                    <div className="space-y-2">
                                        {VRD_NETWORKS.map((net) => (
                                            <label
                                                key={net.id}
                                                className="flex items-center gap-3 p-3 rounded-xl bg-slate-700/50 border border-white/5 cursor-pointer hover:bg-slate-700 transition-colors"
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
                                                    className="rounded border-white/20 bg-slate-800 text-blue-500 focus:ring-blue-500"
                                                />
                                                <span className="text-sm text-slate-200">{net.label}</span>
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
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-700 text-white font-medium hover:bg-slate-600 disabled:opacity-50 transition-colors"
                    >
                        {saving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : saved ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        {saved ? "Enregistré !" : "Enregistrer"}
                    </button>
                </div>

                {/* Regulatory Document Upload (multi-file) */}
                <div className="mb-4 rounded-2xl bg-slate-800/50 border border-white/10 overflow-hidden">
                    <SectionHeader id="plu_upload" title="Documents réglementaires (optionnel)" icon={FileText} />
                    {expandedSections.has("plu_upload") && (
                        <div className="p-5 pt-0 space-y-4">
                            <p className="text-xs text-slate-400">
                                Si vous disposez du règlement PLU/RNU de votre commune (PDF), vous pouvez joindre un ou plusieurs fichiers
                                pour enrichir l&apos;analyse réglementaire.
                            </p>
                            {regDocsUploaded ? (
                                <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                    <span className="text-sm text-emerald-200">{regulatoryFiles.length} document(s) téléversé(s)</span>
                                    <button
                                        onClick={() => { setRegDocsUploaded(false); setRegulatoryFiles([]); }}
                                        className="ml-auto p-1 rounded hover:bg-white/10"
                                    >
                                        <X className="w-4 h-4 text-slate-400" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    <label className="w-full flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-white/10 bg-slate-700/30 text-slate-400 hover:bg-slate-700/50 hover:border-blue-500/30 transition-colors cursor-pointer">
                                        <Upload className="w-6 h-6" />
                                        <span className="text-sm">{regulatoryFiles.length > 0 ? `${regulatoryFiles.length} fichier(s) sélectionné(s)` : "Cliquez pour sélectionner un ou plusieurs PDF"}</span>
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
                                                <div key={i} className="flex items-center gap-2 text-xs text-slate-300 px-2 py-1">
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
                                                    alert("Erreur lors du téléversement");
                                                }
                                                setUploadingRegDocs(false);
                                            }}
                                            disabled={uploadingRegDocs}
                                            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-500/20 text-blue-300 text-sm font-medium hover:bg-blue-500/30 disabled:opacity-50"
                                        >
                                            {uploadingRegDocs ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                            Téléverser {regulatoryFiles.length > 1 ? `${regulatoryFiles.length} fichiers` : ""}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Regulation Analysis launch section */}
                <div className="p-6 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20">
                    <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                        <FileCheck className="w-5 h-5 text-blue-400" />
                        Lancer l&apos;analyse réglementaire
                    </h2>
                    <p className="text-sm text-slate-400 mb-4">
                        Une fois toutes les informations complétées, lancez l&apos;analyse réglementaire pour obtenir les contraintes
                        PLU/RNU applicables à votre projet. La première analyse est incluse dans votre forfait.
                    </p>

                    {!canLaunchPlu && (
                        <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-300">
                                {!hasDescription && "Veuillez renseigner la description du projet. "}
                                {!hasRoofType && "Veuillez sélectionner un type de toiture. "}
                                {!project.coordinates && "Coordonnées du projet manquantes. "}
                            </p>
                        </div>
                    )}

                    {project.regulatoryAnalysis ? (
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            <span className="text-emerald-200 font-medium">Analyse réglementaire effectuée</span>
                            <Link
                                href={`/projects/${projectId}`}
                                className="ml-auto inline-flex items-center gap-1 text-sm text-emerald-400 hover:text-emerald-300"
                            >
                                Voir le résumé <ArrowRight className="w-4 h-4" />
                            </Link>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowLaunchConfirm(true)}
                            disabled={!canLaunchPlu || launchingPlu}
                            className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:shadow-lg hover:shadow-blue-500/25 disabled:opacity-50 transition-all"
                        >
                            {launchingPlu ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Analyse en cours…
                                </>
                            ) : (
                                <>
                                    <Zap className="w-5 h-5" />
                                    Lancer l&apos;analyse réglementaire
                                </>
                            )}
                        </button>
                    )}
                </div>

                {/* Skip to overview */}
                <div className="mt-6 text-center">
                    <Link
                        href={`/projects/${projectId}`}
                        className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
                    >
                        Passer cette étape et aller au résumé →
                    </Link>
                </div>

                {/* Confirmation Modal */}
                {showLaunchConfirm && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                        onClick={() => setShowLaunchConfirm(false)}
                    >
                        <div
                            className="rounded-2xl bg-slate-800 border border-white/10 p-6 max-w-md w-full mx-4 shadow-xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h3 className="text-lg font-semibold text-white mb-2">
                                Lancer l&apos;analyse réglementaire ?
                            </h3>
                            <p className="text-sm text-slate-400 mb-6">
                                Êtes-vous sûr de vouloir lancer l&apos;analyse réglementaire (PLU/RNU) ?
                                Une fois validée, toute analyse supplémentaire sera facturée{" "}
                                <span className="text-white font-medium">{pluCreditsCost} crédits</span>.
                            </p>
                            <div className="flex gap-3 justify-end">
                                <button
                                    onClick={() => setShowLaunchConfirm(false)}
                                    className="px-4 py-2 rounded-xl bg-slate-700 text-white hover:bg-slate-600"
                                >
                                    Annuler
                                </button>
                                <button
                                    onClick={handleLaunchPlu}
                                    disabled={launchingPlu}
                                    className="px-4 py-2 rounded-xl bg-blue-500/80 text-white font-medium hover:bg-blue-500 disabled:opacity-50 inline-flex items-center gap-2"
                                >
                                    {launchingPlu ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    Lancer
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Navigation>
    );
}
