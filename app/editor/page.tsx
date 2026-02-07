"use client"

import { useState } from "react"
import { AppLayout, Header } from "@/components/layout"
import { Toolbar } from "@/components/editor/Toolbar"
import { PropertiesPanel } from "@/components/editor/PropertiesPanel"
import { CanvasEditor } from "@/components/editor/CanvasEditor"
import { useProjectStore } from "@/store/projectStore"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Grid3X3, Magnet, Ruler } from "lucide-react"

export default function EditorPage() {
  const { currentProject, createProject } = useProjectStore()
  const [showTemplates, setShowTemplates] = useState(true)

  // Create a default project if none exists
  if (!currentProject) {
    createProject("New Project", "A construction project")
  }

  const {
    canvasRef,
    measurements,
    alignmentGuides,
    dimensionLabels,
    gridSettings,
    addRectangle,
    addPolygon,
    addLine,
    addText,
    addFromTemplate,
    deleteSelected,
    clearCanvas,
    exportCanvas,
    toggleSnapToGrid,
    toggleAutoAlign,
    setGridSize,
    templates,
  } = CanvasEditor({ width: 1200, height: 700 })

  // Group templates by category
  const templatesByCategory = templates.reduce((acc, template) => {
    if (!acc[template.category]) {
      acc[template.category] = []
    }
    acc[template.category].push(template)
    return acc
  }, {} as Record<string, typeof templates>)

  const categoryLabels: Record<string, string> = {
    building: "Constructions",
    parking: "Stationnement",
    vegetation: "Végétation",
    pool: "Piscine",
    terrace: "Terrasse",
    road: "Voirie",
  }

  return (
    <AppLayout>
      <Header
        title="Project Editor"
        description="Design your construction project graphically"
      />

      <div className="p-6 space-y-4">
        {/* Toolbar with Smart Tools */}
        <div className="flex items-center gap-4">
          <Toolbar
            onAddRectangle={addRectangle}
            onAddPolygon={addPolygon}
            onAddLine={addLine}
            onAddText={() => addText("Label")}
            onDelete={deleteSelected}
            onClear={clearCanvas}
            onExport={exportCanvas}
          />
          
          {/* Smart Drawing Controls */}
          <div className="flex items-center gap-2 ml-auto border-l pl-4 border-gray-200">
            <Button
              variant={gridSettings.snapToGrid ? "default" : "outline"}
              size="sm"
              onClick={toggleSnapToGrid}
              className="gap-2"
            >
              <Grid3X3 className="h-4 w-4" />
              Grille
            </Button>
            <Button
              variant={gridSettings.autoAlign ? "default" : "outline"}
              size="sm"
              onClick={toggleAutoAlign}
              className="gap-2"
            >
              <Magnet className="h-4 w-4" />
              Alignement
            </Button>
            <Button
              variant={showTemplates ? "default" : "outline"}
              size="sm"
              onClick={() => setShowTemplates(!showTemplates)}
              className="gap-2"
            >
              <Ruler className="h-4 w-4" />
              Modèles
            </Button>
          </div>
        </div>

        {/* Template Palette */}
        {showTemplates && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium">
                Modèles de formes (cliquez pour ajouter)
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2">
              <div className="flex flex-wrap gap-4">
                {Object.entries(templatesByCategory).map(([category, categoryTemplates]) => (
                  <div key={category} className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-gray-500 mb-1">
                      {categoryLabels[category] || category}
                    </span>
                    <div className="flex gap-1">
                      {categoryTemplates.map((template) => (
                        <Button
                          key={template.id}
                          variant="outline"
                          size="sm"
                          onClick={() => addFromTemplate(template)}
                          className="flex items-center gap-1 px-2 py-1 h-auto"
                          title={`${template.name} (${template.defaultWidth}×${template.defaultHeight}m)`}
                        >
                          <span className="text-lg">{template.icon}</span>
                          <span className="text-xs hidden lg:inline">{template.name}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Editor Area */}
        <div className="flex gap-6">
          {/* Canvas Container */}
          <div className="flex-1 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden relative">
            <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-400" />
                <div className="h-3 w-3 rounded-full bg-yellow-400" />
                <div className="h-3 w-3 rounded-full bg-green-400" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">
                  {currentProject?.name || "Untitled"} - Canvas Editor
                </span>
                {gridSettings.snapToGrid && (
                  <Badge variant="secondary" className="text-xs">
                    Grille: {gridSettings.size}m
                  </Badge>
                )}
              </div>
              <div className="w-16" />
            </div>
            <div className="p-4 overflow-auto relative" style={{ maxHeight: "calc(100vh - 360px)" }}>
              <canvas
                ref={canvasRef}
                className="border border-gray-200 rounded-lg shadow-inner"
              />
              
              {/* Alignment Guide Overlays */}
              {alignmentGuides.length > 0 && (
                <div className="absolute inset-0 pointer-events-none p-4">
                  {alignmentGuides.map((guide, i) => (
                    <div
                      key={i}
                      className={`absolute bg-blue-500 ${
                        guide.type === 'vertical' ? 'w-px h-full' : 'h-px w-full'
                      }`}
                      style={{
                        left: guide.type === 'vertical' ? guide.position : 0,
                        top: guide.type === 'horizontal' ? guide.position : 0,
                      }}
                    />
                  ))}
                </div>
              )}
              
              {/* Dimension Labels */}
              {dimensionLabels.length > 0 && (
                <div className="absolute bottom-6 left-6 bg-white/90 rounded-lg p-2 border shadow-sm">
                  <div className="text-xs font-medium text-gray-700">
                    Dimensions:
                  </div>
                  {dimensionLabels.map((dim) => (
                    <div key={dim.id} className="text-xs text-gray-600">
                      {dim.id === 'width' ? 'Largeur' : 'Hauteur'}: {dim.value} {dim.unit}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Properties Panel */}
          <PropertiesPanel measurements={measurements} />
        </div>
      </div>
    </AppLayout>
  )
}
