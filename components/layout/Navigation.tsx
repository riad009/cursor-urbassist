"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderKanban,
  PenTool,
  FileText,
  Image,
  Calculator,
  Download,
  Menu,
  X,
  Sparkles,
  ChevronRight,
  Building2,
  User,
  Settings,
  Bell,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, color: "from-blue-500 to-cyan-500" },
  { href: "/projects", label: "Projects", icon: FolderKanban, color: "from-violet-500 to-purple-500" },
  { href: "/editor", label: "Design Studio", icon: PenTool, color: "from-pink-500 to-rose-500" },
  { href: "/facades", label: "Facades", icon: Building2, color: "from-cyan-500 to-blue-500" },
  { href: "/regulations", label: "AI Analysis", icon: FileText, color: "from-amber-500 to-orange-500" },
  { href: "/landscape", label: "Landscape", icon: Image, color: "from-emerald-500 to-teal-500" },
  { href: "/calculations", label: "Calculations", icon: Calculator, color: "from-indigo-500 to-blue-500" },
  { href: "/export", label: "Export", icon: Download, color: "from-slate-500 to-gray-500" },
];

export function Navigation({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

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
                <span className="gradient-text">ArchStudio</span>
              </h1>
              <p className="text-[10px] text-slate-400 -mt-1">by roms09</p>
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
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white text-sm font-medium hover:shadow-lg hover:shadow-purple-500/25 transition-all">
              <Sparkles className="w-4 h-4" />
              <span className="hidden sm:inline">Upgrade Pro</span>
            </button>
            <button className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center border border-white/10">
              <User className="w-4 h-4 text-slate-300" />
            </button>

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
      <main className="pt-16 min-h-screen">
        {children}
      </main>
    </div>
  );
}

export default Navigation;
