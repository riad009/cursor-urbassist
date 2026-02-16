"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Navigation from "@/components/layout/Navigation";
import {
  FileCheck,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Download,
  ArrowRight,
  ExternalLink,
  FolderKanban,
  MapPin,
  Info,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getNextStep, getPrevStep } from "@/lib/step-flow";
import { NextStepButton } from "@/components/NextStepButton";
import { jsPDF } from "jspdf";

type RegulatoryAnalysis = {
  zoneType?: string | null;
  aiAnalysis?: Record<string, unknown> | null;
  pdfUrl?: string | null;
};

type SitePlanData = {
  footprintExisting?: number | null;
  footprintProjected?: number | null;
  footprintMax?: number | null;
  complianceResults?: Array<{ rule: string; status: string; message: string; details?: string; suggestion?: string }> | null;
};

type Project = {
  id: string;
  name: string;
  address?: string | null;
  parcelArea?: number | null;
  coordinates?: string | null;
  regulatoryAnalysis?: RegulatoryAnalysis | null;
  sitePlanData?: SitePlanData | null;
};

function PluAnalysisPageContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const projectId = searchParams.get("project");

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningDetection, setRunningDetection] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [showLaunchConfirm, setShowLaunchConfirm] = useState(false);
  const [pluCreditsCost, setPluCreditsCost] = useState(3);
  const [pluFootprintDifferent, setPluFootprintDifferent] = useState(false);
  const [savingFootprintPref, setSavingFootprintPref] = useState(false);
  const [complianceSummary, setComplianceSummary] = useState<{
    checks?: Array<{ rule: string; status: string; message: string; details?: string; suggestion?: string }>;
    summary?: { violations: number; warnings: number; compliant: number; isCompliant: boolean };
  } | null>(null);

  const loadProject = useCallback(() => {
    if (!projectId || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/projects/${projectId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.project) setProject(data.project);
      })
      .catch(() => setProject(null))
      .finally(() => setLoading(false));
  }, [projectId, user]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setPluCreditsCost(d.pluAnalysisCredits ?? 3))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!project?.regulatoryAnalysis?.aiAnalysis) return;
    const ai = project.regulatoryAnalysis.aiAnalysis as Record<string, unknown>;
    setPluFootprintDifferent(ai.includeOverhangInFootprint === true);
  }, [project?.regulatoryAnalysis?.aiAnalysis]);

  useEffect(() => {
    if (!project?.sitePlanData?.complianceResults) {
      setComplianceSummary(null);
      return;
    }
    const results = project.sitePlanData.complianceResults as Array<{
      rule: string;
      status: string;
      message: string;
      details?: string;
      suggestion?: string;
    }>;
    const violations = results.filter((c) => c.status === "violation").length;
    const warnings = results.filter((c) => c.status === "warning").length;
    const compliant = results.filter((c) => c.status === "compliant").length;
    setComplianceSummary({
      checks: results,
      summary: { violations, warnings, compliant, isCompliant: violations === 0 },
    });
  }, [project?.sitePlanData?.complianceResults]);

  const runPluDetection = async () => {
    if (!projectId) return;
    setShowLaunchConfirm(false);
    setRunningDetection(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/regulatory/auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "include",
      });
      if (res.ok) loadProject();
      else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "PLU detection failed.");
      }
    } finally {
      setRunningDetection(false);
    }
  };

  const exportPluPdf = useCallback(async () => {
    if (!project) return;
    setExportingPdf(true);
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const reg = project.regulatoryAnalysis?.aiAnalysis as Record<string, unknown> | undefined;
      const zone = (project.regulatoryAnalysis?.zoneType as string) || (reg?.zoneClassification as string) || "—";
      const setbacks = (reg?.setbacks as { front?: number; side?: number; rear?: number }) || {};
      const recommendations = (reg?.recommendations as string[]) || (reg?.architecturalConstraints as string[]) || [];

      let y = 20;
      doc.setFontSize(18);
      doc.text("PLU Analysis Summary", 20, y);
      y += 12;
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Project: ${project.name}`, 20, y);
      y += 6;
      if (project.address) {
        doc.text(`Address: ${project.address}`, 20, y);
        y += 6;
      }
      doc.text(`Zone: ${zone}`, 20, y);
      y += 10;
      doc.setTextColor(0, 0, 0);

      doc.setFontSize(12);
      doc.text("Regulatory constraints", 20, y);
      y += 8;
      doc.setFontSize(10);
      doc.text(`Max height: ${(reg?.maxHeight as number) ?? "—"} m`, 20, y);
      y += 6;
      doc.text(`Max coverage ratio (CES): ${((reg?.maxCoverageRatio as number) ?? 0) * 100}%`, 20, y);
      y += 6;
      doc.text(`Setbacks: front ${setbacks.front ?? "—"} m, side ${setbacks.side ?? "—"} m, rear ${setbacks.rear ?? "—"} m`, 20, y);
      y += 6;
      doc.text(`Green space: ${(reg?.greenSpaceRequirements as string) || "—"}`, 20, y);
      y += 6;
      doc.text(`Parking: ${(reg?.parkingRequirements as string) || "—"}`, 20, y);
      y += 10;

      if (Array.isArray(recommendations) && recommendations.length > 0) {
        doc.setFontSize(12);
        doc.text("Recommendations", 20, y);
        y += 8;
        doc.setFontSize(10);
        for (const rec of recommendations.slice(0, 10)) {
          if (y > 270) { doc.addPage(); y = 20; }
          doc.text(`• ${String(rec)}`, 22, y);
          y += 6;
        }
        y += 6;
      }

      if (project.regulatoryAnalysis?.pdfUrl) {
        if (y > 260) { doc.addPage(); y = 20; }
        doc.setFontSize(10);
        doc.setTextColor(0, 100, 200);
        doc.text("Official PLU document: see project PLU Analysis page for link.", 20, y);
      }

      doc.save(`PLU_Summary_${project.name.replace(/\s+/g, "_")}.pdf`);
    } finally {
      setExportingPdf(false);
    }
  }, [project]);

  if (!user) {
    return (
      <Navigation>
        <div className="p-6 max-w-2xl mx-auto">
          <p className="text-slate-400">Please sign in to view PLU Analysis.</p>
          <Link href="/login" className="text-blue-600 hover:underline mt-2 inline-block">Sign in</Link>
        </div>
      </Navigation>
    );
  }

  if (!projectId) {
    return (
      <Navigation>
        <div className="p-6 max-w-2xl mx-auto">
          <p className="text-slate-400">Select a project to view PLU Analysis.</p>
          <Link href="/projects" className="text-blue-600 hover:underline mt-2 inline-block flex items-center gap-2">
            <FolderKanban className="w-4 h-4" /> Projects
          </Link>
        </div>
      </Navigation>
    );
  }

  if (loading) {
    return (
      <Navigation>
        <div className="p-6 flex justify-center min-h-[40vh]">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      </Navigation>
    );
  }

  if (!project) {
    return (
      <Navigation>
        <div className="p-6 max-w-2xl mx-auto">
          <p className="text-slate-400">Project not found.</p>
          <Link href="/projects" className="text-blue-600 hover:underline mt-2 inline-block">← Back to projects</Link>
        </div>
      </Navigation>
    );
  }

  const reg = project.regulatoryAnalysis?.aiAnalysis as Record<string, unknown> | undefined;
  const zoneLabel = (project.regulatoryAnalysis?.zoneType as string) || (reg?.zoneClassification as string) || null;
  const parcelArea = project.parcelArea ?? 0;
  const maxCoverageRatio = (reg?.maxCoverageRatio as number) ?? 0.4;
  const maxFootprintM2 = parcelArea > 0 ? parcelArea * maxCoverageRatio : 0;
  const footprintProjected = project.sitePlanData?.footprintProjected ?? 0;
  const footprintOk = maxFootprintM2 <= 0 || footprintProjected <= maxFootprintM2;
  const nextStep = getNextStep("/plu-analysis", project.id);
  const prevStep = getPrevStep("/plu-analysis", project.id);

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="mb-8">
          <Link
            href={projectId ? `/projects/${projectId}` : "/projects"}
            className="text-sm text-slate-400 hover:text-slate-900 transition-colors inline-flex items-center gap-1"
          >
            ← {projectId ? "Back to project" : "Projects"}
          </Link>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 mt-2 flex items-center gap-3">
            <FileCheck className="w-8 h-8 text-sky-400" />
            PLU Analysis
          </h1>
          {project.address && (
            <p className="text-slate-400 mt-1 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              {project.address}
            </p>
          )}
        </div>

        {!project.regulatoryAnalysis && (
          <>
            <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-slate-900">PLU not yet analyzed</p>
                  <p className="text-sm text-slate-400 mt-1">
                    Launch the PLU analysis to load the building footprint rules, regulatory constraints, and compliance basis for this address.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowLaunchConfirm(true)}
                disabled={runningDetection || !project.coordinates}
                className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-100 text-amber-700 font-medium hover:bg-amber-200 disabled:opacity-50"
              >
                {runningDetection ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
                {runningDetection ? "Running…" : "Launch PLU analysis"}
              </button>
            </div>
            {showLaunchConfirm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowLaunchConfirm(false)}>
                <div
                  className="rounded-2xl bg-slate-100 border border-slate-200 p-6 max-w-md w-full mx-4 shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Launch PLU analysis?</h3>
                  <p className="text-sm text-slate-400 mb-6">
                    Are you sure you want to launch the PLU analysis? Once validated, any additional analysis will be charged {pluCreditsCost} credits.
                  </p>
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setShowLaunchConfirm(false)}
                      className="px-4 py-2 rounded-xl bg-slate-100 text-slate-900 hover:bg-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={runPluDetection}
                      disabled={runningDetection}
                      className="px-4 py-2 rounded-xl bg-amber-500/80 text-slate-900 font-medium hover:bg-amber-500 disabled:opacity-50 inline-flex items-center gap-2"
                    >
                      {runningDetection ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Launch
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {project.regulatoryAnalysis && (
          <>
            {/* Building footprint */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Building footprint</h2>
              <div className="rounded-xl bg-white border border-slate-200 p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider">Projected footprint</p>
                    <p className="text-xl font-semibold text-slate-900">
                      {footprintProjected > 0 ? `${footprintProjected.toFixed(1)} m²` : "—"}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">From site plan (or enter on Site Plan step)</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider">Max allowed (PLU CES)</p>
                    <p className="text-xl font-semibold text-slate-900">
                      {maxFootprintM2 > 0 ? `${maxFootprintM2.toFixed(0)} m²` : "—"}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {parcelArea > 0 ? `Parcel ${parcelArea}m² × ${(maxCoverageRatio * 100).toFixed(0)}%` : "Set parcel area for project"}
                    </p>
                  </div>
                </div>
                {maxFootprintM2 > 0 && footprintProjected > 0 && (
                  <div className="mt-4 flex items-center gap-2">
                    {footprintOk ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600 shrink-0" />
                    )}
                    <span className={footprintOk ? "text-emerald-700" : "text-red-600"}>
                      {footprintOk
                        ? "Footprint within PLU limit."
                        : `Footprint exceeds limit by ${(footprintProjected - maxFootprintM2).toFixed(1)} m². Reduce on Site Plan or verify PLU rules.`}
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* Special case: PLU defines footprint differently */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Footprint definition (PLU)</h2>
              <div className="rounded-xl bg-white border border-slate-200 p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pluFootprintDifferent}
                    disabled={savingFootprintPref}
                    onChange={async (e) => {
                      const checked = e.target.checked;
                      setPluFootprintDifferent(checked);
                      setSavingFootprintPref(true);
                      try {
                        await fetch(`/api/projects/${project.id}/regulatory`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ includeOverhangInFootprint: checked }),
                          credentials: "include",
                        });
                      } finally {
                        setSavingFootprintPref(false);
                      }
                    }}
                    className="mt-1 rounded border-slate-300 bg-slate-100 text-sky-500 focus:ring-sky-500"
                  />
                  <span className="text-slate-600">
                    My PLU defines the building footprint differently from the standard (e.g. roof overhangs or other elements are included in the footprint).
                  </span>
                </label>
                {pluFootprintDifferent && (
                  <div className="mt-4 p-4 rounded-lg bg-sky-500/10 border border-sky-500/30 flex flex-col sm:flex-row sm:items-center gap-3">
                    <Info className="w-5 h-5 text-sky-400 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-sky-200">
                        Please provide these elements on the Site Plan so the compliance table updates and indicates compliance correctly.
                      </p>
                      <Link
                        href={`/site-plan?project=${project.id}`}
                        className="inline-flex items-center gap-1 mt-2 text-sky-300 hover:text-sky-200 text-sm"
                      >
                        Open Site Plan <ExternalLink className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Regulatory constraints */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Regulatory constraints</h2>
              <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-left">
                      <th className="px-4 py-3 text-slate-600 font-medium">Constraint</th>
                      <th className="px-4 py-3 text-slate-600 font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-600">
                    <tr className="border-t border-slate-100">
                      <td className="px-4 py-2">Zone</td>
                      <td className="px-4 py-2 font-medium text-slate-900">{zoneLabel ?? "—"}</td>
                    </tr>
                    <tr className="border-t border-slate-100">
                      <td className="px-4 py-2">Max height</td>
                      <td className="px-4 py-2">{(reg?.maxHeight as number) ?? "—"} m</td>
                    </tr>
                    <tr className="border-t border-slate-100">
                      <td className="px-4 py-2">Max coverage (CES)</td>
                      <td className="px-4 py-2">{((reg?.maxCoverageRatio as number) ?? 0) * 100}%</td>
                    </tr>
                    <tr className="border-t border-slate-100">
                      <td className="px-4 py-2">Setbacks (front / side / rear)</td>
                      <td className="px-4 py-2">
                        {reg?.setbacks && typeof reg.setbacks === "object"
                          ? `${(reg.setbacks as { front?: number }).front ?? "—"} m / ${(reg.setbacks as { side?: number }).side ?? "—"} m / ${(reg.setbacks as { rear?: number }).rear ?? "—"} m`
                          : "—"}
                      </td>
                    </tr>
                    <tr className="border-t border-slate-100">
                      <td className="px-4 py-2">Green space</td>
                      <td className="px-4 py-2">{(reg?.greenSpaceRequirements as string) || "—"}</td>
                    </tr>
                    <tr className="border-t border-slate-100">
                      <td className="px-4 py-2">Parking</td>
                      <td className="px-4 py-2">{(reg?.parkingRequirements as string) || "—"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Compliance summary (from site plan) */}
            {complianceSummary && (
              <section className="mb-8">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Compliance with PLU</h2>
                <p className="text-slate-400 text-sm mb-3">
                  Based on the current Site Plan. Update the site plan to refresh these results.
                </p>
                <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
                  {complianceSummary.summary && (
                    <div className="px-4 py-3 bg-slate-100 flex flex-wrap gap-4 text-sm">
                      <span className="text-emerald-600">{complianceSummary.summary.compliant} compliant</span>
                      <span className="text-amber-600">{complianceSummary.summary.warnings} warning(s)</span>
                      <span className="text-red-600">{complianceSummary.summary.violations} violation(s)</span>
                      {complianceSummary.summary.isCompliant ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                      )}
                    </div>
                  )}
                  <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                    {complianceSummary.checks?.map((c, i) => (
                      <li key={i} className="px-4 py-2 flex items-start gap-2">
                        {c.status === "compliant" && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
                        {c.status === "warning" && <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
                        {c.status === "violation" && <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />}
                        <div>
                          <p className="text-slate-700 font-medium">{c.rule}</p>
                          <p className="text-slate-400 text-xs">{c.message}</p>
                          {c.suggestion && <p className="text-sky-300 text-xs mt-1">{c.suggestion}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                <Link
                  href={`/editor?project=${project.id}`}
                  className="inline-flex items-center gap-2 mt-3 text-sm text-sky-400 hover:text-sky-300"
                >
                  Edit Site Plan to update compliance <ArrowRight className="w-4 h-4" />
                </Link>
              </section>
            )}

            {project.regulatoryAnalysis?.pdfUrl && (
              <section className="mb-8">
                <h2 className="text-lg font-semibold text-slate-900 mb-2">Official PLU document</h2>
                <a
                  href={project.regulatoryAnalysis.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sky-400 hover:text-sky-300 text-sm"
                >
                  Open PLU document <ExternalLink className="w-4 h-4" />
                </a>
              </section>
            )}

            {/* PDF Export */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Export</h2>
              <p className="text-slate-400 text-sm mb-3">
                Download a summary of the PLU constraints and recommendations for this project.
              </p>
              <button
                onClick={exportPluPdf}
                disabled={exportingPdf}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500/20 text-sky-200 font-medium hover:bg-sky-500/30 disabled:opacity-50"
              >
                {exportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {exportingPdf ? "Generating…" : "Export PLU summary (PDF)"}
              </button>
            </section>
          </>
        )}

        {/* Step navigation */}
        <div className="mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-2xl bg-white border border-slate-200">
          <div>
            {prevStep && (
              <Link
                href={prevStep.href}
                className="text-sm text-slate-400 hover:text-slate-900 inline-flex items-center gap-1"
              >
                ← {prevStep.label}
              </Link>
            )}
          </div>
          <div className="shrink-0">
            {nextStep ? (
              <NextStepButton
                canProceed={true}
                nextHref={nextStep.href}
                nextLabel={`Next: ${nextStep.label}`}
              />
            ) : (
              <Link
                href={`/export?project=${project.id}`}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-100 text-emerald-700 font-medium hover:bg-emerald-200"
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

export default function PluAnalysisPage() {
  return (
    <React.Suspense fallback={
      <Navigation>
        <div className="p-6 flex justify-center min-h-[40vh]">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      </Navigation>
    }>
      <PluAnalysisPageContent />
    </React.Suspense>
  );
}
