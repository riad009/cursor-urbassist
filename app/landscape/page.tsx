"use client";

import React, { useState, useCallback } from "react";
import Navigation from "@/components/layout/Navigation";
import {
  Image,
  Upload,
  Camera,
  Layers,
  Eye,
  EyeOff,
  Move,
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
  const [designOverlay, setDesignOverlay] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  
  // View controls
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [flipX, setFlipX] = useState(false);
  
  // Adjustments
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [opacity, setOpacity] = useState(80);
  
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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setPhoto(event.target?.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        setPhoto(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleLayerVisibility = (id: string) => {
    setLayers(layers.map(l =>
      l.id === id ? { ...l, visible: !l.visible } : l
    ));
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
              <h1 className="text-2xl font-bold text-white">Landscape Integration</h1>
            </div>
            <p className="text-slate-400">Overlay your project design onto site photography</p>
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
              <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold hover:shadow-lg hover:shadow-emerald-500/25 transition-all">
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
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="space-y-4">
                <div className="w-20 h-20 rounded-2xl bg-slate-700/50 flex items-center justify-center mx-auto">
                  <Upload className="w-10 h-10 text-slate-400" />
                </div>
                <div>
                  <p className="text-xl font-semibold text-white">Upload Site Photo</p>
                  <p className="text-slate-400 mt-1">Drop your photo here or click to browse</p>
                </div>
                <p className="text-xs text-slate-500">Supports JPG, PNG, WebP up to 25MB</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-3 mb-4">
                  <Mountain className="w-6 h-6 text-emerald-400" />
                  <h3 className="text-lg font-semibold text-white">Photo Integration</h3>
                </div>
                <p className="text-slate-300 mb-4">
                  Upload a photo of your construction site to visualize how your project will look in its real environment.
                </p>
                <ul className="space-y-2">
                  {[
                    "Overlay architectural designs",
                    "Adjust transparency and blend",
                    "Add landscaping elements",
                    "Export realistic previews",
                  ].map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-slate-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-800/30 border border-white/5 text-center">
                  <Camera className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">Take Photo</p>
                </div>
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

                {/* Design Overlay */}
                {layers.find(l => l.id === "design")?.visible && (
                  <div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    style={{ opacity: opacity / 100 }}
                  >
                    <div className="w-1/2 h-1/2 border-2 border-dashed border-blue-400/50 rounded-lg flex items-center justify-center bg-blue-500/10">
                      <Building2 className="w-12 h-12 text-blue-400/50" />
                      <p className="text-blue-400/50 ml-2">Design Layer</p>
                    </div>
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
                  <span className="text-sm text-white min-w-[50px] text-center">{zoom}%</span>
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
                      flipX ? "bg-blue-500/20 text-blue-400" : "hover:bg-white/10 text-slate-400 hover:text-white"
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

              {/* Quick Actions */}
              <div className="flex gap-3">
                <button className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800/50 border border-white/10 text-white font-medium hover:bg-slate-700/50 transition-colors">
                  <Upload className="w-5 h-5 text-slate-400" />
                  Change Photo
                </button>
                <button className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800/50 border border-white/10 text-white font-medium hover:bg-slate-700/50 transition-colors">
                  <Building2 className="w-5 h-5 text-slate-400" />
                  Import Design
                </button>
                <button className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800/50 border border-white/10 text-white font-medium hover:bg-slate-700/50 transition-colors">
                  <Trees className="w-5 h-5 text-slate-400" />
                  Add Landscaping
                </button>
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
                        {layer.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <layer.icon className={cn(
                        "w-4 h-4",
                        layer.type === "photo" ? "text-emerald-400" :
                        layer.type === "design" ? "text-blue-400" : "text-amber-400"
                      )} />
                      <span className={cn(
                        "flex-1 text-sm",
                        layer.visible ? "text-white" : "text-slate-500"
                      )}>{layer.name}</span>
                    </div>
                  ))}
                </div>
              </div>

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
                      <span className="text-xs text-slate-500">{brightness}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={brightness}
                      onChange={(e) => setBrightness(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-slate-400 flex items-center gap-1">
                        <Contrast className="w-3 h-3" /> Contrast
                      </label>
                      <span className="text-xs text-slate-500">{contrast}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={contrast}
                      onChange={(e) => setContrast(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-slate-400 flex items-center gap-1">
                        <Palette className="w-3 h-3" /> Overlay Opacity
                      </label>
                      <span className="text-xs text-slate-500">{opacity}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={opacity}
                      onChange={(e) => setOpacity(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Quick Add */}
              <div className="p-4 rounded-2xl bg-slate-800/50 border border-white/10">
                <h3 className="text-sm font-semibold text-white mb-3">Quick Add</h3>
                <div className="grid grid-cols-3 gap-2">
                  {["🌳", "🌲", "🌴", "🌺", "🚗", "🪑"].map((emoji) => (
                    <button
                      key={emoji}
                      className="aspect-square rounded-lg bg-slate-700/50 hover:bg-slate-600/50 transition-colors text-2xl flex items-center justify-center"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Navigation>
  );
}
