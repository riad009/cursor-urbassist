"use client";

import React from "react";
import Link from "next/link";
import Navigation from "@/components/layout/Navigation";
import {
  Building2,
  FolderKanban,
  PenTool,
  FileText,
  Calculator,
  Download,
  ArrowUpRight,
  TrendingUp,
  Clock,
  CheckCircle2,
  Sparkles,
  Zap,
  Target,
  Layers,
  Plus,
  Play,
  ArrowRight,
} from "lucide-react";

const stats = [
  {
    label: "Total Projects",
    value: "12",
    change: "+3 this month",
    trend: "up",
    icon: FolderKanban,
    gradient: "from-blue-500 to-cyan-500",
    bgGradient: "from-blue-500/20 to-cyan-500/20",
  },
  {
    label: "Active Designs",
    value: "5",
    change: "2 pending review",
    trend: "neutral",
    icon: Layers,
    gradient: "from-violet-500 to-purple-500",
    bgGradient: "from-violet-500/20 to-purple-500/20",
  },
  {
    label: "Completed",
    value: "7",
    change: "100% on time",
    trend: "up",
    icon: CheckCircle2,
    gradient: "from-emerald-500 to-teal-500",
    bgGradient: "from-emerald-500/20 to-teal-500/20",
  },
  {
    label: "Time Saved",
    value: "48h",
    change: "with AI assistance",
    trend: "up",
    icon: Clock,
    gradient: "from-amber-500 to-orange-500",
    bgGradient: "from-amber-500/20 to-orange-500/20",
  },
];

const quickActions = [
  {
    title: "New Project",
    description: "Start from scratch or template",
    icon: Plus,
    href: "/projects",
    gradient: "from-blue-600 to-blue-400",
    featured: true,
  },
  {
    title: "Design Studio",
    description: "Open the visual editor",
    icon: PenTool,
    href: "/editor",
    gradient: "from-pink-600 to-pink-400",
  },
  {
    title: "AI Analysis",
    description: "Upload PLU documents",
    icon: Sparkles,
    href: "/regulations",
    gradient: "from-violet-600 to-violet-400",
  },
  {
    title: "Export Plans",
    description: "Generate A3 PDF files",
    icon: Download,
    href: "/export",
    gradient: "from-emerald-600 to-emerald-400",
  },
];

const recentProjects = [
  {
    id: 1,
    name: "Villa Méditerranée",
    status: "in-progress",
    progress: 75,
    lastUpdated: "2 hours ago",
    type: "Residential",
    thumbnail: "🏠",
  },
  {
    id: 2,
    name: "Commercial Center",
    status: "review",
    progress: 90,
    lastUpdated: "Yesterday",
    type: "Commercial",
    thumbnail: "🏢",
  },
  {
    id: 3,
    name: "Garden Extension",
    status: "completed",
    progress: 100,
    lastUpdated: "3 days ago",
    type: "Extension",
    thumbnail: "🌳",
  },
];

const features = [
  {
    title: "Smart Drawing Tools",
    description: "AI-powered snap and alignment features",
    icon: Target,
  },
  {
    title: "Real-time Calculations",
    description: "Instant surface and distance metrics",
    icon: Calculator,
  },
  {
    title: "Regulatory Compliance",
    description: "Automatic PLU verification",
    icon: FileText,
  },
  {
    title: "Quick Export",
    description: "One-click A3 PDF generation",
    icon: Zap,
  },
];

export default function Dashboard() {
  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-white/10 p-8 lg:p-12">
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-500/20 to-purple-500/20 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-pink-500/20 to-orange-500/20 blur-3xl rounded-full translate-y-1/2 -translate-x-1/2" />
          
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 text-xs font-medium border border-blue-500/30">
                Demo Project
              </span>
              <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-400 text-xs font-medium border border-purple-500/30">
                roms09
              </span>
            </div>
            <h1 className="text-3xl lg:text-4xl font-bold mb-3">
              Welcome to <span className="gradient-text">ArchStudio</span>
            </h1>
            <p className="text-slate-400 text-lg max-w-xl mb-6">
              Professional construction project design platform. Create, analyze, and export your architectural plans with AI-powered assistance.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/editor"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:shadow-lg hover:shadow-purple-500/25 transition-all group"
              >
                <Play className="w-4 h-4" />
                Start Designing
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="/projects"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-semibold hover:bg-white/10 transition-all"
              >
                <FolderKanban className="w-4 h-4" />
                View Projects
              </Link>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className="group relative overflow-hidden rounded-2xl bg-slate-800/50 border border-white/10 p-5 hover:border-white/20 transition-all hover:-translate-y-1"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.bgGradient} opacity-0 group-hover:opacity-100 transition-opacity`} />
              <div className="relative z-10">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center mb-3 shadow-lg`}>
                  <stat.icon className="w-5 h-5 text-white" />
                </div>
                <p className="text-2xl font-bold text-white mb-1">{stat.value}</p>
                <p className="text-sm text-slate-400">{stat.label}</p>
                <div className="flex items-center gap-1 mt-2">
                  {stat.trend === "up" && <TrendingUp className="w-3 h-3 text-emerald-400" />}
                  <span className="text-xs text-slate-500">{stat.change}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Actions & Recent Projects */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Quick Actions */}
          <div className="lg:col-span-1 space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              Quick Actions
            </h2>
            <div className="space-y-3">
              {quickActions.map((action) => (
                <Link
                  key={action.title}
                  href={action.href}
                  className={`group flex items-center gap-4 p-4 rounded-xl border transition-all hover:-translate-y-0.5 ${
                    action.featured
                      ? "bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-500/30 hover:border-blue-500/50"
                      : "bg-slate-800/50 border-white/10 hover:border-white/20"
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                    <action.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white">{action.title}</p>
                    <p className="text-sm text-slate-400 truncate">{action.description}</p>
                  </div>
                  <ArrowUpRight className="w-5 h-5 text-slate-500 group-hover:text-white group-hover:translate-x-1 group-hover:-translate-y-1 transition-all" />
                </Link>
              ))}
            </div>
          </div>

          {/* Recent Projects */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-400" />
                Recent Projects
              </h2>
              <Link href="/projects" className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">
                View all <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/editor?project=${project.id}`}
                  className="group relative overflow-hidden rounded-xl bg-slate-800/50 border border-white/10 p-4 hover:border-white/20 transition-all hover:-translate-y-1"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-12 h-12 rounded-xl bg-slate-700/50 flex items-center justify-center text-2xl">
                      {project.thumbnail}
                    </div>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        project.status === "completed"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : project.status === "review"
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-blue-500/20 text-blue-400"
                      }`}
                    >
                      {project.status}
                    </span>
                  </div>
                  <h3 className="font-semibold text-white mb-1 group-hover:text-blue-400 transition-colors">
                    {project.name}
                  </h3>
                  <p className="text-xs text-slate-500 mb-3">{project.type} • {project.lastUpdated}</p>
                  <div className="relative h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full ${
                        project.progress === 100
                          ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                          : "bg-gradient-to-r from-blue-500 to-purple-500"
                      }`}
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            Platform Features
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((feature, index) => (
              <div
                key={feature.title}
                className="group p-5 rounded-xl bg-slate-800/30 border border-white/5 hover:border-white/10 hover:bg-slate-800/50 transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-slate-700/50 flex items-center justify-center mb-3 group-hover:bg-gradient-to-br group-hover:from-blue-500/20 group-hover:to-purple-500/20 transition-colors">
                  <feature.icon className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
                </div>
                <h3 className="font-medium text-white mb-1">{feature.title}</h3>
                <p className="text-sm text-slate-500">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="pt-8 border-t border-white/5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
            <p>© 2026 ArchStudio. Demo project by roms09</p>
            <div className="flex items-center gap-4">
              <a href="#" className="hover:text-white transition-colors">Documentation</a>
              <a href="#" className="hover:text-white transition-colors">Support</a>
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
            </div>
          </div>
        </footer>
      </div>
    </Navigation>
  );
}
