"use client";

/**
 * PluDocumentManager — STRICT Document Gate for PLU Regulation
 *
 * CLIENT MANDATE:
 * "When a PLU zone is detected, the system must retrieve the written regulation
 *  and make it downloadable. Before launching PLU analysis, the user MUST be able
 *  to download the detected regulation, add subdivision rules (lotissement), or
 *  replace the detected regulation with an uploaded document."
 *
 * GATE BEHAVIOR:
 *   onDocumentReady(true)  → ONLY when user has explicitly confirmed their document(s)
 *   onDocumentReady(false) → default, blocks the "Launch Analysis" button upstream
 *
 * STATES:
 *   1. Auto-detected regulation (from GPU) → show zone badge + download + confirm
 *   2. Manual upload (no auto-doc or user chose to replace) → dropzone
 *   3. Confirmed → success card, unlock lotissement supplement + analysis
 *
 * CLEAR DISTINCTION:
 *   - PUBLIC (bleu/sky) = PLU réglementation officielle (GPU / Géoportail de l'Urbanisme)
 *   - PRIVÉ  (violet)   = Règlement de lotissement (private subdivision rules)
 */

import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  FileText,
  RefreshCw,
  X,
  Upload,
  CheckCircle2,
  Globe,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Undo2,
  AlertTriangle,
  Building2,
  Landmark,
  Info,
  ExternalLink,
  FilePlus,
  FileDown,
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

// ─── File validation ─────────────────────────────────────────────────────────

const ACCEPTED_TYPES = [
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return "Format non accepté. PDF, DOC, DOCX ou TXT uniquement.";
  }
  if (file.size > MAX_FILE_SIZE) {
    return `Fichier trop volumineux (max ${MAX_FILE_SIZE / 1024 / 1024} Mo).`;
  }
  return null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
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
  const lotissementInputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [lotError, setLotError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [showLotDropzone, setShowLotDropzone] = useState(false);

  // ── State machine ──────────────────────────────────────────────────────
  const hasAutoDoc = !!autoFetchedUrl?.trim();
  const hasManualFile = !!pluFile;

  // If zone detected (with or without pdfUrl) → pending so zone badge shows
  // If no zone and no auto doc → manual_upload (plain dropzone)
  const initialState: PluDecisionState = hasManualFile
    ? "confirmed"
    : (hasAutoDoc || !!zoneType)
      ? "pending"
      : "manual_upload";

  const [decision, setDecision] = useState<PluDecisionState>(initialState);

  // Re-derive state when auto URL appears (e.g. after project data loads)
  useEffect(() => {
    if (hasAutoDoc && !hasManualFile && decision === "manual_upload") {
      setDecision("pending");
    }
  }, [hasAutoDoc, hasManualFile, decision]);

  // ── Emit readiness — STRICT GATE ──────────────────────────────────────
  // The gate is passed ONLY when:
  //   - decision is "confirmed" (user explicitly approved), OR
  //   - decision is "manual_upload" AND a file has been uploaded AND confirmed
  const isReady = decision === "confirmed";
  useEffect(() => {
    onDocumentReady?.(isReady);
  }, [isReady, onDocumentReady]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    setDecision("confirmed");
    onUseAutoDocChange(true);
  }, [onUseAutoDocChange]);

  const handleStartReplace = useCallback(() => {
    setDecision("replacing");
  }, []);

  const handleCancelReplace = useCallback(() => {
    if (hasAutoDoc) {
      setDecision("pending");
    } else {
      setDecision("manual_upload");
    }
  }, [hasAutoDoc]);

  const handleFileUpload = useCallback((f: File) => {
    const err = validateFile(f);
    if (err) { setFileError(err); return; }
    setFileError(null);
    onPluFileChange(f);
    onUseAutoDocChange(false);
    setDecision("confirmed");
  }, [onPluFileChange, onUseAutoDocChange]);

  const handleUnconfirm = useCallback(() => {
    if (hasManualFile) {
      onPluFileChange(null);
    }
    if (hasAutoDoc) {
      onUseAutoDocChange(true);
      setDecision("pending");
    } else {
      setDecision("manual_upload");
    }
  }, [hasManualFile, hasAutoDoc, onPluFileChange, onUseAutoDocChange]);

  const handleLotissementUpload = useCallback((f: File) => {
    const err = validateFile(f);
    if (err) { setLotError(err); return; }
    setLotError(null);
    onLotissementChange(f);
  }, [onLotissementChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileUpload(f);
  }, [handleFileUpload]);

  const dragOverHandler = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <section
      className="rounded-2xl border-2 border-sky-200 bg-gradient-to-br from-sky-50/80 via-white to-indigo-50/60 shadow-sm overflow-hidden"
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="px-5 py-3.5 bg-gradient-to-r from-sky-100/80 to-indigo-100/60 border-b border-sky-200/80">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-sky-500/15 shrink-0">
            <Shield className="w-4.5 h-4.5 text-sky-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              {isEn ? "Regulatory Document Gate" : "Porte documentaire réglementaire"}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {isEn
                ? "Verify documents before launching AI analysis"
                : "Vérifiez les documents avant de lancer l'analyse IA"}
            </p>
          </div>
          {/* Gate status badge */}
          <div className="ml-auto">
            {isReady ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                {isEn ? "Validated" : "Validé"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-[11px] font-semibold">
                <ShieldAlert className="w-3.5 h-3.5" />
                {isEn ? "Pending" : "En attente"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFileUpload(f);
          e.target.value = "";
        }}
      />

      <div className="p-5 space-y-4">
        {/* ═══════════════════════════════════════════════════════════════════
             SECTION 1: PLU REGULATION — PUBLIC
           ═══════════════════════════════════════════════════════════════════ */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-100 flex items-center gap-2">
            <Landmark className="w-4 h-4 text-sky-600" />
            <span className="text-xs font-bold text-slate-800">
              {isEn ? "Official PLU Regulation" : "Règlement PLU officiel"}
            </span>
            <span className="ml-auto text-[9px] uppercase tracking-wider font-bold text-sky-600 bg-sky-100 px-1.5 py-0.5 rounded">
              PUBLIC
            </span>
          </div>

          <div className="px-4 py-3.5">
            {/* ════ STATE: PENDING — Auto-detected, awaiting user decision ════ */}
            {decision === "pending" && hasAutoDoc && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  {/* Zone badge */}
                  {zoneType && (
                    <div className="flex items-center justify-center min-w-[2.5rem] h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white font-bold text-sm tracking-wide shadow-md shadow-sky-200/50 px-2">
                      {zoneType.toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {isEn ? "Regulation auto-detected" : "Règlement auto-détecté"}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {zoneType ? `Zone ${zoneType.toUpperCase()} — ` : ""}Géoportail de l&apos;Urbanisme
                    </p>
                  </div>
                </div>

                {/* Document preview row */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-50/60 border border-sky-100">
                  <Globe className="w-4 h-4 text-sky-500 shrink-0" />
                  <p className="text-xs font-medium text-slate-700 truncate flex-1">
                    {extractFilename(autoFetchedUrl!)}
                  </p>
                </div>

                {/* Action buttons */}
                <div className="grid grid-cols-3 gap-2">
                  <a
                    href={autoFetchedUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl
                               bg-white border-2 border-sky-200 text-xs font-semibold text-sky-700
                               hover:border-sky-400 hover:bg-sky-50/50 transition-all shadow-sm"
                  >
                    <FileDown className="w-4 h-4" />
                    {isEn ? "Download" : "Télécharger"}
                  </a>
                  <button
                    type="button"
                    onClick={handleStartReplace}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl
                               bg-white border-2 border-amber-200 text-xs font-semibold text-amber-700
                               hover:border-amber-400 hover:bg-amber-50/50 transition-all shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    {isEn ? "Replace" : "Remplacer"}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl
                               bg-sky-600 border-2 border-sky-600 text-xs font-bold text-white
                               hover:bg-sky-700 hover:border-sky-700 transition-all shadow-sm shadow-sky-200"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {isEn ? "Confirm" : "Confirmer"}
                  </button>
                </div>

                {/* Warning */}
                <p className="text-[10px] text-amber-600 font-medium flex items-start gap-1.5">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  {isEn
                    ? "You must confirm or replace the auto-detected regulation before launching the analysis."
                    : "Vous devez confirmer ou remplacer le règlement auto-détecté avant de lancer l'analyse."}
                </p>
              </div>
            )}

            {/* ════ STATE: PENDING — Zone detected but NO auto-doc URL ════ */}
            {decision === "pending" && !hasAutoDoc && zoneType && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center min-w-[2.5rem] h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white font-bold text-sm tracking-wide shadow-md shadow-sky-200/50 px-2">
                    {zoneType.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {isEn ? "Zone detected — No downloadable regulation" : "Zone détectée — Aucun règlement téléchargeable"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {isEn
                        ? "The GPU API did not return a downloadable PDF for this zone. Please upload the regulation manually."
                        : "L'API GPU n'a pas retourné de PDF téléchargeable pour cette zone. Veuillez importer le règlement manuellement."}
                    </p>
                  </div>
                </div>

                {/* Force manual upload */}
                <div
                  role="button"
                  tabIndex={0}
                  onDrop={handleDrop}
                  onDragOver={dragOverHandler}
                  onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
                  className={`flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed
                    transition-all cursor-pointer ${dragActive
                      ? "border-sky-500 bg-sky-100/60 scale-[1.01]"
                      : "border-sky-300 bg-white hover:border-sky-400 hover:bg-sky-50/50"
                    }`}
                >
                  <Upload className="w-6 h-6 text-sky-400" />
                  <p className="text-xs text-sky-700 font-semibold">
                    {isEn ? "Drop or click to upload the PLU regulation" : "Glissez-déposez ou cliquez pour importer le règlement PLU"}
                  </p>
                  <p className="text-[10px] text-sky-500">
                    PDF, DOC, DOCX {isEn ? "or" : "ou"} TXT — max 50 Mo
                  </p>
                </div>
              </div>
            )}

            {/* ════ STATE: MANUAL_UPLOAD — No zone, no auto doc ════ */}
            {decision === "manual_upload" && !hasManualFile && (
              <div className="space-y-3">
                {!zoneType && (
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <p className="text-xs text-slate-600">
                      {isEn
                        ? "No PLU zone detected for this location. Upload the regulation manually."
                        : "Aucune zone PLU détectée. Importez le règlement manuellement."}
                    </p>
                  </div>
                )}
                <div
                  role="button"
                  tabIndex={0}
                  onDrop={handleDrop}
                  onDragOver={dragOverHandler}
                  onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
                  className={`flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed
                    transition-all cursor-pointer ${dragActive
                      ? "border-sky-500 bg-sky-100/60 scale-[1.01]"
                      : "border-slate-300 bg-white hover:border-sky-400 hover:bg-sky-50/30"
                    }`}
                >
                  <Upload className="w-7 h-7 text-slate-300" />
                  <p className="text-sm text-slate-600 font-semibold">
                    {isEn ? "Drop the PLU regulation PDF here" : "Glisser le PDF du règlement PLU ici"}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {isEn
                      ? "AI will analyze this document to extract zoning rules"
                      : "L'IA analysera ce document pour extraire les règles de zone"}
                  </p>
                </div>
              </div>
            )}

            {/* ════ STATE: REPLACING — Drop zone with cancel ════ */}
            {decision === "replacing" && (
              <div className="space-y-3">
                <div
                  role="button"
                  tabIndex={0}
                  onDrop={handleDrop}
                  onDragOver={dragOverHandler}
                  onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
                  className={`flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed
                    transition-all cursor-pointer ${dragActive
                      ? "border-amber-500 bg-amber-100/60 scale-[1.01]"
                      : "border-amber-300 bg-white hover:border-amber-400 hover:bg-amber-50/50"
                    }`}
                >
                  <Upload className="w-7 h-7 text-amber-400" />
                  <p className="text-sm text-amber-700 font-semibold">
                    {isEn ? "Drop your replacement regulation PDF" : "Glisser votre PDF de remplacement ici"}
                  </p>
                  <p className="text-[10px] text-amber-500">
                    PDF, DOC, DOCX {isEn ? "or" : "ou"} TXT — max 50 Mo
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

            {/* ════ STATE: CONFIRMED — Success card ════ */}
            {decision === "confirmed" && (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">
                      {isEn ? "Document verified" : "Document vérifié"}
                    </span>
                    {hasManualFile && (
                      <span className="text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded uppercase">
                        {isEn ? "Replaced" : "Remplacé"}
                      </span>
                    )}
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
                <div className="flex items-center gap-1.5 shrink-0">
                  {(hasAutoDoc || hasManualFile) && (
                    <a
                      href={hasManualFile ? URL.createObjectURL(pluFile!) : autoFetchedUrl!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-all"
                      title={isEn ? "View document" : "Voir le document"}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={handleUnconfirm}
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/80 transition-all"
                    title={isEn ? "Undo confirmation" : "Annuler la confirmation"}
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* File error */}
            {fileError && (
              <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                {fileError}
              </p>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
             SECTION 2: LOTISSEMENT — PRIVÉ (only visible after confirmed)
           ═══════════════════════════════════════════════════════════════════ */}
        {isReady && (
          <div className="rounded-xl border border-dashed border-violet-300 bg-violet-50/30 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowLotDropzone(!showLotDropzone)}
              className="w-full px-4 py-2.5 flex items-center gap-2 text-left hover:bg-violet-50/60 transition-colors"
            >
              <Building2 className="w-4 h-4 text-violet-600" />
              <span className="text-xs font-bold text-violet-800">
                {isEn ? "Add subdivision rules (lotissement)" : "Ajouter un règlement de lotissement"}
              </span>
              <span className="ml-1 text-[9px] uppercase tracking-wider font-bold text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded">
                {isEn ? "PRIVATE" : "PRIVÉ"}
              </span>
              <span className="ml-auto text-xs text-violet-500">
                {showLotDropzone ? "▲" : "▼"}
              </span>
            </button>

            {showLotDropzone && (
              <div className="px-4 pb-4 pt-1">
                <p className="text-[10px] text-violet-700 mb-2">
                  <Info className="w-3 h-3 inline mr-0.5 -mt-0.5" />
                  {isEn
                    ? "If your plot is in a subdivision, upload the private subdivision rules. This document will be analyzed in addition to the PLU regulation."
                    : "Si votre terrain est dans un lotissement, importez le règlement privé. Ce document sera analysé en complément du règlement PLU."}
                </p>

                {!lotissementFile ? (
                  <div
                    role="button"
                    tabIndex={0}
                    onDragOver={dragOverHandler}
                    onDrop={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      const f = e.dataTransfer.files?.[0];
                      if (f) handleLotissementUpload(f);
                    }}
                    onClick={() => lotissementInputRef.current?.click()}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") lotissementInputRef.current?.click(); }}
                    className="flex flex-col items-center justify-center gap-1.5 py-6 rounded-xl border-2 border-dashed
                      border-violet-300 bg-white hover:border-violet-400 hover:bg-violet-50/50 transition-all cursor-pointer"
                  >
                    <FilePlus className="w-6 h-6 text-violet-400" />
                    <p className="text-xs text-violet-700 font-medium">
                      {isEn ? "Drop or click to upload" : "Glissez-déposez ou cliquez"}
                    </p>
                    <p className="text-[10px] text-violet-500">
                      PDF, DOC, DOCX {isEn ? "or" : "ou"} TXT — max 50 Mo
                    </p>
                    <input
                      ref={lotissementInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleLotissementUpload(f);
                        e.target.value = "";
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-violet-100/60 border border-violet-300">
                    <FileText className="w-4 h-4 text-violet-700 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-violet-900 truncate">{lotissementFile.name}</p>
                      <p className="text-[10px] text-violet-600">{formatFileSize(lotissementFile.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { onLotissementChange(null); setLotError(null); }}
                      className="p-1 rounded-lg hover:bg-violet-200 text-violet-500 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                {lotError && (
                  <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {lotError}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
             DOCUMENT SUMMARY — what will be sent to the AI
           ═══════════════════════════════════════════════════════════════════ */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
          <h4 className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">
            {isEn ? "Documents for analysis" : "Documents à analyser"}
          </h4>

          {!isReady && !hasManualFile && !hasAutoDoc ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <p className="text-[11px] text-red-700">
                {isEn
                  ? 'No PLU regulation available. Upload a document via "Replace" to continue.'
                  : 'Aucun règlement PLU disponible. Importez un document via « Remplacer » pour continuer.'}
              </p>
            </div>
          ) : !isReady ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <p className="text-[11px] text-amber-700">
                {isEn
                  ? "Please confirm the regulation document above to unlock the analysis."
                  : "Confirmez le document réglementaire ci-dessus pour débloquer l'analyse."}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {/* Primary regulation */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-100">
                <div className="w-6 h-6 rounded-md flex items-center justify-center bg-sky-100 text-sky-600 shrink-0">
                  <Landmark className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-800 truncate">
                    {hasManualFile ? pluFile!.name : hasAutoDoc ? extractFilename(autoFetchedUrl!) : "—"}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {hasManualFile ? (
                      <span className="px-1 py-0.5 rounded bg-amber-100 text-amber-700 font-bold">
                        {isEn ? "UPLOAD" : "REMPLACEMENT"}
                      </span>
                    ) : (
                      <span className="px-1 py-0.5 rounded bg-sky-100 text-sky-700 font-bold">
                        GPU OFFICIEL
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Lotissement */}
              {lotissementFile && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-100">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center bg-violet-100 text-violet-600 shrink-0">
                    <Building2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-800 truncate">{lotissementFile.name}</p>
                    <p className="text-[10px] text-slate-400">
                      <span className="px-1 py-0.5 rounded bg-violet-100 text-violet-700 font-bold">
                        LOTISSEMENT
                      </span>
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Help text ────────────────────────────────────────────────────── */}
        <p className="text-[10px] text-slate-400 leading-relaxed">
          {isEn
            ? "The detected PLU may not be the only applicable regulation. After confirmation, you can add a subdivision (lotissement) regulation."
            : "Le PLU détecté n'est pas forcément le seul règlement applicable. Après confirmation, vous pouvez ajouter un règlement de lotissement."}
        </p>
      </div>
    </section>
  );
}
