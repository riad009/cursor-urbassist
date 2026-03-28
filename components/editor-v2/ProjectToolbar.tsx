"use client";

/**
 * ProjectToolbar — Minimal Floating Tool Palette (Phase 1 Refactor)
 *
 * ▸ 5 core tools visible at all times: Sélection, Maison, Piscine, Jardin, Terrasse
 * ▸ 1 expandable "Plus" drawer revealing secondary tools
 * ▸ Glassmorphism pill design — premium Apple-like aesthetic
 * ▸ React.memo'd — ONLY re-renders when activeTool changes (zero canvas impact)
 */

import React, { memo, useState, useCallback } from "react";
import {
  MousePointer2,
  Home,
  Waves,
  TreePine,
  LayoutGrid,
  Plus,
  X,
  Car,
  Zap,
  Pentagon,
} from "lucide-react";
import {
  useActiveToolSlice,
  type EditorTool,
} from "@/store/useUrbAssistProjectStore";

// ─── Tool Definitions ─────────────────────────────────────────────────────────

interface ToolDef {
  id: EditorTool;
  label: string;
  Icon: React.ElementType;
  color: string;        // active tint color
  dot: string;          // dot indicator color (Tailwind bg-*)
}

const PRIMARY_TOOLS: ToolDef[] = [
  { id: "select",  label: "Sélection", Icon: MousePointer2, color: "#64748b", dot: "bg-slate-400" },
  { id: "house",   label: "Maison",    Icon: Home,          color: "#2563eb", dot: "bg-blue-500"  },
  { id: "pool",    label: "Piscine",   Icon: Waves,         color: "#0891b2", dot: "bg-cyan-500"  },
  { id: "garden",  label: "Jardin",    Icon: TreePine,      color: "#16a34a", dot: "bg-green-500" },
  { id: "terrace", label: "Terrasse",  Icon: LayoutGrid,    color: "#d97706", dot: "bg-amber-500" },
];

const SECONDARY_TOOLS: ToolDef[] = [
  { id: "garage",  label: "Garage",    Icon: Car,      color: "#7c3aed", dot: "bg-violet-500" },
  { id: "parking", label: "Parking",   Icon: Car,      color: "#475569", dot: "bg-slate-500"  },
  { id: "access",  label: "Accès",     Icon: Zap,      color: "#ea580c", dot: "bg-orange-500" },
  { id: "vrd",     label: "Réseau",    Icon: Zap,      color: "#0f766e", dot: "bg-teal-500"   },
  { id: "freeform",label: "Libre",     Icon: Pentagon, color: "#9333ea", dot: "bg-purple-500" },
];

// ─── Single Tool Button ────────────────────────────────────────────────────────

interface ToolButtonProps {
  tool: ToolDef;
  isActive: boolean;
  onClick: (id: EditorTool) => void;
  compact?: boolean;
}

const ToolButton = memo(function ToolButton({ tool, isActive, onClick, compact }: ToolButtonProps) {
  const { id, label, Icon, color } = tool;

  return (
    <button
      key={id}
      onClick={() => onClick(id)}
      title={label}
      style={isActive ? { backgroundColor: color + "18", color } : undefined}
      className={`
        group relative flex flex-col items-center justify-center gap-1
        ${compact ? "w-11 h-11" : "w-14 h-14"}
        rounded-2xl transition-all duration-150
        ${isActive
          ? "shadow-sm ring-1 ring-inset"
          : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/80"
        }
      `}
    >
      {/* Active indicator dot */}
      {isActive && (
        <span
          className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}

      {React.createElement(Icon as React.ElementType<{ size: number; strokeWidth: number }>, { size: compact ? 18 : 20, strokeWidth: isActive ? 2.2 : 1.6 })}

      {!compact && (
        <span className="text-[9px] font-semibold tracking-wide leading-none" style={{ letterSpacing: "0.04em" }}>
          {label.toUpperCase()}
        </span>
      )}
    </button>
  );
});

// ─── Main Export ─────────────────────────────────────────────────────────────

const ProjectToolbar = memo(function ProjectToolbar() {
  const { activeTool, setActiveTool } = useActiveToolSlice();
  const [moreOpen, setMoreOpen] = useState(false);

  const handleTool = useCallback((id: EditorTool) => {
    setActiveTool(id);
    setMoreOpen(false);
  }, [setActiveTool]);

  const toggleMore = useCallback(() => setMoreOpen((o) => !o), []);

  const isSecondaryActive = SECONDARY_TOOLS.some((t) => t.id === activeTool);

  return (
    <div
      className="absolute left-4 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-2"
      style={{ pointerEvents: "auto" }}
    >
      {/* ── Main pill ── */}
      <div
        className="flex flex-col items-center gap-1 p-2 rounded-3xl shadow-2xl"
        style={{
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          border: "1px solid rgba(148,163,184,0.22)",
          boxShadow:
            "0 8px 32px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)",
        }}
      >
        {PRIMARY_TOOLS.map((tool) => (
          <ToolButton
            key={tool.id}
            tool={tool}
            isActive={activeTool === tool.id}
            onClick={handleTool}
          />
        ))}

        {/* Divider */}
        <div className="w-8 h-px bg-slate-200/80 my-1" />

        {/* More button */}
        <button
          onClick={toggleMore}
          title="Plus d'outils"
          className={`
            relative flex flex-col items-center justify-center gap-1 w-14 h-14 rounded-2xl
            transition-all duration-150
            ${moreOpen || isSecondaryActive
              ? "bg-slate-900 text-white"
              : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/80"
            }
          `}
        >
          {moreOpen
            ? <X size={20} strokeWidth={2} />
            : <Plus size={20} strokeWidth={1.6} />
          }
          <span className="text-[9px] font-semibold tracking-wide" style={{ letterSpacing: "0.04em" }}>
            {moreOpen ? "FERMER" : "PLUS"}
          </span>
          {isSecondaryActive && !moreOpen && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-slate-400" />
          )}
        </button>
      </div>

      {/* ── Expandable secondary drawer ── */}
      {moreOpen && (
        <div
          className="flex flex-col items-center gap-1 p-2 rounded-3xl shadow-xl animate-in slide-in-from-top-2 duration-150"
          style={{
            background: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            border: "1px solid rgba(148,163,184,0.22)",
            boxShadow:
              "0 4px 16px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.8)",
          }}
        >
          {SECONDARY_TOOLS.map((tool) => (
            <ToolButton
              key={tool.id}
              tool={tool}
              isActive={activeTool === tool.id}
              onClick={handleTool}
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
});

export default ProjectToolbar;
