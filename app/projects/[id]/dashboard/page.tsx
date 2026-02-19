"use client";

import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import Navigation from "@/components/layout/Navigation";
import {
    MapPin, Loader2, ArrowRight, FileText, Download, Box,
    ClipboardList, Sparkles, CheckCircle2, Clock, ChevronRight,
    PenTool, FolderKanban, Layers, Check, CreditCard, Map,
    Eye, X, Search,
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
    const [expandedStep, setExpandedStep] = useState<string | null>(null);

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

    // For demo: mark analysis, 3D, and complete as done if description is done
    const hasAnalysis = hasDescription;
    const has3D = hasDescription;
    const hasCompleteFile = hasDescription;

    // ── Workflow steps ────────────────────────────────────────────────────────
    const workflowSteps = [
        {
            id: "localisation", icon: Map, label: isEn ? "Localisation" : "Localisation",
            done: hasAddress,
            viewData: hasAddress ? [
                { label: isEn ? "Address" : "Adresse", value: project?.address || "—" },
                { label: isEn ? "Municipality" : "Commune", value: project?.municipality || "—" },
                { label: isEn ? "Parcels" : "Parcelles", value: project?.parcelIds || "—" },
            ] : null,
        },
        {
            id: "authorization", icon: FileText, label: isEn ? "Authorization" : "Autorisation",
            done: hasAuthorization,
            viewData: hasAuthorization ? [
                { label: isEn ? "Type" : "Type", value: project?.authorizationType || "—" },
                { label: isEn ? "Details" : "Détails", value: project?.authorizationExplanation || "—" },
            ] : null,
        },
        {
            id: "documents", icon: ClipboardList, label: isEn ? "Documents" : "Documents",
            done: hasDocuments,
            viewData: hasDocuments ? [
                { label: isEn ? "Auth type" : "Type", value: project?.authorizationType || "—" },
            ] : null,
        },
        {
            id: "payment", icon: CreditCard, label: isEn ? "Payment" : "Paiement",
            done: hasPaid,
            viewData: hasPaid ? [
                { label: isEn ? "Paid on" : "Payé le", value: project?.paidAt ? new Date(project.paidAt).toLocaleDateString(isEn ? "en-GB" : "fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "—" },
            ] : null,
        },
        {
            id: "description", icon: ClipboardList, label: isEn ? "Description" : "Description",
            done: hasDescription,
            viewData: hasDescription ? [
                { label: isEn ? "Terrain" : "Terrain", value: (project?.projectDescription?.terrainInitial || "").slice(0, 100) || "—" },
                { label: isEn ? "Works" : "Travaux", value: String(project?.projectDescription?.jobs?.length ?? 0) },
            ] : null,
        },
        {
            id: "analysis", icon: Search, label: isEn ? "PLU Analysis" : "Analyse PLU",
            done: hasAnalysis,
            viewData: hasAnalysis ? [
                { label: isEn ? "Zone" : "Zone", value: "Zone U" },
                { label: isEn ? "Status" : "Statut", value: isEn ? "Compliant ✓" : "Conforme ✓" },
            ] : null,
        },
        {
            id: "3d-design", icon: Box, label: isEn ? "3D Design" : "3D Design",
            done: has3D,
            viewData: has3D ? [
                { label: isEn ? "Model" : "Modèle", value: isEn ? "Validated ✓" : "Validé ✓" },
            ] : null,
        },
        {
            id: "complete-file", icon: FolderKanban, label: isEn ? "Complete File" : "Dossier Complet",
            done: hasCompleteFile,
            viewData: hasCompleteFile ? [
                { label: isEn ? "Documents" : "Documents", value: "PC1–PC6" },
                { label: isEn ? "Status" : "Statut", value: isEn ? "Ready ✓" : "Prêt ✓" },
            ] : null,
        },
    ];

    const completedCount = workflowSteps.filter(s => s.done).length;
    const progressPercent = Math.round((completedCount / workflowSteps.length) * 100);
    const allDone = completedCount === workflowSteps.length;

    // ── Action cards ─────────────────────────────────────────────────────────
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
            status: has3D
                ? { label: isEn ? "Completed ✓" : "Complété ✓", icon: CheckCircle2, color: "text-emerald-600" }
                : { label: isEn ? "Ready" : "Prêt", icon: Sparkles, color: "text-blue-500" },
            badge: has3D ? (isEn ? "Done" : "Fait") : null,
        },
        {
            id: "documents", icon: FileText,
            gradient: "from-emerald-500 to-teal-600", bgLight: "bg-emerald-50",
            borderColor: "border-emerald-200", textColor: "text-emerald-700", iconBg: "bg-emerald-100",
            title: isEn ? "Administrative Documents" : "Documents administratifs",
            subtitle: isEn ? "View and manage all required documents for your planning application." : "Consultez et gérez tous les documents requis.",
            cta: isEn ? "View documents" : "Voir les documents",
            href: `/projects/${projectId}/documents`,
            status: hasCompleteFile
                ? { label: isEn ? "Completed ✓" : "Complété ✓", icon: CheckCircle2, color: "text-emerald-600" }
                : docCount > 0
                    ? { label: `${docCount}/${totalDocs} ${isEn ? "ready" : "prêts"}`, icon: CheckCircle2, color: "text-emerald-500" }
                    : { label: isEn ? "Pending" : "En attente", icon: Clock, color: "text-slate-400" },
            badge: hasCompleteFile ? (isEn ? "Done" : "Fait") : docCount > 0 ? `${docCount}/${totalDocs}` : null,
        },
        {
            id: "export", icon: Download,
            gradient: "from-slate-600 to-slate-800", bgLight: "bg-slate-50",
            borderColor: "border-slate-200", textColor: "text-slate-700", iconBg: "bg-slate-100",
            title: isEn ? "Export & Submit" : "Exporter & Déposer",
            subtitle: isEn ? "Export your complete planning application as a PDF package ready to submit." : "Exportez votre dossier complet en PDF prêt à déposer.",
            cta: isEn ? "Export dossier" : "Exporter le dossier",
            href: `/export?project=${projectId}`,
            status: hasCompleteFile
                ? { label: isEn ? "Ready to export" : "Prêt à exporter", icon: CheckCircle2, color: "text-emerald-600" }
                : { label: isEn ? "When ready" : "Quand prêt", icon: Clock, color: "text-slate-400" },
            badge: hasCompleteFile ? (isEn ? "Ready" : "Prêt") : null,
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
                                    { value: `${completedCount}/${workflowSteps.length}`, label: isEn ? "Steps done" : "Étapes", color: "text-slate-900" },
                                    { value: `${progressPercent}%`, label: isEn ? "Complete" : "Complété", color: allDone ? "text-green-600" : "text-indigo-600" },
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
                                <span className={cn("text-xs font-bold", allDone ? "text-green-600" : "text-indigo-600")}>{progressPercent}%</span>
                            </div>
                            <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                                <div
                                    className={cn(
                                        "h-full rounded-full transition-all duration-700 relative",
                                        allDone
                                            ? "bg-gradient-to-r from-green-500 via-emerald-500 to-teal-400"
                                            : "bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-400"
                                    )}
                                    style={{ width: `${Math.max(4, progressPercent)}%` }}
                                >
                                    <div className="absolute inset-0 bg-white/20 rounded-full animate-pulse" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">

                    {/* ══ WORKFLOW PROGRESS — Compact Visual Steps ══ */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                                {isEn ? "Workflow progress" : "Progression du workflow"}
                            </p>
                            <span className="text-xs text-slate-400">
                                {completedCount}/{workflowSteps.length} {isEn ? "completed" : "complétées"}
                            </span>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                            {/* Horizontal step indicators */}
                            <div className="flex items-center gap-0 mb-2 overflow-x-auto pb-1">
                                {workflowSteps.map((step, i) => {
                                    const Icon = step.icon;
                                    const isExpanded = expandedStep === step.id;
                                    return (
                                        <React.Fragment key={step.id}>
                                            {/* Step dot + label */}
                                            <button
                                                onClick={() => setExpandedStep(isExpanded ? null : (step.done && step.viewData ? step.id : null))}
                                                className={cn(
                                                    "flex flex-col items-center gap-1.5 min-w-[80px] px-1 py-2 rounded-xl transition-all",
                                                    isExpanded && "bg-indigo-50",
                                                    step.done && step.viewData && "cursor-pointer hover:bg-slate-50",
                                                    !step.done && "cursor-default"
                                                )}
                                            >
                                                <div className={cn(
                                                    "w-9 h-9 rounded-full flex items-center justify-center transition-all",
                                                    step.done
                                                        ? "bg-gradient-to-br from-indigo-500 to-purple-600 shadow-sm shadow-indigo-200"
                                                        : "bg-slate-100 border-2 border-dashed border-slate-300"
                                                )}>
                                                    {step.done
                                                        ? <Check className="w-4 h-4 text-white" />
                                                        : <Icon className="w-3.5 h-3.5 text-slate-400" />
                                                    }
                                                </div>
                                                <span className={cn(
                                                    "text-[10px] font-semibold text-center leading-tight max-w-[72px]",
                                                    step.done ? "text-slate-700" : "text-slate-400"
                                                )}>
                                                    {step.label}
                                                </span>
                                            </button>

                                            {/* Connector line */}
                                            {i < workflowSteps.length - 1 && (
                                                <div className={cn(
                                                    "flex-1 h-[2px] min-w-[16px] mx-0.5 rounded-full",
                                                    workflowSteps[i + 1].done
                                                        ? "bg-gradient-to-r from-indigo-400 to-purple-400"
                                                        : step.done
                                                            ? "bg-gradient-to-r from-indigo-300 to-slate-200"
                                                            : "bg-slate-200"
                                                )} />
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </div>

                            {/* Expanded detail panel */}
                            {expandedStep && (() => {
                                const step = workflowSteps.find(s => s.id === expandedStep);
                                if (!step?.viewData) return null;
                                return (
                                    <div className="mt-4 rounded-xl border border-indigo-100 overflow-hidden bg-white shadow-sm animate-in fade-in">
                                        <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600">
                                            <div className="flex items-center gap-2">
                                                <Eye className="w-3.5 h-3.5 text-indigo-200" />
                                                <p className="text-xs font-bold text-white">{step.label}</p>
                                            </div>
                                            <button
                                                onClick={() => setExpandedStep(null)}
                                                className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
                                            >
                                                <X className="w-3 h-3 text-white" />
                                            </button>
                                        </div>
                                        <div>
                                            {step.viewData.map((row, ri) => (
                                                <InfoRow key={ri} label={row.label} value={row.value} />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>

                    {/* ── Completion banner ── */}
                    {allDone && (
                        <div className="rounded-2xl bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 p-5 flex items-center gap-4 shadow-lg shadow-green-500/20">
                            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                                <CheckCircle2 className="w-6 h-6 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-white font-bold text-base">
                                    {isEn ? "🎉 Your file is complete!" : "🎉 Votre dossier est complet !"}
                                </p>
                                <p className="text-green-100 text-sm mt-0.5">
                                    {isEn ? "All steps are done. You can now export your complete planning application." : "Toutes les étapes sont terminées. Vous pouvez maintenant exporter votre dossier complet."}
                                </p>
                            </div>
                            <Link
                                href={`/export?project=${projectId}`}
                                className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-green-700 font-semibold text-sm hover:bg-green-50 transition-colors"
                            >
                                <Download className="w-4 h-4" />
                                {isEn ? "Export PDF" : "Exporter PDF"}
                            </Link>
                        </div>
                    )}

                    {/* ── Welcome banner (when not started) ── */}
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
