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
  Euro,
  Zap,
  Star,
  ChevronDown,
  ChevronUp,
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
  const [creditCosts, setCreditCosts] = useState<CreditCosts>({
    pluFirstAnalysis: 3,
    pluRelaunch: 1,
  });
  const [euroPrices, setEuroPrices] = useState({ first: 15, relaunch: 5 });
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [showPackages, setShowPackages] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"credits" | "euro">("credits");

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
              onClick={() => router.push(`/projects/${projectId}/dashboard`)}
              className="px-8 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors"
            >
              {t("pay.continueDesc")}
            </button>
          </div>
        </div>
      </Navigation>
    );
  }

  /* ─── Derived display vars ─────────────────────────────── */
  const authType = project?.authorizationType;
  const isDP = authType === "DP";
  const architectRequired = project?.projectDescription?.architectRequired;
  const wantPluAnalysis = project?.projectDescription?.wantPluAnalysis ?? true;
  const wantCerfa = project?.projectDescription?.wantCerfa ?? true;

  return (
    <Navigation>
      <div className="min-h-screen p-4 lg:p-8 flex items-start justify-center">
        <div className="w-full max-w-[520px] space-y-5">

          {/* ═══ Header ═══ */}
          <div className="text-center space-y-2 pt-2">
            <h1 className="text-2xl font-bold text-slate-900">
              {isEn ? "Payment" : "Paiement"}
            </h1>
            <p className="text-sm text-slate-400">
              {isEn ? "Choose how you'd like to pay" : "Choisissez votre mode de paiement"}
            </p>
          </div>

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

          {/* ═══ Main Payment Card ═══ */}
          <div className="rounded-2xl bg-white border border-slate-200 shadow-[0_2px_16px_rgba(0,0,0,0.06)] overflow-hidden">

            {/* ── Payment Method Tabs ── */}
            <div className="flex border-b border-slate-100">
              <button
                type="button"
                onClick={() => setPaymentMethod("credits")}
                className={cn(
                  "flex-1 px-4 py-4 flex items-center justify-center gap-2.5 text-sm font-semibold transition-all relative",
                  paymentMethod === "credits"
                    ? "text-indigo-600"
                    : "text-slate-400 hover:text-slate-600"
                )}
              >
                <Coins className="w-4 h-4" />
                {isEn ? "Credits" : "Crédits"}
                {paymentMethod === "credits" && (
                  <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-indigo-600 rounded-full" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("euro")}
                className={cn(
                  "flex-1 px-4 py-4 flex items-center justify-center gap-2.5 text-sm font-semibold transition-all relative",
                  paymentMethod === "euro"
                    ? "text-indigo-600"
                    : "text-slate-400 hover:text-slate-600"
                )}
              >
                <CreditCard className="w-4 h-4" />
                {isEn ? "Credit Card" : "Carte bancaire"}
                {paymentMethod === "euro" && (
                  <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-indigo-600 rounded-full" />
                )}
              </button>
            </div>

            {/* ── Credits Panel ── */}
            {paymentMethod === "credits" && (
              <div className="p-6 space-y-5">
                {/* Balance & Cost */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                      {isEn ? "Cost" : "Coût"}
                    </p>
                    <p className="text-3xl font-black text-slate-900 mt-1">
                      {creditCost} <span className="text-base font-semibold text-slate-400">{isEn ? "credits" : "crédits"}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                      {isEn ? "Your balance" : "Votre solde"}
                    </p>
                    <p className={cn(
                      "text-3xl font-black mt-1",
                      hasEnoughCredits ? "text-emerald-600" : "text-amber-500"
                    )}>
                      {userCredits}
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.min(100, (userCredits / Math.max(creditCost, 1)) * 100)}%`,
                        background: hasEnoughCredits
                          ? "linear-gradient(90deg, #34d399, #10b981)"
                          : "linear-gradient(90deg, #fbbf24, #f59e0b)",
                      }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5">
                    {hasEnoughCredits
                      ? (isEn
                        ? `${userCredits - creditCost} credits remaining after payment`
                        : `${userCredits - creditCost} crédits restants après paiement`)
                      : (isEn
                        ? `You need ${creditCost - userCredits} more credit${creditCost - userCredits > 1 ? "s" : ""}`
                        : `Il vous manque ${creditCost - userCredits} crédit${creditCost - userCredits > 1 ? "s" : ""}`)}
                  </p>
                </div>

                {/* Pay / Buy buttons */}
                {hasEnoughCredits ? (
                  <div className="space-y-3">
                    <button
                      onClick={handleSpendCredits}
                      disabled={spending}
                      className="w-full py-3.5 rounded-xl bg-slate-900 text-white font-semibold disabled:opacity-50 hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      {spending ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> {isEn ? "Processing…" : "Traitement…"}</>
                      ) : (
                        <>{isEn ? `Pay ${creditCost} credits` : `Payer ${creditCost} crédits`} <ArrowRight className="w-4 h-4" /></>
                      )}
                    </button>
                    <p className="text-xs text-center text-slate-400">
                      {isEn ? "Deducted instantly from your balance" : "Déduit instantanément de votre solde"}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button
                      onClick={() => setShowPackages(!showPackages)}
                      className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      <Coins className="w-4 h-4" />
                      {isEn ? "Buy Credits" : "Acheter des crédits"}
                      {showPackages ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {/* Credit packages */}
                    {showPackages && packages.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          {isEn ? "Select a package" : "Choisissez un pack"}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {packages.map((pkg) => {
                            const isSelected = selectedPackage === pkg.id;
                            const coversNeed = (pkg.credits + userCredits) >= creditCost;
                            return (
                              <button
                                key={pkg.id}
                                onClick={() => {
                                  setSelectedPackage(pkg.id);
                                  handleBuyCredits(pkg.id);
                                }}
                                disabled={buyingCredits}
                                className={cn(
                                  "relative rounded-xl border-2 p-3.5 text-left transition-all disabled:opacity-50",
                                  isSelected
                                    ? "border-indigo-500 bg-indigo-50"
                                    : coversNeed
                                      ? "border-emerald-200 bg-emerald-50/30 hover:border-emerald-300"
                                      : "border-slate-200 bg-white hover:border-slate-300"
                                )}
                              >
                                {pkg.popular && (
                                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-[8px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                    <Star className="w-2 h-2" /> POPULAR
                                  </span>
                                )}
                                {coversNeed && !pkg.popular && (
                                  <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center font-bold">✓</span>
                                )}
                                <p className="text-lg font-black text-slate-900">{pkg.credits} <span className="text-xs text-slate-400 font-medium">cr.</span></p>
                                <p className="text-sm font-bold text-indigo-600 mt-0.5">{pkg.priceFormatted}</p>
                                <p className="text-[10px] text-slate-400">{pkg.pricePerCredit}/{isEn ? "credit" : "crédit"}</p>
                              </button>
                            );
                          })}
                        </div>
                        {buyingCredits && (
                          <div className="flex items-center justify-center gap-2 text-xs text-indigo-600 py-1">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            {isEn ? "Redirecting to payment…" : "Redirection vers le paiement…"}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Euro / Card Panel ── */}
            {paymentMethod === "euro" && (
              <div className="p-6 space-y-5">
                {/* Amount */}
                <div className="text-center">
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                    {isRelaunch
                      ? (isEn ? "Relaunch price" : "Prix de relance")
                      : (isEn ? "One-time price" : "Prix unique")}
                  </p>
                  <p className="text-4xl font-black text-slate-900 mt-2">€{euroCost}</p>
                </div>

                {/* Stripe trust badges */}
                <div className="flex items-center justify-center gap-4">
                  <span className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                    <Lock className="w-3 h-3" /> SSL
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                    <CreditCard className="w-3 h-3" /> Visa / MC
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                    <Shield className="w-3 h-3" /> PCI
                  </span>
                </div>

                {/* Pay button */}
                <button
                  onClick={handlePayEuro}
                  disabled={payingEuro}
                  className="w-full py-3.5 rounded-xl bg-slate-900 text-white font-semibold disabled:opacity-50 hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  {payingEuro ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {isEn ? "Redirecting to Stripe…" : "Redirection vers Stripe…"}</>
                  ) : (
                    <><CreditCard className="w-4 h-4" /> {isEn ? `Pay €${euroCost}` : `Payer ${euroCost} €`} <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>

                <p className="text-xs text-center text-slate-400">
                  {isEn
                    ? "Secure payment via Stripe. You will be redirected."
                    : "Paiement sécurisé via Stripe. Vous serez redirigé."}
                </p>
              </div>
            )}
          </div>

          {/* ═══ Order Summary ═══ */}
          <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-900">{isEn ? "Order summary" : "Résumé de la commande"}</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center",
                    isDP ? "bg-emerald-50 text-emerald-600" : "bg-purple-50 text-purple-600"
                  )}>
                    {isDP ? <FileText className="w-4 h-4" /> : <ClipboardCheck className="w-4 h-4" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {isDP ? t("pay.dpLabel") : t("pay.pcLabel")}
                    </p>
                    <p className="text-xs text-slate-400">{isDP ? "DP" : "PC"} · {isDP ? "9" : "12"} {isEn ? "documents" : "documents"}</p>
                  </div>
                </div>
                <span className={cn(
                  "text-xs font-bold px-2.5 py-1 rounded-lg",
                  isDP ? "bg-emerald-50 text-emerald-600" : "bg-purple-50 text-purple-600"
                )}>
                  {isDP ? "DP" : "PC"}
                </span>
              </div>

              {/* Included items */}
              <div className="border-t border-slate-100 pt-3 space-y-2">
                <SummaryRow icon={<FileText className="w-3.5 h-3.5" />} label={`${isDP ? "9" : "12"} ${t("pay.regDocs")}`} />
                {wantPluAnalysis && <SummaryRow icon={<Shield className="w-3.5 h-3.5" />} label={t("pay.autoAnalysis")} />}
                {wantCerfa && <SummaryRow icon={<Sparkles className="w-3.5 h-3.5" />} label={t("pay.autoCerfa")} />}
                <SummaryRow icon={<Check className="w-3.5 h-3.5" />} label={t("pay.sitePlan")} />
              </div>

              {/* Total */}
              <div className="border-t border-slate-100 pt-3 flex justify-between items-center">
                <p className="text-sm font-bold text-slate-900">{isEn ? "Total" : "Total"}</p>
                <p className="text-sm font-bold text-slate-900">
                  {paymentMethod === "credits"
                    ? `${creditCost} ${isEn ? "credits" : "crédits"}`
                    : `€${euroCost}`}
                </p>
              </div>
            </div>
          </div>

          {/* ═══ Pricing Reference ═══ */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              {isEn ? "Pricing" : "Tarification"}
            </p>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-600">{isEn ? "First analysis" : "Première analyse"}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium bg-white px-2 py-0.5 rounded-lg border border-slate-100">{creditCosts.pluFirstAnalysis} cr.</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-xs text-slate-400 font-medium bg-white px-2 py-0.5 rounded-lg border border-slate-100">€{euroPrices.first}</span>
                </div>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-600">{isEn ? "Relaunch" : "Relance"}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium bg-white px-2 py-0.5 rounded-lg border border-slate-100">{creditCosts.pluRelaunch} cr.</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-xs text-slate-400 font-medium bg-white px-2 py-0.5 rounded-lg border border-slate-100">€{euroPrices.relaunch}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ Architect Warning ═══ */}
          {architectRequired && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-700">{t("pay.architectRequired")}</p>
                <p className="text-xs text-amber-600 mt-1">{t("pay.architectWarning")}</p>
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

          {/* ═══ Security Footer ═══ */}
          <div className="flex items-center justify-center gap-5 text-[11px] text-slate-400 pb-6">
            <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> {t("pay.securePayment")}</span>
            <span>Stripe</span>
            <span>SSL 256-bit</span>
          </div>
        </div>
      </div>
    </Navigation>
  );
}

/* ─── Sub-Components ─────────────────────────────────────────── */

function SummaryRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-xs text-slate-600">
      <span className="text-indigo-400">{icon}</span>
      <span>{label}</span>
    </div>
  );
}
