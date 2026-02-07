"use client"

import { useState } from "react"
import { AppLayout, Header } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import {
  FileText,
  Image as ImageIcon,
  Download,
  FileCheck,
  Printer,
  Share2,
  CheckCircle,
  Clock,
  AlertCircle,
  Building2,
  Ruler,
  Map,
  Eye,
} from "lucide-react"

const exportDocuments = [
  {
    id: 1,
    name: "Site Plan (Plan de Masse)",
    description: "Complete site plan with dimensions and setbacks",
    type: "PDF",
    status: "ready",
    icon: Map,
  },
  {
    id: 2,
    name: "Floor Plans",
    description: "Detailed floor plans for all levels",
    type: "PDF",
    status: "ready",
    icon: Building2,
  },
  {
    id: 3,
    name: "Elevation Views",
    description: "North, South, East, West elevations",
    type: "PDF",
    status: "generating",
    icon: Ruler,
  },
  {
    id: 4,
    name: "Landscape Integration",
    description: "Photo montage with project visualization",
    type: "PNG",
    status: "ready",
    icon: ImageIcon,
  },
  {
    id: 5,
    name: "Technical Specifications",
    description: "Construction details and materials",
    type: "PDF",
    status: "pending",
    icon: FileText,
  },
  {
    id: 6,
    name: "Regulatory Compliance Report",
    description: "PLU compliance analysis and calculations",
    type: "PDF",
    status: "ready",
    icon: FileCheck,
  },
]

export default function ExportPage() {
  const [selectedDocs, setSelectedDocs] = useState<number[]>([])
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)

  const toggleDocument = (id: number) => {
    setSelectedDocs((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    )
  }

  const selectAll = () => {
    const readyDocs = exportDocuments
      .filter((d) => d.status === "ready")
      .map((d) => d.id)
    setSelectedDocs(readyDocs)
  }

  const handleExport = async () => {
    setIsExporting(true)
    setExportProgress(0)

    // Simulate export progress
    for (let i = 0; i <= 100; i += 10) {
      await new Promise((r) => setTimeout(r, 200))
      setExportProgress(i)
    }

    // Trigger download
    const link = document.createElement("a")
    link.href = "#"
    link.download = "project-documents.zip"
    // In production, this would be a real file URL
    
    setIsExporting(false)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "ready":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "generating":
        return <Clock className="h-4 w-4 text-amber-500 animate-pulse" />
      case "pending":
        return <AlertCircle className="h-4 w-4 text-gray-400" />
      default:
        return null
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ready":
        return <Badge variant="success">Ready</Badge>
      case "generating":
        return <Badge variant="warning">Generating</Badge>
      case "pending":
        return <Badge variant="default">Pending</Badge>
      default:
        return null
    }
  }

  return (
    <AppLayout>
      <Header
        title="Export Documents"
        description="Generate and download regulatory deliverables"
      />

      <div className="p-6 space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Documents List */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Available Documents</CardTitle>
                  <CardDescription>
                    Select documents to include in your export package
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={selectAll}>
                  Select All Ready
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {exportDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                      selectedDocs.includes(doc.id)
                        ? "border-blue-500 bg-blue-50"
                        : doc.status === "ready"
                        ? "border-gray-200 hover:border-gray-300"
                        : "border-gray-100 bg-gray-50 opacity-60"
                    }`}
                    onClick={() => doc.status === "ready" && toggleDocument(doc.id)}
                  >
                    <div
                      className={`p-3 rounded-lg ${
                        selectedDocs.includes(doc.id) ? "bg-blue-100" : "bg-gray-100"
                      }`}
                    >
                      <doc.icon
                        className={`h-5 w-5 ${
                          selectedDocs.includes(doc.id)
                            ? "text-blue-600"
                            : "text-gray-500"
                        }`}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{doc.name}</p>
                        {getStatusBadge(doc.status)}
                      </div>
                      <p className="text-sm text-gray-500 truncate">
                        {doc.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge variant="info" className="text-xs">
                        {doc.type}
                      </Badge>
                      {getStatusIcon(doc.status)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Export Panel */}
          <Card>
            <CardHeader>
              <CardTitle>Export Package</CardTitle>
              <CardDescription>
                {selectedDocs.length} document{selectedDocs.length !== 1 && "s"} selected
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Selected Summary */}
              <div className="space-y-2">
                {selectedDocs.length === 0 ? (
                  <div className="text-center py-6 text-gray-400">
                    <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No documents selected</p>
                  </div>
                ) : (
                  selectedDocs.map((id) => {
                    const doc = exportDocuments.find((d) => d.id === id)
                    if (!doc) return null
                    return (
                      <div
                        key={id}
                        className="flex items-center gap-2 text-sm p-2 bg-blue-50 rounded-lg"
                      >
                        <doc.icon className="h-4 w-4 text-blue-600" />
                        <span className="truncate">{doc.name}</span>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Export Options */}
              <Tabs defaultValue="pdf" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="pdf">PDF Package</TabsTrigger>
                  <TabsTrigger value="images">Images</TabsTrigger>
                </TabsList>
                <TabsContent value="pdf" className="pt-4">
                  <p className="text-xs text-gray-500 mb-3">
                    All documents will be combined into a single PDF file with
                    table of contents.
                  </p>
                </TabsContent>
                <TabsContent value="images" className="pt-4">
                  <p className="text-xs text-gray-500 mb-3">
                    Export high-resolution images (PNG) suitable for printing.
                  </p>
                </TabsContent>
              </Tabs>

              {/* Progress */}
              {isExporting && (
                <div className="space-y-2">
                  <Progress value={exportProgress} />
                  <p className="text-xs text-center text-gray-500">
                    Generating documents... {exportProgress}%
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="space-y-2">
                <Button
                  className="w-full"
                  disabled={selectedDocs.length === 0 || isExporting}
                  onClick={handleExport}
                >
                  <Download className="h-4 w-4 mr-1" />
                  {isExporting ? "Generating..." : "Download Package"}
                </Button>

                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" disabled={selectedDocs.length === 0}>
                    <Eye className="h-4 w-4 mr-1" />
                    Preview
                  </Button>
                  <Button variant="outline" size="sm" disabled={selectedDocs.length === 0}>
                    <Printer className="h-4 w-4 mr-1" />
                    Print
                  </Button>
                </div>

                <Button
                  variant="ghost"
                  className="w-full"
                  disabled={selectedDocs.length === 0}
                >
                  <Share2 className="h-4 w-4 mr-1" />
                  Share with Client
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm">Site Plan</p>
                  <p className="text-2xl font-bold">A3 Format</p>
                </div>
                <Map className="h-8 w-8 text-blue-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm">Scale</p>
                  <p className="text-2xl font-bold">1:100</p>
                </div>
                <Ruler className="h-8 w-8 text-green-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-sm">Visuals</p>
                  <p className="text-2xl font-bold">4 Views</p>
                </div>
                <ImageIcon className="h-8 w-8 text-purple-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white border-0">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-100 text-sm">Compliance</p>
                  <p className="text-2xl font-bold">100%</p>
                </div>
                <FileCheck className="h-8 w-8 text-orange-200" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  )
}
