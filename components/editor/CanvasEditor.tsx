"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import * as fabric from "fabric"
import { useProjectStore } from "@/store/projectStore"
import { calculatePolygonArea, calculateDistance } from "@/lib/utils"
import { 
  SHAPE_TEMPLATES, 
  ShapeTemplate, 
  snapToGrid, 
  findAlignmentGuides,
  calculateDimensions,
  DEFAULT_GRID_SETTINGS,
  type AlignmentGuide,
  type DimensionLabel 
} from "@/lib/drawingTools"

interface CanvasEditorProps {
  width?: number
  height?: number
}

// Pixels per meter at scale 1:100
const BASE_PIXELS_PER_METER = 10

export function CanvasEditor({ width = 1200, height = 800 }: CanvasEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<fabric.Canvas | null>(null)
  const [measurements, setMeasurements] = useState<{ area: number; perimeter: number }>({
    area: 0,
    perimeter: 0,
  })
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([])
  const [gridSettings, setGridSettings] = useState(DEFAULT_GRID_SETTINGS)
  const [dimensionLabels, setDimensionLabels] = useState<DimensionLabel[]>([])
  
  const { 
    selectedTool, 
    gridEnabled, 
    scale,
    addElement,
    setSelectedElement 
  } = useProjectStore()

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current) return

    const canvas = new fabric.Canvas(canvasRef.current, {
      width,
      height,
      backgroundColor: "#f8fafc",
      selection: true,
      preserveObjectStacking: true,
    })

    fabricRef.current = canvas

    // Draw grid
    if (gridEnabled) {
      drawGrid(canvas)
    }

    // Event handlers
    canvas.on("selection:created", (e) => {
      if (e.selected && e.selected[0]) {
        handleObjectSelected(e.selected[0])
      }
    })

    canvas.on("selection:updated", (e) => {
      if (e.selected && e.selected[0]) {
        handleObjectSelected(e.selected[0])
      }
    })

    canvas.on("selection:cleared", () => {
      setSelectedElement(null)
      setMeasurements({ area: 0, perimeter: 0 })
    })

    canvas.on("object:modified", (e) => {
      if (e.target) {
        updateMeasurements(e.target)
        updateDimensionLabels(e.target)
      }
    })

    // Smart drawing: object moving with snap and alignment
    canvas.on("object:moving", (e) => {
      if (!e.target) return
      
      const target = e.target
      let left = target.left || 0
      let top = target.top || 0
      
      // Snap to grid
      if (gridSettings.snapToGrid) {
        const snapped = snapToGrid(left, top, gridSettings.size, scale * BASE_PIXELS_PER_METER)
        left = snapped.x
        top = snapped.y
        target.set({ left, top })
      }
      
      // Find alignment guides with other objects
      if (gridSettings.autoAlign) {
        const objects = canvas.getObjects().filter(obj => 
          obj !== target && 
          obj.selectable !== false &&
          obj.type !== 'line'
        )
        
        const currentBounds = {
          left: left,
          top: top,
          width: (target.width || 0) * (target.scaleX || 1),
          height: (target.height || 0) * (target.scaleY || 1),
          id: (target as any).id || 'current'
        }
        
        const otherBounds = objects.map(obj => ({
          left: obj.left || 0,
          top: obj.top || 0,
          width: (obj.width || 0) * (obj.scaleX || 1),
          height: (obj.height || 0) * (obj.scaleY || 1),
          id: (obj as any).id || Math.random().toString()
        }))
        
        const guides = findAlignmentGuides(currentBounds, otherBounds, gridSettings.alignThreshold)
        setAlignmentGuides(guides)
        
        // Apply snapping to alignment guides
        guides.forEach(guide => {
          if (guide.type === 'vertical') {
            const diff = Math.abs(left - guide.position)
            if (diff < gridSettings.alignThreshold) {
              target.set({ left: guide.position })
            }
          } else {
            const diff = Math.abs(top - guide.position)
            if (diff < gridSettings.alignThreshold) {
              target.set({ top: guide.position })
            }
          }
        })
      }
      
      canvas.renderAll()
    })
    
    canvas.on("object:moved", () => {
      setAlignmentGuides([])
    })

    return () => {
      canvas.dispose()
    }
  }, [width, height, gridEnabled])

  // Handle tool changes
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    canvas.selection = true

    switch (selectedTool) {
      case "select":
        canvas.defaultCursor = "default"
        break
      case "pan":
        canvas.defaultCursor = "grab"
        break
      case "rectangle":
      case "polygon":
      case "line":
        canvas.defaultCursor = "crosshair"
        break
      case "measure":
        canvas.defaultCursor = "crosshair"
        break
      default:
        canvas.defaultCursor = "default"
    }
  }, [selectedTool])

  const drawGrid = (canvas: fabric.Canvas) => {
    const gridSize = 20 * scale
    const gridColor = "#e2e8f0"

    for (let i = 0; i < canvas.width! / gridSize; i++) {
      const line = new fabric.Line([i * gridSize, 0, i * gridSize, canvas.height!], {
        stroke: gridColor,
        selectable: false,
        evented: false,
        strokeWidth: i % 5 === 0 ? 1 : 0.5,
      })
      canvas.add(line)
    }

    for (let i = 0; i < canvas.height! / gridSize; i++) {
      const line = new fabric.Line([0, i * gridSize, canvas.width!, i * gridSize], {
        stroke: gridColor,
        selectable: false,
        evented: false,
        strokeWidth: i % 5 === 0 ? 1 : 0.5,
      })
      canvas.add(line)
    }
  }

  const handleObjectSelected = (obj: fabric.FabricObject) => {
    updateMeasurements(obj)
  }

  const updateMeasurements = (obj: fabric.FabricObject) => {
    let area = 0
    let perimeter = 0

    if (obj.type === "rect") {
      const rect = obj as fabric.Rect
      const w = (rect.width || 0) * (rect.scaleX || 1)
      const h = (rect.height || 0) * (rect.scaleY || 1)
      area = (w * h) / (scale * scale * 10000) // Convert to m²
      perimeter = (2 * (w + h)) / (scale * 100) // Convert to m
    } else if (obj.type === "polygon") {
      const polygon = obj as fabric.Polygon
      if (polygon.points) {
        area = calculatePolygonArea(polygon.points) / (scale * scale * 10000)
        for (let i = 0; i < polygon.points.length; i++) {
          const p1 = polygon.points[i]
          const p2 = polygon.points[(i + 1) % polygon.points.length]
          perimeter += calculateDistance(p1, p2) / (scale * 100)
        }
      }
    }

    setMeasurements({ area, perimeter })
  }

  const updateDimensionLabels = (obj: fabric.FabricObject) => {
    const pixelsPerMeter = scale * BASE_PIXELS_PER_METER
    const bounds = {
      left: obj.left || 0,
      top: obj.top || 0,
      width: (obj.width || 0) * (obj.scaleX || 1),
      height: (obj.height || 0) * (obj.scaleY || 1),
    }
    const dims = calculateDimensions(bounds, pixelsPerMeter)
    setDimensionLabels(dims)
  }

  const addRectangle = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    const rect = new fabric.Rect({
      left: 100,
      top: 100,
      width: 200,
      height: 150,
      fill: "rgba(59, 130, 246, 0.3)",
      stroke: "#3b82f6",
      strokeWidth: 2,
      rx: 4,
      ry: 4,
    })

    canvas.add(rect)
    canvas.setActiveObject(rect)
    canvas.renderAll()

    addElement({
      id: crypto.randomUUID(),
      type: "building",
      name: "Building",
      data: { fabricId: rect },
      measurements: {},
    })
  }, [addElement])

  const addPolygon = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    const points = [
      { x: 200, y: 100 },
      { x: 350, y: 100 },
      { x: 400, y: 200 },
      { x: 350, y: 300 },
      { x: 200, y: 300 },
      { x: 150, y: 200 },
    ]

    const polygon = new fabric.Polygon(points, {
      fill: "rgba(34, 197, 94, 0.3)",
      stroke: "#22c55e",
      strokeWidth: 2,
    })

    canvas.add(polygon)
    canvas.setActiveObject(polygon)
    canvas.renderAll()

    addElement({
      id: crypto.randomUUID(),
      type: "boundary",
      name: "Parcel Boundary",
      data: { fabricId: polygon },
      measurements: {},
    })
  }, [addElement])

  const addLine = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    const line = new fabric.Line([100, 100, 400, 100], {
      stroke: "#ef4444",
      strokeWidth: 3,
      strokeDashArray: [10, 5],
    })

    canvas.add(line)
    canvas.setActiveObject(line)
    canvas.renderAll()

    addElement({
      id: crypto.randomUUID(),
      type: "setback",
      name: "Setback Line",
      data: { fabricId: line },
      measurements: {},
    })
  }, [addElement])

  const addText = useCallback((text: string = "Label") => {
    const canvas = fabricRef.current
    if (!canvas) return

    const textObj = new fabric.IText(text, {
      left: 200,
      top: 200,
      fontSize: 16,
      fontFamily: "Inter, sans-serif",
      fill: "#1f2937",
    })

    canvas.add(textObj)
    canvas.setActiveObject(textObj)
    canvas.renderAll()
  }, [])

  // Add shape from template (smart drawing tool)
  const addFromTemplate = useCallback((template: ShapeTemplate) => {
    const canvas = fabricRef.current
    if (!canvas) return

    const pixelsPerMeter = scale * BASE_PIXELS_PER_METER
    const widthPx = template.defaultWidth * pixelsPerMeter
    const heightPx = template.defaultHeight * pixelsPerMeter

    // Center position with snap to grid
    let left = (width - widthPx) / 2
    let top = (height - heightPx) / 2

    if (gridSettings.snapToGrid) {
      const snapped = snapToGrid(left, top, gridSettings.size, pixelsPerMeter)
      left = snapped.x
      top = snapped.y
    }

    const rect = new fabric.Rect({
      left,
      top,
      width: widthPx,
      height: heightPx,
      fill: template.color,
      stroke: template.strokeColor,
      strokeWidth: template.strokeWidth,
      opacity: template.opacity,
      rx: 2,
      ry: 2,
    })

    // Store template info on object
    ;(rect as any).templateId = template.id
    ;(rect as any).templateName = template.name
    ;(rect as any).id = crypto.randomUUID()

    canvas.add(rect)
    canvas.setActiveObject(rect)
    canvas.renderAll()

    addElement({
      id: (rect as any).id,
      type: template.category,
      name: template.name,
      data: { fabricId: rect, template: template.id },
      measurements: {
        width: template.defaultWidth,
        height: template.defaultHeight,
        area: template.defaultWidth * template.defaultHeight,
      },
    })

    // Update dimension labels
    updateDimensionLabels(rect)
  }, [addElement, scale, width, height, gridSettings.snapToGrid, gridSettings.size])

  // Toggle grid settings
  const toggleSnapToGrid = useCallback(() => {
    setGridSettings(prev => ({ ...prev, snapToGrid: !prev.snapToGrid }))
  }, [])

  const toggleAutoAlign = useCallback(() => {
    setGridSettings(prev => ({ ...prev, autoAlign: !prev.autoAlign }))
  }, [])

  const setGridSize = useCallback((size: number) => {
    setGridSettings(prev => ({ ...prev, size }))
  }, [])

  const deleteSelected = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    const activeObjects = canvas.getActiveObjects()
    activeObjects.forEach((obj) => {
      canvas.remove(obj)
    })
    canvas.discardActiveObject()
    canvas.renderAll()
  }, [])

  const clearCanvas = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    canvas.clear()
    canvas.backgroundColor = "#f8fafc"
    if (gridEnabled) {
      drawGrid(canvas)
    }
    canvas.renderAll()
  }, [gridEnabled])

  const exportCanvas = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    const dataURL = canvas.toDataURL({
      format: "png",
      quality: 1,
      multiplier: 2,
    })

    const link = document.createElement("a")
    link.download = "project-plan.png"
    link.href = dataURL
    link.click()
  }, [])

  return {
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
    templates: SHAPE_TEMPLATES,
  }
}
