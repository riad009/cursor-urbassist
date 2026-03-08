"use client";

/**
 * ABFWarningBanner — Prominent heritage zone alert for Phase 1 sidebar.
 *
 * Consumes the dossierStore heritage state AND the regulatoryDocumentStore
 * to show a highly visible warning when the project is located in an ABF
 * (Architecte des Bâtiments de France) protection perimeter.
 *
 * Renders `null` when ABF is not detected — zero layout impact.
 * Designed to sit at the top of the right-hand sidebar, above the PLU card.
 */

import { useDossierStore } from "@/store/dossierStore";
import { useRegulatoryDocumentStore } from "@/store/regulatoryDocumentStore";
import { AlertTriangle, Shield, FileText, Clock } from "lucide-react";

export default function ABFWarningBanner() {
  const heritage = useDossierStore((s) => s.heritage);
  const abfSpecificCodes = useRegulatoryDocumentStore((s) => s.abfSpecificCodes);
  const abfImpactSummary = useRegulatoryDocumentStore((s) => s.abfImpactSummary);

  // ── Derive ABF zone status from heritage detection ─────────────────────
  const isABFZone =
    heritage?.isProtectedZone === true &&
    heritage.protectedAreas?.some(
      (a) => a.type === "ABF" || a.type === "HERITAGE"
    );

  if (!isABFZone) return null;

  // Find nearest monument name for specificity
  const nearestMonument = heritage.protectedAreas?.find(
    (a) => a.type === "ABF" && a.name.includes("Monument Historique")
  );

  // Build the specific document codes string
  const docCodesLabel =
    abfSpecificCodes.length > 0
      ? abfSpecificCodes.join(" / ")
      : "DPC 11 / PC 4";

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="
        relative overflow-hidden rounded-xl border-2 border-amber-400/80
        bg-gradient-to-br from-amber-50 via-orange-50/60 to-amber-50
        shadow-lg shadow-amber-100/50
        mb-4
      "
    >
      {/* ── Decorative top accent bar ──────────────────────────────────── */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400" />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        <div className="flex-shrink-0 mt-0.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15 ring-1 ring-amber-400/30">
            <AlertTriangle className="h-5 w-5 text-amber-600" strokeWidth={2.5} />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold tracking-tight text-amber-900">
            ⚠️ Attention : Zone ABF détectée
          </h3>
          <p className="mt-0.5 text-xs font-medium text-amber-700/90">
            Périmètre de protection des monuments historiques
          </p>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="space-y-2.5 px-4 pb-4">
        {/* ABF requirement */}
        <div className="flex items-start gap-2.5">
          <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600/80" />
          <p className="text-[13px] leading-snug text-amber-900/90">
            L&apos;avis de l&apos;<span className="font-semibold">Architecte des Bâtiments de France (ABF)</span> est
            requis pour toute modification extérieure.
          </p>
        </div>

        {/* Additional documents */}
        <div className="flex items-start gap-2.5">
          <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600/80" />
          <p className="text-[13px] leading-snug text-amber-900/90">
            Des pièces supplémentaires (
            <span className="font-semibold">{docCodesLabel}</span>)
            seront <span className="font-semibold">automatiquement exigées</span> dans votre dossier.
          </p>
        </div>

        {/* Timeline impact */}
        <div className="flex items-start gap-2.5">
          <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600/80" />
          <p className="text-[13px] leading-snug text-amber-900/90">
            Délai d&apos;instruction majoré de{" "}
            <span className="font-semibold">+1 mois</span> (consultation ABF obligatoire).
          </p>
        </div>

        {/* Nearest monument (if detected) */}
        {nearestMonument && (
          <div className="mt-1 rounded-lg bg-amber-100/60 px-3 py-2 ring-1 ring-amber-300/40">
            <p className="text-xs text-amber-800">
              <span className="font-semibold">Monument détecté :</span>{" "}
              {nearestMonument.name.replace(/^Monument Historique:\s*/, "")}
              {nearestMonument.distance != null && (
                <span className="text-amber-600"> — à {nearestMonument.distance}m</span>
              )}
            </p>
          </div>
        )}

        {/* ABF impact summary from the regulatory store */}
        {abfImpactSummary && (
          <p className="text-[11px] leading-relaxed text-amber-600/80 italic pt-1 border-t border-amber-200/60">
            {abfImpactSummary}
          </p>
        )}
      </div>
    </div>
  );
}
