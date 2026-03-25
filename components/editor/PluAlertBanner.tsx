/**
 * PluAlertBanner.tsx — Real-Time PLU Compliance Alert Banner
 *
 * Enterprise-grade compliance alert that sits at the top of the site-plan editor.
 * Consumes the ComplianceReport from usePluCompliance hook and renders
 * three visual states:
 *
 *   1. NO-DATA (gray):     PLU rules unavailable or no parcel on canvas
 *   2. COMPLIANT (green):  All checks pass — project is within legal limits
 *   3. VIOLATION (red):    CES exceeded and/or setback violations detected
 *
 * DESIGN:
 *   - Tailwind CSS + lucide-react icons
 *   - Smooth expand/collapse animation for violation details
 *   - Non-blocking: never prevents interaction with the canvas
 *   - Compact by default, expandable for detail
 */

"use client";

import { useState, useMemo } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Ruler,
  LayoutGrid,
} from "lucide-react";
import type { ComplianceReport } from "@/lib/plu-math";

// ─── Props ──────────────────────────────────────────────────────────────────

interface PluAlertBannerProps {
  /** Compliance report from usePluCompliance hook */
  report: ComplianceReport;
  /** Optional CSS class for positioning */
  className?: string;
}

// ─── Styling Config ─────────────────────────────────────────────────────────

const BANNER_STYLES = {
  "no-data": {
    bg: "bg-slate-800/90",
    border: "border-slate-600/50",
    text: "text-slate-300",
    icon: Info,
    iconColor: "text-slate-400",
    glow: "",
  },
  compliant: {
    bg: "bg-emerald-950/90",
    border: "border-emerald-500/30",
    text: "text-emerald-200",
    icon: ShieldCheck,
    iconColor: "text-emerald-400",
    glow: "shadow-[0_0_15px_rgba(16,185,129,0.08)]",
  },
  violation: {
    bg: "bg-red-950/90",
    border: "border-red-500/40",
    text: "text-red-200",
    icon: AlertTriangle,
    iconColor: "text-red-400",
    glow: "shadow-[0_0_20px_rgba(239,68,68,0.12)]",
  },
} as const;

// ─── Helper to format percentage ────────────────────────────────────────────

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function formatArea(m2: number): string {
  if (m2 >= 10000) return `${(m2 / 10000).toFixed(2)} ha`;
  return `${m2.toFixed(1)} m²`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function PluAlertBanner({ report, className = "" }: PluAlertBannerProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const style = BANNER_STYLES[report.status];
  const IconComponent = style.icon;

  const hasViolations =
    report.status === "violation" &&
    (report.coverageExceeded || report.setbackViolations.length > 0);

  const violationCount = useMemo(() => {
    let count = 0;
    if (report.coverageExceeded) count += 1;
    count += report.setbackViolations.length;
    return count;
  }, [report.coverageExceeded, report.setbackViolations]);

  // Build the primary status message
  const statusMessage = useMemo(() => {
    switch (report.status) {
      case "no-data":
        return "Règles PLU non disponibles";
      case "compliant":
        return "Projet conforme aux règles PLU connues";
      case "violation":
        return `${violationCount} violation${violationCount > 1 ? "s" : ""} PLU détectée${violationCount > 1 ? "s" : ""}`;
    }
  }, [report.status, violationCount]);

  return (
    <div
      className={`
        relative w-full rounded-lg border backdrop-blur-md
        transition-all duration-300 ease-in-out
        ${style.bg} ${style.border} ${style.glow}
        ${className}
      `}
      role="alert"
      aria-live="polite"
    >
      {/* ─── Main Row ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        {/* Left: Icon + Status Message */}
        <div className="flex items-center gap-2.5 min-w-0">
          <IconComponent
            className={`
              w-4 h-4 flex-shrink-0
              ${style.iconColor}
              ${report.status === "violation" ? "animate-pulse" : ""}
            `}
          />
          <span className={`text-xs font-semibold tracking-wide ${style.text}`}>
            {statusMessage}
          </span>
        </div>

        {/* Center: Quick Stats (only when we have data) */}
        {report.status !== "no-data" && (
          <div className="hidden sm:flex items-center gap-4 text-[10px] font-mono">
            {/* CES Coverage */}
            <div className="flex items-center gap-1.5">
              <LayoutGrid className={`w-3 h-3 ${report.coverageExceeded ? "text-red-400" : "text-slate-400"}`} />
              <span className={report.coverageExceeded ? "text-red-300 font-bold" : "text-slate-400"}>
                CES: {formatPercent(report.coverageRatio)}
                {report.maxCoverageRatio !== null && (
                  <span className="text-slate-500"> / {formatPercent(report.maxCoverageRatio)}</span>
                )}
              </span>
            </div>

            {/* Building Area */}
            {report.totalBuildingAreaM2 > 0 && (
              <div className="flex items-center gap-1.5">
                <Ruler className="w-3 h-3 text-slate-400" />
                <span className="text-slate-400">
                  Emprise: {formatArea(report.totalBuildingAreaM2)}
                  {" / "}
                  {formatArea(report.parcelAreaM2)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Right: Expand Button (only when violations exist) */}
        {hasViolations && (
          <button
            onClick={() => setIsExpanded((prev) => !prev)}
            className={`
              flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium
              transition-colors duration-150
              ${isExpanded
                ? "bg-red-500/20 text-red-300 hover:bg-red-500/30"
                : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
              }
            `}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Masquer les détails" : "Afficher les détails"}
          >
            Détails
            {isExpanded ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
        )}
      </div>

      {/* ─── Expanded Violation Details ───────────────────────────────── */}
      <div
        className={`
          overflow-hidden transition-all duration-300 ease-in-out
          ${isExpanded && hasViolations ? "max-h-60 opacity-100" : "max-h-0 opacity-0"}
        `}
      >
        <div className="px-4 pb-3 pt-0.5 space-y-1.5 border-t border-red-500/20">
          {/* CES Violation */}
          {report.coverageExceeded && report.maxCoverageRatio !== null && (
            <div className="flex items-start gap-2 py-1.5 px-2.5 rounded-md bg-red-500/10">
              <LayoutGrid className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
              <div className="text-[11px] text-red-300">
                <span className="font-semibold">Emprise au sol dépassée :</span>{" "}
                {formatPercent(report.coverageRatio)} occupé
                {" (max. "}{formatPercent(report.maxCoverageRatio)}
                {report.maxCoverageRatio !== null && report.parcelAreaM2 > 0 && (
                  <span>
                    {" = "}{formatArea(report.maxCoverageRatio * report.parcelAreaM2)}
                  </span>
                )}
                {")"}
              </div>
            </div>
          )}

          {/* Setback Violations */}
          {report.setbackViolations.map((v, idx) => (
            <div
              key={`${v.buildingId}-${v.edgeType}-${idx}`}
              className="flex items-start gap-2 py-1.5 px-2.5 rounded-md bg-red-500/10"
            >
              <Ruler className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
              <div className="text-[11px] text-red-300">
                <span className="font-semibold">Recul {v.edgeType === "front" ? "voie" : v.edgeType === "side" ? "latéral" : "fond"} :</span>{" "}
                {v.message}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
