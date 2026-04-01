"use client";

import React from "react";
import { Plus, Undo2, Redo2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type MinimalEditorToolbarProps = {
  isElementsOpen: boolean;
  onToggleElements: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  canUndo: boolean;
  canRedo: boolean;
  canReset?: boolean;
  children?: React.ReactNode;
};

export default function MinimalEditorToolbar({
  isElementsOpen,
  onToggleElements,
  onUndo,
  onRedo,
  onReset,
  canUndo,
  canRedo,
  canReset = true,
  children,
}: MinimalEditorToolbarProps) {
  return (
    <div className="absolute left-1/2 bottom-5 z-40 -translate-x-1/2 pointer-events-none">
      {isElementsOpen && children ? (
        <div className="mb-3 pointer-events-auto rounded-2xl border border-white/30 bg-white/70 backdrop-blur-xl shadow-2xl p-2 min-w-[260px]">
          {children}
        </div>
      ) : null}

      <div className="pointer-events-auto flex items-center gap-1.5 rounded-2xl border border-white/30 bg-white/70 backdrop-blur-xl shadow-2xl p-1.5">
        <button
          type="button"
          onClick={onToggleElements}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
            isElementsOpen
              ? "bg-blue-500 text-white"
              : "text-slate-700 hover:bg-slate-100/80"
          )}
          title="Add elements"
        >
          <Plus className="h-4 w-4" />
          <span>Elements</span>
        </button>

        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100/80 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Undo"
        >
          <Undo2 className="h-4 w-4" />
          <span>Undo</span>
        </button>

        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100/80 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Redo"
        >
          <Redo2 className="h-4 w-4" />
          <span>Redo</span>
        </button>

        <button
          type="button"
          onClick={onReset}
          disabled={!canReset}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100/80 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Reset"
        >
          <RotateCcw className="h-4 w-4" />
          <span>Reset</span>
        </button>
      </div>
    </div>
  );
}
