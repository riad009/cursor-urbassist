"use client";

import React, { useState } from "react";
import Navigation from "@/components/layout/Navigation";
import {
  Calculator,
  Square,
  Ruler,
  Box,
  Percent,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  History,
  Save,
  Copy,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

type CalculationType = "surface" | "distance" | "volume" | "coverage";

interface CalculationResult {
  type: CalculationType;
  label: string;
  value: string;
  unit: string;
  timestamp: Date;
}

const calculators = [
  {
    id: "surface",
    title: "Surface Area",
    description: "Calculate area of shapes",
    icon: Square,
    gradient: "from-blue-500 to-cyan-500",
    unit: "m²",
  },
  {
    id: "distance",
    title: "Distance",
    description: "Measure between points",
    icon: Ruler,
    gradient: "from-violet-500 to-purple-500",
    unit: "m",
  },
  {
    id: "volume",
    title: "Volume",
    description: "Calculate 3D volumes",
    icon: Box,
    gradient: "from-amber-500 to-orange-500",
    unit: "m³",
  },
  {
    id: "coverage",
    title: "Coverage Ratio",
    description: "Building coverage %",
    icon: Percent,
    gradient: "from-emerald-500 to-teal-500",
    unit: "%",
  },
];

export default function CalculationsPage() {
  const [activeCalc, setActiveCalc] = useState<CalculationType>("surface");
  const [results, setResults] = useState<CalculationResult[]>([]);
  
  // Surface inputs
  const [surfaceLength, setSurfaceLength] = useState("");
  const [surfaceWidth, setSurfaceWidth] = useState("");
  const [surfaceShape, setSurfaceShape] = useState<"rectangle" | "circle" | "triangle">("rectangle");
  
  // Distance inputs
  const [x1, setX1] = useState("");
  const [y1, setY1] = useState("");
  const [x2, setX2] = useState("");
  const [y2, setY2] = useState("");
  
  // Volume inputs
  const [volumeLength, setVolumeLength] = useState("");
  const [volumeWidth, setVolumeWidth] = useState("");
  const [volumeHeight, setVolumeHeight] = useState("");
  
  // Coverage inputs
  const [buildingArea, setBuildingArea] = useState("");
  const [plotArea, setPlotArea] = useState("");
  const [maxCoverage, setMaxCoverage] = useState("50");

  const calculate = () => {
    let value = 0;
    let label = "";
    let unit = "";

    switch (activeCalc) {
      case "surface":
        const l = parseFloat(surfaceLength) || 0;
        const w = parseFloat(surfaceWidth) || 0;
        if (surfaceShape === "rectangle") {
          value = l * w;
          label = `Rectangle ${l}m × ${w}m`;
        } else if (surfaceShape === "circle") {
          value = Math.PI * l * l;
          label = `Circle radius ${l}m`;
        } else {
          value = (l * w) / 2;
          label = `Triangle base ${l}m × height ${w}m`;
        }
        unit = "m²";
        break;
      case "distance":
        const dx = (parseFloat(x2) || 0) - (parseFloat(x1) || 0);
        const dy = (parseFloat(y2) || 0) - (parseFloat(y1) || 0);
        value = Math.sqrt(dx * dx + dy * dy);
        label = `Distance (${x1},${y1}) to (${x2},${y2})`;
        unit = "m";
        break;
      case "volume":
        const vl = parseFloat(volumeLength) || 0;
        const vw = parseFloat(volumeWidth) || 0;
        const vh = parseFloat(volumeHeight) || 0;
        value = vl * vw * vh;
        label = `Volume ${vl}m × ${vw}m × ${vh}m`;
        unit = "m³";
        break;
      case "coverage":
        const ba = parseFloat(buildingArea) || 0;
        const pa = parseFloat(plotArea) || 0;
        value = pa > 0 ? (ba / pa) * 100 : 0;
        label = `Coverage ${ba}m² / ${pa}m²`;
        unit = "%";
        break;
    }

    const newResult: CalculationResult = {
      type: activeCalc,
      label,
      value: value.toFixed(2),
      unit,
      timestamp: new Date(),
    };

    setResults([newResult, ...results].slice(0, 10));
  };

  const clearInputs = () => {
    setSurfaceLength("");
    setSurfaceWidth("");
    setX1("");
    setY1("");
    setX2("");
    setY2("");
    setVolumeLength("");
    setVolumeWidth("");
    setVolumeHeight("");
    setBuildingArea("");
    setPlotArea("");
  };

  const copyResult = (result: CalculationResult) => {
    navigator.clipboard.writeText(`${result.value} ${result.unit}`);
  };

  const activeCalculator = calculators.find(c => c.id === activeCalc)!;

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
              <Calculator className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Calculations</h1>
          </div>
          <p className="text-slate-400">Precise measurements and calculations for your construction projects</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Calculator Selection */}
          <div className="lg:col-span-2 space-y-6">
            {/* Calculator Tabs */}
            <div className="grid sm:grid-cols-4 gap-3">
              {calculators.map((calc) => (
                <button
                  key={calc.id}
                  onClick={() => setActiveCalc(calc.id as CalculationType)}
                  className={cn(
                    "p-4 rounded-xl border transition-all text-left",
                    activeCalc === calc.id
                      ? "bg-gradient-to-br " + calc.gradient + " border-transparent shadow-lg"
                      : "bg-slate-800/50 border-white/10 hover:border-white/20"
                  )}
                >
                  <calc.icon className={cn(
                    "w-6 h-6 mb-2",
                    activeCalc === calc.id ? "text-white" : "text-slate-400"
                  )} />
                  <p className={cn(
                    "font-semibold",
                    activeCalc === calc.id ? "text-white" : "text-slate-300"
                  )}>{calc.title}</p>
                  <p className={cn(
                    "text-xs mt-0.5",
                    activeCalc === calc.id ? "text-white/70" : "text-slate-500"
                  )}>{calc.description}</p>
                </button>
              ))}
            </div>

            {/* Calculator Input */}
            <div className="p-6 rounded-2xl bg-slate-800/50 border border-white/10">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <activeCalculator.icon className="w-5 h-5 text-blue-400" />
                  {activeCalculator.title} Calculator
                </h3>
                <button
                  onClick={clearInputs}
                  className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
              </div>

              {/* Surface Inputs */}
              {activeCalc === "surface" && (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-slate-400 mb-2 block">Shape</label>
                    <div className="flex gap-2">
                      {["rectangle", "circle", "triangle"].map((shape) => (
                        <button
                          key={shape}
                          onClick={() => setSurfaceShape(shape as typeof surfaceShape)}
                          className={cn(
                            "flex-1 py-3 rounded-xl text-sm font-medium transition-colors capitalize",
                            surfaceShape === shape
                              ? "bg-blue-500 text-white"
                              : "bg-slate-700 text-slate-400 hover:text-white"
                          )}
                        >
                          {shape}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-slate-400 mb-2 block">
                        {surfaceShape === "circle" ? "Radius (m)" : surfaceShape === "triangle" ? "Base (m)" : "Length (m)"}
                      </label>
                      <input
                        type="number"
                        value={surfaceLength}
                        onChange={(e) => setSurfaceLength(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-4 py-3 rounded-xl bg-slate-700 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    </div>
                    {surfaceShape !== "circle" && (
                      <div>
                        <label className="text-sm text-slate-400 mb-2 block">
                          {surfaceShape === "triangle" ? "Height (m)" : "Width (m)"}
                        </label>
                        <input
                          type="number"
                          value={surfaceWidth}
                          onChange={(e) => setSurfaceWidth(e.target.value)}
                          placeholder="0.00"
                          className="w-full px-4 py-3 rounded-xl bg-slate-700 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Distance Inputs */}
              {activeCalc === "distance" && (
                <div className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-slate-700/50 border border-white/5">
                      <p className="text-sm text-slate-400 mb-3">Point A</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">X</label>
                          <input
                            type="number"
                            value={x1}
                            onChange={(e) => setX1(e.target.value)}
                            placeholder="0"
                            className="w-full px-3 py-2 rounded-lg bg-slate-600 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">Y</label>
                          <input
                            type="number"
                            value={y1}
                            onChange={(e) => setY1(e.target.value)}
                            placeholder="0"
                            className="w-full px-3 py-2 rounded-lg bg-slate-600 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-700/50 border border-white/5">
                      <p className="text-sm text-slate-400 mb-3">Point B</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">X</label>
                          <input
                            type="number"
                            value={x2}
                            onChange={(e) => setX2(e.target.value)}
                            placeholder="0"
                            className="w-full px-3 py-2 rounded-lg bg-slate-600 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">Y</label>
                          <input
                            type="number"
                            value={y2}
                            onChange={(e) => setY2(e.target.value)}
                            placeholder="0"
                            className="w-full px-3 py-2 rounded-lg bg-slate-600 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Volume Inputs */}
              {activeCalc === "volume" && (
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm text-slate-400 mb-2 block">Length (m)</label>
                    <input
                      type="number"
                      value={volumeLength}
                      onChange={(e) => setVolumeLength(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-4 py-3 rounded-xl bg-slate-700 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-slate-400 mb-2 block">Width (m)</label>
                    <input
                      type="number"
                      value={volumeWidth}
                      onChange={(e) => setVolumeWidth(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-4 py-3 rounded-xl bg-slate-700 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-slate-400 mb-2 block">Height (m)</label>
                    <input
                      type="number"
                      value={volumeHeight}
                      onChange={(e) => setVolumeHeight(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-4 py-3 rounded-xl bg-slate-700 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                </div>
              )}

              {/* Coverage Inputs */}
              {activeCalc === "coverage" && (
                <div className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-slate-400 mb-2 block">Building Area (m²)</label>
                      <input
                        type="number"
                        value={buildingArea}
                        onChange={(e) => setBuildingArea(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-4 py-3 rounded-xl bg-slate-700 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-slate-400 mb-2 block">Plot Area (m²)</label>
                      <input
                        type="number"
                        value={plotArea}
                        onChange={(e) => setPlotArea(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-4 py-3 rounded-xl bg-slate-700 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-slate-400 mb-2 block">Max Allowed Coverage (%)</label>
                    <input
                      type="number"
                      value={maxCoverage}
                      onChange={(e) => setMaxCoverage(e.target.value)}
                      placeholder="50"
                      className="w-full px-4 py-3 rounded-xl bg-slate-700 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                </div>
              )}

              {/* Calculate Button */}
              <button
                onClick={calculate}
                className="w-full mt-6 flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:shadow-lg hover:shadow-purple-500/25 transition-all"
              >
                <Calculator className="w-5 h-5" />
                Calculate
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>

            {/* Formula Info */}
            <div className="p-4 rounded-xl bg-slate-800/30 border border-white/5">
              <p className="text-sm text-slate-400">
                {activeCalc === "surface" && surfaceShape === "rectangle" && "Formula: Area = Length × Width"}
                {activeCalc === "surface" && surfaceShape === "circle" && "Formula: Area = π × r²"}
                {activeCalc === "surface" && surfaceShape === "triangle" && "Formula: Area = (Base × Height) / 2"}
                {activeCalc === "distance" && "Formula: Distance = √((x₂-x₁)² + (y₂-y₁)²)"}
                {activeCalc === "volume" && "Formula: Volume = Length × Width × Height"}
                {activeCalc === "coverage" && "Formula: Coverage = (Building Area / Plot Area) × 100"}
              </p>
            </div>
          </div>

          {/* Results History */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <History className="w-5 h-5 text-blue-400" />
                Recent Results
              </h3>
              {results.length > 0 && (
                <button
                  onClick={() => setResults([])}
                  className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {results.length === 0 ? (
              <div className="p-8 rounded-2xl bg-slate-800/30 border border-white/5 text-center">
                <Calculator className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <p className="text-slate-400">No calculations yet</p>
                <p className="text-sm text-slate-500">Results will appear here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((result, index) => {
                  const calc = calculators.find(c => c.id === result.type)!;
                  const isCoverageOk = result.type === "coverage" && parseFloat(result.value) <= parseFloat(maxCoverage);
                  const isCoverageWarning = result.type === "coverage" && parseFloat(result.value) > parseFloat(maxCoverage);
                  
                  return (
                    <div
                      key={index}
                      className={cn(
                        "p-4 rounded-xl border transition-all",
                        isCoverageWarning
                          ? "bg-red-500/10 border-red-500/20"
                          : "bg-slate-800/50 border-white/10"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br",
                            calc.gradient
                          )}>
                            <calc.icon className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-xl font-bold text-white">
                                {result.value}
                                <span className="text-sm font-normal text-slate-400 ml-1">{result.unit}</span>
                              </p>
                              {result.type === "coverage" && (
                                isCoverageOk ? (
                                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                ) : (
                                  <AlertTriangle className="w-5 h-5 text-red-400" />
                                )
                              )}
                            </div>
                            <p className="text-xs text-slate-500 truncate max-w-[180px]">{result.label}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => copyResult(result)}
                          className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      {isCoverageWarning && (
                        <p className="text-xs text-red-400 mt-2">
                          Exceeds max coverage of {maxCoverage}%
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {results.length > 0 && (
              <button className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800 border border-white/10 text-white font-medium hover:bg-slate-700 transition-colors">
                <Save className="w-5 h-5" />
                Save to Project
              </button>
            )}
          </div>
        </div>
      </div>
    </Navigation>
  );
}
