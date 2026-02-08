"use client";

import React, { useEffect, useState } from "react";
import Navigation from "@/components/layout/Navigation";
import {
  Shield,
  Loader2,
  Check,
  CreditCard,
  Coins,
  History,
  AlertTriangle,
  Zap,
  ShoppingCart,
  Crown,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceMonthly: number;
  creditsPerMonth: number;
  features: string[] | null;
  stripePriceId?: string | null;
  isActive?: boolean;
}

interface CreditPackage {
  id: string;
  credits: number;
  price: number;
  label: string;
  priceFormatted: string;
  pricePerCredit: string;
}

interface Transaction {
  id: string;
  amount: number;
  type: string;
  description: string;
  createdAt: string;
}

export default function AdminPage() {
  const { user, loading: authLoading, refreshUser } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"plans" | "credits" | "history">(
    "credits"
  );
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [adminPlans, setAdminPlans] = useState<Plan[]>([]);
  const [showAddPlan, setShowAddPlan] = useState(false);
  const [newPlan, setNewPlan] = useState({ name: "", slug: "", description: "", priceMonthly: 9.9, creditsPerMonth: 20, stripePriceId: "" });
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/plans")
        .then((r) => r.json())
        .then((data) => setPlans(data.plans || [])),
      fetch("/api/stripe/checkout")
        .then((r) => r.json())
        .then((data) => setPackages(data.packages || [])),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user?.role === "ADMIN") {
      fetch("/api/plans?all=true")
        .then((r) => r.json())
        .then((data) => setAdminPlans(data.plans || []))
        .catch(() => setAdminPlans([]));
    }
  }, [user?.role, activeTab]);

  const purchaseCredits = async (packageId: string) => {
    setPurchasing(packageId);
    setMessage(null);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "credits", packageId }),
      });

      const data = await res.json();

      if (data.url) {
        // Redirect to Stripe
        window.location.href = data.url;
      } else if (data.success) {
        // Demo mode - credits added directly
        setMessage({
          type: "success",
          text: data.message || "Credits added successfully!",
        });
        if (refreshUser) refreshUser();
      } else {
        setMessage({
          type: "error",
          text: data.error || "Purchase failed",
        });
      }
    } catch {
      setMessage({ type: "error", text: "Purchase failed" });
    }

    setPurchasing(null);
  };

  const subscribeToPlan = async (planId: string) => {
    setSubscribing(planId);
    setMessage(null);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "subscription", planId }),
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else if (data.success) {
        setMessage({
          type: "success",
          text: data.message || "Subscribed successfully!",
        });
        if (refreshUser) refreshUser();
      } else {
        setMessage({
          type: "error",
          text: data.error || "Subscription failed",
        });
      }
    } catch {
      setMessage({ type: "error", text: "Subscription failed" });
    }

    setSubscribing(null);
  };

  const createPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newPlan,
          slug: newPlan.slug || newPlan.name.replace(/\s+/g, "-").toLowerCase(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setMessage({ type: "success", text: "Plan created." });
      setShowAddPlan(false);
      setNewPlan({ name: "", slug: "", description: "", priceMonthly: 9.9, creditsPerMonth: 20, stripePriceId: "" });
      const list = await fetch("/api/plans?all=true").then((r) => r.json());
      setAdminPlans(list.plans || []);
      setPlans((list.plans || []).filter((p: Plan) => p.isActive !== false));
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed" });
    }
  };

  const updatePlan = async (planId: string, patch: Partial<Plan>) => {
    setMessage(null);
    try {
      const res = await fetch("/api/plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: planId, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setMessage({ type: "success", text: "Plan updated." });
      setEditingPlanId(null);
      const list = await fetch("/api/plans?all=true").then((r) => r.json());
      setAdminPlans(list.plans || []);
      setPlans((list.plans || []).filter((p: Plan) => p.isActive !== false));
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed" });
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              Credits & Subscriptions
            </h1>
            <p className="text-slate-400 mt-1">
              {user
                ? `You have ${user.credits} credits available`
                : "Sign in to manage your subscription"}
            </p>
          </div>

          {user && (
            <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20">
              <Coins className="w-6 h-6 text-amber-400" />
              <div>
                <p className="text-2xl font-bold text-white">
                  {user.credits}
                </p>
                <p className="text-xs text-slate-400">Credits Available</p>
              </div>
            </div>
          )}
        </div>

        {/* Messages */}
        {message && (
          <div
            className={cn(
              "p-4 rounded-xl border flex items-center gap-3",
              message.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : "bg-red-500/10 border-red-500/30 text-red-400"
            )}
          >
            {message.type === "success" ? (
              <Check className="w-5 h-5" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
            <p className="text-sm font-medium">{message.text}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2">
          {[
            { id: "credits" as const, label: "Buy Credits", icon: Coins },
            { id: "plans" as const, label: "Subscriptions", icon: Crown },
            { id: "history" as const, label: "History", icon: History },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                  : "bg-slate-800/50 text-slate-400 border border-white/10 hover:bg-slate-700/50"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : (
          <>
            {/* Credit Packages */}
            {activeTab === "credits" && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white">
                  Purchase Credits
                </h2>
                <p className="text-sm text-slate-400">
                  Credits can be used for PLU analysis, plan generation, visual
                  creation, and document export.
                </p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {packages.map((pkg, i) => (
                    <div
                      key={pkg.id}
                      className={cn(
                        "rounded-2xl border p-6 relative",
                        i === 2
                          ? "border-blue-500/50 bg-blue-500/5 ring-2 ring-blue-500/30"
                          : "border-white/10 bg-slate-800/50"
                      )}
                    >
                      {i === 2 && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-blue-500 text-white text-xs font-medium">
                          Best Value
                        </div>
                      )}
                      <div className="text-center mb-4">
                        <Zap
                          className={cn(
                            "w-8 h-8 mx-auto mb-2",
                            i === 2 ? "text-blue-400" : "text-amber-400"
                          )}
                        />
                        <p className="text-3xl font-bold text-white">
                          {pkg.credits}
                        </p>
                        <p className="text-sm text-slate-400">credits</p>
                      </div>
                      <div className="text-center mb-4">
                        <p className="text-2xl font-bold text-white">
                          {pkg.priceFormatted}
                        </p>
                        <p className="text-xs text-slate-500">
                          {pkg.pricePerCredit}/credit
                        </p>
                      </div>
                      <button
                        onClick={() => purchaseCredits(pkg.id)}
                        disabled={purchasing === pkg.id}
                        className={cn(
                          "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium transition-all",
                          i === 2
                            ? "bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:shadow-lg"
                            : "bg-slate-700 text-white hover:bg-slate-600"
                        )}
                      >
                        {purchasing === pkg.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ShoppingCart className="w-4 h-4" />
                        )}
                        Buy
                      </button>
                    </div>
                  ))}
                </div>

                {/* Credit costs */}
                <div className="p-5 rounded-2xl bg-slate-800/30 border border-white/5">
                  <h3 className="text-sm font-semibold text-white mb-3">
                    Credit Costs per Feature
                  </h3>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { name: "PLU Analysis", cost: 3 },
                      { name: "Location Plan", cost: 2 },
                      { name: "Site Plan Export", cost: 3 },
                      { name: "Section Drawing", cost: 2 },
                      { name: "Elevation Drawing", cost: 2 },
                      { name: "Landscape Integration", cost: 5 },
                      { name: "Descriptive Statement", cost: 2 },
                      { name: "Visual Generation", cost: 5 },
                      { name: "Full Package", cost: 10 },
                    ].map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-700/30"
                      >
                        <span className="text-xs text-slate-400">
                          {item.name}
                        </span>
                        <span className="text-xs font-medium text-amber-400">
                          {item.cost} cr
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Subscription Plans */}
            {activeTab === "plans" && (
              <div className="space-y-6">
                {user?.role === "ADMIN" && (
                  <div className="p-5 rounded-2xl bg-slate-800/50 border border-white/10">
                    <h3 className="text-lg font-semibold text-white mb-3">Manage subscription plans</h3>
                    {!showAddPlan ? (
                      <button
                        type="button"
                        onClick={() => setShowAddPlan(true)}
                        className="px-4 py-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 text-sm font-medium"
                      >
                        Add plan
                      </button>
                    ) : (
                      <form onSubmit={createPlan} className="space-y-3 max-w-md">
                        <input
                          placeholder="Name"
                          value={newPlan.name}
                          onChange={(e) => setNewPlan((p) => ({ ...p, name: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
                          required
                        />
                        <input
                          placeholder="Slug (e.g. starter)"
                          value={newPlan.slug}
                          onChange={(e) => setNewPlan((p) => ({ ...p, slug: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
                        />
                        <input
                          placeholder="Description"
                          value={newPlan.description}
                          onChange={(e) => setNewPlan((p) => ({ ...p, description: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
                        />
                        <div className="flex gap-2">
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Price (€/month)"
                            value={newPlan.priceMonthly}
                            onChange={(e) => setNewPlan((p) => ({ ...p, priceMonthly: Number(e.target.value) }))}
                            className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
                          />
                          <input
                            type="number"
                            placeholder="Credits/month"
                            value={newPlan.creditsPerMonth}
                            onChange={(e) => setNewPlan((p) => ({ ...p, creditsPerMonth: Number(e.target.value) }))}
                            className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
                          />
                        </div>
                        <input
                          placeholder="Stripe Price ID (optional)"
                          value={newPlan.stripePriceId}
                          onChange={(e) => setNewPlan((p) => ({ ...p, stripePriceId: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
                        />
                        <div className="flex gap-2">
                          <button type="submit" className="px-4 py-2 rounded-xl bg-blue-500 text-white text-sm font-medium">Create</button>
                          <button type="button" onClick={() => setShowAddPlan(false)} className="px-4 py-2 rounded-xl bg-slate-700 text-slate-300 text-sm">Cancel</button>
                        </div>
                      </form>
                    )}
                    <div className="mt-4 space-y-2">
                      {adminPlans.map((plan) => (
                        <div key={plan.id} className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-slate-700/30">
                          <span className="font-medium text-white">{plan.name}</span>
                          <span className="text-slate-400 text-sm">€{plan.priceMonthly}/mo · {plan.creditsPerMonth} cr</span>
                          {plan.stripePriceId && <span className="text-xs text-slate-500 truncate">{plan.stripePriceId}</span>}
                          {plan.isActive === false && <span className="text-xs text-amber-400">Inactive</span>}
                          <button
                            type="button"
                            onClick={() => setEditingPlanId(editingPlanId === plan.id ? null : plan.id)}
                            className="ml-auto text-xs text-blue-400"
                          >
                            {editingPlanId === plan.id ? "Done" : "Edit"}
                          </button>
                          {editingPlanId === plan.id && (
                            <div className="w-full flex flex-wrap gap-2 mt-2">
                              <input
                                defaultValue={plan.priceMonthly}
                                onBlur={(e) => updatePlan(plan.id, { priceMonthly: Number(e.target.value) })}
                                className="w-20 px-2 py-1 rounded bg-slate-800 text-white text-xs"
                                placeholder="Price"
                              />
                              <input
                                defaultValue={plan.creditsPerMonth}
                                onBlur={(e) => updatePlan(plan.id, { creditsPerMonth: Number(e.target.value) })}
                                className="w-20 px-2 py-1 rounded bg-slate-800 text-white text-xs"
                                placeholder="Credits"
                              />
                              <input
                                defaultValue={plan.stripePriceId || ""}
                                onBlur={(e) => updatePlan(plan.id, { stripePriceId: e.target.value || null })}
                                className="flex-1 min-w-[120px] px-2 py-1 rounded bg-slate-800 text-white text-xs"
                                placeholder="Stripe Price ID"
                              />
                              <button
                                type="button"
                                onClick={() => updatePlan(plan.id, { isActive: !plan.isActive })}
                                className="px-2 py-1 rounded bg-slate-600 text-white text-xs"
                              >
                                {plan.isActive === false ? "Activate" : "Deactivate"}
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                {plans.map((plan, i) => (
                  <div
                    key={plan.id}
                    className={cn(
                      "rounded-2xl border p-6",
                      i === 1
                        ? "border-blue-500/50 bg-blue-500/5 ring-2 ring-blue-500/30"
                        : "border-white/10 bg-slate-800/50"
                    )}
                  >
                    <h3 className="text-lg font-bold text-white">
                      {plan.name}
                    </h3>
                    <p className="text-slate-400 text-sm mt-1">
                      {plan.description}
                    </p>
                    <div className="mt-4">
                      <span className="text-3xl font-bold text-white">
                        €{plan.priceMonthly}
                      </span>
                      <span className="text-slate-400">/month</span>
                    </div>
                    <p className="text-sm text-slate-400 mt-1">
                      {plan.creditsPerMonth} credits/month
                    </p>
                    <ul className="mt-6 space-y-2">
                      {(Array.isArray(plan.features) ? plan.features : []).map(
                        (f) => (
                          <li
                            key={f}
                            className="flex items-center gap-2 text-sm text-slate-300"
                          >
                            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                            {f}
                          </li>
                        )
                      )}
                    </ul>
                    <button
                      onClick={() =>
                        plan.priceMonthly > 0 && subscribeToPlan(plan.id)
                      }
                      disabled={
                        subscribing === plan.id || plan.priceMonthly === 0
                      }
                      className={cn(
                        "w-full mt-6 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2",
                        plan.priceMonthly === 0
                          ? "bg-slate-700 text-slate-300 cursor-default"
                          : "bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:shadow-lg"
                      )}
                    >
                      {subscribing === plan.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : plan.priceMonthly === 0 ? (
                        "Current"
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4" />
                          Subscribe
                        </>
                      )}
                    </button>
                  </div>
                ))}
                </div>
              </div>
            )}

            {/* Transaction History */}
            {activeTab === "history" && (
              <div className="p-5 rounded-2xl bg-slate-800/50 border border-white/10">
                <h3 className="text-lg font-semibold text-white mb-4">
                  Transaction History
                </h3>
                {transactions.length > 0 ? (
                  <div className="space-y-2">
                    {transactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-slate-700/30"
                      >
                        <div>
                          <p className="text-sm text-white">
                            {tx.description}
                          </p>
                          <p className="text-xs text-slate-500">
                            {new Date(tx.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "text-sm font-medium",
                            tx.amount > 0
                              ? "text-emerald-400"
                              : "text-red-400"
                          )}
                        >
                          {tx.amount > 0 ? "+" : ""}
                          {tx.amount} credits
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-slate-500 py-8">
                    No transactions yet. Purchase credits or subscribe to get
                    started.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Navigation>
  );
}
