"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileCheck,
  FolderKanban,
  PenTool,
  Image,
  Calculator,
  Download,
  Menu,
  MapPin,
  X,
  Sparkles,
  ChevronRight,
  Building2,
  Box,
  User,
  Settings,
  Bell,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { PLANNING_STEPS, getStepIndex, getProjectIdFromRoute } from "@/lib/step-flow";

const stepIcons = [
  LayoutDashboard,
  FileCheck,
  MapPin,
  PenTool,
  Building2,
  Box,
  Image,
  Calculator,
  Download,
] as const;

// Top menu: only Dashboard and Project. Other features (AI Analysis, Feasibility, Developer) are reached via the dashboard.
const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, color: "from-blue-500 to-cyan-500" },
  { href: "/projects", label: "Project", icon: FolderKanban, color: "from-violet-500 to-purple-500" },
];

function NavigationInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const projectId = getProjectIdFromRoute(pathname, searchParams.get("project"));
  const currentStepIndex = projectId ? getStepIndex(pathname) : -1;
  const [projectName, setProjectName] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setProjectName(null);
      return;
    }
    fetch(`/api/projects/${projectId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setProjectName(d.project?.name ?? null))
      .catch(() => setProjectName(null));
  }, [projectId]);

  return (
    <div className="min-h-screen">
      {/* Top Navigation Bar */}
      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/10">
        <div className="flex items-center justify-between px-4 h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/25 group-hover:shadow-purple-500/40 transition-shadow">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-900 animate-pulse" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold tracking-tight">
                <span className="gradient-text">UrbAssist</span>
              </h1>
              <p className="text-[10px] text-slate-400 -mt-1 flex items-center gap-1.5">
                UrbAssist
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-700/80 text-slate-300 border border-white/10">
                  Deploy #{process.env.NEXT_PUBLIC_DEPLOY_COUNT || "5"}
                </span>
              </p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300",
                    isActive
                      ? "text-white"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  {isActive && (
                    <span className={cn(
                      "absolute inset-0 rounded-full bg-gradient-to-r opacity-90",
                      item.color
                    )} />
                  )}
                  <item.icon className={cn("w-4 h-4 relative z-10", isActive && "drop-shadow-lg")} />
                  <span className="relative z-10">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right Side */}
          <div className="flex items-center gap-3">
            <button className="relative p-2 rounded-full hover:bg-white/5 transition-colors">
              <Bell className="w-5 h-5 text-slate-400" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full" />
            </button>
            <button className="p-2 rounded-full hover:bg-white/5 transition-colors">
              <Settings className="w-5 h-5 text-slate-400" />
            </button>
            <div className="w-px h-8 bg-white/10" />
            {user ? (
              <>
                <span className="hidden sm:inline px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-sm">
                  {user.credits} credits
                </span>
                <Link
                  href="/admin"
                  className="hidden sm:inline px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-sm hover:bg-slate-700"
                >
                  Plans
                </Link>
                <button
                  onClick={() => logout()}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center border border-white/10">
                  <User className="w-4 h-4 text-slate-300" />
                </div>
              </>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white text-sm font-medium hover:shadow-lg hover:shadow-purple-500/25"
              >
                <Sparkles className="w-4 h-4" />
                Sign in
              </Link>
            )}

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-white/5"
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5 text-slate-400" />
              ) : (
                <Menu className="w-5 h-5 text-slate-400" />
              )}
            </button>
          </div>
        </div>

        {/* Planning application steps bar - shown when in a project context */}
        {projectId && (
          <div className="border-t border-white/10 bg-slate-900/90 px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/projects/${projectId}`}
                className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white shrink-0"
              >
                <FolderKanban className="w-4 h-4 text-sky-400" />
                <span className="hidden sm:inline">{projectName || "Project"}</span>
                <span className="text-slate-500 text-xs font-normal">(steps)</span>
              </Link>
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none min-w-0">
                {PLANNING_STEPS.map((step, idx) => {
                  const isActive = idx === currentStepIndex;
                  const isPast = idx < currentStepIndex;
                  const href = step.href(projectId);
                  const Icon = stepIcons[idx] ?? LayoutDashboard;
                  return (
                    <Link
                      key={step.step}
                      href={href}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
                        isActive && "bg-sky-500 text-white shadow-md shadow-sky-500/25",
                        isPast && !isActive && "text-slate-400 hover:text-slate-200 hover:bg-white/5",
                        !isActive && !isPast && "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                      )}
                    >
                      <span
                        className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                          isActive ? "bg-sky-400/90 text-white" : "bg-slate-700 text-slate-400"
                        )}
                      >
                        {step.step}
                      </span>
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="hidden md:inline">{step.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <nav className="lg:hidden border-t border-white/10 bg-slate-900/95 backdrop-blur-xl">
            <div className="p-4 space-y-2">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                      isActive
                        ? "bg-gradient-to-r text-white " + item.color
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                    <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className={cn("min-h-screen", projectId ? "pt-32" : "pt-16")}>
        {children}
      </main>
    </div>
  );
}

function NavigationFallback({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/10">
        <div className="flex items-center justify-between px-4 h-16">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/25" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold tracking-tight"><span className="gradient-text">UrbAssist</span></h1>
            </div>
          </Link>
        </div>
      </header>
      <main className="min-h-screen pt-16">{children}</main>
    </div>
  );
}

export function Navigation({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<NavigationFallback>{children}</NavigationFallback>}>
      <NavigationInner>{children}</NavigationInner>
    </Suspense>
  );
}

export default Navigation;
