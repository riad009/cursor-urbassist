"use client";

import React, { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { apiLogger, type ApiLogEntry } from "@/lib/api-logger";
import { X, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronRight, Copy, Check } from "lucide-react";

/**
 * DataDebugModal — Shows all API calls captured by the apiLogger.
 *
 * Features:
 *   - Real-time API call list with status, duration, method
 *   - Expandable request/response body viewers
 *   - Copy-to-clipboard for payloads
 *   - Toggle logger on/off
 *   - Clear logs
 */

// Stable empty array for useSyncExternalStore server snapshot
const EMPTY_LOGS: ApiLogEntry[] = [];

const STATUS_COLORS: Record<string, string> = {
  "2": "bg-green-100 text-green-700 border-green-200",
  "3": "bg-blue-100 text-blue-700 border-blue-200",
  "4": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "5": "bg-red-100 text-red-700 border-red-200",
  null: "bg-gray-100 text-gray-500 border-gray-200",
};

function getStatusColor(status: number | null): string {
  if (status === null) return STATUS_COLORS["null"];
  const key = String(Math.floor(status / 100));
  return STATUS_COLORS[key] || STATUS_COLORS["null"];
}

const METHOD_COLORS: Record<string, string> = {
  GET: "text-emerald-600",
  POST: "text-blue-600",
  PUT: "text-amber-600",
  PATCH: "text-orange-600",
  DELETE: "text-red-600",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded hover:bg-slate-200 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-green-600" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-slate-400" />
      )}
    </button>
  );
}

function LogEntry({ entry }: { entry: ApiLogEntry }) {
  const [expanded, setExpanded] = useState(false);

  const reqStr = entry.requestBody
    ? JSON.stringify(entry.requestBody, null, 2)
    : null;
  const resStr = entry.responseBody
    ? JSON.stringify(entry.responseBody, null, 2)
    : null;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      {/* Header row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
        )}

        {/* Method */}
        <span
          className={`text-xs font-bold w-12 flex-shrink-0 ${
            METHOD_COLORS[entry.method] || "text-slate-600"
          }`}
        >
          {entry.method}
        </span>

        {/* Status badge */}
        <span
          className={`text-xs font-mono px-1.5 py-0.5 rounded border flex-shrink-0 ${getStatusColor(
            entry.status
          )}`}
        >
          {entry.status ?? "ERR"}
        </span>

        {/* URL */}
        <span className="text-sm font-mono text-slate-700 truncate flex-1 min-w-0">
          {entry.url}
        </span>

        {/* Duration */}
        <span className="text-xs text-slate-400 flex-shrink-0 tabular-nums">
          {entry.duration}ms
        </span>

        {/* Size */}
        <span className="text-xs text-slate-400 flex-shrink-0 tabular-nums w-16 text-right">
          {entry.responseSize > 1024
            ? `${(entry.responseSize / 1024).toFixed(1)}KB`
            : `${entry.responseSize}B`}
        </span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-3">
          {/* Timestamp */}
          <div className="text-xs text-slate-400">
            {new Date(entry.timestamp).toLocaleTimeString()}
          </div>

          {/* Error */}
          {entry.error && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded border border-red-200">
              ❌ {entry.error}
            </div>
          )}

          {/* Request Body */}
          {reqStr && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Request Body
                </span>
                <CopyButton text={reqStr} />
              </div>
              <pre className="text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto max-h-60 whitespace-pre-wrap break-all">
                {reqStr.length > 3000 ? reqStr.slice(0, 3000) + "\n... (truncated)" : reqStr}
              </pre>
            </div>
          )}

          {/* Response Body */}
          {resStr && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Response Body
                </span>
                <CopyButton text={resStr} />
              </div>
              <pre className="text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto max-h-80 whitespace-pre-wrap break-all">
                {resStr.length > 5000 ? resStr.slice(0, 5000) + "\n... (truncated)" : resStr}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DataDebugModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // Subscribe to apiLogger changes
  const logs = useSyncExternalStore(
    (cb) => apiLogger.subscribe(cb),
    () => apiLogger.getLogs(),
    () => EMPTY_LOGS // server snapshot — must be referentially stable
  );

  const [isEnabled, setIsEnabled] = useState(false);

  // Enable logger on mount
  useEffect(() => {
    apiLogger.enable();
    setIsEnabled(true);
  }, []);

  const toggleLogger = useCallback(() => {
    if (apiLogger.isEnabled()) {
      apiLogger.disable();
      setIsEnabled(false);
    } else {
      apiLogger.enable();
      setIsEnabled(true);
    }
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-[90vw] max-w-4xl max-h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              🔍 API Data Inspector
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {logs.length} API calls captured • All /api/* requests logged in real-time
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle */}
            <button
              onClick={toggleLogger}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                isEnabled
                  ? "bg-green-100 text-green-700 border border-green-200"
                  : "bg-slate-100 text-slate-500 border border-slate-200"
              }`}
            >
              {isEnabled ? (
                <ToggleRight className="w-4 h-4" />
              ) : (
                <ToggleLeft className="w-4 h-4" />
              )}
              {isEnabled ? "Logging ON" : "Logging OFF"}
            </button>

            {/* Clear */}
            <button
              onClick={() => apiLogger.clear()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600 border border-slate-200 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        {/* API Flow Legend */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-2 text-xs">
          <span className="font-semibold text-slate-600">Data Flow:</span>
          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">/api/address/lookup</span>
          <span className="text-slate-400">→</span>
          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100">/api/cadastre/lookup</span>
          <span className="text-slate-400">→</span>
          <span className="px-2 py-0.5 rounded bg-violet-50 text-violet-600 border border-violet-100">/api/plu-detection</span>
          <span className="text-slate-400">→</span>
          <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-100">/api/parcel-zones</span>
          <span className="text-slate-400">→</span>
          <span className="px-2 py-0.5 rounded bg-pink-50 text-pink-600 border border-pink-100">/api/projects</span>
          <span className="text-slate-400">→</span>
          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">/api/auth/me</span>
        </div>

        {/* Log list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <div className="text-4xl mb-3">📡</div>
              <p className="text-sm font-medium">No API calls captured yet</p>
              <p className="text-xs mt-1">
                Navigate to <strong>/projects/new</strong>, select an address & parcels to see data flow
              </p>
            </div>
          ) : (
            [...logs].reverse().map((entry) => (
              <LogEntry key={entry.id} entry={entry} />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>
            💡 Click any row to expand and see full request/response data
          </span>
          <span className="tabular-nums">
            {logs.filter((l) => l.status && l.status >= 200 && l.status < 300).length} OK •{" "}
            {logs.filter((l) => l.status && l.status >= 400).length} Errors •{" "}
            {logs.filter((l) => l.error).length} Failed
          </span>
        </div>
      </div>
    </div>
  );
}
