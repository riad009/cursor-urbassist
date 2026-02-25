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
  Package,
  Euro,
  Zap,
  Star,
  Gift,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { cn } from "@/lib/utils";

/* ─── Types ──────────────────────────────────────────────────── */

interface CreditPackage {
  id: string;
  credits: number;
  price: number;
  label: string;
  priceFormatted: string;
  pricePerCredit: string;
  popular?: boolean;
}

interface CreditCosts {
  pluFirstAnalysis: number;
  pluRelaunch: number;
}

type PaymentMode = "credits" | "euros";

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
    pluAnalysisCount?: number;
    projectDescription?: {
      architectRequired?: boolean;
      wantPluAnalysis?: boolean;
      wantCerfa?: boolean;
    };
    paidAt?: string;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [spending, setSpending] = useState(false);
  const [buyingCredits, setBuyingCredits] = useState(false);
  const [payingEuro, setPayingEuro] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("credits");
  const [creditCosts, setCreditCosts] = useState<CreditCosts>({
    pluFirstAnalysis: 3,
    pluRelaunch: 1,
  });
  const [euroPrices, setEuroPrices] = useState({ first: 15, relaunch: 5 });
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [showPackages, setShowPackages] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);

  const success = searchParams.get("success");
  const purchasedCredits = searchParams.get("purchasedCredits");

  /* ─── Load data ─────────────────────────────────────────── */
  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}`).then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()).catch(() => ({})),
      fetch("/api/stripe/checkout").then((r) => r.json()).catch(() => ({ packages: [] })),
    ]).then(([projectData, settings, checkoutData]) => {
      if (projectData.project) setProject(projectData.project);
      if (settings.creditCosts) {
        setCreditCosts({
          pluFirstAnalysis: settings.creditCosts.pluFirstAnalysis ?? 3,
          pluRelaunch: settings.creditCosts.pluRelaunch ?? 1,
        });
      }
      setEuroPrices({
        first: settings.pluFirstAnalysisPriceEur ?? 15,
        relaunch: settings.pluRelaunchPriceEur ?? 5,
      });
      if (checkoutData.packages) {
        setPackages(
          checkoutData.packages.map((p: CreditPackage, i: number) => ({
            ...p,
            popular: i === 1,
          }))
        );
      }
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
      }).then(() => router.push(`/projects/${projectId}/dashboard`));
    }
  }, [success, project, projectId, router]);

  /* ─── Derived values ────────────────────────────────────── */
  const analysisCount = project?.pluAnalysisCount ?? 0;
  const isRelaunch = analysisCount > 0;
  const creditCost = isRelaunch ? creditCosts.pluRelaunch : creditCosts.pluFirstAnalysis;
  const euroCost = isRelaunch ? euroPrices.relaunch : euroPrices.first;
  const userCredits = user?.credits ?? 0;
  const hasEnoughCredits = userCredits >= creditCost;

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
      router.push(`/projects/${projectId}/dashboard`);
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
        // Demo mode
        await refreshUser();
        router.push(`/projects/${projectId}/dashboard`);
      }
    } catch {
      setError(isEn ? "An error occurred" : "Une erreur est survenue");
    }
    setPayingEuro(false);
  }, [projectId, isRelaunch, refreshUser, router, isEn]);

  const handleBuyCredits = useCallback(async (packageId: string) => {
    setBuyingCredits(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "credits",
          packageId,
          projectId,
          successUrl: `/projects/${projectId}/payment?purchasedCredits=true`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || (isEn ? "Purchase failed" : "Échec de l'achat"));
        setBuyingCredits(false);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else if (data.success) {
        await refreshUser();
        setShowPackages(false);
      }
    } catch {
      setError(isEn ? "An error occurred" : "Une erreur est survenue");
    }
    setBuyingCredits(false);
  }, [projectId, refreshUser, isEn]);

  /* ─── Loading ───────────────────────────────────────────── */
  if (loading) {
    return (
      <Navigation>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </Navigation>
    );
  }

  /* ─── Post-Stripe success ───────────────────────────────── */
  if (success === "true" || purchasedCredits === "true") {
    return (
      <Navigation>
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mx-auto shadow-lg shadow-emerald-200">
              <Check className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">
              {purchasedCredits === "true"
                ? (isEn ? "Credits purchased!" : "Crédits achetés !")
                : (isEn ? "Payment confirmed!" : "Paiement confirmé !")}
            </h2>
            <p className="text-sm text-slate-500">
              {purchasedCredits === "true"
                ? (isEn ? "Your credits have been added. You can now use them." : "Vos crédits ont été ajoutés. Vous pouvez les utiliser.")
                : (isEn ? "Your file is active. Redirecting…" : "Votre dossier est actif. Redirection…")}
            </p>
            <Loader2 className="w-5 h-5 animate-spin text-blue-400 mx-auto" />
          </div>
        </div>
      </Navigation>
    );
  }

  /* ─── Already paid ──────────────────────────────────────── */
  const alreadyPaid = !!project?.paidAt;
  if (alreadyPaid && !isRelaunch) {
    return (
      <Navigation>
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mx-auto shadow-lg shadow-emerald-200">
              <Check className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">{t("pay.confirmed")}</h2>
            <p className="text-sm text-slate-500">{t("pay.activeMessage")}</p>
            <button
              onClick={() => router.push(`/projects/${projectId}/dashboard`)}
              className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold hover:shadow-lg hover:shadow-blue-200 transition-all"
            >
              {t("pay.continueDesc")}
            </button>
          </div>
        </div>
      </Navigation>
    );
  }

  /* ─── Vars ──────────────────────────────────────────────── */
  const authType = project?.authorizationType;
  const isDP = authType === "DP";
  const architectRequired = project?.projectDescription?.architectRequired;
  const wantPluAnalysis = project?.projectDescription?.wantPluAnalysis ?? true;
  const wantCerfa = project?.projectDescription?.wantCerfa ?? true;

  return (
    <Navigation>
      <div className="min-h-screen p-4 lg:p-8 flex items-start justify-center">
        <div className="max-w-xl w-full space-y-5">

          {/* ═══ Header ═══ */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-semibold">
              <Zap className="w-3.5 h-3.5" />
              {isRelaunch ? (isEn ? "Updated Analysis" : "Analyse mise à jour") : (isEn ? "File activation" : "Activation du dossier")}
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {isRelaunch
                ? (isEn ? "Relaunch PLU Analysis" : "Relancer l'analyse PLU")
                : (isEn ? "Activate your file" : "Activer votre dossier")}
            </h1>
            <p className="text-sm text-slate-500">{project?.name}</p>
          </div>

          {/* ═══ Dual Currency Toggle ═══ */}
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            {/* Toggle tabs */}
            <div className="flex p-1.5 bg-slate-100/80">
              <button
                onClick={() => setPaymentMode("credits")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-300",
                  paymentMode === "credits"
                    ? "bg-white text-indigo-700 shadow-md shadow-indigo-100/50"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                <Coins className="w-4.5 h-4.5" />
                {isEn ? "Pay with Credits" : "Payer en Crédits"}
                {hasEnoughCredits && paymentMode !== "credits" && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </button>
              <button
                onClick={() => setPaymentMode("euros")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-300",
                  paymentMode === "euros"
                    ? "bg-white text-emerald-700 shadow-md shadow-emerald-100/50"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                <Euro className="w-4.5 h-4.5" />
                {isEn ? "Pay in Euros" : "Payer en Euros"}
              </button>
            </div>

            {/* ═══ Credits Mode ═══ */}
            {paymentMode === "credits" && (
              <div className="p-5 space-y-4">
                {/* Balance banner */}
                <div className="rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-600 p-5 text-white relative overflow-hidden">
                  {/* Decorative circles */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
                        <Coins className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-white/60 uppercase tracking-wider">
                          {isEn ? "Your balance" : "Votre solde"}
                        </p>
                        <p className="text-3xl font-black tracking-tight">{userCredits}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-white/60">
                        {isEn ? "Analysis cost" : "Coût de l'analyse"}
                      </p>
                      <div className="flex items-baseline gap-1 justify-end">
                        <p className="text-3xl font-black">{creditCost}</p>
                        <p className="text-sm text-white/70 font-medium">cr.</p>
                      </div>
                    </div>
                  </div>
                  {/* Sufficiency bar */}
                  <div className="mt-4 relative">
                    <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.min(100, (userCredits / Math.max(creditCost, 1)) * 100)}%`,
                          background: hasEnoughCredits
                            ? "linear-gradient(90deg, #34d399, #10b981)"
                            : "linear-gradient(90deg, #fb923c, #f97316)",
                        }}
                      />
                    </div>
                    <p className="text-[11px] mt-1.5 text-white/70">
                      {hasEnoughCredits
                        ? (isEn ? `${userCredits - creditCost} credits remaining after payment` : `${userCredits - creditCost} crédits restants après paiement`)
                        : (isEn ? `Need ${creditCost - userCredits} more credit${creditCost - userCredits > 1 ? "s" : ""}` : `Il manque ${creditCost - userCredits} crédit${creditCost - userCredits > 1 ? "s" : ""}`)}
                    </p>
                  </div>
                </div>

                {/* Savings badge */}
                {hasEnoughCredits && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    <p className="text-xs text-emerald-700 font-medium">
                      {isEn
                        ? `You save €${(euroCost - (creditCost * 3.3)).toFixed(2)} compared to direct euro payment`
                        : `Vous économisez ${(euroCost - (creditCost * 3.3)).toFixed(2)} € par rapport au paiement direct en euros`}
                    </p>
                  </div>
                )}

                {/* Pay button or buy credits */}
                {hasEnoughCredits ? (
                  <button
                    onClick={handleSpendCredits}
                    disabled={spending}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold disabled:opacity-50 hover:from-indigo-700 hover:to-purple-700 hover:shadow-xl hover:shadow-indigo-200 transition-all flex items-center justify-center gap-3 text-base relative overflow-hidden group"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                    {spending ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {isEn ? "Processing…" : "Traitement…"}
                      </>
                    ) : (
                      <>
                        <Coins className="w-5 h-5" />
                        {isEn
                          ? `Pay ${creditCost} credits · Start analysis`
                          : `Payer ${creditCost} crédits · Lancer l'analyse`}
                      </>
                    )}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        {isEn
                          ? `You need ${creditCost - userCredits} more credit${creditCost - userCredits > 1 ? "s" : ""}. Buy a credit package below, or switch to Euro payment.`
                          : `Il vous manque ${creditCost - userCredits} crédit${creditCost - userCredits > 1 ? "s" : ""}. Achetez un pack ci-dessous, ou passez au paiement en euros.`}
                      </span>
                    </div>
                    <button
                      onClick={() => setShowPackages(!showPackages)}
                      className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold hover:from-emerald-600 hover:to-teal-700 hover:shadow-xl hover:shadow-emerald-200 transition-all flex items-center justify-center gap-2 text-base"
                    >
                      <Package className="w-5 h-5" />
                      {isEn ? "Buy Credit Package" : "Acheter un pack de crédits"}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Credit packages grid */}
                {showPackages && packages.length > 0 && (
                  <div className="space-y-3 pt-1">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">
                      {isEn ? "Select a package" : "Choisissez un pack"}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {packages.map((pkg) => {
                        const isSelected = selectedPackage === pkg.id;
                        const coversNeed = pkg.credits >= (creditCost - userCredits);
                        return (
                          <button
                            key={pkg.id}
                            onClick={() => { setSelectedPackage(pkg.id); handleBuyCredits(pkg.id); }}
                            disabled={buyingCredits}
                            className={cn(
                              "relative rounded-2xl border-2 p-4 text-left transition-all disabled:opacity-50 group",
                              isSelected
                                ? "border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-100"
                                : coversNeed
                                  ? "border-emerald-300 bg-gradient-to-br from-white to-emerald-50/50 hover:border-emerald-400 hover:shadow-md hover:shadow-emerald-100"
                                  : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                            )}
                          >
                            {pkg.popular && (
                              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-[9px] font-bold px-3 py-0.5 rounded-full shadow-sm flex items-center gap-1">
                                <Star className="w-2.5 h-2.5" /> POPULAR
                              </span>
                            )}
                            {coversNeed && !pkg.popular && (
                              <span className="absolute -top-2 -right-2 bg-emerald-500 text-white text-[9px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-sm">
                                ✓
                              </span>
                            )}
                            <div className="flex items-baseline gap-1">
                              <p className="text-2xl font-black text-slate-900">{pkg.credits}</p>
                              <p className="text-xs text-slate-400 font-medium">cr.</p>
                            </div>
                            <p className="text-base font-bold text-indigo-600 mt-1">{pkg.priceFormatted}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {pkg.pricePerCredit}/{isEn ? "credit" : "crédit"}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                    {buyingCredits && (
                      <div className="flex items-center justify-center gap-2 text-sm text-indigo-600 py-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {isEn ? "Redirecting to payment…" : "Redirection vers le paiement…"}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ═══ Euros Mode ═══ */}
            {paymentMode === "euros" && (
              <div className="p-5 space-y-4">
                {/* Euro price display */}
                <div className="rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 p-5 text-white relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
                        <Euro className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-white/60 uppercase tracking-wider">
                          {isEn ? "Direct payment" : "Paiement direct"}
                        </p>
                        <p className="text-sm text-white/80 mt-0.5">
                          {isRelaunch
                            ? (isEn ? "Relaunch analysis" : "Relance d'analyse")
                            : (isEn ? "First PLU analysis" : "Première analyse PLU")}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-baseline gap-1 justify-end">
                        <p className="text-4xl font-black">€{euroCost}</p>
                      </div>
                      <p className="text-xs text-white/60 mt-0.5">
                        {isEn ? "one-time payment" : "paiement unique"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Credit suggestion */}
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-200">
                  <Gift className="w-5 h-5 text-indigo-500 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs text-indigo-700 font-medium">
                      {isEn
                        ? "Save more with credits! Buy a credit pack for better value."
                        : "Économisez avec les crédits ! Achetez un pack pour un meilleur rapport qualité-prix."}
                    </p>
                  </div>
                  <button
                    onClick={() => setPaymentMode("credits")}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-700 whitespace-nowrap"
                  >
                    {isEn ? "Switch" : "Basculer"} →
                  </button>
                </div>

                {/* Stripe checkout button */}
                <button
                  onClick={handlePayEuro}
                  disabled={payingEuro}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold disabled:opacity-50 hover:from-emerald-700 hover:to-teal-700 hover:shadow-xl hover:shadow-emerald-200 transition-all flex items-center justify-center gap-3 text-base relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                  {payingEuro ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {isEn ? "Redirecting to Stripe…" : "Redirection vers Stripe…"}
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5" />
                      {isEn ? `Pay €${euroCost} with Stripe` : `Payer ${euroCost} € avec Stripe`}
                    </>
                  )}
                </button>

                <div className="flex items-center justify-center gap-6 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> {isEn ? "Secure checkout" : "Paiement sécurisé"}</span>
                  <span className="flex items-center gap-1"><CreditCard className="w-3 h-3" /> Stripe</span>
                  <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> SSL</span>
                </div>
              </div>
            )}
          </div>

          {/* ═══ Summary Card ═══ */}
          <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm">
            <div className={cn(
              "px-5 py-4 flex items-center gap-3",
              isDP ? "bg-gradient-to-r from-emerald-50 to-teal-50" : "bg-gradient-to-r from-violet-50 to-purple-50"
            )}>
              <div className={cn(
                "w-11 h-11 rounded-2xl flex items-center justify-center",
                isDP ? "bg-emerald-100 text-emerald-600" : "bg-purple-100 text-purple-600"
              )}>
                {isDP ? <FileText className="w-5 h-5" /> : <ClipboardCheck className="w-5 h-5" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-900">{isDP ? t("pay.dpLabel") : t("pay.pcLabel")}</p>
                <p className="text-xs text-slate-500">{isDP ? t("pay.dpComplete") : t("pay.pcComplete")}</p>
              </div>
              <span className={cn(
                "text-lg font-black",
                isDP ? "text-emerald-600" : "text-purple-600"
              )}>
                {isDP ? "DP" : "PC"}
              </span>
            </div>
            <div className="px-5 py-4 space-y-2.5 border-t border-slate-100">
              <IncItem icon={<FileText className="w-4 h-4" />} label={`${isDP ? "9" : "12"} ${t("pay.regDocs")}`} />
              {wantPluAnalysis && <IncItem icon={<Shield className="w-4 h-4" />} label={t("pay.autoAnalysis")} />}
              {wantCerfa && <IncItem icon={<Sparkles className="w-4 h-4" />} label={t("pay.autoCerfa")} />}
              <IncItem icon={<Check className="w-4 h-4" />} label={t("pay.sitePlan")} />
            </div>
          </div>

          {/* ═══ Architect warning ═══ */}
          {architectRequired && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-700">{t("pay.architectRequired")}</p>
                <p className="text-xs text-amber-600 mt-1">{t("pay.architectWarning")}</p>
              </div>
            </div>
          )}

          {/* ═══ Relaunch info ═══ */}
          {isRelaunch && (
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 flex items-start gap-3">
              <RefreshCw className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-700">
                  {isEn ? "Analysis relaunch" : "Relance d'analyse"}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  {isEn
                    ? `You have completed ${analysisCount} analysis${analysisCount > 1 ? "es" : ""}. This relaunch costs ${paymentMode === "credits" ? `${creditCost} credit${creditCost > 1 ? "s" : ""}` : `€${euroCost}`}.`
                    : `Vous avez effectué ${analysisCount} analyse${analysisCount > 1 ? "s" : ""}. Cette relance coûte ${paymentMode === "credits" ? `${creditCost} crédit${creditCost > 1 ? "s" : ""}` : `${euroCost} €`}.`}
                </p>
              </div>
            </div>
          )}

          {/* ═══ Pricing breakdown ═══ */}
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
              {isEn ? "Pricing" : "Tarification"}
            </p>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-600">{isEn ? "First analysis" : "Première analyse"}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium bg-white px-2 py-0.5 rounded-lg border border-slate-100">
                    {creditCosts.pluFirstAnalysis} cr.
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-xs text-slate-400 font-medium bg-white px-2 py-0.5 rounded-lg border border-slate-100">
                    €{euroPrices.first}
                  </span>
                </div>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-600">{isEn ? "Relaunch" : "Relance"}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium bg-white px-2 py-0.5 rounded-lg border border-slate-100">
                    {creditCosts.pluRelaunch} cr.
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-xs text-slate-400 font-medium bg-white px-2 py-0.5 rounded-lg border border-slate-100">
                    €{euroPrices.relaunch}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Security footer */}
          <div className="flex items-center justify-center gap-5 text-[11px] text-slate-400 pb-4">
            <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> {t("pay.securePayment")}</span>
            <span>Stripe</span>
            <span>SSL 256-bit</span>
          </div>
        </div>
      </div>
    </Navigation>
  );
}

/* ─── Components ─────────────────────────────────────────── */

function IncItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-slate-700">
      <span className="text-blue-500">{icon}</span>
      <span>{label}</span>
    </div>
  );
}
