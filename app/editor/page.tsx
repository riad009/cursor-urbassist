"use client";

import React, { useRef, useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  Zap,
  Compass,
  Save,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Box,
  Pencil,
  StickyNote,
  DoorOpen,
  PanelTop,
  ToggleLeft,
  ToggleRight,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getNextStep } from "@/lib/step-flow";
import { NextStepButton } from "@/components/NextStepButton";
import { parcelGeometryToShapes } from "@/lib/parcelGeometryToCanvas";

type Tool = "select" | "rectangle" | "circle" | "line" | "polygon" | "text" | "pan" | "measure" | "parcel" | "vrd" | "pencil" | "annotation" | "elevation-marker" | "access-point" | "section-line" | "freeform";

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
  { id: "freeform", label: "Freeform Shape", icon: Hexagon, shortcut: "F" },
  { id: "pencil", label: "Free Draw", icon: Pencil, shortcut: "B" },
  { id: "measure", label: "Measure", icon: Ruler, shortcut: "M" },
  { id: "parcel", label: "Land Parcel", icon: MapPin, shortcut: "A" },
  { id: "vrd", label: "VRD Networks", icon: Zap, shortcut: "D" },
  { id: "elevation-marker", label: "Elevation Marker", icon: Compass, shortcut: "E" },
  { id: "access-point", label: "Plot Access", icon: DoorOpen, shortcut: "G" },
  { id: "section-line", label: "Section Line", icon: Minus, shortcut: "S" },
  { id: "text", label: "Text", icon: Type, shortcut: "T" },
  { id: "annotation", label: "Annotation", icon: MessageSquare, shortcut: "N" },
  { id: "pan", label: "Pan", icon: Move, shortcut: "H" },
];

const templates = [
  { id: "house", label: "House", icon: Home, color: "#3b82f6", width: 12, height: 8 },
  { id: "garage", label: "Garage", icon: Car, color: "#8b5cf6", width: 6, height: 5 },
  { id: "parking", label: "Parking 2.5×5m", icon: Car, color: "#6b7280", width: 2.5, height: 5 },
  { id: "pool", label: "Pool", icon: Droplets, color: "#06b6d4", width: 10, height: 5 },
  { id: "garden", label: "Garden", icon: Trees, color: "#22c55e", width: 8, height: 8 },
  { id: "terrace", label: "Terrace", icon: Hexagon, color: "#ec4899", width: 6, height: 4 },
  { id: "window", label: "Window 1.2×1.2m", icon: PanelTop, color: "#0ea5e9", width: 1.2, height: 1.2 },
  { id: "door", label: "Door 0.9×2.1m", icon: DoorOpen, color: "#a855f7", width: 0.9, height: 2.1 },
  { id: "sliding-door", label: "Sliding Door 2.4×2.1m", icon: DoorOpen, color: "#d946ef", width: 2.4, height: 2.1 },
  // Vegetation templates
  { id: "tree-small", label: "Tree (small)", icon: Trees, color: "#16a34a", width: 4, height: 4 },
  { id: "tree-large", label: "Tree (large)", icon: Trees, color: "#15803d", width: 8, height: 8 },
  { id: "hedge", label: "Hedge", icon: Trees, color: "#22c55e", width: 1, height: 10 },
  { id: "shrub", label: "Shrub", icon: Trees, color: "#4ade80", width: 2, height: 2 },
  { id: "lawn", label: "Lawn", icon: Trees, color: "#86efac", width: 10, height: 10 },
];

const ROOF_TYPES = [
  { id: "flat", label: "Flat" },
  { id: "gable", label: "Gable" },
  { id: "hip", label: "Hip" },
  { id: "mansard", label: "Mansard" },
];

const SHUTTER_TYPES = [
  { id: "none", label: "None" },
  { id: "roller", label: "Roller Shutters" },
  { id: "traditional", label: "Traditional Shutters" },
  { id: "folding", label: "Folding Shutters" },
];

// Interior room layout presets for buildings
const ROOM_LAYOUT_PRESETS = [
  {
    id: "simple-3",
    label: "3-Room (Living + Kitchen + Bedroom)",
    rooms: [
      { name: "Living", x: 0.5, y: 0.2 },
      { name: "Kitchen", x: 0.275, y: 0.7 },
      { name: "Bedroom", x: 0.775, y: 0.7 },
    ],
    partitions: [
      { type: "h", pos: 0.4 },
      { type: "v", pos: 0.55, from: 0.4, to: 1 },
    ]
  },
  {
    id: "studio",
    label: "Studio (Open + Bathroom)",
    rooms: [
      { name: "Studio", x: 0.4, y: 0.5 },
      { name: "Bath", x: 0.85, y: 0.15 },
    ],
    partitions: [
      { type: "v", pos: 0.7, from: 0, to: 0.3 },
      { type: "h", pos: 0.3, from: 0.7, to: 1 },
    ]
  },
  {
    id: "4-room",
    label: "4-Room (Living + Kitchen + 2 Bedrooms)",
    rooms: [
      { name: "Living", x: 0.275, y: 0.25 },
      { name: "Kitchen", x: 0.775, y: 0.25 },
      { name: "Bedroom 1", x: 0.275, y: 0.75 },
      { name: "Bedroom 2", x: 0.775, y: 0.75 },
    ],
    partitions: [
      { type: "h", pos: 0.5 },
      { type: "v", pos: 0.55, from: 0, to: 1 },
    ]
  },
  {
    id: "5-room",
    label: "5-Room (Living + Kitchen + Bath + 2 Bedrooms)",
    rooms: [
      { name: "Living", x: 0.3, y: 0.25 },
      { name: "Kitchen", x: 0.775, y: 0.25 },
      { name: "Bath", x: 0.85, y: 0.6 },
      { name: "Bedroom 1", x: 0.275, y: 0.75 },
      { name: "Bedroom 2", x: 0.55, y: 0.75 },
    ],
    partitions: [
      { type: "h", pos: 0.5 },
      { type: "v", pos: 0.55, from: 0, to: 0.5 },
      { type: "v", pos: 0.7, from: 0.5, to: 1 },
      { type: "h", pos: 0.7, from: 0.7, to: 1 },
    ]
  },
];

const SURFACE_TYPES = [
  { id: "green", label: "Green", color: "#22c55e", fill: "rgba(34, 197, 94, 0.4)" },
  { id: "gravel", label: "Gravel", color: "#a8a29e", fill: "rgba(168, 162, 158, 0.5)" },
  { id: "concrete", label: "Concrete", color: "#78716c", fill: "rgba(120, 113, 108, 0.5)" },
  { id: "asphalt", label: "Asphalt", color: "#44403c", fill: "rgba(68, 64, 60, 0.6)" },
  { id: "building", label: "Building", color: "#3b82f6", fill: "rgba(59, 130, 246, 0.3)" },
];

const VRD_TYPES = [
  { id: "electricity", label: "Electricity", color: "#fbbf24" },
  { id: "water", label: "Water", color: "#38bdf8" },
  { id: "wastewater", label: "Wastewater", color: "#78716c" },
  { id: "stormwater", label: "Stormwater", color: "#0ea5e9" },
  { id: "telecom", label: "Telecom", color: "#a78bfa" },
  { id: "gas", label: "Gas", color: "#f97316" },
  { id: "not_applicable", label: "Not applicable", color: "#6b7280" },
];

const colors = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f59e0b", "#22c55e", "#06b6d4", "#6b7280",
  "#1e293b", "#ffffff",
];

interface ProjectOption {
  id: string;
  name: string;
  address?: string | null;
}

function EditorPageContent() {
  const searchParams = useSearchParams();
  const projectIdFromUrl = searchParams.get("project");
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
  const [activeSurfaceType, setActiveSurfaceType] = useState(SURFACE_TYPES[4]); // building default
  const [activeVrdType, setActiveVrdType] = useState(VRD_TYPES[0]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(projectIdFromUrl);
  const [projectForEditor, setProjectForEditor] = useState<{
    parcelArea: number;
    northAngle: number;
    minGreenPct: number;
    parcelGeometry?: string | null;
  } | null>(null);
  const projectDataRef = useRef<{ parcelGeometry?: string | null } | null>(null);
  const parcelsDrawnFromGeometryRef = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [unnamedElementsWarning, setUnnamedElementsWarning] = useState<{ index: number; type: string }[] | null>(null);
  const [complianceChecks, setComplianceChecks] = useState<{ rule: string; status: string; message: string }[]>([]);
  const [showCompliance, setShowCompliance] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [editorMode, setEditorMode] = useState<"guided" | "free">("guided");
  const annotationCounterRef = useRef(0);
  const [interiorLayoutMode, setInteriorLayoutMode] = useState(false);
  const [interiorDrawing, setInteriorDrawing] = useState<{ start: { x: number; y: number } | null; parentId: string | null }>({ start: null, parentId: null });
  const [parcelBoundaryRestriction, setParcelBoundaryRestriction] = useState(true);
  const elevationMarkerCounterRef = useRef(0);
  const sectionLineCounterRef = useRef(0);

  const updateLayers = useCallback((canvas: fabric.Canvas) => {
    const objects = canvas.getObjects().filter(obj => {
      const customObj = obj as any;
      return !customObj.excludeFromExport && !customObj.isGrid && !customObj.isMeasurement && !customObj.isPolygonPreview;
    });
    const newLayers: LayerItem[] = objects.map((obj, index) => ({
      id: (obj as any).id || `layer-${index}`,
      name: (obj as any).elementName || (obj as any).name || ((obj as any).isParcel ? "Land Parcel" : obj.type || "Object"),
      type: obj.type || "unknown",
      visible: obj.visible ?? true,
      locked: !obj.selectable,
    }));
    setLayers(newLayers.reverse());
  }, []);

  // Sync project from URL
  useEffect(() => {
    if (projectIdFromUrl) setCurrentProjectId(projectIdFromUrl);
  }, [projectIdFromUrl]);

  // Fetch projects list
  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects || []))
      .catch(() => setProjects([]));
  }, []);

  // Fetch project data for green table and north arrow (parcel area, north angle, min green %)
  useEffect(() => {
    if (!currentProjectId) {
      setProjectForEditor(null);
      return;
    }
    fetch(`/api/projects/${currentProjectId}`)
      .then((r) => r.json())
      .then((d) => {
        const project = d.project;
        if (!project) {
          setProjectForEditor(null);
          return;
        }
        const ai = project.regulatoryAnalysis?.aiAnalysis as { minGreenPct?: number; greenSpaceRequirements?: string } | undefined;
        let minGreenPct = 20;
        if (typeof ai?.minGreenPct === "number") minGreenPct = ai.minGreenPct;
        else if (typeof ai?.greenSpaceRequirements === "string" && /(\d+)\s*%/.test(ai.greenSpaceRequirements)) {
          const m = ai.greenSpaceRequirements.match(/(\d+)\s*%/);
          if (m) minGreenPct = parseInt(m[1], 10);
        }
        const parcelGeometry = project.parcelGeometry ?? null;
        setProjectForEditor({
          parcelArea: Number(project.parcelArea) || 500,
          northAngle: Number(project.northAngle) ?? Number(project.sitePlanData?.northAngle) ?? 0,
          minGreenPct,
          parcelGeometry,
        });
      })
      .catch(() => setProjectForEditor(null));
  }, [currentProjectId]);

  useEffect(() => {
    projectDataRef.current = projectForEditor ? { parcelGeometry: projectForEditor.parcelGeometry } : null;
  }, [projectForEditor]);

  // Auto-detect free mode when no regulatory analysis exists
  useEffect(() => {
    if (!currentProjectId) return;
    fetch(`/api/projects/${currentProjectId}`)
      .then((r) => r.json())
      .then((d) => {
        const project = d.project;
        if (project && !project.regulatoryAnalysis) {
          setEditorMode("free");
        }
      })
      .catch(() => { });
  }, [currentProjectId]);

  const addPolygonMeasurements = useCallback(
    (polygon: fabric.Polygon, id: string) => {
      const points = polygon.points;
      if (!points || points.length < 2) return;
      const canvas = fabricRef.current;
      if (!canvas) return;
      const createDimensionLine = (x1: number, y1: number, x2: number, y2: number, _id: string, offset: number, color: string) => {
        const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        const ppm = currentScale.pixelsPerMeter;
        const m = dist / ppm;
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const line = new fabric.Line([x1, y1, x2, y2], {
          stroke: color,
          strokeWidth: 1,
          strokeDashArray: [5, 3],
          selectable: false,
          evented: false,
        }) as fabric.Line & { isMeasurement?: boolean; parentId?: string };
        (line as any).isMeasurement = true;
        (line as any).parentId = id;
        const text = new fabric.Text(`${m.toFixed(2)} m`, {
          left: midX,
          top: midY - offset,
          fontSize: 12,
          fontFamily: "monospace",
          fill: "#0f172a",
          backgroundColor: color,
          padding: 3,
          originX: "center",
          selectable: false,
          evented: false,
        }) as fabric.Text & { isMeasurement?: boolean; parentId?: string };
        (text as any).isMeasurement = true;
        (text as any).parentId = id;
        return [line, text];
      };
      const measurements: fabric.FabricObject[] = [];
      const matrix = polygon.calcTransformMatrix();
      for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const t1 = fabric.util.transformPoint(new fabric.Point(p1.x, p1.y), matrix);
        const t2 = fabric.util.transformPoint(new fabric.Point(p2.x, p2.y), matrix);
        measurements.push(
          ...createDimensionLine(t1.x, t1.y, t2.x, t2.y, id, 25, "#22c55e")
        );
      }
      measurementLabelsRef.current.set(id, measurements);
      measurements.forEach((el) => canvas.add(el));
    },
    [currentScale.pixelsPerMeter]
  );

  const drawParcelsFromProjectData = useCallback(() => {
    const canvas = fabricRef.current;
    const data = projectDataRef.current;
    if (!canvas || !data?.parcelGeometry) return;
    const raw = typeof data.parcelGeometry === "string" ? data.parcelGeometry : JSON.stringify(data.parcelGeometry);
    if (parcelsDrawnFromGeometryRef.current === raw) return;
    const hasParcel = canvas.getObjects().some((o: fabric.FabricObject) => (o as any).isParcel && !(o as any).isGrid && !(o as any).isMeasurement);
    if (hasParcel) return;
    const shapes = parcelGeometryToShapes(data.parcelGeometry, {
      canvasWidth: canvasSize.width,
      canvasHeight: canvasSize.height,
      pixelsPerMeter: currentScale.pixelsPerMeter,
    });
    if (shapes.length === 0) return;
    shapes.forEach((shape, i) => {
      const polygon = new fabric.Polygon(shape.points, {
        left: shape.left,
        top: shape.top,
        originX: "center",
        originY: "center",
        fill: "rgba(34, 197, 94, 0.1)",
        stroke: "#22c55e",
        strokeWidth: 3,
      });
      const shapeId = `parcel-geo-${currentProjectId}-${i}-${Date.now()}`;
      (polygon as any).id = shapeId;
      (polygon as any).isParcel = true;
      (polygon as any).elementName = "Land Parcel";
      canvas.add(polygon);
      addPolygonMeasurements(polygon, shapeId);
    });
    parcelsDrawnFromGeometryRef.current = raw;
    canvas.renderAll();
    updateLayers(canvas);
  }, [currentProjectId, canvasSize, currentScale.pixelsPerMeter, addPolygonMeasurements, updateLayers]);

  // Load site plan when project selected; after load, draw parcel outlines from project data if needed
  const loadSitePlan = useCallback(
    (projectId: string, onLoaded?: () => void) => {
      parcelsDrawnFromGeometryRef.current = null;
      fetch(`/api/projects/${projectId}/site-plan`)
        .then((r) => r.json())
        .then((data) => {
          const canvas = fabricRef.current;
          if (!canvas) return;
          if (data.sitePlan?.canvasData) {
            try {
              const json =
                typeof data.sitePlan.canvasData === "string"
                  ? JSON.parse(data.sitePlan.canvasData)
                  : data.sitePlan.canvasData;
              canvas.loadFromJSON(json, () => {
                const savedElements = Array.isArray(data.sitePlan?.elements) ? data.sitePlan.elements : [];
                const objects = canvas.getObjects().filter(
                  (o) => !(o as any).isGrid && !(o as any).isMeasurement && !(o as any).isPolygonPreview
                );
                savedElements.forEach((el: { name?: string }, i: number) => {
                  if (objects[i] && el?.name) (objects[i] as any).elementName = el.name;
                });
                canvas.renderAll();
                updateLayers(canvas);
                onLoaded?.();
              });
            } catch (_) {
              onLoaded?.();
            }
          } else {
            onLoaded?.();
          }
        })
        .catch(() => {
          onLoaded?.();
        });
    },
    [updateLayers]
  );

  useEffect(() => {
    if (currentProjectId && canvasReady) loadSitePlan(currentProjectId, drawParcelsFromProjectData);
  }, [currentProjectId, canvasReady, loadSitePlan, drawParcelsFromProjectData]);

  // When project data (with parcelGeometry) arrives after canvas is ready, draw parcels if not yet drawn
  useEffect(() => {
    if (!currentProjectId || !canvasReady || !projectForEditor?.parcelGeometry) return;
    drawParcelsFromProjectData();
  }, [currentProjectId, canvasReady, projectForEditor?.parcelGeometry, drawParcelsFromProjectData]);

  const saveSitePlan = useCallback(async () => {
    if (!currentProjectId) return;
    const canvas = fabricRef.current;
    if (!canvas) return;
    setUnnamedElementsWarning(null);
    const drawable = canvas.getObjects().filter(
      (o) => !(o as any).isGrid && !(o as any).isMeasurement && !(o as any).isPolygonPreview
    );
    const ppm = currentScale.pixelsPerMeter;
    const toM = (p: number) => p / ppm;
    const elements = drawable.map((o, index) => {
      const name = String((o as any).elementName ?? (o as any).name ?? "").trim();
      return {
        type: o.type,
        name: name || "Unnamed",
        category: (o as any).templateType || (o as any).surfaceType === "building" ? "building" : undefined,
        templateType: (o as any).templateType,
        surfaceType: (o as any).surfaceType,
        vrdType: (o as any).vrdType,
        width: (o as any).width,
        height: (o as any).height,
        area: (o as any).width && (o as any).height
          ? toM((o as any).width * (o.scaleX || 1)) * toM((o as any).height * (o.scaleY || 1))
          : undefined,
        _index: index,
      };
    });
    const unnamed = elements
      .map((e, i) => (e.name === "Unnamed" || !e.name ? { index: i + 1, type: e.type || "object" } : null))
      .filter(Boolean) as { index: number; type: string }[];
    if (unnamed.length > 0) {
      setUnnamedElementsWarning(unnamed);
      return;
    }
    setSaving(true);
    try {
      const elementsToSend = elements.map(({ _index, ...e }) => e);
      const canvasData = canvas.toJSON();
      let projected = 0;
      elementsToSend.forEach((e) => {
        if (e.area && (e.templateType || e.surfaceType === "building")) projected += e.area;
      });
      let footprintMax: number | null = null;
      try {
        const projRes = await fetch(`/api/projects/${currentProjectId}`);
        const projData = await projRes.json();
        const project = projRes.ok ? projData.project : null;
        if (project?.parcelArea && project?.regulatoryAnalysis?.aiAnalysis) {
          const ces = (project.regulatoryAnalysis.aiAnalysis as { maxCoverageRatio?: number }).maxCoverageRatio ?? 0.5;
          footprintMax = project.parcelArea * ces;
        }
      } catch {
        // ignore
      }
      const res = await fetch(`/api/projects/${currentProjectId}/site-plan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canvasData,
          elements: elementsToSend,
          footprintProjected: projected,
          footprintMax: footprintMax ?? 200,
          northAngle: projectForEditor?.northAngle ?? null,
        }),
      });
      if (res.ok) {
        const compRes = await fetch("/api/compliance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: currentProjectId,
            elements: elementsToSend,
          }),
        });
        const compData = await compRes.json();
        if (compData.checks) {
          setComplianceChecks(compData.checks);
          setShowCompliance(true);
        }
      }
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  }, [currentProjectId, currentScale.pixelsPerMeter, projectForEditor?.northAngle]);

  // Real-time compliance: debounced check on draw/move/change
  const complianceDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runComplianceCheck = useCallback(() => {
    if (!currentProjectId || editorMode === "free") return;
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (complianceDebounceRef.current) clearTimeout(complianceDebounceRef.current);
    complianceDebounceRef.current = setTimeout(async () => {
      complianceDebounceRef.current = null;
      const ppm = currentScale.pixelsPerMeter;
      const toM = (p: number) => p / ppm;
      const elements = canvas.getObjects()
        .filter((o) => !(o as fabric.FabricObject & { isGrid?: boolean }).isGrid && !(o as fabric.FabricObject & { isMeasurement?: boolean }).isMeasurement && !(o as fabric.FabricObject & { isPolygonPreview?: boolean }).isPolygonPreview)
        .map((o) => ({
          type: o.type,
          category: (o as fabric.FabricObject & { templateType?: string; surfaceType?: string }).templateType || (o as fabric.FabricObject & { surfaceType?: string }).surfaceType === "building" ? "building" : undefined,
          templateType: (o as fabric.FabricObject & { templateType?: string }).templateType,
          surfaceType: (o as fabric.FabricObject & { surfaceType?: string }).surfaceType,
          vrdType: (o as fabric.FabricObject & { vrdType?: string }).vrdType,
          left: o.left,
          top: o.top,
          width: (o as fabric.FabricObject & { width?: number }).width != null ? (o as fabric.FabricObject & { width?: number }).width! * (o.scaleX || 1) : undefined,
          height: (o as fabric.FabricObject & { height?: number }).height != null ? (o as fabric.FabricObject & { height?: number }).height! * (o.scaleY || 1) : undefined,
          height3d: (o as fabric.FabricObject & { height3d?: number }).height3d,
          area: (o as fabric.FabricObject & { width?: number; height?: number }).width != null && (o as fabric.FabricObject & { height?: number }).height != null
            ? toM((o as fabric.FabricObject & { width?: number }).width! * (o.scaleX || 1)) * toM((o as fabric.FabricObject & { height?: number }).height! * (o.scaleY || 1))
            : undefined,
        }));
      try {
        const compRes = await fetch("/api/compliance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: currentProjectId, elements }),
        });
        const compData = await compRes.json();
        if (compData.checks) {
          setComplianceChecks(compData.checks);
          setShowCompliance(true);
        }
      } catch {
        // ignore
      }
    }, 800);
  }, [currentProjectId, currentScale.pixelsPerMeter, editorMode]);

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
    setCanvasReady(true);

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

    // Object modification events - update measurements and run real-time compliance
    canvas.on("object:modified", (e) => {
      if (e.target) {
        updateObjectMeasurements(e.target);
      }
      runComplianceCheck();
    });

    canvas.on("object:scaling", (e) => {
      if (e.target) {
        updateObjectMeasurements(e.target);
      }
      runComplianceCheck();
    });

    canvas.on("object:moving", (e) => {
      if (e.target) {
        updateObjectMeasurements(e.target);
      }
      runComplianceCheck();
    });

    canvas.on("object:added", () => {
      updateLayers(canvas);
      runComplianceCheck();
    });

    canvas.on("object:removed", () => {
      updateLayers(canvas);
      runComplianceCheck();
    });

    return () => {
      setCanvasReady(false);
      canvas.dispose();
    };
  }, [canvasSize, showGrid, drawGrid, updateObjectMeasurements, updateLayers, runComplianceCheck]);

  // Mouse event handlers for drawing with live measurements
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const handleMouseMove = (e: fabric.TPointerEventInfo) => {
      const pointer = e.scenePoint || e.viewportPoint || { x: 0, y: 0 };
      setMousePos({ x: pointer.x, y: pointer.y });

      if (isDrawing && drawingStart) {
        const distance = calculateDistance(drawingStart.x, drawingStart.y, pointer.x, pointer.y);

        // Update live measurement display based on tool
        if (activeTool === "line" || activeTool === "measure" || activeTool === "vrd") {
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

        if (activeTool === "line" || activeTool === "measure" || activeTool === "vrd") {
          const vrdColor = activeTool === "vrd" ? activeVrdType.color : undefined;
          newTempShape = new fabric.Line([drawingStart.x, drawingStart.y, pointer.x, pointer.y], {
            stroke: activeTool === "measure" ? "#22c55e" : vrdColor || activeColor,
            strokeWidth: activeTool === "measure" ? 2 : strokeWidth,
            strokeDashArray: activeTool === "measure" || activeTool === "vrd" ? [8, 4] : undefined,
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
      if (activeTool === "select" || activeTool === "pan" || activeTool === "pencil") return;

      const pointer = e.scenePoint || e.viewportPoint || { x: 0, y: 0 };

      // Check parcel boundary restriction if enabled
      if (parcelBoundaryRestriction && activeTool !== "parcel") {
        const parcels = canvas.getObjects().filter((o: fabric.FabricObject) => (o as any).isParcel);
        if (parcels.length > 0) {
          const isInsideAnyParcel = parcels.some((parcel) => {
            return parcel.containsPoint(new fabric.Point(pointer.x, pointer.y));
          });
          if (!isInsideAnyParcel) {
            // Show warning but don't block completely
            console.warn("Drawing outside parcel boundary");
          }
        }
      }

      // Elevation marker mode - place elevation marker on click
      if (activeTool === "elevation-marker") {
        addElevationMarker(pointer.x, pointer.y);
        return;
      }

      // Access point mode - place access point on click
      if (activeTool === "access-point") {
        addAccessPoint(pointer.x, pointer.y);
        return;
      }

      // Section line mode - draw section line
      if (activeTool === "section-line") {
        setPolygonPoints(prev => {
          if (prev.length === 0) {
            return [{ x: pointer.x, y: pointer.y }];
          } else if (prev.length === 1) {
            // Complete section line with second point
            addSectionLine(prev[0].x, prev[0].y, pointer.x, pointer.y);
            return [];
          }
          return prev;
        });
        return;
      }

      // Freeform shape mode - add points on click
      if (activeTool === "freeform") {
        setPolygonPoints(prev => [...prev, { x: pointer.x, y: pointer.y }]);
        return;
      }

      // Annotation mode - place annotation on click
      if (activeTool === "annotation") {
        addAnnotation(pointer.x, pointer.y);
        return;
      }

      // Text tool - place editable text on click
      if (activeTool === "text") {
        const textObj = new fabric.IText("Text", {
          left: pointer.x,
          top: pointer.y,
          fontSize: 16,
          fontFamily: "sans-serif",
          fill: activeColor,
          editable: true,
        });
        const shapeId = `text-${Date.now()}`;
        (textObj as any).id = shapeId;
        (textObj as any).elementName = "Text";
        canvas.add(textObj);
        canvas.setActiveObject(textObj);
        textObj.enterEditing();
        canvas.renderAll();
        return;
      }

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

      const pointer = e.scenePoint || e.viewportPoint || { x: 0, y: 0 };

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
        (line as any).elementName = "Line";
        canvas.add(line);
        addLineMeasurement(line, shapeId);
      } else if (activeTool === "vrd") {
        const line = new fabric.Line([drawingStart.x, drawingStart.y, pointer.x, pointer.y], {
          stroke: activeVrdType.color,
          strokeWidth: strokeWidth,
          strokeDashArray: [8, 4],
        });
        (line as any).id = shapeId;
        (line as any).isVrd = true;
        (line as any).vrdType = activeVrdType.id;
        (line as any).elementName = activeVrdType.label;
        canvas.add(line);
        addLineMeasurement(line, shapeId);
      } else if (activeTool === "measure") {
        const line = new fabric.Line([drawingStart.x, drawingStart.y, pointer.x, pointer.y], {
          stroke: "#22c55e",
          strokeWidth: 2,
          strokeDashArray: [5, 5],
        });
        (line as any).id = shapeId;
        (line as any).elementName = "Measure";
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
            fill: activeSurfaceType.fill,
            stroke: activeSurfaceType.color,
            strokeWidth: strokeWidth,
          });
          (rect as any).id = shapeId;
          (rect as any).surfaceType = activeSurfaceType.id;
          (rect as any).elementName = activeSurfaceType.label || "Building";
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
            fill: activeSurfaceType.fill,
            stroke: activeSurfaceType.color,
            strokeWidth: strokeWidth,
          });
          (circle as any).surfaceType = activeSurfaceType.id;
          (circle as any).id = shapeId;
          (circle as any).elementName = activeSurfaceType.label || "Circle";
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
  }, [activeTool, isDrawing, drawingStart, tempShape, activeColor, strokeWidth, activeVrdType, activeSurfaceType, calculateDistance, formatMeasurement, pixelsToMeters, addLineMeasurement, addRectMeasurements, addCircleMeasurements]);

  // Handle polygon completion with double-click
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const handleDoubleClick = () => {
      if ((activeTool === "polygon" || activeTool === "parcel" || activeTool === "freeform") && polygonPoints.length >= 3) {
        const shapeId = activeTool === "freeform" ? `freeform-${Date.now()}` : `parcel-${Date.now()}`;

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
          fill: activeTool === "parcel" ? "rgba(34, 197, 94, 0.1)" : activeSurfaceType.fill,
          stroke: activeTool === "parcel" ? "#22c55e" : activeSurfaceType.color,
          strokeWidth: activeTool === "parcel" ? 3 : strokeWidth,
          originX: "center",
          originY: "center",
        });

        (polygon as any).id = shapeId;
        (polygon as any).isParcel = activeTool === "parcel";
        (polygon as any).isFreeform = activeTool === "freeform";
        (polygon as any).elementName = activeTool === "parcel" ? "Land Parcel" : activeTool === "freeform" ? "Freeform Shape" : (activeSurfaceType.label || "Polygon");
        if (activeTool === "polygon" || activeTool === "freeform") (polygon as any).surfaceType = activeSurfaceType.id;
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
  }, [activeTool, polygonPoints, activeColor, strokeWidth, activeSurfaceType, addPolygonMeasurements]);

  // Draw polygon preview points and segments with live measurements
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    // Remove old preview elements
    const oldPreview = canvas.getObjects().filter(obj => (obj as any).isPolygonPreview);
    oldPreview.forEach(p => canvas.remove(p));

    if ((activeTool === "polygon" || activeTool === "parcel" || activeTool === "freeform" || activeTool === "section-line") && polygonPoints.length > 0) {
      // Draw points
      const getColor = () => {
        if (activeTool === "parcel") return "#22c55e";
        if (activeTool === "section-line") return "#db2777";
        if (activeTool === "freeform") return "#8b5cf6";
        return activeColor;
      };
      const pointColor = getColor();

      polygonPoints.forEach((point, index) => {
        const circle = new fabric.Circle({
          left: point.x - 5,
          top: point.y - 5,
          radius: 5,
          fill: pointColor,
          selectable: false,
          evented: false,
        });
        (circle as any).isPolygonPreview = true;
        canvas.add(circle);

        // Draw line to previous point with measurement
        if (index > 0) {
          const prevPoint = polygonPoints[index - 1];
          const line = new fabric.Line([prevPoint.x, prevPoint.y, point.x, point.y], {
            stroke: pointColor,
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
          stroke: pointColor,
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

    // Handle pencil (free draw) mode
    if (tool === "pencil") {
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.color = activeColor;
      canvas.freeDrawingBrush.width = strokeWidth;
      canvas.selection = false;
    } else {
      canvas.isDrawingMode = false;
      canvas.selection = tool === "select";
    }
  };

  // Place annotation on canvas click
  const addAnnotation = useCallback((x: number, y: number) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    annotationCounterRef.current += 1;
    const num = annotationCounterRef.current;
    const shapeId = `annotation-${Date.now()}`;

    // Circle marker
    const marker = new fabric.Circle({
      radius: 14,
      fill: "#f59e0b",
      stroke: "#b45309",
      strokeWidth: 2,
      originX: "center",
      originY: "center",
    });
    // Number label
    const numText = new fabric.Text(String(num), {
      fontSize: 14,
      fontFamily: "sans-serif",
      fontWeight: "bold",
      fill: "#ffffff",
      originX: "center",
      originY: "center",
    });
    // Note text
    const noteText = new fabric.Text("Note...", {
      fontSize: 12,
      fontFamily: "sans-serif",
      fill: "#78716c",
      left: 20,
      top: -8,
    });
    const group = new fabric.Group([marker, numText, noteText], {
      left: x - 14,
      top: y - 14,
    });
    (group as any).id = shapeId;
    (group as any).elementName = `Annotation #${num}`;
    (group as any).isAnnotation = true;
    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.renderAll();
  }, []);

  // Place elevation marker (TN/TF) on canvas
  const addElevationMarker = useCallback((x: number, y: number) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    elevationMarkerCounterRef.current += 1;
    const num = elevationMarkerCounterRef.current;
    const shapeId = `elevation-${Date.now()}`;
    const elevation = window.prompt("Enter elevation (e.g., TN 125.50 or TF 128.00):", `TN ${(100 + num * 0.5).toFixed(2)}`);
    if (!elevation) return;

    // Triangle marker pointing down
    const triangle = new fabric.Triangle({
      width: 16,
      height: 14,
      fill: "#0ea5e9",
      stroke: "#0369a1",
      strokeWidth: 1,
      angle: 180,
      originX: "center",
      originY: "center",
    });

    // Elevation text
    const elevText = new fabric.Text(elevation, {
      fontSize: 11,
      fontFamily: "monospace",
      fontWeight: "bold",
      fill: "#0f172a",
      backgroundColor: "#bae6fd",
      padding: 2,
      originX: "center",
      top: 10,
    });

    const group = new fabric.Group([triangle, elevText], {
      left: x - 8,
      top: y - 7,
    });
    (group as any).id = shapeId;
    (group as any).elementName = elevation;
    (group as any).isElevationMarker = true;
    (group as any).elevationValue = elevation;
    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.renderAll();
  }, []);

  // Place plot access point marker on canvas
  const addAccessPoint = useCallback((x: number, y: number) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const shapeId = `access-${Date.now()}`;
    const accessType = window.prompt("Access type (Vehicle, Pedestrian, Both):", "Vehicle");
    if (!accessType) return;

    // Arrow shape pointing inward
    const arrowPoints = [
      { x: 0, y: -12 },
      { x: 10, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 12 },
      { x: -5, y: 12 },
      { x: -5, y: 0 },
      { x: -10, y: 0 },
    ];

    const arrow = new fabric.Polygon(arrowPoints, {
      fill: "#22c55e",
      stroke: "#15803d",
      strokeWidth: 2,
      originX: "center",
      originY: "center",
    });

    // Access type label
    const accessLabel = new fabric.Text(accessType, {
      fontSize: 10,
      fontFamily: "sans-serif",
      fontWeight: "bold",
      fill: "#166534",
      backgroundColor: "#dcfce7",
      padding: 2,
      originX: "center",
      top: 18,
    });

    const group = new fabric.Group([arrow, accessLabel], {
      left: x - 10,
      top: y - 12,
    });
    (group as any).id = shapeId;
    (group as any).elementName = `Access: ${accessType}`;
    (group as any).isAccessPoint = true;
    (group as any).accessType = accessType;
    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.renderAll();
  }, []);

  // Add section line (for PC3/DPC3 generation)
  const addSectionLine = useCallback((x1: number, y1: number, x2: number, y2: number) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    sectionLineCounterRef.current += 1;
    const num = sectionLineCounterRef.current;
    const shapeId = `section-line-${Date.now()}`;

    // Section line (dashed pink/magenta)
    const line = new fabric.Line([x1, y1, x2, y2], {
      stroke: "#db2777",
      strokeWidth: 2,
      strokeDashArray: [10, 5],
    });
    (line as any).id = shapeId;
    (line as any).isSectionLine = true;
    (line as any).elementName = `Section ${String.fromCharCode(64 + num)}-${String.fromCharCode(64 + num)}'`;
    (line as any).sectionId = `S${num}`;

    // Section markers at each end
    const markerRadius = 10;
    const labelA = new fabric.Circle({
      left: x1 - markerRadius,
      top: y1 - markerRadius,
      radius: markerRadius,
      fill: "#db2777",
      stroke: "#be185d",
      strokeWidth: 1,
      selectable: false,
      evented: false,
    });
    (labelA as any).isMeasurement = true;
    (labelA as any).parentId = shapeId;

    const textA = new fabric.Text(String.fromCharCode(64 + num), {
      left: x1,
      top: y1,
      fontSize: 12,
      fontFamily: "sans-serif",
      fontWeight: "bold",
      fill: "#ffffff",
      originX: "center",
      originY: "center",
      selectable: false,
      evented: false,
    });
    (textA as any).isMeasurement = true;
    (textA as any).parentId = shapeId;

    const labelB = new fabric.Circle({
      left: x2 - markerRadius,
      top: y2 - markerRadius,
      radius: markerRadius,
      fill: "#db2777",
      stroke: "#be185d",
      strokeWidth: 1,
      selectable: false,
      evented: false,
    });
    (labelB as any).isMeasurement = true;
    (labelB as any).parentId = shapeId;

    const textB = new fabric.Text(`${String.fromCharCode(64 + num)}'`, {
      left: x2,
      top: y2,
      fontSize: 12,
      fontFamily: "sans-serif",
      fontWeight: "bold",
      fill: "#ffffff",
      originX: "center",
      originY: "center",
      selectable: false,
      evented: false,
    });
    (textB as any).isMeasurement = true;
    (textB as any).parentId = shapeId;

    // Add dimension measurement
    const distance = calculateDistance(x1, y1, x2, y2);
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const dimText = new fabric.Text(`${formatMeasurement(distance)}`, {
      left: midX,
      top: midY - 15,
      fontSize: 10,
      fontFamily: "monospace",
      fill: "#be185d",
      backgroundColor: "#fce7f3",
      padding: 2,
      originX: "center",
      selectable: false,
      evented: false,
    });
    (dimText as any).isMeasurement = true;
    (dimText as any).parentId = shapeId;

    canvas.add(line);
    canvas.add(labelA);
    canvas.add(textA);
    canvas.add(labelB);
    canvas.add(textB);
    canvas.add(dimText);
    canvas.setActiveObject(line);
    canvas.renderAll();

    // Store measurement labels
    measurementLabelsRef.current.set(shapeId, [labelA, textA, labelB, textB, dimText]);
  }, [calculateDistance, formatMeasurement]);

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

  // Draw a dashed overhang outline around a building template
  const drawOverhangOverlay = useCallback((obj: fabric.FabricObject) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const templateType = (obj as any).templateType;
    if (!templateType || !['house', 'garage'].includes(templateType)) return;
    const overhang = (obj as any).roofOverhang ?? 0.5;
    if (overhang <= 0) return;
    const parentId = (obj as any).id;
    // Remove old overlay for this object
    canvas.getObjects().forEach((o) => {
      if ((o as any).isOverhangOverlay && (o as any).parentId === parentId) canvas.remove(o);
    });
    const ovPx = metersToPixels(overhang);
    const left = (obj.left || 0) - ovPx;
    const top = (obj.top || 0) - ovPx;
    const w = ((obj as any).width || 0) * (obj.scaleX || 1) + ovPx * 2;
    const h = ((obj as any).height || 0) * (obj.scaleY || 1) + ovPx * 2;
    const overlay = new fabric.Rect({
      left,
      top,
      width: w,
      height: h,
      fill: 'transparent',
      stroke: '#94a3b8',
      strokeWidth: 1.5,
      strokeDashArray: [6, 4],
      selectable: false,
      evented: false,
    });
    (overlay as any).isOverhangOverlay = true;
    (overlay as any).isMeasurement = true;
    (overlay as any).parentId = parentId;
    canvas.add(overlay);
    // Add overhang label
    const label = new fabric.Text(`Overhang: ${overhang}m`, {
      left: left + w / 2,
      top: top - 12,
      fontSize: 10,
      fontFamily: 'monospace',
      fill: '#64748b',
      originX: 'center',
      selectable: false,
      evented: false,
    });
    (label as any).isOverhangOverlay = true;
    (label as any).isMeasurement = true;
    (label as any).parentId = parentId;
    canvas.add(label);
  }, [metersToPixels]);

  // Draw shutter indicators on window/door/sliding-door templates
  const drawShutterIndicator = useCallback((obj: fabric.FabricObject) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const templateType = (obj as any).templateType;
    if (!templateType || !['window', 'door', 'sliding-door'].includes(templateType)) return;
    const shutterType = (obj as any).shutterType || 'none';
    const parentId = (obj as any).id;
    // Remove old indicator
    canvas.getObjects().forEach((o) => {
      if ((o as any).isShutterIndicator && (o as any).parentId === parentId) canvas.remove(o);
    });
    if (shutterType === 'none') return;
    const left = obj.left || 0;
    const top = obj.top || 0;
    const w = ((obj as any).width || 0) * (obj.scaleX || 1);
    const h = ((obj as any).height || 0) * (obj.scaleY || 1);
    const shutterColor = shutterType === 'roller' ? '#64748b' : shutterType === 'traditional' ? '#92400e' : '#78716c';
    if (shutterType === 'roller') {
      // Roller shutter: horizontal bar at top
      const bar = new fabric.Rect({
        left: left,
        top: top - 4,
        width: w,
        height: 4,
        fill: shutterColor,
        selectable: false,
        evented: false,
      });
      (bar as any).isShutterIndicator = true;
      (bar as any).isMeasurement = true;
      (bar as any).parentId = parentId;
      canvas.add(bar);
    } else {
      // Traditional / folding: hash marks on sides
      const lineCount = shutterType === 'folding' ? 3 : 4;
      for (let side = 0; side < 2; side++) {
        const xBase = side === 0 ? left - 3 : left + w + 1;
        for (let i = 0; i < lineCount; i++) {
          const yPos = top + (h / (lineCount + 1)) * (i + 1);
          const hashLine = new fabric.Line([xBase, yPos, xBase + 2, yPos], {
            stroke: shutterColor,
            strokeWidth: 1.5,
            selectable: false,
            evented: false,
          });
          (hashLine as any).isShutterIndicator = true;
          (hashLine as any).isMeasurement = true;
          (hashLine as any).parentId = parentId;
          canvas.add(hashLine);
        }
      }
    }
    // Shutter type label
    const shutterLabel = SHUTTER_TYPES.find(s => s.id === shutterType)?.label || '';
    const text = new fabric.Text(shutterLabel, {
      left: left + w / 2,
      top: top + h + 4,
      fontSize: 9,
      fontFamily: 'sans-serif',
      fill: shutterColor,
      originX: 'center',
      selectable: false,
      evented: false,
    });
    (text as any).isShutterIndicator = true;
    (text as any).isMeasurement = true;
    (text as any).parentId = parentId;
    canvas.add(text);
  }, []);

  // Draw interior partition lines inside a building template
  const drawInteriorPartitions = useCallback((obj: fabric.FabricObject) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const templateType = (obj as any).templateType;
    if (!templateType || !['house'].includes(templateType)) return;
    const parentId = (obj as any).id;
    const showInterior = (obj as any).showInteriorLayout;
    // Remove old partitions
    canvas.getObjects().forEach((o) => {
      if ((o as any).isInteriorPartition && (o as any).parentId === parentId) canvas.remove(o);
    });
    if (!showInterior) return;

    // Get selected layout preset (default to simple-3)
    const layoutId = (obj as any).interiorLayoutId || "simple-3";
    const layout = ROOM_LAYOUT_PRESETS.find(p => p.id === layoutId) || ROOM_LAYOUT_PRESETS[0];

    const left = obj.left || 0;
    const top = obj.top || 0;
    const w = ((obj as any).width || 0) * (obj.scaleX || 1);
    const h = ((obj as any).height || 0) * (obj.scaleY || 1);
    const partitionColor = '#cbd5e1';

    // Draw partitions based on preset
    layout.partitions.forEach(p => {
      let line: fabric.Line;
      if (p.type === "h") {
        // Horizontal partition
        const fromX = p.from !== undefined ? p.from : 0;
        const toX = p.to !== undefined ? p.to : 1;
        line = new fabric.Line([
          left + w * fromX + 2,
          top + h * p.pos,
          left + w * toX - 2,
          top + h * p.pos
        ], {
          stroke: partitionColor,
          strokeWidth: 1,
          strokeDashArray: [4, 3],
          selectable: false,
          evented: false,
        });
      } else {
        // Vertical partition
        const fromY = p.from !== undefined ? p.from : 0;
        const toY = p.to !== undefined ? p.to : 1;
        line = new fabric.Line([
          left + w * p.pos,
          top + h * fromY + 2,
          left + w * p.pos,
          top + h * toY - 2
        ], {
          stroke: partitionColor,
          strokeWidth: 1,
          strokeDashArray: [4, 3],
          selectable: false,
          evented: false,
        });
      }
      (line as any).isInteriorPartition = true;
      (line as any).isMeasurement = true;
      (line as any).parentId = parentId;
      canvas.add(line);
    });

    // Room labels from preset
    layout.rooms.forEach(r => {
      const roomLabel = new fabric.Text(r.name, {
        left: left + w * r.x,
        top: top + h * r.y,
        fontSize: 9,
        fontFamily: 'sans-serif',
        fill: '#94a3b8',
        originX: 'center',
        originY: 'center',
        selectable: false,
        evented: false,
      });
      (roomLabel as any).isInteriorPartition = true;
      (roomLabel as any).isMeasurement = true;
      (roomLabel as any).parentId = parentId;
      canvas.add(roomLabel);
    });
  }, []);

  const addTemplate = (templateId: string) => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const template = templates.find(t => t.id === templateId);
    if (!template) return;

    const center = canvas.getCenterPoint();
    const shapeId = `${templateId}-${Date.now()}`;

    const widthPx = metersToPixels(template.width);
    const heightPx = metersToPixels(template.height);

    // Parking template: dashed stroke with vehicle icon
    const isParking = templateId === 'parking';

    const rect = new fabric.Rect({
      left: center.x - widthPx / 2,
      top: center.y - heightPx / 2,
      width: widthPx,
      height: heightPx,
      fill: template.color + "20",
      stroke: template.color,
      strokeWidth: isParking ? 1.5 : 2,
      strokeDashArray: isParking ? [6, 3] : undefined,
    });

    (rect as any).id = shapeId;
    (rect as any).templateType = templateId;
    (rect as any).elementName = template.label;
    // Default overhang for buildings
    if (['house', 'garage'].includes(templateId)) {
      (rect as any).roofOverhang = 0.5;
      (rect as any).roofType = 'gable';
      (rect as any).roofPitch = 30;
    }
    canvas.add(rect);

    // Add label
    const label = new fabric.Text(template.label, {
      left: center.x,
      top: center.y - (isParking ? 8 : 0),
      fontSize: isParking ? 10 : 14,
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

    // Parking: add dimensions text and simplified vehicle graphic
    if (isParking) {
      const dimText = new fabric.Text(`${template.width}m × ${template.height}m`, {
        left: center.x,
        top: center.y + 6,
        fontSize: 9,
        fontFamily: 'monospace',
        fill: '#9ca3af',
        originX: 'center',
        originY: 'center',
        selectable: false,
        evented: false,
      });
      (dimText as any).isMeasurement = true;
      (dimText as any).parentId = shapeId;
      canvas.add(dimText);

      // Simplified car outline (small rectangle inside)
      const carW = widthPx * 0.6;
      const carH = heightPx * 0.5;
      const car = new fabric.Rect({
        left: center.x - carW / 2,
        top: center.y - carH / 2 - 5,
        width: carW,
        height: carH,
        fill: 'transparent',
        stroke: '#9ca3af',
        strokeWidth: 0.8,
        rx: 3,
        ry: 3,
        selectable: false,
        evented: false,
      });
      (car as any).isMeasurement = true;
      (car as any).parentId = shapeId;
      canvas.add(car);
    }

    addRectMeasurements(rect, shapeId);

    // Draw overhang overlay for buildings
    if (['house', 'garage'].includes(templateId)) {
      drawOverhangOverlay(rect);
    }

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
    (polygon as any).elementName = "Land Parcel";
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

  const addNorthArrow = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const center = canvas.getCenterPoint();
    const arrowId = `north-arrow-${Date.now()}`;
    const northAngle = projectForEditor?.northAngle ?? 0;
    const size = metersToPixels(2);
    const points = [
      { x: 0, y: -size },
      { x: -size * 0.4, y: size * 0.6 },
      { x: 0, y: size * 0.3 },
      { x: size * 0.4, y: size * 0.6 },
    ];
    const arrow = new fabric.Polygon(points, {
      left: center.x - size * 0.5,
      top: center.y - size * 1.2,
      fill: "#1e293b",
      stroke: "#64748b",
      strokeWidth: 1,
    });
    (arrow as any).id = arrowId;
    (arrow as any).isNorthArrow = true;
    arrow.set({ angle: -northAngle });
    const label = new fabric.Text("N", {
      left: center.x - 6,
      top: center.y - size * 1.5,
      fontSize: 18,
      fontFamily: "sans-serif",
      fontWeight: "bold",
      fill: "#1e293b",
    });
    (label as any).isMeasurement = true;
    (label as any).parentId = arrowId;
    canvas.add(arrow, label);
    canvas.renderAll();
  };

  // Compute footprint summary from canvas objects
  const footprintSummary = (() => {
    const canvas = fabricRef.current;
    if (!canvas) return { existing: 0, projected: 0, max: 0, remaining: 0 };
    const BUILDING_TEMPLATES = ["house", "garage", "terrace"];
    let projected = 0;
    canvas.getObjects().forEach((obj) => {
      if ((obj as any).isGrid || (obj as any).isMeasurement) return;
      const templateType = (obj as any).templateType;
      const surfaceType = (obj as any).surfaceType;
      if (templateType && BUILDING_TEMPLATES.includes(templateType)) {
        const w = ((obj as any).width || 0) * (obj.scaleX || 1);
        const h = ((obj as any).height || 0) * (obj.scaleY || 1);
        projected += pixelsToMeters(w) * pixelsToMeters(h);
      } else if (obj.type === "rect" && surfaceType === "building") {
        const w = ((obj as any).width || 0) * (obj.scaleX || 1);
        const h = ((obj as any).height || 0) * (obj.scaleY || 1);
        projected += pixelsToMeters(w) * pixelsToMeters(h);
      } else if (obj.type === "polygon" && surfaceType === "building" && (obj as fabric.Polygon).points) {
        const pts = (obj as fabric.Polygon).points!;
        let area = 0;
        for (let i = 0; i < pts.length; i++) {
          const j = (i + 1) % pts.length;
          area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
        }
        const scale = currentScale.pixelsPerMeter * currentScale.pixelsPerMeter;
        projected += Math.abs(area) / 2 / scale;
      }
    });
    const max = 200; // Example max footprint m² - could come from parcel/PLU
    const existing = 0; // Could be input by user
    return { existing, projected, max, remaining: Math.max(0, max - existing - projected) };
  })();

  const surfaceAreasByType = (() => {
    const canvas = fabricRef.current;
    if (!canvas) return { green: 0, gravel: 0, concrete: 0, asphalt: 0, building: 0, total: 0 };
    const areas: Record<string, number> = { green: 0, gravel: 0, concrete: 0, asphalt: 0, building: 0 };
    canvas.getObjects().forEach((obj) => {
      if ((obj as any).isGrid || (obj as any).isMeasurement) return;
      const surfaceType = (obj as any).surfaceType || "building";
      const key = surfaceType in areas ? surfaceType : "building";
      let area = 0;
      if (obj.type === "rect") {
        const w = ((obj as any).width || 0) * (obj.scaleX || 1);
        const h = ((obj as any).height || 0) * (obj.scaleY || 1);
        area = pixelsToMeters(w) * pixelsToMeters(h);
      } else if (obj.type === "polygon" && (obj as fabric.Polygon).points) {
        const pts = (obj as fabric.Polygon).points!;
        for (let i = 0; i < pts.length; i++) {
          const j = (i + 1) % pts.length;
          area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
        }
        area = Math.abs(area) / 2 / (currentScale.pixelsPerMeter * currentScale.pixelsPerMeter);
      }
      areas[key] = (areas[key] || 0) + area;
    });
    const total = Object.values(areas).reduce((s, a) => s + a, 0);
    return { ...areas, total };
  })();
  const parcelAreaForGreen = projectForEditor?.parcelArea ?? 500;
  const requiredGreenPct = projectForEditor?.minGreenPct ?? 20;
  const greenPct = parcelAreaForGreen > 0 ? ((surfaceAreasByType.green ?? 0) / parcelAreaForGreen) * 100 : 0;

  const hasUnnamedElements = (() => {
    const canvas = fabricRef.current;
    if (!canvas) return true;
    const drawable = canvas.getObjects().filter(
      (o) => !(o as any).isGrid && !(o as any).isMeasurement && !(o as any).isPolygonPreview
    );
    return drawable.some((o) => {
      const name = String((o as any).elementName ?? (o as any).name ?? "").trim();
      return !name || name === "Unnamed";
    });
  })();
  const hasContent = footprintSummary.projected > 0 || surfaceAreasByType.total > 0;
  const editorCanProceed =
    !!currentProjectId &&
    !hasUnnamedElements &&
    greenPct >= requiredGreenPct &&
    hasContent;

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-slate-400 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Back</span>
          </Link>
          <div className="h-6 w-px bg-white/10" />
          <h1 className="text-lg font-semibold text-slate-900">Technical Drawing Editor</h1>
          <Link
            href={currentProjectId ? `/site-plan?project=${currentProjectId}` : "/site-plan"}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors text-sm font-medium"
          >
            <Layers className="w-4 h-4" />
            <span>Site Plan</span>
          </Link>
          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-600 text-xs font-medium">
            Scale {currentScale.label}
          </span>
          {/* Guided / Free Mode Toggle */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
            <button
              onClick={() => setEditorMode("guided")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all",
                editorMode === "guided"
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <ToggleLeft className="w-3.5 h-3.5" />
              Guided
            </button>
            <button
              onClick={() => setEditorMode("free")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all",
                editorMode === "free"
                  ? "bg-amber-500 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <ToggleRight className="w-3.5 h-3.5" />
              Free
            </button>
          </div>
          {/* Parcel Boundary Restriction Toggle */}
          <button
            onClick={() => setParcelBoundaryRestriction(!parcelBoundaryRestriction)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all border",
              parcelBoundaryRestriction
                ? "bg-emerald-100 border-emerald-300 text-emerald-700"
                : "bg-slate-100 border-slate-200 text-slate-500"
            )}
            title={parcelBoundaryRestriction ? "Drawing restricted to parcel" : "Drawing unrestricted"}
          >
            <Square className="w-3.5 h-3.5" />
            {parcelBoundaryRestriction ? "Parcel Lock ON" : "Parcel Lock OFF"}
          </button>
          <div className="h-6 w-px bg-white/10" />
          <Link
            href="/facades"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors text-sm font-medium"
          >
            <Layers className="w-4 h-4" />
            <span>Facades Editor</span>
          </Link>
          <Link href="/projects" className="text-slate-400 hover:text-slate-900 text-sm">Projects</Link>
          {projects.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={currentProjectId || ""}
                onChange={(e) => setCurrentProjectId(e.target.value || null)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-900 text-sm"
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {currentProjectId && (
                <>
                  <button
                    onClick={saveSitePlan}
                    disabled={saving}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-600 hover:bg-emerald-200 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save
                  </button>
                  <NextStepButton
                    canProceed={editorCanProceed}
                    nextHref={getNextStep("/editor", currentProjectId)?.href ?? `/terrain?project=${currentProjectId}`}
                    nextLabel={getNextStep("/editor", currentProjectId)?.label ?? "Next: Terrain"}
                    disabledMessage="Name all elements, meet green % requirement, and add at least one footprint to continue"
                  />
                </>
              )}
            </div>
          )}
        </div>

        {unnamedElementsWarning && unnamedElementsWarning.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-amber-100 border border-amber-200 text-amber-700 text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>
              Name all elements before saving. Unnamed: {unnamedElementsWarning.map((u) => `#${u.index} (${u.type})`).join(", ")}.
              Select each and set a name in the Properties panel.
            </span>
            <button
              type="button"
              onClick={() => setUnnamedElementsWarning(null)}
              className="ml-auto text-amber-600 hover:text-amber-700"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Scale selector */}
          <select
            value={currentScale.label}
            onChange={(e) => {
              const scale = SCALES.find(s => s.label === e.target.value);
              if (scale) setCurrentScale(scale);
            }}
            className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-900 text-sm cursor-pointer"
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
              showGrid ? "bg-blue-100 text-blue-600" : "text-slate-400 hover:text-slate-900"
            )}
            title="Toggle Grid"
          >
            <Grid3X3 className="w-5 h-5" />
          </button>

          <button
            onClick={() => setSnapEnabled(!snapEnabled)}
            className={cn(
              "p-2 rounded-lg transition-colors",
              snapEnabled ? "bg-purple-100 text-purple-600" : "text-slate-400 hover:text-slate-900"
            )}
            title="Toggle Snap"
          >
            <Magnet className="w-5 h-5" />
          </button>

          <div className="h-6 w-px bg-white/10" />

          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <button onClick={() => handleZoom(-25)} className="p-1.5 text-slate-400 hover:text-slate-900">
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="px-2 text-sm text-slate-900 min-w-[50px] text-center">{zoom}%</span>
            <button onClick={() => handleZoom(25)} className="p-1.5 text-slate-400 hover:text-slate-900">
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          <div className="h-6 w-px bg-white/10" />

          <button
            onClick={handleClearAll}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Clear All"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Toolbar */}
        <div className="w-16 bg-white border-r border-slate-200 flex flex-col items-center py-4 gap-1">
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
                      ? "bg-gradient-to-br from-blue-500 to-purple-500 text-slate-900 shadow-lg shadow-blue-500/25"
                      : "text-slate-400 hover:bg-slate-100 hover:text-slate-900"
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
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-all group"
                  title={`${template.label} (${template.width}m × ${template.height}m)`}
                >
                  <Icon className="w-5 h-5" style={{ color: template.color }} />
                </button>
              );
            })}
          </div>

          <div className="w-8 h-px bg-white/10 my-2" />

          {/* North Arrow */}
          <button
            onClick={addNorthArrow}
            className="w-12 h-12 rounded-xl flex items-center justify-center text-sky-400 hover:bg-sky-500/20 transition-all"
            title="Add North Arrow"
          >
            <Compass className="w-5 h-5" />
          </button>

          {/* View in 3D */}
          {currentProjectId && (
            <Link
              href={`/building-3d?project=${currentProjectId}`}
              className="w-12 h-12 rounded-xl flex items-center justify-center text-violet-400 hover:bg-violet-500/20 transition-all"
              title="View in 3D"
            >
              <Box className="w-5 h-5" />
            </Link>
          )}

          {/* Sample Parcel Button */}
          <button
            onClick={createSampleParcel}
            className="w-12 h-12 rounded-xl flex items-center justify-center bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition-all"
            title="Add Sample Land Parcel with Measurements"
          >
            <MapPin className="w-5 h-5" />
          </button>

          <div className="flex-1" />

          {/* Delete */}
          <button
            onClick={handleDelete}
            className="w-12 h-12 rounded-xl flex items-center justify-center text-red-600 hover:bg-red-50 transition-all"
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

          {/* Polygon/Parcel/Freeform/Section instruction */}
          {(activeTool === "polygon" || activeTool === "parcel" || activeTool === "freeform" || activeTool === "section-line") && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
              <div className="px-4 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 text-sm">
                {activeTool === "section-line" ? (
                  <>
                    Click <span className="text-pink-600 font-medium">start point</span>, then <span className="text-pink-600 font-medium">end point</span> for section line.
                    {polygonPoints.length === 1 && (
                      <span className="ml-2 text-emerald-600">(Click end point)</span>
                    )}
                  </>
                ) : (
                  <>
                    Click to add points. <span className="text-amber-600 font-medium">Double-click</span> to complete.
                    {polygonPoints.length > 0 && (
                      <span className="ml-2 text-emerald-600">({polygonPoints.length} points)</span>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Mouse position display */}
          <div className="absolute bottom-4 right-4 z-20">
            <div className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-mono">
              X: {formatMeasurement(pixelsToMeters(mousePos.x))} | Y: {formatMeasurement(pixelsToMeters(mousePos.y))}
            </div>
          </div>

          {/* Free Mode Badge */}
          {editorMode === "free" && (
            <div className="absolute top-4 right-4 z-20">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold shadow-lg">
                <ToggleRight className="w-4 h-4" />
                FREE MODE – No compliance checks
              </div>
            </div>
          )}

          {/* Canvas */}
          <div className="absolute inset-0 flex items-center justify-center bg-white">
            <canvas ref={canvasRef} className="shadow-2xl" />
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-72 bg-white border-l border-slate-200 flex flex-col">
          {/* Compliance Panel (Guided mode only) */}
          {currentProjectId && editorMode === "guided" && (
            <div className="border-b border-slate-200">
              <button
                onClick={() => setShowCompliance(!showCompliance)}
                className="w-full flex items-center justify-between p-3 text-left hover:bg-white"
              >
                <span className="text-sm font-medium text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Compliance
                </span>
                <ChevronDown className={cn("w-4 h-4 transition-transform", showCompliance && "rotate-180")} />
              </button>
              {showCompliance && complianceChecks.length > 0 && (
                <div className="p-3 pt-0 max-h-40 overflow-y-auto space-y-2">
                  {complianceChecks.map((c, i) => (
                    <div
                      key={i}
                      className={cn(
                        "p-2 rounded-lg text-xs",
                        c.status === "compliant" && "bg-emerald-50 text-emerald-600",
                        c.status === "warning" && "bg-amber-50 text-amber-600",
                        c.status === "violation" && "bg-red-50 text-red-600"
                      )}
                    >
                      <span className="font-medium">{c.rule}</span>: {c.message}
                    </div>
                  ))}
                </div>
              )}
              {showCompliance && currentProjectId && (
                <p className="p-3 pt-0 text-xs text-slate-500 border-t border-slate-100 mt-1">
                  If your PLU counts roof overhang in footprint, set overhang in Building 3D (View in 3D).
                </p>
              )}
            </div>
          )}
          {/* Layers Panel */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
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
                  <p className="mt-2 text-xs">Draw shapes to see<br />measurements automatically!</p>
                </div>
              ) : (
                layers.map((layer) => (
                  <div
                    key={layer.id}
                    className="flex items-center gap-2 p-2 rounded-lg bg-white hover:bg-slate-100 transition-colors"
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        layer.name === "Land Parcel" ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600"
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
                      <p className="text-sm text-slate-900 truncate capitalize">{layer.name}</p>
                      <p className="text-xs text-slate-500">{layer.type}</p>
                    </div>
                    <button className="p-1 text-slate-400 hover:text-slate-900">
                      {layer.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Properties Panel */}
          <div className="border-t border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Properties
            </h3>

            {selectedObject ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Name (required)</label>
                  <input
                    type="text"
                    value={String((selectedObject as any).elementName ?? (selectedObject as any).name ?? "")}
                    onChange={(e) => {
                      const name = e.target.value;
                      (selectedObject as any).elementName = name;
                      (selectedObject as any).name = name;
                      fabricRef.current?.requestRenderAll();
                      updateLayers(fabricRef.current!);
                    }}
                    placeholder="e.g. Main building"
                    className="w-full px-2 py-1.5 rounded bg-slate-100 border border-slate-200 text-slate-900 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Type</label>
                  <p className="text-sm text-slate-900 capitalize">{selectedObject.type}</p>
                </div>
                {selectedObject.width && (
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Width</label>
                    <p className="text-sm text-amber-600 font-mono font-bold">
                      {formatMeasurement(pixelsToMeters((selectedObject.width || 0) * (selectedObject.scaleX || 1)))}
                    </p>
                  </div>
                )}
                {selectedObject.height && (
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Height</label>
                    <p className="text-sm text-amber-600 font-mono font-bold">
                      {formatMeasurement(pixelsToMeters((selectedObject.height || 0) * (selectedObject.scaleY || 1)))}
                    </p>
                  </div>
                )}

                {/* Roof Properties – for house/garage/building templates */}
                {["house", "garage"].includes((selectedObject as any).templateType || "") && (
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <label className="text-xs text-slate-500 block font-medium">Roof</label>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Type</label>
                      <select
                        value={(selectedObject as any).roofType || "gable"}
                        onChange={(e) => {
                          (selectedObject as any).roofType = e.target.value;
                          fabricRef.current?.requestRenderAll();
                        }}
                        className="w-full px-2 py-1.5 rounded bg-slate-100 border border-slate-200 text-slate-900 text-sm"
                      >
                        {ROOF_TYPES.map((rt) => (
                          <option key={rt.id} value={rt.id}>{rt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">
                        Pitch: {(selectedObject as any).roofPitch ?? 30}°
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="60"
                        value={(selectedObject as any).roofPitch ?? 30}
                        disabled={(selectedObject as any).roofType === "flat"}
                        onChange={(e) => {
                          (selectedObject as any).roofPitch = Number(e.target.value);
                          fabricRef.current?.requestRenderAll();
                        }}
                        className="w-full accent-blue-500 disabled:opacity-40"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">
                        Overhang (m): {(selectedObject as any).roofOverhang ?? 0.5}
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="3"
                        step="0.1"
                        value={(selectedObject as any).roofOverhang ?? 0.5}
                        onChange={(e) => {
                          (selectedObject as any).roofOverhang = parseFloat(e.target.value) || 0;
                          drawOverhangOverlay(selectedObject);
                          fabricRef.current?.requestRenderAll();
                        }}
                        className="w-full px-2 py-1.5 rounded bg-slate-100 border border-slate-200 text-slate-900 text-sm"
                      />
                    </div>
                    {/* Interior Layout toggle */}
                    {(selectedObject as any).templateType === 'house' && (
                      <div className="flex items-center justify-between pt-1">
                        <label className="text-xs text-slate-400">Interior Layout</label>
                        <button
                          onClick={() => {
                            const current = !!(selectedObject as any).showInteriorLayout;
                            (selectedObject as any).showInteriorLayout = !current;
                            drawInteriorPartitions(selectedObject);
                            fabricRef.current?.requestRenderAll();
                          }}
                          className={cn(
                            'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                            (selectedObject as any).showInteriorLayout
                              ? 'bg-blue-100 text-blue-600'
                              : 'bg-slate-100 text-slate-400'
                          )}
                        >
                          {(selectedObject as any).showInteriorLayout ? 'ON' : 'OFF'}
                        </button>
                      </div>
                    )}
                    {/* Room Layout Preset Selector */}
                    {(selectedObject as any).templateType === 'house' && (selectedObject as any).showInteriorLayout && (
                      <div className="pt-1">
                        <label className="text-xs text-slate-400 block mb-1">Room Layout</label>
                        <select
                          value={(selectedObject as any).interiorLayoutId || "simple-3"}
                          onChange={(e) => {
                            (selectedObject as any).interiorLayoutId = e.target.value;
                            drawInteriorPartitions(selectedObject);
                            fabricRef.current?.requestRenderAll();
                          }}
                          className="w-full px-2 py-1.5 rounded bg-slate-100 border border-slate-200 text-slate-900 text-xs"
                        >
                          {ROOM_LAYOUT_PRESETS.map((preset) => (
                            <option key={preset.id} value={preset.id}>{preset.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* Shutter Properties – for window/door/sliding-door templates */}
                {["window", "door", "sliding-door"].includes((selectedObject as any).templateType || "") && (
                  <div className="pt-2 border-t border-slate-100">
                    <label className="text-xs text-slate-500 block mb-1 font-medium">Shutters</label>
                    <select
                      value={(selectedObject as any).shutterType || "none"}
                      onChange={(e) => {
                        (selectedObject as any).shutterType = e.target.value;
                        drawShutterIndicator(selectedObject);
                        fabricRef.current?.requestRenderAll();
                      }}
                      className="w-full px-2 py-1.5 rounded bg-slate-100 border border-slate-200 text-slate-900 text-sm"
                    >
                      {SHUTTER_TYPES.map((st) => (
                        <option key={st.id} value={st.id}>{st.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Select an object to view properties</p>
            )}

            {/* Surface Type (for rect/polygon) */}
            <div className="mt-4">
              <label className="text-xs text-slate-500 block mb-2">Surface Type</label>
              <div className="flex flex-wrap gap-1">
                {SURFACE_TYPES.map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setActiveSurfaceType(st)}
                    className={cn(
                      "px-2 py-1 rounded text-xs font-medium transition-colors",
                      activeSurfaceType.id === st.id ? "ring-2 ring-white/50" : "opacity-70 hover:opacity-100"
                    )}
                    style={{ backgroundColor: st.color + "40", color: st.color }}
                    title={st.label}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* VRD Type (when VRD tool active) */}
            {activeTool === "vrd" && (
              <div className="mt-4">
                <label className="text-xs text-slate-500 block mb-2">VRD Network</label>
                <div className="flex flex-wrap gap-1">
                  {VRD_TYPES.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setActiveVrdType(v)}
                      className={cn(
                        "px-2 py-1 rounded text-xs",
                        activeVrdType.id === v.id ? "ring-2 ring-white/50" : "opacity-70 hover:opacity-100"
                      )}
                      style={{ backgroundColor: v.color + "40", color: v.color }}
                      title={v.label}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Footprint Summary Table */}
            <div className="mt-4 p-3 rounded-lg bg-white border border-slate-100">
              <label className="text-xs text-slate-500 block mb-2">Footprint (m²)</label>
              <div className="text-xs space-y-1">
                <div className="flex justify-between"><span className="text-slate-400">Existing</span><span className="text-slate-900 font-mono">{footprintSummary.existing.toFixed(0)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Projected</span><span className="text-amber-600 font-mono">{footprintSummary.projected.toFixed(0)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Max</span><span className="text-slate-900 font-mono">{footprintSummary.max.toFixed(0)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Remaining</span><span className="text-emerald-600 font-mono">{footprintSummary.remaining.toFixed(0)}</span></div>
              </div>
            </div>

            {/* Green space verification table (PLU) */}
            <div className="mt-4 p-3 rounded-lg bg-white border border-slate-100">
              <label className="text-xs text-slate-500 block mb-2">Surface by type (PLU verification)</label>
              <div className="text-xs space-y-1">
                {(["green", "gravel", "concrete", "asphalt", "building"] as const).map((t) => (
                  <div key={t} className="flex justify-between">
                    <span className="text-slate-400 capitalize">{t}</span>
                    <span className="text-slate-900 font-mono">{(surfaceAreasByType[t] ?? 0).toFixed(1)} m²</span>
                  </div>
                ))}
                <div className="border-t border-slate-200 mt-2 pt-2 flex justify-between">
                  <span className="text-slate-400">Green % (min. {requiredGreenPct}% required)</span>
                  <span className={cn("font-mono", greenPct >= requiredGreenPct ? "text-emerald-600" : "text-amber-600")}>
                    {greenPct.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

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

export default function EditorPage() {
  return (
    <Suspense fallback={
      <div className="h-screen bg-white flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <EditorPageContent />
    </Suspense>
  );
}
