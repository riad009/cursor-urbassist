"use client";

import React, { useState, useCallback, useRef } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

const STYLES = [
    { id: "photorealistic", label: "Photorealistic", icon: Camera, description: "Daylight, natural materials" },
    { id: "warm_evening", label: "Warm Evening", icon: Sun, description: "Golden hour, warm glow" },
    { id: "aerial", label: "Aerial View", icon: Eye, description: "Drone perspective" },
    { id: "winter", label: "Winter", icon: Snowflake, description: "Cold season render" },
    { id: "night", label: "Night", icon: Moon, description: "Nocturnal visualization" },
];

function RenderingContent() {
    const searchParams = useSearchParams();
    const projectId = searchParams.get("project") || "";
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [selectedStyle, setSelectedStyle] = useState("photorealistic");
    const [extraContext, setExtraContext] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [result, setResult] = useState<{
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        analysis: Record<string, any>;
        enhancedPrompt: string;
        originalImage: string;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [compareMode, setCompareMode] = useState(false);

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

    const handleTransform = async () => {
        if (!uploadedFile) return;
        setIsProcessing(true);
        setError(null);
        try {
            const formData = new FormData();
            formData.append("image", uploadedFile);
            formData.append("style", selectedStyle);
            formData.append("context", extraContext);
            if (projectId) formData.append("projectId", projectId);

            const res = await fetch("/api/rendering", { method: "POST", body: formData });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Transformation failed");
                return;
            }
            setResult(data);
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50">
            {/* Header */}
            <div className="border-b border-slate-200 bg-white/80 backdrop-blur-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href={projectId ? `/projects/${projectId}` : "/projects"} className="p-2 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-violet-500" />
                                Ultra-Realistic Rendering
                            </h1>
                            <p className="text-sm text-slate-500">Transform 3D renders into photorealistic visualizations</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="px-2 py-1 rounded-full bg-violet-100 text-violet-600 font-medium">10 credits per render</span>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Panel - Upload & Settings */}
                    <div className="lg:col-span-1 space-y-6">
                        {/* Upload Zone */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-4 border-b border-slate-100">
                                <h3 className="font-semibold text-slate-900">Source Render</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Upload from SketchUp, Lumion, Enscape, or 3ds Max</p>
                            </div>
                            <div className="p-4">
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
                                        className="w-full h-48 rounded-xl border-2 border-dashed border-slate-300 hover:border-violet-400 hover:bg-violet-50/50 flex flex-col items-center justify-center gap-3 transition-all group"
                                    >
                                        <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center group-hover:bg-violet-200 transition-colors">
                                            <Upload className="w-5 h-5 text-violet-500" />
                                        </div>
                                        <div className="text-center">
                                            <span className="text-sm font-medium text-slate-600">Drop render here or click to upload</span>
                                            <p className="text-xs text-slate-400 mt-1">JPEG, PNG, WebP, TIFF</p>
                                        </div>
                                    </button>
                                )}
                                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                            </div>
                        </div>

                        {/* Style Selection */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-4 border-b border-slate-100">
                                <h3 className="font-semibold text-slate-900">Rendering Style</h3>
                            </div>
                            <div className="p-3 space-y-1.5">
                                {STYLES.map((s) => (
                                    <button
                                        key={s.id}
                                        onClick={() => setSelectedStyle(s.id)}
                                        className={cn(
                                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all",
                                            selectedStyle === s.id
                                                ? "bg-violet-50 border border-violet-200 text-violet-900"
                                                : "hover:bg-slate-50 border border-transparent text-slate-600"
                                        )}
                                    >
                                        <s.icon className={cn("w-4 h-4", selectedStyle === s.id ? "text-violet-500" : "text-slate-400")} />
                                        <div>
                                            <span className="text-sm font-medium">{s.label}</span>
                                            <p className="text-[11px] text-slate-400">{s.description}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Extra Context */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-4 border-b border-slate-100">
                                <h3 className="font-semibold text-slate-900">Additional Context</h3>
                            </div>
                            <div className="p-4">
                                <textarea
                                    value={extraContext}
                                    onChange={(e) => setExtraContext(e.target.value)}
                                    placeholder="e.g., Mediterranean villa, zinc standing seam roof, mature olive trees..."
                                    className="w-full h-20 px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
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
                                    Analyzing with AI...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-4 h-4" />
                                    Transform to Ultra-Realistic
                                </>
                            )}
                        </button>
                    </div>

                    {/* Right Panel - Result */}
                    <div className="lg:col-span-2">
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px] flex flex-col">
                            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                                    <ImageIcon className="w-4 h-4 text-violet-500" />
                                    Result
                                </h3>
                                {result && (
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setCompareMode(!compareMode)}
                                            className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-all", compareMode ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
                                        >
                                            Compare
                                        </button>
                                        <button className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-medium flex items-center gap-1">
                                            <Download className="w-3 h-3" />
                                            Export
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 p-6 flex items-center justify-center">
                                {error ? (
                                    <div className="text-center space-y-3">
                                        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto">
                                            <X className="w-6 h-6 text-red-500" />
                                        </div>
                                        <p className="text-sm text-red-600">{error}</p>
                                        <button onClick={() => setError(null)} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 text-sm hover:bg-slate-200">
                                            Try Again
                                        </button>
                                    </div>
                                ) : isProcessing ? (
                                    <div className="text-center space-y-4">
                                        <div className="w-20 h-20 rounded-full bg-violet-50 flex items-center justify-center mx-auto">
                                            <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-slate-900">Analyzing your render...</p>
                                            <p className="text-sm text-slate-500 mt-1">Gemini AI is detecting materials, lighting, and composition</p>
                                        </div>
                                    </div>
                                ) : result ? (
                                    <div className="w-full space-y-6">
                                        {compareMode && uploadedImage ? (
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wider">Original</p>
                                                    <img src={uploadedImage} alt="Original" className="w-full rounded-xl border border-slate-200" />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-medium text-violet-500 mb-2 uppercase tracking-wider">AI Analysis</p>
                                                    <img src={result.originalImage} alt="Analysis" className="w-full rounded-xl border border-violet-200" />
                                                </div>
                                            </div>
                                        ) : (
                                            <img src={result.originalImage} alt="Transformed render" className="w-full rounded-xl border border-slate-200 shadow-sm" />
                                        )}

                                        {/* AI Analysis Details */}
                                        <div className="grid grid-cols-2 gap-4">
                                            {result.analysis.materials && (
                                                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                                                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Detected Materials</h4>
                                                    <div className="flex flex-wrap gap-1">
                                                        {(result.analysis.materials as string[]).map((m, i) => (
                                                            <span key={i} className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[11px] text-slate-600">{m}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {result.analysis.lighting && (
                                                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                                                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Lighting</h4>
                                                    <p className="text-xs text-slate-600">{result.analysis.lighting as string}</p>
                                                </div>
                                            )}
                                            {result.analysis.atmosphere && (
                                                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                                                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Atmosphere</h4>
                                                    <p className="text-xs text-slate-600">{result.analysis.atmosphere as string}</p>
                                                </div>
                                            )}
                                            {result.analysis.vegetation && (
                                                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                                                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Vegetation</h4>
                                                    <div className="flex flex-wrap gap-1">
                                                        {(result.analysis.vegetation as string[]).map((v, i) => (
                                                            <span key={i} className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-[11px] text-emerald-600">{v}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Enhanced Prompt */}
                                        <div className="p-3 rounded-xl bg-violet-50 border border-violet-100">
                                            <h4 className="text-xs font-semibold text-violet-600 uppercase tracking-wider mb-2">Optimized AI Prompt</h4>
                                            <p className="text-xs text-violet-800 leading-relaxed">{result.enhancedPrompt}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center space-y-4">
                                        <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center mx-auto">
                                            <Mountain className="w-8 h-8 text-slate-300" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-slate-400">Upload a 3D render to get started</p>
                                            <p className="text-sm text-slate-300 mt-1">Supports exports from SketchUp, Lumion, Enscape, 3ds Max + Vray</p>
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
