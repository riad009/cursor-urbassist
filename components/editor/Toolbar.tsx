"use client"

import { useProjectStore } from "@/store/projectStore"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import { Separator } from "@radix-ui/react-separator"
import { cn } from "@/lib/utils"
import {
  MousePointer2,
  Square,
  Pentagon,
  Minus,
  Type,
  Ruler,
  Move,
  Grid3X3,
  Magnet,
  ZoomIn,
  ZoomOut,
  Undo,
  Redo,
  Trash2,
  Download,
  Layers,
  Trees,
  Car,
  Building,
  Fence,
} from "lucide-react"

interface ToolbarProps {
  onAddRectangle: () => void
  onAddPolygon: () => void
  onAddLine: () => void
  onAddText: () => void
  onDelete: () => void
  onClear: () => void
  onExport: () => void
}

export function Toolbar({
  onAddRectangle,
  onAddPolygon,
  onAddLine,
  onAddText,
  onDelete,
  onClear,
  onExport,
}: ToolbarProps) {
  const {
    selectedTool,
    setSelectedTool,
    gridEnabled,
    snapEnabled,
    toggleGrid,
    toggleSnap,
    scale,
    setScale,
  } = useProjectStore()

  const tools = [
    { id: "select" as const, icon: MousePointer2, label: "Select (V)" },
    { id: "pan" as const, icon: Move, label: "Pan (H)" },
    { id: "rectangle" as const, icon: Square, label: "Rectangle (R)" },
    { id: "polygon" as const, icon: Pentagon, label: "Polygon (P)" },
    { id: "line" as const, icon: Minus, label: "Line (L)" },
    { id: "text" as const, icon: Type, label: "Text (T)" },
    { id: "measure" as const, icon: Ruler, label: "Measure (M)" },
  ]

  const presets = [
    { icon: Building, label: "Building", color: "bg-blue-500", action: onAddRectangle },
    { icon: Fence, label: "Boundary", color: "bg-green-500", action: onAddPolygon },
    { icon: Minus, label: "Setback", color: "bg-red-500", action: onAddLine },
    { icon: Trees, label: "Vegetation", color: "bg-emerald-500", action: onAddPolygon },
    { icon: Car, label: "Parking", color: "bg-gray-500", action: onAddRectangle },
  ]

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
        {/* Drawing Tools */}
        <div className="flex items-center gap-1">
          {tools.map((tool) => (
            <Tooltip key={tool.id}>
              <TooltipTrigger asChild>
                <Button
                  variant={selectedTool === tool.id ? "default" : "ghost"}
                  size="icon-sm"
                  onClick={() => {
                    setSelectedTool(tool.id)
                    if (tool.id === "rectangle") onAddRectangle()
                    else if (tool.id === "polygon") onAddPolygon()
                    else if (tool.id === "line") onAddLine()
                    else if (tool.id === "text") onAddText()
                  }}
                  className={cn(
                    selectedTool === tool.id && "bg-blue-600 text-white"
                  )}
                >
                  <tool.icon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{tool.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>

        <div className="h-6 w-px bg-gray-200" />

        {/* Element Presets */}
        <div className="flex items-center gap-1">
          {presets.map((preset, idx) => (
            <Tooltip key={idx}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={preset.action}
                  className="relative"
                >
                  <preset.icon className="h-4 w-4" />
                  <span className={cn(
                    "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full",
                    preset.color
                  )} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{preset.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>

        <div className="h-6 w-px bg-gray-200" />

        {/* Grid & Snap */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={gridEnabled ? "secondary" : "ghost"}
                size="icon-sm"
                onClick={toggleGrid}
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle Grid (G)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={snapEnabled ? "secondary" : "ghost"}
                size="icon-sm"
                onClick={toggleSnap}
              >
                <Magnet className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle Snap (S)</TooltipContent>
          </Tooltip>
        </div>

        <div className="h-6 w-px bg-gray-200" />

        {/* Zoom Controls */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setScale(Math.max(0.25, scale - 0.25))}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom Out</TooltipContent>
          </Tooltip>

          <span className="min-w-[3rem] text-center text-xs font-medium text-gray-600">
            {Math.round(scale * 100)}%
          </span>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setScale(Math.min(4, scale + 0.25))}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom In</TooltipContent>
          </Tooltip>
        </div>

        <div className="h-6 w-px bg-gray-200" />

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <Undo className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <Redo className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Redo (Ctrl+Y)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete (Del)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <Layers className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Layers</TooltipContent>
          </Tooltip>
        </div>

        <div className="h-6 w-px bg-gray-200" />

        {/* Export */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="h-4 w-4" />
              Export
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export as PNG</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
