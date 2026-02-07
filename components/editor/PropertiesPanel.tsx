"use client"

import { useProjectStore } from "@/store/projectStore"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { formatArea, formatDistance } from "@/lib/utils"
import {
  ChevronRight,
  Eye,
  EyeOff,
  Trash2,
  Lock,
  Unlock,
  Copy,
  Palette,
} from "lucide-react"

interface PropertiesPanelProps {
  measurements: {
    area: number
    perimeter: number
  }
}

export function PropertiesPanel({ measurements }: PropertiesPanelProps) {
  const { currentProject, selectedElement, removeElement } = useProjectStore()

  const elements = currentProject?.elements || []

  return (
    <div className="w-80 space-y-4 overflow-y-auto">
      {/* Project Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Project Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-gray-500">Project Name</Label>
            <p className="text-sm font-medium">{currentProject?.name || "Untitled Project"}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-blue-50 p-3">
              <p className="text-xs text-blue-600">Parcel Area</p>
              <p className="text-lg font-semibold text-blue-700">
                {formatArea(currentProject?.parcelArea || 0)}
              </p>
            </div>
            <div className="rounded-lg bg-green-50 p-3">
              <p className="text-xs text-green-600">Buildable</p>
              <p className="text-lg font-semibold text-green-700">
                {formatArea(currentProject?.maxBuildableArea || 0)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Selected Element */}
      {selectedElement && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Selected Element</CardTitle>
              <Badge variant="info">{selectedElement.type}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="element-name" className="text-xs">Name</Label>
              <Input
                id="element-name"
                value={selectedElement.name}
                className="mt-1 h-8 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-gray-50 p-2">
                <p className="text-xs text-gray-500">Area</p>
                <p className="text-sm font-semibold">{formatArea(measurements.area)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-2">
                <p className="text-xs text-gray-500">Perimeter</p>
                <p className="text-sm font-semibold">{formatDistance(measurements.perimeter)}</p>
              </div>
            </div>

            <div className="flex gap-1">
              <Button variant="ghost" size="icon-sm">
                <Palette className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon-sm">
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon-sm">
                <Lock className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon-sm">
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-red-500 hover:text-red-600"
                onClick={() => removeElement(selectedElement.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Measurements */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Live Measurements</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-gray-200 p-3 text-center">
              <p className="text-xs text-gray-500">Surface</p>
              <p className="text-xl font-bold text-gray-900">
                {formatArea(measurements.area)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 text-center">
              <p className="text-xs text-gray-500">Perimeter</p>
              <p className="text-xl font-bold text-gray-900">
                {formatDistance(measurements.perimeter)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Elements List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Elements ({elements.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {elements.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">
              No elements yet. Start drawing!
            </p>
          ) : (
            elements.map((element) => (
              <div
                key={element.id}
                className="flex items-center justify-between rounded-lg p-2 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`h-3 w-3 rounded ${
                      element.type === "building"
                        ? "bg-blue-500"
                        : element.type === "boundary"
                        ? "bg-green-500"
                        : element.type === "setback"
                        ? "bg-red-500"
                        : "bg-gray-500"
                    }`}
                  />
                  <span className="text-sm">{element.name}</span>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
