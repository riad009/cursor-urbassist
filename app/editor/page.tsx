"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import * as fabric from "fabric";
import {
  MousePointer2,
  Square,
  Circle,
  Minus,
  Type,
  Move,
  Trash2,
  ZoomIn,
  ZoomOut,
  Grid3X3,
  Layers,
  Home,
  Car,
  Trees,
  Droplets,
  ArrowLeft,
  Settings,
  Eye,
  EyeOff,
  Ruler,
  Pentagon,
  Hexagon,
  Magnet,
  MapPin,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tool = "select" | "rectangle" | "circle" | "line" | "polygon" | "text" | "pan" | "measure" | "parcel";

interface LayerItem {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  locked: boolean;
}

interface MeasurementLabel extends fabric.FabricObject {
  isMeasurement?: boolean;
  parentId?: string;
}

// Scale configuration: defines how many pixels represent 1 meter
const SCALES = [
  { label: "1:50", value: 0.5, pixelsPerMeter: 20 },
  { label: "1:100", value: 1, pixelsPerMeter: 10 },
  { label: "1:200", value: 2, pixelsPerMeter: 5 },
  { label: "1:500", value: 5, pixelsPerMeter: 2 },
];

const tools = [
  { id: "select", label: "Select", icon: MousePointer2, shortcut: "V" },
  { id: "line", label: "Line", icon: Minus, shortcut: "L" },
  { id: "rectangle", label: "Rectangle", icon: Square, shortcut: "R" },
  { id: "polygon", label: "Polygon", icon: Pentagon, shortcut: "P" },
  { id: "circle", label: "Circle", icon: Circle, shortcut: "C" },
  { id: "measure", label: "Measure", icon: Ruler, shortcut: "M" },
  { id: "parcel", label: "Land Parcel", icon: MapPin, shortcut: "A" },
  { id: "text", label: "Text", icon: Type, shortcut: "T" },
  { id: "pan", label: "Pan", icon: Move, shortcut: "H" },
];

const templates = [
  { id: "house", label: "House", icon: Home, color: "#3b82f6", width: 12, height: 8 },
  { id: "garage", label: "Garage", icon: Car, color: "#8b5cf6", width: 6, height: 5 },
  { id: "pool", label: "Pool", icon: Droplets, color: "#06b6d4", width: 10, height: 5 },
  { id: "garden", label: "Garden", icon: Trees, color: "#22c55e", width: 8, height: 8 },
  { id: "terrace", label: "Terrace", icon: Hexagon, color: "#ec4899", width: 6, height: 4 },
];

const colors = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f59e0b", "#22c55e", "#06b6d4", "#6b7280",
  "#1e293b", "#ffffff",
];

export default function EditorPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [zoom, setZoom] = useState(100);
  const [activeColor, setActiveColor] = useState("#3b82f6");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [showGrid, setShowGrid] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [layers, setLayers] = useState<LayerItem[]>([]);
  const [selectedObject, setSelectedObject] = useState<fabric.FabricObject | null>(null);
  const [canvasSize] = useState({ width: 1400, height: 900 });
  const [currentScale, setCurrentScale] = useState(SCALES[1]); // 1:100 default
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingStart, setDrawingStart] = useState<{ x: number; y: number } | null>(null);
  const [tempShape, setTempShape] = useState<fabric.FabricObject | null>(null);
  const [currentMeasurement, setCurrentMeasurement] = useState<string>("");
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [polygonPoints, setPolygonPoints] = useState<{ x: number; y: number }[]>([]);
  const measurementLabelsRef = useRef<Map<string, fabric.FabricObject[]>>(new Map());

  // Convert pixels to meters based on scale
  const pixelsToMeters = useCallback((pixels: number) => {
    return pixels / currentScale.pixelsPerMeter;
  }, [currentScale]);

  // Convert meters to pixels based on scale
  const metersToPixels = useCallback((meters: number) => {
    return meters * currentScale.pixelsPerMeter;
  }, [currentScale]);

  // Format measurement for display
  const formatMeasurement = useCallback((meters: number) => {
    if (meters < 1) {
      return `${(meters * 100).toFixed(0)} cm`;
    }
    return `${meters.toFixed(2)} m`;
  }, []);

  // Calculate distance between two points
  const calculateDistance = useCallback((x1: number, y1: number, x2: number, y2: number) => {
    const pixelDistance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    return pixelsToMeters(pixelDistance);
  }, [pixelsToMeters]);

  // Create dimension line with arrows and text
  const createDimensionLine = useCallback((
    x1: number, y1: number, x2: number, y2: number,
    parentId: string, offset: number = 20, color: string = "#fbbf24"
  ) => {
    const canvas = fabricRef.current;
    if (!canvas) return [];

    const distance = calculateDistance(x1, y1, x2, y2);
    const label = formatMeasurement(distance);
    
    // Calculate angle and midpoint
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    
    // Offset perpendicular to the line
    const offsetX = Math.sin(angle) * offset;
    const offsetY = -Math.cos(angle) * offset;
    
    const dimX1 = x1 + offsetX;
    const dimY1 = y1 + offsetY;
    const dimX2 = x2 + offsetX;
    const dimY2 = y2 + offsetY;
    const dimMidX = midX + offsetX;
    const dimMidY = midY + offsetY;

    // Create dimension line
    const dimensionLine = new fabric.Line([dimX1, dimY1, dimX2, dimY2], {
      stroke: color,
      strokeWidth: 1,
      selectable: false,
      evented: false,
    }) as MeasurementLabel;
    dimensionLine.isMeasurement = true;
    dimensionLine.parentId = parentId;

    // Create extension lines
    const ext1 = new fabric.Line([x1, y1, dimX1, dimY1], {
      stroke: color,
      strokeWidth: 0.5,
      selectable: false,
      evented: false,
    }) as MeasurementLabel;
    ext1.isMeasurement = true;
    ext1.parentId = parentId;

    const ext2 = new fabric.Line([x2, y2, dimX2, dimY2], {
      stroke: color,
      strokeWidth: 0.5,
      selectable: false,
      evented: false,
    }) as MeasurementLabel;
    ext2.isMeasurement = true;
    ext2.parentId = parentId;

    // Create arrows
    const arrowSize = 6;
    const arrow1Points = [
      { x: dimX1, y: dimY1 },
      { x: dimX1 + Math.cos(angle - Math.PI / 6) * arrowSize, y: dimY1 + Math.sin(angle - Math.PI / 6) * arrowSize },
      { x: dimX1 + Math.cos(angle + Math.PI / 6) * arrowSize, y: dimY1 + Math.sin(angle + Math.PI / 6) * arrowSize },
    ];
    const arrow2Points = [
      { x: dimX2, y: dimY2 },
      { x: dimX2 - Math.cos(angle - Math.PI / 6) * arrowSize, y: dimY2 - Math.sin(angle - Math.PI / 6) * arrowSize },
      { x: dimX2 - Math.cos(angle + Math.PI / 6) * arrowSize, y: dimY2 - Math.sin(angle + Math.PI / 6) * arrowSize },
    ];

    const arrow1 = new fabric.Polygon(arrow1Points, {
      fill: color,
      selectable: false,
      evented: false,
    }) as MeasurementLabel;
    arrow1.isMeasurement = true;
    arrow1.parentId = parentId;

    const arrow2 = new fabric.Polygon(arrow2Points, {
      fill: color,
      selectable: false,
      evented: false,
    }) as MeasurementLabel;
    arrow2.isMeasurement = true;
    arrow2.parentId = parentId;

    // Create text label with background
    const textAngle = (angle * 180) / Math.PI;
    const adjustedAngle = textAngle > 90 || textAngle < -90 ? textAngle + 180 : textAngle;
    
    const text = new fabric.Text(label, {
      left: dimMidX,
      top: dimMidY - 8,
      fontSize: 12,
      fontFamily: "monospace",
      fill: "#0f172a",
      backgroundColor: color,
      padding: 3,
      originX: "center",
      originY: "center",
      angle: adjustedAngle,
      selectable: false,
      evented: false,
    }) as MeasurementLabel;
    text.isMeasurement = true;
    text.parentId = parentId;

    const elements = [dimensionLine, ext1, ext2, arrow1, arrow2, text];
    elements.forEach(el => canvas.add(el));

    return elements;
  }, [calculateDistance, formatMeasurement]);

  // Add measurements to a rectangle
  const addRectMeasurements = useCallback((rect: fabric.Rect, id: string) => {
    const left = rect.left || 0;
    const top = rect.top || 0;
    const width = (rect.width || 0) * (rect.scaleX || 1);
    const height = (rect.height || 0) * (rect.scaleY || 1);

    const measurements: fabric.FabricObject[] = [];

    // Bottom measurement (width)
    measurements.push(...createDimensionLine(left, top + height, left + width, top + height, id, 25, "#fbbf24"));
    
    // Right measurement (height)
    measurements.push(...createDimensionLine(left + width, top, left + width, top + height, id, 25, "#fbbf24"));

    measurementLabelsRef.current.set(id, measurements);
  }, [createDimensionLine]);

  // Add measurements to a polygon/parcel
  const addPolygonMeasurements = useCallback((polygon: fabric.Polygon, id: string) => {
    const points = polygon.points;
    if (!points || points.length < 2) return;

    const measurements: fabric.FabricObject[] = [];

    // Get the polygon's transformation matrix
    const matrix = polygon.calcTransformMatrix();
    
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      
      // Transform points to canvas coordinates
      const transformed1 = fabric.util.transformPoint(
        new fabric.Point(p1.x, p1.y),
        matrix
      );
      const transformed2 = fabric.util.transformPoint(
        new fabric.Point(p2.x, p2.y),
        matrix
      );

      measurements.push(...createDimensionLine(
        transformed1.x, transformed1.y,
        transformed2.x, transformed2.y,
        id, 25, "#22c55e"
      ));
    }

    measurementLabelsRef.current.set(id, measurements);
  }, [createDimensionLine]);

  // Add measurements to a line
  const addLineMeasurement = useCallback((line: fabric.Line, id: string) => {
    const x1 = line.x1 || 0;
    const y1 = line.y1 || 0;
    const x2 = line.x2 || 0;
    const y2 = line.y2 || 0;

    const measurements = createDimensionLine(x1, y1, x2, y2, id, 20, "#fbbf24");
    measurementLabelsRef.current.set(id, measurements);
  }, [createDimensionLine]);

  // Add measurements to a circle
  const addCircleMeasurements = useCallback((circle: fabric.Circle, id: string) => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const centerX = (circle.left || 0) + (circle.radius || 0);
    const centerY = (circle.top || 0) + (circle.radius || 0);
    const radius = (circle.radius || 0) * (circle.scaleX || 1);
    const diameter = pixelsToMeters(radius * 2);

    // Create diameter line
    const diameterLine = new fabric.Line([
      centerX - radius, centerY,
      centerX + radius, centerY
    ], {
      stroke: "#fbbf24",
      strokeWidth: 1,
      strokeDashArray: [5, 3],
      selectable: false,
      evented: false,
    }) as MeasurementLabel;
    diameterLine.isMeasurement = true;
    diameterLine.parentId = id;

    // Create diameter label
    const text = new fabric.Text(`Ø ${formatMeasurement(diameter)}`, {
      left: centerX,
      top: centerY - radius - 20,
      fontSize: 12,
      fontFamily: "monospace",
      fill: "#0f172a",
      backgroundColor: "#fbbf24",
      padding: 3,
      originX: "center",
      selectable: false,
      evented: false,
    }) as MeasurementLabel;
    text.isMeasurement = true;
    text.parentId = id;

    const measurements = [diameterLine, text];
    measurements.forEach(el => canvas.add(el));
    measurementLabelsRef.current.set(id, measurements);
  }, [pixelsToMeters, formatMeasurement]);

  // Remove measurements for an object
  const removeMeasurements = useCallback((id: string) => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const measurements = measurementLabelsRef.current.get(id);
    if (measurements) {
      measurements.forEach(m => canvas.remove(m));
      measurementLabelsRef.current.delete(id);
    }
  }, []);

  // Update measurements when object moves/scales
  const updateObjectMeasurements = useCallback((obj: fabric.FabricObject) => {
    const id = (obj as any).id;
    if (!id) return;

    removeMeasurements(id);

    if (obj.type === "rect") {
      addRectMeasurements(obj as fabric.Rect, id);
    } else if (obj.type === "polygon") {
      addPolygonMeasurements(obj as fabric.Polygon, id);
    } else if (obj.type === "line") {
      addLineMeasurement(obj as fabric.Line, id);
    } else if (obj.type === "circle") {
      addCircleMeasurements(obj as fabric.Circle, id);
    }
  }, [removeMeasurements, addRectMeasurements, addPolygonMeasurements, addLineMeasurement, addCircleMeasurements]);

  // Draw grid based on scale
  const drawGrid = useCallback((canvas: fabric.Canvas) => {
    const gridSize = currentScale.pixelsPerMeter; // 1 meter grid
    const width = canvasSize.width;
    const height = canvasSize.height;

    // Minor grid (every meter)
    for (let i = 0; i <= width / gridSize; i++) {
      const line = new fabric.Line([i * gridSize, 0, i * gridSize, height], {
        stroke: "#1e293b",
        strokeWidth: 0.5,
        selectable: false,
        evented: false,
        excludeFromExport: true,
      });
      (line as any).isGrid = true;
      canvas.add(line);
      canvas.sendObjectToBack(line);
    }

    for (let i = 0; i <= height / gridSize; i++) {
      const line = new fabric.Line([0, i * gridSize, width, i * gridSize], {
        stroke: "#1e293b",
        strokeWidth: 0.5,
        selectable: false,
        evented: false,
        excludeFromExport: true,
      });
      (line as any).isGrid = true;
      canvas.add(line);
      canvas.sendObjectToBack(line);
    }

    // Major grid (every 5 meters)
    const majorGridSize = gridSize * 5;
    for (let i = 0; i <= width / majorGridSize; i++) {
      const line = new fabric.Line([i * majorGridSize, 0, i * majorGridSize, height], {
        stroke: "#334155",
        strokeWidth: 1,
        selectable: false,
        evented: false,
        excludeFromExport: true,
      });
      (line as any).isGrid = true;
      canvas.add(line);
      canvas.sendObjectToBack(line);
    }

    for (let i = 0; i <= height / majorGridSize; i++) {
      const line = new fabric.Line([0, i * majorGridSize, width, i * majorGridSize], {
        stroke: "#334155",
        strokeWidth: 1,
        selectable: false,
        evented: false,
        excludeFromExport: true,
      });
      (line as any).isGrid = true;
      canvas.add(line);
      canvas.sendObjectToBack(line);
    }
  }, [currentScale, canvasSize]);

  const updateLayers = useCallback((canvas: fabric.Canvas) => {
    const objects = canvas.getObjects().filter(obj => {
      const customObj = obj as any;
      return !customObj.excludeFromExport && !customObj.isGrid && !customObj.isMeasurement && !customObj.isPolygonPreview;
    });
    const newLayers: LayerItem[] = objects.map((obj, index) => ({
      id: (obj as any).id || `layer-${index}`,
      name: (obj as any).isParcel ? "Land Parcel" : obj.type || "Object",
      type: obj.type || "unknown",
      visible: obj.visible ?? true,
      locked: !obj.selectable,
    }));
    setLayers(newLayers.reverse());
  }, []);

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: canvasSize.width,
      height: canvasSize.height,
      backgroundColor: "#0f172a",
      selection: true,
      preserveObjectStacking: true,
    });

    fabricRef.current = canvas;

    // Draw grid
    if (showGrid) {
      drawGrid(canvas);
    }

    // Selection events
    canvas.on("selection:created", (e) => {
      if (e.selected?.[0]) {
        setSelectedObject(e.selected[0] as fabric.FabricObject);
      }
    });

    canvas.on("selection:updated", (e) => {
      if (e.selected?.[0]) {
        setSelectedObject(e.selected[0] as fabric.FabricObject);
      }
    });

    canvas.on("selection:cleared", () => {
      setSelectedObject(null);
    });

    // Object modification events - update measurements
    canvas.on("object:modified", (e) => {
      if (e.target) {
        updateObjectMeasurements(e.target);
      }
    });

    canvas.on("object:scaling", (e) => {
      if (e.target) {
        updateObjectMeasurements(e.target);
      }
    });

    canvas.on("object:moving", (e) => {
      if (e.target) {
        updateObjectMeasurements(e.target);
      }
    });

    canvas.on("object:added", () => {
      updateLayers(canvas);
    });

    canvas.on("object:removed", () => {
      updateLayers(canvas);
    });

    return () => {
      canvas.dispose();
    };
  }, [canvasSize, showGrid, drawGrid, updateObjectMeasurements, updateLayers]);

  // Mouse event handlers for drawing with live measurements
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const handleMouseMove = (e: fabric.TPointerEventInfo) => {
      const pointer = canvas.getPointer(e.e);
      setMousePos({ x: pointer.x, y: pointer.y });

      if (isDrawing && drawingStart) {
        const distance = calculateDistance(drawingStart.x, drawingStart.y, pointer.x, pointer.y);
        
        // Update live measurement display based on tool
        if (activeTool === "line" || activeTool === "measure") {
          setCurrentMeasurement(formatMeasurement(distance));
        } else if (activeTool === "rectangle") {
          const width = pixelsToMeters(Math.abs(pointer.x - drawingStart.x));
          const height = pixelsToMeters(Math.abs(pointer.y - drawingStart.y));
          setCurrentMeasurement(`${formatMeasurement(width)} × ${formatMeasurement(height)}`);
        } else if (activeTool === "circle") {
          setCurrentMeasurement(`Ø ${formatMeasurement(distance * 2)}`);
        }

        // Update temporary shape preview
        if (tempShape) {
          canvas.remove(tempShape);
        }

        let newTempShape: fabric.FabricObject | null = null;

        if (activeTool === "line" || activeTool === "measure") {
          newTempShape = new fabric.Line([drawingStart.x, drawingStart.y, pointer.x, pointer.y], {
            stroke: activeTool === "measure" ? "#22c55e" : activeColor,
            strokeWidth: activeTool === "measure" ? 2 : strokeWidth,
            strokeDashArray: activeTool === "measure" ? [5, 5] : undefined,
            selectable: false,
            evented: false,
          });
        } else if (activeTool === "rectangle") {
          const left = Math.min(drawingStart.x, pointer.x);
          const top = Math.min(drawingStart.y, pointer.y);
          newTempShape = new fabric.Rect({
            left,
            top,
            width: Math.abs(pointer.x - drawingStart.x),
            height: Math.abs(pointer.y - drawingStart.y),
            fill: "transparent",
            stroke: activeColor,
            strokeWidth: strokeWidth,
            selectable: false,
            evented: false,
          });
        } else if (activeTool === "circle") {
          const radiusPx = Math.sqrt(Math.pow(pointer.x - drawingStart.x, 2) + Math.pow(pointer.y - drawingStart.y, 2));
          newTempShape = new fabric.Circle({
            left: drawingStart.x - radiusPx,
            top: drawingStart.y - radiusPx,
            radius: radiusPx,
            fill: "transparent",
            stroke: activeColor,
            strokeWidth: strokeWidth,
            selectable: false,
            evented: false,
          });
        }

        if (newTempShape) {
          canvas.add(newTempShape);
          setTempShape(newTempShape);
        }
      }
    };

    const handleMouseDown = (e: fabric.TPointerEventInfo) => {
      if (activeTool === "select" || activeTool === "pan") return;
      
      const pointer = canvas.getPointer(e.e);

      // Polygon/Parcel mode - add points on click
      if (activeTool === "polygon" || activeTool === "parcel") {
        setPolygonPoints(prev => [...prev, { x: pointer.x, y: pointer.y }]);
        return;
      }

      setIsDrawing(true);
      setDrawingStart({ x: pointer.x, y: pointer.y });
    };

    const handleMouseUp = (e: fabric.TPointerEventInfo) => {
      if (!isDrawing || !drawingStart) return;
      
      const pointer = canvas.getPointer(e.e);

      // Remove temp shape
      if (tempShape) {
        canvas.remove(tempShape);
        setTempShape(null);
      }

      // Create final shape with unique ID for measurement tracking
      const shapeId = `shape-${Date.now()}`;

      if (activeTool === "line") {
        const line = new fabric.Line([drawingStart.x, drawingStart.y, pointer.x, pointer.y], {
          stroke: activeColor,
          strokeWidth: strokeWidth,
        });
        (line as any).id = shapeId;
        canvas.add(line);
        addLineMeasurement(line, shapeId);
      } else if (activeTool === "measure") {
        const line = new fabric.Line([drawingStart.x, drawingStart.y, pointer.x, pointer.y], {
          stroke: "#22c55e",
          strokeWidth: 2,
          strokeDashArray: [5, 5],
        });
        (line as any).id = shapeId;
        canvas.add(line);
        addLineMeasurement(line, shapeId);
      } else if (activeTool === "rectangle") {
        const left = Math.min(drawingStart.x, pointer.x);
        const top = Math.min(drawingStart.y, pointer.y);
        const width = Math.abs(pointer.x - drawingStart.x);
        const height = Math.abs(pointer.y - drawingStart.y);
        
        if (width > 5 && height > 5) {
          const rect = new fabric.Rect({
            left,
            top,
            width,
            height,
            fill: "transparent",
            stroke: activeColor,
            strokeWidth: strokeWidth,
          });
          (rect as any).id = shapeId;
          canvas.add(rect);
          addRectMeasurements(rect, shapeId);
        }
      } else if (activeTool === "circle") {
        const radiusPx = Math.sqrt(Math.pow(pointer.x - drawingStart.x, 2) + Math.pow(pointer.y - drawingStart.y, 2));
        if (radiusPx > 5) {
          const circle = new fabric.Circle({
            left: drawingStart.x - radiusPx,
            top: drawingStart.y - radiusPx,
            radius: radiusPx,
            fill: "transparent",
            stroke: activeColor,
            strokeWidth: strokeWidth,
          });
          (circle as any).id = shapeId;
          canvas.add(circle);
          addCircleMeasurements(circle, shapeId);
        }
      }

      canvas.renderAll();
      setIsDrawing(false);
      setDrawingStart(null);
      setCurrentMeasurement("");
    };

    canvas.on("mouse:move", handleMouseMove);
    canvas.on("mouse:down", handleMouseDown);
    canvas.on("mouse:up", handleMouseUp);

    return () => {
      canvas.off("mouse:move", handleMouseMove);
      canvas.off("mouse:down", handleMouseDown);
      canvas.off("mouse:up", handleMouseUp);
    };
  }, [activeTool, isDrawing, drawingStart, tempShape, activeColor, strokeWidth, calculateDistance, formatMeasurement, pixelsToMeters, addLineMeasurement, addRectMeasurements, addCircleMeasurements]);

  // Handle polygon completion with double-click
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const handleDoubleClick = () => {
      if ((activeTool === "polygon" || activeTool === "parcel") && polygonPoints.length >= 3) {
        const shapeId = `parcel-${Date.now()}`;
        
        // Calculate centroid to normalize points
        const centroidX = polygonPoints.reduce((sum, p) => sum + p.x, 0) / polygonPoints.length;
        const centroidY = polygonPoints.reduce((sum, p) => sum + p.y, 0) / polygonPoints.length;
        
        const normalizedPoints = polygonPoints.map(p => ({
          x: p.x - centroidX,
          y: p.y - centroidY,
        }));

        const polygon = new fabric.Polygon(normalizedPoints, {
          left: centroidX,
          top: centroidY,
          fill: activeTool === "parcel" ? "rgba(34, 197, 94, 0.1)" : "transparent",
          stroke: activeTool === "parcel" ? "#22c55e" : activeColor,
          strokeWidth: activeTool === "parcel" ? 3 : strokeWidth,
          originX: "center",
          originY: "center",
        });
        
        (polygon as any).id = shapeId;
        (polygon as any).isParcel = activeTool === "parcel";
        canvas.add(polygon);
        
        // Add measurements to all sides automatically
        addPolygonMeasurements(polygon, shapeId);
        
        canvas.renderAll();
        setPolygonPoints([]);
      }
    };

    canvas.on("mouse:dblclick", handleDoubleClick);

    return () => {
      canvas.off("mouse:dblclick", handleDoubleClick);
    };
  }, [activeTool, polygonPoints, activeColor, strokeWidth, addPolygonMeasurements]);

  // Draw polygon preview points and segments with live measurements
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    // Remove old preview elements
    const oldPreview = canvas.getObjects().filter(obj => (obj as any).isPolygonPreview);
    oldPreview.forEach(p => canvas.remove(p));

    if ((activeTool === "polygon" || activeTool === "parcel") && polygonPoints.length > 0) {
      // Draw points
      polygonPoints.forEach((point, index) => {
        const circle = new fabric.Circle({
          left: point.x - 5,
          top: point.y - 5,
          radius: 5,
          fill: activeTool === "parcel" ? "#22c55e" : activeColor,
          selectable: false,
          evented: false,
        });
        (circle as any).isPolygonPreview = true;
        canvas.add(circle);

        // Draw line to previous point with measurement
        if (index > 0) {
          const prevPoint = polygonPoints[index - 1];
          const line = new fabric.Line([prevPoint.x, prevPoint.y, point.x, point.y], {
            stroke: activeTool === "parcel" ? "#22c55e" : activeColor,
            strokeWidth: 2,
            strokeDashArray: [5, 5],
            selectable: false,
            evented: false,
          });
          (line as any).isPolygonPreview = true;
          canvas.add(line);

          // Add measurement label for each segment
          const distance = calculateDistance(prevPoint.x, prevPoint.y, point.x, point.y);
          const midX = (prevPoint.x + point.x) / 2;
          const midY = (prevPoint.y + point.y) / 2;
          const text = new fabric.Text(formatMeasurement(distance), {
            left: midX,
            top: midY - 15,
            fontSize: 11,
            fontFamily: "monospace",
            fill: "#0f172a",
            backgroundColor: "#fbbf24",
            padding: 2,
            originX: "center",
            selectable: false,
            evented: false,
          });
          (text as any).isPolygonPreview = true;
          canvas.add(text);
        }
      });

      // Draw line from last point to current mouse position
      if (polygonPoints.length > 0) {
        const lastPoint = polygonPoints[polygonPoints.length - 1];
        const line = new fabric.Line([lastPoint.x, lastPoint.y, mousePos.x, mousePos.y], {
          stroke: activeTool === "parcel" ? "#22c55e" : activeColor,
          strokeWidth: 1,
          strokeDashArray: [3, 3],
          selectable: false,
          evented: false,
        });
        (line as any).isPolygonPreview = true;
        canvas.add(line);

        // Show current segment measurement
        const distance = calculateDistance(lastPoint.x, lastPoint.y, mousePos.x, mousePos.y);
        setCurrentMeasurement(formatMeasurement(distance));
      }

      canvas.renderAll();
    }
  }, [polygonPoints, mousePos, activeTool, activeColor, calculateDistance, formatMeasurement]);

  const handleToolSelect = (tool: Tool) => {
    setActiveTool(tool);
    setPolygonPoints([]);
    setCurrentMeasurement("");
    
    const canvas = fabricRef.current;
    if (!canvas) return;

    canvas.isDrawingMode = false;
    canvas.selection = tool === "select";
  };

  const handleZoom = (delta: number) => {
    const newZoom = Math.max(25, Math.min(400, zoom + delta));
    setZoom(newZoom);
    
    const canvas = fabricRef.current;
    if (canvas) {
      canvas.setZoom(newZoom / 100);
      canvas.renderAll();
    }
  };

  const handleDelete = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const activeObjects = canvas.getActiveObjects();
    activeObjects.forEach(obj => {
      const id = (obj as any).id;
      if (id) {
        removeMeasurements(id);
      }
      canvas.remove(obj);
    });
    canvas.discardActiveObject();
    canvas.renderAll();
  };

  const handleClearAll = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    // Remove all non-grid objects
    const objects = canvas.getObjects().filter(obj => !(obj as any).isGrid);
    objects.forEach(obj => canvas.remove(obj));
    
    measurementLabelsRef.current.clear();
    canvas.renderAll();
  };

  const addTemplate = (templateId: string) => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const template = templates.find(t => t.id === templateId);
    if (!template) return;

    const center = canvas.getCenterPoint();
    const shapeId = `${templateId}-${Date.now()}`;
    
    const widthPx = metersToPixels(template.width);
    const heightPx = metersToPixels(template.height);

    const rect = new fabric.Rect({
      left: center.x - widthPx / 2,
      top: center.y - heightPx / 2,
      width: widthPx,
      height: heightPx,
      fill: template.color + "20",
      stroke: template.color,
      strokeWidth: 2,
    });
    
    (rect as any).id = shapeId;
    (rect as any).templateType = templateId;
    canvas.add(rect);
    
    // Add label
    const label = new fabric.Text(template.label, {
      left: center.x,
      top: center.y,
      fontSize: 14,
      fontFamily: "sans-serif",
      fill: template.color,
      originX: "center",
      originY: "center",
      selectable: false,
      evented: false,
    });
    (label as any).isMeasurement = true;
    (label as any).parentId = shapeId;
    canvas.add(label);
    
    addRectMeasurements(rect, shapeId);
    canvas.setActiveObject(rect);
    canvas.renderAll();
  };

  // Create sample parcel with automatic measurements
  const createSampleParcel = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const shapeId = `parcel-sample-${Date.now()}`;
    
    // Create an irregular polygon representing a cadastral land parcel
    // At 1:100 scale (10px per meter), these represent real-world dimensions
    const points = [
      { x: -125, y: -150 },  // ~25m × 30m irregular parcel
      { x: 100, y: -175 },
      { x: 150, y: -50 },
      { x: 125, y: 125 },
      { x: -50, y: 150 },
      { x: -150, y: 50 },
    ];

    const center = canvas.getCenterPoint();
    
    const polygon = new fabric.Polygon(points, {
      left: center.x,
      top: center.y,
      fill: "rgba(34, 197, 94, 0.15)",
      stroke: "#22c55e",
      strokeWidth: 3,
      originX: "center",
      originY: "center",
    });
    
    (polygon as any).id = shapeId;
    (polygon as any).isParcel = true;
    canvas.add(polygon);
    
    // Add measurements to all sides automatically
    addPolygonMeasurements(polygon, shapeId);
    
    // Add parcel label
    const label = new fabric.Text("PARCEL A-123", {
      left: center.x,
      top: center.y,
      fontSize: 16,
      fontFamily: "sans-serif",
      fontWeight: "bold",
      fill: "#22c55e",
      originX: "center",
      originY: "center",
      selectable: false,
      evented: false,
    });
    (label as any).isMeasurement = true;
    (label as any).parentId = shapeId;
    canvas.add(label);
    
    canvas.renderAll();
  };

  return (
    <div className="h-screen bg-slate-950 flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="h-14 bg-slate-900 border-b border-white/10 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Back</span>
          </Link>
          <div className="h-6 w-px bg-white/10" />
          <h1 className="text-lg font-semibold text-white">Technical Drawing Editor</h1>
          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-xs font-medium">
            Scale {currentScale.label}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Scale selector */}
          <select
            value={currentScale.label}
            onChange={(e) => {
              const scale = SCALES.find(s => s.label === e.target.value);
              if (scale) setCurrentScale(scale);
            }}
            className="px-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-white text-sm cursor-pointer"
          >
            {SCALES.map(s => (
              <option key={s.label} value={s.label}>{s.label}</option>
            ))}
          </select>

          <div className="h-6 w-px bg-white/10" />
          
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={cn(
              "p-2 rounded-lg transition-colors",
              showGrid ? "bg-blue-500/20 text-blue-400" : "text-slate-400 hover:text-white"
            )}
            title="Toggle Grid"
          >
            <Grid3X3 className="w-5 h-5" />
          </button>
          
          <button
            onClick={() => setSnapEnabled(!snapEnabled)}
            className={cn(
              "p-2 rounded-lg transition-colors",
              snapEnabled ? "bg-purple-500/20 text-purple-400" : "text-slate-400 hover:text-white"
            )}
            title="Toggle Snap"
          >
            <Magnet className="w-5 h-5" />
          </button>

          <div className="h-6 w-px bg-white/10" />

          <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
            <button onClick={() => handleZoom(-25)} className="p-1.5 text-slate-400 hover:text-white">
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="px-2 text-sm text-white min-w-[50px] text-center">{zoom}%</span>
            <button onClick={() => handleZoom(25)} className="p-1.5 text-slate-400 hover:text-white">
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          <div className="h-6 w-px bg-white/10" />

          <button
            onClick={handleClearAll}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Clear All"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Toolbar */}
        <div className="w-16 bg-slate-900 border-r border-white/10 flex flex-col items-center py-4 gap-1">
          {/* Tools */}
          <div className="space-y-1">
            {tools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  onClick={() => handleToolSelect(tool.id as Tool)}
                  className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center transition-all group relative",
                    activeTool === tool.id
                      ? "bg-gradient-to-br from-blue-500 to-purple-500 text-white shadow-lg shadow-blue-500/25"
                      : "text-slate-400 hover:bg-slate-800 hover:text-white"
                  )}
                  title={`${tool.label} (${tool.shortcut})`}
                >
                  <Icon className="w-5 h-5" />
                </button>
              );
            })}
          </div>

          <div className="w-8 h-px bg-white/10 my-2" />

          {/* Templates with real dimensions */}
          <div className="space-y-1">
            {templates.map((template) => {
              const Icon = template.icon;
              return (
                <button
                  key={template.id}
                  onClick={() => addTemplate(template.id)}
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-800 transition-all group"
                  title={`${template.label} (${template.width}m × ${template.height}m)`}
                >
                  <Icon className="w-5 h-5" style={{ color: template.color }} />
                </button>
              );
            })}
          </div>

          <div className="w-8 h-px bg-white/10 my-2" />

          {/* Sample Parcel Button */}
          <button
            onClick={createSampleParcel}
            className="w-12 h-12 rounded-xl flex items-center justify-center bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-all"
            title="Add Sample Land Parcel with Measurements"
          >
            <MapPin className="w-5 h-5" />
          </button>

          <div className="flex-1" />

          {/* Delete */}
          <button
            onClick={handleDelete}
            className="w-12 h-12 rounded-xl flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-all"
            title="Delete Selected"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>

        {/* Main Canvas Area */}
        <div className="flex-1 relative overflow-hidden" ref={containerRef}>
          {/* Live Measurement Display - Prominent */}
          {currentMeasurement && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
              <div className="px-6 py-3 rounded-xl bg-amber-500 text-slate-900 font-mono font-bold text-xl shadow-lg shadow-amber-500/25">
                📏 {currentMeasurement}
              </div>
            </div>
          )}

          {/* Polygon/Parcel instruction */}
          {(activeTool === "polygon" || activeTool === "parcel") && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
              <div className="px-4 py-2 rounded-xl bg-slate-800 border border-white/10 text-white text-sm">
                Click to add points. <span className="text-amber-400 font-medium">Double-click</span> to complete.
                {polygonPoints.length > 0 && (
                  <span className="ml-2 text-emerald-400">({polygonPoints.length} points)</span>
                )}
              </div>
            </div>
          )}

          {/* Mouse position display */}
          <div className="absolute bottom-4 right-4 z-20">
            <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-white/10 text-slate-300 text-xs font-mono">
              X: {formatMeasurement(pixelsToMeters(mousePos.x))} | Y: {formatMeasurement(pixelsToMeters(mousePos.y))}
            </div>
          </div>

          {/* Canvas */}
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
            <canvas ref={canvasRef} className="shadow-2xl" />
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-72 bg-slate-900 border-l border-white/10 flex flex-col">
          {/* Layers Panel */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-white/10">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  Layers
                </h3>
                <span className="text-xs text-slate-500">{layers.length} objects</span>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {layers.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  <p>No objects yet.</p>
                  <p className="mt-2 text-xs">Draw shapes to see<br/>measurements automatically!</p>
                </div>
              ) : (
                layers.map((layer) => (
                  <div
                    key={layer.id}
                    className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors"
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        layer.name === "Land Parcel" ? "bg-emerald-500/20 text-emerald-400" : "bg-blue-500/20 text-blue-400"
                      )}
                    >
                      {layer.name === "Land Parcel" ? (
                        <MapPin className="w-4 h-4" />
                      ) : layer.type === "rect" ? (
                        <Square className="w-4 h-4" />
                      ) : layer.type === "circle" ? (
                        <Circle className="w-4 h-4" />
                      ) : layer.type === "line" ? (
                        <Minus className="w-4 h-4" />
                      ) : (
                        <Pentagon className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate capitalize">{layer.name}</p>
                      <p className="text-xs text-slate-500">{layer.type}</p>
                    </div>
                    <button className="p-1 text-slate-400 hover:text-white">
                      {layer.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Properties Panel */}
          <div className="border-t border-white/10 p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Properties
            </h3>
            
            {selectedObject ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Type</label>
                  <p className="text-sm text-white capitalize">{selectedObject.type}</p>
                </div>
                {selectedObject.width && (
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Width</label>
                    <p className="text-sm text-amber-400 font-mono font-bold">
                      {formatMeasurement(pixelsToMeters((selectedObject.width || 0) * (selectedObject.scaleX || 1)))}
                    </p>
                  </div>
                )}
                {selectedObject.height && (
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Height</label>
                    <p className="text-sm text-amber-400 font-mono font-bold">
                      {formatMeasurement(pixelsToMeters((selectedObject.height || 0) * (selectedObject.scaleY || 1)))}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Select an object to view properties</p>
            )}

            {/* Color Palette */}
            <div className="mt-4">
              <label className="text-xs text-slate-500 block mb-2">Stroke Color</label>
              <div className="flex flex-wrap gap-1">
                {colors.map((color) => (
                  <button
                    key={color}
                    onClick={() => setActiveColor(color)}
                    className={cn(
                      "w-7 h-7 rounded-lg transition-transform hover:scale-110",
                      activeColor === color && "ring-2 ring-white ring-offset-2 ring-offset-slate-900"
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {/* Stroke Width */}
            <div className="mt-4">
              <label className="text-xs text-slate-500 block mb-2">Stroke Width: {strokeWidth}px</label>
              <input
                type="range"
                min="1"
                max="10"
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
