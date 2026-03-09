"use client";

import React, { useRef, useState, useEffect } from "react";
import {
  FileText,
  Eye,
  RefreshCw,
  Plus,
  X,
  Upload,
  CheckCircle2,
  Globe,
  Shield,
  Undo2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type PluDecisionState = "pending" | "confirmed" | "replacing" | "manual_upload";

interface PluDocumentManagerProps {
  /** URL auto-detected from GPU API (regulatoryAnalysis.pdfUrl) */
  autoFetchedUrl: string | null;
  /** Detected PLU zone (e.g. "UA", "UB1") */
  zoneType: string | null;
  /** Manually uploaded primary PLU file */
  pluFile: File | null;
  onPluFileChange: (file: File | null) => void;
  /** Whether the user explicitly replaced the auto-fetched doc */
  useAutoDoc: boolean;
  onUseAutoDocChange: (v: boolean) => void;
  /** Optional lotissement supplement PDF */
  lotissementFile: File | null;
  onLotissementChange: (file: File | null) => void;
  /** Callback: true when the user has a valid document ready for analysis */
  onDocumentReady?: (ready: boolean) => void;
  /** Language flag */
  isEn: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extractFilename(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split("/").pop();
    return last && last.length > 3 ? decodeURIComponent(last) : "Règlement PLU";
  } catch {
    return "Règlement PLU";
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function PluDocumentManager({
  autoFetchedUrl,
  zoneType,
  pluFile,
  onPluFileChange,
  useAutoDoc,
  onUseAutoDocChange,
  lotissementFile,
  onLotissementChange,
  onDocumentReady,
  isEn,
}: PluDocumentManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── State machine ──────────────────────────────────────────────────────
  const hasAutoDoc = !!autoFetchedUrl?.trim();
  const hasManualFile = !!pluFile;

  const initialState: PluDecisionState = hasManualFile
    ? "confirmed"
    : hasAutoDoc
      ? "pending"
      : "manual_upload";

  const [decision, setDecision] = useState<PluDecisionState>(initialState);

  // Re-derive state when auto URL appears (e.g. after project data loads)
  useEffect(() => {
    if (hasAutoDoc && !hasManualFile && decision === "manual_upload") {
      setDecision("pending");
    }
  }, [hasAutoDoc, hasManualFile, decision]);

  // ── Emit readiness ────────────────────────────────────────────────────
  const isReady = decision === "confirmed" || (decision === "manual_upload" && hasManualFile);
  useEffect(() => {
    onDocumentReady?.(isReady);
  }, [isReady, onDocumentReady]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleConfirm = () => {
    setDecision("confirmed");
    onUseAutoDocChange(true);
  };

  const handleStartReplace = () => {
    setDecision("replacing");
  };

  const handleCancelReplace = () => {
    if (hasAutoDoc) {
      setDecision("pending");
    } else {
      setDecision("manual_upload");
    }
  };

  const handleFileUpload = (f: File) => {
    onPluFileChange(f);
    onUseAutoDocChange(false);
    setDecision("confirmed");
  };

  const handleUnconfirm = () => {
    if (hasManualFile) {
      onPluFileChange(null);
    }
    if (hasAutoDoc) {
      onUseAutoDocChange(true);
      setDecision("pending");
    } else {
      setDecision("manual_upload");
    }
  };

  const handleAddLotissement = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf";
    input.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) onLotissementChange(f);
    };
    input.click();
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Section title */}
      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
        <FileText className="w-4 h-4 text-indigo-500" />
        {isEn ? "PLU Regulation Document" : "Document du règlement PLU"}
      </h3>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFileUpload(f);
          e.target.value = "";
        }}
      />

      {/* ════════════════════════════════════════════════════════════════════
           STATE: PENDING — User must decide on the auto-detected document
         ════════════════════════════════════════════════════════════════════ */}
      {decision === "pending" && hasAutoDoc && (
        <div className="rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-white p-5 space-y-4">
          {/* Header badge */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <Globe className="w-4.5 h-4.5 text-indigo-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-900">
                {isEn ? "Regulation auto-detected" : "Règlement auto-détecté"}
              </p>
              <p className="text-xs text-slate-500">
                {zoneType
                  ? `Zone ${zoneType.toUpperCase()} — Géoportail de l'Urbanisme`
                  : "Géoportail de l'Urbanisme"}
              </p>
            </div>
          </div>

          {/* Document name */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/80 border border-indigo-100">
            <FileText className="w-5 h-5 text-indigo-500 flex-shrink-0" />
            <p className="text-sm font-medium text-slate-700 truncate flex-1">
              {extractFilename(autoFetchedUrl!)}
            </p>
          </div>

          {/* Instruction */}
          <p className="text-xs text-slate-500 leading-relaxed">
            {isEn
              ? "Please verify this is the correct regulation for your parcel before launching the analysis."
              : "Veuillez vérifier que ce règlement est le bon pour votre parcelle avant de lancer l'analyse."}
          </p>

          {/* ── 3 Action Buttons ────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-2">
            {/* Button 1: View Document */}
            <a
              href={autoFetchedUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl
                         bg-white border-2 border-slate-200 text-sm font-semibold text-slate-600
                         hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50/50
                         transition-all shadow-sm group"
            >
              <Eye className="w-4 h-4 group-hover:text-indigo-600 transition-colors" />
              <span className="hidden sm:inline">{isEn ? "View" : "Voir"}</span>
              <span className="sm:hidden">{isEn ? "View" : "Voir"}</span>
            </a>

            {/* Button 2: Replace */}
            <button
              type="button"
              onClick={handleStartReplace}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl
                         bg-white border-2 border-slate-200 text-sm font-semibold text-slate-500
                         hover:border-red-200 hover:text-red-600 hover:bg-red-50/50
                         transition-all shadow-sm group"
            >
              <RefreshCw className="w-4 h-4 group-hover:text-red-500 transition-colors" />
              <span>{isEn ? "Replace" : "Remplacer"}</span>
            </button>

            {/* Button 3: Confirm */}
            <button
              type="button"
              onClick={handleConfirm}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl
                         bg-indigo-600 border-2 border-indigo-600 text-sm font-bold text-white
                         hover:bg-indigo-700 hover:border-indigo-700
                         transition-all shadow-sm shadow-indigo-200"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isEn ? "Confirm" : "Confirmer"}</span>
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
           STATE: REPLACING — Show the drop zone with cancel button
         ════════════════════════════════════════════════════════════════════ */}
      {decision === "replacing" && (
        <div className="space-y-3">
          <div
            className="border-2 border-dashed border-indigo-300 rounded-xl p-8 text-center
                       hover:border-indigo-500 hover:bg-indigo-50/40 transition-all cursor-pointer group"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f && (f.type.includes("pdf") || f.name.endsWith(".pdf"))) handleFileUpload(f);
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-8 h-8 text-indigo-300 group-hover:text-indigo-500 mx-auto mb-2 transition-colors" />
            <p className="text-sm font-semibold text-slate-600 group-hover:text-indigo-600 transition-colors">
              {isEn
                ? "Drop your replacement regulation PDF here"
                : "Glisser votre PDF de remplacement ici"}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {isEn ? "PDF files only, max 20 MB" : "Fichiers PDF uniquement, max 20 Mo"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCancelReplace}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
            {isEn ? "Cancel — keep auto-detected document" : "Annuler — garder le document auto-détecté"}
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
           STATE: MANUAL_UPLOAD — No auto doc available, simple drop zone
         ════════════════════════════════════════════════════════════════════ */}
      {decision === "manual_upload" && !hasManualFile && (
        <div
          className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center
                     hover:border-indigo-400 hover:bg-indigo-50/30 transition-all cursor-pointer group"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f && (f.type.includes("pdf") || f.name.endsWith(".pdf"))) handleFileUpload(f);
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-8 h-8 text-slate-300 group-hover:text-indigo-400 mx-auto mb-2 transition-colors" />
          <p className="text-sm font-semibold text-slate-600 group-hover:text-indigo-600 transition-colors">
            {isEn ? "Drop the PLU regulation PDF here" : "Glisser le PDF du règlement PLU ici"}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {isEn
              ? "AI will analyze this document to extract zoning rules"
              : "L'IA analysera ce document pour extraire les règles de zone"}
          </p>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
           STATE: CONFIRMED — Show success card with undo option
         ════════════════════════════════════════════════════════════════════ */}
      {decision === "confirmed" && (
        <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wide">
                  {isEn ? "Document verified" : "Document vérifié"}
                </span>
              </div>
              <p className="text-sm font-semibold text-slate-800 truncate">
                {hasManualFile
                  ? pluFile!.name
                  : hasAutoDoc
                    ? extractFilename(autoFetchedUrl!)
                    : "—"}
              </p>
              <p className="text-xs text-slate-500">
                {hasManualFile
                  ? formatFileSize(pluFile!.size)
                  : zoneType
                    ? `Zone ${zoneType.toUpperCase()} — Règlement officiel`
                    : "Règlement officiel"}
              </p>
            </div>
            {/* Undo button */}
            <button
              type="button"
              onClick={handleUnconfirm}
              className="flex-shrink-0 p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/80 transition-all group"
              title={isEn ? "Undo confirmation" : "Annuler la confirmation"}
            >
              <Undo2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
           LOTISSEMENT SECTION — Only visible after doc is confirmed/uploaded
         ════════════════════════════════════════════════════════════════════ */}
      {isReady && (
        <div className="space-y-2 pt-1">
          {!lotissementFile ? (
            <button
              type="button"
              onClick={handleAddLotissement}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl
                         bg-white border border-dashed border-amber-300 text-xs font-semibold text-amber-700
                         hover:bg-amber-50 hover:border-amber-400 hover:text-amber-800
                         transition-all w-full justify-center"
            >
              <Plus className="w-3.5 h-3.5" />
              {isEn ? "Add a subdivision regulation (lotissement)" : "Ajouter un règlement de lotissement"}
            </button>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
              <div className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-amber-100 text-amber-700">
                <FileText className="w-4.5 h-4.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-0.5">
                  {isEn ? "Subdivision supplement" : "Supplément lotissement"}
                </p>
                <p className="text-sm font-semibold text-slate-800 truncate">{lotissementFile.name}</p>
                <p className="text-xs text-slate-500">{formatFileSize(lotissementFile.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => onLotissementChange(null)}
                className="flex-shrink-0 p-1.5 rounded-lg hover:bg-white/80 transition-colors group"
              >
                <X className="w-4 h-4 text-slate-400 group-hover:text-red-500 transition-colors" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Validation warning when pending ──────────────────────────────── */}
      {decision === "pending" && (
        <p className="text-[11px] text-amber-600 font-medium leading-relaxed flex items-start gap-1.5">
          <span className="mt-0.5">⚠</span>
          {isEn
            ? "You must confirm or replace the auto-detected regulation before launching the analysis."
            : "Vous devez confirmer ou remplacer le règlement auto-détecté avant de lancer l'analyse."}
        </p>
      )}

      {/* ── Help text ────────────────────────────────────────────────────── */}
      <p className="text-[11px] text-slate-400 leading-relaxed">
        {isEn
          ? "The detected PLU may not be the only applicable regulation. After confirmation, you can add a subdivision (lotissement) regulation."
          : "Le PLU détecté n'est pas forcément le seul règlement applicable. Après confirmation, vous pouvez ajouter un règlement de lotissement."}
      </p>
    </div>
  );
}
