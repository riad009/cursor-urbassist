"use client"

import { useState, useRef } from "react"
import { AppLayout, Header } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Upload,
  Image as ImageIcon,
  Move,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Layers,
  Download,
  Eye,
  Trash2,
  Maximize,
} from "lucide-react"

interface SitePhoto {
  id: string
  name: string
  dataUrl: string
  analysis?: {
    horizonLine: number
    suggestedScale: number
    orientation: string
  }
}

export default function LandscapePage() {
  const [photos, setPhotos] = useState<SitePhoto[]>([])
  const [selectedPhoto, setSelectedPhoto] = useState<SitePhoto | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [overlayOpacity, setOverlayOpacity] = useState(0.7)
  const [overlayScale, setOverlayScale] = useState(1)
  const [overlayPosition, setOverlayPosition] = useState({ x: 50, y: 50 })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    setIsUploading(true)

    for (const file of Array.from(files)) {
      const formData = new FormData()
      formData.append("photo", file)

      try {
        const response = await fetch("/api/landscape", {
          method: "POST",
          body: formData,
        })

        const data = await response.json()

        if (data.success) {
          const newPhoto: SitePhoto = {
            id: crypto.randomUUID(),
            name: data.photo.name,
            dataUrl: data.photo.dataUrl,
            analysis: data.photo.analysis,
          }
          setPhotos((prev) => [...prev, newPhoto])
          if (!selectedPhoto) {
            setSelectedPhoto(newPhoto)
          }
        }
      } catch (error) {
        console.error("Upload failed:", error)
      }
    }

    setIsUploading(false)
  }

  const deletePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id))
    if (selectedPhoto?.id === id) {
      setSelectedPhoto(photos.find((p) => p.id !== id) || null)
    }
  }

  return (
    <AppLayout>
      <Header
        title="Landscape Integration"
        description="Visualize your project integrated into site photos"
      />

      <div className="p-6 space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Photo Gallery */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-blue-600" />
                Site Photos
              </CardTitle>
              <CardDescription>Upload photos of your construction site</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-blue-400 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                <p className="text-sm font-medium text-gray-600">Upload Photos</p>
                <p className="text-xs text-gray-400">JPG, PNG, WebP</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>

              {isUploading && (
                <div className="text-center py-2">
                  <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto" />
                  <p className="text-xs text-gray-500 mt-2">Uploading...</p>
                </div>
              )}

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    className={`relative group rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                      selectedPhoto?.id === photo.id
                        ? "border-blue-500 ring-2 ring-blue-200"
                        : "border-transparent hover:border-gray-200"
                    }`}
                    onClick={() => setSelectedPhoto(photo)}
                  >
                    <img
                      src={photo.dataUrl}
                      alt={photo.name}
                      className="w-full h-24 object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="destructive"
                        size="icon-sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          deletePhoto(photo.id)
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                      <p className="text-xs text-white truncate">{photo.name}</p>
                    </div>
                  </div>
                ))}

                {photos.length === 0 && !isUploading && (
                  <div className="text-center py-8 text-gray-400">
                    <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No photos yet</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Main Viewer */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Landscape Viewer</CardTitle>
                  <CardDescription>Integrate your 3D project into site photos</CardDescription>
                </div>
                {selectedPhoto && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      <Eye className="h-4 w-4 mr-1" />
                      Preview
                    </Button>
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-1" />
                      Export
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {selectedPhoto ? (
                <div className="space-y-4">
                  {/* Image Canvas */}
                  <div className="relative rounded-xl overflow-hidden bg-gray-100 aspect-video">
                    <img
                      src={selectedPhoto.dataUrl}
                      alt={selectedPhoto.name}
                      className="w-full h-full object-cover"
                    />

                    {/* Overlay placeholder */}
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        left: `${overlayPosition.x}%`,
                        top: `${overlayPosition.y}%`,
                        transform: `translate(-50%, -50%) scale(${overlayScale})`,
                        opacity: overlayOpacity,
                      }}
                    >
                      <div className="w-48 h-32 bg-blue-500/30 border-2 border-blue-500 rounded-lg flex items-center justify-center">
                        <span className="text-blue-700 text-sm font-medium">
                          Project Overlay
                        </span>
                      </div>
                    </div>

                    {/* Horizon line indicator */}
                    {selectedPhoto.analysis && (
                      <div
                        className="absolute left-0 right-0 border-t-2 border-dashed border-yellow-500/50"
                        style={{ top: `${selectedPhoto.analysis.horizonLine * 100}%` }}
                      >
                        <Badge className="absolute left-2 -translate-y-1/2 bg-yellow-500 text-xs">
                          Horizon
                        </Badge>
                      </div>
                    )}
                  </div>

                  {/* Controls */}
                  <Tabs defaultValue="position">
                    <TabsList>
                      <TabsTrigger value="position">Position</TabsTrigger>
                      <TabsTrigger value="appearance">Appearance</TabsTrigger>
                      <TabsTrigger value="analysis">Analysis</TabsTrigger>
                    </TabsList>

                    <TabsContent value="position" className="space-y-4 pt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-xs">Horizontal Position (%)</Label>
                          <div className="flex items-center gap-2 mt-1">
                            <Input
                              type="range"
                              min="0"
                              max="100"
                              value={overlayPosition.x}
                              onChange={(e) =>
                                setOverlayPosition((p) => ({
                                  ...p,
                                  x: Number(e.target.value),
                                }))
                              }
                              className="flex-1"
                            />
                            <span className="text-sm w-12 text-right">
                              {overlayPosition.x}%
                            </span>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Vertical Position (%)</Label>
                          <div className="flex items-center gap-2 mt-1">
                            <Input
                              type="range"
                              min="0"
                              max="100"
                              value={overlayPosition.y}
                              onChange={(e) =>
                                setOverlayPosition((p) => ({
                                  ...p,
                                  y: Number(e.target.value),
                                }))
                              }
                              className="flex-1"
                            />
                            <span className="text-sm w-12 text-right">
                              {overlayPosition.y}%
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">
                          <Move className="h-4 w-4 mr-1" />
                          Auto-Align
                        </Button>
                        <Button variant="outline" size="sm">
                          <RotateCw className="h-4 w-4 mr-1" />
                          Reset
                        </Button>
                        <Button variant="outline" size="sm">
                          <Maximize className="h-4 w-4 mr-1" />
                          Fit to Horizon
                        </Button>
                      </div>
                    </TabsContent>

                    <TabsContent value="appearance" className="space-y-4 pt-4">
                      <div>
                        <Label className="text-xs">Scale</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Button
                            variant="outline"
                            size="icon-sm"
                            onClick={() => setOverlayScale((s) => Math.max(0.1, s - 0.1))}
                          >
                            <ZoomOut className="h-4 w-4" />
                          </Button>
                          <Input
                            type="range"
                            min="0.1"
                            max="3"
                            step="0.1"
                            value={overlayScale}
                            onChange={(e) => setOverlayScale(Number(e.target.value))}
                            className="flex-1"
                          />
                          <Button
                            variant="outline"
                            size="icon-sm"
                            onClick={() => setOverlayScale((s) => Math.min(3, s + 0.1))}
                          >
                            <ZoomIn className="h-4 w-4" />
                          </Button>
                          <span className="text-sm w-16 text-right">
                            {(overlayScale * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>

                      <div>
                        <Label className="text-xs">Opacity</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Layers className="h-4 w-4 text-gray-400" />
                          <Input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={overlayOpacity}
                            onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                            className="flex-1"
                          />
                          <span className="text-sm w-12 text-right">
                            {(overlayOpacity * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="analysis" className="space-y-4 pt-4">
                      {selectedPhoto.analysis && (
                        <div className="grid grid-cols-3 gap-4">
                          <div className="p-3 rounded-lg bg-gray-50">
                            <p className="text-xs text-gray-500">Horizon Line</p>
                            <p className="text-lg font-semibold">
                              {(selectedPhoto.analysis.horizonLine * 100).toFixed(0)}%
                            </p>
                          </div>
                          <div className="p-3 rounded-lg bg-gray-50">
                            <p className="text-xs text-gray-500">Suggested Scale</p>
                            <p className="text-lg font-semibold">
                              {selectedPhoto.analysis.suggestedScale}x
                            </p>
                          </div>
                          <div className="p-3 rounded-lg bg-gray-50">
                            <p className="text-xs text-gray-500">Orientation</p>
                            <p className="text-lg font-semibold capitalize">
                              {selectedPhoto.analysis.orientation}
                            </p>
                          </div>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              ) : (
                <div className="aspect-video rounded-xl bg-gray-50 flex items-center justify-center">
                  <div className="text-center text-gray-400">
                    <ImageIcon className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">No photo selected</p>
                    <p className="text-sm">Upload and select a site photo to get started</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  )
}
