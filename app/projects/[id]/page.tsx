"use client";

import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import Navigation from "@/components/layout/Navigation";
import {
  MapPin,
  Loader2,
  ArrowRight,
  Map,
  Layers,
  Scissors,
  Building2,
  Image,
  FileText,
  CheckCircle2,
  Circle,
  Clock,
  Download,
  FolderKanban,
  FileBarChart,
  Pencil,
  Box,
  PenTool,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { getNextStep } from "@/lib/step-flow";
import { NextStepButton } from "@/components/NextStepButton";
import { cn } from "@/lib/utils";

type DocStatus = "not_started" | "in_progress" | "completed";

export default function ProjectDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const { t } = useLanguage();

  const DOCUMENT_TYPES: {
    type: string;
    label: string;
    labelFr: string;
    icon: React.ElementType;
    href: (id: string) => string;
    isMain?: boolean;
  }[] = [
      { type: "SITE_PLAN", label: "Site plan (Main section)", labelFr: "Plan de masse (Section principale)", icon: Layers, href: (id) => `/editor?project=${id}`, isMain: true },
      { type: "LOCATION_PLAN", label: "Location plan", labelFr: "Plan de situation", icon: Map, href: (id) => `/location-plan?project=${id}` },
      { type: "SECTION", label: "Section", labelFr: "Coupe", icon: Scissors, href: (id) => `/terrain?project=${id}` },
      { type: "ELEVATION", label: "Elevations", labelFr: "Élévations", icon: Building2, href: (id) => `/terrain?project=${id}` },
      { type: "LANDSCAPE_INSERTION", label: "Landscape insertion", labelFr: "Insertion paysagère", icon: Image, href: (id) => `/landscape?project=${id}` },
      { type: "DESCRIPTIVE_STATEMENT", label: "Descriptive notice", labelFr: "Notice descriptive", icon: FileText, href: (id) => `/statement?project=${id}` },
    ];

  const [project, setProject] = useState<{
    id: string;
    name: string;
    address: string | null;
    coordinates?: string | null;
    paidAt?: string | null;
    documents?: { id: string; type: string; name: string; fileUrl: string | null; fileData: string | null }[];
    regulatoryAnalysis?: { id: string } | null;
    protectedAreas?: { type: string; name: string }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();

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
        if (!cancelled && data.project) setProject(data.project);
      })
      .catch(() => { })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, user, authLoading]);

  function getDocStatus(doc: { fileUrl?: string | null; fileData?: string | null } | undefined): DocStatus {
    if (!doc) return "not_started";
    if (doc.fileUrl || doc.fileData) return "completed";
    return "in_progress";
  }

  const isEn = t("auth.next") === "Next";

  const showLoading = authLoading || (!!user && !!projectId && loading);
  if (showLoading) {
    return (
      <Navigation>
        <div className="p-6 flex flex-col items-center justify-center min-h-[40vh] gap-3">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-slate-500 text-sm">{t("common.loading")}</p>
        </div>
      </Navigation>
    );
  }

  if (!project) {
    return (
      <Navigation>
        <div className="p-6 max-w-2xl mx-auto">
          <p className="text-slate-500">Project not found.</p>
          <Link href="/projects" className="text-blue-600 hover:underline mt-2 inline-block">
            ← {t("newProj.back")}
          </Link>
        </div>
      </Navigation>
    );
  }

  const docsByType = (project.documents || []).reduce(
    (acc, d) => {
      acc[d.type] = d;
      return acc;
    },
    {} as Record<string, { id: string; type: string; name: string; fileUrl: string | null; fileData: string | null }>
  );

  const statusConfig = {
    not_started: {
      label: isEn ? "Not Started" : "Non commencé",
      icon: <Circle className="w-4 h-4 text-slate-400" />,
      badge: "bg-slate-100 text-slate-500 border border-slate-200",
    },
    in_progress: {
      label: isEn ? "In Progress" : "En cours",
      icon: <Clock className="w-4 h-4 text-amber-500" />,
      badge: "bg-amber-50 text-amber-600 border border-amber-200",
    },
    completed: {
      label: isEn ? "Completed" : "Terminé",
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
      badge: "bg-emerald-50 text-emerald-600 border border-emerald-200",
    },
  };

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        {/* ── Header ── */}
        <div className="mb-8">
          <Link
            href="/projects"
            className="text-sm text-slate-500 hover:text-slate-700 transition-colors inline-flex items-center gap-1"
          >
            <FolderKanban className="w-4 h-4" />
            {t("nav.projects")}
          </Link>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 mt-2">{project.name}</h1>
          {project.address && (
            <div className="flex items-center gap-2 mt-1">
              <p className="text-slate-500 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                {project.address}
              </p>
              <Link
                href={`/projects/new`}
                className="text-xs text-blue-600 hover:text-blue-700 ml-2"
              >
                <Pencil className="w-3 h-3 inline mr-1" />
                {isEn ? "Edit address" : "Modifier l'adresse"}
              </Link>
            </div>
          )}
        </div>

        {/* ── PLU Analysis ── */}
        {project.regulatoryAnalysis && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            <p className="font-medium text-emerald-700">{t("overview.pluCompleted")}</p>
            <div className="flex flex-wrap gap-2 ml-auto">
              <Link
                href={`/regulations?project=${project.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-100 text-emerald-700 text-sm font-medium hover:bg-emerald-200 transition-colors"
              >
                {t("overview.viewAnalysis")}
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href={`/plu-analysis?project=${project.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 border border-slate-200 transition-colors"
              >
                <Download className="w-4 h-4" />
                {t("overview.exportPdf")}
              </Link>
            </div>
          </div>
        )}

        {!project.regulatoryAnalysis && (
          <div className="mb-8 p-5 rounded-2xl bg-blue-50 border border-blue-200">
            <h2 className="text-lg font-semibold text-slate-900 mb-2 flex items-center gap-2">
              <FileBarChart className="w-5 h-5 text-blue-500" />
              {t("overview.pluTitle")}
            </h2>
            <p className="text-slate-600 text-sm mb-4">
              {t("overview.pluInfo")}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/projects/${project.id}/description`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-100 text-blue-700 text-sm font-medium hover:bg-blue-200 transition-colors"
              >
                {t("overview.completeDesc")}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}

        {Array.isArray(project.protectedAreas) && project.protectedAreas.length > 0 && (
          <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200">
            <h3 className="text-sm font-semibold text-amber-700 mb-2">{t("overview.protectedArea")}</h3>
            <ul className="text-sm text-slate-600 space-y-1">
              {project.protectedAreas.filter((a) => a.type !== "INFO").map((a, i) => (
                <li key={i}>{a.name}</li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Documents / Sections to produce ── */}
        <h2 className="text-lg font-semibold text-slate-900 mb-2">{t("overview.docsToProduceFr")}</h2>
        <p className="text-slate-500 text-sm mb-6">
          {isEn
            ? "Each section can be edited individually. The intelligent editor and 3D view are available from the main section."
            : "Chaque section est modifiable individuellement. L'éditeur intelligent et la vue 3D sont accessibles depuis la section principale."}
        </p>

        <ul className="space-y-3">
          {DOCUMENT_TYPES.map(({ type, label, labelFr, icon: Icon, href, isMain }) => {
            const doc = docsByType[type];
            const status = getDocStatus(doc);
            const cfg = statusConfig[status];

            if (isMain) {
              return (
                <li
                  key={type}
                  className="p-5 rounded-2xl bg-gradient-to-br from-blue-50 via-purple-50/50 to-white border border-blue-200 shadow-sm"
                >
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                      <Icon className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-900 text-lg">{isEn ? label : labelFr}</p>
                        <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", cfg.badge)}>
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {isEn
                          ? "Central section with intelligent editor and 3D terrain view."
                          : "Section centrale avec éditeur intelligent et vue 3D du terrain."}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/editor?project=${project.id}`}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
                    >
                      <PenTool className="w-4 h-4" />
                      {isEn ? "Intelligent Editor" : "Éditeur intelligent"}
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                    <Link
                      href={`/terrain?project=${project.id}`}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm"
                    >
                      <Box className="w-4 h-4" />
                      {isEn ? "3D Terrain View" : "Vue 3D du terrain"}
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                    <Link
                      href={href(project.id)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 border border-slate-200 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                      {t("overview.edit")}
                    </Link>
                    {status === "completed" && (
                      <Link
                        href={`/export?project=${project.id}&doc=${type}`}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100 border border-emerald-200 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        Export PDF
                      </Link>
                    )}
                  </div>
                </li>
              );
            }

            return (
              <li
                key={type}
                className="flex flex-wrap items-center gap-4 p-4 rounded-xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900">{isEn ? label : labelFr}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                    {cfg.icon}
                    {cfg.label}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Link
                    href={href(project.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 border border-slate-200 transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                    {t("overview.edit")}
                  </Link>
                  {status === "completed" && (
                    <Link
                      href={`/export?project=${project.id}&doc=${type}`}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 border border-blue-200 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Export PDF
                    </Link>
                  )}
                  {status === "not_started" && (
                    <Link
                      href={href(project.id)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                      {t("overview.start")}
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {/* ── Plan de Situation A3 ── */}
        <div className="mt-6 p-5 rounded-2xl bg-purple-50 border border-purple-200 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-2 flex items-center gap-2">
            <Map className="w-5 h-5 text-purple-600" />
            {t("overview.planDeSituation")}
          </h2>
          <p className="text-slate-600 text-sm mb-4">
            {t("overview.planDeSituationInfo")}
          </p>
          <Link
            href={`/site-plan-document?project=${project.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm"
          >
            {t("overview.openPlanDeSituation")}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* ── Next step / Export bar ── */}
        <div className="mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-2xl bg-slate-50 border border-slate-200 shadow-sm">
          <div>
            <h3 className="font-medium text-slate-900 mb-2">{t("overview.nextStep")}</h3>
            <p className="text-slate-500 text-sm">
              {getNextStep(`/projects/${project.id}`, project.id)
                ? t("overview.continueNext")
                : t("overview.exportWhenDone")}
            </p>
          </div>
          <div className="shrink-0">
            {getNextStep(`/projects/${project.id}`, project.id) ? (
              <NextStepButton
                canProceed={true}
                nextHref={getNextStep(`/projects/${project.id}`, project.id)!.href}
                nextLabel={`${t("overview.nextStep")}: ${getNextStep(`/projects/${project.id}`, project.id)!.label}`}
              />
            ) : (
              <Link
                href={`/export?project=${project.id}`}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors shadow-sm"
              >
                <Download className="w-4 h-4" />
                {t("overview.goToExport")}
              </Link>
            )}
          </div>
        </div>
      </div>
    </Navigation>
  );
}
