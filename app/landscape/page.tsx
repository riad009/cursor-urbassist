"use client";

import React, { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import Navigation from "@/components/layout/Navigation";
import {
  Image,
  Upload,
  Camera,
  Layers,
  Eye,
  EyeOff,
  ZoomIn,
  ZoomOut,
  RotateCw,
  FlipHorizontal,
  Contrast,
  Sun,
  Palette,
  Download,
  RefreshCw,
  Sliders,
  Maximize2,
  Grid3X3,
  Mountain,
  Building2,
  Trees,
  Sparkles,
  Loader2,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Layer {
  id: string;
  name: string;
  type: "photo" | "design" | "overlay";
  visible: boolean;
  opacity: number;
  icon: React.ElementType;
}

export default function LandscapePage() {
  const [photo, setPhoto] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // View controls
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [flipX, setFlipX] = useState(false);

  // Adjustments
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [opacity, setOpacity] = useState(80);

  // AI integration
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    horizonLine?: number;
    suggestedScale?: number;
    orientation?: string;
    bestIntegrationZone?: { x: number; y: number; w: number; h: number };
    ambiance?: string;
  } | null>(null);
  const [integrationReport, setIntegrationReport] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [reportUnauthorized, setReportUnauthorized] = useState(false);

  // Layers
  const [layers, setLayers] = useState<Layer[]>([
    { id: "photo", name: "Site Photo", type: "photo", visible: true, opacity: 100, icon: Mountain },
    { id: "design", name: "Project Design", type: "design", visible: true, opacity: 80, icon: Building2 },
    { id: "landscape", name: "Landscaping", type: "overlay", visible: true, opacity: 100, icon: Trees },
  ]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;

    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      setPhoto(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Analyze photo with AI
    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      formData.append("action", "analyze");

      const res = await fetch("/api/landscape", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const data = await res.json();
      if (data.success && data.photo?.analysis) {
        setAnalysisResult(data.photo.analysis);
      }
    } catch (error) {
      console.error("Analysis error:", error);
    }
    setIsAnalyzing(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        processFile(e.dataTransfer.files[0]);
      }
    },
    [processFile]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  useEffect(() => {
    fetch("/api/projects", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setProjects(d.projects || []))
      .catch(() => setProjects([]));
  }, []);

  const generateInsertionImage = async () => {
    if (!photoFile || !selectedProjectId) return;
    setIsGeneratingImage(true);
    setGeneratedImageUrl(null);
    setImageError(null);
    try {
      const formData = new FormData();
      formData.append("photo", photoFile);
      formData.append("action", "generate-image");
      formData.append("projectId", selectedProjectId);
      const res = await fetch("/api/landscape", { method: "POST", body: formData, credentials: "include" });
      const data = await res.json();
      if (data.success && data.imageUrl) {
        setGeneratedImageUrl(data.imageUrl);
      } else if (res.status === 401) {
        setImageError("Please sign in to use this feature.");
      } else {
        setImageError(data.error || "Image generation failed. Enable OPENAI_API_KEY and IMAGE_GENERATION_ENABLED for photomontage.");
      }
    } catch (e) {
      setImageError("Request failed. Try again.");
    }
    setIsGeneratingImage(false);
  };

  const generateIntegrationReport = async () => {
    if (!photoFile) return;
    setIsGeneratingReport(true);
    setReportUnauthorized(false);

    try {
      const formData = new FormData();
      formData.append("photo", photoFile);
      formData.append("action", "generate-integration");
      if (selectedProjectId) formData.append("projectId", selectedProjectId);
      formData.append(
        "projectData",
        JSON.stringify({
          projectType: "residential",
          projectName: projects.find((p) => p.id === selectedProjectId)?.name,
        })
      );

      const res = await fetch("/api/landscape", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const data = await res.json();
      if (data.success && data.integration?.report) {
        setIntegrationReport(data.integration.report);
        setReportUnauthorized(false);
      } else if (res.status === 401) {
        setReportUnauthorized(true);
        setIntegrationReport("You need to be signed in to generate the AI Integration Report.");
      } else if (data.error) {
        setReportUnauthorized(false);
        setIntegrationReport(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error("Report generation error:", error);
      setIntegrationReport("Failed to generate report. Please try again.");
    }

    setIsGeneratingReport(false);
  };

  const toggleLayerVisibility = (id: string) => {
    setLayers(
      layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l))
    );
  };

  const resetAdjustments = () => {
    setZoom(100);
    setRotation(0);
    setFlipX(false);
    setBrightness(100);
    setContrast(100);
    setOpacity(80);
  };

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                <Image className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">
                Landscape Integration
              </h1>
            </div>
            <p className="text-slate-400">
              AI-powered landscape integration with photo analysis and
              project overlay
            </p>
          </div>
          {photo && (
            <div className="flex items-center gap-3">
              <button
                onClick={resetAdjustments}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-white/10 text-white font-medium hover:bg-slate-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Reset
              </button>
              <button
                onClick={generateIntegrationReport}
                disabled={isGeneratingReport}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50"
              >
                {isGeneratingReport ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    AI Integration Report
                  </>
                )}
              </button>
              {projects.length > 0 && (
                <>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="px-3 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-white text-sm"
                  >
                    <option value="">Select project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={generateInsertionImage}
                    disabled={isGeneratingImage || !selectedProjectId}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold hover:shadow-lg hover:shadow-emerald-500/25 transition-all disabled:opacity-50"
                  >
                    {isGeneratingImage ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Generating image...
                      </>
                    ) : (
                      <>
                        <Image className="w-5 h-5" />
                        Realistic image (5 cr)
                      </>
                    )}
                  </button>
                </>
              )}
              <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-700 text-white font-semibold hover:bg-slate-600 transition-all">
                <Download className="w-5 h-5" />
                Export
              </button>
            </div>
          )}
        </div>

        {!photo ? (
          /* Upload Section */
          <div className="grid lg:grid-cols-2 gap-6">
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={cn(
                "relative border-2 border-dashed rounded-2xl p-12 text-center transition-all",
                dragActive
                  ? "border-emerald-500 bg-emerald-500/10"
                  : "border-white/20 hover:border-white/40 bg-slate-800/30"
              )}
            >
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="space-y-4">
                <div className="w-20 h-20 rounded-2xl bg-slate-700/50 flex items-center justify-center mx-auto">
                  <Upload className="w-10 h-10 text-slate-400" />
                </div>
                <div>
                  <p className="text-xl font-semibold text-white">
                    Upload Site Photo
                  </p>
                  <p className="text-slate-400 mt-1">
                    Drop your photo here, click to browse, or use camera
                  </p>
                </div>
                <p className="text-xs text-slate-500">
                  Supports JPG, PNG, WebP up to 25MB
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-3 mb-4">
                  <Sparkles className="w-6 h-6 text-emerald-400" />
                  <h3 className="text-lg font-semibold text-white">
                    AI-Powered Integration
                  </h3>
                </div>
                <p className="text-slate-300 mb-4">
                  Upload a photo and our AI will analyze perspective,
                  lighting, and environment to help integrate your project
                  realistically.
                </p>
                <ul className="space-y-2">
                  {[
                    "Automatic perspective analysis",
                    "Horizon line and vanishing point detection",
                    "Lighting and shadow analysis",
                    "Environment ambiance classification",
                    "AI-generated integration report",
                    "Overlay project design on photo",
                  ].map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center gap-2 text-sm text-slate-400"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="p-4 rounded-xl bg-slate-800/30 border border-white/5 text-center cursor-pointer hover:bg-slate-700/30 transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Camera className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-300 font-medium">
                    Use Camera
                  </p>
                </label>
                <div className="p-4 rounded-xl bg-slate-800/30 border border-white/5 text-center">
                  <Grid3X3 className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">From Project</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Editor Section */
          <div className="grid lg:grid-cols-4 gap-6">
            {/* Preview Area */}
            <div className="lg:col-span-3 space-y-4">
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-900 border border-white/10">
                {/* Main Photo */}
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{
                    transform: `scale(${zoom / 100}) rotate(${rotation}deg) scaleX(${flipX ? -1 : 1})`,
                    filter: `brightness(${brightness}%) contrast(${contrast}%)`,
                  }}
                >
                  <img
                    src={photo}
                    alt="Site"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>

                {/* AI Analysis Overlay */}
                {analysisResult && layers.find((l) => l.id === "design")?.visible && (
                  <>
                    {/* Horizon Line */}
                    {analysisResult.horizonLine && (
                      <div
                        className="absolute left-0 right-0 border-t-2 border-dashed border-blue-400/40 pointer-events-none"
                        style={{
                          top: `${(analysisResult.horizonLine || 0.35) * 100}%`,
                        }}
                      >
                        <span className="absolute -top-5 left-2 text-xs text-blue-400 bg-slate-900/80 px-1 rounded">
                          Horizon
                        </span>
                      </div>
                    )}

                    {/* Integration Zone */}
                    {analysisResult.bestIntegrationZone && (
                      <div
                        className="absolute border-2 border-emerald-400/50 bg-emerald-400/10 rounded-lg pointer-events-none"
                        style={{
                          left: `${(analysisResult.bestIntegrationZone.x || 0.3) * 100}%`,
                          top: `${(analysisResult.bestIntegrationZone.y || 0.4) * 100}%`,
                          width: `${(analysisResult.bestIntegrationZone.w || 0.4) * 100}%`,
                          height: `${(analysisResult.bestIntegrationZone.h || 0.4) * 100}%`,
                        }}
                      >
                        <span className="absolute -top-5 left-0 text-xs text-emerald-400 bg-slate-900/80 px-1 rounded">
                          Best integration zone
                        </span>
                      </div>
                    )}
                  </>
                )}

                {/* Design Overlay: show generated insertion image in zone, or placeholder */}
                {layers.find((l) => l.id === "design")?.visible && (
                  <div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    style={{ opacity: opacity / 100 }}
                  >
                    <div
                      className="border-2 border-dashed border-blue-400/50 rounded-lg overflow-hidden bg-slate-900/80 flex items-center justify-center"
                      style={{
                        position: "absolute",
                        top: analysisResult?.bestIntegrationZone ? `${(analysisResult.bestIntegrationZone.y || 0.4) * 100}%` : "40%",
                        left: analysisResult?.bestIntegrationZone ? `${(analysisResult.bestIntegrationZone.x || 0.3) * 100}%` : "30%",
                        width: analysisResult?.bestIntegrationZone ? `${(analysisResult.bestIntegrationZone.w || 0.4) * 100}%` : "40%",
                        height: analysisResult?.bestIntegrationZone ? `${(analysisResult.bestIntegrationZone.h || 0.4) * 100}%` : "40%",
                      }}
                    >
                      {generatedImageUrl ? (
                        <img
                          src={generatedImageUrl}
                          alt="Project integration"
                          className="w-full h-full object-cover"
                        />
                      ) : selectedProjectId ? (
                        <div className="p-4 text-center">
                          <Building2 className="w-10 h-10 text-blue-400/70 mx-auto mb-2" />
                          <p className="text-xs text-blue-300/90 font-medium">
                            {projects.find((p) => p.id === selectedProjectId)?.name}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-1">
                            Click &quot;Realistic image&quot; above to generate
                          </p>
                        </div>
                      ) : (
                        <div className="p-4 text-center">
                          <Building2 className="w-10 h-10 text-blue-400/50 mx-auto mb-2" />
                          <p className="text-xs text-slate-400">
                            Select a project and click &quot;Realistic image&quot; to generate integration
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Analysis Badge */}
                {isAnalyzing && (
                  <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-violet-500/20 backdrop-blur-lg border border-violet-500/30 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                    <span className="text-xs text-violet-400 font-medium">
                      AI analyzing photo...
                    </span>
                  </div>
                )}

                {analysisResult && !isAnalyzing && (
                  <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-emerald-500/20 backdrop-blur-lg border border-emerald-500/30 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs text-emerald-400 font-medium">
                      {analysisResult.ambiance || "Analyzed"} |
                      Scale: {analysisResult.suggestedScale?.toFixed(1) || "1.0"}x
                    </span>
                  </div>
                )}

                {/* Controls Overlay */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/80 backdrop-blur-lg border border-white/10">
                  <button
                    onClick={() => setZoom(Math.max(25, zoom - 25))}
                    className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-white min-w-[50px] text-center">
                    {zoom}%
                  </span>
                  <button
                    onClick={() => setZoom(Math.min(200, zoom + 25))}
                    className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <div className="w-px h-4 bg-white/20" />
                  <button
                    onClick={() => setRotation((rotation + 90) % 360)}
                    className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                  >
                    <RotateCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setFlipX(!flipX)}
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      flipX
                        ? "bg-blue-500/20 text-blue-400"
                        : "hover:bg-white/10 text-slate-400 hover:text-white"
                    )}
                  >
                    <FlipHorizontal className="w-4 h-4" />
                  </button>
                  <div className="w-px h-4 bg-white/20" />
                  <button className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Integration Report */}
              {integrationReport && (
                <div className={cn(
                  "p-5 rounded-2xl border",
                  reportUnauthorized
                    ? "bg-amber-500/10 border-amber-500/20"
                    : "bg-gradient-to-br from-violet-500/10 to-purple-500/10 border-violet-500/20"
                )}>
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className={cn("w-5 h-5", reportUnauthorized ? "text-amber-400" : "text-violet-400")} />
                    <h3 className="text-sm font-semibold text-white">
                      AI Landscape Integration Report
                    </h3>
                  </div>
                  {reportUnauthorized ? (
                    <div className="text-sm text-slate-300 space-y-3">
                      <p>{integrationReport}</p>
                      <Link
                        href="/login"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/20 text-amber-400 font-medium hover:bg-amber-500/30 transition-colors"
                      >
                        Sign in
                      </Link>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-300 whitespace-pre-wrap max-h-[300px] overflow-y-auto leading-relaxed">
                      {integrationReport}
                    </div>
                  )}
                </div>
              )}

              {/* Quick Actions */}
              <div className="flex flex-wrap gap-3">
                <label className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800/50 border border-white/10 text-white font-medium hover:bg-slate-700/50 transition-colors cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Upload className="w-5 h-5 text-slate-400" />
                  Change Photo
                </label>
                <div className="flex-1 min-w-[180px] flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-800/50 border border-white/10">
                  <Building2 className="w-5 h-5 text-slate-400 shrink-0" />
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="flex-1 min-w-0 bg-transparent text-white text-sm font-medium focus:outline-none cursor-pointer"
                  >
                    <option value="">Import Design (select project)</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800/50 border border-white/10 text-slate-400 text-sm">
                  <Trees className="w-5 h-5" />
                  Landscaping (from report)
                </div>
              </div>
            </div>

            {/* Controls Panel */}
            <div className="space-y-4">
              {/* Layers */}
              <div className="p-4 rounded-2xl bg-slate-800/50 border border-white/10">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
                  <Layers className="w-4 h-4 text-blue-400" />
                  Layers
                </h3>
                <div className="space-y-2">
                  {layers.map((layer) => (
                    <div
                      key={layer.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      <button
                        onClick={() => toggleLayerVisibility(layer.id)}
                        className={cn(
                          "p-1.5 rounded transition-colors",
                          layer.visible ? "text-white" : "text-slate-500"
                        )}
                      >
                        {layer.visible ? (
                          <Eye className="w-4 h-4" />
                        ) : (
                          <EyeOff className="w-4 h-4" />
                        )}
                      </button>
                      <layer.icon
                        className={cn(
                          "w-4 h-4",
                          layer.type === "photo"
                            ? "text-emerald-400"
                            : layer.type === "design"
                              ? "text-blue-400"
                              : "text-amber-400"
                        )}
                      />
                      <span
                        className={cn(
                          "flex-1 text-sm",
                          layer.visible ? "text-white" : "text-slate-500"
                        )}
                      >
                        {layer.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Generated insertion image */}
              {generatedImageUrl && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                    <Image className="w-4 h-4 text-emerald-400" />
                    Generated insertion image
                  </h3>
                  <img src={generatedImageUrl} alt="Landscape insertion" className="w-full rounded-lg border border-white/10" />
                  <p className="text-xs text-slate-400 mt-2">Shown in the overlay. Export via Export Center → Landscape Insertion.</p>
                </div>
              )}

              {imageError && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                  <p className="text-xs text-amber-400">{imageError}</p>
                </div>
              )}

              {/* AI Analysis Results */}
              {analysisResult && (
                <div className="p-4 rounded-2xl bg-violet-500/10 border border-violet-500/20">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-violet-400" />
                    AI Analysis
                  </h3>
                  <div className="space-y-2 text-xs">
                    {analysisResult.ambiance && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Ambiance</span>
                        <span className="text-white capitalize">
                          {analysisResult.ambiance}
                        </span>
                      </div>
                    )}
                    {analysisResult.orientation && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Orientation</span>
                        <span className="text-white capitalize">
                          {analysisResult.orientation}
                        </span>
                      </div>
                    )}
                    {analysisResult.suggestedScale && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Scale</span>
                        <span className="text-white">
                          {analysisResult.suggestedScale.toFixed(1)}x
                        </span>
                      </div>
                    )}
                    {analysisResult.horizonLine && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Horizon</span>
                        <span className="text-white">
                          {Math.round(analysisResult.horizonLine * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Adjustments */}
              <div className="p-4 rounded-2xl bg-slate-800/50 border border-white/10">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
                  <Sliders className="w-4 h-4 text-purple-400" />
                  Adjustments
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-slate-400 flex items-center gap-1">
                        <Sun className="w-3 h-3" /> Brightness
                      </label>
                      <span className="text-xs text-slate-500">
                        {brightness}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={brightness}
                      onChange={(e) =>
                        setBrightness(Number(e.target.value))
                      }
                      className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-slate-400 flex items-center gap-1">
                        <Contrast className="w-3 h-3" /> Contrast
                      </label>
                      <span className="text-xs text-slate-500">
                        {contrast}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={contrast}
                      onChange={(e) =>
                        setContrast(Number(e.target.value))
                      }
                      className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-slate-400 flex items-center gap-1">
                        <Palette className="w-3 h-3" /> Overlay Opacity
                      </label>
                      <span className="text-xs text-slate-500">
                        {opacity}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={opacity}
                      onChange={(e) =>
                        setOpacity(Number(e.target.value))
                      }
                      className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Navigation>
  );
}
