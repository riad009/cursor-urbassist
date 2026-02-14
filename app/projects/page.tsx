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
    if (!confirm("Delete this project?")) return;
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
        <h1 className="text-2xl font-bold text-white">Sign in to view projects</h1>
        <Link
          href="/login"
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <FolderKanban className="w-8 h-8 text-blue-400" />
              Projects
            </h1>
            <p className="text-slate-400 mt-1">
              Manage your construction projects • {user.credits} credits
            </p>
          </div>
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:shadow-lg hover:shadow-purple-500/25"
          >
            <Plus className="w-5 h-5" />
            New Project
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16 rounded-2xl bg-slate-800/30 border border-white/10">
            <FolderKanban className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">No projects yet</h2>
            <p className="text-slate-400 mb-6">Create your first project to get started</p>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold"
            >
              <Plus className="w-5 h-5" />
              Create Project
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                className="group rounded-xl bg-slate-800/50 border border-white/10 p-5 hover:border-white/20 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                    <MapPin className="w-6 h-6 text-blue-400" />
                  </div>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${project.status === "COMPLETED"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-blue-500/20 text-blue-400"
                      }`}
                  >
                    {project.status}
                  </span>
                </div>
                <h3 className="font-semibold text-white mb-1">{project.name}</h3>
                {project.address && (
                  <p className="text-sm text-slate-500 mb-3 truncate">{project.address}</p>
                )}
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-4">
                  {project.regulatoryAnalysis && (
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      PLU analyzed
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
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-500/20 text-blue-400 font-medium hover:bg-blue-500/30"
                    >
                      Dashboard <ArrowRight className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => deleteProject(project.id)}
                      className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <Link
                    href={`/editor?project=${project.id}`}
                    className="text-center text-sm text-slate-500 hover:text-slate-300 py-1"
                  >
                    Open site plan →
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
