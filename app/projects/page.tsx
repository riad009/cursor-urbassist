"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Navigation from "@/components/layout/Navigation";
import {
  FolderKanban,
  Plus,
  MapPin,
  FileText,
  Loader2,
  Trash2,
  ArrowRight,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  Filter,
  SortAsc,
  Building2,
  BarChart3,
  Eye,
  Target,
  Sparkles,
  Download,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  status: string;
  authorizationType?: string | null;
  projectType?: string | null;
  updatedAt: string;
  createdAt: string;
  regulatoryAnalysis?: { id: string; zoneType: string | null } | null;
  _count?: { documents: number };
}

type FilterOption = "all" | "in_progress" | "completed" | "dp" | "pc";
type SortOption = "updated" | "created" | "name";

export default function ProjectsPage() {
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const isEn = t("auth.next") === "Next";

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterOption>("all");
  const [sort, setSort] = useState<SortOption>("updated");

  useEffect(() => {
    if (authLoading) return; // Wait for auth to resolve
    if (!user) {
      setLoading(false);
      return;
    }
    fetch("/api/projects", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setProjects(data.projects || []))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [user, authLoading]);

  // Auto-redirect
  useEffect(() => {
    if (typeof window === "undefined" || !user) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("openNew") === "1") window.location.href = "/projects/new";
    if (params.get("from") === "dossier") window.location.href = "/projects/new?from=dossier";
  }, [user]);

  const deleteProject = async (id: string) => {
    if (!confirm(isEn ? "Delete this project?" : "Supprimer ce projet ?")) return;
    try {
      await fetch(`/api/projects/${id}`, { method: "DELETE" });
      setProjects((p) => p.filter((x) => x.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  // ── Filtering & Sorting ────────────────────────────────────────────────────
  const filteredProjects = useMemo(() => {
    let result = projects;

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.address || "").toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q)
      );
    }

    // Filter
    if (filter === "in_progress") result = result.filter((p) => p.status !== "COMPLETED");
    if (filter === "completed") result = result.filter((p) => p.status === "COMPLETED");
    if (filter === "dp") result = result.filter((p) => p.authorizationType === "DP");
    if (filter === "pc") result = result.filter((p) => p.authorizationType === "PC");

    // Sort
    if (sort === "updated") result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    if (sort === "created") result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (sort === "name") result.sort((a, b) => a.name.localeCompare(b.name));

    return result;
  }, [projects, searchQuery, filter, sort]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: projects.length,
    active: projects.filter((p) => p.status !== "COMPLETED").length,
    completed: projects.filter((p) => p.status === "COMPLETED").length,
    analyzed: projects.filter((p) => p.regulatoryAnalysis).length,
  }), [projects]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getStatusConfig = (status: string) => {
    const map: Record<string, { labelEn: string; labelFr: string; color: string; icon: React.ComponentType<{ className?: string }>; bgColor: string }> = {
      DRAFT: { labelEn: "Draft", labelFr: "Brouillon", color: "text-slate-600", icon: AlertCircle, bgColor: "bg-slate-100" },
      IN_PROGRESS: { labelEn: "In Progress", labelFr: "En cours", color: "text-blue-600", icon: Clock, bgColor: "bg-blue-100" },
      REVIEW: { labelEn: "Review", labelFr: "En revue", color: "text-amber-600", icon: Eye, bgColor: "bg-amber-100" },
      COMPLETED: { labelEn: "Completed", labelFr: "Terminé", color: "text-emerald-600", icon: CheckCircle2, bgColor: "bg-emerald-100" },
    };
    return map[status] || map.DRAFT;
  };

  const getProgressPercent = (project: Project): number => {
    let score = 0;
    if (project.address) score += 25;
    if (project.authorizationType) score += 25;
    if (project.regulatoryAnalysis) score += 25;
    if ((project._count?.documents || 0) > 0) score += 25;
    return score;
  };

  const timeAgo = (dateStr: string) => {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return isEn ? "Just now" : "À l'instant";
    if (diff < 3600) return isEn ? `${Math.floor(diff / 60)}min ago` : `il y a ${Math.floor(diff / 60)}min`;
    if (diff < 86400) return isEn ? `${Math.floor(diff / 3600)}h ago` : `il y a ${Math.floor(diff / 3600)}h`;
    const days = Math.floor(diff / 86400);
    if (days === 1) return isEn ? "Yesterday" : "Hier";
    return isEn ? `${days} days ago` : `il y a ${days} jours`;
  };

  // ── Auth guards ────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <h1 className="text-2xl font-bold text-slate-900">{t("newProj.signIn")}</h1>
        <Link
          href="/login"
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold"
        >
          {t("newProj.signInBtn")}
        </Link>
      </div>
    );
  }

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">

        {/* ═══ Header ═══ */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg">
                <FolderKanban className="w-5 h-5 text-white" />
              </div>
              {isEn ? "My Projects" : "Mes projets"}
            </h1>
            <p className="text-slate-500 mt-2">
              {isEn
                ? `Manage your construction projects • ${user.credits} credits available`
                : `Gérez vos projets de construction • ${user.credits} crédits disponibles`}
            </p>
          </div>
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:shadow-lg hover:shadow-purple-500/25 transition-all shrink-0"
          >
            <Plus className="w-5 h-5" />
            {t("newProj.title")}
          </Link>
        </div>

        {/* ═══ Mini Stats ═══ */}
        {stats.total > 0 && (
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: isEn ? "Total" : "Total", value: stats.total, icon: FolderKanban, color: "text-blue-600", bg: "bg-blue-50" },
              { label: isEn ? "Active" : "Actifs", value: stats.active, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
              { label: isEn ? "Completed" : "Terminés", value: stats.completed, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
              { label: isEn ? "Analyzed" : "Analysés", value: stats.analyzed, icon: Sparkles, color: "text-purple-600", bg: "bg-purple-50" },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm">
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", s.bg)}>
                  <s.icon className={cn("w-4 h-4", s.color)} />
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-900">{s.value}</p>
                  <p className="text-xs text-slate-400">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ Search & Filters ═══ */}
        {stats.total > 0 && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isEn ? "Search projects..." : "Rechercher des projets..."}
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-50 border border-transparent text-sm text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 px-1 py-1 rounded-lg bg-slate-50">
                {([
                  { key: "all", labelEn: "All", labelFr: "Tous" },
                  { key: "in_progress", labelEn: "Active", labelFr: "Actifs" },
                  { key: "completed", labelEn: "Done", labelFr: "Faits" },
                  { key: "dp", labelEn: "DP", labelFr: "DP" },
                  { key: "pc", labelEn: "PC", labelFr: "PC" },
                ] as { key: FilterOption; labelEn: string; labelFr: string }[]).map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                      filter === f.key
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    {isEn ? f.labelEn : f.labelFr}
                  </button>
                ))}
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="px-3 py-1.5 rounded-lg bg-slate-50 text-xs text-slate-600 border-0 cursor-pointer"
              >
                <option value="updated">{isEn ? "Last updated" : "Dernière mise à jour"}</option>
                <option value="created">{isEn ? "Created" : "Création"}</option>
                <option value="name">{isEn ? "Name" : "Nom"}</option>
              </select>
            </div>
          </div>
        )}

        {/* ═══ Projects Grid ═══ */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16 rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50 border-2 border-dashed border-slate-200">
            <FolderKanban className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-900 mb-2">
              {isEn ? "No projects yet" : "Aucun projet pour le moment"}
            </h2>
            <p className="text-slate-500 mb-6 max-w-md mx-auto">
              {isEn
                ? "Create your first project to start your building permit application"
                : "Créez votre premier projet pour commencer votre demande de permis de construire"}
            </p>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:shadow-lg hover:shadow-purple-500/25 transition-all"
            >
              <Plus className="w-5 h-5" />
              {t("newProj.createProject")}
            </Link>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-12 rounded-xl bg-slate-50 border border-slate-200">
            <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">{isEn ? "No matching projects found" : "Aucun projet correspondant"}</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((project) => {
              const statusConfig = getStatusConfig(project.status);
              const StatusIcon = statusConfig.icon;
              const progress = getProgressPercent(project);

              return (
                <div
                  key={project.id}
                  className="group relative overflow-hidden rounded-xl bg-white border border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-md transition-all"
                >
                  {/* Title area */}
                  <div className="p-5 pb-0">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center border border-slate-200">
                        <Building2 className="w-5 h-5 text-slate-500" />
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium", statusConfig.bgColor, statusConfig.color)}>
                          <StatusIcon className="w-3 h-3" />
                          {isEn ? statusConfig.labelEn : statusConfig.labelFr}
                        </span>
                        {project.authorizationType && (
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-bold border",
                            project.authorizationType === "PC"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                          )}>
                            {project.authorizationType}
                          </span>
                        )}
                      </div>
                    </div>
                    <h3 className="font-semibold text-slate-900 mb-1 group-hover:text-blue-600 transition-colors">
                      {project.name}
                    </h3>
                    {project.address && (
                      <p className="text-sm text-slate-500 mb-2 truncate flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 shrink-0 text-slate-400" />
                        {project.address}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-slate-400 mb-4">
                      {project.regulatoryAnalysis && (
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-purple-400" />
                          {isEn ? "PLU analyzed" : "PLU analysé"}
                        </span>
                      )}
                      {(project._count?.documents ?? 0) > 0 && (
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3 text-emerald-400" />
                          {project._count?.documents} docs
                        </span>
                      )}
                      <span className="ml-auto">{timeAgo(project.updatedAt)}</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="px-5">
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-700",
                          progress === 100
                            ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                            : "bg-gradient-to-r from-blue-500 to-purple-500"
                        )}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 text-right">{progress}%</p>
                  </div>

                  {/* Actions */}
                  <div className="p-4 pt-2 flex items-center gap-2">
                    <Link
                      href={`/projects/${project.id}/dashboard`}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 text-blue-600 font-medium text-sm hover:from-blue-100 hover:to-purple-100 transition-all border border-blue-100"
                    >
                      {isEn ? "Open Project" : "Ouvrir le projet"} <ArrowRight className="w-4 h-4" />
                    </Link>
                    <Link
                      href={`/site-plan?project=${project.id}`}
                      className="p-2.5 rounded-lg bg-slate-50 text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-all border border-slate-200"
                      title={isEn ? "Open Site Plan" : "Plan de masse"}
                    >
                      <Target className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => deleteProject(project.id)}
                      className="p-2.5 rounded-lg bg-slate-50 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all border border-slate-200"
                      title={isEn ? "Delete" : "Supprimer"}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Navigation>
  );
}
