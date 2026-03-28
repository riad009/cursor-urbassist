"use client";

/**
 * PluAlertBanner — Plain-French Actionable Compliance Banner
 *
 * ▸ Translates technical PLU violations into simple, human-readable French.
 * ▸ ZERO jargon — "Réduisez l'emprise au sol de X m²" not "CES 52% / 50%".
 * ▸ React.memo'd — only re-renders when complianceReport changes.
 */

import React, { memo } from "react";
import { AlertTriangle, CheckCircle, Info } from "lucide-react";
import { useComplianceSlice } from "@/store/useUrbAssistProjectStore";

const PluAlertBanner = memo(function PluAlertBanner() {
  const { complianceReport } = useComplianceSlice();

  if (!complianceReport || complianceReport.status === "no-data") {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-medium">
        <Info size={13} className="shrink-0" />
        <span>Placez des éléments sur la parcelle pour voir l&apos;analyse de conformité en temps réel.</span>
      </div>
    );
  }

  const {
    status,
    coverageRatio,
    maxCoverageRatio,
    setbackViolations,
    totalBuildingAreaM2,
    parcelAreaM2,
  } = complianceReport;

  if (status === "compliant") {
    const greenSpace = parcelAreaM2 > 0
      ? ((1 - coverageRatio) * parcelAreaM2).toFixed(0)
      : "–";
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs font-medium">
        <CheckCircle size={13} className="shrink-0 text-emerald-500" />
        <span>
          Votre projet est conforme aux règles PLU. ·{" "}
          <span className="font-semibold">{totalBuildingAreaM2.toFixed(0)} m²</span> construits
          · <span className="font-semibold">{greenSpace} m²</span> d&apos;espaces verts conservés.
        </span>
      </div>
    );
  }

  // ── Build plain-language violation messages ───────────────────────────────

  const messages: string[] = [];

  if (complianceReport.coverageExceeded && maxCoverageRatio != null) {
    const excess = totalBuildingAreaM2 - maxCoverageRatio * parcelAreaM2;
    messages.push(`Réduisez l'emprise au sol de ${Math.ceil(excess)} m² pour respecter le PLU.`);
  }

  const violations = setbackViolations ?? [];
  for (const v of violations.slice(0, 2)) {
    // Translate raw setback messages to plain French if possible
    const plain = v.message
      .replace(/setback/gi, "retrait")
      .replace(/violated/gi, "non respecté")
      .replace(/boundary/gi, "limite de parcelle");
    messages.push(plain);
  }
  if (violations.length > 2) {
    messages.push(`+${violations.length - 2} autre${violations.length - 2 > 1 ? "s" : ""} non-conformité${violations.length - 2 > 1 ? "s" : ""} détectée${violations.length - 2 > 1 ? "s" : ""}.`);
  }
  if (messages.length === 0) {
    messages.push("Vérifiez la conformité de votre implantation.");
  }

  return (
    <div className="flex items-start gap-2 px-4 py-2.5 bg-red-50 border-b border-red-200 text-red-800 text-xs font-medium">
      <AlertTriangle size={13} className="shrink-0 mt-0.5 text-red-500" />
      <span>{messages.join(" · ")}</span>
    </div>
  );
});

export default PluAlertBanner;
