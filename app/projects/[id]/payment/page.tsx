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
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { cn } from "@/lib/utils";

export default function PaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const { user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [project, setProject] = useState<{
    name?: string;
    address?: string;
    authorizationType?: string;
    authorizationExplanation?: string;
    pluAnalysisCount?: number;
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
  const [error, setError] = useState<string | null>(null);
  const [pricing, setPricing] = useState({ first: 15, relaunch: 5 });

  const success = searchParams.get("success");
  const returnTo = searchParams.get("returnTo");

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}`).then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()).catch(() => ({})),
    ]).then(([projectData, settings]) => {
      if (projectData.project) setProject(projectData.project);
      if (settings.pluFirstAnalysisPriceEur) {
        setPricing({
          first: settings.pluFirstAnalysisPriceEur,
          relaunch: settings.pluRelaunchPriceEur ?? 5,
        });
      }
      setLoading(false);
    });
  }, [projectId]);

  useEffect(() => {
    if (success === "true" && project && !project.paidAt) {
      fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidAt: new Date().toISOString() }),
      }).then(() => {
        router.push(`/projects/${projectId}/dashboard`);
      });
    }
  }, [success, project, projectId, router, returnTo]);

  async function handlePayment() {
    setPaying(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          type: "plu_analysis",
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
        // Demo mode: payment processed immediately
        await fetch(`/api/projects/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paidAt: new Date().toISOString() }),
        });
        router.push(`/projects/${projectId}/dashboard`);
      }
    } catch (err) {
      console.error("Payment failed:", err);
      setError(t("pay.paymentError"));
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

  // If Stripe returned ?success=true, show success screen immediately
  if (success === "true") {
    return (
      <Navigation>
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">{t("pay.confirmed")}</h2>
            <p className="text-sm text-slate-500">{t("pay.activeMessage")}</p>
            <Loader2 className="w-5 h-5 animate-spin text-blue-400 mx-auto" />
          </div>
        </div>
      </Navigation>
    );
  }

  const authType = project?.authorizationType;
  const isDP = authType === "DP";
  const architectRequired = project?.projectDescription?.architectRequired;
  const wantPluAnalysis = project?.projectDescription?.wantPluAnalysis ?? true;
  const wantCerfa = project?.projectDescription?.wantCerfa ?? true;
  const alreadyPaid = !!project?.paidAt;
  const analysisCount = project?.pluAnalysisCount ?? 0;
  const isRelaunch = analysisCount > 0;
  const currentPrice = isRelaunch ? pricing.relaunch : pricing.first;

  if (alreadyPaid && !isRelaunch) {
    return (
      <Navigation>
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">{t("pay.confirmed")}</h2>
            <p className="text-sm text-slate-500">{t("pay.activeMessage")}</p>
            <button
              onClick={() => router.push(`/projects/${projectId}/dashboard`)}
              className="px-8 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 hover:shadow-lg transition-all"
            >
              {t("pay.continueDesc")}
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
            <h1 className="text-2xl font-bold text-slate-900">
              {isRelaunch
                ? (t("pay.processing") === "Processing…" ? "Relaunch PLU Analysis" : "Relancer l'analyse PLU")
                : t("pay.activateTitle")}
            </h1>
            <p className="text-sm text-slate-500">{project?.name}</p>
          </div>

          {/* Summary card */}
          <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm">
            {/* Auth type badge */}
            <div className={cn(
              "px-5 py-4 flex items-center gap-3",
              isDP ? "bg-emerald-50" : "bg-purple-50"
            )}>
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center",
                isDP ? "bg-emerald-100 text-emerald-600" : "bg-purple-100 text-purple-600"
              )}>
                {isDP ? <FileText className="w-5 h-5" /> : <ClipboardCheck className="w-5 h-5" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-900">
                  {isDP ? t("pay.dpLabel") : t("pay.pcLabel")}
                </p>
                <p className="text-xs text-slate-500">
                  {isDP ? t("pay.dpComplete") : t("pay.pcComplete")}
                </p>
              </div>
              <span className={cn(
                "text-lg font-bold",
                isDP ? "text-emerald-600" : "text-purple-600"
              )}>
                {isDP ? "DP" : "PC"}
              </span>
            </div>

            {/* Included items */}
            <div className="px-5 py-4 space-y-2.5 border-t border-slate-100">
              <IncludedItem icon={<FileText className="w-4 h-4" />} label={`${isDP ? "9" : "12"} ${t("pay.regDocs")}`} />
              {wantPluAnalysis && (
                <IncludedItem icon={<Shield className="w-4 h-4" />} label={t("pay.autoAnalysis")} />
              )}
              {wantCerfa && (
                <IncludedItem icon={<Sparkles className="w-4 h-4" />} label={t("pay.autoCerfa")} />
              )}
              <IncludedItem icon={<Check className="w-4 h-4" />} label={t("pay.sitePlan")} />
            </div>
          </div>

          {/* Architect warning */}
          {architectRequired && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-700">{t("pay.architectRequired")}</p>
                <p className="text-xs text-amber-600 mt-1">
                  {t("pay.architectWarning")}
                </p>
              </div>
            </div>
          )}

          {/* Analysis relaunch info */}
          {isRelaunch && (
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 flex items-start gap-3">
              <RefreshCw className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-700">
                  {t("pay.processing") === "Processing…"
                    ? "Analysis relaunch"
                    : "Relance d'analyse"}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  {t("pay.processing") === "Processing…"
                    ? `You have already completed ${analysisCount} analysis${analysisCount > 1 ? "es" : ""}. This relaunch will update your PLU analysis after project modifications.`
                    : `Vous avez déjà effectué ${analysisCount} analyse${analysisCount > 1 ? "s" : ""}. Cette relance mettra à jour votre analyse PLU après modification du projet.`}
                </p>
              </div>
            </div>
          )}

          {/* Payment CTA */}
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-slate-900">
                  {isRelaunch
                    ? (t("pay.processing") === "Processing…" ? "Updated Analysis" : "Analyse mise à jour")
                    : (t("pay.processing") === "Processing…" ? "PLU Analysis" : "Analyse PLU")}
                </p>
                <p className="text-xs text-slate-500">
                  {isRelaunch
                    ? (t("pay.processing") === "Processing…"
                      ? "Additional analysis after project modification"
                      : "Analyse complémentaire après modification du projet")
                    : (t("pay.processing") === "Processing…"
                      ? "Complete regulatory analysis for your project"
                      : "Analyse réglementaire complète pour votre projet")}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-slate-900">{currentPrice} €</p>
              </div>
            </div>

            {/* Price breakdown */}
            <div className="rounded-lg bg-white border border-slate-100 p-3 text-xs text-slate-500 space-y-1">
              {isRelaunch ? (
                <div className="flex justify-between">
                  <span>{t("pay.processing") === "Processing…" ? "Relaunch after modification" : "Relance après modification"}</span>
                  <span className="font-medium text-slate-700">{pricing.relaunch} €</span>
                </div>
              ) : (
                <div className="flex justify-between">
                  <span>{t("pay.processing") === "Processing…" ? "First analysis" : "Première analyse"}</span>
                  <span className="font-medium text-slate-700">{pricing.first} €</span>
                </div>
              )}
              <div className="flex justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-50">
                <span>{t("pay.processing") === "Processing…" ? "Relaunch after modification" : "Relance après modification"}</span>
                <span>{pricing.relaunch} € / {t("pay.processing") === "Processing…" ? "relaunch" : "relance"}</span>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              onClick={handlePayment}
              disabled={paying}
              className="w-full py-3.5 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50 hover:bg-blue-700 hover:shadow-lg transition-all flex items-center justify-center gap-2 text-base"
            >
              {paying ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />{" "}
                  {t("pay.processing")}
                </>
              ) : (
                <>
                  <CreditCard className="w-5 h-5" />{" "}
                  {t("pay.processing") === "Processing…"
                    ? `Pay ${currentPrice} € and start analysis`
                    : `Payer ${currentPrice} € et lancer l'analyse`}
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-4 text-[11px] text-slate-400">
              <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> {t("pay.securePayment")}</span>
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
    <div className="flex items-center gap-2.5 text-sm text-slate-700">
      <span className="text-blue-500">{icon}</span>
      <span>{label}</span>
    </div>
  );
}
