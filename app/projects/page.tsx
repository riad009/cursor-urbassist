"use client";

import React, { useState } from "react";
import Navigation from "@/components/layout/Navigation";
import {
  Plus,
  Search,
  Filter,
  Grid3X3,
  List,
  MoreHorizontal,
  Calendar,
  MapPin,
  ArrowUpRight,
  Trash2,
  Edit3,
  Copy,
  Star,
  StarOff,
  FolderOpen,
  Clock,
  CheckCircle2,
  AlertCircle,
  Building2,
  Home,
  TreePine,
  Warehouse,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface Project {
  id: number;
  name: string;
  description: string;
  status: "draft" | "in-progress" | "review" | "completed";
  type: "residential" | "commercial" | "extension" | "renovation";
  location: string;
  area: string;
  createdAt: string;
  updatedAt: string;
  progress: number;
  starred: boolean;
  thumbnail: string;
}

const projectsData: Project[] = [
  {
    id: 1,
    name: "Villa Méditerranée",
    description: "Luxury residential villa with pool and garden",
    status: "in-progress",
    type: "residential",
    location: "Nice, France",
    area: "280 m²",
    createdAt: "2026-01-15",
    updatedAt: "2 hours ago",
    progress: 75,
    starred: true,
    thumbnail: "🏠",
  },
  {
    id: 2,
    name: "Commercial Center Aurora",
    description: "Modern commercial complex with retail spaces",
    status: "review",
    type: "commercial",
    location: "Lyon, France",
    area: "1,500 m²",
    createdAt: "2026-01-10",
    updatedAt: "Yesterday",
    progress: 90,
    starred: true,
    thumbnail: "🏢",
  },
  {
    id: 3,
    name: "Garden Extension Project",
    description: "Backyard extension with landscaping",
    status: "completed",
    type: "extension",
    location: "Paris, France",
    area: "85 m²",
    createdAt: "2025-12-20",
    updatedAt: "3 days ago",
    progress: 100,
    starred: false,
    thumbnail: "🌳",
  },
  {
    id: 4,
    name: "Warehouse Renovation",
    description: "Industrial space converted to loft apartments",
    status: "draft",
    type: "renovation",
    location: "Marseille, France",
    area: "450 m²",
    createdAt: "2026-02-01",
    updatedAt: "1 week ago",
    progress: 10,
    starred: false,
    thumbnail: "🏭",
  },
  {
    id: 5,
    name: "Coastal Residence",
    description: "Beach house with panoramic sea views",
    status: "in-progress",
    type: "residential",
    location: "Cannes, France",
    area: "320 m²",
    createdAt: "2026-01-25",
    updatedAt: "5 hours ago",
    progress: 45,
    starred: true,
    thumbnail: "🏖️",
  },
  {
    id: 6,
    name: "Urban Apartment Complex",
    description: "Multi-family residential building",
    status: "review",
    type: "residential",
    location: "Bordeaux, France",
    area: "2,100 m²",
    createdAt: "2026-01-05",
    updatedAt: "2 days ago",
    progress: 85,
    starred: false,
    thumbnail: "🏘️",
  },
];

const statusConfig = {
  draft: { label: "Draft", color: "bg-slate-500/20 text-slate-400", icon: Edit3 },
  "in-progress": { label: "In Progress", color: "bg-blue-500/20 text-blue-400", icon: Clock },
  review: { label: "Review", color: "bg-amber-500/20 text-amber-400", icon: AlertCircle },
  completed: { label: "Completed", color: "bg-emerald-500/20 text-emerald-400", icon: CheckCircle2 },
};

const typeConfig = {
  residential: { label: "Residential", icon: Home, color: "text-blue-400" },
  commercial: { label: "Commercial", icon: Building2, color: "text-purple-400" },
  extension: { label: "Extension", icon: TreePine, color: "text-emerald-400" },
  renovation: { label: "Renovation", icon: Warehouse, color: "text-orange-400" },
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>(projectsData);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showNewModal, setShowNewModal] = useState(false);

  const filteredProjects = projects.filter((project) => {
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === "all" || project.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const toggleStar = (id: number) => {
    setProjects(projects.map(p => 
      p.id === id ? { ...p, starred: !p.starred } : p
    ));
  };

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Projects</h1>
            <p className="text-slate-400 mt-1">Manage and organize your construction projects</p>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:shadow-lg hover:shadow-purple-500/25 transition-all"
          >
            <Plus className="w-5 h-5" />
            New Project
          </button>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl bg-slate-800/50 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-800/50 rounded-xl p-1 border border-white/10">
              <button
                onClick={() => setFilterStatus("all")}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                  filterStatus === "all" ? "bg-blue-500 text-white" : "text-slate-400 hover:text-white"
                )}
              >
                All
              </button>
              {Object.entries(statusConfig).map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => setFilterStatus(key)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    filterStatus === key ? "bg-blue-500 text-white" : "text-slate-400 hover:text-white"
                  )}
                >
                  {config.label}
                </button>
              ))}
            </div>
          </div>

          {/* View Toggle */}
          <div className="flex bg-slate-800/50 rounded-xl p-1 border border-white/10">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-2 rounded-lg transition-colors",
                viewMode === "grid" ? "bg-blue-500 text-white" : "text-slate-400 hover:text-white"
              )}
            >
              <Grid3X3 className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-2 rounded-lg transition-colors",
                viewMode === "list" ? "bg-blue-500 text-white" : "text-slate-400 hover:text-white"
              )}
            >
              <List className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="flex gap-4 overflow-x-auto pb-2">
          {Object.entries(statusConfig).map(([key, config]) => {
            const count = projects.filter(p => p.status === key).length;
            return (
              <div
                key={key}
                className="flex items-center gap-3 px-4 py-2 rounded-xl bg-slate-800/30 border border-white/5 min-w-fit"
              >
                <config.icon className={cn("w-4 h-4", config.color.split(" ")[1])} />
                <span className="text-sm text-white font-medium">{config.label}</span>
                <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", config.color)}>
                  {count}
                </span>
              </div>
            );
          })}
        </div>

        {/* Projects Grid/List */}
        {filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FolderOpen className="w-16 h-16 text-slate-600 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No projects found</h3>
            <p className="text-slate-400 mb-6">Try adjusting your search or filter</p>
            <button
              onClick={() => setShowNewModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 text-white font-semibold hover:bg-blue-600 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Create New Project
            </button>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project) => {
              const status = statusConfig[project.status];
              const type = typeConfig[project.type];
              return (
                <div
                  key={project.id}
                  className="group relative bg-slate-800/50 border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-all hover:-translate-y-1"
                >
                  {/* Header */}
                  <div className="relative h-32 bg-gradient-to-br from-slate-700/50 to-slate-800/50 p-4">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative flex items-start justify-between">
                      <div className="w-14 h-14 rounded-xl bg-slate-700/50 flex items-center justify-center text-3xl">
                        {project.thumbnail}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleStar(project.id)}
                          className={cn(
                            "p-2 rounded-lg transition-colors",
                            project.starred ? "text-amber-400" : "text-slate-500 hover:text-white"
                          )}
                        >
                          {project.starred ? <Star className="w-5 h-5 fill-current" /> : <StarOff className="w-5 h-5" />}
                        </button>
                        <button className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors">
                          <MoreHorizontal className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    <div className="absolute bottom-4 left-4">
                      <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium", status.color)}>
                        {status.label}
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <Link href={`/editor?project=${project.id}`}>
                      <h3 className="text-lg font-semibold text-white mb-1 group-hover:text-blue-400 transition-colors">
                        {project.name}
                      </h3>
                    </Link>
                    <p className="text-sm text-slate-400 line-clamp-2 mb-4">{project.description}</p>

                    <div className="flex items-center gap-4 text-xs text-slate-500 mb-4">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {project.location}
                      </span>
                      <span className="flex items-center gap-1">
                        <type.icon className={cn("w-3.5 h-3.5", type.color)} />
                        {project.area}
                      </span>
                    </div>

                    {/* Progress */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Progress</span>
                        <span className="text-white font-medium">{project.progress}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            project.progress === 100
                              ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                              : "bg-gradient-to-r from-blue-500 to-purple-500"
                          )}
                          style={{ width: `${project.progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {project.updatedAt}
                      </span>
                      <Link
                        href={`/editor?project=${project.id}`}
                        className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 font-medium"
                      >
                        Open
                        <ArrowUpRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="space-y-3">
            {filteredProjects.map((project) => {
              const status = statusConfig[project.status];
              const type = typeConfig[project.type];
              return (
                <div
                  key={project.id}
                  className="group flex items-center gap-4 p-4 bg-slate-800/50 border border-white/10 rounded-xl hover:border-white/20 transition-all"
                >
                  <div className="w-12 h-12 rounded-xl bg-slate-700/50 flex items-center justify-center text-2xl flex-shrink-0">
                    {project.thumbnail}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <Link href={`/editor?project=${project.id}`}>
                        <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors truncate">
                          {project.name}
                        </h3>
                      </Link>
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", status.color)}>
                        {status.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {project.location}
                      </span>
                      <span className="flex items-center gap-1">
                        <type.icon className={cn("w-3.5 h-3.5", type.color)} />
                        {type.label}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {project.area}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-24">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-500">Progress</span>
                        <span className="text-white">{project.progress}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
                          style={{ width: `${project.progress}%` }}
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => toggleStar(project.id)}
                      className={cn(
                        "p-2 rounded-lg transition-colors",
                        project.starred ? "text-amber-400" : "text-slate-500 hover:text-white"
                      )}
                    >
                      {project.starred ? <Star className="w-5 h-5 fill-current" /> : <StarOff className="w-5 h-5" />}
                    </button>
                    <Link
                      href={`/editor?project=${project.id}`}
                      className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      <ArrowUpRight className="w-5 h-5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Project Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-6">Create New Project</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-400 block mb-2">Project Name</label>
                <input
                  type="text"
                  placeholder="e.g., Villa Méditerranée"
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="text-sm text-slate-400 block mb-2">Project Type</label>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(typeConfig).map(([key, config]) => (
                    <button
                      key={key}
                      className="flex items-center gap-3 p-3 rounded-xl bg-slate-800 border border-white/10 hover:border-blue-500/50 transition-colors text-left"
                    >
                      <config.icon className={cn("w-5 h-5", config.color)} />
                      <span className="text-white font-medium">{config.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm text-slate-400 block mb-2">Location</label>
                <input
                  type="text"
                  placeholder="e.g., Paris, France"
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowNewModal(false)}
                className="flex-1 px-5 py-2.5 rounded-xl bg-slate-800 text-white font-medium hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowNewModal(false)}
                className="flex-1 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-medium hover:shadow-lg hover:shadow-purple-500/25 transition-all"
              >
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}
    </Navigation>
  );
}
