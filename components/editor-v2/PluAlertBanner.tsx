"use client";

/**
 * PluAlertBanner — Render-Isolated PLU Compliance Banner
 *
 * React.memo'd. Reads ONLY useComplianceSlice() from Zustand.
 * When the user clicks a tool or moves a canvas object, this component
 * does NOT re-render unless the compliance report itself changes.
 */

import React, { memo } from "react";
import { AlertTriangle, CheckCircle, Info } from "lucide-react";
import { useComplianceSlice } from "@/store/useUrbAssistProjectStore";

const PluAlertBanner = memo(function PluAlertBanner() {
  const { complianceReport } = useComplianceSlice();

  if (!complianceReport || complianceReport.status === "no-data") {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-medium">
        <Info size={14} />
        <span>Placez des éléments pour voir l&apos;analyse PLU en temps réel</span>
      </div>
    );
  }

  const { status, coverageRatio, maxCoverageRatio, setbackViolations, totalBuildingAreaM2, parcelAreaM2 } = complianceReport;
  const coveragePct = (coverageRatio * 100).toFixed(1);
  const maxPct = maxCoverageRatio != null ? (maxCoverageRatio * 100).toFixed(0) : null;
  const violations = setbackViolations ?? [];

  if (status === "compliant") {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs font-medium">
        <CheckCircle size={14} />
        <span>
          CES {coveragePct}%{maxPct ? ` / ${maxPct}%` : ""} · {totalBuildingAreaM2.toFixed(1)} m² sur {parcelAreaM2.toFixed(0)} m²
        </span>
      </div>
    );
  }

  // Violation state
  const messages: string[] = [];
  if (complianceReport.coverageExceeded) {
    messages.push(`CES ${coveragePct}% dépasse le max ${maxPct}%`);
  }
  for (const v of violations.slice(0, 3)) {
    messages.push(v.message);
  }
  if (violations.length > 3) {
    messages.push(`+${violations.length - 3} autres violations`);
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-200 text-red-800 text-xs font-medium">
      <AlertTriangle size={14} className="shrink-0" />
      <span>{messages.join(" · ")}</span>
    </div>
  );
});

export default PluAlertBanner;
