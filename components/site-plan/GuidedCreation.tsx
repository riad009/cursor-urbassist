"use client";

import React from "react";
import {
  Home,
  MapPin,
  Ruler,
  Layers,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  TreePine,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PROJECT_PRESETS, getPresetById, type ProjectPreset } from "@/lib/projectPresets";
import type { BuildingDetail } from "./BuildingDetailPanel";

const STEPS = [
  { id: 1, title: "What are you building?", icon: Home, short: "Choose type" },
  { id: 2, title: "Place it on the plan", icon: MapPin, short: "Place" },
  { id: 3, title: "Adjust size", icon: Ruler, short: "Size" },
  { id: 4, title: "Choose roof", icon: Layers, short: "Roof" },
  { id: 5, title: "What's next?", icon: CheckCircle2, short: "Next" },
] as const;

const ROOF_OPTIONS = [
  { id: "flat", label: "Flat", icon: "▬", description: "Toit plat" },
  { id: "gable", label: "2 pans", icon: "∧", description: "Classique" },
  { id: "hip", label: "4 pans", icon: "⌂", description: "Pavillon" },
  { id: "shed", label: "1 pan", icon: "⁄", description: "Appentis" },
] as const;

export interface GuidedCreationProps {
  /** Current step (1–5) */
  step: number;
  onStepChange: (step: number) => void;
  /** Preset selected in step 1 */
  selectedPreset: ProjectPreset | null;
  onSelectPreset: (preset: ProjectPreset) => void;
  /** When we're waiting for user to click on canvas (step 2) */
  placementMode: boolean;
  onStartPlacement: () => void;
  onCancelPlacement: () => void;
  /** Last building added (for steps 3–4) */
  lastPlacedBuilding: BuildingDetail | null;
  onSizeChange: (buildingId: string, patch: { width?: number; depth?: number; wallHeights?: BuildingDetail["wallHeights"]; altitudeM?: number }) => void;
  onRoofChange: (buildingId: string, roof: Partial<BuildingDetail["roof"]>) => void;
  /** Step 5 actions */
  onAddAnother: () => void;
  onAddGreenSpace: () => void;
  onDone: () => void;
  /** Total buildings count (for "Add another") */
  buildingCount: number;
  /** Optional: switch to free design */
  onSwitchToFreeDesign?: () => void;
  /** For Custom preset: dimensions to use when placing */
  customDimensions?: { width: number; depth: number; groundHeight: number };
  onCustomDimensionsChange?: (d: { width: number; depth: number; groundHeight: number }) => void;
  className?: string;
}

export function GuidedCreation({
  step,
  onStepChange,
  selectedPreset,
  onSelectPreset,
  placementMode,
  onStartPlacement,
  onCancelPlacement,
  lastPlacedBuilding,
  onSizeChange,
  onRoofChange,
  onAddAnother,
  onAddGreenSpace,
  onDone,
  buildingCount,
  onSwitchToFreeDesign,
  customDimensions = { width: 10, depth: 8, groundHeight: 3 },
  onCustomDimensionsChange,
  className,
}: GuidedCreationProps) {
  const canGoBack = step > 1 && !placementMode;
  const currentStepConfig = STEPS[step - 1];

  return (
    <div className={cn("flex flex-col h-full bg-slate-900 border-l border-white/10", className)}>
      {/* Progress bar */}
      <div className="p-3 border-b border-white/10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Guided creation
          </span>
          <span className="text-xs text-slate-500">
            Step {step} of 5
          </span>
        </div>
        <div className="flex gap-0.5">
          {STEPS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => !placementMode && s.id <= step && onStepChange(s.id)}
              className={cn(
                "flex-1 h-1.5 rounded-full transition-colors",
                s.id < step ? "bg-emerald-500" : s.id === step ? "bg-blue-500" : "bg-slate-700"
              )}
              title={s.short}
            />
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
          {currentStepConfig && <currentStepConfig.icon className="w-4 h-4 text-blue-400" />}
          {currentStepConfig?.title}
        </h3>

        {/* Step 1: Choose preset */}
        {step === 1 && (
          <>
            <p className="text-xs text-slate-400 mb-4">
              Start with a type that matches your project. You can change the size in the next steps.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {PROJECT_PRESETS.filter((p) => p.id !== "custom").map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSelectPreset(preset)}
                  className={cn(
                    "p-3 rounded-xl border text-left transition-all",
                    selectedPreset?.id === preset.id
                      ? "border-blue-500 bg-blue-500/20 text-white"
                      : "border-white/10 bg-slate-800/50 text-slate-200 hover:border-white/20 hover:bg-slate-800"
                  )}
                >
                  <span className="text-xl block mb-1">{preset.icon}</span>
                  <span className="text-sm font-medium block">{preset.shortLabel}</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    {preset.width}×{preset.depth} m
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onSelectPreset(getPresetById("custom")!)}
              className={cn(
                "mt-2 w-full p-3 rounded-xl border text-left transition-all flex items-center gap-3",
                selectedPreset?.id === "custom"
                  ? "border-blue-500 bg-blue-500/20 text-white"
                  : "border-white/10 bg-slate-800/50 text-slate-200 hover:border-white/20"
              )}
            >
              <span className="text-xl">✏️</span>
              <div>
                <span className="text-sm font-medium">Custom</span>
                <span className="text-[10px] text-slate-400 block">Set your own dimensions</span>
              </div>
            </button>
            {selectedPreset?.id === "custom" && onCustomDimensionsChange && (
              <div className="mt-3 p-3 rounded-xl border border-white/10 bg-slate-800/50 space-y-3">
                <p className="text-xs text-slate-400">Set dimensions before placing on plan.</p>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-0.5">Width (m)</label>
                  <input type="number" min={2} max={40} step={0.5} value={customDimensions.width} onChange={(e) => onCustomDimensionsChange({ ...customDimensions, width: Number(e.target.value) || 10 })} className="w-full px-2 py-1.5 rounded bg-slate-800 border border-white/10 text-white text-sm" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-0.5">Depth (m)</label>
                  <input type="number" min={2} max={30} step={0.5} value={customDimensions.depth} onChange={(e) => onCustomDimensionsChange({ ...customDimensions, depth: Number(e.target.value) || 8 })} className="w-full px-2 py-1.5 rounded bg-slate-800 border border-white/10 text-white text-sm" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-0.5">Ground floor height (m)</label>
                  <input type="number" min={2} max={5} step={0.1} value={customDimensions.groundHeight} onChange={(e) => onCustomDimensionsChange({ ...customDimensions, groundHeight: Number(e.target.value) || 3 })} className="w-full px-2 py-1.5 rounded bg-slate-800 border border-white/10 text-white text-sm" />
                </div>
              </div>
            )}
            {selectedPreset && (
              <button
                type="button"
                onClick={() => onStepChange(2)}
                className="mt-4 w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium flex items-center justify-center gap-2"
              >
                Next: place on plan
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </>
        )}

        {/* Step 2: Place on plan */}
        {step === 2 && (
          <>
            <p className="text-xs text-slate-400 mb-4">
              {selectedPreset
                ? `Click on the plan where you want to place your ${selectedPreset.shortLabel.toLowerCase()}.`
                : "Select a type in step 1 first."}
            </p>
            {placementMode ? (
              <div className="space-y-2">
                <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-200 text-sm">
                  Click on the canvas to place your building.
                </div>
                <button
                  type="button"
                  onClick={onCancelPlacement}
                  className="w-full py-2 rounded-lg border border-white/10 text-slate-400 hover:text-white text-sm"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onStartPlacement}
                disabled={!selectedPreset}
                className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium flex items-center justify-center gap-2"
              >
                <MapPin className="w-4 h-4" />
                Click to place on plan
              </button>
            )}
          </>
        )}

        {/* Step 3: Adjust size */}
        {step === 3 && lastPlacedBuilding && (
          <>
            <p className="text-xs text-slate-400 mb-4">
              Adjust the dimensions of <strong className="text-white">{lastPlacedBuilding.name}</strong>. Values are in meters.
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Width (m)</label>
                <input
                  type="range"
                  min={2}
                  max={30}
                  step={0.5}
                  value={lastPlacedBuilding.width}
                  onChange={(e) => onSizeChange(lastPlacedBuilding.id, { width: Number(e.target.value) })}
                  className="w-full accent-blue-500"
                />
                <span className="text-sm font-mono text-amber-400">{lastPlacedBuilding.width} m</span>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Depth (m)</label>
                <input
                  type="range"
                  min={2}
                  max={25}
                  step={0.5}
                  value={lastPlacedBuilding.depth}
                  onChange={(e) => onSizeChange(lastPlacedBuilding.id, { depth: Number(e.target.value) })}
                  className="w-full accent-blue-500"
                />
                <span className="text-sm font-mono text-amber-400">{lastPlacedBuilding.depth} m</span>
              </div>
              {lastPlacedBuilding.wallHeights.ground > 0 && (
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Wall height – ground floor (m)</label>
                  <input
                    type="range"
                    min={2}
                    max={5}
                    step={0.1}
                    value={lastPlacedBuilding.wallHeights.ground}
                    onChange={(e) =>
                      onSizeChange(lastPlacedBuilding.id, {
                        wallHeights: { ...lastPlacedBuilding.wallHeights, ground: Number(e.target.value) },
                      })
                    }
                    className="w-full accent-blue-500"
                  />
                  <span className="text-sm font-mono text-amber-400">{lastPlacedBuilding.wallHeights.ground} m</span>
                </div>
              )}
              <div>
                <label className="text-xs text-slate-500 block mb-1">Altitude (m) – position on terrain</label>
                <input
                  type="number"
                  step={0.01}
                  placeholder="0.00"
                  value={lastPlacedBuilding.altitudeM ?? ""}
                  onChange={(e) =>
                    onSizeChange(lastPlacedBuilding.id, {
                      altitudeM: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => onStepChange(2)}
                className="py-2 px-3 rounded-lg border border-white/10 text-slate-400 hover:text-white text-sm flex items-center gap-1"
              >
                <ChevronLeft className="w-3 h-3" /> Back
              </button>
              <button
                type="button"
                onClick={() => onStepChange(4)}
                className="flex-1 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium flex items-center justify-center gap-2"
              >
                Next: roof
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

        {/* Step 4: Roof */}
        {step === 4 && lastPlacedBuilding && (
          <>
            <p className="text-xs text-slate-400 mb-4">
              Choose the roof type for <strong className="text-white">{lastPlacedBuilding.name}</strong>.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {ROOF_OPTIONS.map((roof) => (
                <button
                  key={roof.id}
                  type="button"
                  onClick={() =>
                    onRoofChange(lastPlacedBuilding.id, {
                      type: roof.id as BuildingDetail["roof"]["type"],
                      pitch: roof.id === "flat" ? 0 : 35,
                      overhang: roof.id === "flat" ? 0 : 0.5,
                    })
                  }
                  className={cn(
                    "p-4 rounded-xl border text-center transition-all",
                    lastPlacedBuilding.roof.type === roof.id
                      ? "border-blue-500 bg-blue-500/20 text-white"
                      : "border-white/10 bg-slate-800/50 text-slate-200 hover:border-white/20"
                  )}
                >
                  <span className="text-2xl block mb-1 font-mono">{roof.icon}</span>
                  <span className="text-sm font-medium block">{roof.label}</span>
                  <span className="text-[10px] text-slate-400 block">{roof.description}</span>
                </button>
              ))}
            </div>
            {lastPlacedBuilding.roof.type !== "flat" && (
              <div className="mt-4">
                <label className="text-xs text-slate-500 block mb-1">Roof pitch (degrees)</label>
                <input
                  type="range"
                  min={15}
                  max={50}
                  value={lastPlacedBuilding.roof.pitch}
                  onChange={(e) =>
                    onRoofChange(lastPlacedBuilding.id, { pitch: Number(e.target.value) })
                  }
                  className="w-full accent-blue-500"
                />
                <span className="text-sm font-mono text-amber-400">{lastPlacedBuilding.roof.pitch}°</span>
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => onStepChange(3)}
                className="py-2 px-3 rounded-lg border border-white/10 text-slate-400 hover:text-white text-sm flex items-center gap-1"
              >
                <ChevronLeft className="w-3 h-3" /> Back
              </button>
              <button
                type="button"
                onClick={() => onStepChange(5)}
                className="flex-1 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium flex items-center justify-center gap-2"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

        {/* Step 5: What's next */}
        {step === 5 && (
          <>
            <p className="text-xs text-slate-400 mb-4">
              {buildingCount > 0
                ? `You've added ${buildingCount} element${buildingCount > 1 ? "s" : ""}. Add more or finish.`
                : "Add your first building in step 1."}
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={onAddAnother}
                className="w-full py-3 rounded-xl border border-blue-500/50 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 font-medium flex items-center justify-center gap-2"
              >
                <Square className="w-4 h-4" />
                Add another building
              </button>
              <button
                type="button"
                onClick={onAddGreenSpace}
                className="w-full py-3 rounded-xl border border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 font-medium flex items-center justify-center gap-2"
              >
                <TreePine className="w-4 h-4" />
                Add green space
              </button>
              <button
                type="button"
                onClick={onDone}
                className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-medium flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                I'm done
              </button>
            </div>
          </>
        )}
      </div>

      {/* Footer: switch to free design */}
      {onSwitchToFreeDesign && (
        <div className="p-3 border-t border-white/10">
          <button
            type="button"
            onClick={onSwitchToFreeDesign}
            className="w-full py-2 rounded-lg text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Use free design mode (all tools)
          </button>
        </div>
      )}
    </div>
  );
}
