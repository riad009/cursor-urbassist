"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Navigation from "@/components/layout/Navigation";
import {
  Mountain,
  Plus,
  Trash2,
  Loader2,
  Download,
  RefreshCw,
  Eye,
  Ruler,
  Layers,
  ArrowRight,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ElevationPoint {
  x: number;
  y: number;
  z: number;
  label?: string;
}

interface Project {
  id: string;
  name: string;
}

interface SectionLine {
  start: { x: number; y: number };
  end: { x: number; y: number };
  name: string;
}

interface ProfilePoint {
  distance: number;
  elevation: number;
}

export default function TerrainPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [elevationPoints, setElevationPoints] = useState<ElevationPoint[]>([]);
  const [sectionLines, setSectionLines] = useState<SectionLine[]>([]);
  const [profiles, setProfiles] = useState<
    Array<{ name: string; profile: ProfilePoint[] }>
  >([]);
  const [newPoint, setNewPoint] = useState({ x: 0, y: 0, z: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"points" | "sections" | "3d">(
    "points"
  );
  const [drawingSection, setDrawingSection] = useState(false);
  const [sectionStart, setSectionStart] = useState<{
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => setProjects(data.projects || []))
      .catch(() => {});
  }, []);

  // Draw terrain on canvas
  const drawTerrain = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, w, h);

    // Draw grid
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= w; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Scale points to canvas
    if (elevationPoints.length > 0) {
      const minX = Math.min(...elevationPoints.map((p) => p.x));
      const maxX = Math.max(...elevationPoints.map((p) => p.x));
      const minY = Math.min(...elevationPoints.map((p) => p.y));
      const maxY = Math.max(...elevationPoints.map((p) => p.y));
      const minZ = Math.min(...elevationPoints.map((p) => p.z));
      const maxZ = Math.max(...elevationPoints.map((p) => p.z));

      const rangeX = maxX - minX || 1;
      const rangeY = maxY - minY || 1;
      const rangeZ = maxZ - minZ || 1;

      const margin = 60;
      const scaleX = (w - margin * 2) / rangeX;
      const scaleY = (h - margin * 2) / rangeY;

      const toCanvasX = (x: number) => margin + (x - minX) * scaleX;
      const toCanvasY = (y: number) => margin + (y - minY) * scaleY;

      // Draw elevation contours (interpolated)
      const contourLevels = 5;
      for (let level = 0; level <= contourLevels; level++) {
        const z = minZ + (rangeZ * level) / contourLevels;
        const hue = 120 - (level / contourLevels) * 120; // Green to red
        ctx.strokeStyle = `hsla(${hue}, 70%, 50%, 0.3)`;
        ctx.lineWidth = 1;

        // Simple contour visualization
        for (const point of elevationPoints) {
          if (Math.abs(point.z - z) < rangeZ / (contourLevels * 2)) {
            ctx.beginPath();
            ctx.arc(toCanvasX(point.x), toCanvasY(point.y), 15, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }

      // Draw elevation points
      for (const point of elevationPoints) {
        const cx = toCanvasX(point.x);
        const cy = toCanvasY(point.y);
        const colorVal = (point.z - minZ) / rangeZ;
        const hue = 120 - colorVal * 120;

        ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Label
        ctx.fillStyle = "#fff";
        ctx.font = "11px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${point.z.toFixed(1)}m`, cx, cy - 14);
        if (point.label) {
          ctx.fillStyle = "#94a3b8";
          ctx.font = "9px sans-serif";
          ctx.fillText(point.label, cx, cy + 20);
        }
      }

      // Draw section lines
      ctx.setLineDash([8, 4]);
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      for (const section of sectionLines) {
        ctx.beginPath();
        ctx.moveTo(toCanvasX(section.start.x), toCanvasY(section.start.y));
        ctx.lineTo(toCanvasX(section.end.x), toCanvasY(section.end.y));
        ctx.stroke();

        // Section label
        const midX =
          (toCanvasX(section.start.x) + toCanvasX(section.end.x)) / 2;
        const midY =
          (toCanvasY(section.start.y) + toCanvasY(section.end.y)) / 2;
        ctx.fillStyle = "#f59e0b";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(section.name, midX, midY - 10);
      }
      ctx.setLineDash([]);
    } else {
      // Empty state
      ctx.fillStyle = "#64748b";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        "Add elevation points to visualize terrain",
        w / 2,
        h / 2
      );
    }
  }, [elevationPoints, sectionLines]);

  useEffect(() => {
    drawTerrain();
  }, [drawTerrain]);

  const addPoint = () => {
    setElevationPoints([
      ...elevationPoints,
      {
        ...newPoint,
        label: `P${elevationPoints.length + 1}`,
      },
    ]);
    setNewPoint({ x: newPoint.x + 5, y: 0, z: newPoint.z });
  };

  const removePoint = (index: number) => {
    setElevationPoints(elevationPoints.filter((_, i) => i !== index));
  };

  const addSectionLine = () => {
    if (elevationPoints.length < 2) return;
    const newSection: SectionLine = {
      start: {
        x: elevationPoints[0].x,
        y: elevationPoints[0].y,
      },
      end: {
        x: elevationPoints[elevationPoints.length - 1].x,
        y: elevationPoints[elevationPoints.length - 1].y,
      },
      name: `Section ${String.fromCharCode(65 + sectionLines.length)}`,
    };
    setSectionLines([...sectionLines, newSection]);
  };

  const generateProfile = async (sectionLine: SectionLine) => {
    if (!selectedProject) return;
    setIsLoading(true);

    try {
      const res = await fetch("/api/terrain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProject,
          action: "generate-profile",
          data: {
            sectionLine,
            name: sectionLine.name,
          },
        }),
      });

      const data = await res.json();
      if (data.success) {
        setProfiles([
          ...profiles,
          { name: sectionLine.name, profile: data.profile },
        ]);
      }
    } catch (error) {
      console.error("Profile generation error:", error);
    }

    setIsLoading(false);
  };

  const saveTerrainData = async () => {
    if (!selectedProject) return;
    setIsLoading(true);

    try {
      await fetch("/api/terrain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProject,
          action: "save-elevations",
          data: {
            points: elevationPoints,
            sectionLines,
          },
        }),
      });
    } catch (error) {
      console.error("Save error:", error);
    }

    setIsLoading(false);
  };

  // Draw profile
  const drawProfile = (
    profile: ProfilePoint[],
    canvas: HTMLCanvasElement
  ) => {
    const ctx = canvas.getContext("2d");
    if (!ctx || profile.length === 0) return;

    const w = canvas.width;
    const h = canvas.height;
    const margin = 40;

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, w, h);

    const maxDist = Math.max(...profile.map((p) => p.distance));
    const minElev = Math.min(...profile.map((p) => p.elevation));
    const maxElev = Math.max(...profile.map((p) => p.elevation));
    const elevRange = maxElev - minElev || 1;

    const scaleX = (w - margin * 2) / (maxDist || 1);
    const scaleY = (h - margin * 2) / elevRange;

    // Draw ground profile
    ctx.beginPath();
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2;

    for (let i = 0; i < profile.length; i++) {
      const x = margin + profile[i].distance * scaleX;
      const y = h - margin - (profile[i].elevation - minElev) * scaleY;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fill below
    ctx.lineTo(
      margin + profile[profile.length - 1].distance * scaleX,
      h - margin
    );
    ctx.lineTo(margin, h - margin);
    ctx.closePath();
    ctx.fillStyle = "rgba(34, 197, 94, 0.1)";
    ctx.fill();

    // Axes
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin, margin);
    ctx.lineTo(margin, h - margin);
    ctx.lineTo(w - margin, h - margin);
    ctx.stroke();

    // Labels
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${maxDist.toFixed(1)}m`, w - margin, h - margin + 15);
    ctx.fillText("0m", margin, h - margin + 15);
    ctx.textAlign = "right";
    ctx.fillText(`${maxElev.toFixed(1)}m`, margin - 5, margin + 5);
    ctx.fillText(`${minElev.toFixed(1)}m`, margin - 5, h - margin + 5);
  };

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/25">
                <Mountain className="w-5 h-5 text-slate-900" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900">
                Terrain & Sections
              </h1>
            </div>
            <p className="text-slate-400">
              Input elevation data, generate terrain profiles and regulatory
              sections
            </p>
          </div>
          <div className="flex gap-3">
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="px-4 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 text-sm"
            >
              <option value="">Select project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={saveTerrainData}
              disabled={!selectedProject || isLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-slate-900 font-medium disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {[
            { id: "points" as const, label: "Elevation Points", icon: Plus },
            { id: "sections" as const, label: "Section Lines", icon: Ruler },
            { id: "3d" as const, label: "3D View", icon: Eye },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                  : "bg-white text-slate-400 border border-slate-200 hover:bg-slate-100"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Canvas */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
              <canvas
                ref={canvasRef}
                width={800}
                height={500}
                className="w-full"
              />
            </div>

            {/* Profiles */}
            {profiles.length > 0 && (
              <div className="mt-4 space-y-4">
                <h3 className="text-lg font-semibold text-slate-900">
                  Terrain Profiles
                </h3>
                {profiles.map((p, i) => (
                  <div
                    key={i}
                    className="rounded-2xl bg-white border border-slate-200 p-4"
                  >
                    <h4 className="text-sm font-medium text-amber-600 mb-2">
                      {p.name}
                    </h4>
                    <canvas
                      width={700}
                      height={200}
                      className="w-full rounded-lg"
                      ref={(el) => {
                        if (el) drawProfile(p.profile, el);
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="space-y-4">
            {activeTab === "points" && (
              <>
                <div className="p-4 rounded-2xl bg-white border border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">
                    Add Elevation Point
                  </h3>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">
                        X (m)
                      </label>
                      <input
                        type="number"
                        value={newPoint.x}
                        onChange={(e) =>
                          setNewPoint({
                            ...newPoint,
                            x: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full px-2 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-900 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">
                        Y (m)
                      </label>
                      <input
                        type="number"
                        value={newPoint.y}
                        onChange={(e) =>
                          setNewPoint({
                            ...newPoint,
                            y: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full px-2 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-900 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">
                        Z (m)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={newPoint.z}
                        onChange={(e) =>
                          setNewPoint({
                            ...newPoint,
                            z: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full px-2 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-900 text-sm"
                      />
                    </div>
                  </div>
                  <button
                    onClick={addPoint}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-100 text-emerald-600 font-medium hover:bg-emerald-200 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Point
                  </button>
                </div>

                {/* Points List */}
                <div className="p-4 rounded-2xl bg-white border border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">
                    Points ({elevationPoints.length})
                  </h3>
                  <div className="space-y-1 max-h-[400px] overflow-y-auto">
                    {elevationPoints.map((point, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-100 text-sm"
                      >
                        <span className="text-slate-600 font-mono">
                          {point.label}: ({point.x}, {point.y}) z=
                          {point.z.toFixed(1)}m
                        </span>
                        <button
                          onClick={() => removePoint(i)}
                          className="text-red-600 hover:text-red-600"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {activeTab === "sections" && (
              <>
                <div className="p-4 rounded-2xl bg-white border border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">
                    Section Lines
                  </h3>
                  <button
                    onClick={addSectionLine}
                    disabled={elevationPoints.length < 2}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-100 text-amber-600 font-medium hover:bg-amber-200 transition-colors disabled:opacity-50"
                  >
                    <ArrowRight className="w-4 h-4" />
                    Add Section Line
                  </button>
                </div>

                {sectionLines.map((section, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-2xl bg-white border border-slate-200"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-amber-600">
                        {section.name}
                      </span>
                      <button
                        onClick={() => generateProfile(section)}
                        disabled={isLoading}
                        className="text-xs px-3 py-1 rounded-lg bg-amber-100 text-amber-600 hover:bg-amber-200"
                      >
                        {isLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          "Generate Profile"
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500">
                      ({section.start.x}, {section.start.y}) to (
                      {section.end.x}, {section.end.y})
                    </p>
                  </div>
                ))}
              </>
            )}

            {activeTab === "3d" && (
              <div className="p-4 rounded-2xl bg-white border border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">
                  3D Terrain View
                </h3>
                <p className="text-sm text-slate-400">
                  {elevationPoints.length >= 3
                    ? "3D terrain model generated from your elevation points. The model uses inverse distance weighting interpolation."
                    : "Add at least 3 elevation points to generate a 3D terrain model."}
                </p>
                {elevationPoints.length >= 3 && (
                  <div className="mt-4 p-3 rounded-xl bg-slate-100">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500">Min elevation:</span>
                        <span className="text-slate-900 ml-2">
                          {Math.min(
                            ...elevationPoints.map((p) => p.z)
                          ).toFixed(1)}
                          m
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Max elevation:</span>
                        <span className="text-slate-900 ml-2">
                          {Math.max(
                            ...elevationPoints.map((p) => p.z)
                          ).toFixed(1)}
                          m
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Points:</span>
                        <span className="text-slate-900 ml-2">
                          {elevationPoints.length}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Slope:</span>
                        <span className="text-slate-900 ml-2">
                          {(
                            ((Math.max(
                              ...elevationPoints.map((p) => p.z)
                            ) -
                              Math.min(
                                ...elevationPoints.map((p) => p.z)
                              )) /
                              Math.max(
                                ...elevationPoints.map((p) =>
                                  Math.sqrt(p.x * p.x + p.y * p.y)
                                ),
                                1
                              )) *
                            100
                          ).toFixed(1)}
                          %
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Navigation>
  );
}
