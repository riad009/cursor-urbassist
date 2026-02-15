"use client";

import React, { useEffect, useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navigation from "@/components/layout/Navigation";
import {
  CreditCard,
  FileText,
  ClipboardCheck,
  AlertTriangle,
  Loader2,
  Check,
  Shield,
  Sparkles,
  Lock,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export default function PaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [project, setProject] = useState<{
    name?: string;
    address?: string;
    authorizationType?: string;
    authorizationExplanation?: string;
    projectDescription?: {
      architectRequired?: boolean;
      wantPluAnalysis?: boolean;
      wantCerfa?: boolean;
      category?: string;
    };
    paidAt?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [credits, setCredits] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Check for successful payment return
  const success = searchParams.get("success");

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}`).then((r) => r.json()),
      fetch("/api/credits").then((r) => r.json()).catch(() => ({ credits: 0 })),
    ]).then(([projectData, creditsData]) => {
      if (projectData.project) setProject(projectData.project);
      setCredits(creditsData.credits ?? 0);
      setLoading(false);
    });
  }, [projectId]);

  // Handle successful Stripe return
  useEffect(() => {
    if (success === "true" && project && !project.paidAt) {
      fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidAt: new Date().toISOString() }),
      }).then(() => {
        router.push(`/projects/${projectId}/description`);
      });
    }
  }, [success, project, projectId, router]);

  async function handlePayment() {
    setPaying(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          type: "credits",
          packageId: "credits-10",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Payment failed");
        setPaying(false);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else if (data.success) {
        // Direct credit usage (demo mode)
        await fetch(`/api/projects/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paidAt: new Date().toISOString() }),
        });
        router.push(`/projects/${projectId}/description`);
      }
    } catch (err) {
      console.error("Payment failed:", err);
      setError("Une erreur est survenue lors du paiement");
    }
    setPaying(false);
  }

  if (loading) {
    return (
      <Navigation>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </Navigation>
    );
  }

  const authType = project?.authorizationType;
  const isDP = authType === "DP";
  const isPC = authType === "PC" || authType === "ARCHITECT_REQUIRED";
  const architectRequired = project?.projectDescription?.architectRequired;
  const wantPluAnalysis = project?.projectDescription?.wantPluAnalysis ?? true;
  const wantCerfa = project?.projectDescription?.wantCerfa ?? true;
  const alreadyPaid = !!project?.paidAt;

  if (alreadyPaid) {
    return (
      <Navigation>
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Paiement confirmé</h2>
            <p className="text-sm text-slate-400">Votre dossier est actif. Vous pouvez continuer.</p>
            <button
              onClick={() => router.push(`/projects/${projectId}/description`)}
              className="px-8 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:shadow-lg hover:shadow-purple-500/20 transition-all"
            >
              Continuer vers la description
            </button>
          </div>
        </div>
      </Navigation>
    );
  }

  return (
    <Navigation>
      <div className="min-h-screen p-4 lg:p-8 flex items-start justify-center">
        <div className="max-w-lg w-full space-y-5">

          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-white">Activer votre dossier</h1>
            <p className="text-sm text-slate-400">{project?.name}</p>
          </div>

          {/* Summary card — concise */}
          <div className="rounded-2xl bg-slate-800/60 border border-white/10 overflow-hidden">
            {/* Auth type badge */}
            <div className={cn(
              "px-5 py-4 flex items-center gap-3",
              isDP ? "bg-emerald-500/10" : "bg-purple-500/10"
            )}>
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center",
                isDP ? "bg-emerald-500/20 text-emerald-400" : "bg-purple-500/20 text-purple-400"
              )}>
                {isDP ? <FileText className="w-5 h-5" /> : <ClipboardCheck className="w-5 h-5" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-white">
                  {isDP ? "Déclaration Préalable" : "Permis de Construire"}
                </p>
                <p className="text-xs text-slate-400">
                  {isDP ? "Dossier DP complet" : "Dossier PC complet"}
                </p>
              </div>
              <span className={cn(
                "text-lg font-bold",
                isDP ? "text-emerald-400" : "text-purple-400"
              )}>
                {isDP ? "DP" : "PC"}
              </span>
            </div>

            {/* Included items */}
            <div className="px-5 py-4 space-y-2.5 border-t border-white/5">
              <IncludedItem icon={<FileText className="w-4 h-4" />} label={`${isDP ? "9" : "12"} documents réglementaires`} />
              {wantPluAnalysis && (
                <IncludedItem icon={<Shield className="w-4 h-4" />} label="Analyse réglementaire automatique" />
              )}
              {wantCerfa && (
                <IncludedItem icon={<Sparkles className="w-4 h-4" />} label="Remplissage CERFA automatique" />
              )}
              <IncludedItem icon={<Check className="w-4 h-4" />} label="Plan de situation + plan de masse" />
            </div>
          </div>

          {/* Architect warning */}
          {architectRequired && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-300">Architecte obligatoire</p>
                <p className="text-xs text-amber-200/70 mt-1">
                  Votre projet nécessite un architecte DPLG. UrbAssist prépare le dossier, mais les plans devront être validés par un architecte.
                </p>
              </div>
            </div>
          )}

          {/* Payment CTA */}
          <div className="rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-white">1 crédit</p>
                <p className="text-xs text-slate-400">Solde actuel : {credits} crédits</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-white">9,90 €</p>
                <p className="text-[11px] text-slate-500">par dossier</p>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-2 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              onClick={handlePayment}
              disabled={paying}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold disabled:opacity-50 hover:shadow-lg hover:shadow-purple-500/25 transition-all flex items-center justify-center gap-2 text-base"
            >
              {paying ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Chargement…</>
              ) : credits > 0 ? (
                <><CreditCard className="w-5 h-5" /> Payer avec un crédit</>
              ) : (
                <><CreditCard className="w-5 h-5" /> Acheter et activer</>
              )}
            </button>

            <div className="flex items-center justify-center gap-4 text-[11px] text-slate-500">
              <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Paiement sécurisé</span>
              <span>Stripe</span>
            </div>
          </div>

        </div>
      </div>
    </Navigation>
  );
}

function IncludedItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-slate-300">
      <span className="text-blue-400/60">{icon}</span>
      <span>{label}</span>
    </div>
  );
}
