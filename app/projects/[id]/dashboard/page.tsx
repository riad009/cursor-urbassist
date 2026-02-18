"use client";

import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import Navigation from "@/components/layout/Navigation";
import {
    MapPin, Loader2, ArrowRight, FileText, Download, Box,
    ClipboardList, Sparkles, CheckCircle2, Clock, ChevronRight,
    PenTool, FolderKanban, Layers, Check, CreditCard, Map,
    Eye, X, AlertCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProjectDescription {
    terrainInitial?: string;
    accessVerts?: string;
    jobs?: { id: string; nature: string; levels: number; footprint: number; floorAreaEstimated: number }[];
    exteriorMaterials?: string;
    roofType?: string;
    submitterType?: string;
    dpcDetermination?: string;
}

interface Project {
    id: string;
    name: string;
    address: string | null;
    municipality?: string | null;
    parcelIds?: string | null;
    authorizationType?: string | null;
    authorizationExplanation?: string | null;
    paidAt?: string | null;
    documents?: { id: string; type: string; fileUrl: string | null; fileData: string | null }[];
    projectDescription?: ProjectDescription | null;
    protectedAreas?: { type: string; name: string }[] | null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex gap-4 py-3 px-5 border-b border-slate-100 last:border-0">
            <span className="text-xs font-semibold text-slate-400 w-40 shrink-0 pt-0.5 uppercase tracking-wide">{label}</span>
            <span className="text-sm text-slate-800 flex-1 leading-relaxed">{value || "—"}</span>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProjectDashboardPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: projectId } = use(params);
    const { t } = useLanguage();
    const { user, loading: authLoading } = useAuth();
    const isEn = t("auth.next") === "Next";

    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);
    const [activePanel, setActivePanel] = useState<string | null>(null);

    useEffect(() => {
        if (!projectId || (!user && !authLoading)) { setLoading(false); return; }
        if (authLoading) return;
        fetch(`/api/projects/${projectId}`, { credentials: "include" })
            .then(r => r.json())
            .then(d => { if (d.project) setProject(d.project); })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [projectId, user, authLoading]);

    // ── Derived ───────────────────────────────────────────────────────────────
    const hasAddress = !!project?.address;
    const hasAuthorization = !!project?.authorizationType;
    const hasDocuments = hasAuthorization;
    const hasPaid = !!project?.paidAt;
    const hasDescription = !!(
        project?.projectDescription?.terrainInitial ||
        (project?.projectDescription?.jobs?.length ?? 0) > 0
    );
    const docCount = project?.documents?.filter(d => d.fileUrl || d.fileData).length ?? 0;
    const totalDocs = 6;

    // ── Steps ─────────────────────────────────────────────────────────────────
    const steps = [
        {
            id: "localisation",
            icon: Map,
            color: "indigo",
            label: isEn ? "Localisation" : "Localisation",
            description: isEn ? "Project address & parcel defined" : "Adresse & parcelle du projet",
            done: hasAddress,
            href: `/projects/new`,
            viewData: hasAddress ? {
                title: isEn ? "Location Details" : "Détails de localisation",
                rows: [
                    { label: isEn ? "Address" : "Adresse", value: project?.address || "—" },
                    { label: isEn ? "Municipality" : "Commune", value: project?.municipality || "—" },
                    { label: isEn ? "Parcel IDs" : "Références parcellaires", value: project?.parcelIds || "—" },
                ],
            } : null,
        },
        {
            id: "authorization",
            icon: FileText,
            color: "blue",
            label: isEn ? "Authorization" : "Autorisation",
            description: isEn ? "DP or PC type determined" : "Type DP ou PC déterminé",
            done: hasAuthorization,
            href: `/projects/${projectId}/authorization`,
            viewData: hasAuthorization ? {
                title: isEn ? "Authorization Result" : "Résultat d'autorisation",
                rows: [
                    { label: isEn ? "Type" : "Type", value: project?.authorizationType || "—" },
                    { label: isEn ? "Explanation" : "Explication", value: project?.authorizationExplanation || "—" },
                ],
            } : null,
        },
        {
            id: "documents",
            icon: ClipboardList,
            color: "emerald",
            label: isEn ? "Document List" : "Liste des documents",
            description: isEn ? "Required documents reviewed" : "Documents requis consultés",
            done: hasDocuments,
            href: `/projects/${projectId}/documents`,
            viewData: hasDocuments ? {
                title: isEn ? "Document Summary" : "Résumé des documents",
                rows: [
                    { label: isEn ? "Auth type" : "Type d'autorisation", value: project?.authorizationType || "—" },
                    { label: isEn ? "Protected areas" : "Zones protégées", value: project?.protectedAreas?.map(a => a.name).join(", ") || (isEn ? "None detected" : "Aucune détectée") },
                ],
            } : null,
        },
        {
            id: "payment",
            icon: CreditCard,
            color: "violet",
            label: isEn ? "Payment" : "Paiement",
            description: isEn ? "Workspace unlocked" : "Espace projet déverrouillé",
            done: hasPaid,
            href: `/projects/${projectId}/payment`,
            viewData: hasPaid ? {
                title: isEn ? "Payment Info" : "Informations de paiement",
                rows: [
                    { label: isEn ? "Paid on" : "Payé le", value: project?.paidAt ? new Date(project.paidAt).toLocaleDateString(isEn ? "en-GB" : "fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "—" },
                    { label: isEn ? "Status" : "Statut", value: isEn ? "Active ✓" : "Actif ✓" },
                ],
            } : null,
        },
        {
            id: "description",
            icon: ClipboardList,
            color: "purple",
            label: isEn ? "Project Description" : "Description du projet",
            description: isEn ? "Works, materials & applicant" : "Travaux, matériaux & demandeur",
            done: hasDescription,
            href: `/projects/${projectId}/project-description`,
            viewData: hasDescription ? {
                title: isEn ? "Description Summary" : "Résumé de la description",
                rows: [
                    { label: isEn ? "Terrain" : "Terrain", value: (project?.projectDescription?.terrainInitial || "").slice(0, 150) + ((project?.projectDescription?.terrainInitial?.length ?? 0) > 150 ? "…" : "") || "—" },
                    { label: isEn ? "Works count" : "Nb. de travaux", value: String(project?.projectDescription?.jobs?.length ?? 0) },
                    { label: isEn ? "Exterior materials" : "Matériaux extérieurs", value: project?.projectDescription?.exteriorMaterials?.slice(0, 100) || "—" },
                    { label: isEn ? "Roof type" : "Type de toiture", value: project?.projectDescription?.roofType || "—" },
                    { label: isEn ? "Applicant type" : "Type de demandeur", value: project?.projectDescription?.submitterType || "—" },
                    { label: isEn ? "Detected auth" : "Auth. détectée", value: project?.projectDescription?.dpcDetermination || "—" },
                ],
            } : null,
        },
    ];

    const completedCount = steps.filter(s => s.done).length;
    const progressPercent = Math.round((completedCount / steps.length) * 100);

    // ── Cards ─────────────────────────────────────────────────────────────────
    const cards = [
        {
            id: "description", icon: ClipboardList,
            gradient: "from-violet-500 to-purple-600", bgLight: "bg-violet-50",
            borderColor: "border-violet-200", textColor: "text-violet-700", iconBg: "bg-violet-100",
            title: isEn ? "Project Description" : "Description du projet",
            subtitle: isEn ? "Describe your environment, works, materials and applicant type." : "Décrivez votre environnement, travaux, matériaux et type de demandeur.",
            cta: hasDescription ? (isEn ? "Resume" : "Reprendre") : (isEn ? "Start" : "Démarrer"),
            href: `/projects/${projectId}/project-description`,
            status: hasDescription
                ? { label: isEn ? "Completed ✓" : "Complété ✓", icon: CheckCircle2, color: "text-emerald-600" }
                : { label: isEn ? "Not started" : "Non commencé", icon: Clock, color: "text-slate-400" },
            badge: hasDescription ? (isEn ? "Done" : "Fait") : null,
        },
        {
            id: "editor", icon: Box,
            gradient: "from-blue-500 to-indigo-600", bgLight: "bg-blue-50",
            borderColor: "border-blue-200", textColor: "text-blue-700", iconBg: "bg-blue-100",
            title: isEn ? "3D Smart Editor" : "Éditeur 3D intelligent",
            subtitle: isEn ? "Design your project in 3D with our intelligent site plan editor." : "Concevez votre projet en 3D avec notre éditeur intelligent.",
            cta: isEn ? "Open editor" : "Ouvrir l'éditeur",
            href: `/site-plan?project=${projectId}`,
            status: { label: isEn ? "Ready" : "Prêt", icon: Sparkles, color: "text-blue-500" },
            badge: null,
        },
        {
            id: "documents", icon: FileText,
            gradient: "from-emerald-500 to-teal-600", bgLight: "bg-emerald-50",
            borderColor: "border-emerald-200", textColor: "text-emerald-700", iconBg: "bg-emerald-100",
            title: isEn ? "Administrative Documents" : "Documents administratifs",
            subtitle: isEn ? "View and manage all required documents for your planning application." : "Consultez et gérez tous les documents requis.",
            cta: isEn ? "View documents" : "Voir les documents",
            href: `/projects/${projectId}/documents`,
            status: hasAuthorization
                ? { label: isEn ? "Completed ✓" : "Complété ✓", icon: CheckCircle2, color: "text-emerald-600" }
                : docCount > 0
                    ? { label: `${docCount}/${totalDocs} ${isEn ? "ready" : "prêts"}`, icon: CheckCircle2, color: "text-emerald-500" }
                    : { label: isEn ? "Pending" : "En attente", icon: Clock, color: "text-slate-400" },
            badge: hasAuthorization ? (isEn ? "Done" : "Fait") : docCount > 0 ? `${docCount}/${totalDocs}` : null,
        },
        {
            id: "export", icon: Download,
            gradient: "from-slate-600 to-slate-800", bgLight: "bg-slate-50",
            borderColor: "border-slate-200", textColor: "text-slate-700", iconBg: "bg-slate-100",
            title: isEn ? "Export & Submit" : "Exporter & Déposer",
            subtitle: isEn ? "Export your complete planning application as a PDF package ready to submit." : "Exportez votre dossier complet en PDF prêt à déposer.",
            cta: isEn ? "Export dossier" : "Exporter le dossier",
            href: `/export?project=${projectId}`,
            status: { label: isEn ? "When ready" : "Quand prêt", icon: Clock, color: "text-slate-400" },
            badge: null,
        },
    ];

    // ── Loading ───────────────────────────────────────────────────────────────
    if (authLoading || loading) {
        return (
            <Navigation>
                <div className="min-h-screen flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                </div>
            </Navigation>
        );
    }

    if (!project) {
        return (
            <Navigation>
                <div className="p-8 text-center text-slate-500">{isEn ? "Project not found." : "Projet introuvable."}</div>
            </Navigation>
        );
    }

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <Navigation>
            <div className="min-h-screen bg-[#f5f6fa]">

                {/* ── Hero ── */}
                <div className="bg-white border-b border-slate-200">
                    <div className="max-w-6xl mx-auto px-6 py-8">
                        <div className="flex items-center gap-2 text-xs text-slate-400 mb-4">
                            <Link href="/projects" className="hover:text-slate-600 flex items-center gap-1 transition-colors">
                                <FolderKanban className="w-3.5 h-3.5" />
                                {isEn ? "Projects" : "Projets"}
                            </Link>
                            <ChevronRight className="w-3 h-3" />
                            <span className="text-slate-700 font-medium">{project.name}</span>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
                            <div>
                                <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">{project.name}</h1>
                                {project.address && (
                                    <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-2">
                                        <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                                        {project.address}
                                    </p>
                                )}
                                <div className="flex items-center gap-2 mt-3 flex-wrap">
                                    {project.authorizationType && (
                                        <span className={cn(
                                            "inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border",
                                            project.authorizationType === "PC"
                                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                                : "bg-blue-50 text-blue-700 border-blue-200"
                                        )}>
                                            {project.authorizationType === "PC"
                                                ? (isEn ? "Building Permit (PC)" : "Permis de Construire (PC)")
                                                : (isEn ? "Prior Declaration (DP)" : "Déclaration Préalable (DP)")}
                                        </span>
                                    )}
                                    {project.paidAt && (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                            <CheckCircle2 className="w-3 h-3" />
                                            {isEn ? "Paid" : "Payé"}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Stat pills */}
                            <div className="flex items-stretch gap-3 shrink-0">
                                {[
                                    { value: `${completedCount}/${steps.length}`, label: isEn ? "Steps done" : "Étapes faites", color: "text-slate-900" },
                                    { value: `${progressPercent}%`, label: isEn ? "Complete" : "Complété", color: "text-indigo-600" },
                                ].map(stat => (
                                    <div key={stat.label} className="flex flex-col items-center justify-center px-5 py-3 rounded-2xl bg-slate-50 border border-slate-200 min-w-[90px]">
                                        <span className={cn("text-2xl font-black", stat.color)}>{stat.value}</span>
                                        <span className="text-[11px] text-slate-400 font-medium mt-0.5">{stat.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Master progress bar */}
                        <div className="mt-6">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold text-slate-500">{isEn ? "Overall progress" : "Progression globale"}</span>
                                <span className="text-xs font-bold text-indigo-600">{progressPercent}%</span>
                            </div>
                            <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-400 transition-all duration-700 relative"
                                    style={{ width: `${Math.max(4, progressPercent)}%` }}
                                >
                                    <div className="absolute inset-0 bg-white/20 rounded-full animate-pulse" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">

                    {/* ══ PROGRESS SECTION ══ */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                                {isEn ? "Your progress" : "Votre progression"}
                            </p>
                            <span className="text-xs text-slate-400">
                                {completedCount} {isEn ? "of" : "sur"} {steps.length} {isEn ? "completed" : "complétées"}
                            </span>
                        </div>

                        {/* ── Detailed checklist with View panels ── */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            {steps.map((step, i) => {
                                const Icon = step.icon;
                                const isLast = i === steps.length - 1;
                                const isOpen = activePanel === step.id;

                                return (
                                    <div key={step.id}>
                                        {/* Row */}
                                        <div className={cn(
                                            "flex items-center gap-4 px-5 py-4 transition-all",
                                            !isLast && !isOpen && "border-b border-slate-100",
                                            isOpen && "bg-gradient-to-r from-indigo-50/60 to-purple-50/30"
                                        )}>
                                            {/* Step number / check */}
                                            <div className={cn(
                                                "w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-bold text-sm transition-all",
                                                step.done
                                                    ? "bg-gradient-to-br from-indigo-500 to-purple-600 shadow-sm shadow-indigo-200"
                                                    : "bg-slate-100"
                                            )}>
                                                {step.done
                                                    ? <Check className="w-4 h-4 text-white" />
                                                    : <span className="text-slate-400">{i + 1}</span>
                                                }
                                            </div>

                                            {/* Icon */}
                                            <div className={cn(
                                                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                                                step.done ? "bg-indigo-50" : "bg-slate-50"
                                            )}>
                                                <Icon className={cn("w-4 h-4", step.done ? "text-indigo-500" : "text-slate-300")} />
                                            </div>

                                            {/* Text */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className={cn("text-sm font-semibold", step.done ? "text-slate-900" : "text-slate-500")}>
                                                        {step.label}
                                                    </p>
                                                    {step.done && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                                                            <Check className="w-2.5 h-2.5" />
                                                            {isEn ? "Completed" : "Complété"}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-400 mt-0.5">{step.description}</p>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-2 shrink-0">
                                                {step.done && step.viewData && (
                                                    <button
                                                        onClick={() => setActivePanel(isOpen ? null : step.id)}
                                                        className={cn(
                                                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border",
                                                            isOpen
                                                                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                                                                : "bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                                                        )}
                                                    >
                                                        {isOpen ? <X className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                        {isOpen ? (isEn ? "Close" : "Fermer") : (isEn ? "View" : "Voir")}
                                                    </button>
                                                )}
                                                {!step.done && (
                                                    <Link
                                                        href={step.href}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
                                                    >
                                                        {isEn ? "Start" : "Commencer"}
                                                        <ChevronRight className="w-3.5 h-3.5" />
                                                    </Link>
                                                )}
                                            </div>
                                        </div>

                                        {/* Expanded panel */}
                                        {isOpen && step.viewData && (
                                            <div className={cn(
                                                "border-b border-slate-100 bg-gradient-to-r from-indigo-50/40 to-purple-50/20",
                                                !isLast && "border-b border-slate-100"
                                            )}>
                                                <div className="mx-5 mb-4 rounded-xl border border-indigo-100 overflow-hidden shadow-sm bg-white">
                                                    {/* Panel header */}
                                                    <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-indigo-600 to-purple-600">
                                                        <div className="flex items-center gap-2">
                                                            <Eye className="w-4 h-4 text-indigo-200" />
                                                            <p className="text-sm font-bold text-white">{step.viewData.title}</p>
                                                        </div>
                                                        <button
                                                            onClick={() => setActivePanel(null)}
                                                            className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
                                                        >
                                                            <X className="w-3.5 h-3.5 text-white" />
                                                        </button>
                                                    </div>
                                                    {/* Data rows */}
                                                    <div>
                                                        {step.viewData.rows.map((row, ri) => (
                                                            <InfoRow key={ri} label={row.label} value={row.value} />
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Welcome banner ── */}
                    {!hasDescription && (
                        <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 p-5 flex items-center gap-4 shadow-lg shadow-indigo-500/20">
                            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                                <Sparkles className="w-6 h-6 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-white font-bold text-base">
                                    {isEn ? "Welcome to your project dashboard!" : "Bienvenue sur votre tableau de bord !"}
                                </p>
                                <p className="text-indigo-200 text-sm mt-0.5">
                                    {isEn ? "Start by describing your project or jump straight into the 3D editor." : "Commencez par décrire votre projet ou lancez-vous dans l'éditeur 3D."}
                                </p>
                            </div>
                            <Link
                                href={`/projects/${projectId}/project-description`}
                                className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-indigo-700 font-semibold text-sm hover:bg-indigo-50 transition-colors"
                            >
                                {isEn ? "Get started" : "Commencer"}
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                        </div>
                    )}

                    {/* ── Action cards ── */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">
                            {isEn ? "Your workspace" : "Votre espace de travail"}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {cards.map((card) => {
                                const Icon = card.icon;
                                const StatusIcon = card.status.icon;
                                return (
                                    <Link
                                        key={card.id}
                                        href={card.href}
                                        className={cn(
                                            "group relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden",
                                            card.borderColor
                                        )}
                                    >
                                        <div className={cn("absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-10 bg-gradient-to-br transition-opacity group-hover:opacity-20", card.gradient)} />
                                        <div className="flex items-start justify-between mb-4 relative">
                                            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", card.iconBg)}>
                                                <Icon className={cn("w-6 h-6", card.textColor)} />
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                {card.badge && (
                                                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border", card.bgLight, card.textColor, card.borderColor)}>
                                                        {card.badge}
                                                    </span>
                                                )}
                                                <span className={cn("flex items-center gap-1 text-xs font-medium", card.status.color)}>
                                                    <StatusIcon className="w-3.5 h-3.5" />
                                                    {card.status.label}
                                                </span>
                                            </div>
                                        </div>
                                        <h3 className="text-base font-bold text-slate-900 mb-1.5">{card.title}</h3>
                                        <p className="text-sm text-slate-500 leading-relaxed flex-1">{card.subtitle}</p>
                                        <div className={cn("mt-5 flex items-center gap-2 text-sm font-semibold transition-colors", card.textColor)}>
                                            {card.cta}
                                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Secondary links ── */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[
                            { icon: Layers, label: isEn ? "Location Plan" : "Plan de situation", href: `/location-plan?project=${projectId}`, color: "text-purple-600", bg: "bg-purple-50" },
                            { icon: PenTool, label: isEn ? "Intelligent Editor" : "Éditeur intelligent", href: `/editor?project=${projectId}`, color: "text-blue-600", bg: "bg-blue-50" },
                            { icon: FileText, label: isEn ? "Descriptive Statement" : "Notice descriptive", href: `/statement?project=${projectId}`, color: "text-emerald-600", bg: "bg-emerald-50" },
                        ].map((item) => {
                            const Icon = item.icon;
                            return (
                                <Link key={item.href} href={item.href} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all group">
                                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", item.bg)}>
                                        <Icon className={cn("w-4 h-4", item.color)} />
                                    </div>
                                    <span className="text-sm font-medium text-slate-700 flex-1">{item.label}</span>
                                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                                </Link>
                            );
                        })}
                    </div>

                </div>
            </div>
        </Navigation>
    );
}
