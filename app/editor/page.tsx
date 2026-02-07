"use client"

import { useState } from "react"
import { AppLayout, Header } from "@/components/layout"
import { Toolbar } from "@/components/editor/Toolbar"
import { PropertiesPanel } from "@/components/editor/PropertiesPanel"
import { CanvasEditor } from "@/components/editor/CanvasEditor"
import { useProjectStore } from "@/store/projectStore"

export default function EditorPage() {
  const { currentProject, createProject } = useProjectStore()
  const [canvasReady, setCanvasReady] = useState(false)

  // Create a default project if none exists
  if (!currentProject) {
    createProject("New Project", "A construction project")
  }

  const {
    canvasRef,
    measurements,
    addRectangle,
    addPolygon,
    addLine,
    addText,
    deleteSelected,
    clearCanvas,
    exportCanvas,
  } = CanvasEditor({ width: 1200, height: 700 })

  return (
    <AppLayout>
      <Header
        title="Project Editor"
        description="Design your construction project graphically"
      />

      <div className="p-6 space-y-4">
        {/* Toolbar */}
        <Toolbar
          onAddRectangle={addRectangle}
          onAddPolygon={addPolygon}
          onAddLine={addLine}
          onAddText={() => addText("Label")}
          onDelete={deleteSelected}
          onClear={clearCanvas}
          onExport={exportCanvas}
        />

        {/* Main Editor Area */}
        <div className="flex gap-6">
          {/* Canvas Container */}
          <div className="flex-1 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-400" />
                <div className="h-3 w-3 rounded-full bg-yellow-400" />
                <div className="h-3 w-3 rounded-full bg-green-400" />
              </div>
              <span className="text-xs text-gray-500">
                {currentProject?.name || "Untitled"} - Canvas Editor
              </span>
              <div className="w-16" />
            </div>
            <div className="p-4 overflow-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
              <canvas
                ref={canvasRef}
                className="border border-gray-200 rounded-lg shadow-inner"
              />
            </div>
          </div>

          {/* Properties Panel */}
          <PropertiesPanel measurements={measurements} />
        </div>
      </div>
    </AppLayout>
  )
}
