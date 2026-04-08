"use client";

import React, { use, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Navigation from "@/components/layout/Navigation";
import {
    MapPin, Loader2, Download,
    CheckCircle2, Clock, ChevronRight,
    FolderKanban, Shield, Sparkles,
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
                <div className="min-h-screen flex items-center justify-center bg-[#f5f6fa]">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                </div>
            </Navigation>
        );
    }

    if (!project) {
        return (
            <Navigation>
                <div className="min-h-screen flex items-center justify-center bg-[#f5f6fa]">
                    <p className="text-slate-500">{isEn ? "Project not found." : "Projet introuvable."}</p>
                </div>
            </Navigation>
        );
    }

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <Navigation>
            <div className="min-h-screen bg-[#f5f6fa]">

                {/* ── Compact Header ── */}
                <div className="bg-white border-b border-slate-200">
                    <div className="max-w-3xl mx-auto px-6 py-5">
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
                            <Link href="/projects" className="hover:text-slate-600 flex items-center gap-1 transition-colors">
                                <FolderKanban className="w-3.5 h-3.5" />
                                {isEn ? "Projects" : "Projets"}
                            </Link>
                            <ChevronRight className="w-3 h-3" />
                            <span className="text-slate-600 font-medium">{project.name}</span>
                        </div>
                        <h1 className="text-xl font-bold text-slate-900">{project.name}</h1>
                        {project.address && (
                            <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1">
                                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                {project.address}
                            </p>
                        )}
                        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                            {project.authorizationType && (
                                <span className={cn(
                                    "px-2.5 py-0.5 rounded-full text-[11px] font-bold border",
                                    isPC ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-200"
                                )}>
                                    {isPC ? (isEn ? "Building Permit (PC)" : "Permis de Construire (PC)") : (isEn ? "Preliminary Declaration (DP)" : "Déclaration Préalable (DP)")}
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
                                    <Sparkles className="w-3 h-3" /> {isEn ? "PLU Analyzed" : "PLU Analysé"}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Main content ── */}
                <div className="max-w-3xl mx-auto px-6 py-8 space-y-5">

                    {/* ══ Export Card — the hero action ══ */}
                    <div className="rounded-2xl overflow-hidden shadow-sm border border-slate-200">
                        <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 px-7 py-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
                                        <Download className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-white">{isEn ? "Export & Submit" : "Exporter & Déposer"}</h2>
                                        <p className="text-sm text-white/70 mt-0.5">
                                            {isEn
                                                ? "Your complete planning application as a single PDF."
                                                : "Votre dossier complet en un seul fichier PDF."}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right hidden sm:block">
                                    <p className="text-2xl font-black text-white">{readyCount}/{dossierDocs.length}</p>
                                    <p className="text-[10px] text-white/60 font-medium uppercase tracking-wider">{isEn ? "Documents" : "Documents"}</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white px-7 py-5 space-y-4">
                            {/* Progress bar during generation */}
                            {dossierGenerating && (
                                <div className="space-y-2 pb-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-slate-600 flex items-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                                            {dossierProgress.msg || (isEn ? "Generating PDF..." : "Génération du PDF...")}
                                        </span>
                                        <span className="text-xs font-bold text-indigo-600">{dossierProgress.pct}%</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
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
                                    "w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-sm font-bold transition-all",
                                    dossierGenerating
                                        ? "bg-slate-100 text-slate-400 cursor-wait"
                                        : "bg-slate-900 hover:bg-slate-800 text-white shadow-sm hover:shadow-md active:scale-[0.99]"
                                )}
                            >
                                {dossierGenerating ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> {isEn ? "Generating..." : "Génération..."}</>
                                ) : (
                                    <><Download className="w-4 h-4" /> {isEn ? "Download Complete Dossier (PDF)" : "Télécharger le dossier complet (PDF)"}</>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* ══ Project Activity ══ */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-7 py-4 border-b border-slate-100">
                            <h3 className="text-sm font-bold text-slate-900">{isEn ? "Project Activity" : "Activité du projet"}</h3>
                        </div>
                        <div className="divide-y divide-slate-50">
                            {[
                                {
                                    label: isEn ? "Project Created" : "Projet créé",
                                    done: true,
                                    detail: project.name,
                                },
                                {
                                    label: isEn ? "Address & Parcels" : "Adresse & Parcelles",
                                    done: !!(project.address && project.parcelIds),
                                    detail: project.address
                                        ? `${project.address}${project.parcelIds ? ` • ${project.parcelIds.split(",").length} parcels` : ""}`
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
                            ].map((item, i) => (
                                <div key={i} className="flex items-center gap-4 px-7 py-3.5">
                                    <div className={cn(
                                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                                        item.done ? "bg-emerald-100" : "bg-slate-100"
                                    )}>
                                        {item.done
                                            ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                            : <Clock className="w-4 h-4 text-slate-300" />
                                        }
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={cn(
                                            "text-sm font-medium",
                                            item.done ? "text-slate-900" : "text-slate-400"
                                        )}>{item.label}</p>
                                        <p className="text-xs text-slate-500 truncate mt-0.5">{item.detail}</p>
                                    </div>
                                    {item.done && (
                                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0">
                                            {isEn ? "Done" : "Fait"}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ══ Project details ══ */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-7 py-4 border-b border-slate-100">
                            <h3 className="text-sm font-bold text-slate-900">{isEn ? "Project details" : "Détails du projet"}</h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2">
                            {[
                                { label: isEn ? "Address" : "Adresse", value: project.address },
                                { label: isEn ? "Municipality" : "Commune", value: project.municipality },
                                { label: isEn ? "Parcels" : "Parcelles", value: project.parcelIds },
                                { label: isEn ? "Authorization" : "Autorisation", value: isPC ? "PC" : "DP" },
                                ...(project.regulatoryAnalysis?.zoneType ? [{ label: isEn ? "PLU Zone" : "Zone PLU", value: project.regulatoryAnalysis.zoneType }] : []),
                                ...(project.projectDescription?.jobs?.length ? [{ label: isEn ? "Works" : "Travaux", value: `${project.projectDescription.jobs.length} ${isEn ? "items" : "postes"}` }] : []),
                            ].map((row, i) => (
                                <div
                                    key={i}
                                    className={cn(
                                        "px-7 py-3 flex items-baseline gap-3",
                                        i % 2 === 0 && "sm:border-r sm:border-slate-50",
                                        i >= 2 && "border-t border-slate-50",
                                    )}
                                >
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider w-20 shrink-0">{row.label}</span>
                                    <span className="text-xs text-slate-700 truncate">{row.value || "—"}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>
        </Navigation>
    );
}
