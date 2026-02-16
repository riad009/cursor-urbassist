"use client";

import React from "react";
import Link from "next/link";
import Navigation from "@/components/layout/Navigation";
import { useLanguage } from "@/lib/language-context";
import {
  Building2,
  FolderKanban,
  PenTool,
  FileText,
  FileCheck,
  Calculator,
  Download,
  ArrowUpRight,
  TrendingUp,
  Clock,
  CheckCircle2,
  Sparkles,
  Zap,
  Target,
  Layers,
  Plus,
  Play,
  ArrowRight,
} from "lucide-react";

export default function Dashboard() {
  const { t } = useLanguage();

  const stats = [
    {
      labelKey: "dash.totalProjects",
      value: "12",
      changeKey: "dash.thisMonth",
      trend: "up",
      icon: FolderKanban,
      gradient: "from-blue-500 to-cyan-500",
      bgGradient: "from-blue-50 to-cyan-50",
    },
    {
      labelKey: "dash.activeDesigns",
      value: "5",
      changeKey: "dash.pendingReview",
      trend: "neutral",
      icon: Layers,
      gradient: "from-violet-500 to-purple-500",
      bgGradient: "from-violet-50 to-purple-50",
    },
    {
      labelKey: "dash.completed",
      value: "7",
      changeKey: "dash.onTime",
      trend: "up",
      icon: CheckCircle2,
      gradient: "from-emerald-500 to-teal-500",
      bgGradient: "from-emerald-50 to-teal-50",
    },
    {
      labelKey: "dash.timeSaved",
      value: "48h",
      changeKey: "dash.aiAssist",
      trend: "up",
      icon: Clock,
      gradient: "from-amber-500 to-orange-500",
      bgGradient: "from-amber-50 to-orange-50",
    },
  ];

  const quickActions = [
    {
      titleKey: "qa.newProject",
      descKey: "qa.newProjectDesc",
      icon: Plus,
      href: "/projects/new",
      gradient: "from-blue-600 to-blue-400",
      featured: true,
    },
    {
      titleKey: "qa.designStudio",
      descKey: "qa.designStudioDesc",
      icon: PenTool,
      href: "/editor",
      gradient: "from-pink-600 to-pink-400",
    },
    {
      titleKey: "qa.aiAnalysis",
      descKey: "qa.aiAnalysisDesc",
      icon: Sparkles,
      href: "/regulations",
      gradient: "from-violet-600 to-violet-400",
    },
    {
      titleKey: "qa.feasibility",
      descKey: "qa.feasibilityDesc",
      icon: FileCheck,
      href: "/feasibility",
      gradient: "from-amber-600 to-amber-400",
    },
    {
      titleKey: "qa.developer",
      descKey: "qa.developerDesc",
      icon: Zap,
      href: "/developer",
      gradient: "from-purple-600 to-purple-400",
    },
    {
      titleKey: "qa.exportPlans",
      descKey: "qa.exportPlansDesc",
      icon: Download,
      href: "/export",
      gradient: "from-emerald-600 to-emerald-400",
    },
  ];

  const recentProjects = [
    {
      id: 1,
      name: "Villa Méditerranée",
      statusKey: "proj.inProgress",
      progress: 75,
      lastUpdatedKey: "proj.hoursAgo",
      typeKey: "proj.residential",
      thumbnail: "🏠",
    },
    {
      id: 2,
      name: "Commercial Center",
      statusKey: "proj.review",
      progress: 90,
      lastUpdatedKey: "proj.yesterday",
      typeKey: "proj.commercial",
      thumbnail: "🏢",
    },
    {
      id: 3,
      name: "Garden Extension",
      statusKey: "proj.completed",
      progress: 100,
      lastUpdatedKey: "proj.threeDaysAgo",
      typeKey: "proj.extension",
      thumbnail: "🌳",
    },
  ];

  const features = [
    {
      titleKey: "feat.smartDrawing",
      descKey: "feat.smartDrawingDesc",
      icon: Target,
    },
    {
      titleKey: "feat.realTimeCalc",
      descKey: "feat.realTimeCalcDesc",
      icon: Calculator,
    },
    {
      titleKey: "feat.regulatory",
      descKey: "feat.regulatoryDesc",
      icon: FileText,
    },
    {
      titleKey: "feat.quickExport",
      descKey: "feat.quickExportDesc",
      icon: Zap,
    },
  ];

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-50 to-blue-50 border border-slate-200 p-8 lg:p-12 shadow-sm">
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-100/40 to-purple-100/40 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-pink-100/30 to-orange-100/30 blur-3xl rounded-full translate-y-1/2 -translate-x-1/2" />

          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-600 text-xs font-medium border border-blue-200">
                {t("dash.demoProject")}
              </span>
              <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-600 text-xs font-medium border border-purple-200">
                roms09
              </span>
            </div>
            <h1 className="text-3xl lg:text-4xl font-bold mb-3 text-slate-900">
              {t("dash.welcome")} <span className="gradient-text-color">UrbAssist</span>
            </h1>
            <p className="text-slate-500 text-lg max-w-xl mb-6">
              {t("dash.subtitle")}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/projects/new"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:shadow-lg hover:shadow-purple-500/25 transition-all group"
              >
                <Play className="w-4 h-4" />
                {t("dash.startApp")}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <p className="w-full text-xs text-slate-400 mt-1">
                {t("dash.startSub")}
              </p>
              <Link
                href="/projects"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition-all shadow-sm"
              >
                <FolderKanban className="w-4 h-4" />
                {t("dash.viewProjects")}
              </Link>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, index) => (
            <div
              key={stat.labelKey}
              className="group relative overflow-hidden rounded-2xl bg-white border border-slate-200 p-5 hover:border-slate-300 transition-all hover:-translate-y-1 shadow-sm hover:shadow-md"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.bgGradient} opacity-0 group-hover:opacity-100 transition-opacity`} />
              <div className="relative z-10">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center mb-3 shadow-lg`}>
                  <stat.icon className="w-5 h-5 text-white" />
                </div>
                <p className="text-2xl font-bold text-slate-900 mb-1">{stat.value}</p>
                <p className="text-sm text-slate-500">{t(stat.labelKey)}</p>
                <div className="flex items-center gap-1 mt-2">
                  {stat.trend === "up" && <TrendingUp className="w-3 h-3 text-emerald-500" />}
                  <span className="text-xs text-slate-400">{t(stat.changeKey)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Actions & Recent Projects */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Quick Actions */}
          <div className="lg:col-span-1 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              {t("dash.quickActions")}
            </h2>
            <div className="space-y-3">
              {quickActions.map((action) => (
                <Link
                  key={action.titleKey}
                  href={action.href}
                  className={`group flex items-center gap-4 p-4 rounded-xl border transition-all hover:-translate-y-0.5 shadow-sm hover:shadow-md ${action.featured
                    ? "bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200 hover:border-blue-300"
                    : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                    <action.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900">{t(action.titleKey)}</p>
                    <p className="text-sm text-slate-500 truncate">{t(action.descKey)}</p>
                  </div>
                  <ArrowUpRight className="w-5 h-5 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-1 group-hover:-translate-y-1 transition-all" />
                </Link>
              ))}
            </div>
          </div>

          {/* Recent Projects */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-500" />
                {t("dash.recentProjects")}
              </h2>
              <Link href="/projects" className="text-sm text-blue-500 hover:text-blue-600 flex items-center gap-1">
                {t("dash.viewAll")} <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/editor?project=${project.id}`}
                  className="group relative overflow-hidden rounded-xl bg-white border border-slate-200 p-4 hover:border-slate-300 transition-all hover:-translate-y-1 shadow-sm hover:shadow-md"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-2xl">
                      {project.thumbnail}
                    </div>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${project.statusKey === "proj.completed"
                        ? "bg-emerald-100 text-emerald-600"
                        : project.statusKey === "proj.review"
                          ? "bg-amber-100 text-amber-600"
                          : "bg-blue-100 text-blue-600"
                        }`}
                    >
                      {t(project.statusKey)}
                    </span>
                  </div>
                  <h3 className="font-semibold text-slate-900 mb-1 group-hover:text-blue-600 transition-colors">
                    {project.name}
                  </h3>
                  <p className="text-xs text-slate-400 mb-3">{t(project.typeKey)} • {t(project.lastUpdatedKey)}</p>
                  <div className="relative h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full ${project.progress === 100
                        ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                        : "bg-gradient-to-r from-blue-500 to-purple-500"
                        }`}
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            {t("dash.platformFeatures")}
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((feature) => (
              <div
                key={feature.titleKey}
                className="group p-5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all shadow-sm"
              >
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center mb-3 group-hover:bg-gradient-to-br group-hover:from-blue-50 group-hover:to-purple-50 transition-colors">
                  <feature.icon className="w-5 h-5 text-slate-500 group-hover:text-blue-600 transition-colors" />
                </div>
                <h3 className="font-medium text-slate-900 mb-1">{t(feature.titleKey)}</h3>
                <p className="text-sm text-slate-500">{t(feature.descKey)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="pt-8 border-t border-slate-200">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-400">
            <p>{t("dash.footer")}</p>
            <div className="flex items-center gap-4">
              <a href="#" className="hover:text-slate-700 transition-colors">{t("dash.documentation")}</a>
              <a href="#" className="hover:text-slate-700 transition-colors">{t("dash.support")}</a>
              <a href="#" className="hover:text-slate-700 transition-colors">{t("dash.privacy")}</a>
            </div>
          </div>
        </footer>
      </div>
    </Navigation>
  );
}
