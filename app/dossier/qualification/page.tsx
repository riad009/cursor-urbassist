"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import Navigation from "@/components/layout/Navigation";
import { ArrowRight, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const DOSSIER_STORAGE_KEY = "urbassist_dossier";

const SUGGESTIONS = [
  { id: "extension", label: "House extension", value: "extension" },
  { id: "piscine", label: "Swimming pool", value: "piscine" },
  { id: "abri", label: "Shed / outbuilding", value: "abri" },
  { id: "construction", label: "New house construction", value: "construction" },
  { id: "autre", label: "Other", value: "autre" },
] as const;

type ProjectTypeValue = (typeof SUGGESTIONS)[number]["value"];

function loadDossier(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(DOSSIER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDossier(data: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    const current = loadDossier();
    sessionStorage.setItem(DOSSIER_STORAGE_KEY, JSON.stringify({ ...current, ...data }));
  } catch {
    // ignore
  }
}

export default function DossierQualificationPage() {
  const [description, setDescription] = useState("");
  const [selectedType, setSelectedType] = useState<ProjectTypeValue | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSuggestion = useCallback((value: ProjectTypeValue) => {
    setSelectedType((prev) => (prev === value ? null : value));
  }, []);

  const handleContinue = useCallback(() => {
    setIsSubmitting(true);
    saveDossier({
      step1: {
        description: description.trim() || null,
        projectType: selectedType || (description.trim() ? "autre" : null),
        isExtension: selectedType === "extension",
        isNewConstruction: selectedType === "construction",
      },
    });
    setIsSubmitting(false);
    window.location.href = "/dossier/address";
  }, [description, selectedType]);

  const canContinue = description.trim().length > 0 || selectedType !== null;

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-2xl mx-auto">
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            ← Home
          </Link>
          <h1 className="text-2xl lg:text-3xl font-bold text-white mt-4">
            Qualify your project
          </h1>
          <p className="text-slate-400 mt-2">
            Describe your project in a few words. No planning jargon required.
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-white mb-2">
              Describe your project in a few words
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="E.g. I want to extend my house with a garden-side conservatory..."
              rows={4}
              className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
            />
          </div>

          <div>
            <p className="text-sm font-medium text-white mb-3">
              Or pick a suggestion:
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSuggestion(s.value)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                    selectedType === s.value
                      ? "bg-blue-500/30 text-blue-300 border border-blue-500/50"
                      : "bg-slate-800/50 text-slate-300 border border-white/10 hover:border-white/20"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleContinue}
              disabled={!canContinue || isSubmitting}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:shadow-lg hover:shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Continue to address and zoning
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
            <Link
              href="/projects"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-800 border border-white/10 text-white font-medium hover:bg-slate-700 transition-colors"
            >
              I already have a project
            </Link>
          </div>
        </div>

        <div className="mt-10 p-4 rounded-xl bg-slate-800/30 border border-white/5 flex gap-3">
          <FileText className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
          <p className="text-sm text-slate-400">
            This information is used to prepare the next steps: plot address, zoning, then dimensions. No commitment, free simulation.
          </p>
        </div>
      </div>
    </Navigation>
  );
}
