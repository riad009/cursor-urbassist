"use client";

import React, { useEffect, useState } from "react";
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
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";

interface Project {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  status: string;
  updatedAt: string;
  regulatoryAnalysis?: { id: string; zoneType: string | null } | null;
  _count?: { documents: number };
}

export default function ProjectsPage() {
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetch("/api/projects", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setProjects(data.projects || []))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [user]);

  // Auto-redirect to /projects/new when ?openNew=1
  useEffect(() => {
    if (typeof window === "undefined" || !user) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("openNew") === "1") {
      window.location.href = "/projects/new";
    }
    if (params.get("from") === "dossier") {
      window.location.href = "/projects/new?from=dossier";
    }
  }, [user]);

  const deleteProject = async (id: string) => {
    if (!confirm(t("auth.next") === "Next" ? "Delete this project?" : "Supprimer ce projet ?")) return;
    try {
      await fetch(`/api/projects/${id}`, { method: "DELETE" });
      setProjects((p) => p.filter((x) => x.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <FolderKanban className="w-8 h-8 text-blue-500" />
              {t("nav.projects")}
            </h1>
            <p className="text-slate-500 mt-1">
              {t("auth.next") === "Next"
                ? `Manage your construction projects • ${user.credits} credits`
                : `Gérez vos projets de construction • ${user.credits} crédits`}
            </p>
          </div>
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:shadow-lg hover:shadow-purple-500/25"
          >
            <Plus className="w-5 h-5" />
            {t("newProj.title")}
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16 rounded-2xl bg-slate-50 border border-slate-200">
            <FolderKanban className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-900 mb-2">
              {t("auth.next") === "Next" ? "No projects yet" : "Aucun projet pour le moment"}
            </h2>
            <p className="text-slate-500 mb-6">
              {t("auth.next") === "Next" ? "Create your first project to get started" : "Créez votre premier projet pour commencer"}
            </p>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold"
            >
              <Plus className="w-5 h-5" />
              {t("newProj.createProject")}
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                className="group rounded-xl bg-white border border-slate-200 p-5 hover:border-slate-300 transition-all shadow-sm hover:shadow-md"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                    <MapPin className="w-6 h-6 text-blue-500" />
                  </div>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${project.status === "COMPLETED"
                      ? "bg-emerald-100 text-emerald-600"
                      : "bg-blue-100 text-blue-600"
                      }`}
                  >
                    {project.status}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-900 mb-1">{project.name}</h3>
                {project.address && (
                  <p className="text-sm text-slate-500 mb-3 truncate">{project.address}</p>
                )}
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-4">
                  {project.regulatoryAnalysis && (
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {t("auth.next") === "Next" ? "PLU analyzed" : "PLU analysé"}
                    </span>
                  )}
                  {project._count?.documents ? (
                    <span>{project._count.documents} documents</span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/projects/${project.id}`}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-50 text-blue-600 font-medium hover:bg-blue-100"
                    >
                      {t("nav.dashboard")} <ArrowRight className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => deleteProject(project.id)}
                      className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <Link
                    href={`/editor?project=${project.id}`}
                    className="text-center text-sm text-slate-400 hover:text-slate-600 py-1"
                  >
                    {t("auth.next") === "Next" ? "Open site plan →" : "Ouvrir le plan de masse →"}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Navigation>
  );
}
