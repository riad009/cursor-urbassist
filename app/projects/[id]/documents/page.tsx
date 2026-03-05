"use client";

import React, { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navigation from "@/components/layout/Navigation";
import {
    FileText,
    Check,
    Loader2,
    Info,
    AlertTriangle,
    Shield,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { cn } from "@/lib/utils";
import {
    getDocumentsForProject,
    type AuthorizationDocument,
} from "@/lib/authorization-documents";

/* ── Circular checkmark SVG ──────────────────────────────────────────────── */
function CircleCheck({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            className={className}
            xmlns="http://www.w3.org/2000/svg"
        >
            <circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <path
                d="M7.5 12.5L10.5 15.5L16.5 9"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export default function DocumentsPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id: projectId } = use(params);
    const { user } = useAuth();
    const { t } = useLanguage();
    const router = useRouter();
    const isEn = t("auth.next") === "Next";

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [wantCerfa, setWantCerfa] = useState(false);
    const [wantPlu, setWantPlu] = useState(false);
    const [project, setProject] = useState<{
        name?: string;
        authorizationType?: string | null;
        projectType?: string | null;
        projectDescription?: Record<string, unknown> | null;
        protectedAreas?: { type: string; name: string }[] | null;
        regulatoryAnalysis?: { isProtectedArea?: boolean; abfRequired?: boolean; heritageTypes?: string[] } | null;
    } | null>(null);

    // Load project data
    useEffect(() => {
        fetch(`/api/projects/${projectId}`)
            .then((r) => r.json())
            .then((d) => {
                if (d.project) setProject(d.project);
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [projectId]);

    // Derive document list
    const authType = project?.authorizationType || null;
    const isPC = authType === "PC" || authType === "ARCHITECT_REQUIRED";

    // ABF detection
    const protectedAreasABF = (project?.protectedAreas || []).some(
        (a: { type: string }) =>
            a.type === "ABF" ||
            a.type === "HERITAGE" ||
            a.type === "abf" ||
            a.type === "heritage" ||
            a.type === "MONUMENT_HISTORIQUE" ||
            a.type === "SITE_PATRIMONIAL"
    );
    const regulatoryABF = project?.regulatoryAnalysis?.isProtectedArea === true ||
        project?.regulatoryAnalysis?.abfRequired === true;
    const hasABF = protectedAreasABF || regulatoryABF;

    // Existing structure detection
    const projectDescCategories = (project?.projectDescription as { categories?: string[] })?.categories || [];
    const projectDescWorkItems = (project?.projectDescription as { workItems?: { projectType: string }[] })?.workItems || [];
    const isExistingStructure =
        project?.projectType === "extension" ||
        project?.projectType === "existing_extension" ||
        project?.projectType === "renovation" ||
        project?.projectType === "facade_change" ||
        projectDescCategories.includes("existing_extension") ||
        projectDescCategories.includes("renovation") ||
        projectDescWorkItems.some((w: { projectType: string }) =>
            ["existing_extension", "facade_change"].includes(w.projectType)
        );

    const documents = getDocumentsForProject(authType, {
        hasABF,
        isExistingStructure,
    });

    const titleText = isPC
        ? (isEn ? "Generate my building permit" : "Générer mon permis de construire")
        : (isEn ? "Generate my prior declaration" : "Générer ma déclaration préalable");

    async function handleConfirm() {
        setSaving(true);
        try {
            await fetch(`/api/projects/${projectId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectDescription: {
                        ...(project?.projectDescription || {}),
                        wantCerfa,
                        wantPluAnalysis: wantPlu,
                    },
                }),
            });
            router.push(`/projects/${projectId}/payment`);
        } catch (err) {
            console.error("Save failed:", err);
        }
        setSaving(false);
    }

    if (loading) {
        return (
            <Navigation>
                <div className="min-h-screen flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                </div>
            </Navigation>
        );
    }

    // Split documents into pairs for the 2-column grid
    const docPairs: [AuthorizationDocument, AuthorizationDocument | null][] = [];
    for (let i = 0; i < documents.length; i += 2) {
        docPairs.push([documents[i], documents[i + 1] || null]);
    }

    return (
        <Navigation>
            <div className="min-h-screen p-4 lg:p-8 flex items-start justify-center">
                <div className="w-full max-w-[640px]">

                    {/* Main card */}
                    <div className="rounded-2xl bg-white border border-slate-200/80 shadow-[0_2px_16px_rgba(0,0,0,0.06)] overflow-hidden">

                        {/* ── Header ── */}
                        <div className="px-8 pt-10 pb-6 text-center">
                            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200/60 flex items-center justify-center mx-auto mb-4">
                                <FileText className="w-7 h-7 text-emerald-600" />
                            </div>
                            <h1 className="text-xl font-bold text-slate-900 mb-2">
                                {titleText}
                            </h1>
                            <p className="text-sm text-slate-400">
                                {isEn
                                    ? "Here is the list of required parts. Select the additional options:"
                                    : "Voici la liste des pièces requises. Sélectionnez les options supplémentaires :"}
                            </p>

                            {/* ABF Badge */}
                            {hasABF && (
                                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 text-xs font-bold border border-amber-200/60">
                                    {isEn ? "Protected Area (ABF)" : "Zone protégée (ABF)"}
                                </div>
                            )}
                        </div>

                        {/* ── Detection Warnings ── */}
                        <div className="px-8 pb-4 space-y-3">
                            {/* ABF Heritage Zone Warning */}
                            {hasABF && (
                                <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
                                    <Shield className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-semibold text-amber-700">
                                            {isEn ? "ABF Heritage Zone Detected" : "Zone ABF / Patrimoine détectée"}
                                        </p>
                                        <p className="text-xs text-amber-600 mt-1 leading-relaxed">
                                            {authType === "DP"
                                                ? (isEn
                                                    ? "Additional document DPC 11 has been automatically added to your list."
                                                    : "Le document DPC 11 a été automatiquement ajouté à votre liste.")
                                                : (isEn
                                                    ? "The PC4 descriptive notice will be completed with the necessary information for the ABF."
                                                    : "La notice descriptive PC4 sera complétée avec les informations nécessaires pour l'ABF.")}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Architect Required Warning */}
                            {(project?.projectDescription as { architectRequired?: boolean })?.architectRequired && (
                                <div className="rounded-xl bg-red-50 border border-red-200 p-4 flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-semibold text-red-700">
                                            {isEn ? "Architect Required" : "Architecte obligatoire"}
                                        </p>
                                        <p className="text-xs text-red-600 mt-1 leading-relaxed">
                                            {isEn
                                                ? "Your project exceeds the 150 m² threshold. An architect is legally required for this building permit application."
                                                : "Votre projet dépasse le seuil de 150 m². Le recours à un architecte est obligatoire pour cette demande de permis de construire."}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Existing Structure — split PC5 info */}
                            {isExistingStructure && isPC && (
                                <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-semibold text-blue-700">
                                            {isEn ? "Existing Structure Project" : "Projet sur structure existante"}
                                        </p>
                                        <p className="text-xs text-blue-600 mt-1 leading-relaxed">
                                            {isEn
                                                ? "PC5 has been split into two plans: one for existing façades/roofs and one for the proposed project, so urbanism can clearly see both states."
                                                : "Le PC5 a été séparé en deux plans : un pour les façades/toitures existantes et un pour le projet projeté, afin que l'urbanisme puisse clairement voir les deux états."}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Documents Grid ── */}
                        <div className="px-8 pb-6">
                            <div className="space-y-3">
                                {docPairs.map(([left, right], rowIdx) => (
                                    <div key={rowIdx} className="grid grid-cols-2 gap-3">
                                        {/* Left card */}
                                        <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-4 flex items-start gap-3 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                                            <CircleCheck className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                                            <div className="min-w-0">
                                                <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider leading-none">
                                                    {left.code}
                                                </p>
                                                <p className="text-[13px] font-semibold text-slate-800 leading-snug mt-1">
                                                    {left.code} - {isEn ? getEnLabel(left.code) : left.label}
                                                </p>
                                                {left.tag === "ABF" && (
                                                    <p className="text-[10px] text-amber-600 mt-0.5 font-medium">
                                                        {isEn ? "ABF zone" : "Zone ABF"}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Right card */}
                                        {right ? (
                                            <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-4 flex items-start gap-3 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                                                <CircleCheck className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                                                <div className="min-w-0">
                                                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider leading-none">
                                                        {right.code}
                                                    </p>
                                                    <p className="text-[13px] font-semibold text-slate-800 leading-snug mt-1">
                                                        {right.code} - {isEn ? getEnLabel(right.code) : right.label}
                                                    </p>
                                                    {right.tag === "ABF" && (
                                                        <p className="text-[10px] text-amber-600 mt-0.5 font-medium">
                                                            {isEn ? "ABF zone" : "Zone ABF"}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* ── Add-on Options ── */}
                        <div className="px-8 pb-4 space-y-3">
                            {/* CERFA Option */}
                            <button
                                type="button"
                                onClick={() => setWantCerfa(v => !v)}
                                className={cn(
                                    "w-full rounded-xl border-2 px-5 py-4 flex items-center gap-4 text-left transition-all",
                                    wantCerfa
                                        ? "border-indigo-400 bg-indigo-50/60"
                                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                                )}
                            >
                                <div className={cn(
                                    "w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors",
                                    wantCerfa ? "border-indigo-500 bg-indigo-500" : "border-slate-300 bg-white"
                                )}>
                                    {wantCerfa && <Check className="w-3 h-3 text-white" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-900">
                                        {isEn ? "Pre-filled CERFA form" : "Formulaire CERFA pré-rempli"}
                                    </p>
                                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                                        {isEn
                                            ? "Save time: we automatically fill in the administrative fields."
                                            : "Gagnez du temps : nous remplissons automatiquement les champs administratifs."}
                                    </p>
                                </div>
                                <span className="text-sm font-bold text-indigo-600 shrink-0">5€</span>
                            </button>

                            {/* PLU Option */}
                            <button
                                type="button"
                                onClick={() => setWantPlu(v => !v)}
                                className={cn(
                                    "w-full rounded-xl border-2 px-5 py-4 flex items-center gap-4 text-left transition-all",
                                    wantPlu
                                        ? "border-indigo-400 bg-indigo-50/60"
                                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                                )}
                            >
                                <div className={cn(
                                    "w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors",
                                    wantPlu ? "border-indigo-500 bg-indigo-500" : "border-slate-300 bg-white"
                                )}>
                                    {wantPlu && <Check className="w-3 h-3 text-white" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-900">
                                        {isEn ? "Analysis of the regulations (PLU)" : "Analyse du règlement (PLU)"}
                                    </p>
                                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                                        {isEn
                                            ? "Verification of your project's compliance with local regulations."
                                            : "Vérification de la conformité de votre projet avec le règlement local."}
                                    </p>
                                </div>
                                <span className="text-sm font-bold text-indigo-600 shrink-0">€15</span>
                            </button>
                        </div>

                        {/* ── PCMI Note — PC only ── */}
                        {isPC && (
                            <div className="px-8 pb-5 pt-1">
                                <div className="rounded-xl bg-amber-50 border border-amber-200/70 p-4">
                                    <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5 mb-1.5">
                                        <Info className="w-3.5 h-3.5 shrink-0" />
                                        {isEn ? "Note – Detached House & Outbuildings" : "Note – Maison individuelle & annexes"}
                                    </p>
                                    <p className="text-xs text-amber-700 leading-relaxed">
                                        {isEn ? "For the projects in question, also plan for:" : "Pour les projets concernés, prévoir également :"}
                                    </p>
                                    <ul className="text-xs text-amber-700 mt-1.5 space-y-0.5 list-disc list-inside leading-relaxed">
                                        <li>PCMI14-2: {isEn ? "RE2020 Certificate" : "Attestation RE2020"}</li>
                                        <li>PCMI13: {isEn ? "Seismic Certificate" : "Attestation parasismique"}</li>
                                    </ul>
                                </div>
                            </div>
                        )}

                        {/* ── Confirm Button ── */}
                        <div className="px-8 pb-10 pt-3 flex justify-center">
                            <button
                                type="button"
                                onClick={handleConfirm}
                                disabled={saving}
                                className="px-10 py-3.5 rounded-full bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-semibold hover:shadow-lg hover:shadow-purple-500/25 transition-all disabled:opacity-60 flex items-center gap-2"
                            >
                                {saving ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> {isEn ? "Saving…" : "Enregistrement…"}</>
                                ) : (
                                    isEn ? "Confirm and access the editor" : "Confirmer et accéder à l'éditeur"
                                )}
                            </button>
                        </div>

                    </div>
                </div>
            </div>
        </Navigation>
    );
}

/* ── English label map for document codes ─────────────────────────────────── */
function getEnLabel(code: string): string {
    const map: Record<string, string> = {
        "PC 1": "Site plan",
        "PC 2": "Site plan",
        "PC 3": "Cutting Plan",
        "PC 4": "Descriptive Notice",
        "PC 5": "Plan of the facades and roofs",
        "PC 5a": "Facades & roofs – Existing",
        "PC 5b": "Facades & roofs – Proposed",
        "PC 6": "Graphic document (3D landscape insertion)",
        "PC 7": "Photography of the immediate environment",
        "PC 8": "Photography of the distant environment",
        "DPC 1": "Site plan",
        "DPC 2": "Mass plan",
        "DPC 3": "Cross-section plan",
        "DPC 4": "Facades and roofs plan",
        "DPC 5": "External appearance representation",
        "DPC 6": "Graphic document",
        "DPC 7": "Photography of nearby environment",
        "DPC 8": "Photography of distant environment",
        "DPC 8.1": "Descriptive notice of the project",
        "DPC 11": "Heritage works execution notice",
    };
    return map[code] || code;
}
