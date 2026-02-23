"use client";

import React, { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navigation from "@/components/layout/Navigation";
import {
    FileText,
    ClipboardCheck,
    Check,
    Loader2,
    ChevronRight,
    AlertTriangle,
    Shield,
    ArrowLeft,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { cn } from "@/lib/utils";
import {
    getDocumentsForProject,
    type AuthorizationDocument,
} from "@/lib/authorization-documents";

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
    const [project, setProject] = useState<{
        name?: string;
        authorizationType?: string | null;
        projectType?: string | null;
        projectDescription?: Record<string, unknown> | null;
        protectedAreas?: { type: string; name: string }[] | null;
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
    const hasABF = (project?.protectedAreas || []).some(
        (a: { type: string }) => a.type === "ABF" || a.type === "HERITAGE"
    );
    const isExistingStructure =
        project?.projectType === "extension" ||
        (project?.projectDescription as { categories?: string[] })?.categories?.includes("existing_extension");

    const documents = getDocumentsForProject(authType, {
        hasABF,
        isExistingStructure,
    });

    const determinationLabel =
        authType === "DP"
            ? isEn
                ? "Preliminary Declaration (DP)"
                : "Déclaration Préalable (DP)"
            : authType === "PC" || authType === "ARCHITECT_REQUIRED"
                ? isEn
                    ? "Building Permit (PC)"
                    : "Permis de Construire (PC)"
                : isEn
                    ? "Authorization"
                    : "Autorisation";

    if (loading) {
        return (
            <Navigation>
                <div className="min-h-screen flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                </div>
            </Navigation>
        );
    }

    return (
        <Navigation>
            <div className="min-h-screen p-4 lg:p-8">
                <div className="max-w-3xl mx-auto space-y-6">

                    {/* Header */}
                    <div className="text-center space-y-2">
                        <h1 className="text-2xl font-bold text-slate-900">
                            {isEn ? "Documents to Produce" : "Documents à produire"}
                        </h1>
                        <p className="text-sm text-slate-500">
                            {isEn
                                ? "Here is the complete list of documents required for your application."
                                : "Voici la liste complète des documents requis pour votre dossier."}
                        </p>
                    </div>

                    {/* Authorization type badge */}
                    <div className="flex justify-center">
                        <div
                            className={cn(
                                "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold",
                                authType === "DP"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : authType === "PC" || authType === "ARCHITECT_REQUIRED"
                                        ? "bg-purple-100 text-purple-700"
                                        : "bg-slate-100 text-slate-600"
                            )}
                        >
                            {authType === "DP" ? (
                                <FileText className="w-4 h-4" />
                            ) : (
                                <ClipboardCheck className="w-4 h-4" />
                            )}
                            {determinationLabel}
                        </div>
                    </div>

                    {/* ABF Warning */}
                    {hasABF && (
                        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
                            <Shield className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-semibold text-amber-700">
                                    {isEn ? "ABF Heritage Zone Detected" : "Zone ABF / Patrimoine détectée"}
                                </p>
                                <p className="text-xs text-amber-600 mt-1">
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

                    {/* Existing structure info for split PC5 */}
                    {isExistingStructure && (authType === "PC" || authType === "ARCHITECT_REQUIRED") && (
                        <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-semibold text-blue-700">
                                    {isEn ? "Existing Structure Project" : "Projet sur structure existante"}
                                </p>
                                <p className="text-xs text-blue-600 mt-1">
                                    {isEn
                                        ? "PC5 has been split into two plans: one for existing façades/roofs and one for the proposed project, so urbanism can clearly see both states."
                                        : "Le PC5 a été séparé en deux plans : un pour les façades/toitures existantes et un pour le projet projeté, afin que l'urbanisme puisse clairement voir les deux états."}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Document List */}
                    <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm">
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <FileText className="w-5 h-5 text-blue-600" />
                                <span className="text-base font-semibold text-slate-900">
                                    {isEn ? "Required Documents" : "Documents requis"}
                                </span>
                            </div>
                            <span className="text-sm text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg font-medium">
                                {documents.length} {isEn ? "documents" : "documents"}
                            </span>
                        </div>
                        <div className="divide-y divide-slate-100">
                            {documents.map((doc: AuthorizationDocument, i: number) => (
                                <div
                                    key={doc.code}
                                    className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors"
                                >
                                    <span className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-xs font-bold text-blue-600 shrink-0 mt-0.5">
                                        {i + 1}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs font-bold text-slate-400 uppercase">
                                                {doc.code}
                                            </span>
                                            {doc.tag && (
                                                <span
                                                    className={cn(
                                                        "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                                                        doc.tag === "ABF"
                                                            ? "bg-amber-100 text-amber-700"
                                                            : doc.tag === "Existant"
                                                                ? "bg-blue-100 text-blue-700"
                                                                : doc.tag === "Projeté"
                                                                    ? "bg-purple-100 text-purple-700"
                                                                    : "bg-slate-100 text-slate-600"
                                                    )}
                                                >
                                                    {doc.tag}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm font-medium text-slate-800 mt-0.5">
                                            {doc.label}
                                        </p>
                                        {doc.description && (
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                {doc.description}
                                            </p>
                                        )}
                                    </div>
                                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-1" />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* PCMI Note — single-family houses & annexes */}
                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                        <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5 mb-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {isEn ? "Note – Detached House & Outbuildings" : "Note – Maison individuelle & annexes"}
                        </p>
                        <p className="text-xs text-amber-700">
                            {isEn ? "For the projects in question, also plan for:" : "Pour les projets concernés, prévoir également :"}
                        </p>
                        <ul className="text-xs text-amber-700 mt-1 space-y-0.5 list-disc list-inside">
                            <li>PCMI14-2: {isEn ? "RE2020 Certificate" : "Attestation RE2020"}</li>
                            <li>PCMI13: {isEn ? "Seismic Certificate" : "Attestation parasismique"}</li>
                        </ul>
                    </div>

                    {/* Navigation buttons */}
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => router.push(`/projects/${projectId}/authorization`)}
                            className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-medium hover:bg-slate-200 transition-colors inline-flex items-center gap-2 border border-slate-200"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            {isEn ? "Back" : "Retour"}
                        </button>
                        <div className="flex-1" />
                        <button
                            type="button"
                            onClick={() => router.push(`/projects/${projectId}/payment`)}
                            className="px-8 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:shadow-lg hover:shadow-purple-500/20 transition-all flex items-center gap-2 text-base"
                        >
                            {isEn ? "Next: Access project workspace" : "Suivant : Accéder à l'espace projet"}
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        </Navigation>
    );
}
