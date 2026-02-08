"use client";

import React, { useState } from "react";
import Navigation from "@/components/layout/Navigation";
import { Sparkles, Upload, Loader2, ImageIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function DeveloperPage() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);
    setAnalysis(null);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/developer/visual", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setResult(data.imageUrl);
      setAnalysis(data.analysis || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    }
    setLoading(false);
  };

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Sparkles className="w-8 h-8 text-purple-400" />
            Developer Module
          </h1>
          <p className="text-slate-400 mt-1">
            Upload a sketch or SketchUp screenshot to generate ultra-realistic visuals
          </p>
          {user && (
            <p className="text-sm text-slate-500 mt-1">
              {user.credits} credits • 5 credits per visual
            </p>
          )}
        </div>

        <div className="rounded-2xl bg-slate-800/50 border border-white/10 p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div
              className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center hover:border-purple-500/50 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f?.type.startsWith("image/")) setFile(f);
              }}
            >
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
                id="dev-upload"
              />
              <label htmlFor="dev-upload" className="cursor-pointer block">
                {file ? (
                  <p className="text-white font-medium">{file.name}</p>
                ) : (
                  <>
                    <Upload className="w-12 h-12 text-slate-500 mx-auto mb-2" />
                    <p className="text-slate-400">Drop image or click to upload</p>
                    <p className="text-sm text-slate-500 mt-1">Sketch, SketchUp screenshot, or drawing</p>
                  </>
                )}
              </label>
            </div>
            {error && (
              <div className="p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading || !file}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Generate Ultra-Realistic Visual
                </>
              )}
            </button>
          </form>

          {(result || analysis) && (
            <div className="mt-8 space-y-4">
              {result && (
                <div className="p-4 rounded-xl bg-slate-900/50">
                  <p className="text-sm text-slate-400 mb-2">Result</p>
                  <img
                    src={result}
                    alt="Generated visual"
                    className="max-w-full rounded-lg border border-white/10"
                  />
                </div>
              )}
              {analysis && (
                <div className="p-4 rounded-xl bg-slate-900/50">
                  <p className="text-sm text-slate-400 mb-2">AI Analysis & Recommendations</p>
                  <pre className="text-sm text-slate-300 whitespace-pre-wrap font-sans">{analysis}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Navigation>
  );
}
