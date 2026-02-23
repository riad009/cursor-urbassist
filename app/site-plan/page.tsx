"use client";

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  Suspense,
} from "react";
import Link from "next/link";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
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
  ArrowRight,
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
  Building2,
  CuboidIcon,
  LayoutGrid,
  Plus,
  Maximize2,
  Minimize2,
  Triangle,
  Undo2,
  Redo2,
  Play,
  FileText,
  X,
  Mountain,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getNextStep, getPrevStep } from "@/lib/step-flow";
import {
  BuildingDetailPanel,
  createDefaultBuilding,
  createBuildingFromOSM,
} from "@/components/site-plan/BuildingDetailPanel";
import { FootprintTable } from "@/components/site-plan/FootprintTable";
import { SitePlanLegend } from "@/components/site-plan/SitePlanLegend";
import { GuidedCreation } from "@/components/site-plan/GuidedCreation";
import type { BuildingDetail } from "@/components/site-plan/BuildingDetailPanel";
import type { FootprintData } from "@/components/site-plan/FootprintTable";
import { getPresetById, type ProjectPreset } from "@/lib/projectPresets";
import { parcelGeometryToShapes } from "@/lib/parcelGeometryToCanvas";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Types ───────────────────────────────────────────────────────────────────

type Tool =
  | "select"
  | "rectangle"
  | "circle"
  | "line"
  | "polygon"
  | "text"
  | "pan"
  | "measure"
  | "parcel"
  | "vrd"
  | "elevation"
  | "section"
  | "vegetation"
  | "viewpoint";

type ViewMode = "2d" | "3d";

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

interface ProjectOption {
  id: string;
  name: string;
  address?: string | null;
}

interface ProjectData {
  parcelArea: number;
  northAngle: number;
  minGreenPct: number;
  maxCoverageRatio: number;
  includeOverhangInFootprint: boolean;
  coordinates: { lat: number; lng: number } | null;
  parcelGeometry: unknown;
  pluSetbacks?: Record<string, number>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SCALES = [
  { label: "1:50", value: 0.5, pixelsPerMeter: 20 },
  { label: "1:100", value: 1, pixelsPerMeter: 10 },
  { label: "1:200", value: 2, pixelsPerMeter: 5 },
  { label: "1:500", value: 5, pixelsPerMeter: 2 },
];

const tools = [
  { id: "select", label: "Select", icon: MousePointer2, shortcut: "V", tooltip: "Select and move objects" },
  { id: "line", label: "Line", icon: Minus, shortcut: "L", tooltip: "Draw walls, fences, or segments" },
  { id: "rectangle", label: "Rectangle", icon: Square, shortcut: "R", tooltip: "Quick rectangle for buildings or surfaces" },
  { id: "polygon", label: "Polygon", icon: Pentagon, shortcut: "P", tooltip: "Free shape: click points, double-click to close" },
  { id: "circle", label: "Circle", icon: Circle, shortcut: "C", tooltip: "Circles or round surfaces" },
  { id: "measure", label: "Measure", icon: Ruler, shortcut: "M", tooltip: "Measure distance between two points" },
  { id: "parcel", label: "Land Parcel", icon: MapPin, shortcut: "A", tooltip: "Draw parcel boundary (polygon)" },
  { id: "vrd", label: "VRD Networks", icon: Zap, shortcut: "D", tooltip: "Utilities: water, wastewater, electricity, etc." },
  { id: "elevation", label: "Elevation", icon: Ruler, shortcut: "E", tooltip: "Click to place elevation point (m)" },
  { id: "section", label: "Section line", icon: Minus, shortcut: "S", tooltip: "Draw section cut line" },
  { id: "vegetation", label: "Vegetation", icon: Trees, shortcut: "G", tooltip: "Place existing vegetation (trees, shrubs)" },
  { id: "viewpoint", label: "Viewpoint", icon: Eye, shortcut: "W", tooltip: "Place PC7/PC8 camera viewpoint with direction" },
  { id: "text", label: "Text", icon: Type, shortcut: "T", tooltip: "Add text labels" },
  { id: "pan", label: "Pan", icon: Move, shortcut: "H", tooltip: "Pan the canvas" },
];

const templatesList = [
  { id: "access", label: "Access", icon: Triangle, color: "#f59e0b", width: 0, height: 0 }, // Site access: triangle + label
  { id: "house", label: "House", icon: Home, color: "#3b82f6", width: 12, height: 8 },
  { id: "garage", label: "Garage", icon: Car, color: "#8b5cf6", width: 6, height: 5 },
  { id: "parking", label: "Parking 2.5×5 m", icon: Car, color: "#6b7280", width: 2.5, height: 5 },
  { id: "pool", label: "Pool", icon: Droplets, color: "#06b6d4", width: 10, height: 5 },
  { id: "garden", label: "Garden", icon: Trees, color: "#22c55e", width: 8, height: 8 },
  { id: "terrace", label: "Terrace", icon: Hexagon, color: "#ec4899", width: 6, height: 4 },
];

const SURFACE_TYPES = [
  // Permeable
  { id: "natural_green", label: "Natural Green", color: "#22c55e", fill: "rgba(34, 197, 94, 0.4)", tooltip: "Permeable: natural lawn, planting areas" },
  // Semi-permeable
  { id: "gravel", label: "Gravel", color: "#a8a29e", fill: "rgba(168, 162, 158, 0.5)", tooltip: "Semi-permeable: gravel, stabilized surfaces" },
  { id: "evergreen_system", label: "Evergreen", color: "#65a30d", fill: "rgba(101, 163, 13, 0.35)", tooltip: "Semi-permeable: evergreen system" },
  { id: "pavers_pedestals", label: "Pavers/Pedestals", color: "#d4d4d4", fill: "rgba(212, 212, 212, 0.45)", tooltip: "Semi-permeable: pavers on pedestals" },
  { id: "drainage_pavement", label: "Drainage Paving", color: "#94a3b8", fill: "rgba(148, 163, 184, 0.45)", tooltip: "Semi-permeable: drainage pavement" },
  { id: "vegetated_flat_roof", label: "Vegetated Roof", color: "#4ade80", fill: "rgba(74, 222, 128, 0.35)", tooltip: "Semi-permeable: vegetated flat roof" },
  // Impermeable
  { id: "asphalt", label: "Asphalt", color: "#44403c", fill: "rgba(68, 64, 60, 0.6)", tooltip: "Impermeable: driveway, parking" },
  { id: "bitumen", label: "Bitumen", color: "#292524", fill: "rgba(41, 37, 36, 0.55)", tooltip: "Impermeable: bituminous surface" },
  { id: "concrete", label: "Concrete", color: "#78716c", fill: "rgba(120, 113, 108, 0.5)", tooltip: "Impermeable: concrete slab" },
  { id: "standard_roof", label: "Standard Roof", color: "#b45309", fill: "rgba(180, 83, 9, 0.35)", tooltip: "Impermeable: pitched roof (2-slope, 4-slope)" },
  { id: "building", label: "Building", color: "#3b82f6", fill: "rgba(59, 130, 246, 0.3)", tooltip: "Impermeable: building footprint" },
];

const SURFACE_CLASSIFICATION: Record<string, "permeable" | "semi-permeable" | "impermeable"> = {
  natural_green: "permeable",
  gravel: "semi-permeable",
  evergreen_system: "semi-permeable",
  pavers_pedestals: "semi-permeable",
  drainage_pavement: "semi-permeable",
  vegetated_flat_roof: "semi-permeable",
  asphalt: "impermeable",
  bitumen: "impermeable",
  concrete: "impermeable",
  standard_roof: "impermeable",
  building: "impermeable",
};

// Backward compatibility alias for old "green" surface type
const SURFACE_ID_COMPAT: Record<string, string> = { green: "natural_green" };

const VRD_TYPES = [
  { id: "electricity", label: "Electricity", color: "#fbbf24" },
  { id: "water", label: "Water", color: "#38bdf8" },
  { id: "wastewater", label: "Wastewater", color: "#78716c" },
  { id: "stormwater", label: "Stormwater", color: "#0ea5e9" },
  { id: "telecom", label: "Telecom", color: "#a78bfa" },
  { id: "gas", label: "Gas", color: "#f97316" },
  { id: "not_applicable", label: "N/A", color: "#6b7280" },
];

const paletteColors = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f59e0b", "#22c55e", "#06b6d4", "#6b7280",
  "#1e293b", "#ffffff",
];

// ─── Page Component ──────────────────────────────────────────────────────────

function SitePlanContent() {
  const searchParams = useSearchParams();
  const projectIdFromUrl = searchParams.get("project");

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const measurementLabelsRef = useRef<Map<string, fabric.FabricObject[]>>(new Map());
  const placeGuidedBuildingAtRef = useRef<(x: number, y: number) => void>(() => { });
  const projectDataRef = useRef<ProjectData | null>(null);
  const parcelsDrawnFromGeometryRef = useRef<string | null>(null);

  // State
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [viewMode, setViewMode] = useState<ViewMode>("2d");
  const [zoom, setZoom] = useState(100);
  const [activeColor, setActiveColor] = useState("#3b82f6");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [showGrid, setShowGrid] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [layers, setLayers] = useState<LayerItem[]>([]);
  const [selectedObject, setSelectedObject] = useState<fabric.FabricObject | null>(null);
  const [canvasSize] = useState({ width: 1400, height: 900 });
  const [currentScale, setCurrentScale] = useState(SCALES[1]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingStart, setDrawingStart] = useState<{ x: number; y: number } | null>(null);
  const [tempShape, setTempShape] = useState<fabric.FabricObject | null>(null);
  const [currentMeasurement, setCurrentMeasurement] = useState("");
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [polygonPoints, setPolygonPoints] = useState<{ x: number; y: number }[]>([]);
  const [activeSurfaceType, setActiveSurfaceType] = useState(SURFACE_TYPES[4]);
  const [activeVrdType, setActiveVrdType] = useState(VRD_TYPES[0]);

  // Project state
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(projectIdFromUrl);
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const [canvasReady, setCanvasReady] = useState(false);

  // Buildings state
  const [buildingDetails, setBuildingDetails] = useState<BuildingDetail[]>([]);
  const [existingBuildingsLoaded, setExistingBuildingsLoaded] = useState(false);
  const [loadingExistingBuildings, setLoadingExistingBuildings] = useState(false);

  // Compliance
  const [complianceChecks, setComplianceChecks] = useState<{ rule: string; status: string; message: string }[]>([]);
  const [showCompliance, setShowCompliance] = useState(false);
  const [unnamedElementsWarning, setUnnamedElementsWarning] = useState<{ index: number; type: string }[] | null>(null);

  // Right panel tabs
  const [rightTab, setRightTab] = useState<"layers" | "buildings" | "footprint">("layers");
  const [selectedBuildingId3d, setSelectedBuildingId3d] = useState<string | null>(null);
  const [customDimensions, setCustomDimensions] = useState({ width: 10, depth: 8, groundHeight: 3 });

  // Guided creation (amateur-friendly flow)
  const [creationMode, setCreationMode] = useState<"guided" | "free">("guided");
  const [guidedStep, setGuidedStep] = useState(1);
  const [hideFreeDesignHint, setHideFreeDesignHint] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<ProjectPreset | null>(null);
  const [placementMode, setPlacementMode] = useState(false);
  const [lastPlacedBuildingId, setLastPlacedBuildingId] = useState<string | null>(null);

  // Full-screen mode & paper size (Step 2 spec: full-screen, A4/A3 validation)
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [paperSize, setPaperSize] = useState<"A4" | "A3">("A3");

  // Elevation points (spec 2.5): click to place, value in m (e.g. 0.00 / -0.20 / +1.50)
  const [elevationPoints, setElevationPoints] = useState<{ id: string; x: number; y: number; value: number }[]>([]);
  const [loadingIgnTerrain, setLoadingIgnTerrain] = useState(false);
  // Section line: user-placed line for section cut (spec 2.9)
  const [previewMode, setPreviewMode] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  // Undo/redo: history of canvas states
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // ─── Utility functions ──────────────────────────────────────────────────────

  const updateLayers = useCallback((canvas: fabric.Canvas) => {
    const objects = canvas.getObjects().filter((obj: any) => {
      return !obj.excludeFromExport && !obj.isGrid && !obj.isMeasurement && !obj.isPolygonPreview;
    });
    const newLayers: LayerItem[] = objects.map((obj: any, index: number) => ({
      id: obj.id || `layer-${index}`,
      name: obj.elementName || obj.name || (obj.isParcel ? "Land Parcel" : obj.type || "Object"),
      type: obj.type || "unknown",
      visible: obj.visible ?? true,
      locked: !obj.selectable,
    }));
    setLayers(newLayers.reverse());
  }, []);

  const pixelsToMeters = useCallback((pixels: number) => pixels / currentScale.pixelsPerMeter, [currentScale]);
  const metersToPixels = useCallback((meters: number) => meters * currentScale.pixelsPerMeter, [currentScale]);

  const formatMeasurement = useCallback((meters: number) => {
    if (meters < 1) return `${(meters * 100).toFixed(0)} cm`;
    return `${meters.toFixed(2)} m`;
  }, []);

  const calculateDistance = useCallback(
    (x1: number, y1: number, x2: number, y2: number) => {
      return pixelsToMeters(Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)));
    },
    [pixelsToMeters]
  );

  // ─── Dimension lines ───────────────────────────────────────────────────────

  const createDimensionLine = useCallback(
    (x1: number, y1: number, x2: number, y2: number, parentId: string, offset = 20, color = "#fbbf24") => {
      const canvas = fabricRef.current;
      if (!canvas) return [];

      const distance = calculateDistance(x1, y1, x2, y2);
      const label = formatMeasurement(distance);
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
      const offsetX = Math.sin(angle) * offset;
      const offsetY = -Math.cos(angle) * offset;
      const dimX1 = x1 + offsetX, dimY1 = y1 + offsetY;
      const dimX2 = x2 + offsetX, dimY2 = y2 + offsetY;
      const dimMidX = midX + offsetX, dimMidY = midY + offsetY;

      const mkM = (obj: any) => { obj.isMeasurement = true; obj.parentId = parentId; return obj; };

      const dimensionLine = mkM(new fabric.Line([dimX1, dimY1, dimX2, dimY2], {
        stroke: color, strokeWidth: 1, selectable: false, evented: false,
      }));
      const ext1 = mkM(new fabric.Line([x1, y1, dimX1, dimY1], {
        stroke: color, strokeWidth: 0.5, selectable: false, evented: false,
      }));
      const ext2 = mkM(new fabric.Line([x2, y2, dimX2, dimY2], {
        stroke: color, strokeWidth: 0.5, selectable: false, evented: false,
      }));
      const arrowSize = 6;
      const arrow1 = mkM(new fabric.Polygon([
        { x: dimX1, y: dimY1 },
        { x: dimX1 + Math.cos(angle - Math.PI / 6) * arrowSize, y: dimY1 + Math.sin(angle - Math.PI / 6) * arrowSize },
        { x: dimX1 + Math.cos(angle + Math.PI / 6) * arrowSize, y: dimY1 + Math.sin(angle + Math.PI / 6) * arrowSize },
      ], { fill: color, selectable: false, evented: false }));
      const arrow2 = mkM(new fabric.Polygon([
        { x: dimX2, y: dimY2 },
        { x: dimX2 - Math.cos(angle - Math.PI / 6) * arrowSize, y: dimY2 - Math.sin(angle - Math.PI / 6) * arrowSize },
        { x: dimX2 - Math.cos(angle + Math.PI / 6) * arrowSize, y: dimY2 - Math.sin(angle + Math.PI / 6) * arrowSize },
      ], { fill: color, selectable: false, evented: false }));
      const textAngle = (angle * 180) / Math.PI;
      const adjusted = textAngle > 90 || textAngle < -90 ? textAngle + 180 : textAngle;
      const text = mkM(new fabric.Text(label, {
        left: dimMidX, top: dimMidY - 8, fontSize: 12, fontFamily: "monospace",
        fill: "#0f172a", backgroundColor: color, padding: 3,
        originX: "center", originY: "center", angle: adjusted,
        selectable: false, evented: false,
      }));

      const elements = [dimensionLine, ext1, ext2, arrow1, arrow2, text];
      elements.forEach((el) => canvas.add(el));
      return elements;
    },
    [calculateDistance, formatMeasurement]
  );

  const addRectMeasurements = useCallback(
    (rect: fabric.Rect, id: string) => {
      const left = rect.left || 0, top = rect.top || 0;
      const width = (rect.width || 0) * (rect.scaleX || 1);
      const height = (rect.height || 0) * (rect.scaleY || 1);
      const m: fabric.FabricObject[] = [];
      m.push(...createDimensionLine(left, top + height, left + width, top + height, id, 25, "#fbbf24"));
      m.push(...createDimensionLine(left + width, top, left + width, top + height, id, 25, "#fbbf24"));
      measurementLabelsRef.current.set(id, m);
    },
    [createDimensionLine]
  );

  const addPolygonMeasurements = useCallback(
    (polygon: fabric.Polygon, id: string) => {
      const points = polygon.points;
      if (!points || points.length < 2) return;
      const measurements: fabric.FabricObject[] = [];
      const matrix = polygon.calcTransformMatrix();
      for (let i = 0; i < points.length; i++) {
        const p1 = points[i], p2 = points[(i + 1) % points.length];
        const t1 = fabric.util.transformPoint(new fabric.Point(p1.x, p1.y), matrix);
        const t2 = fabric.util.transformPoint(new fabric.Point(p2.x, p2.y), matrix);
        measurements.push(...createDimensionLine(t1.x, t1.y, t2.x, t2.y, id, 25, "#22c55e"));
      }
      measurementLabelsRef.current.set(id, measurements);
    },
    [createDimensionLine]
  );

  const addLineMeasurement = useCallback(
    (line: fabric.Line, id: string) => {
      const m = createDimensionLine(line.x1 || 0, line.y1 || 0, line.x2 || 0, line.y2 || 0, id, 20, "#fbbf24");
      measurementLabelsRef.current.set(id, m);
    },
    [createDimensionLine]
  );

  const addCircleMeasurements = useCallback(
    (circle: fabric.Circle, id: string) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const centerX = (circle.left || 0) + (circle.radius || 0);
      const centerY = (circle.top || 0) + (circle.radius || 0);
      const radius = (circle.radius || 0) * (circle.scaleX || 1);
      const diameter = pixelsToMeters(radius * 2);
      const diamLine = new fabric.Line([centerX - radius, centerY, centerX + radius, centerY], {
        stroke: "#fbbf24", strokeWidth: 1, strokeDashArray: [5, 3], selectable: false, evented: false,
      }) as any;
      diamLine.isMeasurement = true; diamLine.parentId = id;
      const text = new fabric.Text(`\u00D8 ${formatMeasurement(diameter)}`, {
        left: centerX, top: centerY - radius - 20, fontSize: 12, fontFamily: "monospace",
        fill: "#0f172a", backgroundColor: "#fbbf24", padding: 3, originX: "center",
        selectable: false, evented: false,
      }) as any;
      text.isMeasurement = true; text.parentId = id;
      [diamLine, text].forEach((el: any) => canvas.add(el));
      measurementLabelsRef.current.set(id, [diamLine, text]);
    },
    [pixelsToMeters, formatMeasurement]
  );

  const removeMeasurements = useCallback((id: string) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const m = measurementLabelsRef.current.get(id);
    if (m) { m.forEach((el) => canvas.remove(el)); measurementLabelsRef.current.delete(id); }
  }, []);

  const updateObjectMeasurements = useCallback(
    (obj: fabric.FabricObject) => {
      const id = (obj as any).id;
      if (!id) return;
      removeMeasurements(id);
      if (obj.type === "rect") addRectMeasurements(obj as fabric.Rect, id);
      else if (obj.type === "polygon") addPolygonMeasurements(obj as fabric.Polygon, id);
      else if (obj.type === "line") addLineMeasurement(obj as fabric.Line, id);
      else if (obj.type === "circle") addCircleMeasurements(obj as fabric.Circle, id);
    },
    [removeMeasurements, addRectMeasurements, addPolygonMeasurements, addLineMeasurement, addCircleMeasurements]
  );

  // ─── Real-time compliance ──────────────────────────────────────────────────

  const complianceDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_UNDO = 50;

  const pushUndoState = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (undoDebounceRef.current) clearTimeout(undoDebounceRef.current);
    undoDebounceRef.current = setTimeout(() => {
      undoDebounceRef.current = null;
      try {
        const json = JSON.stringify(canvas.toJSON());
        undoStackRef.current = undoStackRef.current.slice(-(MAX_UNDO - 1));
        undoStackRef.current.push(json);
        redoStackRef.current = [];
        setCanUndo(undoStackRef.current.length > 0);
        setCanRedo(false);
      } catch { /* ignore */ }
    }, 300);
  }, []);

  const handleUndo = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || undoStackRef.current.length === 0) return;
    const prev = undoStackRef.current.pop();
    setCanUndo(undoStackRef.current.length > 0);
    if (prev) {
      redoStackRef.current.push(JSON.stringify(canvas.toJSON()));
      setCanRedo(true);
      canvas.loadFromJSON(prev, () => {
        canvas.renderAll();
        updateLayers(canvas);
        const pts: { id: string; x: number; y: number; value: number }[] = [];
        canvas.getObjects().forEach((o: any) => {
          if (o.isElevationPoint != null && o.elevationValue != null) {
            const c = (o as fabric.Object).getCenterPoint();
            pts.push({ id: o.id || `ep-${Date.now()}-${pts.length}`, x: c.x, y: c.y, value: o.elevationValue });
          }
        });
        setElevationPoints(pts);
      });
    }
  }, [updateLayers]);

  const handleRedo = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || redoStackRef.current.length === 0) return;
    const next = redoStackRef.current.pop();
    setCanRedo(redoStackRef.current.length > 0);
    if (next) {
      undoStackRef.current.push(JSON.stringify(canvas.toJSON()));
      setCanUndo(true);
      canvas.loadFromJSON(next, () => {
        canvas.renderAll();
        updateLayers(canvas);
        const pts: { id: string; x: number; y: number; value: number }[] = [];
        canvas.getObjects().forEach((o: any) => {
          if (o.isElevationPoint != null && o.elevationValue != null) {
            const c = (o as fabric.Object).getCenterPoint();
            pts.push({ id: o.id || `ep-${Date.now()}-${pts.length}`, x: c.x, y: c.y, value: o.elevationValue });
          }
        });
        setElevationPoints(pts);
      });
    }
  }, [updateLayers]);

  const runComplianceCheck = useCallback(() => {
    if (!currentProjectId) return;
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (complianceDebounceRef.current) clearTimeout(complianceDebounceRef.current);
    complianceDebounceRef.current = setTimeout(async () => {
      complianceDebounceRef.current = null;
      const ppm = currentScale.pixelsPerMeter;
      const toM = (p: number) => p / ppm;
      const elements = canvas
        .getObjects()
        .filter((o: any) => !o.isGrid && !o.isMeasurement && !o.isPolygonPreview)
        .map((o: any) => ({
          type: o.type,
          category: o.templateType || o.surfaceType === "building" ? "building" : undefined,
          templateType: o.templateType, surfaceType: o.surfaceType, vrdType: o.vrdType,
          left: o.left, top: o.top,
          width: o.width != null ? o.width * (o.scaleX || 1) : undefined,
          height: o.height != null ? o.height * (o.scaleY || 1) : undefined,
          height3d: o.height3d,
          area: o.width != null && o.height != null ? toM(o.width * (o.scaleX || 1)) * toM(o.height * (o.scaleY || 1)) : undefined,
        }));
      try {
        const r = await fetch("/api/compliance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: currentProjectId, elements }),
        });
        const d = await r.json();
        if (d.checks) { setComplianceChecks(d.checks); setShowCompliance(true); }
      } catch { /* ignore */ }
    }, 800);
  }, [currentProjectId, currentScale.pixelsPerMeter]);

  // Red highlight on violating objects (spec 2.8)
  const violationChecksForHighlight = complianceChecks.filter((c) => c.status === "violation");
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || viewMode !== "2d") return;
    const hasViolations = violationChecksForHighlight.length > 0;
    canvas.getObjects().forEach((obj: any) => {
      if (obj.isGrid || obj.isMeasurement) return;
      const isBuildingOrPool = obj.templateType === "house" || obj.templateType === "garage" || obj.templateType === "pool" || obj.templateType === "terrace" || obj.surfaceType === "building";
      if (!isBuildingOrPool) return;
      if (hasViolations) {
        if (obj.__originalStroke === undefined) obj.__originalStroke = obj.stroke;
        obj.set("stroke", "#ef4444");
        obj.set("strokeWidth", (obj.strokeWidth || 2) + 1);
      } else {
        if (obj.__originalStroke !== undefined) {
          obj.set("stroke", obj.__originalStroke);
          obj.set("strokeWidth", obj.strokeWidth ? Math.max(1, obj.strokeWidth - 1) : 2);
          delete obj.__originalStroke;
        }
      }
    });
    canvas.requestRenderAll();
  }, [violationChecksForHighlight.length, viewMode]);

  // Preview mode: disable selection and editing
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || viewMode !== "2d") return;
    canvas.selection = !previewMode;
    canvas.getObjects().forEach((obj: any) => {
      if (obj.isGrid || obj.isMeasurement) return;
      obj.selectable = !previewMode;
      obj.evented = !previewMode;
    });
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }, [previewMode, viewMode]);

  // Regulatory footprint overlay: dashed red outline when PLU includes overhang (spec 2.3)
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || viewMode !== "2d" || !projectData?.includeOverhangInFootprint) return;
    canvas.getObjects().forEach((obj: any) => {
      if (obj.isRegulatoryFootprint) { canvas.remove(obj); return; }
    });
    const ppm = currentScale.pixelsPerMeter;
    canvas.getObjects().forEach((obj: any) => {
      if (obj.isGrid || obj.isMeasurement || obj.isRegulatoryFootprint) return;
      const isBuilding = obj.buildingDetailId || obj.templateType === "house" || obj.templateType === "garage" || obj.templateType === "terrace";
      if (!isBuilding || obj.type !== "rect") return;
      const left = (obj.left || 0) + (obj.width || 0) * (obj.originX === "center" ? -0.5 : 0);
      const top = (obj.top || 0) + (obj.height || 0) * (obj.originY === "center" ? -0.5 : 0);
      const w = (obj.width || 0) * (obj.scaleX || 1);
      const h = (obj.height || 0) * (obj.scaleY || 1);
      const bd = obj.buildingDetailId ? buildingDetails.find((b) => b.id === obj.buildingDetailId) : null;
      const overhangM = bd?.roof?.overhang ?? (obj.templateType ? 0.5 : 0);
      const overhangPx = overhangM * ppm;
      if (overhangPx <= 0) return;
      const overlay = new fabric.Rect({
        left: left - overhangPx,
        top: top - overhangPx,
        width: w + 2 * overhangPx,
        height: h + 2 * overhangPx,
        fill: "transparent",
        stroke: "#ef4444",
        strokeWidth: 1.5,
        strokeDashArray: [6, 4],
        selectable: false,
        evented: false,
      });
      (overlay as any).isRegulatoryFootprint = true;
      (overlay as any).excludeFromExport = false;
      canvas.add(overlay);
      canvas.sendObjectToBack(overlay);
    });
    canvas.requestRenderAll();
  }, [projectData?.includeOverhangInFootprint, buildingDetails, viewMode, currentScale.pixelsPerMeter]);

  // ─── Grid ──────────────────────────────────────────────────────────────────

  const drawGrid = useCallback(
    (canvas: fabric.Canvas) => {
      const gridSize = currentScale.pixelsPerMeter;
      const w = canvasSize.width, h = canvasSize.height;

      const addGridLine = (coords: [number, number, number, number], stroke: string, sw: number) => {
        const l = new fabric.Line(coords, {
          stroke, strokeWidth: sw, selectable: false, evented: false, excludeFromExport: true,
        });
        (l as any).isGrid = true;
        canvas.add(l); canvas.sendObjectToBack(l);
      };

      for (let i = 0; i <= w / gridSize; i++) addGridLine([i * gridSize, 0, i * gridSize, h], "#1e293b", 0.5);
      for (let i = 0; i <= h / gridSize; i++) addGridLine([0, i * gridSize, w, i * gridSize], "#1e293b", 0.5);
      const major = gridSize * 5;
      for (let i = 0; i <= w / major; i++) addGridLine([i * major, 0, i * major, h], "#334155", 1);
      for (let i = 0; i <= h / major; i++) addGridLine([0, i * major, w, i * major], "#334155", 1);
    },
    [currentScale, canvasSize]
  );

  // ─── Data loading ──────────────────────────────────────────────────────────

  useEffect(() => { if (projectIdFromUrl) setCurrentProjectId(projectIdFromUrl); }, [projectIdFromUrl]);

  useEffect(() => {
    fetch("/api/projects").then((r) => r.json()).then((d) => setProjects(d.projects || [])).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (!currentProjectId) { setProjectData(null); return; }
    fetch(`/api/projects/${currentProjectId}`)
      .then((r) => r.json())
      .then((d) => {
        const p = d.project;
        if (!p) { setProjectData(null); return; }
        const ai = p.regulatoryAnalysis?.aiAnalysis as any;
        let minGreenPct = 20;
        if (typeof ai?.minGreenPct === "number") minGreenPct = ai.minGreenPct;
        else if (typeof ai?.greenSpaceRequirements === "string" && /(\d+)\s*%/.test(ai.greenSpaceRequirements)) {
          const m = ai.greenSpaceRequirements.match(/(\d+)\s*%/);
          if (m) minGreenPct = parseInt(m[1], 10);
        }
        let coords: { lat: number; lng: number } | null = null;
        try { coords = p.coordinates ? JSON.parse(p.coordinates) : null; } catch { /* ignore */ }
        setProjectData({
          parcelArea: Number(p.parcelArea) || 500,
          northAngle: Number(p.northAngle) ?? Number(p.sitePlanData?.northAngle) ?? 0,
          minGreenPct,
          maxCoverageRatio: typeof ai?.maxCoverageRatio === "number" ? ai.maxCoverageRatio : 0.5,
          includeOverhangInFootprint: ai?.includeOverhangInFootprint === true,
          coordinates: coords,
          parcelGeometry: p.parcelGeometry,
        });
      })
      .catch(() => setProjectData(null));
  }, [currentProjectId]);

  // Load existing buildings from OSM
  const loadExistingBuildings = useCallback(async () => {
    if (!projectData?.coordinates || existingBuildingsLoaded) return;
    setLoadingExistingBuildings(true);
    try {
      const { lat, lng } = projectData.coordinates;
      const r = await fetch(`/api/existing-buildings?lat=${lat}&lng=${lng}&radius=150`);
      const data = await r.json();
      if (data.buildings && data.buildings.length > 0) {
        const newBuildings = data.buildings.map((b: any) => createBuildingFromOSM(b));
        setBuildingDetails((prev) => [...prev, ...newBuildings]);
        const canvas = fabricRef.current;
        if (canvas) {
          const center = canvas.getCenterPoint();
          newBuildings.forEach((b: BuildingDetail, i: number) => {
            const wPx = metersToPixels(b.width);
            const dPx = metersToPixels(b.depth);
            const rect = new fabric.Rect({
              left: center.x - wPx / 2 + (i * 30), top: center.y - dPx / 2 + (i * 30),
              width: wPx, height: dPx,
              fill: "rgba(107, 114, 128, 0.2)", stroke: "#6b7280", strokeWidth: 2, strokeDashArray: [6, 3],
            });
            (rect as any).id = b.id;
            (rect as any).elementName = b.name;
            (rect as any).surfaceType = "building";
            (rect as any).isExistingBuilding = true;
            (rect as any).buildingDetailId = b.id;
            canvas.add(rect);
            addRectMeasurements(rect, b.id);
          });
          canvas.renderAll();
        }
      }
      setExistingBuildingsLoaded(true);
    } catch { /* ignore */ }
    setLoadingExistingBuildings(false);
  }, [projectData?.coordinates, existingBuildingsLoaded, metersToPixels, addRectMeasurements]);

  useEffect(() => {
    if (projectData?.coordinates && canvasReady && !existingBuildingsLoaded) loadExistingBuildings();
  }, [projectData?.coordinates, canvasReady, existingBuildingsLoaded, loadExistingBuildings]);

  // Auto-draw parcel boundaries from project parcelGeometry (spec 2.2)
  const drawParcelsFromProjectData = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || !projectData?.parcelGeometry || !currentProjectId) return;
    if (parcelsDrawnFromGeometryRef.current === currentProjectId) return;
    const hasParcel = canvas.getObjects().some((o: any) => o.isParcel);
    if (hasParcel) return;
    const shapes = parcelGeometryToShapes(projectData.parcelGeometry, {
      canvasWidth: canvasSize.width,
      canvasHeight: canvasSize.height,
      pixelsPerMeter: currentScale.pixelsPerMeter,
    });
    if (shapes.length === 0) return;
    shapes.forEach((shape, idx) => {
      const poly = new fabric.Polygon(shape.points, {
        left: shape.left,
        top: shape.top,
        fill: "rgba(34, 197, 94, 0.08)",
        stroke: "#22c55e",
        strokeWidth: 2,
        strokeDashArray: [4, 2],
      });
      const pid = `parcel-geo-${currentProjectId}-${idx}`;
      (poly as any).id = pid;
      (poly as any).elementName = `Land Parcel ${idx + 1}`;
      (poly as any).isParcel = true;
      (poly as any).excludeFromExport = false;
      canvas.add(poly);
      addPolygonMeasurements(poly, pid);
      canvas.sendObjectToBack(poly);
    });
    parcelsDrawnFromGeometryRef.current = currentProjectId;
    canvas.renderAll();
    updateLayers(canvas);
  }, [currentProjectId, projectData?.parcelGeometry, currentScale.pixelsPerMeter, canvasSize, addPolygonMeasurements, updateLayers]);

  // Load 3D terrain from IGN RGE ALTI® and add as elevation points
  const loadTerrainFromIgn = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!currentProjectId || !canvas) return;
    setLoadingIgnTerrain(true);
    try {
      const w = canvasSize.width;
      const h = canvasSize.height;
      const ppm = currentScale.pixelsPerMeter;
      const res = await fetch(
        `/api/projects/${currentProjectId}/terrain-from-ign?canvasWidth=${w}&canvasHeight=${h}&pixelsPerMeter=${ppm}`
      );
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to load terrain from IGN");
        return;
      }
      const points = data.points ?? [];
      if (points.length === 0) {
        alert("No elevation data for this location (RGE ALTI® may not cover it).");
        return;
      }
      const r = 8;
      const newPts: { id: string; x: number; y: number; value: number }[] = [];
      points.forEach((pt: { x: number; y: number; value: number }, i: number) => {
        const id = `ign-${Date.now()}-${i}`;
        newPts.push({ id, x: pt.x, y: pt.y, value: pt.value });
        const circle = new fabric.Circle({
          left: pt.x - r,
          top: pt.y - r,
          radius: r,
          fill: "#0ea5e9",
          stroke: "#0284c7",
          strokeWidth: 1,
        });
        (circle as any).id = id;
        (circle as any).isElevationPoint = true;
        (circle as any).elevationValue = pt.value;
        (circle as any).excludeFromExport = false;
        canvas.add(circle);
        const label = new fabric.Text(`${pt.value >= 0 ? "+" : ""}${pt.value.toFixed(2)}`, {
          left: pt.x,
          top: pt.y + r + 2,
          fontSize: 10,
          fontFamily: "monospace",
          fill: "#0ea5e9",
          originX: "center",
          originY: "top",
        });
        (label as any).isMeasurement = true;
        (label as any).parentId = id;
        canvas.add(label);
      });
      setElevationPoints((prev) => [...prev, ...newPts]);
      canvas.renderAll();
      updateLayers(canvas);
      pushUndoState();
      setIsDirty(true);
    } catch (e) {
      console.error(e);
      alert("Failed to load terrain from IGN");
    } finally {
      setLoadingIgnTerrain(false);
    }
  }, [currentProjectId, canvasSize, currentScale.pixelsPerMeter, updateLayers, pushUndoState]);

  // Load saved site plan; after load, optionally draw parcel outlines from project data
  const loadSitePlan = useCallback(
    (projectId: string, onLoaded?: () => void) => {
      parcelsDrawnFromGeometryRef.current = null;
      fetch(`/api/projects/${projectId}/site-plan`)
        .then((r) => r.json())
        .then((data) => {
          const canvas = fabricRef.current;
          if (!canvas) return;
          const buildings = Array.isArray((data.sitePlan?.building3D as any)?.buildings) ? (data.sitePlan.building3D as any).buildings : [];
          setBuildingDetails(buildings);
          if (data.sitePlan?.canvasData) {
            try {
              const json = typeof data.sitePlan.canvasData === "string" ? JSON.parse(data.sitePlan.canvasData) : data.sitePlan.canvasData;
              canvas.loadFromJSON(json, () => {
                const savedElements = Array.isArray(data.sitePlan?.elements) ? data.sitePlan.elements : [];
                const objects = canvas.getObjects().filter((o: any) => !o.isGrid && !o.isMeasurement && !o.isPolygonPreview);
                savedElements.forEach((el: any, i: number) => { if (objects[i] && el?.name) (objects[i] as any).elementName = el.name; });
                canvas.renderAll();
                updateLayers(canvas);
                onLoaded?.();
              });
            } catch {
              onLoaded?.();
            }
          } else {
            onLoaded?.();
          }
        })
        .catch(() => { onLoaded?.(); });
    },
    [updateLayers]
  );

  useEffect(() => {
    if (currentProjectId && canvasReady) {
      loadSitePlan(currentProjectId, () => {
        drawParcelsFromProjectData();
        const canvas = fabricRef.current;
        if (canvas) {
          const pts: { id: string; x: number; y: number; value: number }[] = [];
          canvas.getObjects().forEach((o: any) => {
            if (o.isElevationPoint != null && o.elevationValue != null) {
              const c = (o as fabric.Object).getCenterPoint();
              pts.push({ id: o.id || `ep-${pts.length}`, x: c.x, y: c.y, value: o.elevationValue });
            }
          });
          setElevationPoints(pts);
        }
        setIsDirty(false);
      });
    }
  }, [currentProjectId, canvasReady, loadSitePlan, drawParcelsFromProjectData]);

  // Warn when leaving the tab with unsaved changes
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  // ─── Save ──────────────────────────────────────────────────────────────────

  const saveSitePlan = useCallback(async (): Promise<boolean> => {
    if (!currentProjectId) return false;
    const canvas = fabricRef.current;
    if (!canvas) return false;
    setUnnamedElementsWarning(null);

    const drawable = canvas.getObjects().filter((o: any) => !o.isGrid && !o.isMeasurement && !o.isPolygonPreview);
    const ppm = currentScale.pixelsPerMeter;
    const toM = (p: number) => p / ppm;

    const elements = drawable.map((o: any, index: number) => {
      const name = String(o.elementName ?? o.name ?? "").trim();
      return {
        type: o.type, name: name || "Unnamed",
        category: o.templateType || o.surfaceType === "building" ? "building" : undefined,
        templateType: o.templateType, surfaceType: o.surfaceType, vrdType: o.vrdType,
        width: o.width, height: o.height,
        area: o.width != null && o.height != null ? toM(o.width * (o.scaleX || 1)) * toM(o.height * (o.scaleY || 1)) : undefined,
        _index: index,
      };
    });

    const unnamed = elements
      .map((e: any, i: number) => (e.name === "Unnamed" || !e.name ? { index: i + 1, type: e.type || "object" } : null))
      .filter(Boolean) as { index: number; type: string }[];
    if (unnamed.length > 0) { setUnnamedElementsWarning(unnamed); return false; }

    setSaving(true);
    try {
      const elementsToSend = elements.map(({ _index, ...rest }: any) => rest);
      const canvasData = canvas.toJSON();
      let projected = 0;
      elementsToSend.forEach((e: any) => { if (e.area && (e.templateType || e.surfaceType === "building")) projected += e.area; });

      let footprintMax: number | null = null;
      try {
        const projRes = await fetch(`/api/projects/${currentProjectId}`);
        const projData = await projRes.json();
        const project = projRes.ok ? projData.project : null;
        if (project?.parcelArea && project?.regulatoryAnalysis?.aiAnalysis) {
          const ces = (project.regulatoryAnalysis.aiAnalysis as any).maxCoverageRatio ?? 0.5;
          footprintMax = project.parcelArea * ces;
        }
      } catch { /* ignore */ }

      const totalOverhang = buildingDetails.reduce((sum, b) => {
        if (b.roof.type !== "flat" && b.roof.overhang > 0) return sum + (b.width + b.depth) * 2 * b.roof.overhang;
        return sum;
      }, 0);

      const res = await fetch(`/api/projects/${currentProjectId}/site-plan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canvasData, elements: elementsToSend,
          footprintProjected: projected + (projectData?.includeOverhangInFootprint ? totalOverhang : 0),
          footprintMax: footprintMax ?? 200,
          northAngle: projectData?.northAngle ?? null,
          building3D: buildingDetails.length > 0 ? { buildings: buildingDetails } : null,
        }),
      });

      if (res.ok) {
        setIsDirty(false);
        const compRes = await fetch("/api/compliance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: currentProjectId, elements: elementsToSend }),
        });
        const compData = await compRes.json();
        if (compData.checks) { setComplianceChecks(compData.checks); setShowCompliance(true); }
        setSaving(false);
        return true;
      }
    } catch (e) { console.error(e); }
    setSaving(false);
    return false;
  }, [currentProjectId, currentScale.pixelsPerMeter, projectData, buildingDetails]);

  // Auto-save every 45s when dirty so content is not lost if user navigates via menu
  useEffect(() => {
    if (!isDirty || !currentProjectId) return;
    const t = setInterval(() => saveSitePlan(), 45000);
    return () => clearInterval(t);
  }, [isDirty, currentProjectId, saveSitePlan]);

  // ─── Guided placement & preset helpers (must be before canvas mouse handlers) ─
  const addBuildingToCanvasAt = useCallback(
    (b: BuildingDetail, isExisting: boolean, centerX: number, centerY: number) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const wPx = metersToPixels(b.width), dPx = metersToPixels(b.depth);
      const rect = new fabric.Rect({
        left: centerX - wPx / 2, top: centerY - dPx / 2,
        width: wPx, height: dPx,
        fill: isExisting ? "rgba(107, 114, 128, 0.2)" : "rgba(59, 130, 246, 0.2)",
        stroke: isExisting ? "#6b7280" : "#3b82f6", strokeWidth: 2,
        ...(isExisting ? { strokeDashArray: [6, 3] } : {}),
      });
      (rect as any).id = b.id;
      (rect as any).elementName = b.name;
      (rect as any).surfaceType = "building";
      (rect as any).isExistingBuilding = isExisting;
      (rect as any).buildingDetailId = b.id;
      if (!isExisting) (rect as any).templateType = "house";
      canvas.add(rect);
      addRectMeasurements(rect, b.id);
      canvas.renderAll();
    },
    [metersToPixels, addRectMeasurements]
  );

  const buildingDetailFromPreset = useCallback((preset: ProjectPreset): BuildingDetail => {
    return createDefaultBuilding({
      name: preset.label,
      isExisting: false,
      width: preset.width,
      depth: preset.depth,
      wallHeights: preset.wallHeights,
      roof: {
        type: preset.roof.type,
        pitch: preset.roof.pitch,
        overhang: preset.roof.overhang,
        material: "Tuile terre cuite",
      },
      color: "#3b82f6",
    });
  }, []);

  const placeGuidedBuildingAt = useCallback(
    (pointerX: number, pointerY: number) => {
      if (!selectedPreset) return;
      const canvas = fabricRef.current;
      if (!canvas) return;

      if (selectedPreset.surfaceType === "green" || selectedPreset.category === "other") {
        const wPx = metersToPixels(selectedPreset.width);
        const dPx = metersToPixels(selectedPreset.depth);
        const fill =
          selectedPreset.surfaceType === "green"
            ? "rgba(34, 197, 94, 0.4)"
            : "rgba(168, 162, 158, 0.3)";
        const stroke = selectedPreset.surfaceType === "green" ? "#22c55e" : "#a8a29e";
        const rect = new fabric.Rect({
          left: pointerX - wPx / 2,
          top: pointerY - dPx / 2,
          width: wPx,
          height: dPx,
          fill,
          stroke,
          strokeWidth: 2,
        });
        const shapeId = `shape-${Date.now()}`;
        (rect as any).id = shapeId;
        (rect as any).elementName = selectedPreset.shortLabel;
        (rect as any).surfaceType = selectedPreset.surfaceType;
        canvas.add(rect);
        addRectMeasurements(rect as fabric.Rect, shapeId);
        canvas.renderAll();
        updateLayers(canvas);
        setPlacementMode(false);
        setGuidedStep(5);
        setSelectedPreset(null);
        return;
      }

      const base = buildingDetailFromPreset(selectedPreset);
      const b =
        selectedPreset.id === "custom"
          ? { ...base, width: customDimensions.width, depth: customDimensions.depth, wallHeights: { ...base.wallHeights, ground: customDimensions.groundHeight } }
          : base;
      setBuildingDetails((prev) => [...prev, b]);
      addBuildingToCanvasAt(b, false, pointerX, pointerY);
      setLastPlacedBuildingId(b.id);
      setPlacementMode(false);
      setGuidedStep(3);
      setRightTab("buildings");
    },
    [selectedPreset, customDimensions, buildingDetailFromPreset, metersToPixels, addRectMeasurements, updateLayers, addBuildingToCanvasAt]
  );

  useEffect(() => {
    placeGuidedBuildingAtRef.current = placeGuidedBuildingAt;
  }, [placeGuidedBuildingAt]);

  // ─── Canvas init ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!canvasRef.current || viewMode !== "2d") return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: canvasSize.width, height: canvasSize.height,
      backgroundColor: "#0f172a", selection: true, preserveObjectStacking: true,
    });
    fabricRef.current = canvas;
    setCanvasReady(true);

    if (showGrid) drawGrid(canvas);

    canvas.on("selection:created", (e) => { if (e.selected?.[0]) setSelectedObject(e.selected[0]); });
    canvas.on("selection:updated", (e) => { if (e.selected?.[0]) setSelectedObject(e.selected[0]); });
    canvas.on("selection:cleared", () => setSelectedObject(null));
    canvas.on("object:modified", (e) => { setIsDirty(true); if (e.target) updateObjectMeasurements(e.target); runComplianceCheck(); pushUndoState(); });
    canvas.on("object:scaling", (e) => { if (e.target) updateObjectMeasurements(e.target); runComplianceCheck(); });
    canvas.on("object:moving", (e) => { if (e.target) updateObjectMeasurements(e.target); runComplianceCheck(); });
    canvas.on("object:added", () => { setIsDirty(true); updateLayers(canvas); runComplianceCheck(); pushUndoState(); });
    canvas.on("object:removed", () => { setIsDirty(true); updateLayers(canvas); runComplianceCheck(); pushUndoState(); });

    return () => { setCanvasReady(false); canvas.dispose(); };
  }, [canvasSize, showGrid, drawGrid, updateObjectMeasurements, updateLayers, runComplianceCheck, pushUndoState, viewMode]);

  // ─── Mouse handlers ────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || viewMode !== "2d") return;

    const handleMouseMove = (e: fabric.TPointerEventInfo) => {
      const pointer = e.scenePoint || e.viewportPoint || { x: 0, y: 0 };
      setMousePos({ x: pointer.x, y: pointer.y });

      if (isDrawing && drawingStart) {
        const distance = calculateDistance(drawingStart.x, drawingStart.y, pointer.x, pointer.y);
        if (activeTool === "line" || activeTool === "measure" || activeTool === "vrd" || activeTool === "section") {
          setCurrentMeasurement(formatMeasurement(distance));
        } else if (activeTool === "rectangle") {
          const w = pixelsToMeters(Math.abs(pointer.x - drawingStart.x));
          const h = pixelsToMeters(Math.abs(pointer.y - drawingStart.y));
          setCurrentMeasurement(`${formatMeasurement(w)} x ${formatMeasurement(h)}`);
        } else if (activeTool === "circle") {
          setCurrentMeasurement(`\u00D8 ${formatMeasurement(distance * 2)}`);
        }

        if (tempShape) canvas.remove(tempShape);
        let newTemp: fabric.FabricObject | null = null;

        if (activeTool === "line" || activeTool === "measure" || activeTool === "vrd" || activeTool === "section") {
          const vrdColor = activeTool === "vrd" ? activeVrdType.color : undefined;
          const sectionColor = activeTool === "section" ? "#ec4899" : undefined;
          newTemp = new fabric.Line([drawingStart.x, drawingStart.y, pointer.x, pointer.y], {
            stroke: sectionColor || (activeTool === "measure" ? "#22c55e" : vrdColor || activeColor),
            strokeWidth: activeTool === "measure" ? 2 : strokeWidth,
            strokeDashArray: activeTool === "section" ? [12, 6] : (activeTool === "measure" || activeTool === "vrd" ? [8, 4] : undefined),
            selectable: false, evented: false,
          });
        } else if (activeTool === "rectangle") {
          newTemp = new fabric.Rect({
            left: Math.min(drawingStart.x, pointer.x), top: Math.min(drawingStart.y, pointer.y),
            width: Math.abs(pointer.x - drawingStart.x), height: Math.abs(pointer.y - drawingStart.y),
            fill: "transparent", stroke: activeColor, strokeWidth, selectable: false, evented: false,
          });
        } else if (activeTool === "circle") {
          const r = Math.sqrt(Math.pow(pointer.x - drawingStart.x, 2) + Math.pow(pointer.y - drawingStart.y, 2));
          newTemp = new fabric.Circle({
            left: drawingStart.x - r, top: drawingStart.y - r, radius: r,
            fill: "transparent", stroke: activeColor, strokeWidth, selectable: false, evented: false,
          });
        }

        if (newTemp) { canvas.add(newTemp); setTempShape(newTemp); }
      }
    };

    const handleMouseDown = (e: fabric.TPointerEventInfo) => {
      const pointer = e.scenePoint || e.viewportPoint || { x: 0, y: 0 };

      if (placementMode && selectedPreset) {
        placeGuidedBuildingAtRef.current(pointer.x, pointer.y);
        return;
      }

      if (activeTool === "select" || activeTool === "pan") return;
      if (activeTool === "elevation") {
        const raw = window.prompt("Elevation (m), e.g. 0.00 or +1.50 or -0.20:", "0.00");
        if (raw == null) return;
        const value = parseFloat(raw.replace(",", ".")) || 0;
        const id = `elev-${Date.now()}`;
        setElevationPoints((prev) => [...prev, { id, x: pointer.x, y: pointer.y, value }]);
        const r = 8;
        const circle = new fabric.Circle({
          left: pointer.x - r, top: pointer.y - r, radius: r,
          fill: "#0ea5e9", stroke: "#0284c7", strokeWidth: 1,
        });
        (circle as any).id = id;
        (circle as any).isElevationPoint = true;
        (circle as any).elevationValue = value;
        (circle as any).excludeFromExport = false;
        canvas.add(circle);
        const label = new fabric.Text(`${value >= 0 ? "+" : ""}${value.toFixed(2)}`, {
          left: pointer.x, top: pointer.y + r + 2, fontSize: 10, fontFamily: "monospace",
          fill: "#0ea5e9", originX: "center", originY: "top",
        });
        (label as any).isMeasurement = true;
        (label as any).parentId = id;
        canvas.add(label);
        canvas.renderAll();
        updateLayers(canvas);
        pushUndoState();
        return;
      }
      if (activeTool === "vegetation") {
        const treeType = window.prompt("Tree type (deciduous / coniferous / shrub):", "deciduous") || "deciduous";
        const treeId = `tree-${Date.now()}`;
        const r = 12;
        const colors: Record<string, string> = { deciduous: "#22c55e", coniferous: "#15803d", shrub: "#65a30d" };
        const fillColors: Record<string, string> = { deciduous: "rgba(34,197,94,0.5)", coniferous: "rgba(21,128,61,0.5)", shrub: "rgba(101,163,13,0.5)" };
        const treeColor = colors[treeType] || "#22c55e";
        const treeFill = fillColors[treeType] || "rgba(34,197,94,0.5)";
        const circle = new fabric.Circle({
          left: pointer.x - r, top: pointer.y - r, radius: r,
          fill: treeFill, stroke: treeColor, strokeWidth: 2,
        });
        (circle as any).id = treeId;
        (circle as any).elementName = `${treeType.charAt(0).toUpperCase() + treeType.slice(1)} tree`;
        (circle as any).isVegetation = true;
        (circle as any).vegetationType = treeType;
        (circle as any).excludeFromExport = false;
        canvas.add(circle);
        const label = new fabric.Text(treeType.charAt(0).toUpperCase() + treeType.slice(1), {
          left: pointer.x, top: pointer.y + r + 4, fontSize: 9, fontFamily: "monospace",
          fill: treeColor, originX: "center", originY: "top", selectable: false, evented: false,
        });
        (label as any).isMeasurement = true;
        (label as any).parentId = treeId;
        canvas.add(label);
        canvas.renderAll();
        updateLayers(canvas);
        pushUndoState();
        return;
      }
      if (activeTool === "viewpoint") {
        const vpName = window.prompt("Viewpoint name (e.g. PC7, PC8):", "PC7") || "PC7";
        const vpId = `vp-${Date.now()}`;
        // Camera icon: small square
        const camSize = 14;
        const cam = new fabric.Rect({
          left: pointer.x - camSize / 2, top: pointer.y - camSize / 2,
          width: camSize, height: camSize,
          fill: "#6366f1", stroke: "#4f46e5", strokeWidth: 1.5, rx: 3, ry: 3,
        });
        (cam as any).id = vpId;
        (cam as any).elementName = vpName;
        (cam as any).isViewpoint = true;
        (cam as any).excludeFromExport = false;
        canvas.add(cam);
        // Direction arrow
        const arrowLen = 40;
        const arrow = new fabric.Line([pointer.x, pointer.y, pointer.x + arrowLen, pointer.y], {
          stroke: "#6366f1", strokeWidth: 2.5,
        });
        (arrow as any).isMeasurement = true;
        (arrow as any).parentId = vpId;
        canvas.add(arrow);
        // Arrowhead
        const ah = new fabric.Polygon([
          { x: pointer.x + arrowLen, y: pointer.y },
          { x: pointer.x + arrowLen - 8, y: pointer.y - 5 },
          { x: pointer.x + arrowLen - 8, y: pointer.y + 5 },
        ], { fill: "#6366f1", selectable: false, evented: false });
        (ah as any).isMeasurement = true;
        (ah as any).parentId = vpId;
        canvas.add(ah);
        // Label
        const vpLabel = new fabric.Text(vpName, {
          left: pointer.x, top: pointer.y - camSize - 10, fontSize: 10, fontFamily: "monospace",
          fill: "#6366f1", fontWeight: "bold", originX: "center", selectable: false, evented: false,
        });
        (vpLabel as any).isMeasurement = true;
        (vpLabel as any).parentId = vpId;
        canvas.add(vpLabel);
        canvas.renderAll();
        updateLayers(canvas);
        pushUndoState();
        return;
      }
      if (activeTool === "polygon" || activeTool === "parcel") {
        setPolygonPoints((prev) => [...prev, { x: pointer.x, y: pointer.y }]);
        return;
      }
      setIsDrawing(true);
      setDrawingStart({ x: pointer.x, y: pointer.y });
    };

    const handleMouseUp = (e: fabric.TPointerEventInfo) => {
      if (!isDrawing || !drawingStart) return;
      const pointer = e.scenePoint || e.viewportPoint || { x: 0, y: 0 };
      if (tempShape) { canvas.remove(tempShape); setTempShape(null); }

      const shapeId = `shape-${Date.now()}`;

      if (activeTool === "line") {
        const line = new fabric.Line([drawingStart.x, drawingStart.y, pointer.x, pointer.y], {
          stroke: activeColor, strokeWidth,
        });
        (line as any).id = shapeId;
        (line as any).elementName = "Line";
        canvas.add(line);
        addLineMeasurement(line, shapeId);
      } else if (activeTool === "section") {
        const line = new fabric.Line([drawingStart.x, drawingStart.y, pointer.x, pointer.y], {
          stroke: "#ec4899", strokeWidth: 2.5, strokeDashArray: [12, 6],
        });
        (line as any).id = shapeId;
        (line as any).elementName = "Section line";
        (line as any).isSectionLine = true;
        canvas.add(line);
        addLineMeasurement(line, shapeId);

        // Archicad-style section markers at endpoints
        const dx = pointer.x - drawingStart.x;
        const dy = pointer.y - drawingStart.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 10) {
          const nx = -dy / len; // normal direction (viewing direction)
          const ny = dx / len;
          const ms = 10; // marker size

          // Start marker (A) - triangle pointing in viewing direction
          const mkA = new fabric.Polygon([
            { x: drawingStart.x + nx * ms, y: drawingStart.y + ny * ms },
            { x: drawingStart.x - nx * ms * 0.3 - (dx / len) * ms * 0.5, y: drawingStart.y - ny * ms * 0.3 - (dy / len) * ms * 0.5 },
            { x: drawingStart.x - nx * ms * 0.3 + (dx / len) * ms * 0.5, y: drawingStart.y - ny * ms * 0.3 + (dy / len) * ms * 0.5 },
          ], { fill: "#ec4899", selectable: false, evented: false });
          (mkA as any).isMeasurement = true;
          (mkA as any).parentId = shapeId;
          canvas.add(mkA);

          // End marker (B) - triangle
          const mkB = new fabric.Polygon([
            { x: pointer.x + nx * ms, y: pointer.y + ny * ms },
            { x: pointer.x - nx * ms * 0.3 - (dx / len) * ms * 0.5, y: pointer.y - ny * ms * 0.3 - (dy / len) * ms * 0.5 },
            { x: pointer.x - nx * ms * 0.3 + (dx / len) * ms * 0.5, y: pointer.y - ny * ms * 0.3 + (dy / len) * ms * 0.5 },
          ], { fill: "#ec4899", selectable: false, evented: false });
          (mkB as any).isMeasurement = true;
          (mkB as any).parentId = shapeId;
          canvas.add(mkB);

          // Labels A and B
          const lblA = new fabric.Text("A", {
            left: drawingStart.x + nx * ms * 1.5, top: drawingStart.y + ny * ms * 1.5,
            fontSize: 12, fontFamily: "sans-serif", fontWeight: "bold", fill: "#ec4899",
            originX: "center", originY: "center", selectable: false, evented: false,
          });
          (lblA as any).isMeasurement = true;
          (lblA as any).parentId = shapeId;
          canvas.add(lblA);

          const lblB = new fabric.Text("B", {
            left: pointer.x + nx * ms * 1.5, top: pointer.y + ny * ms * 1.5,
            fontSize: 12, fontFamily: "sans-serif", fontWeight: "bold", fill: "#ec4899",
            originX: "center", originY: "center", selectable: false, evented: false,
          });
          (lblB as any).isMeasurement = true;
          (lblB as any).parentId = shapeId;
          canvas.add(lblB);
        }
      } else if (activeTool === "vrd") {
        const line = new fabric.Line([drawingStart.x, drawingStart.y, pointer.x, pointer.y], {
          stroke: activeVrdType.color, strokeWidth, strokeDashArray: [8, 4],
        });
        (line as any).id = shapeId;
        (line as any).isVrd = true;
        (line as any).vrdType = activeVrdType.id;
        (line as any).elementName = activeVrdType.label;
        canvas.add(line);
        addLineMeasurement(line, shapeId);
      } else if (activeTool === "measure") {
        const line = new fabric.Line([drawingStart.x, drawingStart.y, pointer.x, pointer.y], {
          stroke: "#22c55e", strokeWidth: 2, strokeDashArray: [5, 5],
        });
        (line as any).id = shapeId;
        (line as any).elementName = "Measure";
        canvas.add(line);
        addLineMeasurement(line, shapeId);
      } else if (activeTool === "rectangle") {
        const left = Math.min(drawingStart.x, pointer.x), top = Math.min(drawingStart.y, pointer.y);
        const w = Math.abs(pointer.x - drawingStart.x), h = Math.abs(pointer.y - drawingStart.y);
        if (w > 5 && h > 5) {
          const rect = new fabric.Rect({
            left, top, width: w, height: h,
            fill: activeSurfaceType.fill, stroke: activeSurfaceType.color, strokeWidth,
          });
          (rect as any).id = shapeId;
          (rect as any).surfaceType = activeSurfaceType.id;
          (rect as any).elementName = activeSurfaceType.label || "Building";
          canvas.add(rect);
          addRectMeasurements(rect, shapeId);
        }
      } else if (activeTool === "circle") {
        const r = Math.sqrt(Math.pow(pointer.x - drawingStart.x, 2) + Math.pow(pointer.y - drawingStart.y, 2));
        if (r > 5) {
          const circle = new fabric.Circle({
            left: drawingStart.x - r, top: drawingStart.y - r, radius: r,
            fill: activeSurfaceType.fill, stroke: activeSurfaceType.color, strokeWidth,
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
    return () => { canvas.off("mouse:move", handleMouseMove); canvas.off("mouse:down", handleMouseDown); canvas.off("mouse:up", handleMouseUp); };
  }, [activeTool, isDrawing, drawingStart, tempShape, activeColor, strokeWidth, activeVrdType, activeSurfaceType, calculateDistance, formatMeasurement, pixelsToMeters, addLineMeasurement, addRectMeasurements, addCircleMeasurements, viewMode, placementMode, selectedPreset, updateLayers, pushUndoState]);

  // ─── Polygon completion ────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || viewMode !== "2d") return;

    const handleDoubleClick = () => {
      if ((activeTool === "polygon" || activeTool === "parcel") && polygonPoints.length >= 3) {
        const shapeId = `parcel-${Date.now()}`;
        const cx = polygonPoints.reduce((s, p) => s + p.x, 0) / polygonPoints.length;
        const cy = polygonPoints.reduce((s, p) => s + p.y, 0) / polygonPoints.length;
        const normalized = polygonPoints.map((p) => ({ x: p.x - cx, y: p.y - cy }));

        const polygon = new fabric.Polygon(normalized, {
          left: cx, top: cy,
          fill: activeTool === "parcel" ? "rgba(34, 197, 94, 0.1)" : activeSurfaceType.fill,
          stroke: activeTool === "parcel" ? "#22c55e" : activeSurfaceType.color,
          strokeWidth: activeTool === "parcel" ? 3 : strokeWidth,
          originX: "center", originY: "center",
        });
        (polygon as any).id = shapeId;
        (polygon as any).isParcel = activeTool === "parcel";
        (polygon as any).elementName = activeTool === "parcel" ? "Land Parcel" : (activeSurfaceType.label || "Polygon");
        if (activeTool === "polygon") (polygon as any).surfaceType = activeSurfaceType.id;
        canvas.add(polygon);
        addPolygonMeasurements(polygon, shapeId);
        canvas.renderAll();
        setPolygonPoints([]);
      }
    };

    canvas.on("mouse:dblclick", handleDoubleClick);
    return () => { canvas.off("mouse:dblclick", handleDoubleClick); };
  }, [activeTool, polygonPoints, activeColor, strokeWidth, activeSurfaceType, addPolygonMeasurements, viewMode]);

  // Polygon preview
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || viewMode !== "2d") return;

    const oldPreview = canvas.getObjects().filter((obj: any) => obj.isPolygonPreview);
    oldPreview.forEach((p) => canvas.remove(p));

    if ((activeTool === "polygon" || activeTool === "parcel") && polygonPoints.length > 0) {
      polygonPoints.forEach((point, index) => {
        const c = new fabric.Circle({
          left: point.x - 5, top: point.y - 5, radius: 5,
          fill: activeTool === "parcel" ? "#22c55e" : activeColor,
          selectable: false, evented: false,
        });
        (c as any).isPolygonPreview = true;
        canvas.add(c);

        if (index > 0) {
          const prev = polygonPoints[index - 1];
          const l = new fabric.Line([prev.x, prev.y, point.x, point.y], {
            stroke: activeTool === "parcel" ? "#22c55e" : activeColor,
            strokeWidth: 2, strokeDashArray: [5, 5], selectable: false, evented: false,
          });
          (l as any).isPolygonPreview = true;
          canvas.add(l);
          const dist = calculateDistance(prev.x, prev.y, point.x, point.y);
          const mx = (prev.x + point.x) / 2, my = (prev.y + point.y) / 2;
          const t = new fabric.Text(formatMeasurement(dist), {
            left: mx, top: my - 15, fontSize: 11, fontFamily: "monospace",
            fill: "#0f172a", backgroundColor: "#fbbf24", padding: 2, originX: "center",
            selectable: false, evented: false,
          });
          (t as any).isPolygonPreview = true;
          canvas.add(t);
        }
      });

      const last = polygonPoints[polygonPoints.length - 1];
      const l = new fabric.Line([last.x, last.y, mousePos.x, mousePos.y], {
        stroke: activeTool === "parcel" ? "#22c55e" : activeColor,
        strokeWidth: 1, strokeDashArray: [3, 3], selectable: false, evented: false,
      });
      (l as any).isPolygonPreview = true;
      canvas.add(l);
      const dist = calculateDistance(last.x, last.y, mousePos.x, mousePos.y);
      setCurrentMeasurement(formatMeasurement(dist));
      canvas.renderAll();
    }
  }, [polygonPoints, mousePos, activeTool, activeColor, calculateDistance, formatMeasurement, viewMode]);

  // ─── Actions ───────────────────────────────────────────────────────────────

  const handleToolSelect = (tool: Tool) => {
    setActiveTool(tool); setPolygonPoints([]); setCurrentMeasurement("");
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.isDrawingMode = false;
    canvas.selection = tool === "select";
  };

  const handleZoom = (delta: number) => {
    const nz = Math.max(25, Math.min(400, zoom + delta));
    setZoom(nz);
    const canvas = fabricRef.current;
    if (canvas) { canvas.setZoom(nz / 100); canvas.renderAll(); }
  };

  const handleDelete = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.getActiveObjects().forEach((obj) => { const id = (obj as any).id; if (id) removeMeasurements(id); canvas.remove(obj); });
    canvas.discardActiveObject(); canvas.renderAll();
  };

  const handleClearAll = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.getObjects().filter((o: any) => !o.isGrid).forEach((o) => canvas.remove(o));
    measurementLabelsRef.current.clear();
    canvas.renderAll();
  };

  const addTemplate = (templateId: string) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const template = templatesList.find((t) => t.id === templateId);
    if (!template) return;
    if (templateId === "access") {
      addAccessPoint();
      return;
    }
    const center = canvas.getCenterPoint();
    const shapeId = `${templateId}-${Date.now()}`;
    const wPx = metersToPixels(template.width), hPx = metersToPixels(template.height);
    const rect = new fabric.Rect({
      left: center.x - wPx / 2, top: center.y - hPx / 2,
      width: wPx, height: hPx,
      fill: template.color + "20", stroke: template.color, strokeWidth: 2,
      ...(templateId === "parking" ? { strokeDashArray: [6, 3] } : {}),
    });
    (rect as any).id = shapeId;
    (rect as any).templateType = templateId;
    (rect as any).elementName = template.label;
    canvas.add(rect);
    if (templateId === "parking") {
      const l = center.x - wPx / 2, t = center.y - hPx / 2;
      const carW = wPx * 0.5, carH = hPx * 0.35;
      const carLeft = l + wPx * 0.25, carTop = t + hPx * 0.32;
      const carBody = new fabric.Rect({
        left: carLeft, top: carTop, width: carW, height: carH,
        fill: "#374151", stroke: "#4b5563", strokeWidth: 1, rx: 2,
        selectable: false, evented: false,
      });
      (carBody as any).isMeasurement = true;
      (carBody as any).parentId = shapeId;
      canvas.add(carBody);
      const wheelR = Math.min(carW, carH) * 0.15;
      [0, 1].forEach((i) => {
        const wheel = new fabric.Circle({
          left: carLeft + (i === 0 ? wheelR : carW - wheelR * 2), top: carTop + carH - wheelR,
          radius: wheelR, fill: "#1f2937", stroke: "#4b5563",
          selectable: false, evented: false,
        });
        (wheel as any).isMeasurement = true;
        (wheel as any).parentId = shapeId;
        canvas.add(wheel);
      });
    }
    const label = new fabric.Text(template.label, {
      left: center.x, top: center.y, fontSize: 14, fontFamily: "sans-serif",
      fill: template.color, originX: "center", originY: "center",
      selectable: false, evented: false,
    });
    (label as any).isMeasurement = true;
    (label as any).parentId = shapeId;
    canvas.add(label);
    addRectMeasurements(rect, shapeId);
    canvas.setActiveObject(rect);
    canvas.renderAll();
  };

  /** Site access: triangle symbol + "Access" label (mandatory tool per spec) */
  const addAccessPoint = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const center = canvas.getCenterPoint();
    const shapeId = `access-${Date.now()}`;
    const size = metersToPixels(1.2);
    const points = [
      { x: 0, y: -size },
      { x: -size * 0.7, y: size * 0.6 },
      { x: size * 0.7, y: size * 0.6 },
    ];
    const triangle = new fabric.Polygon(points, {
      left: center.x - size * 0.5, top: center.y - size * 0.5,
      fill: "#f59e0b", stroke: "#d97706", strokeWidth: 1.5,
    });
    (triangle as any).id = shapeId;
    (triangle as any).templateType = "access";
    (triangle as any).elementName = "Access";
    canvas.add(triangle);
    const label = new fabric.Text("Access", {
      left: center.x, top: center.y + size * 0.9, fontSize: 12, fontFamily: "sans-serif",
      fill: "#f59e0b", originX: "center", originY: "top", fontWeight: "bold",
    });
    (label as any).isMeasurement = true;
    (label as any).parentId = shapeId;
    canvas.add(label);
    canvas.setActiveObject(triangle);
    canvas.renderAll();
    updateLayers(canvas);
  };

  const addNorthArrow = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const arrowId = `compass-${Date.now()}`;
    const northAngle = projectData?.northAngle ?? 0;
    const s = metersToPixels(2);
    // Position compass at top-right of the canvas
    const cx = canvasSize.width - s * 2;
    const cy = s * 2;

    // North arrow (main pointer)
    const points = [
      { x: 0, y: -s }, { x: -s * 0.3, y: s * 0.15 },
      { x: 0, y: -s * 0.1 }, { x: s * 0.3, y: s * 0.15 },
    ];
    const arrow = new fabric.Polygon(points, {
      left: cx, top: cy, originX: "center", originY: "center",
      fill: "#1e293b", stroke: "#64748b", strokeWidth: 1,
    });
    (arrow as any).id = arrowId;
    (arrow as any).elementName = "Compass";
    arrow.set({ angle: -northAngle });
    canvas.add(arrow);

    // Compass circle
    const compassCircle = new fabric.Circle({
      left: cx - s * 0.9, top: cy - s * 0.9,
      radius: s * 0.9, fill: "transparent", stroke: "#94a3b8", strokeWidth: 1,
      selectable: false, evented: false,
    });
    (compassCircle as any).isMeasurement = true;
    (compassCircle as any).parentId = arrowId;
    canvas.add(compassCircle);

    // Cardinal labels N/S/E/W
    const labels = [
      { text: "N", x: cx, y: cy - s * 1.15, weight: "bold" as const },
      { text: "S", x: cx, y: cy + s * 1.0, weight: "normal" as const },
      { text: "E", x: cx + s * 1.05, y: cy - 4, weight: "normal" as const },
      { text: "W", x: cx - s * 1.1, y: cy - 4, weight: "normal" as const },
    ];
    labels.forEach(({ text, x, y, weight }) => {
      const lbl = new fabric.Text(text, {
        left: x, top: y, fontSize: text === "N" ? 14 : 10, fontFamily: "sans-serif",
        fontWeight: weight, fill: text === "N" ? "#1e293b" : "#94a3b8",
        originX: "center", originY: "center",
        selectable: false, evented: false,
      });
      (lbl as any).isMeasurement = true;
      (lbl as any).parentId = arrowId;
      canvas.add(lbl);
    });

    canvas.renderAll();
  };

  /** Auto-add dimension lines from each building to nearest parcel boundary edges */
  const autoAddBoundaryDimensions = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const ppm = currentScale.pixelsPerMeter;

    // Find parcel polygon(s)
    const parcels = canvas.getObjects().filter((o: any) => o.isParcel);
    if (parcels.length === 0) { alert("No parcel boundary found. Draw a parcel first."); return; }

    // Find buildings
    const buildings = canvas.getObjects().filter((o: any) =>
      (o as any).templateType || (o as any).surfaceType === "building"
    );
    if (buildings.length === 0) { alert("No buildings found on the plan."); return; }

    // Remove existing boundary dimensions
    canvas.getObjects().filter((o: any) => o.isBoundaryDimension).forEach(o => canvas.remove(o));

    parcels.forEach((parcel: any) => {
      // Get parcel edge segments
      const points = parcel.points || [];
      if (points.length < 3) return;
      const mat = parcel.calcTransformMatrix();
      const worldPts = points.map((p: { x: number; y: number }) => {
        const pt = fabric.util.transformPoint(new fabric.Point(p.x, p.y), mat);
        return { x: pt.x, y: pt.y };
      });

      // ── Classify each parcel edge into front/rear/side-left/side-right ──
      // Compute parcel centroid
      let pcx = 0, pcy = 0;
      worldPts.forEach((p: { x: number; y: number }) => { pcx += p.x; pcy += p.y; });
      pcx /= worldPts.length; pcy /= worldPts.length;

      // Determine "front" direction — bottom of canvas is usually the road/street side
      // We use the downward direction (positive Y) as the default road direction
      const roadAngle = Math.PI / 2; // pointing down = road

      interface EdgeInfo {
        idx: number;
        a: { x: number; y: number };
        b: { x: number; y: number };
        midX: number;
        midY: number;
        angle: number; // bearing from centroid to edge midpoint
        category: "front" | "rear" | "side-left" | "side-right";
      }

      const edges: EdgeInfo[] = [];
      for (let i = 0; i < worldPts.length; i++) {
        const a = worldPts[i];
        const b = worldPts[(i + 1) % worldPts.length];
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const angle = Math.atan2(midY - pcy, midX - pcx); // bearing from centroid to edge mid

        // Compare with road direction to classify
        let diff = angle - roadAngle;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        const absDiff = Math.abs(diff);

        let category: EdgeInfo["category"];
        if (absDiff < Math.PI / 4) category = "front";
        else if (absDiff > 3 * Math.PI / 4) category = "rear";
        else category = diff > 0 ? "side-right" : "side-left";

        edges.push({ idx: i, a, b, midX, midY, angle, category });
      }

      // Colors for each boundary type
      const categoryStyles: Record<string, { color: string; label: string }> = {
        "front": { color: "#f97316", label: "Front" },
        "rear": { color: "#8b5cf6", label: "Rear" },
        "side-left": { color: "#06b6d4", label: "Left" },
        "side-right": { color: "#ec4899", label: "Right" },
      };

      buildings.forEach((bldg: any) => {
        const bc = (bldg as fabric.Object).getCenterPoint();
        // Get building bounding box for edge-to-edge measurement
        const br = (bldg as fabric.Object).getBoundingRect();
        const bldgCorners = [
          { x: br.left, y: br.top },
          { x: br.left + br.width, y: br.top },
          { x: br.left + br.width, y: br.top + br.height },
          { x: br.left, y: br.top + br.height },
        ];

        // For each boundary category, find the closest edge and distance from building
        const categoriesUsed = new Set<string>();

        // Group edges by category, find closest edge per category
        const byCategory: Record<string, { dist: number; projPt: { x: number; y: number }; bldgPt: { x: number; y: number } }> = {};

        edges.forEach((edge) => {
          // Find closest point from any building corner/center to this edge
          const pointsToCheck = [...bldgCorners, bc];
          let bestDist = Infinity;
          let bestProj = { x: 0, y: 0 };
          let bestBldgPt: { x: number; y: number } = { x: bc.x, y: bc.y };

          for (const pt of pointsToCheck) {
            const dx = edge.b.x - edge.a.x, dy = edge.b.y - edge.a.y;
            const lenSq = dx * dx + dy * dy;
            let t = lenSq > 0 ? ((pt.x - edge.a.x) * dx + (pt.y - edge.a.y) * dy) / lenSq : 0;
            t = Math.max(0, Math.min(1, t));
            const proj = { x: edge.a.x + t * dx, y: edge.a.y + t * dy };
            const d = Math.sqrt((pt.x - proj.x) ** 2 + (pt.y - proj.y) ** 2);
            if (d < bestDist) {
              bestDist = d;
              bestProj = proj;
              bestBldgPt = pt;
            }
          }

          const cat = edge.category;
          if (!byCategory[cat] || bestDist < byCategory[cat].dist) {
            byCategory[cat] = { dist: bestDist, projPt: bestProj, bldgPt: bestBldgPt };
          }
        });

        // Draw dimension lines for ALL 4 boundary categories
        Object.entries(byCategory).forEach(([cat, info]) => {
          const distM = info.dist / ppm;
          const style = categoryStyles[cat] || categoryStyles["front"];
          const dimId = `bdim-${cat}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

          // Dimension line from building edge to parcel boundary
          const dimLine = new fabric.Line(
            [info.bldgPt.x, info.bldgPt.y, info.projPt.x, info.projPt.y],
            {
              stroke: style.color, strokeWidth: 1.5, strokeDashArray: [4, 3],
              selectable: false, evented: false,
            }
          );
          (dimLine as any).isBoundaryDimension = true;
          (dimLine as any).isMeasurement = true;
          (dimLine as any).parentId = dimId;
          (dimLine as any).boundaryCategory = cat;
          canvas.add(dimLine);

          // Small endpoint circles
          [info.bldgPt, info.projPt].forEach((pt) => {
            const dot = new fabric.Circle({
              left: pt.x - 2, top: pt.y - 2, radius: 2,
              fill: style.color, stroke: "transparent",
              selectable: false, evented: false,
            });
            (dot as any).isBoundaryDimension = true;
            (dot as any).isMeasurement = true;
            (dot as any).parentId = dimId;
            canvas.add(dot);
          });

          // Label with category and distance
          const mx = (info.bldgPt.x + info.projPt.x) / 2;
          const my = (info.bldgPt.y + info.projPt.y) / 2;

          // Check against PLU setback rules if available
          const pluSetbacks = projectData?.pluSetbacks || {};
          const setbackRule = (pluSetbacks as Record<string, number>)[cat] || 0;
          const isCompliant = setbackRule <= 0 || distM >= setbackRule;
          const complianceTag = setbackRule > 0
            ? (isCompliant ? " ✓" : ` ✗ (min ${setbackRule}m)`)
            : "";

          const label = new fabric.Text(
            `${style.label}: ${distM.toFixed(2)}m${complianceTag}`,
            {
              left: mx, top: my - 12, fontSize: 10, fontFamily: "monospace",
              fill: isCompliant ? style.color : "#ef4444",
              backgroundColor: "rgba(255,255,255,0.92)", padding: 3,
              originX: "center", originY: "bottom",
              selectable: false, evented: false,
            }
          );
          (label as any).isBoundaryDimension = true;
          (label as any).isMeasurement = true;
          (label as any).parentId = dimId;
          canvas.add(label);
        });
      });
    });

    canvas.renderAll();
  };

  const addBuildingToCanvas = (b: BuildingDetail, isExisting: boolean) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const center = canvas.getCenterPoint();
    addBuildingToCanvasAt(b, isExisting, center.x, center.y);
  };

  const addExistingBuilding = () => {
    const b = createDefaultBuilding({ isExisting: true, name: "Existing Building", color: "#6b7280" });
    setBuildingDetails((prev) => [...prev, b]);
    addBuildingToCanvas(b, true);
    setRightTab("buildings");
  };

  const addNewBuilding = () => {
    const b = createDefaultBuilding({ name: "New Construction", color: "#3b82f6" });
    setBuildingDetails((prev) => [...prev, b]);
    addBuildingToCanvas(b, false);
    setRightTab("buildings");
  };

  // ─── Computed values ───────────────────────────────────────────────────────

  const BUILDING_TEMPLATES = ["house", "garage", "terrace", "pool"];

  const computeFootprintData = (): FootprintData => {
    const canvas = fabricRef.current;
    const ppm = currentScale.pixelsPerMeter;
    const pToM = (p: number) => p / ppm;
    let existingFootprint = 0, projectedFootprint = 0;
    const surfacesByType: Record<string, number> = {
      natural_green: 0, gravel: 0, evergreen_system: 0, pavers_pedestals: 0,
      drainage_pavement: 0, vegetated_flat_roof: 0, asphalt: 0, bitumen: 0,
      concrete: 0, standard_roof: 0, building: 0,
    };

    if (canvas) {
      canvas.getObjects().forEach((obj: any) => {
        if (obj.isGrid || obj.isMeasurement) return;
        let area = 0;
        if (obj.type === "rect" && obj.width && obj.height) {
          area = pToM(obj.width * (obj.scaleX || 1)) * pToM(obj.height * (obj.scaleY || 1));
        } else if (obj.type === "polygon" && obj.points) {
          const pts = obj.points;
          let a = 0;
          for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; a += pts[i].x * pts[j].y - pts[j].x * pts[i].y; }
          area = Math.abs(a) / 2 / (ppm * ppm);
        }
        const rawSt = obj.surfaceType || "building";
        const st = SURFACE_ID_COMPAT[rawSt] ?? rawSt;
        if (st in surfacesByType) surfacesByType[st] += area;
        else surfacesByType[st] = area; // handle unknown types
        if ((obj.templateType && BUILDING_TEMPLATES.includes(obj.templateType)) || st === "building") {
          if (obj.isExistingBuilding) existingFootprint += area;
          else projectedFootprint += area;
        }
      });
    }

    const totalOverhang = buildingDetails.reduce((sum, b) => {
      if (b.roof.type !== "flat" && b.roof.overhang > 0) return sum + (b.width + b.depth) * 2 * b.roof.overhang;
      return sum;
    }, 0);

    const parcelArea = projectData?.parcelArea ?? 500;
    const maxCov = projectData?.maxCoverageRatio ?? 0.5;

    return {
      existingFootprint, projectedFootprint,
      maxFootprint: parcelArea * maxCov,
      roofOverhang: totalOverhang,
      includeOverhangInFootprint: projectData?.includeOverhangInFootprint ?? false,
      totalSiteArea: parcelArea,
      greenSpaceArea: surfacesByType.natural_green || 0,
      requiredGreenPct: projectData?.minGreenPct ?? 20,
      maxCoverageRatio: maxCov,
      surfacesByType,
    };
  };

  const footprintData = computeFootprintData();
  const greenPct = footprintData.totalSiteArea > 0 ? (footprintData.greenSpaceArea / footprintData.totalSiteArea) * 100 : 0;
  const hasContent = footprintData.projectedFootprint > 0 || Object.values(footprintData.surfacesByType).some((v) => v > 0);

  const hasUnnamedElements = (() => {
    const canvas = fabricRef.current;
    if (!canvas) return true;
    return canvas.getObjects().filter((o: any) => !o.isGrid && !o.isMeasurement && !o.isPolygonPreview).some((o: any) => {
      const name = String(o.elementName ?? o.name ?? "").trim();
      return !name || name === "Unnamed";
    });
  })();

  const editorCanProceed = !!currentProjectId && !hasUnnamedElements && greenPct >= (projectData?.minGreenPct ?? 20) && hasContent;

  // ─── Render ────────────────────────────────────────────────────────────────

  const violationChecks = complianceChecks.filter((c) => c.status === "violation");

  return (
    <div className={cn("bg-white flex flex-col overflow-hidden", isFullScreen ? "fixed inset-0 z-50 h-screen" : "h-screen")}>
      {/* Real-time PLU violation banner (spec 2.8) */}
      {violationChecks.length > 0 && (
        <div className="px-4 py-2.5 bg-red-50 border-b border-red-500/40 flex items-center gap-3 text-sm text-red-200 flex-wrap">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span className="font-medium">PLU alert:</span>
          <span>{violationChecks[0].message}</span>
          {violationChecks.length > 1 && (
            <span className="text-red-600/90">+{violationChecks.length - 1} more</span>
          )}
          <button onClick={() => setShowCompliance(true)} className="ml-auto px-2 py-1 rounded bg-red-500/30 hover:bg-red-500/50 text-xs font-medium">View all</button>
        </div>
      )}

      {/* Top Bar */}
      <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {(() => {
            const prevStep = getPrevStep(pathname, currentProjectId);
            return (
              <button
                type="button"
                onClick={async () => {
                  if (isDirty && currentProjectId) await saveSitePlan();
                  router.push(prevStep ? prevStep.href : "/projects");
                }}
                className="flex items-center gap-2 text-slate-400 hover:text-slate-900 transition-colors shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="text-sm font-medium hidden sm:block">
                  {prevStep ? `Back to ${prevStep.label}` : "Back"}
                </span>
              </button>
            );
          })()}
          <div className="h-6 w-px bg-white/10 shrink-0" />
          <h1 className="text-lg font-semibold text-slate-900 truncate">
            Site Plan / Plan de Masse
          </h1>
          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-600 text-xs font-medium shrink-0">
            {currentScale.label}
          </span>

          {/* 2D / 3D Toggle */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 shrink-0">
            <button
              onClick={() => { setViewMode("2d"); setSelectedBuildingId3d(null); }}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1",
                viewMode === "2d" ? "bg-blue-500 text-slate-900 shadow" : "text-slate-400 hover:text-slate-900"
              )}
            >
              <LayoutGrid className="w-4 h-4" />
              2D
            </button>
            <button
              onClick={() => setViewMode("3d")}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1",
                viewMode === "3d" ? "bg-violet-500 text-slate-900 shadow" : "text-slate-400 hover:text-slate-900"
              )}
            >
              <CuboidIcon className="w-4 h-4" />
              View in 3D
            </button>
          </div>

          {/* Guided vs Free design */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 shrink-0">
            <button
              onClick={() => setCreationMode("guided")}
              className={cn(
                "px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
                creationMode === "guided" ? "bg-amber-500/80 text-slate-900 shadow" : "text-slate-400 hover:text-slate-900"
              )}
            >
              Guided
            </button>
            <button
              onClick={() => { setCreationMode("free"); setPlacementMode(false); }}
              className={cn(
                "px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
                creationMode === "free" ? "bg-slate-200 text-slate-900" : "text-slate-400 hover:text-slate-900"
              )}
            >
              Free design
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {projects.length > 0 && (
            <select
              value={currentProjectId || ""}
              onChange={(e) => setCurrentProjectId(e.target.value || null)}
              className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-900 text-sm max-w-[200px]"
            >
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          {currentProjectId && (
            <>
              <button onClick={saveSitePlan} disabled={saving}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-600 hover:bg-emerald-200 disabled:opacity-50 text-sm">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
              {editorCanProceed && (
                <span className="hidden sm:inline flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-100 text-emerald-600 text-xs font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Site plan completed
                </span>
              )}
              {(() => {
                const next = getNextStep("/site-plan", currentProjectId);
                const nextHref = next?.href ?? `/terrain?project=${currentProjectId}`;
                const nextLabel = next?.label ?? "Next: Terrain";
                if (editorCanProceed) {
                  return (
                    <button
                      type="button"
                      onClick={async () => {
                        if (isDirty && currentProjectId) await saveSitePlan();
                        router.push(nextHref);
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-sky-500 hover:bg-sky-600 text-slate-900 transition-colors"
                    >
                      {nextLabel}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  );
                }
                return (
                  <span className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-100" title="Name all elements, meet green %, and add at least one footprint">
                    {nextLabel}
                    <ArrowRight className="w-4 h-4 opacity-60" />
                    <span className="text-xs font-normal text-slate-500 ml-1">(complete required fields)</span>
                  </span>
                );
              })()}
            </>
          )}
          <div className="h-6 w-px bg-white/10" />
          <select value={currentScale.label} onChange={(e) => { const s = SCALES.find((sc) => sc.label === e.target.value); if (s) setCurrentScale(s); }}
            className="px-2 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-900 text-sm">
            {SCALES.map((s) => <option key={s.label} value={s.label}>{s.label}</option>)}
          </select>
          <select value={paperSize} onChange={(e) => setPaperSize(e.target.value as "A4" | "A3")} className="px-2 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-900 text-sm" title="Paper size for export (A3 recommended)">
            <option value="A4">A4</option>
            <option value="A3">A3</option>
          </select>
          <button onClick={() => setIsFullScreen(!isFullScreen)} className="p-2 rounded-lg text-slate-400 hover:text-slate-900" title={isFullScreen ? "Exit full screen" : "Full screen"}>
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={() => setPreviewMode(!previewMode)} className={cn("p-2 rounded-lg", previewMode ? "bg-amber-100 text-amber-600" : "text-slate-400 hover:text-slate-900")} title="Preview mode (read-only)"><Eye className="w-4 h-4" /></button>
          <button onClick={() => setShowTutorial(true)} className="p-2 rounded-lg text-slate-400 hover:text-slate-900" title="Tutorial"><Play className="w-4 h-4" /></button>
          <button onClick={() => setShowGrid(!showGrid)} className={cn("p-2 rounded-lg", showGrid ? "bg-blue-100 text-blue-600" : "text-slate-400 hover:text-slate-900")} title="Toggle grid"><Grid3X3 className="w-4 h-4" /></button>
          <button onClick={() => setSnapEnabled(!snapEnabled)} className={cn("p-2 rounded-lg", snapEnabled ? "bg-purple-100 text-purple-600" : "text-slate-400 hover:text-slate-900")} title="Snap"><Magnet className="w-4 h-4" /></button>
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => handleZoom(-25)} className="p-1 text-slate-400 hover:text-slate-900"><ZoomOut className="w-4 h-4" /></button>
            <span className="px-1.5 text-xs text-slate-900 min-w-[40px] text-center">{zoom}%</span>
            <button onClick={() => handleZoom(25)} className="p-1 text-slate-400 hover:text-slate-900"><ZoomIn className="w-4 h-4" /></button>
          </div>
          <button onClick={handleUndo} disabled={!canUndo} className="p-2 rounded-lg text-slate-400 hover:text-slate-900 disabled:opacity-40" title="Undo"><Undo2 className="w-4 h-4" /></button>
          <button onClick={handleRedo} disabled={!canRedo} className="p-2 rounded-lg text-slate-400 hover:text-slate-900 disabled:opacity-40" title="Redo"><Redo2 className="w-4 h-4" /></button>
          <button onClick={handleClearAll} className="p-2 rounded-lg text-slate-400 hover:text-slate-900" title="Clear All"><RotateCcw className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Unnamed warning */}
      {unnamedElementsWarning && unnamedElementsWarning.length > 0 && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-3 text-sm text-amber-700">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>Name all elements before saving. Unnamed: {unnamedElementsWarning.map((u) => `#${u.index} (${u.type})`).join(", ")}.</span>
          <button onClick={() => setUnnamedElementsWarning(null)} className="ml-auto text-amber-600 hover:text-amber-700">x</button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Left Toolbar (2D only) — Free wall drawing + tools (always visible) */}
        {viewMode === "2d" && (
          <div className="w-[72px] sm:w-44 bg-white border-r border-slate-200 flex flex-col py-3 gap-0.5 overflow-y-auto shrink-0">
            <div className="px-2 pb-1.5 mb-1 border-b border-slate-200">
              <p className="text-[10px] font-semibold text-amber-600/90 uppercase tracking-wider">Free wall drawing</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Line · Rect · Polygon</p>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              {tools.map((tool) => {
                const Icon = tool.icon;
                const tooltip = (tool as { tooltip?: string }).tooltip || `${tool.label} (${tool.shortcut})`;
                const isDrawTool = ["line", "rectangle", "polygon", "circle"].includes(tool.id);
                return (
                  <button key={tool.id} onClick={() => handleToolSelect(tool.id as Tool)}
                    className={cn("w-full sm:w-auto min-w-[48px] h-10 rounded-xl flex items-center justify-center gap-2 sm:gap-2 px-2 transition-all",
                      activeTool === tool.id ? "bg-gradient-to-br from-blue-500 to-purple-500 text-slate-900 shadow-lg shadow-blue-500/25" : "text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                    )} title={tooltip}>
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className={cn("text-xs font-medium truncate max-w-[88px]", isDrawTool ? "inline" : "hidden sm:inline")}>{tool.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="w-8 h-px bg-white/10 my-1 self-center" />
            {templatesList.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.id} onClick={() => addTemplate(t.id)}
                  className="w-12 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-all"
                  title={t.id === "access" ? "Site access: triangle + Access label" : `${t.label}${t.width && t.height ? ` (${t.width}m × ${t.height}m)` : ""}`}>
                  <Icon className="w-4 h-4" style={{ color: t.color }} />
                </button>
              );
            })}
            <div className="w-8 h-px bg-white/10 my-1" />
            <button onClick={addExistingBuilding} className="w-12 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-all" title="Add Existing Building">
              <Building2 className="w-4 h-4 text-gray-400" />
            </button>
            <button onClick={addNewBuilding} className="w-12 h-10 rounded-xl flex items-center justify-center text-blue-600 hover:bg-blue-100 transition-all" title="Add New Construction">
              <Plus className="w-4 h-4" />
            </button>
            {currentProjectId && (
              <button
                onClick={loadTerrainFromIgn}
                disabled={loadingIgnTerrain}
                className="w-12 h-10 rounded-xl flex items-center justify-center text-emerald-600 hover:bg-emerald-100 transition-all disabled:opacity-50"
                title="Load terrain from IGN (RGE ALTI®) – adds elevation points for 3D"
              >
                {loadingIgnTerrain ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mountain className="w-4 h-4" />}
              </button>
            )}
            <div className="w-8 h-px bg-white/10 my-1" />
            <button onClick={addNorthArrow} className="w-12 h-10 rounded-xl flex items-center justify-center text-sky-400 hover:bg-sky-500/20 transition-all" title="North Arrow">
              <Compass className="w-4 h-4" />
            </button>
            <button onClick={() => setShowLegend(v => !v)} className={cn("w-12 h-10 rounded-xl flex items-center justify-center transition-all", showLegend ? "bg-violet-100 text-violet-600" : "text-violet-400 hover:bg-violet-500/20")} title="Legend">
              <FileText className="w-4 h-4" />
            </button>
            <button onClick={autoAddBoundaryDimensions} className="w-12 h-10 rounded-xl flex items-center justify-center text-orange-400 hover:bg-orange-500/20 transition-all" title="Auto Boundary Dimensions">
              <Ruler className="w-4 h-4" />
            </button>
            {currentProjectId && (
              <Link href={`/building-3d?project=${currentProjectId}`} className="w-12 h-10 rounded-xl flex items-center justify-center text-violet-400 hover:bg-violet-500/20 transition-all" title="Full 3D Editor">
                <Box className="w-4 h-4" />
              </Link>
            )}
            <Link href={`/editor${currentProjectId ? `?project=${currentProjectId}` : ""}`} className="w-12 h-10 rounded-xl flex items-center justify-center text-cyan-400 hover:bg-cyan-500/20 transition-all" title="Technical Drawing Editor">
              <Ruler className="w-4 h-4" />
            </Link>
            <div className="flex-1" />
            <button onClick={handleDelete} className="w-12 h-10 rounded-xl flex items-center justify-center text-red-600 hover:bg-red-50 transition-all" title="Delete"><Trash2 className="w-4 h-4" /></button>
          </div>
        )}

        {/* Main Area */}
        <div className="flex-1 relative overflow-hidden" ref={containerRef}>
          {viewMode === "2d" ? (
            <>
              {currentMeasurement && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
                  <div className="px-6 py-3 rounded-xl bg-amber-500 text-slate-900 font-mono font-bold text-xl shadow-lg shadow-amber-500/25">{currentMeasurement}</div>
                </div>
              )}
              {(activeTool === "polygon" || activeTool === "parcel") && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
                  <div className="px-4 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 text-sm">
                    Click to add points. <span className="text-amber-600 font-medium">Double-click</span> to complete.
                    {polygonPoints.length > 0 && <span className="ml-2 text-emerald-600">({polygonPoints.length} pts)</span>}
                  </div>
                </div>
              )}
              {loadingExistingBuildings && (
                <div className="absolute top-4 right-4 z-20 px-4 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 text-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />Loading existing buildings...
                </div>
              )}
              {placementMode && selectedPreset && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-6 py-3 rounded-xl bg-amber-500 text-slate-900 font-medium text-sm shadow-lg">
                  Click on the plan to place your {selectedPreset.shortLabel}
                </div>
              )}
              {creationMode === "guided" && !hideFreeDesignHint && (
                <div className="absolute top-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-20 flex items-start gap-2 px-4 py-3 rounded-xl bg-slate-100/95 border border-amber-200 text-sm text-slate-700 shadow-xl">
                  <p className="flex-1">
                    To <strong className="text-amber-600">draw walls or shapes</strong> (lines, rectangles, polygons), switch to <strong className="text-slate-900">Free design</strong> and use the tools in the left toolbar.
                  </p>
                  <button onClick={() => setHideFreeDesignHint(true)} className="p-1 rounded text-slate-400 hover:text-slate-900 shrink-0" aria-label="Dismiss">×</button>
                  <button onClick={() => { setCreationMode("free"); setHideFreeDesignHint(true); }} className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 text-slate-900 font-medium text-xs hover:bg-amber-400">
                    Use Free design
                  </button>
                </div>
              )}
              <div className="absolute bottom-4 right-4 z-20">
                <div className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-mono">
                  X: {formatMeasurement(pixelsToMeters(mousePos.x))} | Y: {formatMeasurement(pixelsToMeters(mousePos.y))}
                </div>
              </div>
              {/* Graphic scale (spec 2.9) */}
              <div className="absolute bottom-4 left-4 z-20 flex flex-col gap-1">
                <div className="px-3 py-1.5 rounded-lg bg-slate-100/90 border border-slate-200 text-slate-600 text-xs font-mono">
                  Scale 1:{currentScale.value === 0.5 ? "50" : currentScale.value === 1 ? "100" : currentScale.value === 2 ? "200" : "500"}
                </div>
                <div className="flex items-center gap-0.5">
                  <div className="h-1.5 bg-white/80 rounded-l" style={{ width: currentScale.pixelsPerMeter * 5 }} />
                  <span className="text-[10px] text-slate-400 ml-1">5 m</span>
                </div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center bg-white">
                <canvas ref={canvasRef} className="shadow-2xl" />
              </div>
              <SitePlanLegend isOpen={showLegend} onToggle={() => setShowLegend(false)} />
              {/* Floating Real-Time Summary Panel */}
              {(() => {
                const fd = computeFootprintData();
                const totalFp = fd.existingFootprint + (fd.includeOverhangInFootprint ? fd.projectedFootprint + fd.roofOverhang : fd.projectedFootprint);
                const cesVal = fd.totalSiteArea > 0 ? (totalFp / fd.totalSiteArea * 100) : 0;
                const greenVal = fd.totalSiteArea > 0 ? (fd.greenSpaceArea / fd.totalSiteArea * 100) : 0;
                const cesOk = cesVal <= fd.maxCoverageRatio * 100;
                const greenOk = greenVal >= fd.requiredGreenPct;
                // 3-tier totals
                let perm = 0, semi = 0, imp = 0;
                Object.entries(fd.surfacesByType).forEach(([k, v]) => {
                  const cl = SURFACE_CLASSIFICATION[k];
                  if (cl === "permeable") perm += v;
                  else if (cl === "semi-permeable") semi += v;
                  else imp += v;
                });
                return (
                  <div className="absolute top-4 right-4 z-20 w-52 bg-white/95 backdrop-blur-sm rounded-xl border border-slate-200 shadow-lg p-3 space-y-2">
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Real-Time Summary</h4>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-600">CES</span>
                      <span className={cn("font-mono font-semibold", cesOk ? "text-emerald-600" : "text-red-500")}>{cesVal.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-600">Green space</span>
                      <span className={cn("font-mono font-semibold", greenOk ? "text-emerald-600" : "text-amber-500")}>{greenVal.toFixed(1)}%</span>
                    </div>
                    <div className="h-px bg-slate-200" />
                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />Permeable</span><span className="font-mono">{perm.toFixed(1)} m²</span></div>
                      <div className="flex justify-between"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Semi-Perm.</span><span className="font-mono">{semi.toFixed(1)} m²</span></div>
                      <div className="flex justify-between"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />Imperméable</span><span className="font-mono">{imp.toFixed(1)} m²</span></div>
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="absolute inset-0 bg-white">
              <Inline3DViewer
                buildings={buildingDetails}
                elevationPoints={elevationPoints}
                selectedBuildingId={selectedBuildingId3d}
                onBuildingSelect={(id) => {
                  setSelectedBuildingId3d(id ?? null);
                  if (id) setRightTab("buildings");
                }}
              />
              <div className="absolute bottom-4 left-4 z-10 flex items-center gap-3 px-4 py-2 rounded-xl bg-slate-100/90 border border-slate-200 text-slate-600 text-sm">
                <span>Free wall drawing (Line, Rectangle, Polygon) is in <strong className="text-slate-900">2D</strong> view.</span>
                <button onClick={() => { setViewMode("2d"); setSelectedBuildingId3d(null); }} className="px-3 py-1.5 rounded-lg bg-blue-500 text-slate-900 text-xs font-medium hover:bg-blue-400">Switch to 2D</button>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel */}
        <div className="w-80 bg-white border-l border-slate-200 flex flex-col">
          {creationMode === "guided" ? (
            <GuidedCreation
              step={guidedStep}
              onStepChange={setGuidedStep}
              selectedPreset={selectedPreset}
              onSelectPreset={setSelectedPreset}
              placementMode={placementMode}
              onStartPlacement={() => { setPlacementMode(true); setGuidedStep(2); }}
              onCancelPlacement={() => { setPlacementMode(false); }}
              lastPlacedBuilding={lastPlacedBuildingId ? buildingDetails.find((b) => b.id === lastPlacedBuildingId) ?? null : null}
              onSizeChange={(buildingId, patch) => {
                setBuildingDetails((prev) => {
                  const next = prev.map((bd) =>
                    bd.id === buildingId
                      ? {
                        ...bd,
                        ...(patch.width != null && { width: patch.width }),
                        ...(patch.depth != null && { depth: patch.depth }),
                        ...(patch.wallHeights != null && { wallHeights: patch.wallHeights }),
                        ...(patch.altitudeM !== undefined && { altitudeM: patch.altitudeM }),
                      }
                      : bd
                  );
                  const updated = next.find((b) => b.id === buildingId);
                  const canvas = fabricRef.current;
                  if (canvas && updated && (patch.width != null || patch.depth != null)) {
                    const obj = canvas.getObjects().find((o: any) => o.id === buildingId);
                    if (obj && obj.type === "rect") {
                      const wPx = metersToPixels(updated.width);
                      const dPx = metersToPixels(updated.depth);
                      obj.set({ width: wPx, height: dPx });
                      removeMeasurements(buildingId);
                      addRectMeasurements(obj as fabric.Rect, buildingId);
                      canvas.renderAll();
                      updateLayers(canvas);
                    }
                  }
                  return next;
                });
              }}
              onRoofChange={(buildingId, roof) => {
                setBuildingDetails((prev) =>
                  prev.map((bd) => (bd.id === buildingId ? { ...bd, roof: { ...bd.roof, ...roof } } : bd))
                );
              }}
              customDimensions={customDimensions}
              onCustomDimensionsChange={setCustomDimensions}
              onAddAnother={() => { setGuidedStep(1); setSelectedPreset(null); setLastPlacedBuildingId(null); }}
              onAddGreenSpace={() => {
                const greenPreset = getPresetById("green");
                if (greenPreset) {
                  setSelectedPreset(greenPreset);
                  setGuidedStep(2);
                  setPlacementMode(true);
                }
              }}
              onDone={() => setCreationMode("free")}
              buildingCount={buildingDetails.length + (placementMode ? 0 : 0)}
              onSwitchToFreeDesign={() => { setCreationMode("free"); setPlacementMode(false); }}
            />
          ) : (
            <>
              <div className="flex border-b border-slate-200">
                {([
                  { id: "layers" as const, label: "Layers", icon: Layers },
                  { id: "buildings" as const, label: "Buildings", icon: Building2 },
                  { id: "footprint" as const, label: "Footprint", icon: LayoutGrid },
                ]).map((tab) => (
                  <button key={tab.id} onClick={() => setRightTab(tab.id)}
                    className={cn("flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors",
                      rightTab === tab.id ? "text-slate-900 border-b-2 border-blue-500 bg-white" : "text-slate-400 hover:text-slate-900"
                    )}>
                    <tab.icon className="w-3.5 h-3.5" />{tab.label}
                  </button>
                ))}
              </div>

              {/* Compliance */}
              {currentProjectId && (
                <div className="border-b border-slate-200">
                  <button onClick={() => setShowCompliance(!showCompliance)} className="w-full flex items-center justify-between p-3 text-left hover:bg-white">
                    <span className="text-sm font-medium text-slate-900 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" />Compliance</span>
                    <ChevronDown className={cn("w-4 h-4 transition-transform", showCompliance && "rotate-180")} />
                  </button>
                  {showCompliance && complianceChecks.length > 0 && (
                    <div className="p-3 pt-0 max-h-32 overflow-y-auto space-y-1.5">
                      {complianceChecks.map((c, i) => (
                        <div key={i} className={cn("p-2 rounded-lg text-xs",
                          c.status === "compliant" && "bg-emerald-50 text-emerald-600",
                          c.status === "warning" && "bg-amber-50 text-amber-600",
                          c.status === "violation" && "bg-red-50 text-red-600"
                        )}><span className="font-medium">{c.rule}</span>: {c.message}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto">
                {rightTab === "layers" && (
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><Layers className="w-4 h-4" />Layers</h3>
                      <span className="text-xs text-slate-500">{layers.length}</span>
                    </div>
                    {layers.length === 0 ? (
                      <p className="text-center py-6 text-slate-500 text-sm">No objects yet. Draw shapes or add buildings.</p>
                    ) : (
                      <div className="space-y-1">
                        {layers.map((layer) => (
                          <div key={layer.id} className="flex items-center gap-2 p-2 rounded-lg bg-white hover:bg-slate-100">
                            <div className={cn("w-7 h-7 rounded flex items-center justify-center",
                              layer.name === "Land Parcel" ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600"
                            )}>
                              {layer.name === "Land Parcel" ? <MapPin className="w-3 h-3" /> :
                                layer.type === "rect" ? <Square className="w-3 h-3" /> :
                                  layer.type === "circle" ? <Circle className="w-3 h-3" /> :
                                    layer.type === "line" ? <Minus className="w-3 h-3" /> :
                                      <Pentagon className="w-3 h-3" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-slate-900 truncate capitalize">{layer.name}</p>
                              <p className="text-[10px] text-slate-500">{layer.type}</p>
                            </div>
                            <button className="p-1 text-slate-400 hover:text-slate-900">
                              {layer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {rightTab === "buildings" && (
                  <div className="p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-900">Building Details</h3>
                      <span className="text-xs text-slate-500">{buildingDetails.length}</span>
                    </div>
                    {buildingDetails.length === 0 ? (
                      <div className="text-center py-6 space-y-3">
                        <p className="text-sm text-slate-500">No buildings yet.</p>
                        <div className="flex flex-col gap-2">
                          <button onClick={addExistingBuilding} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-slate-200 text-slate-400 hover:text-slate-900 text-xs">
                            <Building2 className="w-3 h-3" />Add Existing Building
                          </button>
                          <button onClick={addNewBuilding} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-blue-200 text-blue-600 hover:text-blue-700 text-xs">
                            <Plus className="w-3 h-3" />Add New Construction
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {buildingDetails.map((b) => (
                          <BuildingDetailPanel
                            key={b.id}
                            building={b}
                            highlight={viewMode === "3d" && selectedBuildingId3d === b.id}
                            onChange={(updated) => {
                              setBuildingDetails((prev) => prev.map((bd) => (bd.id === updated.id ? updated : bd)));
                              const canvas = fabricRef.current;
                              if (canvas) {
                                const obj = canvas.getObjects().find((o: any) => o.id === updated.id);
                                if (obj && obj.type === "rect") {
                                  const wPx = metersToPixels(updated.width), dPx = metersToPixels(updated.depth);
                                  obj.set({ width: wPx, height: dPx });
                                  (obj as any).elementName = updated.name;
                                  removeMeasurements(updated.id);
                                  addRectMeasurements(obj as fabric.Rect, updated.id);
                                  canvas.renderAll();
                                  updateLayers(canvas);
                                }
                              }
                            }}
                            onRemove={() => {
                              setBuildingDetails((prev) => prev.filter((bd) => bd.id !== b.id));
                              const canvas = fabricRef.current;
                              if (canvas) {
                                const obj = canvas.getObjects().find((o: any) => o.id === b.id);
                                if (obj) { removeMeasurements(b.id); canvas.remove(obj); canvas.renderAll(); }
                              }
                            }}
                          />
                        ))}
                        <div className="flex gap-2">
                          <button onClick={addExistingBuilding} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-slate-200 text-slate-400 hover:text-slate-900 text-xs">
                            <Building2 className="w-3 h-3" />Existing
                          </button>
                          <button onClick={addNewBuilding} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-blue-200 text-blue-600 hover:text-blue-700 text-xs">
                            <Plus className="w-3 h-3" />New
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {rightTab === "footprint" && (
                  <div className="p-3">
                    <FootprintTable data={footprintData} />
                  </div>
                )}
              </div>

              {/* Bottom Properties */}
              <div className="border-t border-slate-200 p-3">
                <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2"><Settings className="w-4 h-4" />Properties</h3>
                {selectedObject ? (
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">Name</label>
                      <input type="text" value={String((selectedObject as any).elementName ?? (selectedObject as any).name ?? "")}
                        onChange={(e) => {
                          (selectedObject as any).elementName = e.target.value;
                          (selectedObject as any).name = e.target.value;
                          fabricRef.current?.requestRenderAll();
                          updateLayers(fabricRef.current!);
                        }}
                        placeholder="e.g. Main building"
                        className="w-full px-2 py-1.5 rounded bg-slate-100 border border-slate-200 text-slate-900 text-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {selectedObject.width != null && (
                        <div><span className="text-slate-500">Width: </span><span className="text-amber-600 font-mono">{formatMeasurement(pixelsToMeters((selectedObject.width || 0) * (selectedObject.scaleX || 1)))}</span></div>
                      )}
                      {selectedObject.height != null && (
                        <div><span className="text-slate-500">Height: </span><span className="text-amber-600 font-mono">{formatMeasurement(pixelsToMeters((selectedObject.height || 0) * (selectedObject.scaleY || 1)))}</span></div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Select an object</p>
                )}
                <div className="mt-3">
                  <label className="text-xs text-slate-500 block mb-1.5">Surface</label>
                  <div className="flex flex-wrap gap-1">
                    {SURFACE_TYPES.map((st) => (
                      <button key={st.id} onClick={() => setActiveSurfaceType(st)}
                        className={cn("px-2 py-0.5 rounded text-[10px] font-medium", activeSurfaceType.id === st.id ? "ring-2 ring-white/50" : "opacity-70 hover:opacity-100")}
                        style={{ backgroundColor: st.color + "40", color: st.color }}
                        title={(st as { tooltip?: string }).tooltip || st.label}>{st.label}</button>
                    ))}
                  </div>
                </div>
                {activeTool === "vrd" && (
                  <div className="mt-3">
                    <label className="text-xs text-slate-500 block mb-1.5">VRD Network</label>
                    <div className="flex flex-wrap gap-1">
                      {VRD_TYPES.map((v) => (
                        <button key={v.id} onClick={() => setActiveVrdType(v)}
                          className={cn("px-2 py-0.5 rounded text-[10px]", activeVrdType.id === v.id ? "ring-2 ring-white/50" : "opacity-70 hover:opacity-100")}
                          style={{ backgroundColor: v.color + "40", color: v.color }}>{v.label}</button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex flex-wrap gap-1">
                    {paletteColors.slice(0, 6).map((c) => (
                      <button key={c} onClick={() => setActiveColor(c)}
                        className={cn("w-5 h-5 rounded", activeColor === c && "ring-2 ring-white ring-offset-1 ring-offset-slate-900")}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <div className="text-xs text-slate-500">
                    Stroke: {strokeWidth}px
                    <input type="range" min={1} max={10} value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} className="w-16 accent-blue-500 ml-1" />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tutorial modal + Load example (spec UX) */}
      {showTutorial && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60" onClick={() => setShowTutorial(false)}>
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Play className="w-5 h-5 text-amber-600" /> Site plan tutorial</h3>
              <button onClick={() => setShowTutorial(false)} className="p-1 rounded text-slate-400 hover:text-slate-900"><X className="w-5 h-5" /></button>
            </div>
            <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600 mb-6">
              <li>Choose a project and ensure address/parcels are set so the parcel can auto-load.</li>
              <li>Use <strong>Guided</strong> to add a building (type → place → size → roof) or <strong>Free design</strong> for shapes.</li>
              <li>Add <strong>Access</strong> (triangle), <strong>Parking</strong> (5×2.5 m), and <strong>VRD</strong> (utilities) from the left toolbar.</li>
              <li>Use <strong>Elevation</strong> to place height points; <strong>Section line</strong> for the section cut.</li>
              <li>Name every element in the Properties panel, then <strong>Save</strong>. Check the Footprint tab for PLU compliance.</li>
            </ol>
            <button
              onClick={() => {
                const canvas = fabricRef.current;
                if (canvas) {
                  const center = canvas.getCenterPoint();
                  const ppm = currentScale.pixelsPerMeter;
                  addAccessPoint();
                  addTemplate("parking");
                  const housePreset = getPresetById("house");
                  if (housePreset) {
                    const b = buildingDetailFromPreset(housePreset);
                    setBuildingDetails((prev) => [...prev, b]);
                    addBuildingToCanvasAt(b, false, center.x - 80, center.y);
                  }
                  setShowTutorial(false);
                }
              }}
              className="w-full py-2.5 rounded-xl bg-amber-100 text-amber-700 font-medium hover:bg-amber-200"
            >
              <FileText className="w-4 h-4 inline mr-2" /> Load example (Access + Parking + House)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Inline 3D Viewer ────────────────────────────────────────────────────────

function Inline3DViewer({
  buildings,
  elevationPoints = [],
  selectedBuildingId = null,
  onBuildingSelect,
}: {
  buildings: BuildingDetail[];
  elevationPoints?: { id: string; x: number; y: number; value: number }[];
  selectedBuildingId?: string | null;
  onBuildingSelect?: (buildingId: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let frameId = 0;
    let cleanup: (() => void) | undefined;

    const init = async () => {
      const container = containerRef.current;
      if (!container) return;
      try {
        const THREE = await import("three");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");

        const width = container.clientWidth || 800;
        const height = container.clientHeight || 600;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xdce1e8);
        scene.fog = new THREE.Fog(0xdce1e8, 80, 200);

        const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 500);
        camera.position.set(30, 20, 30);
        camera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        container.innerHTML = "";
        const canvasEl = renderer.domElement;
        canvasEl.style.cursor = "grab";
        canvasEl.style.touchAction = "none";
        canvasEl.addEventListener("pointerdown", () => { canvasEl.style.cursor = "grabbing"; });
        canvasEl.addEventListener("pointerup", () => { canvasEl.style.cursor = "grab"; });
        canvasEl.addEventListener("pointerleave", () => { canvasEl.style.cursor = "grab"; });
        container.appendChild(canvasEl);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.maxPolarAngle = Math.PI / 2 - 0.05;
        controls.target.set(0, 0, 0);
        controls.enablePan = true;

        // Lights
        const dirLight = new THREE.DirectionalLight(0xfffaf0, 1.3);
        dirLight.position.set(20, 35, 15);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.set(2048, 2048);
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 100;
        dirLight.shadow.camera.left = -50;
        dirLight.shadow.camera.right = 50;
        dirLight.shadow.camera.top = 50;
        dirLight.shadow.camera.bottom = -50;
        scene.add(dirLight);

        const fillLight = new THREE.DirectionalLight(0xb8c4d4, 0.5);
        fillLight.position.set(-12, 15, -8);
        scene.add(fillLight);
        scene.add(new THREE.AmbientLight(0xa8b4c4, 0.6));

        // Ground
        const groundGeom = new THREE.PlaneGeometry(80, 80);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x4a7c4e, roughness: 0.95 });
        const ground = new THREE.Mesh(groundGeom, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        // Buildings
        const buildingsToRender = buildings.length > 0 ? buildings : [createDefaultBuilding({ name: "Main Building" })];

        buildingsToRender.forEach((b, i) => {
          const totalH = b.wallHeights.ground + b.wallHeights.first + b.wallHeights.second;
          const baseY = b.altitudeM ?? 0;
          const w = b.width, d = b.depth;
          const boxColor = b.isExisting ? 0xb0b0b0 : 0xe8e4dc;
          const isSelected = selectedBuildingId === b.id;
          const boxGeom = new THREE.BoxGeometry(w, totalH, d);
          const boxMat = new THREE.MeshStandardMaterial({
            color: boxColor,
            roughness: 0.9,
            emissive: isSelected ? 0x2244aa : 0,
            emissiveIntensity: isSelected ? 0.25 : 0,
          });
          const box = new THREE.Mesh(boxGeom, boxMat);
          box.position.set(i * (w + 3), baseY + totalH / 2, 0);
          box.castShadow = true;
          box.receiveShadow = true;
          (box as any).userData = { buildingId: b.id };
          scene.add(box);

          // Roof
          const overhang = b.roof.overhang || 0;
          if (b.roof.type === "flat") {
            const flatGeom = new THREE.BoxGeometry(w + overhang * 2, 0.25, d + overhang * 2);
            const roof = new THREE.Mesh(flatGeom, new THREE.MeshStandardMaterial({ color: 0x5c5c5c, roughness: 0.92 }));
            roof.position.set(i * (w + 3), baseY + totalH + 0.125, 0);
            roof.castShadow = true;
            (roof as any).userData = { buildingId: b.id };
            scene.add(roof);
          } else if (b.roof.type === "gable") {
            const pitch = (b.roof.pitch || 35) * (Math.PI / 180);
            const roofH = (w / 2) * Math.tan(pitch);
            const halfW = w / 2 + overhang, halfD = d / 2 + overhang;
            const vertices = new Float32Array([
              -halfW, baseY + totalH, -halfD, halfW, baseY + totalH, -halfD, 0, baseY + totalH + roofH, 0,
              halfW, baseY + totalH, -halfD, halfW, baseY + totalH, halfD, 0, baseY + totalH + roofH, 0,
              halfW, baseY + totalH, halfD, -halfW, baseY + totalH, halfD, 0, baseY + totalH + roofH, 0,
              -halfW, baseY + totalH, halfD, -halfW, baseY + totalH, -halfD, 0, baseY + totalH + roofH, 0,
            ]);
            const geom = new THREE.BufferGeometry();
            geom.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
            geom.computeVertexNormals();
            const roof = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: 0x7d4e2e, roughness: 0.9 }));
            roof.position.x = i * (w + 3);
            roof.castShadow = true;
            (roof as any).userData = { buildingId: b.id };
            scene.add(roof);
          } else {
            const pitch = (b.roof.pitch || 35) * (Math.PI / 180);
            const roofH = (Math.max(w, d) / 2) * Math.tan(pitch);
            const size = Math.sqrt(w * w + d * d) / 2 + overhang;
            const roofGeom = new THREE.ConeGeometry(size, roofH, 4);
            const roof = new THREE.Mesh(roofGeom, new THREE.MeshStandardMaterial({ color: 0x7d4e2e, roughness: 0.9 }));
            roof.rotation.y = Math.PI / 4;
            roof.position.set(i * (w + 3), baseY + totalH + roofH / 2, 0);
            roof.castShadow = true;
            (roof as any).userData = { buildingId: b.id };
            scene.add(roof);
          }

          // Windows
          const floorHeights = [b.wallHeights.ground, b.wallHeights.first, b.wallHeights.second].filter((h) => h > 0);
          const winW = Math.min(1.2, w * 0.12), winH = Math.min(1.4, (b.wallHeights.ground || 3) * 0.4);
          const winMat = new THREE.MeshStandardMaterial({ color: 0x2a3f4f, roughness: 0.15, metalness: 0.35 });
          const nWinX = w > 10 ? 3 : 2, nWinZ = d > 10 ? 3 : 2;

          for (let fi = 0; fi < floorHeights.length; fi++) {
            const floorBase = baseY + floorHeights.slice(0, fi).reduce((a, b2) => a + b2, 0);
            const cy = floorBase + floorHeights[fi] / 2;
            for (let wi = 0; wi < nWinX; wi++) {
              const cx = ((wi + 1) / (nWinX + 1)) * w - w / 2;
              const g = new THREE.PlaneGeometry(winW, winH);
              const w1 = new THREE.Mesh(g, winMat); w1.position.set(i * (w + 3) + cx, cy, d / 2 + 0.02); (w1 as any).userData = { buildingId: b.id }; scene.add(w1);
              const w2 = new THREE.Mesh(g.clone(), winMat); w2.position.set(i * (w + 3) + cx, cy, -d / 2 - 0.02); w2.rotation.y = Math.PI; (w2 as any).userData = { buildingId: b.id }; scene.add(w2);
            }
            for (let wi = 0; wi < nWinZ; wi++) {
              const cz = ((wi + 1) / (nWinZ + 1)) * d - d / 2;
              const g = new THREE.PlaneGeometry(winW, winH);
              const w1 = new THREE.Mesh(g, winMat); w1.position.set(i * (w + 3) + w / 2 + 0.02, cy, cz); w1.rotation.y = -Math.PI / 2; (w1 as any).userData = { buildingId: b.id }; scene.add(w1);
              const w2 = new THREE.Mesh(g.clone(), winMat); w2.position.set(i * (w + 3) - w / 2 - 0.02, cy, cz); w2.rotation.y = Math.PI / 2; (w2 as any).userData = { buildingId: b.id }; scene.add(w2);
            }
          }
        });

        // North arrow
        const northGeom = new THREE.ConeGeometry(0.3, 0.8, 8);
        const northArrow = new THREE.Mesh(northGeom, new THREE.MeshStandardMaterial({ color: 0xc62828 }));
        northArrow.rotation.x = Math.PI / 2;
        northArrow.position.set(-15, 0.4, -15);
        scene.add(northArrow);

        // Elevation points as markers (spec 2.5) — canvas coords normalized to -20..20, height = value
        const canvasW = 800, canvasH = 600;
        elevationPoints.forEach((pt) => {
          const nx = (pt.x / canvasW) * 40 - 20;
          const nz = (pt.y / canvasH) * 40 - 20;
          const geom = new THREE.ConeGeometry(0.25, 0.6, 6);
          const mat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9 });
          const mesh = new THREE.Mesh(geom, mat);
          mesh.position.set(nx, pt.value + 0.3, nz);
          scene.add(mesh);
          const labelGeom = new THREE.SphereGeometry(0.15, 8, 8);
          const labelMat = new THREE.MeshStandardMaterial({ color: 0x0284c7 });
          const labelMesh = new THREE.Mesh(labelGeom, labelMat);
          labelMesh.position.set(nx, pt.value, nz);
          scene.add(labelMesh);
        });

        const animate = () => { frameId = requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); };
        animate();
        setIsReady(true);

        // Click to select building: raycast and call onBuildingSelect
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        const onPointerClick = (e: PointerEvent) => {
          if (!onBuildingSelect || !container) return;
          const rect = container.getBoundingClientRect();
          mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(mouse, camera);
          const hits = raycaster.intersectObjects(scene.children, true);
          for (let h = 0; h < hits.length; h++) {
            const id = (hits[h].object as any).userData?.buildingId;
            if (id) {
              onBuildingSelect(id);
              return;
            }
          }
          onBuildingSelect(null);
        };
        canvasEl.addEventListener("pointerdown", onPointerClick);

        const resizeObs = new ResizeObserver(() => {
          const c = containerRef.current;
          if (!c) return;
          camera.aspect = c.clientWidth / c.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(c.clientWidth, c.clientHeight);
        });
        resizeObs.observe(container);

        cleanup = () => {
          canvasEl.removeEventListener("pointerdown", onPointerClick);
          cancelAnimationFrame(frameId);
          resizeObs.disconnect();
          renderer.dispose();
        };
      } catch (e) { setError(e instanceof Error ? e.message : "3D failed to load"); }
    };

    init();
    return () => cleanup?.();
  }, [buildings, elevationPoints, selectedBuildingId, onBuildingSelect]);

  return (
    <div className="relative w-full h-full min-h-[280px]">
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
      {isReady && (
        <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:max-w-md flex flex-col gap-2 px-4 py-3 rounded-xl bg-white/95 border border-slate-300 text-sm text-slate-700 shadow-lg">
          <span className="flex items-center gap-2"><span className="text-blue-600 font-medium shrink-0">3D:</span> Drag to rotate · Scroll to zoom · Right-drag to pan</span>
          <span className="flex items-center gap-2"><span className="text-amber-600 font-medium shrink-0">Edit:</span> Click a building to select it, then edit in the <strong>Buildings</strong> panel on the right.</span>
        </div>
      )}
      {!isReady && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/95 text-red-600 text-sm">{error}</div>
      )}
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function SitePlanPage() {
  return (
    <Suspense fallback={
      <div className="h-screen bg-white flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SitePlanContent />
    </Suspense>
  );
}
