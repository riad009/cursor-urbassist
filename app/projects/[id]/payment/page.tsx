"use client";

import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import Navigation from "@/components/layout/Navigation";
import {
  MapPin,
  Loader2,
  CreditCard,
  FileText,
  Map,
  Layers,
  Scissors,
  Building2,
  Image,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const DOCUMENTS_PRODUCED = [
  { type: "LOCATION_PLAN", label: "Plan de situation", icon: Map },
  { type: "SITE_PLAN", label: "Plan de masse", icon: Layers },
  { type: "SECTION", label: "Coupe", icon: Scissors },
  { type: "ELEVATION", label: "Élévations", icon: Building2 },
  { type: "LANDSCAPE_INSERTION", label: "Insertion paysagère", icon: Image },
  { type: "DESCRIPTIVE_STATEMENT", label: "Notice descriptive", icon: FileText },
];

export default function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const { user, loading: authLoading } = useAuth();
  const [project, setProject] = useState<{
    id: string;
    name: string;
    address: string | null;
    authorizationType?: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    if (!projectId || !user) {
      if (!authLoading) setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/projects/${projectId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.project) setProject(data.project);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId, user, authLoading]);

  const handlePayment = async () => {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "credits",
          packageId: "credits-25",
          projectId: projectId || undefined,
        }),
        credentials: "include",
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.success && data.credits) {
        window.location.href = `/statement?project=${projectId}&from=payment`;
      } else {
        alert(data.error || "Erreur lors du paiement");
      }
    } catch {
      alert("Erreur lors du paiement");
    }
    setCheckoutLoading(false);
  };

  const showLoading = authLoading || (!!user && !!projectId && loading);
  if (showLoading) {
    return (
      <Navigation>
        <div className="p-6 flex flex-col items-center justify-center min-h-[40vh] gap-3">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-slate-400 text-sm">Loading project…</p>
        </div>
      </Navigation>
    );
  }

  if (!project) {
    return (
      <Navigation>
        <div className="p-6 max-w-2xl mx-auto">
          <p className="text-slate-400">Project not found.</p>
          <Link href="/projects" className="text-blue-400 hover:underline mt-2 inline-block">
            ← Back to projects
          </Link>
        </div>
      </Navigation>
    );
  }

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-2xl mx-auto">
        <Link
          href={`/projects/${projectId}/authorization`}
          className="text-sm text-slate-400 hover:text-white inline-flex items-center gap-1 mb-6"
        >
          ← Type d&apos;autorisation
        </Link>
        <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <CreditCard className="w-8 h-8 text-emerald-400" />
          Paiement
        </h1>
        <p className="text-slate-400 mb-8">
          Procédez au paiement pour débloquer la production des documents de votre dossier.
        </p>

        {project.address && (
          <div className="mb-8 p-4 rounded-xl bg-slate-800/50 border border-white/10 flex items-center gap-3">
            <MapPin className="w-5 h-5 text-slate-400 shrink-0" />
            <div>
              <p className="font-medium text-white">{project.name}</p>
              <p className="text-sm text-slate-400">{project.address}</p>
              {project.authorizationType && (
                <p className="text-xs text-slate-500 mt-1">
                  Type: {project.authorizationType === "DP" ? "Déclaration Préalable" : "Permis de Construire"}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Documents qui seront produits</h2>
          <ul className="space-y-3">
            {DOCUMENTS_PRODUCED.map(({ type, label, icon: Icon }) => (
              <li
                key={type}
                className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-white/10"
              >
                <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-blue-400" />
                </div>
                <span className="text-white">{label}</span>
                <CheckCircle2 className="w-5 h-5 text-emerald-500/50 shrink-0 ml-auto" />
              </li>
            ))}
          </ul>
        </div>

        <div className="mb-8 p-4 rounded-xl bg-slate-800/30 border border-white/5">
          <h3 className="font-medium text-white mb-2">Prochaines étapes</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-slate-400">
            <li>Après le paiement, complétez la description détaillée de votre projet</li>
            <li>Lancez l&apos;analyse PLU pour obtenir les recommandations réglementaires</li>
            <li>Éditez et exportez vos plans au format PDF</li>
          </ol>
        </div>

        <div className="border-t border-white/10 pt-8">
          <button
            onClick={handlePayment}
            disabled={checkoutLoading}
            className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold hover:shadow-lg disabled:opacity-50"
          >
            {checkoutLoading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <CreditCard className="w-6 h-6" />
                Payer avec des crédits
              </>
            )}
          </button>
          <p className="text-center text-xs text-slate-500 mt-3">
            Ou paiement en euros — format à définir
          </p>
        </div>
      </div>
    </Navigation>
  );
}
