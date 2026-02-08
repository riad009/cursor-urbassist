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
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getNextStep } from "@/lib/step-flow";
import { NextStepButton } from "@/components/NextStepButton";

type DocStatus = "To do" | "In progress" | "Done" | "Downloadable";

/** Done = document record exists (content complete); Downloadable = file ready */

const DOCUMENT_TYPES: { type: string; label: string; icon: React.ElementType; href: (id: string) => string }[] = [
  { type: "LOCATION_PLAN", label: "Location plan", icon: Map, href: (id) => `/location-plan?project=${id}` },
  { type: "SITE_PLAN", label: "Site plan", icon: Layers, href: (id) => `/editor?project=${id}` },
  { type: "SECTION", label: "Section", icon: Scissors, href: (id) => `/terrain?project=${id}` },
  { type: "ELEVATION", label: "Elevations", icon: Building2, href: (id) => `/terrain?project=${id}` },
  { type: "LANDSCAPE_INSERTION", label: "Landscape insertion", icon: Image, href: (id) => `/landscape?project=${id}` },
  { type: "DESCRIPTIVE_STATEMENT", label: "Descriptive notice", icon: FileText, href: (id) => `/statement?project=${id}` },
];

function getDocStatus(doc: { fileUrl?: string | null; fileData?: string | null }): DocStatus {
  if (doc.fileUrl || doc.fileData) return "Downloadable";
  return "Done"; // document exists, content complete, file not yet exported
}

export default function ProjectDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const [project, setProject] = useState<{
    id: string;
    name: string;
    address: string | null;
    documents?: { id: string; type: string; name: string; fileUrl: string | null; fileData: string | null }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!projectId || !user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/projects/${projectId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.project) setProject(data.project);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, user]);

  if (loading) {
    return (
      <Navigation>
        <div className="p-6 flex justify-center min-h-[40vh]">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        </div>
      </Navigation>
    );
  }

  if (!project) {
    return (
      <Navigation>
        <div className="p-6 max-w-2xl mx-auto">
          <p className="text-slate-400">Project not found.</p>
          <Link href="/projects" className="text-blue-400 hover:underline mt-2 inline-block">
            ← Back to projects
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

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="mb-8">
          <Link
            href="/projects"
            className="text-sm text-slate-400 hover:text-white transition-colors inline-flex items-center gap-1"
          >
            <FolderKanban className="w-4 h-4" />
            Projects
          </Link>
          <h1 className="text-2xl lg:text-3xl font-bold text-white mt-2">{project.name}</h1>
          {project.address && (
            <p className="text-slate-400 mt-1 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              {project.address}
            </p>
          )}
        </div>

        <h2 className="text-lg font-semibold text-white mb-4">Application progress</h2>
        <p className="text-slate-400 text-sm mb-6">
          Each document can be: To do → In progress → Done → Downloadable.
        </p>

        <ul className="space-y-3">
          {DOCUMENT_TYPES.map(({ type, label, icon: Icon, href }) => {
            const doc = docsByType[type];
            const status: DocStatus = doc ? getDocStatus(doc) : "To do";
            const statusIcon =
              status === "Downloadable" ? (
                <Download className="w-4 h-4 text-emerald-400" />
              ) : status === "Done" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <Circle className="w-4 h-4 text-slate-500" />
              );
            return (
              <li
                key={type}
                className="flex items-center gap-4 p-4 rounded-xl bg-slate-800/50 border border-white/10"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white">{label}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                    {statusIcon}
                    {status}
                  </p>
                </div>
                <Link
                  href={href(project.id)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/20 text-blue-300 text-sm font-medium hover:bg-blue-500/30 shrink-0"
                >
                  {status === "To do" ? "Start" : status === "Done" ? "Edit / Export" : "View / Download"}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-2xl bg-slate-800/50 border border-white/10">
          <div>
            <h3 className="font-medium text-white mb-2">Next step</h3>
            <p className="text-slate-400 text-sm">
              {getNextStep(`/projects/${project.id}`, project.id)
                ? "Continue to the next step in your planning application."
                : "Export your application when all documents are complete."}
            </p>
          </div>
          <div className="shrink-0">
            {getNextStep(`/projects/${project.id}`, project.id) ? (
              <NextStepButton
                canProceed={true}
                nextHref={getNextStep(`/projects/${project.id}`, project.id)!.href}
                nextLabel={`Next: ${getNextStep(`/projects/${project.id}`, project.id)!.label}`}
              />
            ) : (
              <Link
                href={`/export?project=${project.id}`}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/20 text-emerald-300 font-medium hover:bg-emerald-500/30"
              >
                <Download className="w-4 h-4" />
                Go to export
              </Link>
            )}
          </div>
        </div>
      </div>
    </Navigation>
  );
}
