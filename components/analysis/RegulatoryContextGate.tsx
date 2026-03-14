"use client";

/**
 * RegulatoryContextGate — Pre-Analysis Document Management Gate
 *
 * CLIENT MANDATE:
 * "When a PLU zone is detected, the system must retrieve the written regulation
 *  and make it downloadable. Before launching PLU analysis, the user MUST be able
 *  to download the detected regulation, add subdivision rules (lotissement), or
 *  replace the detected regulation with an uploaded document."
 *
 * This component sits directly above the "Launch AI Analysis" button on the
 * PLU Analysis page. It implements a strict gate: the Launch button is
 * DISABLED until the user has validated the regulation documents.
 *
 * STATES:
 *  1. Default — Show detected zone + "Download Official Regulation" button
 *  2. Override — File dropzone to replace the official PLU regulation
 *  3. Addition — File dropzone for subdivision rules (Règlement de Lotissement)
 *
 * OUTPUT:
 *  Emits a `RegulatoryDocumentBundle` via `onDocumentsReady` callback.
 *  This bundle contains an array of documents (official link OR uploaded files)
 *  plus a boolean `isReady` that gates the parent's Launch button.
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  FileDown,
  Upload,
  FileText,
  Shield,
  ShieldCheck,
  ShieldAlert,
  X,
  CheckCircle2,
  AlertTriangle,
  Landmark,
  Building2,
  FilePlus,
  Replace,
  ExternalLink,
  Loader2,
  Info,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

export type DocumentSource = "gpu_official" | "user_override" | "user_subdivision";

export interface RegulatoryDocument {
  /** Unique identifier for this document */
  id: string;
  /** Display name */
  name: string;
  /** Source classification */
  source: DocumentSource;
  /** URL for official docs, or blob URL for uploaded files */
  url: string | null;
  /** File object if user-uploaded */
  file: File | null;
  /** MIME type */
  mimeType: string;
  /** Size in bytes */
  size: number;
  /** Visual category for the UI */
  category: "plu_regulation" | "subdivision_rules";
}

export interface RegulatoryDocumentBundle {
  /** Array of all documents to submit for analysis */
  documents: RegulatoryDocument[];
  /** The primary PLU regulation (official or overridden) */
  primaryRegulation: RegulatoryDocument | null;
  /** Optional subdivision / lotissement rules */
  subdivisionRules: RegulatoryDocument | null;
  /** TRUE only when at least a primary regulation exists */
  isReady: boolean;
  /** Whether the official regulation was overridden by upload */
  wasOverridden: boolean;
}

export interface RegulatoryContextGateProps {
  /** Zone name detected from GPU (e.g. "UB") */
  zoneName: string | null;
  /** Full zone label (e.g. "Zone Urbaine Mixte") */
  zoneLabel?: string | null;
  /** URL to the official regulation PDF from GPU */
  pdfUrl: string | null;
  /** GPU document type (PLU, PLUi, CC, ...) */
  documentType?: string | null;
  /** Whether GPU data is still loading */
  isLoading?: boolean;
  /** Callback when the document bundle changes — parent uses this to gate Launch btn */
  onDocumentsReady: (bundle: RegulatoryDocumentBundle) => void;
  /** Optional: disable the entire component */
  disabled?: boolean;
}

// ─── File validation ────────────────────────────────────────────────────────

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

// ─── Component ──────────────────────────────────────────────────────────────

export default function RegulatoryContextGate({
  zoneName,
  zoneLabel,
  pdfUrl,
  documentType,
  isLoading = false,
  onDocumentsReady,
  disabled = false,
}: RegulatoryContextGateProps) {
  // ── State ──────────────────────────────────────────────────────────────
  const [overrideFile, setOverrideFile] = useState<File | null>(null);
  const [subdivisionFile, setSubdivisionFile] = useState<File | null>(null);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [subdivisionError, setSubdivisionError] = useState<string | null>(null);
  const [showOverrideDropzone, setShowOverrideDropzone] = useState(false);
  const [showSubdivisionDropzone, setShowSubdivisionDropzone] = useState(false);
  const [overrideDragActive, setOverrideDragActive] = useState(false);
  const [subdivisionDragActive, setSubdivisionDragActive] = useState(false);
  const [isGateConfirmed, setIsGateConfirmed] = useState(false);

  const overrideInputRef = useRef<HTMLInputElement>(null);
  const subdivisionInputRef = useRef<HTMLInputElement>(null);

  // ── Build the bundle & emit on every change ────────────────────────────

  const bundle: RegulatoryDocumentBundle = useMemo(() => {
    const documents: RegulatoryDocument[] = [];
    let primaryRegulation: RegulatoryDocument | null = null;
    let subdivisionRules: RegulatoryDocument | null = null;
    const wasOverridden = !!overrideFile;

    // Primary regulation
    if (overrideFile) {
      const doc: RegulatoryDocument = {
        id: `override-${overrideFile.name}`,
        name: overrideFile.name,
        source: "user_override",
        url: URL.createObjectURL(overrideFile),
        file: overrideFile,
        mimeType: overrideFile.type,
        size: overrideFile.size,
        category: "plu_regulation",
      };
      primaryRegulation = doc;
      documents.push(doc);
    } else if (pdfUrl && zoneName) {
      const doc: RegulatoryDocument = {
        id: `gpu-${zoneName}`,
        name: `Règlement ${documentType ?? "PLU"} — Zone ${zoneName}`,
        source: "gpu_official",
        url: pdfUrl,
        file: null,
        mimeType: "application/pdf",
        size: 0,
        category: "plu_regulation",
      };
      primaryRegulation = doc;
      documents.push(doc);
    }

    // Subdivision rules
    if (subdivisionFile) {
      const doc: RegulatoryDocument = {
        id: `subdivision-${subdivisionFile.name}`,
        name: subdivisionFile.name,
        source: "user_subdivision",
        url: URL.createObjectURL(subdivisionFile),
        file: subdivisionFile,
        mimeType: subdivisionFile.type,
        size: subdivisionFile.size,
        category: "subdivision_rules",
      };
      subdivisionRules = doc;
      documents.push(doc);
    }

    const isReady = !!primaryRegulation && isGateConfirmed;

    return { documents, primaryRegulation, subdivisionRules, isReady, wasOverridden };
  }, [overrideFile, subdivisionFile, pdfUrl, zoneName, documentType, isGateConfirmed]);

  useEffect(() => {
    onDocumentsReady(bundle);
  }, [bundle, onDocumentsReady]);

  // ── File drop handlers ─────────────────────────────────────────────────

  const handleOverrideDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setOverrideDragActive(false);
      if (disabled) return;
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      const err = validateFile(file);
      if (err) { setOverrideError(err); return; }
      setOverrideError(null);
      setOverrideFile(file);
    },
    [disabled],
  );

  const handleSubdivisionDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setSubdivisionDragActive(false);
      if (disabled) return;
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      const err = validateFile(file);
      if (err) { setSubdivisionError(err); return; }
      setSubdivisionError(null);
      setSubdivisionFile(file);
    },
    [disabled],
  );

  const handleOverrideSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
      const file = e.target.files?.[0];
      if (!file) return;
      const err = validateFile(file);
      if (err) { setOverrideError(err); return; }
      setOverrideError(null);
      setOverrideFile(file);
    },
    [disabled],
  );

  const handleSubdivisionSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
      const file = e.target.files?.[0];
      if (!file) return;
      const err = validateFile(file);
      if (err) { setSubdivisionError(err); return; }
      setSubdivisionError(null);
      setSubdivisionFile(file);
    },
    [disabled],
  );

  const dragOverHandler = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // ── Auto-confirm when user has a primary regulation source ─────────────
  const hasPrimarySource = !!(overrideFile || (pdfUrl && zoneName));

  // ── Render ─────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 animate-pulse">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
          <span className="text-sm text-slate-500">Détection de la zone PLU en cours…</span>
        </div>
      </div>
    );
  }

  return (
    <section
      className="rounded-2xl border-2 border-sky-200 bg-gradient-to-br from-sky-50/80 via-white to-indigo-50/60 shadow-sm overflow-hidden"
      style={{ animation: "slide-up 0.4s ease-out" }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="px-6 py-4 bg-gradient-to-r from-sky-100/80 to-indigo-100/60 border-b border-sky-200/80">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-sky-500/15 shrink-0">
            <Shield className="w-5 h-5 text-sky-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900 tracking-tight">
              Porte documentaire réglementaire
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Vérifiez les documents avant de lancer l&apos;analyse IA
            </p>
          </div>
          {/* Gate status badge */}
          <div className="ml-auto">
            {isGateConfirmed ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                Validé
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                <ShieldAlert className="w-3.5 h-3.5" />
                En attente
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* ── STATE 1: Detected Zone + Download ────────────────────────── */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center gap-2">
            <Landmark className="w-4 h-4 text-sky-600" />
            <span className="text-sm font-semibold text-slate-800">
              Règlement PLU officiel
            </span>
            <span className="ml-auto text-[10px] uppercase tracking-wider font-semibold text-sky-600 bg-sky-100 px-2 py-0.5 rounded-md">
              PUBLIC
            </span>
          </div>

          <div className="px-5 py-4">
            {zoneName ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                {/* Zone badge */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center justify-center min-w-[3rem] h-12 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white font-bold text-lg tracking-wide shadow-md shadow-sky-200/50">
                    {zoneName}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {zoneLabel || `Zone ${zoneName}`}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {documentType ? `${documentType} — ` : ""}
                      {overrideFile ? (
                        <span className="text-amber-600 font-medium">Remplacé par votre document</span>
                      ) : (
                        "Document officiel Géoportail de l'Urbanisme"
                      )}
                    </p>
                  </div>
                </div>

                {/* Download / external link */}
                <div className="sm:ml-auto flex items-center gap-2 shrink-0">
                  {pdfUrl && !overrideFile && (
                    <a
                      href={pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-all shadow-sm shadow-sky-200/50 hover:shadow-md hover:shadow-sky-300/50 active:scale-[0.98]"
                    >
                      <FileDown className="w-4 h-4" />
                      Télécharger le règlement
                    </a>
                  )}
                  {overrideFile && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200">
                      <FileText className="w-4 h-4 text-amber-600" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-amber-900 truncate max-w-[200px]">
                          {overrideFile.name}
                        </p>
                        <p className="text-[10px] text-amber-600">
                          {formatFileSize(overrideFile.size)}
                        </p>
                      </div>
                      <button
                        onClick={() => { setOverrideFile(null); setOverrideError(null); setIsGateConfirmed(false); }}
                        className="ml-1 p-1 rounded-lg hover:bg-amber-200/50 text-amber-500 transition-colors"
                        title="Retirer et revenir au document officiel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 py-2">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-800">Aucune zone PLU détectée</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Importez votre règlement ci-dessous ou vérifiez les coordonnées du terrain.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── STATE 2: Override Upload ─────────────────────────────────── */}
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/40 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowOverrideDropzone(!showOverrideDropzone)}
            disabled={disabled}
            className="w-full px-5 py-3 flex items-center gap-2 text-left hover:bg-amber-50/80 transition-colors disabled:opacity-50"
          >
            <Replace className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-800">
              Remplacer le règlement PLU détecté
            </span>
            <span className="ml-auto text-xs text-amber-500">
              {showOverrideDropzone ? "▲ Masquer" : "▼ Ouvrir"}
            </span>
          </button>

          {showOverrideDropzone && (
            <div className="px-5 pb-4 pt-1">
              <p className="text-xs text-amber-700 mb-3">
                <Info className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                Si le document officiel ne correspond pas, importez votre propre règlement PLU.
                Ce fichier remplacera le document GPU pour l&apos;analyse IA.
              </p>
              {!overrideFile ? (
                <div
                  role="button"
                  tabIndex={0}
                  onDrop={handleOverrideDrop}
                  onDragOver={dragOverHandler}
                  onDragEnter={(e) => { e.preventDefault(); setOverrideDragActive(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setOverrideDragActive(false); }}
                  onClick={() => overrideInputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") overrideInputRef.current?.click(); }}
                  className={`
                    flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed
                    transition-all cursor-pointer
                    ${overrideDragActive
                      ? "border-amber-500 bg-amber-100/60 scale-[1.01]"
                      : "border-amber-300 bg-white hover:border-amber-400 hover:bg-amber-50/50"
                    }
                  `}
                >
                  <Upload className="w-7 h-7 text-amber-400" />
                  <p className="text-sm text-amber-700 font-medium">
                    Glissez-déposez ou cliquez pour importer
                  </p>
                  <p className="text-[11px] text-amber-500">
                    PDF, DOC, DOCX ou TXT — max 50 Mo
                  </p>
                  <input
                    ref={overrideInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={handleOverrideSelect}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-100/60 border border-amber-300">
                  <FileText className="w-5 h-5 text-amber-700 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-amber-900 truncate">{overrideFile.name}</p>
                    <p className="text-xs text-amber-600">{formatFileSize(overrideFile.size)}</p>
                  </div>
                  <button
                    onClick={() => { setOverrideFile(null); setOverrideError(null); setIsGateConfirmed(false); }}
                    className="p-1.5 rounded-lg hover:bg-amber-200 text-amber-500 transition-colors"
                    title="Retirer ce fichier"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              {overrideError && (
                <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {overrideError}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── STATE 3: Subdivision Rules ───────────────────────────────── */}
        <div className="rounded-xl border border-dashed border-violet-300 bg-violet-50/30 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowSubdivisionDropzone(!showSubdivisionDropzone)}
            disabled={disabled}
            className="w-full px-5 py-3 flex items-center gap-2 text-left hover:bg-violet-50/60 transition-colors disabled:opacity-50"
          >
            <Building2 className="w-4 h-4 text-violet-600" />
            <span className="text-sm font-semibold text-violet-800">
              Ajouter un règlement de lotissement
            </span>
            <span className="ml-1 text-[10px] uppercase tracking-wider font-semibold text-violet-600 bg-violet-100 px-2 py-0.5 rounded-md">
              PRIVÉ
            </span>
            <span className="ml-auto text-xs text-violet-500">
              {showSubdivisionDropzone ? "▲ Masquer" : "▼ Ouvrir"}
            </span>
          </button>

          {showSubdivisionDropzone && (
            <div className="px-5 pb-4 pt-1">
              <p className="text-xs text-violet-700 mb-3">
                <Info className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                Si votre terrain est dans un lotissement, importez le règlement privé du lotissement.
                Ce document sera analysé <strong>en complément</strong> du règlement PLU.
              </p>
              {!subdivisionFile ? (
                <div
                  role="button"
                  tabIndex={0}
                  onDrop={handleSubdivisionDrop}
                  onDragOver={dragOverHandler}
                  onDragEnter={(e) => { e.preventDefault(); setSubdivisionDragActive(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setSubdivisionDragActive(false); }}
                  onClick={() => subdivisionInputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") subdivisionInputRef.current?.click(); }}
                  className={`
                    flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed
                    transition-all cursor-pointer
                    ${subdivisionDragActive
                      ? "border-violet-500 bg-violet-100/60 scale-[1.01]"
                      : "border-violet-300 bg-white hover:border-violet-400 hover:bg-violet-50/50"
                    }
                  `}
                >
                  <FilePlus className="w-7 h-7 text-violet-400" />
                  <p className="text-sm text-violet-700 font-medium">
                    Glissez-déposez ou cliquez pour importer
                  </p>
                  <p className="text-[11px] text-violet-500">
                    PDF, DOC, DOCX ou TXT — max 50 Mo
                  </p>
                  <input
                    ref={subdivisionInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={handleSubdivisionSelect}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-violet-100/60 border border-violet-300">
                  <FileText className="w-5 h-5 text-violet-700 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-violet-900 truncate">{subdivisionFile.name}</p>
                    <p className="text-xs text-violet-600">{formatFileSize(subdivisionFile.size)}</p>
                  </div>
                  <button
                    onClick={() => { setSubdivisionFile(null); setSubdivisionError(null); }}
                    className="p-1.5 rounded-lg hover:bg-violet-200 text-violet-500 transition-colors"
                    title="Retirer ce fichier"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              {subdivisionError && (
                <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {subdivisionError}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Document Summary & Confirm Gate ──────────────────────────── */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-5 py-4">
          <h4 className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-3">
            Documents à analyser
          </h4>

          {bundle.documents.length === 0 ? (
            <p className="text-sm text-slate-400 italic">
              Aucun document disponible — importez un règlement pour continuer.
            </p>
          ) : (
            <div className="space-y-2 mb-4">
              {bundle.documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white border border-slate-100"
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      doc.category === "plu_regulation"
                        ? "bg-sky-100 text-sky-600"
                        : "bg-violet-100 text-violet-600"
                    }`}
                  >
                    {doc.category === "plu_regulation" ? (
                      <Landmark className="w-4 h-4" />
                    ) : (
                      <Building2 className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{doc.name}</p>
                    <p className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                      {doc.source === "gpu_official" && (
                        <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 font-semibold">
                          GPU OFFICIEL
                        </span>
                      )}
                      {doc.source === "user_override" && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">
                          REMPLACEMENT
                        </span>
                      )}
                      {doc.source === "user_subdivision" && (
                        <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold">
                          LOTISSEMENT
                        </span>
                      )}
                      {doc.size > 0 && (
                        <span className="text-slate-400">{formatFileSize(doc.size)}</span>
                      )}
                    </p>
                  </div>
                  {doc.url && (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-sky-600 transition-colors"
                      title="Ouvrir le document"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Gate confirmation button */}
          {hasPrimarySource && !isGateConfirmed && (
            <button
              type="button"
              onClick={() => setIsGateConfirmed(true)}
              disabled={disabled}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-semibold hover:from-emerald-600 hover:to-teal-700 transition-all shadow-sm shadow-emerald-200/50 hover:shadow-md active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4" />
              Confirmer les documents et autoriser l&apos;analyse
            </button>
          )}

          {isGateConfirmed && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-800">
                  Documents validés — l&apos;analyse IA peut être lancée
                </p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  {bundle.documents.length} document{bundle.documents.length > 1 ? "s" : ""} prêt{bundle.documents.length > 1 ? "s" : ""}
                  {bundle.wasOverridden && " (règlement officiel remplacé)"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsGateConfirmed(false)}
                className="ml-auto text-xs text-emerald-600 hover:text-emerald-800 underline"
              >
                Modifier
              </button>
            </div>
          )}

          {!hasPrimarySource && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <p className="text-xs text-red-700">
                Aucun règlement PLU disponible. Importez un document via «&nbsp;Remplacer le règlement PLU détecté&nbsp;» pour continuer.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
