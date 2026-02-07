"use client"

import { AppLayout, Header } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Building2,
  FolderPlus,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  FileText,
  Calculator,
  Image,
} from "lucide-react"
import Link from "next/link"

const stats = [
  {
    title: "Total Projects",
    value: "12",
    change: "+2 this month",
    icon: Building2,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  {
    title: "In Progress",
    value: "5",
    change: "3 need review",
    icon: Clock,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
  },
  {
    title: "Completed",
    value: "7",
    change: "58% success rate",
    icon: CheckCircle,
    color: "text-green-600",
    bgColor: "bg-green-50",
  },
  {
    title: "Pending Approval",
    value: "3",
    change: "2 urgent",
    icon: AlertCircle,
    color: "text-red-600",
    bgColor: "bg-red-50",
  },
]

const recentProjects = [
  {
    id: 1,
    name: "Maison Individuelle - Rue des Lilas",
    status: "in-progress",
    progress: 65,
    updated: "2 hours ago",
    area: "150 m²",
  },
  {
    id: 2,
    name: "Extension Garage - Avenue du Parc",
    status: "review",
    progress: 90,
    updated: "1 day ago",
    area: "35 m²",
  },
  {
    id: 3,
    name: "Rénovation Façade - Place du Marché",
    status: "completed",
    progress: 100,
    updated: "3 days ago",
    area: "200 m²",
  },
]

const quickActions = [
  {
    title: "New Project",
    description: "Start a new construction project",
    icon: FolderPlus,
    href: "/projects",
    color: "bg-blue-600",
  },
  {
    title: "Analyze PLU",
    description: "Upload and analyze regulations",
    icon: FileText,
    href: "/regulations",
    color: "bg-purple-600",
  },
  {
    title: "Calculate Areas",
    description: "Surface and distance calculator",
    icon: Calculator,
    href: "/calculations",
    color: "bg-green-600",
  },
  {
    title: "Landscape View",
    description: "Photo integration module",
    icon: Image,
    href: "/landscape",
    color: "bg-orange-600",
  },
]

export default function Dashboard() {
  return (
    <AppLayout>
      <Header
        title="Dashboard"
        description="Welcome back! Here's an overview of your projects."
        action={{
          label: "New Project",
          onClick: () => {},
        }}
      />

      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.title} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">{stat.title}</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">{stat.value}</p>
                    <p className="text-xs text-gray-400 mt-1">{stat.change}</p>
                  </div>
                  <div className={`${stat.bgColor} p-3 rounded-xl`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Quick Actions */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
              <CardDescription>Get started quickly</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {quickActions.map((action) => (
                <Link key={action.title} href={action.href}>
                  <div className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer group">
                    <div className={`${action.color} p-2.5 rounded-lg`}>
                      <action.icon className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{action.title}</p>
                      <p className="text-xs text-gray-500">{action.description}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>

          {/* Recent Projects */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Recent Projects</CardTitle>
                <CardDescription>Your latest construction projects</CardDescription>
              </div>
              <Link href="/projects">
                <Button variant="ghost" size="sm">
                  View all
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentProjects.map((project) => (
                  <div
                    key={project.id}
                    className="flex items-center gap-4 p-4 rounded-lg border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-gray-900 truncate">
                          {project.name}
                        </p>
                        <Badge
                          variant={
                            project.status === "completed"
                              ? "success"
                              : project.status === "review"
                              ? "warning"
                              : "info"
                          }
                        >
                          {project.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>{project.area}</span>
                        <span>•</span>
                        <span>{project.updated}</span>
                      </div>
                      <div className="mt-2">
                        <Progress value={project.progress} className="h-1.5" />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-900">
                        {project.progress}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tips Card */}
        <Card className="bg-gradient-to-r from-blue-600 to-blue-700 border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="text-white">
                <h3 className="text-lg font-semibold mb-1">
                  💡 Pro Tip: Use AI Analysis
                </h3>
                <p className="text-blue-100 text-sm max-w-xl">
                  Upload your PLU documents to automatically extract construction
                  regulations and constraints. Our AI will analyze setbacks, heights,
                  and coverage ratios for you.
                </p>
              </div>
              <Link href="/regulations">
                <Button variant="secondary" className="shrink-0">
                  Try it now
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
}
