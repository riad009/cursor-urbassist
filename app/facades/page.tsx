"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import * as fabric from "fabric";
import {
  ArrowLeft,
  Square,
  RectangleHorizontal,
  DoorOpen,
  Grid3X3,
  Layers,
  ZoomIn,
  ZoomOut,
  Trash2,
  RotateCcw,
  Download,
  Eye,
  EyeOff,
  Move,
  MousePointer2,
  ChevronDown,
  Home,
  Building2,
  Ruler,
  Triangle,
  CircleDot,
  Minus,
  Plus,
  Copy,
  FlipHorizontal,
  ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Facade view types
type FacadeView = "north" | "south" | "east" | "west";

// Architectural element types
interface ArchElement {
  id: string;
  name: string;
  icon: React.ReactNode;
  category: "openings" | "structure" | "roof" | "details";
  width: number; // in meters
  height: number; // in meters
  color: string;
  createShape: (x: number, y: number, pixelsPerMeter: number) => fabric.FabricObject;
}

// Scale configuration
const FACADE_SCALES = [
  { label: "1:50", pixelsPerMeter: 20 },
  { label: "1:100", pixelsPerMeter: 10 },
  { label: "1:200", pixelsPerMeter: 5 },
];

// Floor level heights in meters
const DEFAULT_FLOOR_HEIGHT = 2.8;
const DEFAULT_GROUND_LEVEL = 0;

export default function FacadesPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const [activeTool, setActiveTool] = useState<string>("select");
  const [activeView, setActiveView] = useState<FacadeView>("north");
  const [zoom, setZoom] = useState(100);
  const [showGrid, setShowGrid] = useState(true);
  const [showLevels, setShowLevels] = useState(true);
  const [currentScale, setCurrentScale] = useState(FACADE_SCALES[1]);
  const [buildingWidth, setBuildingWidth] = useState(12); // meters
  const [buildingHeight, setBuildingHeight] = useState(9); // meters (3 floors)
  const [numFloors, setNumFloors] = useState(3);
  const [groundLevel, setGroundLevel] = useState(0.5); // meters above ground
  const [selectedElement, setSelectedElement] = useState<fabric.FabricObject | null>(null);
  const [canvasSize] = useState({ width: 1200, height: 800 });
  const measurementLabelsRef = useRef<fabric.FabricObject[]>([]);

  // Convert meters to pixels
  const metersToPixels = useCallback((meters: number) => {
    return meters * currentScale.pixelsPerMeter;
  }, [currentScale]);

  // Convert pixels to meters
  const pixelsToMeters = useCallback((pixels: number) => {
    return pixels / currentScale.pixelsPerMeter;
  }, [currentScale]);

  // Format measurement
  const formatMeasurement = useCallback((meters: number) => {
    if (meters < 1) {
      return `${(meters * 100).toFixed(0)} cm`;
    }
    return `${meters.toFixed(2)} m`;
  }, []);

  // Architectural elements library
  const architecturalElements: ArchElement[] = [
    // Openings
    {
      id: "window-standard",
      name: "Standard Window",
      icon: <Square className="w-4 h-4" />,
      category: "openings",
      width: 1.2,
      height: 1.4,
      color: "#60a5fa",
      createShape: (x, y, ppm) => {
        const group = new fabric.Group([], { left: x, top: y });
        // Window frame
        const frame = new fabric.Rect({
          width: 1.2 * ppm,
          height: 1.4 * ppm,
          fill: "#1e3a5f",
          stroke: "#94a3b8",
          strokeWidth: 2,
          left: 0,
          top: 0,
        });
        // Glass panes
        const glass1 = new fabric.Rect({
          width: 0.5 * ppm,
          height: 1.2 * ppm,
          fill: "#60a5fa",
          stroke: "#94a3b8",
          strokeWidth: 1,
          left: 0.1 * ppm,
          top: 0.1 * ppm,
        });
        const glass2 = new fabric.Rect({
          width: 0.5 * ppm,
          height: 1.2 * ppm,
          fill: "#60a5fa",
          stroke: "#94a3b8",
          strokeWidth: 1,
          left: 0.6 * ppm,
          top: 0.1 * ppm,
        });
        group.add(frame, glass1, glass2);
        (group as any).elementType = "window-standard";
        return group;
      },
    },
    {
      id: "window-large",
      name: "Large Window",
      icon: <RectangleHorizontal className="w-4 h-4" />,
      category: "openings",
      width: 2.0,
      height: 1.6,
      color: "#60a5fa",
      createShape: (x, y, ppm) => {
        const group = new fabric.Group([], { left: x, top: y });
        const frame = new fabric.Rect({
          width: 2.0 * ppm,
          height: 1.6 * ppm,
          fill: "#1e3a5f",
          stroke: "#94a3b8",
          strokeWidth: 2,
          left: 0,
          top: 0,
        });
        // 3 panes
        for (let i = 0; i < 3; i++) {
          const glass = new fabric.Rect({
            width: 0.55 * ppm,
            height: 1.4 * ppm,
            fill: "#60a5fa",
            stroke: "#94a3b8",
            strokeWidth: 1,
            left: (0.1 + i * 0.65) * ppm,
            top: 0.1 * ppm,
          });
          group.add(glass);
        }
        group.add(frame);
        group.sendObjectToBack(frame);
        (group as any).elementType = "window-large";
        return group;
      },
    },
    {
      id: "door-entrance",
      name: "Entrance Door",
      icon: <DoorOpen className="w-4 h-4" />,
      category: "openings",
      width: 1.0,
      height: 2.2,
      color: "#92400e",
      createShape: (x, y, ppm) => {
        const group = new fabric.Group([], { left: x, top: y });
        const frame = new fabric.Rect({
          width: 1.0 * ppm,
          height: 2.2 * ppm,
          fill: "#78350f",
          stroke: "#451a03",
          strokeWidth: 3,
          left: 0,
          top: 0,
        });
        // Door panel
        const panel = new fabric.Rect({
          width: 0.8 * ppm,
          height: 1.8 * ppm,
          fill: "#92400e",
          stroke: "#78350f",
          strokeWidth: 1,
          left: 0.1 * ppm,
          top: 0.3 * ppm,
        });
        // Handle
        const handle = new fabric.Circle({
          radius: 0.04 * ppm,
          fill: "#fbbf24",
          left: 0.75 * ppm,
          top: 1.1 * ppm,
        });
        group.add(frame, panel, handle);
        (group as any).elementType = "door-entrance";
        return group;
      },
    },
    {
      id: "door-garage",
      name: "Garage Door",
      icon: <RectangleHorizontal className="w-4 h-4" />,
      category: "openings",
      width: 2.5,
      height: 2.2,
      color: "#6b7280",
      createShape: (x, y, ppm) => {
        const group = new fabric.Group([], { left: x, top: y });
        const frame = new fabric.Rect({
          width: 2.5 * ppm,
          height: 2.2 * ppm,
          fill: "#4b5563",
          stroke: "#374151",
          strokeWidth: 3,
          left: 0,
          top: 0,
        });
        // Horizontal lines for sectional door
        for (let i = 1; i <= 4; i++) {
          const line = new fabric.Line([0, i * 0.44 * ppm, 2.5 * ppm, i * 0.44 * ppm], {
            stroke: "#374151",
            strokeWidth: 2,
            left: 0,
            top: 0,
          });
          group.add(line);
        }
        group.add(frame);
        group.sendObjectToBack(frame);
        (group as any).elementType = "door-garage";
        return group;
      },
    },
    {
      id: "french-window",
      name: "French Window",
      icon: <DoorOpen className="w-4 h-4" />,
      category: "openings",
      width: 1.4,
      height: 2.2,
      color: "#60a5fa",
      createShape: (x, y, ppm) => {
        const group = new fabric.Group([], { left: x, top: y });
        const frame = new fabric.Rect({
          width: 1.4 * ppm,
          height: 2.2 * ppm,
          fill: "#1e3a5f",
          stroke: "#94a3b8",
          strokeWidth: 2,
          left: 0,
          top: 0,
        });
        // Two door panels with glass
        const panel1 = new fabric.Rect({
          width: 0.6 * ppm,
          height: 2.0 * ppm,
          fill: "#3b82f6",
          stroke: "#94a3b8",
          strokeWidth: 1,
          left: 0.1 * ppm,
          top: 0.1 * ppm,
        });
        const panel2 = new fabric.Rect({
          width: 0.6 * ppm,
          height: 2.0 * ppm,
          fill: "#3b82f6",
          stroke: "#94a3b8",
          strokeWidth: 1,
          left: 0.7 * ppm,
          top: 0.1 * ppm,
        });
        group.add(frame, panel1, panel2);
        (group as any).elementType = "french-window";
        return group;
      },
    },
    // Structure elements
    {
      id: "wall-section",
      name: "Wall Section",
      icon: <Square className="w-4 h-4" />,
      category: "structure",
      width: 4.0,
      height: 2.8,
      color: "#d4c4a8",
      createShape: (x, y, ppm) => {
        const rect = new fabric.Rect({
          left: x,
          top: y,
          width: 4.0 * ppm,
          height: 2.8 * ppm,
          fill: "#d4c4a8",
          stroke: "#a8937a",
          strokeWidth: 2,
        });
        (rect as any).elementType = "wall-section";
        return rect;
      },
    },
    {
      id: "balcony",
      name: "Balcony",
      icon: <Minus className="w-4 h-4" />,
      category: "structure",
      width: 3.0,
      height: 1.2,
      color: "#94a3b8",
      createShape: (x, y, ppm) => {
        const group = new fabric.Group([], { left: x, top: y });
        // Balcony floor
        const floor = new fabric.Rect({
          width: 3.0 * ppm,
          height: 0.2 * ppm,
          fill: "#64748b",
          stroke: "#475569",
          strokeWidth: 2,
          left: 0,
          top: 1.0 * ppm,
        });
        // Railing
        const railing = new fabric.Rect({
          width: 3.0 * ppm,
          height: 1.0 * ppm,
          fill: "transparent",
          stroke: "#334155",
          strokeWidth: 2,
          left: 0,
          top: 0,
        });
        // Vertical bars
        for (let i = 0; i <= 6; i++) {
          const bar = new fabric.Line([i * 0.5 * ppm, 0, i * 0.5 * ppm, 1.0 * ppm], {
            stroke: "#334155",
            strokeWidth: 1,
          });
          group.add(bar);
        }
        group.add(floor, railing);
        (group as any).elementType = "balcony";
        return group;
      },
    },
    // Roof elements
    {
      id: "roof-gable",
      name: "Gable Roof",
      icon: <Triangle className="w-4 h-4" />,
      category: "roof",
      width: 12.0,
      height: 3.0,
      color: "#78350f",
      createShape: (x, y, ppm) => {
        const points = [
          { x: 0, y: 3.0 * ppm },
          { x: 6.0 * ppm, y: 0 },
          { x: 12.0 * ppm, y: 3.0 * ppm },
        ];
        const triangle = new fabric.Polygon(points, {
          left: x,
          top: y,
          fill: "#92400e",
          stroke: "#78350f",
          strokeWidth: 3,
        });
        (triangle as any).elementType = "roof-gable";
        return triangle;
      },
    },
    {
      id: "roof-flat",
      name: "Flat Roof Edge",
      icon: <Minus className="w-4 h-4" />,
      category: "roof",
      width: 12.0,
      height: 0.3,
      color: "#374151",
      createShape: (x, y, ppm) => {
        const rect = new fabric.Rect({
          left: x,
          top: y,
          width: 12.0 * ppm,
          height: 0.3 * ppm,
          fill: "#374151",
          stroke: "#1f2937",
          strokeWidth: 2,
        });
        (rect as any).elementType = "roof-flat";
        return rect;
      },
    },
    // Details
    {
      id: "chimney",
      name: "Chimney",
      icon: <Square className="w-4 h-4" />,
      category: "details",
      width: 0.6,
      height: 1.5,
      color: "#78716c",
      createShape: (x, y, ppm) => {
        const group = new fabric.Group([], { left: x, top: y });
        const base = new fabric.Rect({
          width: 0.6 * ppm,
          height: 1.5 * ppm,
          fill: "#78716c",
          stroke: "#57534e",
          strokeWidth: 2,
          left: 0,
          top: 0,
        });
        const cap = new fabric.Rect({
          width: 0.7 * ppm,
          height: 0.1 * ppm,
          fill: "#44403c",
          left: -0.05 * ppm,
          top: 0,
        });
        group.add(base, cap);
        (group as any).elementType = "chimney";
        return group;
      },
    },
    {
      id: "shutter",
      name: "Window Shutter",
      icon: <Square className="w-4 h-4" />,
      category: "details",
      width: 0.4,
      height: 1.4,
      color: "#166534",
      createShape: (x, y, ppm) => {
        const group = new fabric.Group([], { left: x, top: y });
        const frame = new fabric.Rect({
          width: 0.4 * ppm,
          height: 1.4 * ppm,
          fill: "#166534",
          stroke: "#14532d",
          strokeWidth: 2,
          left: 0,
          top: 0,
        });
        // Louvers
        for (let i = 0; i < 7; i++) {
          const louver = new fabric.Line([0.05 * ppm, (0.1 + i * 0.18) * ppm, 0.35 * ppm, (0.1 + i * 0.18) * ppm], {
            stroke: "#14532d",
            strokeWidth: 1,
          });
          group.add(louver);
        }
        group.add(frame);
        group.sendObjectToBack(frame);
        (group as any).elementType = "shutter";
        return group;
      },
    },
  ];

  // Create building outline with floor levels
  const createBuildingOutline = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const ppm = currentScale.pixelsPerMeter;
    const centerX = canvasSize.width / 2;
    const groundY = canvasSize.height - 100;
    
    const widthPx = metersToPixels(buildingWidth);
    const heightPx = metersToPixels(buildingHeight);
    const groundLevelPx = metersToPixels(groundLevel);

    // Ground line
    const groundLine = new fabric.Line([50, groundY, canvasSize.width - 50, groundY], {
      stroke: "#22c55e",
      strokeWidth: 3,
      selectable: false,
      evented: false,
    });
    (groundLine as any).isGuide = true;

    // Ground fill
    const groundFill = new fabric.Rect({
      left: 50,
      top: groundY,
      width: canvasSize.width - 100,
      height: 50,
      fill: "#365314",
      selectable: false,
      evented: false,
    });
    (groundFill as any).isGuide = true;

    // Building outline
    const buildingOutline = new fabric.Rect({
      left: centerX - widthPx / 2,
      top: groundY - heightPx - groundLevelPx,
      width: widthPx,
      height: heightPx,
      fill: "transparent",
      stroke: "#94a3b8",
      strokeWidth: 2,
      strokeDashArray: [10, 5],
      selectable: false,
      evented: false,
    });
    (buildingOutline as any).isGuide = true;
    (buildingOutline as any).isBuildingOutline = true;

    canvas.add(groundFill, groundLine, buildingOutline);

    // Floor level lines and labels
    if (showLevels) {
      const floorHeight = buildingHeight / numFloors;
      
      for (let i = 0; i <= numFloors; i++) {
        const levelY = groundY - groundLevelPx - (i * metersToPixels(floorHeight));
        const levelHeight = groundLevel + (i * floorHeight);
        
        // Level line
        const levelLine = new fabric.Line([
          centerX - widthPx / 2 - 30,
          levelY,
          centerX + widthPx / 2 + 30,
          levelY,
        ], {
          stroke: i === 0 ? "#f59e0b" : "#64748b",
          strokeWidth: i === 0 ? 2 : 1,
          strokeDashArray: i === 0 ? undefined : [5, 5],
          selectable: false,
          evented: false,
        });
        (levelLine as any).isGuide = true;
        (levelLine as any).isLevel = true;

        // Level label
        const levelLabel = new fabric.Text(
          i === 0 ? `RDC (+${formatMeasurement(levelHeight)})` : `N+${i} (+${formatMeasurement(levelHeight)})`,
          {
            left: centerX - widthPx / 2 - 80,
            top: levelY - 8,
            fontSize: 11,
            fontFamily: "monospace",
            fill: i === 0 ? "#f59e0b" : "#94a3b8",
            selectable: false,
            evented: false,
          }
        );
        (levelLabel as any).isGuide = true;
        (levelLabel as any).isLevel = true;

        canvas.add(levelLine, levelLabel);
      }

      // Add height dimension on the right side
      const dimX = centerX + widthPx / 2 + 50;
      const topY = groundY - groundLevelPx - heightPx;
      const bottomY = groundY - groundLevelPx;

      // Vertical dimension line
      const heightDimLine = new fabric.Line([dimX, topY, dimX, bottomY], {
        stroke: "#fbbf24",
        strokeWidth: 2,
        selectable: false,
        evented: false,
      });
      (heightDimLine as any).isGuide = true;

      // Arrows
      const arrowTop = new fabric.Triangle({
        left: dimX - 5,
        top: topY,
        width: 10,
        height: 10,
        fill: "#fbbf24",
        angle: 0,
        selectable: false,
        evented: false,
      });
      (arrowTop as any).isGuide = true;

      const arrowBottom = new fabric.Triangle({
        left: dimX - 5,
        top: bottomY - 10,
        width: 10,
        height: 10,
        fill: "#fbbf24",
        angle: 180,
        selectable: false,
        evented: false,
      });
      (arrowBottom as any).isGuide = true;

      // Height label
      const heightLabel = new fabric.Text(formatMeasurement(buildingHeight), {
        left: dimX + 10,
        top: (topY + bottomY) / 2 - 8,
        fontSize: 14,
        fontFamily: "monospace",
        fill: "#fbbf24",
        fontWeight: "bold",
        selectable: false,
        evented: false,
      });
      (heightLabel as any).isGuide = true;

      // Width dimension at bottom
      const widthDimY = groundY + 30;
      const leftX = centerX - widthPx / 2;
      const rightX = centerX + widthPx / 2;

      const widthDimLine = new fabric.Line([leftX, widthDimY, rightX, widthDimY], {
        stroke: "#fbbf24",
        strokeWidth: 2,
        selectable: false,
        evented: false,
      });
      (widthDimLine as any).isGuide = true;

      const widthLabel = new fabric.Text(formatMeasurement(buildingWidth), {
        left: centerX - 20,
        top: widthDimY + 5,
        fontSize: 14,
        fontFamily: "monospace",
        fill: "#fbbf24",
        fontWeight: "bold",
        selectable: false,
        evented: false,
      });
      (widthLabel as any).isGuide = true;

      canvas.add(heightDimLine, arrowTop, arrowBottom, heightLabel, widthDimLine, widthLabel);
    }

    canvas.renderAll();
  }, [currentScale, canvasSize, buildingWidth, buildingHeight, numFloors, groundLevel, showLevels, metersToPixels, formatMeasurement]);

  // Draw grid
  const drawGrid = useCallback((canvas: fabric.Canvas) => {
    const gridSize = currentScale.pixelsPerMeter;
    
    // Minor grid (every meter)
    for (let x = 0; x <= canvasSize.width; x += gridSize) {
      const line = new fabric.Line([x, 0, x, canvasSize.height], {
        stroke: "#1e293b",
        strokeWidth: 0.5,
        selectable: false,
        evented: false,
      });
      (line as any).isGrid = true;
      canvas.add(line);
      canvas.sendObjectToBack(line);
    }

    for (let y = 0; y <= canvasSize.height; y += gridSize) {
      const line = new fabric.Line([0, y, canvasSize.width, y], {
        stroke: "#1e293b",
        strokeWidth: 0.5,
        selectable: false,
        evented: false,
      });
      (line as any).isGrid = true;
      canvas.add(line);
      canvas.sendObjectToBack(line);
    }

    // Major grid (every 5 meters)
    const majorGridSize = gridSize * 5;
    for (let x = 0; x <= canvasSize.width; x += majorGridSize) {
      const line = new fabric.Line([x, 0, x, canvasSize.height], {
        stroke: "#334155",
        strokeWidth: 1,
        selectable: false,
        evented: false,
      });
      (line as any).isGrid = true;
      canvas.add(line);
      canvas.sendObjectToBack(line);
    }

    for (let y = 0; y <= canvasSize.height; y += majorGridSize) {
      const line = new fabric.Line([0, y, canvasSize.width, y], {
        stroke: "#334155",
        strokeWidth: 1,
        selectable: false,
        evented: false,
      });
      (line as any).isGrid = true;
      canvas.add(line);
      canvas.sendObjectToBack(line);
    }
  }, [currentScale, canvasSize]);

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

    if (showGrid) {
      drawGrid(canvas);
    }

    createBuildingOutline();

    // Selection events
    canvas.on("selection:created", (e) => {
      if (e.selected?.[0]) {
        setSelectedElement(e.selected[0]);
      }
    });

    canvas.on("selection:updated", (e) => {
      if (e.selected?.[0]) {
        setSelectedElement(e.selected[0]);
      }
    });

    canvas.on("selection:cleared", () => {
      setSelectedElement(null);
    });

    return () => {
      canvas.dispose();
    };
  }, [canvasSize, showGrid, drawGrid, createBuildingOutline]);

  // Add architectural element to canvas
  const addElement = (element: ArchElement) => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const center = canvas.getCenterPoint();
    const shape = element.createShape(center.x, center.y, currentScale.pixelsPerMeter);
    
    (shape as any).id = `${element.id}-${Date.now()}`;
    (shape as any).elementName = element.name;
    
    canvas.add(shape);
    canvas.setActiveObject(shape);
    canvas.renderAll();
    setActiveTool("select");
  };

  // Handle delete
  const handleDelete = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const activeObjects = canvas.getActiveObjects();
    activeObjects.forEach(obj => {
      if (!(obj as any).isGrid && !(obj as any).isGuide) {
        canvas.remove(obj);
      }
    });
    canvas.discardActiveObject();
    canvas.renderAll();
  };

  // Handle duplicate
  const handleDuplicate = () => {
    const canvas = fabricRef.current;
    if (!canvas || !selectedElement) return;

    selectedElement.clone().then((cloned: fabric.FabricObject) => {
      cloned.set({
        left: (selectedElement.left || 0) + 20,
        top: (selectedElement.top || 0) + 20,
      });
      (cloned as any).id = `clone-${Date.now()}`;
      canvas.add(cloned);
      canvas.setActiveObject(cloned);
      canvas.renderAll();
    });
  };

  // Handle flip horizontal
  const handleFlipHorizontal = () => {
    const canvas = fabricRef.current;
    if (!canvas || !selectedElement) return;

    selectedElement.set("flipX", !selectedElement.flipX);
    canvas.renderAll();
  };

  // Handle zoom
  const handleZoom = (delta: number) => {
    const newZoom = Math.max(25, Math.min(200, zoom + delta));
    setZoom(newZoom);
    
    const canvas = fabricRef.current;
    if (canvas) {
      canvas.setZoom(newZoom / 100);
      canvas.renderAll();
    }
  };

  // Regenerate building outline when parameters change
  const regenerateOutline = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    // Remove old guides
    const guides = canvas.getObjects().filter(obj => (obj as any).isGuide);
    guides.forEach(g => canvas.remove(g));

    createBuildingOutline();
  };

  // Export facade
  const handleExport = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const dataURL = canvas.toDataURL({
      format: "png",
      quality: 1,
      multiplier: 2,
    });

    const link = document.createElement("a");
    link.download = `facade-${activeView}-${Date.now()}.png`;
    link.href = dataURL;
    link.click();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="h-14 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900/50">
        <div className="flex items-center gap-4">
          <Link href="/editor" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Plan</span>
          </Link>
          <div className="h-6 w-px bg-slate-700" />
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-400" />
            <h1 className="font-semibold">Facade Editor</h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* View selector */}
          <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
            {(["north", "south", "east", "west"] as FacadeView[]).map((view) => (
              <button
                key={view}
                onClick={() => setActiveView(view)}
                className={cn(
                  "px-3 py-1 text-sm rounded-md transition-colors capitalize",
                  activeView === view
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:text-white hover:bg-slate-700"
                )}
              >
                {view}
              </button>
            ))}
          </div>

          {/* Scale selector */}
          <select
            value={currentScale.label}
            onChange={(e) => {
              const scale = FACADE_SCALES.find(s => s.label === e.target.value);
              if (scale) setCurrentScale(scale);
            }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm"
          >
            {FACADE_SCALES.map((scale) => (
              <option key={scale.label} value={scale.label}>
                {scale.label}
              </option>
            ))}
          </select>

          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Left sidebar - Element Library */}
        <aside className="w-64 border-r border-slate-800 bg-slate-900/50 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">
              Architectural Elements
            </h2>

            {/* Openings */}
            <div className="mb-6">
              <h3 className="text-xs font-medium text-slate-500 mb-2">Openings</h3>
              <div className="grid grid-cols-2 gap-2">
                {architecturalElements
                  .filter((el) => el.category === "openings")
                  .map((element) => (
                    <button
                      key={element.id}
                      onClick={() => addElement(element)}
                      className="flex flex-col items-center gap-1 p-3 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors group"
                    >
                      <div
                        className="w-8 h-8 rounded flex items-center justify-center"
                        style={{ backgroundColor: element.color + "30", color: element.color }}
                      >
                        {element.icon}
                      </div>
                      <span className="text-xs text-slate-400 group-hover:text-white text-center">
                        {element.name}
                      </span>
                    </button>
                  ))}
              </div>
            </div>

            {/* Structure */}
            <div className="mb-6">
              <h3 className="text-xs font-medium text-slate-500 mb-2">Structure</h3>
              <div className="grid grid-cols-2 gap-2">
                {architecturalElements
                  .filter((el) => el.category === "structure")
                  .map((element) => (
                    <button
                      key={element.id}
                      onClick={() => addElement(element)}
                      className="flex flex-col items-center gap-1 p-3 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors group"
                    >
                      <div
                        className="w-8 h-8 rounded flex items-center justify-center"
                        style={{ backgroundColor: element.color + "30", color: element.color }}
                      >
                        {element.icon}
                      </div>
                      <span className="text-xs text-slate-400 group-hover:text-white text-center">
                        {element.name}
                      </span>
                    </button>
                  ))}
              </div>
            </div>

            {/* Roof */}
            <div className="mb-6">
              <h3 className="text-xs font-medium text-slate-500 mb-2">Roof</h3>
              <div className="grid grid-cols-2 gap-2">
                {architecturalElements
                  .filter((el) => el.category === "roof")
                  .map((element) => (
                    <button
                      key={element.id}
                      onClick={() => addElement(element)}
                      className="flex flex-col items-center gap-1 p-3 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors group"
                    >
                      <div
                        className="w-8 h-8 rounded flex items-center justify-center"
                        style={{ backgroundColor: element.color + "30", color: element.color }}
                      >
                        {element.icon}
                      </div>
                      <span className="text-xs text-slate-400 group-hover:text-white text-center">
                        {element.name}
                      </span>
                    </button>
                  ))}
              </div>
            </div>

            {/* Details */}
            <div className="mb-6">
              <h3 className="text-xs font-medium text-slate-500 mb-2">Details</h3>
              <div className="grid grid-cols-2 gap-2">
                {architecturalElements
                  .filter((el) => el.category === "details")
                  .map((element) => (
                    <button
                      key={element.id}
                      onClick={() => addElement(element)}
                      className="flex flex-col items-center gap-1 p-3 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors group"
                    >
                      <div
                        className="w-8 h-8 rounded flex items-center justify-center"
                        style={{ backgroundColor: element.color + "30", color: element.color }}
                      >
                        {element.icon}
                      </div>
                      <span className="text-xs text-slate-400 group-hover:text-white text-center">
                        {element.name}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          </div>

          {/* Building Parameters */}
          <div className="border-t border-slate-800 p-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">
              Building Parameters
            </h2>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Width (m)</label>
                <input
                  type="number"
                  value={buildingWidth}
                  onChange={(e) => setBuildingWidth(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm"
                  step="0.5"
                  min="1"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1">Height (m)</label>
                <input
                  type="number"
                  value={buildingHeight}
                  onChange={(e) => setBuildingHeight(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm"
                  step="0.5"
                  min="1"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1">Number of Floors</label>
                <input
                  type="number"
                  value={numFloors}
                  onChange={(e) => setNumFloors(parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm"
                  min="1"
                  max="10"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1">Ground Level (m)</label>
                <input
                  type="number"
                  value={groundLevel}
                  onChange={(e) => setGroundLevel(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm"
                  step="0.1"
                  min="0"
                />
              </div>

              <button
                onClick={regenerateOutline}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Update Building
              </button>
            </div>
          </div>
        </aside>

        {/* Main canvas area */}
        <main className="flex-1 overflow-auto bg-slate-950 p-6">
          {/* Toolbar */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTool("select")}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  activeTool === "select" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                )}
              >
                <MousePointer2 className="w-5 h-5" />
              </button>
              <button
                onClick={() => setActiveTool("pan")}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  activeTool === "pan" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                )}
              >
                <Move className="w-5 h-5" />
              </button>
              <div className="w-px h-6 bg-slate-700 mx-2" />
              <button
                onClick={handleDelete}
                disabled={!selectedElement}
                className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-red-400 disabled:opacity-50 transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              <button
                onClick={handleDuplicate}
                disabled={!selectedElement}
                className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white disabled:opacity-50 transition-colors"
              >
                <Copy className="w-5 h-5" />
              </button>
              <button
                onClick={handleFlipHorizontal}
                disabled={!selectedElement}
                className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white disabled:opacity-50 transition-colors"
              >
                <FlipHorizontal className="w-5 h-5" />
              </button>
              <div className="w-px h-6 bg-slate-700 mx-2" />
              <button
                onClick={() => setShowGrid(!showGrid)}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  showGrid ? "bg-slate-700 text-white" : "bg-slate-800 text-slate-400"
                )}
              >
                <Grid3X3 className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowLevels(!showLevels)}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  showLevels ? "bg-slate-700 text-white" : "bg-slate-800 text-slate-400"
                )}
              >
                <ArrowUpDown className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleZoom(-25)}
                className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              <span className="text-sm text-slate-400 w-16 text-center">{zoom}%</span>
              <button
                onClick={() => handleZoom(25)}
                className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <ZoomIn className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Canvas container */}
          <div className="flex items-center justify-center bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
            <canvas ref={canvasRef} className="shadow-2xl" />
          </div>

          {/* View title */}
          <div className="mt-4 text-center">
            <span className="text-lg font-semibold text-slate-300 capitalize">
              {activeView} Facade
            </span>
            <span className="text-slate-500 ml-2">
              • Scale {currentScale.label}
            </span>
          </div>
        </main>

        {/* Right sidebar - Properties */}
        <aside className="w-64 border-l border-slate-800 bg-slate-900/50 p-4">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">
            Properties
          </h2>

          {selectedElement ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Element</label>
                <p className="text-sm text-white">
                  {(selectedElement as any).elementName || selectedElement.type || "Unknown"}
                </p>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1">Position</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-xs text-slate-600">X:</span>
                    <p className="text-sm text-white">{formatMeasurement(pixelsToMeters(selectedElement.left || 0))}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-600">Y:</span>
                    <p className="text-sm text-white">{formatMeasurement(pixelsToMeters(selectedElement.top || 0))}</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1">Size</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-xs text-slate-600">W:</span>
                    <p className="text-sm text-white">
                      {formatMeasurement(pixelsToMeters((selectedElement.width || 0) * (selectedElement.scaleX || 1)))}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-600">H:</span>
                    <p className="text-sm text-white">
                      {formatMeasurement(pixelsToMeters((selectedElement.height || 0) * (selectedElement.scaleY || 1)))}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1">Rotation</label>
                <p className="text-sm text-white">{(selectedElement.angle || 0).toFixed(1)}°</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Select an element to view properties</p>
          )}

          {/* Legend */}
          <div className="mt-8 pt-4 border-t border-slate-800">
            <h3 className="text-xs font-medium text-slate-500 mb-3">Legend</h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-green-500"></div>
                <span className="text-slate-400">Ground Level</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-amber-500"></div>
                <span className="text-slate-400">RDC Level</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-slate-500 border-dashed"></div>
                <span className="text-slate-400">Floor Levels</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-yellow-400"></div>
                <span className="text-slate-400">Dimensions</span>
              </div>
            </div>
          </div>

          {/* Tips */}
          <div className="mt-8 p-3 bg-slate-800/50 rounded-lg">
            <h3 className="text-xs font-medium text-slate-400 mb-2">Tips</h3>
            <ul className="text-xs text-slate-500 space-y-1">
              <li>• Click elements to add to canvas</li>
              <li>• Drag to position elements</li>
              <li>• Use handles to resize</li>
              <li>• Flip for mirrored elements</li>
              <li>• Align with floor levels</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
