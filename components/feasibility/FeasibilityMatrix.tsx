"use client";

import React from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MinusCircle,
  ClipboardCheck,
  FileWarning,
  Loader2,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  FeasibilityReport,
  FeasibilityCategory,
  ComplianceStatus,
} from "@/lib/feasibility-matrix";

// ─── Compliance badge config ─────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  ComplianceStatus,
  {
    label: string;
    bg: string;
    text: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  OUI: {
    label: "OUI",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    icon: CheckCircle2,
  },
  NON: {
    label: "NON",
    bg: "bg-red-50",
    text: "text-red-700",
    icon: XCircle,
  },
  "A VERIFIER": {
    label: "A VERIFIER",
    bg: "bg-amber-50",
    text: "text-amber-700",
    icon: AlertTriangle,
  },
  "NON CONCERNE": {
    label: "Non concerné",
    bg: "bg-slate-50",
    text: "text-slate-500",
    icon: MinusCircle,
  },
};

// ─── Section numbering — matches client PDF sections ─────────────────────────

const SECTION_NUMBERS: Record<string, number> = {
  "USAGE DES SOLS": 2,
  "CONDITIONS D'OCCUPATION": 3,
  "IMPLANTATION ET VOLUMETRIE": 4,
  "ASPECT EXTÉRIEUR": 5,
  STATIONNEMENT: 6,
  "ESPACES LIBRES": 7,
  "RESEAUX ET DESSERTE": 8,
};

function getSectionNumber(category: string): number {
  const key = Object.keys(SECTION_NUMBERS).find((k) =>
    category.toUpperCase().includes(k)
  );
  return key ? SECTION_NUMBERS[key] : 9;
}

// ─── Compliance Badge ────────────────────────────────────────────────────────

function ComplianceBadge({ status }: { status: ComplianceStatus }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG["A VERIFIER"];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-bold whitespace-nowrap",
        config.text
      )}
    >
      {config.label}
    </span>
  );
}

// ─── Category Table — matches client PDF section ─────────────────────────────

function CategorySection({
  category,
  sectionNum,
}: {
  category: FeasibilityCategory;
  sectionNum: number;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      {/* Blue header bar — exact PDF reproduction */}
      <div className="px-4 py-2.5 bg-[#2c3e8c] text-white">
        <h3 className="text-sm font-bold tracking-wide uppercase">
          {sectionNum}. {category.category}
        </h3>
      </div>

      {/* Column headers */}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left px-4 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[22%]">
              &nbsp;
            </th>
            <th className="text-left px-4 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[38%]">
              REGLEMENTATION
            </th>
            <th className="text-center px-3 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[12%]">
              CONFORMITE
            </th>
            <th className="text-left px-4 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[28%]">
              RECOMMANDATIONS
            </th>
          </tr>
        </thead>
        <tbody>
          {category.rows.map((row, idx) => (
            <tr
              key={idx}
              className={cn(
                "border-b border-slate-100",
                row.complianceStatus === "NON" && "bg-red-50/40"
              )}
            >
              {/* Topic */}
              <td className="px-4 py-3 align-top">
                <p className="text-xs font-semibold text-slate-800 leading-snug">
                  {row.topic}
                </p>
              </td>

              {/* Reglementation text */}
              <td className="px-4 py-3 align-top">
                <p className="text-xs text-slate-600 leading-relaxed">
                  {row.ruleText}
                </p>
              </td>

              {/* Conformité */}
              <td className="px-3 py-3 text-center align-top">
                <ComplianceBadge status={row.complianceStatus} />
              </td>

              {/* Recommandations */}
              <td className="px-4 py-3 align-top">
                <p className="text-xs text-slate-600 leading-relaxed">
                  {row.recommendation}
                </p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Project Context Card (Section 1: SITUATION DU PROJET) ───────────────────

function ProjectContextCard({
  report,
  address,
  zone,
  protectedAreas,
  isEn,
}: {
  report: FeasibilityReport;
  address?: string;
  zone?: string;
  protectedAreas?: { type: string; name: string }[];
  isEn?: boolean;
}) {
  const abfStatus =
    protectedAreas && protectedAreas.length > 0 ? "À vérifier" : "Non concerné";

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      {/* Blue header */}
      <div className="px-4 py-2.5 bg-[#2c3e8c] text-white">
        <h3 className="text-sm font-bold tracking-wide uppercase">
          1. SITUATION DU PROJET
        </h3>
      </div>

      {/* Row headers */}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left px-4 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {isEn ? "PROJECT ADDRESS" : "ADRESSE DU PROJET"}
            </th>
            <th className="text-left px-4 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {isEn ? "ZONE NAME" : "NOM DE LA ZONE"}
            </th>
            <th className="text-left px-4 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {isEn ? "REGULATION TYPE" : "TYPE DE REGLEMENT"}
            </th>
            <th className="text-left px-4 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              LOTISSEMENT
            </th>
            <th className="text-left px-4 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {isEn ? "ABF ZONE" : "ZONE ABF"}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-slate-100">
            <td className="px-4 py-3 text-xs text-slate-700">
              {address || "—"}
            </td>
            <td className="px-4 py-3 text-xs font-semibold text-slate-800">
              {zone || "—"}
            </td>
            <td className="px-4 py-3 text-xs text-slate-700">PLU</td>
            <td className="px-4 py-3 text-xs text-slate-700">Non concerné</td>
            <td className="px-4 py-3 text-xs text-slate-700">{abfStatus}</td>
          </tr>
        </tbody>
      </table>

      {/* Project context description */}
      {report.projectContext && (
        <div className="px-4 py-3 bg-slate-50/50 border-t border-slate-100">
          <p className="text-xs text-slate-600 leading-relaxed italic">
            {report.projectContext}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Conclusion Box ──────────────────────────────────────────────────────────

function ConclusionBox({
  conclusion,
  isEn,
}: {
  conclusion: FeasibilityReport["conclusion"];
  isEn?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border-2 border-[#2c3e8c]/30 bg-white">
      {/* Header */}
      <div className="px-4 py-2.5 bg-[#2c3e8c] text-white flex items-center gap-2">
        <ClipboardCheck className="w-4 h-4 opacity-90" />
        <h3 className="text-sm font-bold tracking-wide uppercase">
          {isEn ? "CONCLUSION" : "CONCLUSION"}
        </h3>
      </div>

      <div className="p-5 space-y-4">
        {/* Summary */}
        <p className="text-sm text-slate-700 leading-relaxed">
          {conclusion.summary}
        </p>

        {/* Authorization type */}
        <div className="flex items-start gap-3 p-3.5 rounded-lg bg-indigo-50 border border-indigo-200">
          <FileWarning className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {isEn
                ? "Probable Authorization Type"
                : "Type d'autorisation probable"}
            </p>
            <p className="text-sm font-bold text-slate-900 mt-0.5">
              {conclusion.authorizationType}
            </p>
          </div>
        </div>

        {/* Required checks */}
        {conclusion.requiredChecks.length > 0 && (
          <div>
            <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              {isEn ? "Required Verifications" : "Vérifications requises"}
            </p>
            <ul className="space-y-1.5">
              {conclusion.requiredChecks.map((check, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-xs text-slate-700 p-2 rounded-md bg-amber-50/60 border border-amber-100"
                >
                  <span className="w-4 h-4 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{check}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stats Summary ───────────────────────────────────────────────────────────

function StatsSummary({ report }: { report: FeasibilityReport }) {
  const allRows = report.matrix.flatMap((cat) => cat.rows);
  const counts = {
    OUI: allRows.filter((r) => r.complianceStatus === "OUI").length,
    NON: allRows.filter((r) => r.complianceStatus === "NON").length,
    "A VERIFIER": allRows.filter((r) => r.complianceStatus === "A VERIFIER")
      .length,
    "NON CONCERNE": allRows.filter(
      (r) => r.complianceStatus === "NON CONCERNE"
    ).length,
  };
  const total = allRows.length;

  const stats = [
    { key: "OUI" as const, label: "Conforme", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
    { key: "NON" as const, label: "Non conforme", color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
    { key: "A VERIFIER" as const, label: "À vérifier", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
    { key: "NON CONCERNE" as const, label: "Non concerné", color: "text-slate-500", bg: "bg-slate-50", border: "border-slate-200" },
  ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {stats.map((s) => (
        <div
          key={s.key}
          className={cn(
            "rounded-lg p-3 border text-center",
            s.bg,
            s.border
          )}
        >
          <p className={cn("text-2xl font-bold", s.color)}>{counts[s.key]}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{s.label}</p>
          {total > 0 && (
            <p className="text-[9px] text-slate-400">
              {Math.round((counts[s.key] / total) * 100)}%
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Loading Skeleton ────────────────────────────────────────────────────────

export function FeasibilityMatrixSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="rounded-lg border border-slate-200 overflow-hidden"
        >
          <div className="h-10 bg-[#2c3e8c]/30" />
          <div className="p-4 space-y-3">
            {[1, 2].map((j) => (
              <div key={j} className="flex gap-4">
                <div className="h-3 w-1/5 bg-slate-100 rounded" />
                <div className="h-3 w-2/5 bg-slate-100 rounded" />
                <div className="h-3 w-16 bg-slate-100 rounded" />
                <div className="h-3 w-1/4 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-center justify-center gap-3 py-6">
        <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
        <span className="text-sm font-medium text-slate-500">
          Analyse de faisabilité en cours…
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function FeasibilityMatrix({
  report,
  address,
  zone,
  protectedAreas,
  isEn,
}: {
  report: FeasibilityReport;
  address?: string;
  zone?: string;
  protectedAreas?: { type: string; name: string }[];
  isEn?: boolean;
}) {
  // Sort categories by section number
  const sortedCategories = [...report.matrix].sort(
    (a, b) => getSectionNumber(a.category) - getSectionNumber(b.category)
  );

  return (
    <div className="space-y-4">
      {/* Section 1: Project context */}
      <ProjectContextCard
        report={report}
        address={address}
        zone={zone}
        protectedAreas={protectedAreas}
        isEn={isEn}
      />

      {/* Stats */}
      <StatsSummary report={report} />

      {/* Category sections */}
      {sortedCategories.map((category, idx) => (
        <CategorySection
          key={idx}
          category={category}
          sectionNum={getSectionNumber(category.category)}
        />
      ))}

      {/* Conclusion */}
      <ConclusionBox conclusion={report.conclusion} isEn={isEn} />
    </div>
  );
}
