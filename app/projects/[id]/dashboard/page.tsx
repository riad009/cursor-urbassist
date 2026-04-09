"use client";

import React, { use, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Navigation from "@/components/layout/Navigation";
import {
    MapPin, Loader2, Download,
    CheckCircle2, Clock, ChevronRight,
    FolderKanban, Shield, Sparkles,
    Circle, Building2, Landmark, MapPinned,
    FileText, Briefcase, CreditCard,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { cn } from "@/lib/utils";
import { assembleDossier, fetchDossierData } from "@/lib/pdf";
import { sanitizeFilename, savePdfDoc } from "@/lib/pdf/shared";
import type { CapturedImages as DossierCapturedImages } from "@/lib/pdf/types";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Project {
    id: string;
    name: string;
    address: string | null;
    municipality?: string | null;
    parcelIds?: string | null;
    authorizationType?: string | null;
    paidAt?: string | null;
    documents?: { id: string; type: string; name?: string; fileUrl: string | null; fileData: string | null }[];
    protectedAreas?: { type: string; name: string }[] | null;
    regulatoryAnalysis?: { id: string; zoneType: string | null; analyzedAt?: string | null } | null;
    projectDescription?: { jobs?: { nature: string; footprint: number; levels: number }[] } | null;
}

// ─── Dossier document list ───────────────────────────────────────────────────

const PC_DOCS = [
    { code: "PC1", labelEn: "Location Plan", labelFr: "Plan de situation" },
    { code: "PC2", labelEn: "Site Layout Plan", labelFr: "Plan de masse" },
    { code: "PC3", labelEn: "Cross Section", labelFr: "Coupe transversale" },
    { code: "PC4", labelEn: "Descriptive Notice", labelFr: "Notice descriptive" },
    { code: "PC5.1", labelEn: "Facades (Existing)", labelFr: "Façades (Existant)" },
    { code: "PC5.2", labelEn: "Facades (Project)", labelFr: "Façades (Projet)" },
    { code: "PC6", labelEn: "Near Photo", labelFr: "Photo proche" },
    { code: "PC7", labelEn: "Far Photo", labelFr: "Photo lointaine" },
];

const DP_DOCS = [
    { code: "DP1", labelEn: "Location Plan", labelFr: "Plan de situation" },
    { code: "DP2", labelEn: "Site Layout Plan", labelFr: "Plan de masse" },
    { code: "DP3", labelEn: "Cross Section", labelFr: "Coupe transversale" },
    { code: "DP4", labelEn: "Descriptive Notice", labelFr: "Notice descriptive" },
    { code: "DP6", labelEn: "Near Photo", labelFr: "Photo proche" },
    { code: "DP7", labelEn: "Far Photo", labelFr: "Photo lointaine" },
];

const DOC_TYPE_MAP: Record<string, string> = {
    'PC1': 'LOCATION_PLAN', 'DP1': 'LOCATION_PLAN',
    'PC2': 'SITE_PLAN', 'DP2': 'SITE_PLAN',
    'PC3': 'CROSS_SECTION', 'DP3': 'CROSS_SECTION',
    'PC4': 'DESCRIPTIVE_NOTICE', 'DP4': 'DESCRIPTIVE_NOTICE',
    'PC5.1': 'FACADE_EXISTING', 'PC5.2': 'FACADE_PROJECT',
    'PC6': 'PHOTO_NEAR', 'DP6': 'PHOTO_NEAR',
    'PC7': 'PHOTO_FAR', 'DP7': 'PHOTO_FAR',
};

// ─── Main ────────────────────────────────────────────────────────────────────

export default function ProjectDashboardPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: projectId } = use(params);
    const { t } = useLanguage();
    const { user, loading: authLoading } = useAuth();
    const isEn = t("auth.next") === "Next";

    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);
    const [dossierGenerating, setDossierGenerating] = useState(false);
    const [dossierProgress, setDossierProgress] = useState({ msg: "", pct: 0 });

    const handleExportDossier = useCallback(async () => {
        if (dossierGenerating) return;
        try {
            setDossierGenerating(true);
            setDossierProgress({ msg: isEn ? "Fetching project data..." : "Chargement des données...", pct: 5 });
            const baseUrl = window.location.origin;
            const data = await fetchDossierData(projectId, baseUrl);
            const imgs: DossierCapturedImages = {
                PC2: (data.sitePlanData as any)?.pc2ImageBase64 || undefined,
                PC3: undefined,
                'PC5.2': undefined,
            };
            const doc = await assembleDossier(data, {
                projectId,
                baseUrl,
                capturedImages: imgs,
                onProgress: (msg, pct) => setDossierProgress({ msg, pct }),
            });
            const filename = `Dossier_PC_${sanitizeFilename(project?.address || project?.name || 'projet')}.pdf`;
            savePdfDoc(doc, filename);
        } catch (err) {
            console.error('[Dossier] Generation failed:', err);
            alert(isEn ? 'PDF generation failed. Please try again.' : 'La génération du PDF a échoué. Veuillez réessayer.');
        } finally {
            setDossierGenerating(false);
            setDossierProgress({ msg: '', pct: 0 });
        }
    }, [dossierGenerating, isEn, projectId, project]);

    useEffect(() => {
        if (!projectId || (!user && !authLoading)) { setLoading(false); return; }
        if (authLoading) return;
        fetch(`/api/projects/${projectId}`, { credentials: "include" })
            .then(r => r.json())
            .then(d => { if (d.project) setProject(d.project); })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [projectId, user, authLoading]);

    // ── Derived ──────────────────────────────────────────────────────────────
    const generatedDocs = project?.documents?.filter(d => d.fileUrl || d.fileData) ?? [];
    const generatedTypes = new Set(generatedDocs.map(d => d.type));
    const isPC = project?.authorizationType === "PC";
    const dossierDocs = isPC ? PC_DOCS : DP_DOCS;
    const isDocReady = (code: string) => generatedTypes.has(DOC_TYPE_MAP[code] || "");
    const readyCount = dossierDocs.filter(d => isDocReady(d.code)).length;

    const hasABF = (project?.protectedAreas || []).some(
        a => ["ABF", "HERITAGE", "abf", "heritage", "MONUMENT_HISTORIQUE", "SITE_PATRIMONIAL"].includes(a.type)
    );
    const hasAnalysis = !!(project?.regulatoryAnalysis?.analyzedAt || project?.regulatoryAnalysis?.zoneType);

    // ── Loading / Error ──────────────────────────────────────────────────────
    if (authLoading || loading) {
        return (
            <Navigation>
                <div className="min-h-screen flex items-center justify-center bg-[#f8f9fb]">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                </div>
            </Navigation>
        );
    }

    if (!project) {
        return (
            <Navigation>
                <div className="min-h-screen flex items-center justify-center bg-[#f8f9fb]">
                    <p className="text-slate-500">{isEn ? "Project not found." : "Projet introuvable."}</p>
                </div>
            </Navigation>
        );
    }

    // ── Activity steps ───────────────────────────────────────────────────────
    const activitySteps = [
        {
            label: isEn ? "Project Created" : "Projet créé",
            done: true,
            detail: project.name,
        },
        {
            label: isEn ? "Address & Parcels" : "Adresse & Parcelles",
            done: !!(project.address && project.parcelIds),
            detail: project.address
                ? `${project.address}${project.parcelIds ? ` · ${project.parcelIds.split(",").length} parcels` : ""}`
                : (isEn ? "Not set" : "Non défini"),
        },
        {
            label: isEn ? "Authorization Type" : "Type d'autorisation",
            done: !!project.authorizationType,
            detail: project.authorizationType
                ? (isPC ? (isEn ? "Building Permit (PC)" : "Permis de Construire (PC)") : (isEn ? "Preliminary Declaration (DP)" : "Déclaration Préalable (DP)"))
                : (isEn ? "Not determined" : "Non déterminé"),
        },
        {
            label: isEn ? "PLU Regulatory Analysis" : "Analyse réglementaire PLU",
            done: hasAnalysis,
            detail: hasAnalysis
                ? `${isEn ? "Zone" : "Zone"}: ${project.regulatoryAnalysis?.zoneType || "—"}`
                : (isEn ? "Not analyzed" : "Non analysé"),
        },
        {
            label: isEn ? "Project Description" : "Description du projet",
            done: !!(project.projectDescription?.jobs?.length),
            detail: project.projectDescription?.jobs?.length
                ? `${project.projectDescription.jobs.length} ${isEn ? "work items defined" : "postes de travaux définis"}`
                : (isEn ? "Not started" : "Non commencé"),
        },
        {
            label: isEn ? "Documents Generated" : "Documents générés",
            done: generatedDocs.length > 0,
            detail: generatedDocs.length > 0
                ? `${generatedDocs.length} ${isEn ? "documents ready" : "documents prêts"}`
                : (isEn ? "None yet" : "Aucun pour le moment"),
        },
        {
            label: isEn ? "Payment" : "Paiement",
            done: !!project.paidAt,
            detail: project.paidAt
                ? `${isEn ? "Paid on" : "Payé le"} ${new Date(project.paidAt).toLocaleDateString()}`
                : (isEn ? "Pending" : "En attente"),
        },
    ];

    // ── Stat cards data ──────────────────────────────────────────────────────
    const statCards = [
        {
            label: isEn ? "Address" : "Adresse",
            value: project.address || "—",
            icon: MapPinned,
            color: "text-blue-600 bg-blue-50",
        },
        {
            label: isEn ? "Municipality" : "Commune",
            value: project.municipality || "—",
            icon: Landmark,
            color: "text-violet-600 bg-violet-50",
        },
        {
            label: isEn ? "Parcels" : "Parcelles",
            value: project.parcelIds || "—",
            icon: MapPin,
            color: "text-emerald-600 bg-emerald-50",
        },
        {
            label: isEn ? "Authorization" : "Autorisation",
            value: isPC ? "Permis de Construire (PC)" : "Déclaration Préalable (DP)",
            icon: Building2,
            color: "text-amber-600 bg-amber-50",
        },
        ...(project.regulatoryAnalysis?.zoneType ? [{
            label: isEn ? "PLU Zone" : "Zone PLU",
            value: project.regulatoryAnalysis.zoneType,
            icon: FileText,
            color: "text-purple-600 bg-purple-50",
        }] : []),
        ...(project.projectDescription?.jobs?.length ? [{
            label: isEn ? "Works" : "Travaux",
            value: `${project.projectDescription.jobs.length} ${isEn ? "items" : "postes"}`,
            icon: Briefcase,
            color: "text-teal-600 bg-teal-50",
        }] : []),
    ];

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <Navigation>
            <div className="min-h-screen bg-[#f8f9fb]">

                {/* ── Header Bar ── */}
                <div className="bg-white border-b border-slate-200/80">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
                        {/* Breadcrumb */}
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
                            <Link href="/projects" className="hover:text-slate-600 flex items-center gap-1 transition-colors">
                                <FolderKanban className="w-3.5 h-3.5" />
                                {isEn ? "Projects" : "Projets"}
                            </Link>
                            <ChevronRight className="w-3 h-3" />
                            <span className="text-slate-600 font-medium truncate max-w-[200px]">{project.name}</span>
                        </div>
                        {/* Title + badges */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div>
                                <h1 className="text-xl font-bold text-slate-900 leading-tight">{project.name}</h1>
                                {project.address && (
                                    <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5">
                                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                        {project.address}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {project.authorizationType && (
                                    <span className={cn(
                                        "px-2.5 py-0.5 rounded-full text-[11px] font-bold border",
                                        isPC ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-200"
                                    )}>
                                        {isPC ? "PC" : "DP"}
                                    </span>
                                )}
                                {project.paidAt && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        <CheckCircle2 className="w-3 h-3" /> {isEn ? "Paid" : "Payé"}
                                    </span>
                                )}
                                {hasABF && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                        <Shield className="w-3 h-3" /> ABF
                                    </span>
                                )}
                                {hasAnalysis && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                                        <Sparkles className="w-3 h-3" /> PLU
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Split-Pane Grid ── */}
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                        {/* ═══ LEFT COLUMN — Information Hub (8 cols) ═══ */}
                        <div className="lg:col-span-8 space-y-6">

                            {/* ── Project Details: Stat Cards Grid ── */}
                            <div>
                                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
                                    {isEn ? "Project Details" : "Détails du projet"}
                                </h2>
                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                                    {statCards.map((card, i) => {
                                        const IconComp = card.icon;
                                        return (
                                            <div
                                                key={i}
                                                className="group bg-white rounded-xl border border-slate-200/80 p-4 hover:shadow-md hover:border-slate-300/80 transition-all duration-200"
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", card.color)}>
                                                        <IconComp className="w-4.5 h-4.5" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{card.label}</p>
                                                        <p className="text-sm font-semibold text-slate-900 truncate" title={card.value}>{card.value}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ── Project Activity: Compact Stepper ── */}
                            <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden">
                                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                                    <h3 className="text-sm font-bold text-slate-900">{isEn ? "Project Activity" : "Activité du projet"}</h3>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                        {activitySteps.filter(s => s.done).length}/{activitySteps.length} {isEn ? "complete" : "terminé"}
                                    </span>
                                </div>
                                <div className="px-5 py-4">
                                    <div className="relative">
                                        {/* Vertical line */}
                                        <div className="absolute left-[11px] top-2 bottom-2 w-px bg-slate-200" />
                                        <div className="space-y-0">
                                            {activitySteps.map((step, i) => (
                                                <div key={i} className="relative flex items-start gap-3.5 py-2">
                                                    {/* Dot */}
                                                    <div className="relative z-10 shrink-0 mt-0.5">
                                                        {step.done ? (
                                                            <div className="w-[22px] h-[22px] rounded-full bg-emerald-100 flex items-center justify-center ring-2 ring-white">
                                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                                            </div>
                                                        ) : (
                                                            <div className="w-[22px] h-[22px] rounded-full bg-slate-100 flex items-center justify-center ring-2 ring-white">
                                                                <Circle className="w-3 h-3 text-slate-300" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    {/* Text */}
                                                    <div className="flex-1 min-w-0 pb-1">
                                                        <div className="flex items-center gap-2">
                                                            <p className={cn(
                                                                "text-[13px] font-medium leading-tight",
                                                                step.done ? "text-slate-800" : "text-slate-400"
                                                            )}>{step.label}</p>
                                                            {step.done && (
                                                                <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-px rounded-full border border-emerald-200 leading-relaxed">
                                                                    ✓
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-[11px] text-slate-400 truncate mt-0.5 leading-snug">{step.detail}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ═══ RIGHT COLUMN — Action Center (4 cols) ═══ */}
                        <div className="lg:col-span-4">
                            <div className="lg:sticky lg:top-6 space-y-5">

                                {/* ── Export & Submit Card ── */}
                                <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                                    {/* Card header */}
                                    <div className="px-5 py-4 border-b border-slate-100">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
                                                <Download className="w-5 h-5 text-white" />
                                            </div>
                                            <div>
                                                <h2 className="text-sm font-bold text-slate-900">{isEn ? "Export & Submit" : "Exporter & Déposer"}</h2>
                                                <p className="text-[11px] text-slate-400 mt-0.5">
                                                    {isEn ? "Complete planning dossier" : "Dossier complet d'urbanisme"}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Progress ring */}
                                    <div className="px-5 py-4 border-b border-slate-100">
                                        <div className="flex items-center gap-4">
                                            <div className="relative w-14 h-14 shrink-0">
                                                <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                                                    <circle cx="28" cy="28" r="24" fill="none" stroke="#f1f5f9" strokeWidth="4" />
                                                    <circle
                                                        cx="28" cy="28" r="24" fill="none"
                                                        stroke={readyCount === dossierDocs.length ? "#10b981" : "#6366f1"}
                                                        strokeWidth="4"
                                                        strokeLinecap="round"
                                                        strokeDasharray={`${(readyCount / dossierDocs.length) * 150.8} 150.8`}
                                                        className="transition-all duration-700 ease-out"
                                                    />
                                                </svg>
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <span className="text-sm font-black text-slate-900">{readyCount}/{dossierDocs.length}</span>
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-slate-900">
                                                    {readyCount === dossierDocs.length
                                                        ? (isEn ? "All documents ready!" : "Tous les documents sont prêts !")
                                                        : (isEn ? `${dossierDocs.length - readyCount} documents remaining` : `${dossierDocs.length - readyCount} documents restants`)}
                                                </p>
                                                <p className="text-[11px] text-slate-400 mt-0.5">
                                                    {isEn ? "Generate all before exporting" : "Générez tous avant d'exporter"}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Document checklist */}
                                    <div className="px-5 py-3">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                                            {isEn ? "Required Documents" : "Documents requis"}
                                        </p>
                                        <ul className="space-y-1">
                                            {dossierDocs.map((doc) => {
                                                const ready = isDocReady(doc.code);
                                                return (
                                                    <li key={doc.code} className="flex items-center gap-2.5 py-1.5">
                                                        {ready ? (
                                                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                                        ) : (
                                                            <Circle className="w-4 h-4 text-slate-300 shrink-0" />
                                                        )}
                                                        <span className={cn(
                                                            "text-[12px] flex-1 truncate",
                                                            ready ? "text-slate-700 font-medium" : "text-slate-400"
                                                        )}>
                                                            <span className="font-semibold">{doc.code}</span>{" "}
                                                            {isEn ? doc.labelEn : doc.labelFr}
                                                        </span>
                                                        {ready && (
                                                            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-100">
                                                                ✓
                                                            </span>
                                                        )}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>

                                    {/* Export button + progress */}
                                    <div className="px-5 pb-5 pt-2">
                                        {/* Progress bar during generation */}
                                        {dossierGenerating && (
                                            <div className="space-y-2 mb-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-slate-600 flex items-center gap-1.5">
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                                                        {dossierProgress.msg || (isEn ? "Generating PDF..." : "Génération du PDF...")}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-indigo-600">{dossierProgress.pct}%</span>
                                                </div>
                                                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
                                                        style={{ width: `${Math.max(4, dossierProgress.pct)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        <button
                                            type="button"
                                            disabled={dossierGenerating}
                                            onClick={handleExportDossier}
                                            className={cn(
                                                "w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all duration-200",
                                                dossierGenerating
                                                    ? "bg-slate-100 text-slate-400 cursor-wait"
                                                    : "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-md shadow-indigo-500/20 hover:shadow-lg hover:shadow-indigo-500/30 active:scale-[0.98]"
                                            )}
                                        >
                                            {dossierGenerating ? (
                                                <><Loader2 className="w-4 h-4 animate-spin" /> {isEn ? "Generating..." : "Génération..."}</>
                                            ) : (
                                                <><Download className="w-4 h-4" /> {isEn ? "Download Dossier" : "Télécharger le dossier"}</>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {/* ── Quick Info Card ── */}
                                <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
                                    <div className="flex items-center gap-2 mb-3">
                                        <CreditCard className="w-4 h-4 text-slate-400" />
                                        <h3 className="text-sm font-bold text-slate-900">{isEn ? "Status" : "Statut"}</h3>
                                    </div>
                                    <div className="space-y-2.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-slate-500">{isEn ? "Payment" : "Paiement"}</span>
                                            {project.paidAt ? (
                                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                                                    <CheckCircle2 className="w-3.5 h-3.5" /> {isEn ? "Confirmed" : "Confirmé"}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                                                    <Clock className="w-3.5 h-3.5" /> {isEn ? "Pending" : "En attente"}
                                                </span>
                                            )}
                                        </div>
                                        <div className="h-px bg-slate-100" />
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-slate-500">{isEn ? "PLU Analysis" : "Analyse PLU"}</span>
                                            {hasAnalysis ? (
                                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                                                    <CheckCircle2 className="w-3.5 h-3.5" /> {isEn ? "Complete" : "Terminée"}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                                                    <Clock className="w-3.5 h-3.5" /> {isEn ? "Pending" : "En attente"}
                                                </span>
                                            )}
                                        </div>
                                        <div className="h-px bg-slate-100" />
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-slate-500">{isEn ? "Documents" : "Documents"}</span>
                                            <span className="text-[11px] font-semibold text-slate-700">
                                                {readyCount}/{dossierDocs.length} {isEn ? "ready" : "prêts"}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Navigation>
    );
}
