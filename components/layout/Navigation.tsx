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
  Plus,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import LanguageToggle from "@/components/ui/LanguageToggle";
import { PLANNING_STEPS, getStepIndex, getProjectIdFromRoute, getPhaseSteps, getStepPhase } from "@/lib/step-flow";
import type { StepPhase } from "@/lib/step-flow";

const stepIcons = [
  Plus,
  LayoutDashboard,
  FileCheck,
  FolderKanban,
  MapPin,
  PenTool,
  Building2,
  Box,
  Image,
  Calculator,
  Download,
] as const;

// Top menu: only Dashboard and Project.
const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, color: "from-blue-500 to-cyan-500" },
  { href: "/projects", label: "Project", icon: FolderKanban, color: "from-violet-500 to-purple-500" },
];

function NavigationInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const projectId = getProjectIdFromRoute(pathname, searchParams.get("project"));
  const isNewProjectPage = pathname === "/projects/new";
  const showStepBar = !!projectId || isNewProjectPage;
  const currentStepIndex = showStepBar ? getStepIndex(pathname) : -1;
  const [projectName, setProjectName] = useState<string | null>(null);
  const [projectPaid, setProjectPaid] = useState<boolean>(false);

  useEffect(() => {
    if (!projectId) {
      setProjectName(null);
      return;
    }
    fetch(`/api/projects/${projectId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setProjectName(d.project?.name ?? null);
        setProjectPaid(!!d.project?.paidAt);
      })
      .catch(() => { setProjectName(null); setProjectPaid(false); });
  }, [projectId]);

  return (
    <div className="min-h-screen bg-white">
      {/* Top Navigation Bar */}
      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-slate-200">
        <div className="flex items-center justify-between px-4 h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/25 group-hover:shadow-purple-500/40 transition-shadow">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white animate-pulse" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                UrbAssist
              </h1>
              <p className="text-[10px] text-slate-500 -mt-1 flex items-center gap-1.5">
                UrbAssist
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                  Deploy #{process.env.NEXT_PUBLIC_DEPLOY_COUNT || "12"}
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
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
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
            <LanguageToggle />
            <button className="relative p-2 rounded-full hover:bg-slate-100 transition-colors">
              <Bell className="w-5 h-5 text-slate-500" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full" />
            </button>
            <button className="p-2 rounded-full hover:bg-slate-100 transition-colors">
              <Settings className="w-5 h-5 text-slate-500" />
            </button>
            <div className="w-px h-8 bg-slate-200" />
            {user ? (
              <>
                <span className="hidden sm:inline px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-sm border border-slate-200">
                  {user.credits} credits
                </span>
                <Link
                  href="/admin"
                  className="hidden sm:inline px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-sm hover:bg-slate-200 border border-slate-200"
                >
                  Plans
                </Link>
                <button
                  onClick={() => logout()}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center border border-slate-200">
                  <User className="w-4 h-4 text-slate-600" />
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
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100"
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5 text-slate-600" />
              ) : (
                <Menu className="w-5 h-5 text-slate-600" />
              )}
            </button>
          </div>
        </div>

        {/* Planning application steps bar */}
        {showStepBar && (
          <div className="border-t border-slate-200 bg-slate-50/90 px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-3">
              {projectId && (
                <Link
                  href={`/projects/${projectId}`}
                  className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 shrink-0"
                >
                  <FolderKanban className="w-4 h-4 text-blue-500" />
                  <span className="hidden sm:inline">{projectName || "Project"}</span>
                  <span className="text-slate-400 text-xs font-normal">(steps)</span>
                </Link>
              )}
              {!projectId && isNewProjectPage && (
                <span className="flex items-center gap-2 text-sm font-medium text-slate-700 shrink-0">
                  <FolderKanban className="w-4 h-4 text-blue-500" />
                  <span className="hidden sm:inline">{t("nav.newProject")}</span>
                </span>
              )}
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none min-w-0">
                {(() => {
                  const currentPhase: StepPhase = projectPaid ? 2 : 1;
                  const phaseSteps = getPhaseSteps(currentPhase);
                  return phaseSteps.map((step) => {
                    const globalIdx = PLANNING_STEPS.findIndex((s) => s.step === step.step);
                    const isActive = globalIdx === currentStepIndex;
                    const isPast = globalIdx < currentStepIndex;
                    const href = projectId ? step.href(projectId) : (step.step === 1 ? "/projects/new" : "#");
                    const Icon = stepIcons[globalIdx] ?? LayoutDashboard;
                    const phaseIdx = phaseSteps.indexOf(step);
                    return (
                      <Link
                        key={step.step}
                        href={href}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
                          isActive && "bg-blue-500 text-white shadow-md shadow-blue-500/25",
                          isPast && !isActive && "text-slate-500 hover:text-slate-700 hover:bg-slate-100",
                          !isActive && !isPast && "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                        )}
                      >
                        <span
                          className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                            isActive ? "bg-blue-400/90 text-white" : "bg-slate-200 text-slate-500"
                          )}
                        >
                          {phaseIdx + 1}
                        </span>
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="hidden md:inline">{step.label}</span>
                      </Link>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <nav className="lg:hidden border-t border-slate-200 bg-white/95 backdrop-blur-xl">
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
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
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
      <main className={cn("min-h-screen", showStepBar ? "pt-32" : "pt-16")}>
        {children}
      </main>
    </div>
  );
}

function NavigationFallback({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-slate-200">
        <div className="flex items-center justify-between px-4 h-16">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/25" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold tracking-tight text-slate-900">UrbAssist</h1>
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
