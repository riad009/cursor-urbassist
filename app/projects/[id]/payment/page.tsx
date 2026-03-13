"use client";

import React, { useEffect, useState, use, useCallback } from "react";
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
  Coins,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { cn } from "@/lib/utils";
import {
  getDocumentsForProject,
  type AuthorizationDocument,
} from "@/lib/authorization-documents";
import { CREDIT_COSTS, getBaseFilePrice } from "@/lib/credit-costs";

/* ─── Types ──────────────────────────────────────────────────── */

interface CreditCosts {
  pluFirstAnalysis: number;
  pluRelaunch: number;
}

/* ─── Page ───────────────────────────────────────────────────── */

export default function PaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const { user, refreshUser } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEn = t("auth.next") === "Next";

  /* ─── State ─────────────────────────────────────────────── */
  const [project, setProject] = useState<{
    name?: string;
    address?: string;
    authorizationType?: string;
    projectType?: string;
    pluAnalysisCount?: number;
    protectedAreas?: { type: string; name: string }[];
    regulatoryAnalysis?: { isProtectedArea?: boolean; abfRequired?: boolean; heritageTypes?: string[] };
    projectDescription?: {
      architectRequired?: boolean;
      wantPluAnalysis?: boolean;
      wantCerfa?: boolean;
      categories?: string[];
      workItems?: { projectType: string }[];
    };
    paidAt?: string;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [spending, setSpending] = useState(false);
  const [payingEuro, setPayingEuro] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditCosts, setCreditCosts] = useState<CreditCosts>({
    pluFirstAnalysis: 3,
    pluRelaunch: 1,
  });
  const [euroPrices, setEuroPrices] = useState({ dpFirst: CREDIT_COSTS.DP_FIRST_EUR, dpRelaunch: CREDIT_COSTS.DP_RELAUNCH_EUR, pcFirst: CREDIT_COSTS.PC_FIRST_EUR, pcRelaunch: CREDIT_COSTS.PC_RELAUNCH_EUR });
  const [useCredits, setUseCredits] = useState(false);

  const success = searchParams.get("success");
  const purchasedCredits = searchParams.get("purchasedCredits");

  /* ─── Load data ─────────────────────────────────────────── */
  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}`).then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()).catch(() => ({})),
    ]).then(([projectData, settings]) => {
      if (projectData.project) setProject(projectData.project);
      if (settings.creditCosts) {
        setCreditCosts({
          pluFirstAnalysis: settings.creditCosts.pluFirstAnalysis ?? 3,
          pluRelaunch: settings.creditCosts.pluRelaunch ?? 1,
        });
      }
      setEuroPrices({
        dpFirst: settings.dpFirstPriceEur ?? CREDIT_COSTS.DP_FIRST_EUR,
        dpRelaunch: settings.dpRelaunchPriceEur ?? CREDIT_COSTS.DP_RELAUNCH_EUR,
        pcFirst: settings.pcFirstPriceEur ?? CREDIT_COSTS.PC_FIRST_EUR,
        pcRelaunch: settings.pcRelaunchPriceEur ?? CREDIT_COSTS.PC_RELAUNCH_EUR,
      });
      setLoading(false);
    });
  }, [projectId]);

  // Refresh after credit purchase
  useEffect(() => {
    if (purchasedCredits === "true" || success === "true") refreshUser();
  }, [purchasedCredits, success, refreshUser]);

  // Redirect on legacy Stripe PLU success
  useEffect(() => {
    if (success === "true" && project && !project.paidAt) {
      fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidAt: new Date().toISOString() }),
      }).then(() => router.push(`/projects/${projectId}/project-description`));
    }
  }, [success, project, projectId, router]);

  /* ─── Derived values ────────────────────────────────────── */
  const analysisCount = project?.pluAnalysisCount ?? 0;
  const isRelaunch = analysisCount > 0;
  const creditCost = isRelaunch ? creditCosts.pluRelaunch : creditCosts.pluFirstAnalysis;
  const euroCost = getBaseFilePrice(project?.authorizationType, analysisCount);
  const userCredits = user?.credits ?? 0;
  const hasEnoughCredits = userCredits >= creditCost;

  // Dynamic document data
  const authType = project?.authorizationType;
  const isDP = authType === "DP";
  const isPC = authType === "PC" || authType === "ARCHITECT_REQUIRED";
  const wantPluAnalysis = project?.projectDescription?.wantPluAnalysis ?? false;
  const wantCerfa = project?.projectDescription?.wantCerfa ?? false;

  // ABF detection (same logic as documents page)
  const protectedAreasABF = (project?.protectedAreas || []).some(
    (a) =>
      a.type === "ABF" || a.type === "HERITAGE" || a.type === "abf" ||
      a.type === "heritage" || a.type === "MONUMENT_HISTORIQUE" || a.type === "SITE_PATRIMONIAL"
  );
  const regulatoryABF = project?.regulatoryAnalysis?.isProtectedArea === true ||
    project?.regulatoryAnalysis?.abfRequired === true;
  const hasABF = protectedAreasABF || regulatoryABF;

  // Existing structure detection (same logic as documents page)
  const projectDescCategories = project?.projectDescription?.categories || [];
  const projectDescWorkItems = project?.projectDescription?.workItems || [];
  const isExistingStructure =
    project?.projectType === "extension" ||
    project?.projectType === "existing_extension" ||
    project?.projectType === "renovation" ||
    project?.projectType === "facade_change" ||
    projectDescCategories.includes("existing_extension") ||
    projectDescCategories.includes("renovation") ||
    projectDescWorkItems.some((w) =>
      ["existing_extension", "facade_change"].includes(w.projectType)
    );

  // Get actual document list
  const documents = getDocumentsForProject(authType, { hasABF, isExistingStructure });
  const docCount = documents.length;

  // Calculate dynamic euro price: base + options (using centralized costs)
  const cerfaPrice = CREDIT_COSTS.ADDON_CERFA_EUR;
  const pluPrice = CREDIT_COSTS.ADDON_PLU_ANALYSIS_EUR;
  const baseEuroCost = euroCost;
  const displayEuroCost = baseEuroCost + (wantCerfa ? cerfaPrice : 0) + (wantPluAnalysis ? pluPrice : 0);

  /* ─── Handlers ──────────────────────────────────────────── */
  const handleSpendCredits = useCallback(async () => {
    setSpending(true);
    setError(null);
    try {
      const res = await fetch("/api/credits/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, type: "plu_analysis" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || (isEn ? "Payment failed" : "Échec du paiement"));
        setSpending(false);
        return;
      }
      await refreshUser();
      router.push(`/projects/${projectId}/project-description`);
    } catch {
      setError(isEn ? "An error occurred" : "Une erreur est survenue");
    }
    setSpending(false);
  }, [projectId, refreshUser, router, isEn]);

  const handlePayEuro = useCallback(async () => {
    setPayingEuro(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "plu_analysis",
          projectId,
          isRelaunch,
          successUrl: `/projects/${projectId}/payment?success=true`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || (isEn ? "Payment failed" : "Échec du paiement"));
        setPayingEuro(false);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else if (data.success) {
        await refreshUser();
        router.push(`/projects/${projectId}/project-description`);
      }
    } catch {
      setError(isEn ? "An error occurred" : "Une erreur est survenue");
    }
    setPayingEuro(false);
  }, [projectId, isRelaunch, refreshUser, router, isEn]);

  const handleConfirm = useCallback(() => {
    if (useCredits && hasEnoughCredits) {
      handleSpendCredits();
    } else {
      handlePayEuro();
    }
  }, [useCredits, hasEnoughCredits, handleSpendCredits, handlePayEuro]);

  /* ─── Loading state ────────────────────────────────────── */
  if (loading) {
    return (
      <Navigation>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      </Navigation>
    );
  }

  /* ─── Post-Stripe success ──────────────────────────────── */
  if (success === "true" || purchasedCredits === "true") {
    return (
      <Navigation>
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-sm w-full text-center">
            <div className="w-20 h-20 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center mx-auto mb-5">
              <Check className="w-10 h-10 text-emerald-500" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              {purchasedCredits === "true"
                ? (isEn ? "Credits purchased!" : "Crédits achetés !")
                : (isEn ? "Payment confirmed!" : "Paiement confirmé !")}
            </h2>
            <p className="text-sm text-slate-500 mb-4">
              {purchasedCredits === "true"
                ? (isEn ? "Your credits have been added. You can now use them." : "Vos crédits ont été ajoutés. Vous pouvez les utiliser.")
                : (isEn ? "Your file is active. Redirecting…" : "Votre dossier est actif. Redirection…")}
            </p>
            <Loader2 className="w-5 h-5 animate-spin text-indigo-400 mx-auto" />
          </div>
        </div>
      </Navigation>
    );
  }

  /* ─── Already paid ─────────────────────────────────────── */
  const alreadyPaid = !!project?.paidAt;
  if (alreadyPaid && !isRelaunch) {
    return (
      <Navigation>
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-sm w-full text-center">
            <div className="w-20 h-20 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center mx-auto mb-5">
              <Check className="w-10 h-10 text-emerald-500" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">{t("pay.confirmed")}</h2>
            <p className="text-sm text-slate-500 mb-5">{t("pay.activeMessage")}</p>
            <button
              onClick={() => router.push(`/projects/${projectId}/project-description`)}
              className="px-8 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors"
            >
              {t("pay.continueDesc")}
            </button>
          </div>
        </div>
      </Navigation>
    );
  }

  /* ─── Feature list: dynamic based on actual documents and selections ── */
  const isProcessing = spending || payingEuro;

  // Permit type labels
  const permitLabel = isPC ? t("pay.pcLabel") : t("pay.dpLabel");
  const permitSubLabel = isPC ? t("pay.pcComplete") : t("pay.dpComplete");
  const permitCode = isPC ? "PC" : "DP";

  // Build the feature list matching client demo exactly
  const featureItems: { label: string; included: boolean; isDocCount?: boolean }[] = [
    // First item: document count (always included, with file icon)
    {
      label: `${docCount} ${t("pay.regDocs")}`,
      included: true,
      isDocCount: true,
    },
    // Automatic regulatory analysis — depends on user selection
    {
      label: t("pay.autoAnalysis"),
      included: wantPluAnalysis,
    },
    // Automatic CERFA form completion — depends on user selection
    {
      label: t("pay.autoCerfaCompletion"),
      included: wantCerfa,
    },
    // Site plan + floor plan — always included
    {
      label: t("pay.sitePlan"),
      included: true,
    },
    // Automatically generated graphic elements — always included
    {
      label: t("pay.autoGraphics"),
      included: true,
    },
    // Descriptive information automatically generated — always included
    {
      label: t("pay.autoDescription"),
      included: true,
    },
  ];

  return (
    <Navigation>
      <div
        className="min-h-screen flex items-start justify-center p-4 lg:p-8"
        style={{ background: "linear-gradient(180deg, #f0f4ff 0%, #f8fafc 50%)" }}
      >
        <div className="w-full max-w-[560px] space-y-6 pt-6">

          {/* ═══ Header ═══ */}
          <div className="text-center space-y-1.5">
            <h1 className="text-2xl font-bold text-slate-900">
              {t("pay.accessEditor")}
            </h1>
            <p className="text-sm text-slate-400">
              {project?.name || (isEn ? "Your project" : "Votre projet")}
            </p>
          </div>

          {/* ═══ Main Permit Card ═══ */}
          <div className="rounded-2xl bg-white border border-slate-200 shadow-[0_4px_24px_rgba(0,0,0,0.06)] overflow-hidden">

            {/* ── Permit Header ── */}
            <div className="px-6 pt-6 pb-4 flex items-start justify-between">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                  {isDP
                    ? <FileText className="w-5 h-5 text-amber-600" />
                    : <ClipboardCheck className="w-5 h-5 text-amber-600" />}
                </div>
                <div>
                  <p className="text-base font-bold text-slate-900">
                    {permitLabel}
                  </p>
                  <p className="text-xs text-amber-600 font-medium mt-0.5">
                    {permitSubLabel}
                  </p>
                </div>
              </div>
              <span className={cn(
                "text-sm font-bold px-3 py-1.5 rounded-lg",
                isDP ? "bg-emerald-50 text-emerald-600" : "bg-purple-50 text-purple-600"
              )}>
                {permitCode}
              </span>
            </div>

            {/* ── Feature Checklist ── */}
            <div className="px-6 pb-5 space-y-3">
              {featureItems.map((feat, i) => (
                <div key={i} className="flex items-center gap-3">
                  {/* Icon */}
                  {feat.isDocCount ? (
                    <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                  ) : feat.included ? (
                    <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-slate-200 shrink-0" />
                  )}
                  {/* Label — strikethrough when not included */}
                  <span
                    className={cn(
                      "text-sm",
                      feat.included
                        ? "text-slate-700"
                        : "text-slate-400 line-through"
                    )}
                  >
                    {feat.label}
                  </span>
                </div>
              ))}
            </div>

            {/* ── Divider ── */}
            <div className="mx-6 border-t border-slate-100" />

            {/* ── Price Footer ── */}
            <div className="px-6 py-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-900">{t("pay.completeFile")}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {t("pay.currentBalance")}: {userCredits} {isEn ? "credits" : "crédits"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-slate-900">
                  {useCredits && hasEnoughCredits
                    ? <>{creditCost} <span className="text-sm font-medium text-slate-400">{isEn ? "credits" : "crédits"}</span></>
                    : <>€ {displayEuroCost.toFixed(2)}</>}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{t("pay.byFile")}</p>
              </div>
            </div>
          </div>

          {/* ═══ Credit Toggle (if user has enough credits) ═══ */}
          {hasEnoughCredits && (
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setUseCredits(!useCredits)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border",
                  useCredits
                    ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                    : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                )}
              >
                <Coins className="w-4 h-4" />
                {useCredits
                  ? (isEn ? `Pay with ${creditCost} credits instead` : `Payer avec ${creditCost} crédits`)
                  : (isEn ? `Use credits (${userCredits} available)` : `Utiliser des crédits (${userCredits} disponibles)`)}
                {useCredits && <Check className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}

          {/* ═══ Relaunch Banner ═══ */}
          {isRelaunch && (
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 flex items-start gap-3">
              <RefreshCw className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-700">
                  {isEn ? "Analysis relaunch" : "Relance d'analyse"}
                </p>
                <p className="text-xs text-blue-600 mt-0.5">
                  {isEn
                    ? `You have completed ${analysisCount} analysis${analysisCount > 1 ? "es" : ""}. Relaunch pricing applies.`
                    : `Vous avez effectué ${analysisCount} analyse${analysisCount > 1 ? "s" : ""}. Le tarif de relance s'applique.`}
                </p>
              </div>
            </div>
          )}

          {/* ═══ Error ═══ */}
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* ═══ CTA Button ═══ */}
          <button
            onClick={handleConfirm}
            disabled={isProcessing}
            className="w-full py-4 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-50 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2.5 text-[15px] shadow-lg shadow-indigo-200"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {isEn ? "Processing…" : "Traitement…"}
              </>
            ) : (
              <>
                <FileText className="w-5 h-5" />
                {t("pay.confirmAccess")}
              </>
            )}
          </button>

          {/* ═══ Secure Stripe Footer ═══ */}
          <div className="flex items-center justify-center gap-2 text-xs text-slate-400 pb-8">
            <Lock className="w-3.5 h-3.5" />
            <span>{t("pay.secureStripe")}</span>
          </div>

        </div>
      </div>
    </Navigation>
  );
}
