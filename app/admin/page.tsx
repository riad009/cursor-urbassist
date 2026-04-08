"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navigation from "@/components/layout/Navigation";
import {
  Shield,
  Loader2,
  Users,
  FolderKanban,
  Coins,
  Search,
  Plus,
  Minus,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  UserCheck,
  Crown,
  TrendingUp,
  Activity,
  AlertTriangle,
  Check,
  X,
  RefreshCw,
  Mail,
  Calendar,
  CreditCard,
  BarChart3,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

/* ─────────────────────────── Types ─────────────────────────── */

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  credits: number;
  createdAt: string;
  updatedAt: string;
  totalProjects: number;
  totalTransactions: number;
  totalPayments: number;
}

interface PlatformStats {
  totalUsers: number;
  totalProjects: number;
  totalCredits: number;
}

type SortKey = "name" | "email" | "credits" | "totalProjects" | "createdAt";
type SortDir = "asc" | "desc";

/* ─────────────────────────── Component ─────────────────────── */

export default function AdminDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // ── Data ──
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Search / Sort ──
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ── Credit adjustment modal ──
  const [creditModal, setCreditModal] = useState<{
    user: AdminUser;
    amount: string;
    reason: string;
  } | null>(null);
  const [creditLoading, setCreditLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // ── Fetch users ──
  const fetchUsers = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const res = await fetch("/api/admin/users", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setUsers(data.users || []);
      setStats(data.stats || null);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "ADMIN") return;
    fetchUsers();
  }, [user, authLoading, fetchUsers]);

  // ── Sort handler ──
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "credits" || key === "totalProjects" ? "desc" : "asc");
    }
  };

  // ── Filtered + Sorted users ──
  const filteredUsers = useMemo(() => {
    let result = [...users];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (u) =>
          (u.name || "").toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = (a.name || "").localeCompare(b.name || "");
          break;
        case "email":
          cmp = a.email.localeCompare(b.email);
          break;
        case "credits":
          cmp = a.credits - b.credits;
          break;
        case "totalProjects":
          cmp = a.totalProjects - b.totalProjects;
          break;
        case "createdAt":
          cmp =
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [users, searchQuery, sortKey, sortDir]);

  // ── Credit adjustment ──
  const adjustCredits = async () => {
    if (!creditModal) return;
    const amount = parseInt(creditModal.amount, 10);
    if (isNaN(amount) || amount === 0) {
      setMessage({ type: "error", text: "Enter a valid non-zero amount" });
      return;
    }

    setCreditLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/users/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          userId: creditModal.user.id,
          amount,
          reason: creditModal.reason || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      setMessage({
        type: "success",
        text: `${amount > 0 ? "Added" : "Removed"} ${Math.abs(amount)} credits ${amount > 0 ? "to" : "from"} ${creditModal.user.name || creditModal.user.email}. New balance: ${data.newCredits}`,
      });
      setCreditModal(null);
      fetchUsers();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to adjust credits",
      });
    } finally {
      setCreditLoading(false);
    }
  };

  // ── Role badge ──
  const getRoleBadge = (role: string) => {
    const config = {
      ADMIN: {
        label: "Admin",
        bg: "bg-gradient-to-r from-amber-100 to-orange-100",
        text: "text-amber-800",
        icon: Crown,
      },
      DEVELOPER: {
        label: "Developer",
        bg: "bg-gradient-to-r from-purple-100 to-indigo-100",
        text: "text-purple-800",
        icon: Sparkles,
      },
      USER: {
        label: "User",
        bg: "bg-slate-100",
        text: "text-slate-600",
        icon: UserCheck,
      },
    } as Record<string, { label: string; bg: string; text: string; icon: React.ComponentType<{ className?: string }> }>;
    const c = config[role] || config.USER;
    const Icon = c.icon;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold",
          c.bg,
          c.text
        )}
      >
        <Icon className="w-3 h-3" />
        {c.label}
      </span>
    );
  };

  // ── Time formatting ──
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const timeAgo = (dateStr: string) => {
    const diff = Math.floor(
      (Date.now() - new Date(dateStr).getTime()) / 1000
    );
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    const days = Math.floor(diff / 86400);
    if (days === 1) return "Yesterday";
    if (days < 30) return `${days}d ago`;
    return formatDate(dateStr);
  };

  // ── Sort header component ──
  const SortHeader = ({
    label,
    sortField,
    className,
  }: {
    label: string;
    sortField: SortKey;
    className?: string;
  }) => (
    <button
      onClick={() => handleSort(sortField)}
      className={cn(
        "flex items-center gap-1 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-800 transition-colors group",
        className
      )}
    >
      {label}
      {sortKey === sortField ? (
        sortDir === "asc" ? (
          <ChevronUp className="w-3.5 h-3.5 text-blue-500" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-blue-500" />
        )
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
      )}
    </button>
  );

  /* ═══════════════════════════ Guards ═══════════════════════════ */

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-sm text-slate-500">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== "ADMIN") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-lg">
          <Shield className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Access Denied</h1>
        <p className="text-slate-500">
          You need admin privileges to access this page.
        </p>
        <Link
          href="/"
          className="px-6 py-2.5 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    );
  }

  /* ═══════════════════════════ Render ═══════════════════════════ */

  return (
    <Navigation>
      <div className="p-4 lg:p-8 max-w-[1440px] mx-auto space-y-6">
        {/* ═══ Header ═══ */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 flex items-center justify-center shadow-lg shadow-slate-900/25">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">
                Admin Dashboard
              </h1>
              <p className="text-sm text-slate-500">
                Manage users, credits, and platform overview
              </p>
            </div>
          </div>
          <button
            onClick={() => fetchUsers(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-slate-700 border border-slate-200 font-medium text-sm hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50"
          >
            <RefreshCw
              className={cn("w-4 h-4", refreshing && "animate-spin")}
            />
            Refresh
          </button>
        </div>

        {/* ═══ Messages ═══ */}
        {message && (
          <div
            className={cn(
              "p-4 rounded-xl border flex items-center gap-3 animate-slide-up",
              message.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-red-50 border-red-200 text-red-700"
            )}
          >
            {message.type === "success" ? (
              <Check className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            )}
            <p className="text-sm font-medium flex-1">{message.text}</p>
            <button
              onClick={() => setMessage(null)}
              className="p-1 rounded-lg hover:bg-black/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ═══ Platform Stats ═══ */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: "Total Users",
                value: stats.totalUsers,
                icon: Users,
                color: "from-blue-500 to-cyan-500",
                bgLight: "bg-blue-50",
                textColor: "text-blue-700",
              },
              {
                label: "Total Projects",
                value: stats.totalProjects,
                icon: FolderKanban,
                color: "from-violet-500 to-purple-500",
                bgLight: "bg-violet-50",
                textColor: "text-violet-700",
              },
              {
                label: "Total Credits",
                value: stats.totalCredits.toLocaleString(),
                icon: Coins,
                color: "from-amber-500 to-orange-500",
                bgLight: "bg-amber-50",
                textColor: "text-amber-700",
              },
              {
                label: "Avg Credits/User",
                value:
                  stats.totalUsers > 0
                    ? Math.round(
                        stats.totalCredits / stats.totalUsers
                      ).toLocaleString()
                    : "0",
                icon: TrendingUp,
                color: "from-emerald-500 to-teal-500",
                bgLight: "bg-emerald-50",
                textColor: "text-emerald-700",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="relative overflow-hidden rounded-2xl bg-white border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      stat.bgLight
                    )}
                  >
                    <stat.icon className={cn("w-5 h-5", stat.textColor)} />
                  </div>
                  <Activity className="w-4 h-4 text-slate-300 group-hover:text-slate-400 transition-colors" />
                </div>
                <p className="text-2xl font-bold text-slate-900">
                  {stat.value}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
                {/* Decorative gradient bar */}
                <div
                  className={cn(
                    "absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r opacity-60",
                    stat.color
                  )}
                />
              </div>
            ))}
          </div>
        )}

        {/* ═══ Users Table Section ═══ */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Table Header */}
          <div className="p-5 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-slate-900">
                  All Users
                </h2>
                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                  {filteredUsers.length}
                  {searchQuery && ` / ${users.length}`}
                </span>
              </div>
              {/* Search */}
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search users by name, email..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                <p className="text-sm text-slate-500">Loading users...</p>
              </div>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3">
              <Users className="w-12 h-12 text-slate-300" />
              <p className="text-slate-500 font-medium">
                {searchQuery ? "No users match your search" : "No users found"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50/80">
                    <th className="text-left px-5 py-3">
                      <SortHeader label="User" sortField="name" />
                    </th>
                    <th className="text-left px-5 py-3 hidden md:table-cell">
                      <SortHeader label="Email" sortField="email" />
                    </th>
                    <th className="text-center px-5 py-3">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Role
                      </span>
                    </th>
                    <th className="text-center px-5 py-3">
                      <SortHeader
                        label="Credits"
                        sortField="credits"
                        className="justify-center"
                      />
                    </th>
                    <th className="text-center px-5 py-3">
                      <SortHeader
                        label="Projects"
                        sortField="totalProjects"
                        className="justify-center"
                      />
                    </th>
                    <th className="text-center px-5 py-3 hidden lg:table-cell">
                      <SortHeader
                        label="Joined"
                        sortField="createdAt"
                        className="justify-center"
                      />
                    </th>
                    <th className="text-center px-5 py-3">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Actions
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((u, i) => (
                    <tr
                      key={u.id}
                      className={cn(
                        "hover:bg-blue-50/30 transition-colors",
                        i % 2 === 0 ? "bg-white" : "bg-slate-50/30"
                      )}
                    >
                      {/* User */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0",
                              u.role === "ADMIN"
                                ? "bg-gradient-to-br from-amber-500 to-orange-500"
                                : u.role === "DEVELOPER"
                                  ? "bg-gradient-to-br from-purple-500 to-indigo-500"
                                  : "bg-gradient-to-br from-slate-400 to-slate-500"
                            )}
                          >
                            {(u.name || u.email)
                              .charAt(0)
                              .toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">
                              {u.name || "—"}
                            </p>
                            <p className="text-xs text-slate-400 md:hidden truncate">
                              {u.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      {/* Email */}
                      <td className="px-5 py-4 hidden md:table-cell">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[200px]">
                            {u.email}
                          </span>
                        </div>
                      </td>
                      {/* Role */}
                      <td className="px-5 py-4 text-center">
                        {getRoleBadge(u.role)}
                      </td>
                      {/* Credits */}
                      <td className="px-5 py-4 text-center">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200">
                          <Coins className="w-3.5 h-3.5 text-amber-600" />
                          <span className="text-sm font-bold text-amber-800">
                            {u.credits.toLocaleString()}
                          </span>
                        </div>
                      </td>
                      {/* Projects */}
                      <td className="px-5 py-4 text-center">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200">
                          <FolderKanban className="w-3.5 h-3.5 text-blue-600" />
                          <span className="text-sm font-bold text-blue-800">
                            {u.totalProjects}
                          </span>
                        </div>
                      </td>
                      {/* Joined */}
                      <td className="px-5 py-4 text-center hidden lg:table-cell">
                        <div className="flex flex-col items-center">
                          <span className="text-sm text-slate-700">
                            {timeAgo(u.createdAt)}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {formatDate(u.createdAt)}
                          </span>
                        </div>
                      </td>
                      {/* Actions */}
                      <td className="px-5 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() =>
                              setCreditModal({
                                user: u,
                                amount: "",
                                reason: "",
                              })
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-semibold hover:shadow-lg hover:shadow-emerald-500/25 transition-all"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Credits
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ═══ Quick Stats Footer ═══ */}
        {users.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm">
              <CreditCard className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {users.filter((u) => u.totalPayments > 0).length}
                </p>
                <p className="text-[10px] text-slate-400">Paying Users</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm">
              <Crown className="w-5 h-5 text-amber-500" />
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {users.filter((u) => u.role === "ADMIN").length}
                </p>
                <p className="text-[10px] text-slate-400">Admins</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm">
              <BarChart3 className="w-5 h-5 text-purple-500" />
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {users.length > 0
                    ? (
                        users.reduce((a, u) => a + u.totalProjects, 0) /
                        users.length
                      ).toFixed(1)
                    : "0"}
                </p>
                <p className="text-[10px] text-slate-400">Avg Projects/User</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm">
              <Calendar className="w-5 h-5 text-emerald-500" />
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {users.filter((u) => {
                    const daysDiff =
                      (Date.now() - new Date(u.createdAt).getTime()) /
                      (1000 * 60 * 60 * 24);
                    return daysDiff <= 7;
                  }).length}
                </p>
                <p className="text-[10px] text-slate-400">New This Week</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Credit Adjustment Modal ═══ */}
      {creditModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setCreditModal(null)}
          />
          {/* Modal */}
          <div className="relative w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl border border-slate-200 animate-slide-up overflow-hidden">
            {/* Header gradient */}
            <div className="h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Coins className="w-5 h-5 text-amber-500" />
                  Adjust Credits
                </h3>
                <button
                  onClick={() => setCreditModal(null)}
                  className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              {/* User info */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 mb-5">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center text-white font-bold text-sm">
                  {(creditModal.user.name || creditModal.user.email)
                    .charAt(0)
                    .toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 truncate">
                    {creditModal.user.name || "Unnamed"}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    {creditModal.user.email}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-amber-700">
                    {creditModal.user.credits}
                  </p>
                  <p className="text-[10px] text-slate-400">Current</p>
                </div>
              </div>

              {/* Amount input */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Amount
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setCreditModal((m) =>
                          m
                            ? {
                                ...m,
                                amount: String(-(Math.abs(parseInt(m.amount) || 0))),
                              }
                            : null
                        )
                      }
                      className="p-2.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors border border-red-200"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      value={creditModal.amount}
                      onChange={(e) =>
                        setCreditModal((m) =>
                          m ? { ...m, amount: e.target.value } : null
                        )
                      }
                      placeholder="Enter amount"
                      className="flex-1 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-center text-lg font-bold text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all"
                    />
                    <button
                      onClick={() =>
                        setCreditModal((m) =>
                          m
                            ? {
                                ...m,
                                amount: String(Math.abs(parseInt(m.amount) || 0)),
                              }
                            : null
                        )
                      }
                      className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors border border-emerald-200"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  {/* Quick add buttons */}
                  <div className="flex gap-2 mt-2">
                    {[10, 25, 50, 100, 500].map((v) => (
                      <button
                        key={v}
                        onClick={() =>
                          setCreditModal((m) =>
                            m ? { ...m, amount: String(v) } : null
                          )
                        }
                        className="flex-1 py-1.5 rounded-lg bg-slate-50 text-xs font-medium text-slate-600 border border-slate-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all"
                      >
                        +{v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Reason (optional)
                  </label>
                  <input
                    type="text"
                    value={creditModal.reason}
                    onChange={(e) =>
                      setCreditModal((m) =>
                        m ? { ...m, reason: e.target.value } : null
                      )
                    }
                    placeholder="e.g., Bonus, Refund, Promo..."
                    className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all"
                  />
                </div>

                {/* Preview */}
                {creditModal.amount && parseInt(creditModal.amount) !== 0 && (
                  <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                    <p className="text-xs text-blue-700">
                      <span className="font-semibold">New balance: </span>
                      {creditModal.user.credits +
                        (parseInt(creditModal.amount) || 0)}{" "}
                      credits
                      <span className="text-blue-500">
                        {" "}
                        ({parseInt(creditModal.amount) > 0 ? "+" : ""}
                        {creditModal.amount})
                      </span>
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setCreditModal(null)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-medium text-sm hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={adjustCredits}
                    disabled={
                      creditLoading ||
                      !creditModal.amount ||
                      parseInt(creditModal.amount) === 0
                    }
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold text-sm hover:shadow-lg hover:shadow-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                  >
                    {creditLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Navigation>
  );
}
