"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Upload,
  Loader2,
  Image as ImageIcon,
  ArrowLeft,
  Sparkles,
  Eye,
  Download,
  X,
  Sun,
  Moon,
  Mountain,
  Snowflake,
  Camera,
  CreditCard,
  History,
  SlidersHorizontal,
  Palmtree,
  Trees,
  Zap,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STYLES = [
  { id: "photorealistic", label: "Photorealistic", icon: Camera, description: "Daylight, natural PBR materials" },
  { id: "warm_evening", label: "Warm Evening", icon: Sun, description: "Golden hour, warm glow" },
  { id: "aerial", label: "Aerial View", icon: Eye, description: "Drone perspective" },
  { id: "winter", label: "Winter", icon: Snowflake, description: "Cold season render" },
  { id: "night", label: "Night", icon: Moon, description: "Nocturnal visualization" },
  { id: "mediterranean", label: "Mediterranean", icon: Palmtree, description: "Terracotta, olive trees, blue sky" },
  { id: "scandinavian", label: "Scandinavian", icon: Trees, description: "Nordic light, timber cladding" },
];

const RESOLUTIONS = [
  { id: "standard", label: "Standard", credits: 10, desc: "Fast, good quality" },
  { id: "high", label: "High Definition", credits: 15, desc: "Slower, 8K quality" },
];

interface RenderingResult {
  success: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analysis: Record<string, any>;
  enhancedPrompt: string;
  originalImage: string;
  generatedImage: string | null;
  style: string;
  resolution: string;
  creditCost: number;
  documentId: string | null;
}

interface RenderingHistoryItem {
  id: string;
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: Record<string, any>;
  creditsUsed: number;
  createdAt: string;
}

function RenderingContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project") || "";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const compareRef = useRef<HTMLDivElement>(null);

  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [selectedStyle, setSelectedStyle] = useState("photorealistic");
  const [selectedResolution, setSelectedResolution] = useState("high");
  const [extraContext, setExtraContext] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<RenderingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [sliderPos, setSliderPos] = useState(50);
  const [credits, setCredits] = useState<number | null>(null);
  const [history, setHistory] = useState<RenderingHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [buyCreditsLoading, setBuyCreditsLoading] = useState(false);

  // Fetch user credits on mount
  useEffect(() => {
    fetch("/api/credits").then(r => r.json()).then(d => setCredits(d.credits ?? null)).catch(() => {});
  }, []);

  // Fetch rendering history if project is set
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/rendering?projectId=${projectId}`).then(r => r.json()).then(d => {
      if (d.renderings) setHistory(d.renderings);
    }).catch(() => {});
  }, [projectId]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    setResult(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => setUploadedImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith("image/")) return;
    setUploadedFile(file);
    setResult(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => setUploadedImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleTransform = async () => {
    if (!uploadedFile) return;
    setIsProcessing(true);
    setError(null);
    setProgress("Uploading image…");
    try {
      const formData = new FormData();
      formData.append("image", uploadedFile);
      formData.append("style", selectedStyle);
      formData.append("context", extraContext);
      formData.append("resolution", selectedResolution);
      if (projectId) formData.append("projectId", projectId);

      setProgress("Analysing materials & lighting with Gemini AI…");
      const res = await fetch("/api/rendering", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Transformation failed");
        return;
      }

      setResult(data);
      if (credits !== null) setCredits(Math.max(0, credits - (data.creditCost || 10)));
      if (data.generatedImage) setCompareMode(true);
      // Refresh history
      if (projectId) {
        fetch(`/api/rendering?projectId=${projectId}`).then(r => r.json()).then(d => {
          if (d.renderings) setHistory(d.renderings);
        }).catch(() => {});
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsProcessing(false);
      setProgress("");
    }
  };

  // Compare slider interaction
  const handleSliderMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!compareRef.current) return;
    const rect = compareRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setSliderPos((x / rect.width) * 100);
  }, []);

  // Purchase rendering credits
  const buyCredits = async (packageId: string) => {
    setBuyCreditsLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "credits",
          packageId,
          projectId: projectId || undefined,
          successUrl: `/rendering${projectId ? `?project=${projectId}` : ""}`,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.success) {
        setCredits(data.credits);
      }
    } catch {
      setError("Failed to initiate purchase");
    } finally {
      setBuyCreditsLoading(false);
    }
  };

  const downloadResult = () => {
    if (!result) return;
    const img = result.generatedImage || result.originalImage;
    const link = document.createElement("a");
    link.href = img;
    link.download = `render-${result.style}-${Date.now()}.png`;
    link.click();
  };

  const creditCost = RESOLUTIONS.find(r => r.id === selectedResolution)?.credits || 10;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={projectId ? `/projects/${projectId}` : "/projects"} className="p-2 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-violet-500" />
                Ultra-Realistic Rendering Studio
              </h1>
              <p className="text-xs text-slate-500">Transform 3D views into photorealistic images with Gemini AI</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {history.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border", showHistory ? "bg-violet-50 border-violet-200 text-violet-700" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100")}
              >
                <History className="w-3.5 h-3.5" />
                History ({history.length})
              </button>
            )}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-100 text-violet-700 text-xs font-semibold">
              <Zap className="w-3.5 h-3.5" />
              {credits !== null ? `${credits} credits` : "…"}
            </div>
          </div>
        </div>
      </div>

      {/* History Panel */}
      {showHistory && history.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <History className="w-4 h-4 text-violet-500" />
              Rendering History
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {history.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 p-2 hover:border-violet-300 transition-colors cursor-pointer group">
                  <div className="aspect-video bg-gradient-to-br from-violet-50 to-slate-50 rounded-lg flex items-center justify-center mb-2">
                    <ImageIcon className="w-6 h-6 text-violet-300 group-hover:text-violet-500 transition-colors" />
                  </div>
                  <p className="text-[10px] font-medium text-slate-700 truncate">{item.name}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[9px] text-slate-400">{new Date(item.createdAt).toLocaleDateString()}</span>
                    <span className="text-[9px] text-violet-500 font-medium">{item.creditsUsed} cr</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel — Upload & Settings */}
          <div className="lg:col-span-1 space-y-4">
            {/* Upload Zone */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-3 border-b border-slate-100">
                <h3 className="font-semibold text-slate-900 text-sm">Source Render</h3>
                <p className="text-[11px] text-slate-400">SketchUp · Lumion · Enscape · 3ds Max + Vray</p>
              </div>
              <div className="p-3">
                {uploadedImage ? (
                  <div className="relative group">
                    <img src={uploadedImage} alt="Uploaded render" className="w-full rounded-xl border border-slate-200" />
                    <button
                      onClick={() => { setUploadedImage(null); setUploadedFile(null); setResult(null); }}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    className="w-full h-44 rounded-xl border-2 border-dashed border-slate-300 hover:border-violet-400 hover:bg-violet-50/50 flex flex-col items-center justify-center gap-2 transition-all group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center group-hover:bg-violet-200 transition-colors">
                      <Upload className="w-5 h-5 text-violet-500" />
                    </div>
                    <div className="text-center">
                      <span className="text-sm font-medium text-slate-600">Drop render or click to upload</span>
                      <p className="text-[11px] text-slate-400 mt-0.5">JPEG · PNG · WebP · TIFF</p>
                    </div>
                  </button>
                )}
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/tiff" onChange={handleFileUpload} className="hidden" />
              </div>
            </div>

            {/* Style Selection */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-3 border-b border-slate-100">
                <h3 className="font-semibold text-slate-900 text-sm">Rendering Style</h3>
              </div>
              <div className="p-2 space-y-1">
                {STYLES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStyle(s.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all",
                      selectedStyle === s.id
                        ? "bg-violet-50 border border-violet-200 text-violet-900"
                        : "hover:bg-slate-50 border border-transparent text-slate-600",
                    )}
                  >
                    <s.icon className={cn("w-4 h-4 flex-shrink-0", selectedStyle === s.id ? "text-violet-500" : "text-slate-400")} />
                    <div className="min-w-0">
                      <span className="text-sm font-medium block">{s.label}</span>
                      <p className="text-[10px] text-slate-400 truncate">{s.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Resolution */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-3 border-b border-slate-100">
                <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-violet-500" />
                  Resolution
                </h3>
              </div>
              <div className="p-2 space-y-1">
                {RESOLUTIONS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedResolution(r.id)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all",
                      selectedResolution === r.id
                        ? "bg-violet-50 border border-violet-200"
                        : "hover:bg-slate-50 border border-transparent",
                    )}
                  >
                    <div>
                      <span className={cn("text-sm font-medium", selectedResolution === r.id ? "text-violet-900" : "text-slate-600")}>{r.label}</span>
                      <p className="text-[10px] text-slate-400">{r.desc}</p>
                    </div>
                    <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", selectedResolution === r.id ? "bg-violet-200 text-violet-700" : "bg-slate-100 text-slate-500")}>
                      {r.credits} cr
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Extra Context */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-3 border-b border-slate-100">
                <h3 className="font-semibold text-slate-900 text-sm">Additional Context</h3>
              </div>
              <div className="p-3">
                <textarea
                  value={extraContext}
                  onChange={(e) => setExtraContext(e.target.value)}
                  placeholder="e.g. Mediterranean villa, zinc standing seam roof, mature olive trees, swimming pool…"
                  className="w-full h-16 px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 placeholder:text-slate-300"
                />
              </div>
            </div>

            {/* Transform Button */}
            <button
              onClick={handleTransform}
              disabled={!uploadedFile || isProcessing}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-semibold shadow-lg shadow-violet-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {progress || "Processing…"}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Transform ({creditCost} credits)
                </>
              )}
            </button>

            {/* Low credits warning & buy CTA */}
            {credits !== null && credits < creditCost && (
              <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4 space-y-3">
                <p className="text-sm text-amber-800 font-medium">Not enough credits</p>
                <p className="text-xs text-amber-600">You have {credits} credits. This render costs {creditCost}.</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "credits-10", label: "10 cr – €9.90" },
                    { id: "credits-25", label: "25 cr – €19.90" },
                    { id: "credits-50", label: "50 cr – €34.90" },
                    { id: "credits-100", label: "100 cr – €59.90" },
                  ].map((pkg) => (
                    <button
                      key={pkg.id}
                      onClick={() => buyCredits(pkg.id)}
                      disabled={buyCreditsLoading}
                      className="px-3 py-2 rounded-lg bg-white border border-amber-200 hover:border-violet-400 text-xs font-medium text-slate-700 hover:text-violet-700 transition-colors flex items-center gap-1.5"
                    >
                      <CreditCard className="w-3 h-3" />
                      {pkg.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel — Result */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px] flex flex-col">
              <div className="p-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2 text-sm">
                  <ImageIcon className="w-4 h-4 text-violet-500" />
                  Result
                </h3>
                {result && (
                  <div className="flex items-center gap-2">
                    {result.generatedImage && (
                      <button
                        onClick={() => setCompareMode(!compareMode)}
                        className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-all", compareMode ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
                      >
                        <Eye className="w-3 h-3 inline mr-1" />
                        {compareMode ? "Hide Compare" : "Compare"}
                      </button>
                    )}
                    <button onClick={downloadResult} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-medium flex items-center gap-1">
                      <Download className="w-3 h-3" />
                      Download
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 p-4 flex items-center justify-center">
                {error ? (
                  <div className="text-center space-y-3">
                    <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto">
                      <X className="w-6 h-6 text-red-500" />
                    </div>
                    <p className="text-sm text-red-600 font-medium">{error}</p>
                    <button onClick={() => setError(null)} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 text-sm hover:bg-slate-200">
                      Try Again
                    </button>
                  </div>
                ) : isProcessing ? (
                  <div className="text-center space-y-4">
                    <div className="w-20 h-20 rounded-full bg-violet-50 flex items-center justify-center mx-auto relative">
                      <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
                      <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                        <Sparkles className="w-3 h-3 text-emerald-500" />
                      </div>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{progress || "Processing…"}</p>
                      <p className="text-xs text-slate-500 mt-1">This may take 30-60 seconds for HD renders</p>
                    </div>
                    <div className="w-64 mx-auto h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full animate-pulse" style={{ width: "60%" }} />
                    </div>
                  </div>
                ) : result ? (
                  <div className="w-full space-y-5">
                    {/* Generated Image / Compare View */}
                    {result.generatedImage && compareMode ? (
                      <div
                        ref={compareRef}
                        className="relative w-full rounded-xl overflow-hidden border border-slate-200 cursor-col-resize select-none"
                        onMouseMove={handleSliderMove}
                      >
                        {/* Before (original) */}
                        <img src={uploadedImage || result.originalImage} alt="Original" className="w-full" />
                        {/* After (generated) — clipped */}
                        <div
                          className="absolute inset-0 overflow-hidden"
                          style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
                        >
                          <img src={result.generatedImage} alt="Generated" className="w-full h-full object-cover" />
                        </div>
                        {/* Slider line */}
                        <div className="absolute top-0 bottom-0" style={{ left: `${sliderPos}%`, transform: "translateX(-50%)" }}>
                          <div className="w-0.5 h-full bg-white shadow-lg" />
                          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center">
                            <SlidersHorizontal className="w-4 h-4 text-violet-500" />
                          </div>
                        </div>
                        {/* Labels */}
                        <div className="absolute top-3 left-3 px-2 py-1 rounded-md bg-black/60 text-white text-[10px] font-medium">BEFORE</div>
                        <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-violet-600/90 text-white text-[10px] font-medium">AFTER (AI)</div>
                      </div>
                    ) : result.generatedImage ? (
                      <div className="relative">
                        <img src={result.generatedImage} alt="Ultra-realistic render" className="w-full rounded-xl border border-violet-200 shadow-sm" />
                        <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-violet-600/90 text-white text-[10px] font-bold flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          AI Generated
                        </div>
                      </div>
                    ) : (
                      <div className="relative">
                        <img src={result.originalImage} alt="Analysed render" className="w-full rounded-xl border border-slate-200 shadow-sm" />
                        <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-amber-500/90 text-white text-[10px] font-bold">
                          Analysis Only — Image generation unavailable
                        </div>
                      </div>
                    )}

                    {/* AI Analysis Details */}
                    <details className="group">
                      <summary className="cursor-pointer flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-violet-600 transition-colors">
                        <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                        AI Analysis Details
                      </summary>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        {result.analysis.materials && (
                          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                            <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Detected Materials</h4>
                            <div className="flex flex-wrap gap-1">
                              {(result.analysis.materials as string[]).map((m, i) => (
                                <span key={i} className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[10px] text-slate-600">{m}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {result.analysis.lighting && (
                          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                            <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Lighting</h4>
                            <p className="text-[11px] text-slate-600 leading-relaxed">{result.analysis.lighting as string}</p>
                          </div>
                        )}
                        {result.analysis.atmosphere && (
                          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                            <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Atmosphere</h4>
                            <p className="text-[11px] text-slate-600 leading-relaxed">{result.analysis.atmosphere as string}</p>
                          </div>
                        )}
                        {result.analysis.vegetation && (
                          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                            <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Vegetation</h4>
                            <div className="flex flex-wrap gap-1">
                              {(result.analysis.vegetation as string[]).map((v, i) => (
                                <span key={i} className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-[10px] text-emerald-600">{v}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      {result.enhancedPrompt && (
                        <div className="mt-3 p-3 rounded-xl bg-violet-50 border border-violet-100">
                          <h4 className="text-[10px] font-semibold text-violet-600 uppercase tracking-wider mb-1.5">Optimised AI Prompt</h4>
                          <p className="text-[11px] text-violet-800 leading-relaxed">{result.enhancedPrompt}</p>
                        </div>
                      )}
                    </details>

                    {/* Cost & doc info */}
                    <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                      <span>Style: <strong className="text-slate-600">{result.style}</strong></span>
                      <span>Resolution: <strong className="text-slate-600">{result.resolution}</strong></span>
                      <span>Cost: <strong className="text-violet-600">{result.creditCost} credits</strong></span>
                      {result.documentId && <span>Saved to project</span>}
                      {result.generatedImage && <span className="text-emerald-600 font-medium">Image generated</span>}
                    </div>
                  </div>
                ) : (
                  /* Empty state */
                  <div className="text-center space-y-4">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-violet-50 to-purple-50 flex items-center justify-center mx-auto">
                      <Mountain className="w-10 h-10 text-slate-300" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-400">Upload a 3D render to get started</p>
                      <p className="text-xs text-slate-300 mt-1 max-w-xs mx-auto">
                        Supports exports from SketchUp, Lumion, Enscape, 3ds Max + Vray, Archicad, Revit
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-4 text-[10px] text-slate-300 pt-4">
                      <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" /> Gemini AI analysis</span>
                      <span className="flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Image generation</span>
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> Before/after compare</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { Suspense } from "react";

export default function RenderingPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="w-8 h-8 animate-spin text-violet-500" /></div>}>
      <RenderingContent />
    </Suspense>
  );
}
