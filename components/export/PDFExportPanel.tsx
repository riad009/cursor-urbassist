"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  FileText,
  Download,
  Settings2,
  Compass,
  Ruler,
  Layers,
  Calendar,
  User,
  MapPin,
  Hash,
  RefreshCw,
} from "lucide-react"
import {
  PDFExportConfig,
  PAPER_SIZES,
  SCALE_FACTORS,
  getDefaultExportConfig,
  calculateCoverage,
  generateScaleBar,
} from "@/lib/pdfExport"

interface PDFExportPanelProps {
  projectName: string
  projectAddress?: string
  clientName?: string
  onExport: (config: PDFExportConfig) => void
  canvasDataUrl?: string
}

export function PDFExportPanel({
  projectName,
  projectAddress,
  clientName,
  onExport,
  canvasDataUrl,
}: PDFExportPanelProps) {
  const [config, setConfig] = useState<PDFExportConfig>(() =>
    getDefaultExportConfig(projectName)
  )
  const [isGenerating, setIsGenerating] = useState(false)

  const handleExport = async () => {
    setIsGenerating(true)
    try {
      await onExport(config)
    } finally {
      setIsGenerating(false)
    }
  }

  const updateConfig = <K extends keyof PDFExportConfig>(
    key: K,
    value: PDFExportConfig[K]
  ) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  const coverage = calculateCoverage(config.format, config.orientation, config.scale)
  const scaleBar = generateScaleBar(config.scale)

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-600" />
          <CardTitle>Export PDF A3 Calibré</CardTitle>
        </div>
        <CardDescription>
          Générez un plan professionnel au format A3 avec échelle calibrée
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs defaultValue="format" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="format">Format</TabsTrigger>
            <TabsTrigger value="info">Informations</TabsTrigger>
            <TabsTrigger value="options">Options</TabsTrigger>
          </TabsList>

          {/* Format Tab */}
          <TabsContent value="format" className="space-y-4 pt-4">
            {/* Paper Format */}
            <div className="space-y-2">
              <Label>Format du papier</Label>
              <div className="grid grid-cols-4 gap-2">
                {(Object.keys(PAPER_SIZES) as Array<keyof typeof PAPER_SIZES>).map(
                  (format) => (
                    <Button
                      key={format}
                      variant={config.format === format ? "default" : "outline"}
                      size="sm"
                      onClick={() => updateConfig("format", format)}
                      className="relative"
                    >
                      {format}
                      {format === "A3" && (
                        <Badge className="absolute -top-2 -right-2 text-[10px] px-1">
                          Pro
                        </Badge>
                      )}
                    </Button>
                  )
                )}
              </div>
              <p className="text-xs text-gray-500">
                {PAPER_SIZES[config.format].width} × {PAPER_SIZES[config.format].height} mm
                {config.orientation === "landscape" ? " (paysage)" : " (portrait)"}
              </p>
            </div>

            {/* Orientation */}
            <div className="space-y-2">
              <Label>Orientation</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={config.orientation === "landscape" ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateConfig("orientation", "landscape")}
                >
                  <RefreshCw className="h-4 w-4 mr-2 rotate-90" />
                  Paysage
                </Button>
                <Button
                  variant={config.orientation === "portrait" ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateConfig("orientation", "portrait")}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Portrait
                </Button>
              </div>
            </div>

            {/* Scale */}
            <div className="space-y-2">
              <Label>Échelle</Label>
              <div className="grid grid-cols-5 gap-2">
                {(Object.keys(SCALE_FACTORS) as Array<keyof typeof SCALE_FACTORS>).map(
                  (scale) => (
                    <Button
                      key={scale}
                      variant={config.scale === scale ? "default" : "outline"}
                      size="sm"
                      onClick={() => updateConfig("scale", scale as PDFExportConfig["scale"])}
                    >
                      {scale}
                    </Button>
                  )
                )}
              </div>
              <div className="bg-gray-50 rounded-lg p-3 mt-2">
                <p className="text-xs font-medium text-gray-700 mb-1">
                  Couverture réelle à cette échelle:
                </p>
                <p className="text-sm text-gray-600">
                  {coverage.widthMeters.toFixed(1)} × {coverage.heightMeters.toFixed(1)} mètres
                  ({coverage.areaSquareMeters.toFixed(0)} m²)
                </p>
              </div>
            </div>

            {/* Scale Bar Preview */}
            <div className="space-y-2">
              <Label>Aperçu de l&apos;échelle graphique</Label>
              <div className="border rounded-lg p-3 bg-white">
                <div className="flex items-end gap-0.5">
                  {scaleBar.segments.map((seg, i) => (
                    <div
                      key={i}
                      className={`h-3 ${
                        seg.filled ? "bg-gray-800" : "bg-white border border-gray-800"
                      }`}
                      style={{ width: `${100 / scaleBar.segments.length}%` }}
                    />
                  ))}
                </div>
                <div className="flex justify-between mt-1 text-xs text-gray-600">
                  <span>0</span>
                  {scaleBar.segments
                    .filter((_, i) => i % 2 === 1 || i === scaleBar.segments.length - 1)
                    .map((seg, i) => (
                      <span key={i}>{seg.meters.toFixed(0)}m</span>
                    ))}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Info Tab */}
          <TabsContent value="info" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="title" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Titre du document
              </Label>
              <Input
                id="title"
                value={config.title}
                onChange={(e) => updateConfig("title", e.target.value)}
                placeholder="Plan de Masse"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="projectName" className="flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Nom du projet
              </Label>
              <Input
                id="projectName"
                value={config.projectName}
                onChange={(e) => updateConfig("projectName", e.target.value)}
                placeholder="Nom du projet"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="projectAddress" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Adresse
              </Label>
              <Input
                id="projectAddress"
                value={config.projectAddress || ""}
                onChange={(e) => updateConfig("projectAddress", e.target.value)}
                placeholder="Adresse du projet"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="clientName" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Client
                </Label>
                <Input
                  id="clientName"
                  value={config.clientName || ""}
                  onChange={(e) => updateConfig("clientName", e.target.value)}
                  placeholder="Nom du client"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="architect" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Architecte
                </Label>
                <Input
                  id="architect"
                  value={config.architect || ""}
                  onChange={(e) => updateConfig("architect", e.target.value)}
                  placeholder="roms09"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Date
                </Label>
                <Input
                  id="date"
                  value={config.date}
                  onChange={(e) => updateConfig("date", e.target.value)}
                  placeholder="JJ/MM/AAAA"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="revision" className="flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  Révision
                </Label>
                <Input
                  id="revision"
                  value={config.revision || ""}
                  onChange={(e) => updateConfig("revision", e.target.value)}
                  placeholder="A"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="drawingNumber" className="flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  N° Plan
                </Label>
                <Input
                  id="drawingNumber"
                  value={config.drawingNumber || ""}
                  onChange={(e) => updateConfig("drawingNumber", e.target.value)}
                  placeholder="001"
                />
              </div>
            </div>
          </TabsContent>

          {/* Options Tab */}
          <TabsContent value="options" className="space-y-4 pt-4">
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Éléments à afficher
              </Label>

              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant={config.showNorthArrow ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateConfig("showNorthArrow", !config.showNorthArrow)}
                  className="justify-start"
                >
                  <Compass className="h-4 w-4 mr-2" />
                  Flèche Nord
                </Button>

                <Button
                  variant={config.showScaleBar ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateConfig("showScaleBar", !config.showScaleBar)}
                  className="justify-start"
                >
                  <Ruler className="h-4 w-4 mr-2" />
                  Échelle graphique
                </Button>

                <Button
                  variant={config.showLegend ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateConfig("showLegend", !config.showLegend)}
                  className="justify-start"
                >
                  <Layers className="h-4 w-4 mr-2" />
                  Légende
                </Button>

                <Button
                  variant={config.showDimensions ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateConfig("showDimensions", !config.showDimensions)}
                  className="justify-start"
                >
                  <Ruler className="h-4 w-4 mr-2" />
                  Cotations
                </Button>

                <Button
                  variant={config.showGrid ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateConfig("showGrid", !config.showGrid)}
                  className="justify-start col-span-2"
                >
                  <Layers className="h-4 w-4 mr-2" />
                  Grille de référence
                </Button>
              </div>
            </div>

            {/* Auto-populated Info Preview */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <p className="text-xs font-medium text-gray-700">
                Le cartouche sera automatiquement rempli avec:
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                <div>✓ Projet: {config.projectName}</div>
                <div>✓ Échelle: {config.scale}</div>
                <div>✓ Date: {config.date}</div>
                <div>✓ Révision: {config.revision || "A"}</div>
                <div>✓ N° Plan: {config.drawingNumber || "001"}</div>
                <div>✓ Format: {config.format}</div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Export Button */}
        <Button
          className="w-full"
          size="lg"
          onClick={handleExport}
          disabled={isGenerating}
        >
          <Download className="h-4 w-4 mr-2" />
          {isGenerating ? "Génération en cours..." : `Exporter en ${config.format} (${config.scale})`}
        </Button>

        <p className="text-xs text-center text-gray-500">
          Le PDF sera généré avec une calibration précise pour impression à l&apos;échelle
        </p>
      </CardContent>
    </Card>
  )
}
