"use client"

import { useState } from "react"
import { AppLayout, Header } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useProjectStore } from "@/store/projectStore"
import {
  Plus,
  Search,
  FolderOpen,
  MoreVertical,
  Calendar,
  MapPin,
  Building2,
  ArrowRight,
  Trash2,
  Edit,
  Copy,
} from "lucide-react"
import Link from "next/link"

const demoProjects = [
  {
    id: "1",
    name: "Maison Individuelle - Rue des Lilas",
    description: "Single family home with garden and garage",
    parcelArea: 450,
    maxBuildableArea: 180,
    status: "in-progress",
    location: "Lyon, France",
    createdAt: new Date("2024-01-15"),
    updatedAt: new Date("2024-02-05"),
  },
  {
    id: "2",
    name: "Extension Garage - Avenue du Parc",
    description: "20m² garage extension with storage",
    parcelArea: 320,
    maxBuildableArea: 35,
    status: "review",
    location: "Paris, France",
    createdAt: new Date("2024-01-20"),
    updatedAt: new Date("2024-02-01"),
  },
  {
    id: "3",
    name: "Rénovation Façade - Place du Marché",
    description: "Complete facade renovation with insulation",
    parcelArea: 200,
    maxBuildableArea: 200,
    status: "completed",
    location: "Marseille, France",
    createdAt: new Date("2023-12-10"),
    updatedAt: new Date("2024-01-28"),
  },
  {
    id: "4",
    name: "Immeuble Collectif - Quartier Nord",
    description: "Multi-family residential building - 12 units",
    parcelArea: 1200,
    maxBuildableArea: 480,
    status: "in-progress",
    location: "Bordeaux, France",
    createdAt: new Date("2024-01-05"),
    updatedAt: new Date("2024-02-06"),
  },
]

export default function ProjectsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState("")
  const [newProjectDescription, setNewProjectDescription] = useState("")
  const { createProject } = useProjectStore()

  const filteredProjects = demoProjects.filter(
    (project) =>
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.location.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleCreateProject = () => {
    if (newProjectName.trim()) {
      createProject(newProjectName, newProjectDescription)
      setIsCreateOpen(false)
      setNewProjectName("")
      setNewProjectDescription("")
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "success"
      case "review":
        return "warning"
      case "in-progress":
        return "info"
      default:
        return "default"
    }
  }

  return (
    <AppLayout>
      <Header
        title="Projects"
        description="Manage your construction projects"
        action={{
          label: "New Project",
          onClick: () => setIsCreateOpen(true),
        }}
      />

      <div className="p-6 space-y-6">
        {/* Search and Filters */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              All Status
            </Button>
            <Button variant="outline" size="sm">
              Sort by Date
            </Button>
          </div>
        </div>

        {/* Projects Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <Card
              key={project.id}
              className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg line-clamp-1">
                      {project.name}
                    </CardTitle>
                    <CardDescription className="line-clamp-2">
                      {project.description}
                    </CardDescription>
                  </div>
                  <Badge variant={getStatusColor(project.status) as "success" | "warning" | "info" | "default"}>
                    {project.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <MapPin className="h-4 w-4" />
                  {project.location}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xs text-gray-500">Parcel Area</p>
                    <p className="text-lg font-semibold">{project.parcelArea} m²</p>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-3">
                    <p className="text-xs text-blue-600">Buildable</p>
                    <p className="text-lg font-semibold text-blue-700">
                      {project.maxBuildableArea} m²
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Calendar className="h-3 w-3" />
                    {project.updatedAt.toLocaleDateString()}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon-sm">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm">
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <Link href="/editor">
                  <Button className="w-full" variant="outline">
                    Open Editor
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}

          {/* Create New Project Card */}
          <Card
            className="border-2 border-dashed border-gray-200 hover:border-blue-400 transition-colors cursor-pointer group"
            onClick={() => setIsCreateOpen(true)}
          >
            <CardContent className="flex flex-col items-center justify-center h-full min-h-[300px] text-gray-400 group-hover:text-blue-500 transition-colors">
              <div className="w-16 h-16 rounded-full bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center mb-4 transition-colors">
                <Plus className="h-8 w-8" />
              </div>
              <p className="font-medium">Create New Project</p>
              <p className="text-sm">Start a new construction design</p>
            </CardContent>
          </Card>
        </div>

        {/* Empty State */}
        {filteredProjects.length === 0 && (
          <div className="text-center py-12">
            <FolderOpen className="h-16 w-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">No projects found</h3>
            <p className="text-gray-500 mb-4">
              {searchQuery
                ? "Try adjusting your search terms"
                : "Get started by creating your first project"}
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Create Project
            </Button>
          </div>
        )}
      </div>

      {/* Create Project Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Start a new construction project. You can add details later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                placeholder="e.g., Maison Individuelle - Rue des Lilas"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                placeholder="Brief description of the project..."
                value={newProjectDescription}
                onChange={(e) => setNewProjectDescription(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateProject}>
              <Building2 className="h-4 w-4 mr-1" />
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
