"use client";

import React, { useEffect, useState } from "react";
import Navigation from "@/components/layout/Navigation";
import {
  FileCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  Download,
  Shield,
  Ruler,
  Building2,
  Trees,
  Car,
  MapPin,
  Lightbulb,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  address?: string;
  parcelArea?: number;
}

interface ProtectedArea {
  type: string;
  name: string;
  description: string;
  severity: string;
  constraints: string[];
}

export default function FeasibilityPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [loading, setLoading] = useState(false);
  const [protectedAreas, setProtectedAreas] = useState<ProtectedArea[]>([]);
  const [checkingProtected, setCheckingProtected] = useState(false);

  // Questionnaire fields
  const [projectType, setProjectType] = useState("construction");
  const [footprint, setFootprint] = useState("");
  const [height, setHeight] = useState("");
  const [greenArea, setGreenArea] = useState("");
  const [floors, setFloors] = useState("1");
  const [parkingSpaces, setParkingSpaces] = useState("");
  const [distFront, setDistFront] = useState("");
  const [distSide, setDistSide] = useState("");
  const [distRear, setDistRear] = useState("");
  const [roofType, setRoofType] = useState("gable");
  const [existingFootprint, setExistingFootprint] = useState("");

  const [result, setResult] = useState<{
    isFeasible: boolean;
    conditions: string[];
    report: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => setProjects(data.projects || []))
      .catch(() => setProjects([]));
  }, [user]);

  // Auto-detect protected areas when project changes
  useEffect(() => {
    if (!projectId) return;
    const project = projects.find((p) => p.id === projectId);
    if (!project?.address) return;

    setCheckingProtected(true);
    fetch("/api/address/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: project.address }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.results?.[0]?.coordinates) {
          return fetch("/api/protected-areas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              coordinates: data.results[0].coordinates,
            }),
          });
        }
      })
      .then((r) => r?.json())
      .then((data) => {
        if (data?.areas) {
          setProtectedAreas(data.areas);
        }
      })
      .catch(() => {})
      .finally(() => setCheckingProtected(false));
  }, [projectId, projects]);

  const runCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/feasibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          questionnaire: {
            projectType,
            footprint,
            height,
            greenArea,
            floors,
            parkingSpaces,
            distFront,
            distSide,
            distRear,
            roofType,
            existingFootprint,
          },
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({
        isFeasible: false,
        conditions: ["Request failed"],
        report: "Error running feasibility check",
      });
    }
    setLoading(false);
  };

  const selectedProject = projects.find((p) => p.id === projectId);

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <FileCheck className="w-5 h-5 text-slate-900" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              Feasibility Analysis
            </h1>
          </div>
          <p className="text-slate-400">
            Comprehensive regulatory feasibility check against PLU rules,
            protected areas, and construction constraints
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Questionnaire */}
          <div className="lg:col-span-2">
            <form onSubmit={runCheck} className="space-y-4">
              {/* Project Selection */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200">
                <label className="text-sm font-medium text-slate-900 block mb-2">
                  Select Project
                </label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  required
                >
                  <option value="">Choose a project...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.address ? `- ${p.address}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Project Type */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-emerald-600" />
                  Project Type
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: "construction", label: "New Construction" },
                    { id: "extension", label: "Extension" },
                    { id: "renovation", label: "Renovation" },
                    { id: "surelevation", label: "Raising" },
                    { id: "amenagement", label: "Exterior Works" },
                    { id: "changement", label: "Change of Use" },
                  ].map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setProjectType(type.id)}
                      className={cn(
                        "px-3 py-2 rounded-xl text-sm font-medium transition-colors",
                        projectType === type.id
                          ? "bg-emerald-100 text-emerald-600 border border-emerald-200"
                          : "bg-slate-100 text-slate-400 border border-slate-200 hover:text-slate-900"
                      )}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dimensions */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Ruler className="w-4 h-4 text-blue-600" />
                  Dimensions
                </h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">
                      New building footprint (m²)
                    </label>
                    <input
                      type="number"
                      value={footprint}
                      onChange={(e) => setFootprint(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 text-sm"
                      placeholder="e.g. 120"
                    />
                  </div>
                  {projectType === "extension" && (
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">
                        Existing footprint (m²)
                      </label>
                      <input
                        type="number"
                        value={existingFootprint}
                        onChange={(e) =>
                          setExistingFootprint(e.target.value)
                        }
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 text-sm"
                        placeholder="e.g. 80"
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">
                      Maximum height (m)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 text-sm"
                      placeholder="e.g. 8"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">
                      Number of floors
                    </label>
                    <select
                      value={floors}
                      onChange={(e) => setFloors(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 text-sm"
                    >
                      {["1", "2", "3", "4"].map((f) => (
                        <option key={f} value={f}>
                          R+{parseInt(f) - 1} ({f} floor
                          {parseInt(f) > 1 ? "s" : ""})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">
                      Roof type
                    </label>
                    <select
                      value={roofType}
                      onChange={(e) => setRoofType(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 text-sm"
                    >
                      <option value="gable">Gable (2 slopes)</option>
                      <option value="hip">Hip (4 slopes)</option>
                      <option value="flat">Flat roof</option>
                      <option value="mono">Mono-pitch</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Setbacks */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-purple-600" />
                  Distances from Boundaries (m)
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">
                      Front (road)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={distFront}
                      onChange={(e) => setDistFront(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 text-sm"
                      placeholder="e.g. 5"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">
                      Side
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={distSide}
                      onChange={(e) => setDistSide(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 text-sm"
                      placeholder="e.g. 3"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">
                      Rear
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={distRear}
                      onChange={(e) => setDistRear(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 text-sm"
                      placeholder="e.g. 4"
                    />
                  </div>
                </div>
              </div>

              {/* Green Space & Parking */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Trees className="w-4 h-4 text-green-400" />
                  Green Space & Parking
                </h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">
                      Green/landscaped area (m²)
                    </label>
                    <input
                      type="number"
                      value={greenArea}
                      onChange={(e) => setGreenArea(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 text-sm"
                      placeholder="e.g. 100"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">
                      Parking spaces
                    </label>
                    <input
                      type="number"
                      value={parkingSpaces}
                      onChange={(e) => setParkingSpaces(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 text-sm"
                      placeholder="e.g. 2"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !projectId}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-900 font-semibold disabled:opacity-50 flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-emerald-500/25 transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <FileCheck className="w-5 h-5" />
                    Run Feasibility Check
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Right Panel */}
          <div className="space-y-4">
            {/* Protected Areas */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-600" />
                Protected Areas
              </h3>
              {checkingProtected ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Detecting protections...
                </div>
              ) : protectedAreas.length > 0 ? (
                <div className="space-y-2">
                  {protectedAreas
                    .filter((a) => a.type !== "INFO")
                    .map((area, i) => (
                      <div
                        key={i}
                        className={cn(
                          "p-3 rounded-xl border text-sm",
                          area.severity === "high"
                            ? "bg-red-50 border-red-200"
                            : area.severity === "medium"
                              ? "bg-amber-50 border-amber-200"
                              : "bg-blue-50 border-blue-200"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          {area.severity === "high" ? (
                            <XCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                          )}
                          <div>
                            <p className="font-medium text-slate-900 text-xs">
                              {area.name}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">
                              {area.description.substring(0, 100)}...
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  {protectedAreas.filter((a) => a.type !== "INFO").length ===
                    0 && (
                    <div className="flex items-center gap-2 text-sm text-emerald-600">
                      <CheckCircle2 className="w-4 h-4" />
                      No protected area restrictions detected
                    </div>
                  )}
                </div>
              ) : projectId ? (
                <p className="text-sm text-slate-500">
                  Select a project with an address to check protected areas
                </p>
              ) : (
                <p className="text-sm text-slate-500">
                  Select a project to begin
                </p>
              )}
            </div>

            {/* Results */}
            {result && (
              <div
                className={cn(
                  "p-5 rounded-2xl border",
                  result.isFeasible
                    ? "bg-emerald-50 border-emerald-200"
                    : "bg-amber-50 border-amber-200"
                )}
              >
                <div className="flex items-center gap-3 mb-4">
                  {result.isFeasible ? (
                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                  ) : (
                    <XCircle className="w-8 h-8 text-amber-600" />
                  )}
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      {result.isFeasible
                        ? "Project Feasible"
                        : "Adjustments Required"}
                    </h2>
                    <p className="text-xs text-slate-400">
                      {result.conditions.length} item(s) checked
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {result.conditions.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-sm"
                    >
                      {c.includes("exceeds") || c.includes("below") ? (
                        <XCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                      )}
                      <span className="text-slate-600">{c}</span>
                    </div>
                  ))}
                </div>

                {!result.isFeasible && (
                  <div className="mt-4 p-3 rounded-xl bg-slate-100">
                    <div className="flex items-center gap-2 mb-2">
                      <Lightbulb className="w-4 h-4 text-amber-600" />
                      <span className="text-sm font-medium text-amber-600">
                        Suggested Adaptations
                      </span>
                    </div>
                    <ul className="space-y-1 text-xs text-slate-400">
                      {result.conditions
                        .filter(
                          (c) =>
                            c.includes("exceeds") || c.includes("below")
                        )
                        .map((c, i) => (
                          <li key={i} className="flex items-start gap-1">
                            <ArrowRight className="w-3 h-3 mt-0.5 text-amber-600" />
                            {c.includes("Height")
                              ? "Reduce building height or consider a lower roof pitch"
                              : c.includes("Coverage")
                                ? "Reduce the building footprint area"
                                : c.includes("Green")
                                  ? "Increase landscaped area with native vegetation"
                                  : "Review and adjust as per PLU requirements"}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Info Card */}
            <div className="p-4 rounded-2xl bg-slate-100/30 border border-slate-100">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-slate-400">
                  This feasibility check uses regulatory data from your
                  project's PLU analysis. For a complete assessment, first
                  run the AI Analysis on your PLU document.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Navigation>
  );
}
