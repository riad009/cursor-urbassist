"use client";

import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import Navigation from "@/components/layout/Navigation";
import {
  MapPin,
  Loader2,
  CreditCard,
  FileText,
  CheckCircle2,
  Info,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  getDocumentsForType,
  PC_ADDITIONAL_NOTES,
} from "@/lib/authorization-documents";

export default function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const { user, loading: authLoading } = useAuth();
  const [project, setProject] = useState<{
    id: string;
    name: string;
    address: string | null;
    authorizationType?: string | null;
    wantPluAnalysis?: boolean;
    wantCerfaFill?: boolean;
    architectRequired?: boolean;
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
      .catch(() => { })
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
        // Mark project as paid before redirect
        await fetch(`/api/projects/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paidAt: new Date().toISOString() }),
          credentials: "include",
        }).catch(() => { });
        window.location.href = data.url;
      } else if (data.success && data.credits) {
        // Mark project as paid
        await fetch(`/api/projects/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paidAt: new Date().toISOString() }),
          credentials: "include",
        }).catch(() => { });
        window.location.href = `/projects/${projectId}/description`;
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

  const authType = project.authorizationType?.toUpperCase();
  const isPC = authType === "PC" || authType === "ARCHITECT_REQUIRED";
  const documents = getDocumentsForType(project.authorizationType);
  const displayAuthType =
    authType === "DP"
      ? "Déclaration Préalable"
      : authType === "PC" || authType === "ARCHITECT_REQUIRED"
        ? "Permis de Construire"
        : null;

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-2xl mx-auto">
        <Link
          href={`/projects/${projectId}/authorization`}
          className="text-sm text-slate-400 hover:text-white inline-flex items-center gap-1 mb-6"
        >
          ← Retour au type d&apos;autorisation
        </Link>
        <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <CreditCard className="w-8 h-8 text-emerald-400" />
          Récapitulatif & Paiement
        </h1>
        <p className="text-slate-400 mb-8">
          Vérifiez votre commande puis procédez au paiement pour débloquer la production des documents.
        </p>

        {/* Project info */}
        {project.address && (
          <div className="mb-6 p-4 rounded-xl bg-slate-800/50 border border-white/10 flex items-center gap-3">
            <MapPin className="w-5 h-5 text-slate-400 shrink-0" />
            <div>
              <p className="font-medium text-white">{project.name}</p>
              <p className="text-sm text-slate-400">{project.address}</p>
              {displayAuthType && (
                <p className="text-xs text-slate-500 mt-1">
                  Autorisation : {displayAuthType}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Architect warning */}
        {project.architectRequired && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-300">Architecte obligatoire</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Ce projet nécessite le recours à un architecte. Les documents produits devront être validés par un architecte DPLG/HMONP.
              </p>
            </div>
          </div>
        )}

        {/* Document list */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            Documents qui seront produits
          </h2>
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li
                key={doc.code}
                className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-white/10"
              >
                <span className="text-xs font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-1 rounded shrink-0">
                  {doc.code}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">{doc.label}</p>
                  {doc.description && (
                    <p className="text-xs text-slate-500 mt-0.5">{doc.description}</p>
                  )}
                </div>
                <CheckCircle2 className="w-4 h-4 text-emerald-500/50 shrink-0" />
              </li>
            ))}
          </ul>
          {isPC && (
            <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs font-medium text-amber-300 mb-1">
                <Info className="w-3.5 h-3.5 inline mr-1" />
                Notes complémentaires
              </p>
              <ul className="text-xs text-slate-400 space-y-1">
                {PC_ADDITIONAL_NOTES.map((note, i) => (
                  <li key={i}>• {note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Selected options */}
        {(project.wantPluAnalysis || project.wantCerfaFill) && (
          <div className="mb-6 p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
            <h3 className="text-sm font-medium text-blue-300 mb-2">Options sélectionnées</h3>
            <ul className="space-y-1 text-sm text-slate-300">
              {project.wantPluAnalysis && (
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-400" />
                  Analyse PLU / RNU
                </li>
              )}
              {project.wantCerfaFill && (
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-400" />
                  Pré-remplissage CERFA automatique
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Next steps */}
        <div className="mb-8 p-4 rounded-xl bg-slate-800/30 border border-white/5">
          <h3 className="font-medium text-white mb-2">Prochaines étapes</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-slate-400">
            <li>Après le paiement, complétez la description détaillée de votre projet</li>
            {project.wantPluAnalysis && (
              <li>L&apos;analyse PLU/RNU vérifiera la conformité réglementaire</li>
            )}
            <li>Éditez et exportez vos plans au format PDF</li>
          </ol>
        </div>

        {/* Payment button */}
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
