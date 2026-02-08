"use client";

import React, { useEffect, useState, useCallback } from "react";
import Navigation from "@/components/layout/Navigation";
import {
  Box,
  Loader2,
  Save,
  RefreshCw,
  FileOutput,
  Layers,
  Ruler,
  Home,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Building3DViewer } from "@/components/building-3d/Building3DViewer";

interface Building3DModel {
  width: number;
  depth: number;
  wallHeights: Record<string, number>;
  roof: { type: string; pitch: number; overhang?: number };
  materials: Record<string, string>;
}

const DEFAULT_MODEL: Building3DModel = {
  width: 12,
  depth: 10,
  wallHeights: { ground: 3, first: 2.7, second: 2.7 },
  roof: { type: "gable", pitch: 35, overhang: 0.5 },
  materials: {},
};

const ROOF_TYPES = [
  { id: "gable", label: "Gable (2 pans)" },
  { id: "flat", label: "Flat" },
  { id: "hip", label: "Hip (4 pans)" },
  { id: "shed", label: "Shed (1 pan)" },
];

interface ProjectOption {
  id: string;
  name: string;
}

export default function Building3DPage() {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [model, setModel] = useState<Building3DModel>(DEFAULT_MODEL);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects || []))
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (!projectId) {
      setModel(DEFAULT_MODEL);
      return;
    }
    setLoading(true);
    fetch(`/api/projects/${projectId}/building-3d`)
      .then((r) => r.json())
      .then((d) => {
        if (d.building3D) setModel({ ...DEFAULT_MODEL, ...d.building3D });
      })
      .catch(() => setMessage({ type: "error", text: "Failed to load 3D model" }))
      .finally(() => setLoading(false));
  }, [projectId]);

  const saveModel = async () => {
    if (!projectId) {
      setMessage({ type: "error", text: "Select a project first" });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/building-3d`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(model),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setMessage({ type: "success", text: "3D model saved. Generate elevations to update drawings." });
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Save failed" });
    }
    setSaving(false);
  };

  const syncFromSitePlan = async () => {
    if (!projectId) {
      setMessage({ type: "error", text: "Select a project first" });
      return;
    }
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/building-3d/sync-from-site-plan`);
      const data = await res.json();
      if (data.width != null && data.depth != null) {
        setModel((m) => ({ ...m, width: data.width, depth: data.depth }));
        setMessage({ type: "success", text: data.message || "Dimensions synced from site plan." });
      } else {
        setMessage({ type: "error", text: data.message || "No building found in site plan." });
      }
    } catch {
      setMessage({ type: "error", text: "Sync failed" });
    }
    setSyncing(false);
  };

  const generateElevations = async () => {
    if (!projectId) {
      setMessage({ type: "error", text: "Select a project first" });
      return;
    }
    setGenerating(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-elevations`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setMessage({
        type: "success",
        text: `Generated 4 elevations (north, south, east, west). Consistent with site plan and sections.`,
      });
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Generation failed" });
    }
    setGenerating(false);
  };

  const update = useCallback(
    (patch: Partial<Building3DModel>) => {
      setModel((m) => ({ ...m, ...patch }));
    },
    []
  );

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Box className="w-8 h-8 text-amber-400" />
            Building 3D Model
          </h1>
          <p className="text-slate-400 mt-1">
            Adjustable wall heights and roof. Elevations are generated from this model for consistency with the site plan and sections.
          </p>
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <div className="p-4 rounded-2xl bg-slate-800/50 border border-white/10">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Layers className="w-4 h-4" />
                Project
              </h3>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-white text-sm"
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {loading && (
                <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading model…
                </p>
              )}
            </div>

            <div className="p-4 rounded-2xl bg-slate-800/50 border border-white/10">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Ruler className="w-4 h-4" />
                Dimensions (m)
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Width</label>
                  <input
                    type="number"
                    min={3}
                    max={50}
                    step={0.5}
                    value={model.width}
                    onChange={(e) => update({ width: Number(e.target.value) || 12 })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Depth</label>
                  <input
                    type="number"
                    min={3}
                    max={50}
                    step={0.5}
                    value={model.depth}
                    onChange={(e) => update({ depth: Number(e.target.value) || 10 })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={syncFromSitePlan}
                disabled={syncing || !projectId}
                className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-slate-700 text-slate-200 text-sm font-medium hover:bg-slate-600 disabled:opacity-50"
              >
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Sync from site plan
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-slate-800/50 border border-white/10">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Home className="w-4 h-4" />
                Wall heights (m)
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Ground floor</label>
                  <input
                    type="number"
                    min={2}
                    max={5}
                    step={0.1}
                    value={model.wallHeights?.ground ?? 3}
                    onChange={(e) =>
                      update({
                        wallHeights: {
                          ...model.wallHeights,
                          ground: Number(e.target.value) || 3,
                        },
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">1st floor (optional)</label>
                  <input
                    type="number"
                    min={0}
                    max={4}
                    step={0.1}
                    value={model.wallHeights?.first ?? 2.7}
                    onChange={(e) =>
                      update({
                        wallHeights: {
                          ...model.wallHeights,
                          first: Number(e.target.value) || 0,
                        },
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">2nd floor (optional)</label>
                  <input
                    type="number"
                    min={0}
                    max={4}
                    step={0.1}
                    value={model.wallHeights?.second ?? 2.7}
                    onChange={(e) =>
                      update({
                        wallHeights: {
                          ...model.wallHeights,
                          second: Number(e.target.value) || 0,
                        },
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-800/50 border border-white/10">
              <h3 className="text-sm font-semibold text-white mb-3">Roof</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Type</label>
                  <select
                    value={model.roof?.type ?? "gable"}
                    onChange={(e) =>
                      update({
                        roof: { ...model.roof, type: e.target.value, pitch: model.roof?.pitch ?? 35, overhang: model.roof?.overhang ?? 0.5 },
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
                  >
                    {ROOF_TYPES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                {model.roof?.type !== "flat" && (
                  <>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Pitch (°)</label>
                      <input
                        type="number"
                        min={10}
                        max={60}
                        value={model.roof?.pitch ?? 35}
                        onChange={(e) =>
                          update({
                            roof: { ...model.roof, pitch: Number(e.target.value) || 35 },
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Overhang (m)</label>
                      <input
                        type="number"
                        min={0}
                        max={2}
                        step={0.1}
                        value={model.roof?.overhang ?? 0.5}
                        onChange={(e) =>
                          update({
                            roof: { ...model.roof, overhang: Number(e.target.value) ?? 0.5 },
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={saveModel}
                disabled={saving || !projectId}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save 3D model
              </button>
              <button
                type="button"
                onClick={generateElevations}
                disabled={generating || !projectId}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold disabled:opacity-50"
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileOutput className="w-4 h-4" />
                )}
                Generate elevations
              </button>
            </div>

            {message && (
              <div
                className={cn(
                  "p-3 rounded-xl text-sm flex items-start gap-2",
                  message.type === "success"
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-red-500/20 text-red-400 border border-red-500/30"
                )}
              >
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                {message.text}
              </div>
            )}
          </div>

          <div className="lg:col-span-3">
            <div className="rounded-2xl bg-slate-800/50 border border-white/10 overflow-hidden">
              <div className="p-3 border-b border-white/10 flex items-center justify-between flex-wrap gap-2">
                <span className="text-white text-sm font-medium flex items-center gap-2">
                  <Box className="w-4 h-4 text-amber-400" />
                  3D preview — interactive
                </span>
                <div className="flex items-center gap-1 flex-wrap">
                  {[
                    { id: "perspective", label: "Perspective", icon: "◐" },
                    { id: "front", label: "Front", icon: "▬" },
                    { id: "side", label: "Side", icon: "▐" },
                    { id: "top", label: "Top", icon: "▢" },
                    { id: "wireframe", label: "Wireframe", icon: "⊞" },
                  ].map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700/50 text-slate-300 hover:bg-slate-600/50"
                      title={v.label}
                    >
                      {v.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setMessage({ type: "success", text: "Export: Save 3D model then use Generate elevations for PDF export." })}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/80 hover:bg-blue-500 text-white flex items-center gap-1"
                  >
                    Export
                  </button>
                </div>
              </div>
              <Building3DViewer model={model} className="min-h-[70vh]" />
            </div>
            <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
              <Info className="w-3 h-3" />
              Drag to rotate · Scroll to zoom · Right-drag to pan · Double-click building to focus. Elevations are generated from this model.
            </p>
          </div>
        </div>
      </div>
    </Navigation>
  );
}
