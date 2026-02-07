"use client"

import { useState } from "react"
import { AppLayout, Header } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import {
  Upload,
  FileText,
  Sparkles,
  CheckCircle,
  AlertTriangle,
  Info,
  Building,
  Ruler,
  Car,
  Trees,
  Palette,
} from "lucide-react"

interface AnalysisResult {
  zoneClassification: string
  maxHeight: number
  setbacks: { front: number; side: number; rear: number }
  maxCoverageRatio: number
  maxFloorAreaRatio: number
  parkingRequirements: string
  greenSpaceRequirements: string
  architecturalConstraints: string[]
  restrictions: string[]
  recommendations: string[]
}

export default function RegulationsPage() {
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [documentContent, setDocumentContent] = useState("")
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [progress, setProgress] = useState(0)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setIsUploading(true)
    setProgress(20)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/upload-document", {
        method: "POST",
        body: formData,
      })

      const data = await response.json()
      setProgress(50)

      if (data.success) {
        setDocumentContent(data.content)
        await analyzeDocument(data.content)
      }
    } catch (error) {
      console.error("Upload failed:", error)
    } finally {
      setIsUploading(false)
    }
  }

  const analyzeDocument = async (content: string) => {
    setIsAnalyzing(true)
    setProgress(70)

    try {
      const response = await fetch("/api/analyze-plu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentContent: content }),
      })

      const data = await response.json()
      setProgress(100)

      if (data.success) {
        setAnalysis(data.analysis)
      }
    } catch (error) {
      console.error("Analysis failed:", error)
    } finally {
      setIsAnalyzing(false)
    }
  }

  return (
    <AppLayout>
      <Header
        title="Regulations Analysis"
        description="Upload PLU documents and analyze urban planning regulations"
      />

      <div className="p-6 space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Upload Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                Upload PLU Document
              </CardTitle>
              <CardDescription>
                Upload your Plan Local d'Urbanisme (PLU) or PLUi document for AI analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-blue-400 transition-colors cursor-pointer"
                onClick={() => document.getElementById("file-upload")?.click()}
              >
                <Upload className="h-10 w-10 mx-auto text-gray-400 mb-3" />
                <p className="text-sm font-medium text-gray-700">
                  {file ? file.name : "Click to upload or drag and drop"}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  PDF, DOC, DOCX, or TXT (max 10MB)
                </p>
                <input
                  id="file-upload"
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {file && (
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-blue-600" />
                    <span className="text-sm font-medium text-blue-700">{file.name}</span>
                  </div>
                  <Badge variant="info">{(file.size / 1024).toFixed(1)} KB</Badge>
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleUpload}
                disabled={!file || isUploading || isAnalyzing}
              >
                {isUploading || isAnalyzing ? (
                  <>
                    <Sparkles className="h-4 w-4 animate-pulse" />
                    {isUploading ? "Uploading..." : "Analyzing with AI..."}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Analyze with Gemini AI
                  </>
                )}
              </Button>

              {(isUploading || isAnalyzing) && (
                <div className="space-y-2">
                  <Progress value={progress} />
                  <p className="text-xs text-center text-gray-500">
                    {progress < 50
                      ? "Uploading document..."
                      : progress < 100
                      ? "Analyzing regulations with AI..."
                      : "Analysis complete!"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Manual Input */}
          <Card>
            <CardHeader>
              <CardTitle>Manual Zone Information</CardTitle>
              <CardDescription>
                Enter zone details manually if you don't have a PLU document
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="zone">Zone Classification</Label>
                  <Input id="zone" placeholder="e.g., UB, UA, UC" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="height">Max Height (m)</Label>
                  <Input id="height" type="number" placeholder="12" className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="front">Front Setback (m)</Label>
                  <Input id="front" type="number" placeholder="5" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="side">Side Setback (m)</Label>
                  <Input id="side" type="number" placeholder="3" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="rear">Rear Setback (m)</Label>
                  <Input id="rear" type="number" placeholder="4" className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="ces">CES (Coverage Ratio)</Label>
                  <Input id="ces" type="number" step="0.1" placeholder="0.4" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="cos">COS (Floor Area Ratio)</Label>
                  <Input id="cos" type="number" step="0.1" placeholder="1.2" className="mt-1" />
                </div>
              </div>
              <Button variant="outline" className="w-full">
                Apply Manual Settings
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Analysis Results */}
        {analysis && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    Analysis Results
                  </CardTitle>
                  <CardDescription>
                    AI-extracted regulations from your PLU document
                  </CardDescription>
                </div>
                <Badge variant="success" className="text-sm">
                  Zone {analysis.zoneClassification}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="constraints">
                <TabsList className="mb-4">
                  <TabsTrigger value="constraints">Constraints</TabsTrigger>
                  <TabsTrigger value="requirements">Requirements</TabsTrigger>
                  <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
                </TabsList>

                <TabsContent value="constraints" className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
                      <div className="flex items-center gap-2 mb-2">
                        <Building className="h-5 w-5 text-blue-600" />
                        <span className="font-medium text-blue-900">Height</span>
                      </div>
                      <p className="text-2xl font-bold text-blue-700">
                        {analysis.maxHeight}m
                      </p>
                      <p className="text-xs text-blue-600">Maximum building height</p>
                    </div>

                    <div className="p-4 rounded-xl bg-green-50 border border-green-100">
                      <div className="flex items-center gap-2 mb-2">
                        <Ruler className="h-5 w-5 text-green-600" />
                        <span className="font-medium text-green-900">Coverage</span>
                      </div>
                      <p className="text-2xl font-bold text-green-700">
                        {(analysis.maxCoverageRatio * 100).toFixed(0)}%
                      </p>
                      <p className="text-xs text-green-600">CES - Emprise au sol</p>
                    </div>

                    <div className="p-4 rounded-xl bg-purple-50 border border-purple-100">
                      <div className="flex items-center gap-2 mb-2">
                        <Ruler className="h-5 w-5 text-purple-600" />
                        <span className="font-medium text-purple-900">Floor Ratio</span>
                      </div>
                      <p className="text-2xl font-bold text-purple-700">
                        {analysis.maxFloorAreaRatio}
                      </p>
                      <p className="text-xs text-purple-600">COS - Coefficient occupation</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-orange-50 border border-orange-100">
                    <h4 className="font-medium text-orange-900 mb-3">Setback Requirements</h4>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-xl font-bold text-orange-700">
                          {analysis.setbacks.front}m
                        </p>
                        <p className="text-xs text-orange-600">Front</p>
                      </div>
                      <div>
                        <p className="text-xl font-bold text-orange-700">
                          {analysis.setbacks.side}m
                        </p>
                        <p className="text-xs text-orange-600">Side</p>
                      </div>
                      <div>
                        <p className="text-xl font-bold text-orange-700">
                          {analysis.setbacks.rear}m
                        </p>
                        <p className="text-xs text-orange-600">Rear</p>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="requirements" className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="p-4 rounded-xl border border-gray-200">
                      <div className="flex items-center gap-2 mb-3">
                        <Car className="h-5 w-5 text-gray-600" />
                        <span className="font-medium">Parking</span>
                      </div>
                      <p className="text-sm text-gray-600">{analysis.parkingRequirements}</p>
                    </div>

                    <div className="p-4 rounded-xl border border-gray-200">
                      <div className="flex items-center gap-2 mb-3">
                        <Trees className="h-5 w-5 text-green-600" />
                        <span className="font-medium">Green Space</span>
                      </div>
                      <p className="text-sm text-gray-600">{analysis.greenSpaceRequirements}</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-gray-200">
                    <div className="flex items-center gap-2 mb-3">
                      <Palette className="h-5 w-5 text-blue-600" />
                      <span className="font-medium">Architectural Constraints</span>
                    </div>
                    <ul className="space-y-2">
                      {analysis.architecturalConstraints.map((constraint, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                          <CheckCircle className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                          {constraint}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-4 rounded-xl bg-red-50 border border-red-100">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                      <span className="font-medium text-red-900">Restrictions</span>
                    </div>
                    <ul className="space-y-2">
                      {analysis.restrictions.map((restriction, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-red-700">
                          <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                          {restriction}
                        </li>
                      ))}
                    </ul>
                  </div>
                </TabsContent>

                <TabsContent value="recommendations" className="space-y-4">
                  <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
                    <div className="flex items-center gap-2 mb-3">
                      <Info className="h-5 w-5 text-blue-600" />
                      <span className="font-medium text-blue-900">AI Recommendations</span>
                    </div>
                    <ul className="space-y-3">
                      {analysis.recommendations.map((rec, idx) => (
                        <li key={idx} className="flex items-start gap-3 p-3 bg-white rounded-lg">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-medium text-white">
                            {idx + 1}
                          </span>
                          <span className="text-sm text-gray-700">{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  )
}
