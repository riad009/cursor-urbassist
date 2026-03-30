"use client";

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
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
  Pencil,
  MessageSquare,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";


const Terrain3DViewer = dynamic(() => import("@/components/three/Terrain3DViewer"), { ssr: false });
import type { UserBuilding3D } from "@/components/three/Terrain3DViewer";
import { BuildingDetailPanel,
  createDefaultBuilding,
  createBuildingFromOSM,
} from "@/components/site-plan/BuildingDetailPanel";
import { ElementPropertiesPanel } from "@/components/site-plan/ElementPropertiesPanel";
import Terrain3DRightPanel from "@/components/site-plan/Terrain3DRightPanel";

import { FootprintTable } from "@/components/site-plan/FootprintTable";
import { SitePlanLegend } from "@/components/site-plan/SitePlanLegend";

import type { BuildingDetail } from "@/components/site-plan/BuildingDetailPanel";
import type { FootprintData } from "@/components/site-plan/FootprintTable";
import type { DetectedRoad, ParcelSummary } from "@/components/site-plan/ParcelManagementPanel";
import { getPresetById, type ProjectPreset } from "@/lib/projectPresets";
// parcelGeometryToShapes REMOVED — compute shift: all data comes pre-processed from DB
import { renderProcessedSite, clearProcessedLayers, type SetbackConfig } from "@/lib/renderProcessedSite";
import type { ProcessedSiteData } from "@/types/processed-site-data";
import { findNearestSetbackSnap, type SetbackSegment } from "@/lib/setback-snap";
import {
  drawOverhangOverlay,
  drawInteriorLayout,
  drawBuildingOpenings,
  clearBuildingOverlays,
  drawWallThickness,
  drawRoomLabels,
  drawExteriorEnvelope,
} from "@/lib/buildingCanvasOverlays";
import { calculateRoofData } from "@/lib/roofCalculations";
import { useEditorStore } from "@/store/editorStore";
import { useAutoSave } from "@/hooks/useAutoSave";
import { usePluCompliance } from "@/hooks/usePluCompliance";
import PluAlertBanner from "@/components/editor/PluAlertBanner";
import { useVrdDrawing } from "@/hooks/useVrdDrawing";
import VrdToolbar from "@/components/editor/VrdToolbar";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Types ───────────────────────────────────────────────────────────────────

type InlinePromptState = {
  type: "elevation" | "vegetation" | "viewpoint";
  clientX: number;
  clientY: number;
  pointer: { x: number; y: number };
} | null;

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
  | "viewpoint"
  | "pencil"
  | "arrow"
  | "callout";

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
  parcelsGeoJSON: unknown; // GeoJSON FeatureCollection with individual parcel features
  existingBuildingsGeoJSON: unknown; // GeoJSON FeatureCollection from IGN BDTOPO
  precomputedSiteData?: unknown; // Pre-computed ProcessedSiteData from project creation
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
  { id: "pan", label: "Pan", icon: Move, shortcut: "H", tooltip: "Pan the canvas" },
  { id: "line", label: "Line", icon: Minus, shortcut: "L", tooltip: "Draw walls, fences, or segments" },
  { id: "rectangle", label: "Rectangle", icon: Square, shortcut: "R", tooltip: "Quick rectangle for buildings or surfaces" },
  { id: "polygon", label: "Polygon", icon: Pentagon, shortcut: "P", tooltip: "Free shape: click points, double-click to close" },
  { id: "circle", label: "Circle", icon: Circle, shortcut: "C", tooltip: "Circles or round surfaces" },
  { id: "pencil", label: "Pencil", icon: Pencil, shortcut: "B", tooltip: "Freehand drawing" },
  { id: "text", label: "Text", icon: Type, shortcut: "T", tooltip: "Click to add editable text" },
  { id: "arrow", label: "Arrow", icon: ArrowRight, shortcut: "W", tooltip: "Arrow annotation" },
  { id: "callout", label: "Callout", icon: MessageSquare, shortcut: "K", tooltip: "Callout bubble annotation" },
  { id: "measure", label: "Measure", icon: Ruler, shortcut: "M", tooltip: "Measure distance between two points" },
  { id: "elevation", label: "Elevation", icon: Ruler, shortcut: "E", tooltip: "Click to place elevation point (m)" },
  { id: "section", label: "Section line", icon: Minus, shortcut: "S", tooltip: "Draw section cut line" },
  { id: "parcel", label: "Land Parcel", icon: MapPin, shortcut: "A", tooltip: "Draw parcel boundary (polygon)" },
  { id: "vrd", label: "VRD Networks", icon: Zap, shortcut: "D", tooltip: "Utilities: water, wastewater, electricity, etc." },
  { id: "vegetation", label: "Vegetation", icon: Trees, shortcut: "G", tooltip: "Place existing vegetation (trees, shrubs)" },
  { id: "viewpoint", label: "Viewpoint", icon: Eye, shortcut: "W", tooltip: "Place PC7/PC8 camera viewpoint with direction" },
];

/** Phase 8: Tool groups with section labels for grouped toolbar rendering */
const TOOL_GROUPS = [
  { label: "Select", ids: ["select", "pan"] },
  { label: "Draw", ids: ["line", "rectangle", "polygon", "circle", "pencil"] },
  { label: "Annotate", ids: ["text", "arrow", "callout", "measure", "elevation", "section"] },
  { label: "Place", ids: ["parcel", "vrd", "vegetation", "viewpoint"] },
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

/**
 * Custom Fabric.js properties to include in every canvas.toJSON() call.
 * Without this list, ALL custom flags are silently dropped during serialization.
 */
const CANVAS_PROPS = [
  "id", "elementName", "name",
  // Overlay / internal flags
  "isGrid", "isMeasurement", "isPolygonPreview",
  "isBoundaryOverlay", "isBoundaryDimension", "isRegulatoryFootprint",
  "isNorthArrow", "isInteriorLayout",
  "isBuildingOpening", "isBuildingOverhang", "isExteriorEnvelope",
  "isWallThickness", "isRoomLabel",
  "isElevationPoint", "isVegetation", "isViewpoint",
  "isAnnotation", "isVrd", "isSectionLine", "isParcel",
  "excludeFromExport",
  // Data fields
  "parentId", "elevationValue", "vegetationType", "vrdType",
  "surfaceType", "templateType", "buildingId", "constructionType",
  "isExisting", "_buildingDetailId", "_overlayBuildingId", "buildingDetailId",
] as const;

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

  // ── Editor Store: initialize for this project (hydrates from sessionStorage) ──
  const editorStoreInit = useEditorStore((s) => s.initProject);
  useEffect(() => {
    if (projectIdFromUrl) editorStoreInit(projectIdFromUrl);
  }, [projectIdFromUrl, editorStoreInit]);

  // ── Auto-save hook: debounced 2s push to DB ──
  useAutoSave(projectIdFromUrl);

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const measurementLabelsRef = useRef<Map<string, fabric.FabricObject[]>>(new Map());
  const placeGuidedBuildingAtRef = useRef<(x: number, y: number) => void>(() => { });
  const projectDataRef = useRef<ProjectData | null>(null);
  const parcelsDrawnFromGeometryRef = useRef<string | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);

  /** Cache of building canvas positions for 3D viewer (survives view switches) */
  const buildingPositionsRef = useRef<Record<string, { x: number; y: number; angle: number }>>({});

  // State
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [viewMode, setViewMode] = useState<ViewMode>("2d");

  const setbackSegmentsRef = useRef<SetbackSegment[]>([]);
  const [scene3dVersion, setScene3dVersion] = useState(0);
  const [zoom, setZoom] = useState(95);
  const [activeColor, setActiveColor] = useState("#3b82f6");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [showGrid, setShowGrid] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const snapEnabledRef = useRef(snapEnabled);
  snapEnabledRef.current = snapEnabled;
  const [layers, setLayers] = useState<LayerItem[]>([]);
  const [selectedObject, setSelectedObject] = useState<fabric.FabricObject | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1400, height: 900 });
  const [currentScale, setCurrentScale] = useState(SCALES[1]);
  const [isDrawing, setIsDrawing] = useState(false);
  const isDrawingRef = useRef(false);
  const [drawingStart, setDrawingStart] = useState<{ x: number; y: number } | null>(null);
  const drawingStartRef = useRef<{ x: number; y: number } | null>(null);
  const tempShapeRef = useRef<fabric.FabricObject | null>(null);
  const [currentMeasurement, setCurrentMeasurement] = useState("");
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [polygonPoints, setPolygonPoints] = useState<{ x: number; y: number }[]>([]);
  const [activeSurfaceType, setActiveSurfaceType] = useState(SURFACE_TYPES[4]);
  const [activeVrdType, setActiveVrdType] = useState(VRD_TYPES[0]);
  const [inlinePrompt, setInlinePrompt] = useState<InlinePromptState>(null);

  // Project state
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(projectIdFromUrl);
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [saving, setSaving] = useState(false);
  // Phase 8: forceUpdate for text formatting panel re-renders
  const [, forceUpdate] = useState(0);
  const [isDirty, setIsDirty] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Buildings state
  const [buildingDetails, setBuildingDetails] = useState<BuildingDetail[]>([]);
  // Always-fresh ref — undo/redo callbacks read this directly (no stale-closure issues)
  const buildingDetailsSnapshotRef = useRef<BuildingDetail[]>([]);
  useEffect(() => { buildingDetailsSnapshotRef.current = buildingDetails; }, [buildingDetails]);

  /**
   * Bumped whenever a canvas object is moved/scaled/rotated so that
   * userBuildings3d accurately reflects the current canvas positions when
   * the user switches to the 3D view.
   */
  const [canvasVersion, setCanvasVersion] = useState(0);

  /**
   * Stable derived array — fed to Terrain3DViewer as the `userBuildings` prop.
   *
   * WHY: Terrain3DViewer.buildScene() is a useCallback whose dep array includes
   * `userBuildings`. If that prop is a new array reference on every render (as it
   * was when computed via an inline IIFE in JSX) the callback changes, the
   * useEffect([buildScene]) fires, and the ENTIRE Three.js WebGL scene is torn
   * down and rebuilt — causing the >1s lag every time React re-renders the page.
   *
   * This useMemo only recomputes when buildingDetails actually changes (new element
   * added / size changed / removed). View-mode toggles, toolbar clicks, mouse
   * moves, etc. do NOT trigger a rebuild.
   *
   * We read canvas object positions from fabricRef inside the memo body; this is
   * safe because React guarantees refs are stable across renders.
   */
  const userBuildings3d = useMemo<UserBuilding3D[]>(() => {
    const canvas = fabricRef.current;
    if (!canvas || buildingDetails.length === 0) return [];
    const result: UserBuilding3D[] = [];
    canvas.getObjects().forEach((obj: any) => {
      const bdId = obj.buildingDetailId;
      if (!bdId) return;
      const bd = buildingDetails.find((b) => b.id === bdId);
      if (!bd) return;
      // Use surfaceType from canvas object (always lowercase: 'pool', 'garden', 'parking', 'house', etc.)
      // Fall back to bd.name. This is the critical field for 3D factory dispatch.
      const surfaceType = (obj.surfaceType as string | undefined)?.toLowerCase() || bd.name.toLowerCase();
      // Fabric stores left/top as top-left corner; pass the center point to 3D viewer
      const objWidth = (obj.width ?? 0) * (obj.scaleX ?? 1);
      const objHeight = (obj.height ?? 0) * (obj.scaleY ?? 1);
      result.push({
        id: bd.id,
        name: surfaceType,
        type: surfaceType,
        width: bd.width,
        depth: bd.depth,
        canvasX: (obj.left ?? 0) + objWidth / 2,
        canvasY: (obj.top ?? 0) + objHeight / 2,
        canvasAngle: obj.angle ?? 0,
        wallHeights: bd.wallHeights,
        roofType: bd.roof.type,
        roofPitch: bd.roof.pitch,
        roofOverhang: bd.roof.overhang,
        color: bd.color,
      });

    });
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingDetails, canvasVersion]); // canvasVersion bumps on object move/scale/rotate
  const [existingBuildingsLoaded, setExistingBuildingsLoaded] = useState(false);
  const [loadingExistingBuildings, setLoadingExistingBuildings] = useState(false);
  const [loadingParcelsGeoJSON, setLoadingParcelsGeoJSON] = useState(false);
  const [loadingEditorData, setLoadingEditorData] = useState(true);
  /** Fully pre-processed site data (boundary, edges, elevations) from process-geometry API */
  const [processedSiteData, setProcessedSiteData] = useState<ProcessedSiteData | null>(null);


  // Compliance
  const [complianceChecks, setComplianceChecks] = useState<{ rule: string; status: string; message: string }[]>([]);
  const [unnamedElementsWarning, setUnnamedElementsWarning] = useState<{ index: number; type: string }[] | null>(null);

  // Right panel tabs — Phase 6 adds 'parcel' tab
  const [selectedBuildingId3d, setSelectedBuildingId3d] = useState<string | null>(null);
  const [zScale, setZScale] = useState(1.0);
  const [customDimensions, setCustomDimensions] = useState({ width: 10, depth: 8, groundHeight: 3 });

  // Guided creation (amateur-friendly flow)
  const [creationMode, setCreationMode] = useState<"guided" | "free">("guided");
  const [guidedStep, setGuidedStep] = useState(1);
  const [hideFreeDesignHint, setHideFreeDesignHint] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<ProjectPreset | null>(null);
  const [placementMode, setPlacementMode] = useState(false);
  const [lastPlacedBuildingId, setLastPlacedBuildingId] = useState<string | null>(null);

  // Phase 6: Parcel Management state
  const [parcelRoads, setParcelRoads] = useState<DetectedRoad[]>([]);

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
  // Undo/redo: history of canvas+buildingDetails states
  // (typed in pushUndoState block below)
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  /** Flag: true while undo/redo/clear restoring canvas → skip pushUndoState */
  const isRestoringRef = useRef(false);
  /** Save feedback toast: null | 'saved' | 'error' */
  const [saveStatus, setSaveStatus] = useState<'saved' | 'error' | null>(null);
  // Perf: debounce updateLayers so rapid canvas events don't spam O(n) layer recomputes
  const updateLayersDebounceRef = useRef<number | null>(null);

  // ─── Real-Time PLU Compliance Engine ──────────────────────────────────────
  const pluComplianceReport = usePluCompliance({
    fabricCanvasRef: fabricRef,
    pixelsPerMeter: currentScale.pixelsPerMeter,
    pluRules: projectData
      ? {
          maxCoverageRatio: projectData.maxCoverageRatio ?? null,
          setbacks: projectData.pluSetbacks
            ? {
                front: (projectData.pluSetbacks as Record<string, number>).front ?? null,
                side: (projectData.pluSetbacks as Record<string, number>).side ?? null,
                rear: (projectData.pluSetbacks as Record<string, number>).rear ?? null,
              }
            : null,
        }
      : null,
    parcelAreaM2: projectData?.parcelArea,
    debounceMs: 150,
  });

  // ─── VRD Drawing Engine (Polyline/Polygon state machine) ───────────────────
  const vrdDrawing = useVrdDrawing(fabricRef, {
    strokeWidth,
    onShapeFinalized: (obj) => {
      setIsDirty(true);
      if (fabricRef.current) updateLayers(fabricRef.current);
      runComplianceCheck();
      pushUndoState();
    },
  });

  // ─── Utility functions ──────────────────────────────────────────────────────

  const updateLayers = useCallback((canvas: fabric.Canvas) => {
    // Debounce: batch rapid canvas events into one update per 100ms
    if (updateLayersDebounceRef.current) window.clearTimeout(updateLayersDebounceRef.current);
    updateLayersDebounceRef.current = window.setTimeout(() => {
      updateLayersDebounceRef.current = null;
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
    }, 100);
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
      // Re-add template name label if this is a template element
      const tType = (obj as any).templateType;
      const eName = (obj as any).elementName;
      if (tType && eName && obj.type === "rect") {
        const canvas = fabricRef.current;
        if (canvas) {
          const tpl = templatesList.find((t) => t.id === tType);
          const color = tpl?.color || "#888";
          const l = obj.left ?? 0;
          const t2 = obj.top ?? 0;
          const h = (obj.height ?? 0) * (obj.scaleY ?? 1);
          const labelText = new fabric.Text(eName, {
            left: l + 4, top: t2 + 2,
            fontSize: Math.min(12, h * 0.3), fontFamily: "sans-serif",
            fill: color, selectable: false, evented: false,
          });
          (labelText as any).isMeasurement = true;
          (labelText as any).parentId = id;
          canvas.add(labelText);
          const existing = measurementLabelsRef.current.get(id) || [];
          existing.push(labelText);
          measurementLabelsRef.current.set(id, existing);
        }
      }
    },
    [removeMeasurements, addRectMeasurements, addPolygonMeasurements, addLineMeasurement, addCircleMeasurements]
  );

  // ─── Real-time compliance ──────────────────────────────────────────────────

  const complianceDebounceRef = useRef<number | null>(null);
  const undoDebounceRef = useRef<number | null>(null);
  const MAX_UNDO = 50;
  const initialLoadCompleteRef = useRef(false);

  // Each undo/redo entry stores BOTH the canvas JSON *and* the buildingDetails array
  // so `guided` buildings fully round-trip through undo/redo.
  type UndoEntry = { canvas: string; buildings: BuildingDetail[] };
  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);

  const pushUndoState = useCallback(() => {
    // Skip undo tracking during initial canvas setup (parcels, grid, saved data loading)
    if (!initialLoadCompleteRef.current) return;
    // Skip during undo/redo/clear restore — loadFromJSON fires object:added events
    if (isRestoringRef.current) return;
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (undoDebounceRef.current) window.clearTimeout(undoDebounceRef.current);
    undoDebounceRef.current = window.setTimeout(() => {
      undoDebounceRef.current = null;
      // Double-check restoring flag after debounce
      if (isRestoringRef.current) return;
      try {
        const json = JSON.stringify((canvas as any).toJSON([...CANVAS_PROPS]));
        // Snapshot current buildingDetails via a ref so the callback stays stable
        const buildings = buildingDetailsSnapshotRef.current;
        undoStackRef.current = undoStackRef.current.slice(-(MAX_UNDO - 1));
        undoStackRef.current.push({ canvas: json, buildings });
        redoStackRef.current = [];
        setCanUndo(undoStackRef.current.length > 0);
        setCanRedo(false);
      } catch { /* ignore */ }
    }, 300);
  }, []);

  const restoreUndoEntry = useCallback((entry: { canvas: string; buildings: BuildingDetail[] }, afterFn: () => void) => {
    const canvas = fabricRef.current;
    if (!canvas || !entry) return;
    isRestoringRef.current = true; // Prevent pushUndoState from clearing redo
    canvas.loadFromJSON(entry.canvas, () => {
      // Restore dark background — loadFromJSON may lose it
      canvas.backgroundColor = "#0f172a";
      canvas.renderAll();
      updateLayers(canvas);
      setBuildingDetails(entry.buildings);
      const pts: { id: string; x: number; y: number; value: number }[] = [];
      canvas.getObjects().forEach((o: any) => {
        if (o.isElevationPoint && o.elevationValue != null) {
          const c = (o as fabric.Object).getCenterPoint();
          pts.push({ id: o.id || `ep-${Date.now()}-${pts.length}`, x: c.x, y: c.y, value: o.elevationValue });
        }
      });
      setElevationPoints(pts);
      // Release the lock AFTER loadFromJSON has settled
      setTimeout(() => { isRestoringRef.current = false; }, 50);
      afterFn();
    });
  }, [updateLayers]);

  const handleUndo = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || undoStackRef.current.length === 0) return;
    const prev = undoStackRef.current.pop();
    setCanUndo(undoStackRef.current.length > 0);
    if (prev) {
      const currentJson = JSON.stringify((canvas as any).toJSON([...CANVAS_PROPS]));
      redoStackRef.current.push({ canvas: currentJson, buildings: buildingDetailsSnapshotRef.current });
      setCanRedo(true);
      restoreUndoEntry(prev, () => { });
    }
  }, [restoreUndoEntry]);

  const handleRedo = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || redoStackRef.current.length === 0) return;
    const next = redoStackRef.current.pop();
    setCanRedo(redoStackRef.current.length > 0);
    if (next) {
      const currentJson = JSON.stringify((canvas as any).toJSON([...CANVAS_PROPS]));
      undoStackRef.current.push({ canvas: currentJson, buildings: buildingDetailsSnapshotRef.current });
      setCanUndo(true);
      restoreUndoEntry(next, () => { });
    }
  }, [restoreUndoEntry]);

  const runComplianceCheck = useCallback(() => {
    if (!currentProjectId) return;
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (complianceDebounceRef.current) window.clearTimeout(complianceDebounceRef.current);
    complianceDebounceRef.current = window.setTimeout(async () => {
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
          // Phase 5: pass constructionType so compliance engine can apply per-type rules
          constructionType: o.constructionType,
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
        if (d.checks) { setComplianceChecks(d.checks); }
      } catch { /* ignore */ }
    }, 1500); // 1.5s debounce — compliance is an API call, no need to hammer on every keystroke
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

  // Phase 7: Draw building canvas overlays (overhang, interior layout, openings, wall thickness, rooms, envelope)
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || viewMode !== "2d") return;
    // Store ppm on canvas so overlay utilities can read it without prop drilling
    (canvas as any)._pixelsPerMeter = currentScale.pixelsPerMeter;

    // Re-draw overlays for every building
    buildingDetails.forEach((building) => {
      // Find the Fabric rect that represents this building
      const obj = canvas.getObjects().find((o: any) => o.id === building.id || o.buildingDetailId === building.id);
      if (!obj) return;
      // Clear old overlays for this building
      clearBuildingOverlays(canvas, building.id);
      // Draw new overlays
      drawOverhangOverlay(canvas, fabric, obj, building);
      drawWallThickness(canvas, fabric, obj, building);
      drawInteriorLayout(canvas, fabric, obj, building as any);
      drawRoomLabels(canvas, fabric, obj, building);
      drawBuildingOpenings(canvas, fabric, obj, building as any, currentScale.pixelsPerMeter);
      // Exterior envelope from PLU setbacks if available
      const setbacks = projectDataRef.current?.pluSetbacks;
      if (setbacks) {
        const maxSetback = Math.max(...Object.values(setbacks).filter((v): v is number => typeof v === "number"));
        if (maxSetback > 0) drawExteriorEnvelope(canvas, fabric, obj, building, maxSetback);
      }
    });

    canvas.requestRenderAll();
  }, [buildingDetails, viewMode, currentScale.pixelsPerMeter]);

  // Phase 8: Pencil path:created — tag freehand paths with a name so they pass save validation
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const onPathCreated = (e: any) => {
      const path = e.path;
      if (!path) return;
      if (!(path as any).elementName) (path as any).elementName = "Freehand Drawing";
      (path as any).isAnnotation = true;
      updateLayers(canvas);
      pushUndoState();
    };
    canvas.on("path:created", onPathCreated);
    return () => { canvas.off("path:created", onPathCreated); };
  }, [updateLayers, pushUndoState]);


  // ─── Grid ──────────────────────────────────────────────────────────────────

  const drawGrid = useCallback(
    (canvas: fabric.Canvas) => {
      const gridSize = currentScale.pixelsPerMeter;
      const w = canvasSize.width, h = canvasSize.height;
      // Draw grid covering 5x the canvas area so it's visible after auto-zoom panning
      const extW = w * 3, extH = h * 3;
      const startX = -w, startY = -h;

      const addGridLine = (coords: [number, number, number, number], stroke: string, sw: number) => {
        const l = new fabric.Line(coords, {
          stroke, strokeWidth: sw, selectable: false, evented: false, excludeFromExport: true,
        });
        (l as any).isGrid = true;
        canvas.add(l); canvas.sendObjectToBack(l);
      };

      for (let x = startX; x <= startX + extW; x += gridSize) addGridLine([x, startY, x, startY + extH], "#1e293b", 0.5);
      for (let y = startY; y <= startY + extH; y += gridSize) addGridLine([startX, y, startX + extW, y], "#1e293b", 0.5);
      const major = gridSize * 5;
      for (let x = startX; x <= startX + extW; x += major) addGridLine([x, startY, x, startY + extH], "#334155", 1);
      for (let y = startY; y <= startY + extH; y += major) addGridLine([startX, y, startX + extW, y], "#334155", 1);
    },
    [currentScale, canvasSize]
  );

  // ─── Data loading ──────────────────────────────────────────────────────────

  useEffect(() => { if (projectIdFromUrl) setCurrentProjectId(projectIdFromUrl); }, [projectIdFromUrl]);

  // NOTE: site-plan page does NOT need the full projects list at mount — removed.
  // Projects are fetched only when the project switcher dropdown is opened.

  // Perf: fetch project data on mount — canvas load waits for canvasReady, runs in parallel
  // COMPUTE SHIFT: processedSiteData is now pre-computed and stored in the DB.
  // We load it here and inject it into state immediately — zero async processing needed.
  useEffect(() => {
    if (!currentProjectId) { setProjectData(null); return; }

    // Retry logic: transient fetch failures (cold start, network glitch) shouldn't leave page blank
    const MAX_RETRIES = 3;
    let attempt = 0;

    const loadProject = () => {
      attempt++;
      fetch(`/api/projects/${currentProjectId}`)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
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
            parcelsGeoJSON: p.parcelsGeoJSON ?? null,
            existingBuildingsGeoJSON: p.existingBuildingsData ?? null,
            precomputedSiteData: p.processedSiteData ?? null,
          });

          // ── COMPUTE SHIFT: Load pre-computed ProcessedSiteData from DB ──
          if (p.processedSiteData) {
            const stored = typeof p.processedSiteData === "string"
              ? JSON.parse(p.processedSiteData)
              : p.processedSiteData;
            setProcessedSiteData(stored as ProcessedSiteData);
            // Sync into editor store for persistence across page refreshes
            useEditorStore.getState().setProcessedSiteData(stored as ProcessedSiteData);
          }
        })
        .catch((err) => {
          console.warn(`[site-plan] Project fetch attempt ${attempt}/${MAX_RETRIES} failed:`, err);
          if (attempt < MAX_RETRIES) {
            setTimeout(loadProject, 1000); // Retry after 1 second
          } else {
            console.error("[site-plan] All retries exhausted, page may be blank");
            setProjectData(null);
          }
        });
    };

    loadProject();
  }, [currentProjectId]);

  // ── Sync project data into editor store for persistence ──
  useEffect(() => {
    if (projectData && currentProjectId) {
      useEditorStore.getState().setProjectData(projectData);
    }
  }, [projectData, currentProjectId]);

  // Draw existing buildings from IGN BDTOPO GeoJSON stored on the project.
  // Each BDTOPO feature is a GeoJSON Polygon/MultiPolygon — we project every vertex
  // to canvas coordinates using the same geo->canvas transform as parcel boundaries.
  const drawExistingBuildingsFromGeoJSON = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || !projectData?.existingBuildingsGeoJSON || existingBuildingsLoaded) return;

    const fc = projectData.existingBuildingsGeoJSON as {
      type: string;
      features?: Array<{
        geometry?: { type: string; coordinates: unknown };
        properties?: Record<string, unknown>;
      }>;
    };
    if (fc.type !== "FeatureCollection" || !Array.isArray(fc.features) || fc.features.length === 0) {
      setExistingBuildingsLoaded(true);
      return;
    }

    // Build geo→canvas transform from parcel bounds
    const { getParcelBoundsAndRef, lngLatToCanvas } = require("@/lib/parcelGeometryToCanvas");
    const bounds = getParcelBoundsAndRef(projectData.parcelGeometry);
    if (!bounds) {
      // No parcel geometry to anchor to — skip (user can draw manually)
      setExistingBuildingsLoaded(true);
      return;
    }

    const ppm = currentScale.pixelsPerMeter;
    const centerCanvasX = canvasSize.width / 2;
    const centerCanvasY = canvasSize.height / 2;
    const transformOpts = {
      refLng: bounds.refLng,
      refLat: bounds.refLat,
      centerCanvasX,
      centerCanvasY,
      pixelsPerMeter: ppm,
    };

    let addedCount = 0;
    fc.features.forEach((feature, idx) => {
      const geom = feature?.geometry;
      if (!geom) return;

      const processRing = (ring: number[][]) => {
        if (!Array.isArray(ring) || ring.length < 3) return;
        const pts = ring.map(([lng, lat]: number[]) =>
          lngLatToCanvas(lng, lat, transformOpts)
        );
        // Shift all points so the polygon's local centroid is at (0,0) (Fabric requirement)
        const cxLocal = pts.reduce((s: number, p: { x: number; y: number }) => s + p.x, 0) / pts.length;
        const cyLocal = pts.reduce((s: number, p: { x: number; y: number }) => s + p.y, 0) / pts.length;
        const localPts = pts.map((p: { x: number; y: number }) => ({ x: p.x - cxLocal, y: p.y - cyLocal }));

        const poly = new fabric.Polygon(localPts, {
          left: cxLocal,
          top: cyLocal,
          originX: "center",
          originY: "center",
          fill: "rgba(107, 114, 128, 0.18)",
          stroke: "#4b5563",
          strokeWidth: 1.5,
          strokeDashArray: [5, 3],
          selectable: true,
          evented: true,
          lockMovementX: false,
          lockMovementY: false,
        });
        const bid = `bdtopo-${idx}-${addedCount}`;
        (poly as any).id = bid;
        const usage = (feature.properties?.usage as string) ?? "Bâtiment existant";
        const height = feature.properties?.height ? ` (${feature.properties.height}m)` : "";
        (poly as any).elementName = `${usage}${height}`;
        (poly as any).isExistingBuilding = true;
        (poly as any).sourceBdtopo = true;
        canvas.add(poly);
        canvas.sendObjectToBack(poly);
        addedCount++;
      };

      if (geom.type === "Polygon" && Array.isArray(geom.coordinates)) {
        const coords = geom.coordinates as number[][][];
        if (coords[0]) processRing(coords[0]); // exterior ring only
      } else if (geom.type === "MultiPolygon" && Array.isArray(geom.coordinates)) {
        const coords = geom.coordinates as number[][][][];
        coords.forEach((poly) => { if (poly[0]) processRing(poly[0]); });
      }
    });

    if (addedCount > 0) {
      canvas.renderAll();
      updateLayers(canvas);
    }
    setExistingBuildingsLoaded(true);
    setLoadingExistingBuildings(false);
  }, [projectData?.existingBuildingsGeoJSON, projectData?.parcelGeometry, existingBuildingsLoaded,
  currentScale.pixelsPerMeter, canvasSize, updateLayers]);

  useEffect(() => {
    if (projectData?.existingBuildingsGeoJSON && canvasReady && !existingBuildingsLoaded) {
      drawExistingBuildingsFromGeoJSON();
    }
  }, [projectData?.existingBuildingsGeoJSON, canvasReady, existingBuildingsLoaded, drawExistingBuildingsFromGeoJSON]);

  // ── Draw parcels: prefer DB-stored ProcessedSiteData, fallback to process-geometry API ──
  const drawParcelsFromProjectData = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas || !currentProjectId) return;
    if (!processedSiteData && !projectData?.parcelsGeoJSON && !projectData?.parcelGeometry) return;
    if (parcelsDrawnFromGeometryRef.current === currentProjectId) return;
    const hasParcel = canvas.getObjects().some((o: any) =>
      o.isParcel || (o as any).processedBoundary || (o as any).processedParcel
    );
    if (hasParcel) return;

    parcelsDrawnFromGeometryRef.current = currentProjectId;
    setLoadingParcelsGeoJSON(true);

    const pd = projectData; // capture for TS narrowing

    // ── Check for pre-computed data first (instant load) ─────────────────
    // When the project was created, the process-geometry pipeline runs and
    // saves ProcessedSiteData to the DB. Use it directly to skip the 2-3s API call.
    let siteData: ProcessedSiteData | null = null;

    if (pd?.precomputedSiteData) {
      try {
        siteData = pd.precomputedSiteData as ProcessedSiteData;
        console.log("[site-plan] Using pre-computed ProcessedSiteData from DB (instant load)");
      } catch {
        console.warn("[site-plan] Failed to parse pre-computed site data, falling back to API");
      }
    }

    // ── Fallback: call process-geometry API if no pre-computed data ──────
    if (!siteData) {
      const geoSource = pd?.parcelsGeoJSON || pd?.parcelGeometry;

      let parcelFeatures: any[] = [];
      try {
        const parsed = typeof geoSource === "string" ? JSON.parse(geoSource) : geoSource;
        if (parsed?.type === "FeatureCollection" && Array.isArray(parsed.features)) {
          parcelFeatures = parsed.features.filter((f: any) => {
            const gt = f?.geometry?.type;
            return gt === "Polygon" || gt === "MultiPolygon";
          });
        } else if (parsed?.type === "Feature" && parsed.geometry) {
          parcelFeatures = [parsed];
        } else if (parsed?.type === "Polygon" || parsed?.type === "MultiPolygon") {
          parcelFeatures = [{ type: "Feature", properties: {}, geometry: parsed }];
        }
      } catch (e) {
        console.warn("[site-plan] Failed to parse GeoJSON for process-geometry:", e);
      }

      if (parcelFeatures.length === 0) {
        setLoadingParcelsGeoJSON(false);
        return;
      }

      try {
        const apiPayload = {
          parcels: parcelFeatures.map((f: any, idx: number) => ({
            type: f.type,
            properties: {
              id: f.properties?.id || f.properties?.IDU || `parcel-${idx}`,
              section: f.properties?.section || f.properties?.SEC || "",
              number: f.properties?.number || f.properties?.NUM || "",
              area: f.properties?.area || f.properties?.contenance || 0,
            },
            geometry: f.geometry,
          })),
        };

        const res = await fetch("/api/projects/process-geometry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(apiPayload),
        });

        if (res.ok) {
          siteData = await res.json() as ProcessedSiteData;
        }
      } catch (err) {
        console.error("[site-plan] process-geometry API error:", err);
      }
    }

    // ── Render with ProcessedSiteData (from DB or API) ───────────────────
    try {
      if (siteData) {
        // ── Normalize: bridge gis-pipeline format → rendering pipeline format ──
        // The gis-pipeline returns { mergedBoundary, edges: [{from: idx, to: idx}] }
        // but the rendering pipeline expects { globalBoundary, edges: [{from: Vertex3D, to: Vertex3D}] }
        const normalized = siteData as any;
        if (normalized.mergedBoundary && !normalized.globalBoundary) {
          normalized.globalBoundary = normalized.mergedBoundary;
        }
        // Normalize refPoint if missing (compute from globalBoundary bbox center)
        if (!normalized.refPoint && normalized.globalBoundary?.geometry) {
          const geom = normalized.globalBoundary.geometry;
          const coords = geom.type === "Polygon" ? geom.coordinates[0] : geom.coordinates.flatMap((p: any) => p[0]);
          if (coords.length > 0) {
            let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
            for (const [lng, lat] of coords) {
              if (lng < minLng) minLng = lng;
              if (lng > maxLng) maxLng = lng;
              if (lat < minLat) minLat = lat;
              if (lat > maxLat) maxLat = lat;
            }
            normalized.refPoint = { lng: (minLng + maxLng) / 2, lat: (minLat + maxLat) / 2 };
          }
        }
        // Normalize edges: if they use index-based { from: number, to: number, length },
        // convert to vertex-based { from: Vertex3D, to: Vertex3D, lengthMeters }
        if (normalized.edges?.length > 0 && typeof normalized.edges[0].from === "number") {
          const verts = normalized.vertices3D || [];
          normalized.edges = normalized.edges.map((e: any) => ({
            from: verts[e.from] || { lng: 0, lat: 0, elevation: 0 },
            to: verts[e.to] || { lng: 0, lat: 0, elevation: 0 },
            lengthMeters: e.length || e.lengthMeters || 0,
          }));
        }
        // Normalize parcels: convert from any DB/API format to ProcessedParcel[]
        // Known input formats:
        //   A) ProcessedParcel: { id, section, number, area, coordinates: number[][][] }
        //   B) ParcelInput (GeoJSON Feature): { type:"Feature", properties:{id,...}, geometry:{type:"Polygon",coordinates:[...]}}
        //   C) Raw geometry: { type:"Polygon", coordinates: [...] }
        if (normalized.parcels?.length > 0) {
          normalized.parcels = normalized.parcels.map((p: any, idx: number) => {
            // ── Format A: already a ProcessedParcel ──
            // Has top-level coordinates AND no geometry wrapper
            if (
              Array.isArray(p.coordinates) &&
              p.coordinates.length > 0 &&
              !p.geometry &&
              p.type !== "Feature"
            ) {
              return {
                id: p.id || `parcel-${idx}`,
                section: p.section || "",
                number: p.number || "",
                area: typeof p.area === "number" ? p.area : 0,
                coordinates: p.coordinates,
              };
            }

            // ── Format B: GeoJSON Feature ──
            // { type: "Feature", properties: {...}, geometry: { type: "Polygon", coordinates: [...] } }
            const geom = p.geometry ?? (p.type === "Polygon" || p.type === "MultiPolygon" ? p : null);
            if (geom?.coordinates) {
              let coordinates: number[][][] = [];
              if (geom.type === "Polygon") {
                coordinates = geom.coordinates as number[][][];
              } else if (geom.type === "MultiPolygon") {
                // Find the ring with the most vertices (largest polygon)
                let bestRings: number[][][] = (geom.coordinates as number[][][][])?.[0] || [];
                let bestLen = 0;
                for (const poly of (geom.coordinates as number[][][][])) {
                  const ringLen = poly?.[0]?.length ?? 0;
                  if (ringLen > bestLen) { bestLen = ringLen; bestRings = poly; }
                }
                coordinates = bestRings;
              }

              // Validate: outer ring must have ≥3 WGS84 points
              // France is roughly lng: -5..10, lat: 41..52
              const outerRing = coordinates[0];
              if (!Array.isArray(outerRing) || outerRing.length < 3) return null;
              const sampleLng = outerRing[0]?.[0];
              const sampleLat = outerRing[0]?.[1];
              if (!Number.isFinite(sampleLng) || !Number.isFinite(sampleLat)) return null;
              // Reject obviously swapped coordinates (lat stored as lng would be ~44, not ~2)
              if (Math.abs(sampleLng) > 180 || Math.abs(sampleLat) > 90) return null;

              const props = p.properties ?? {};
              return {
                id: props.id || props.IDU || p.id || `parcel-${idx}`,
                section: String(props.section ?? props.SEC ?? p.section ?? ""),
                number: String(props.number ?? props.NUM ?? p.number ?? ""),
                area: Number(props.area ?? props.contenance ?? p.area ?? 0),
                coordinates,
              };
            }

            // ── Fallback: use whatever coordinates exist raw ──
            if (Array.isArray(p.coordinates) && p.coordinates.length > 0) {
              return {
                id: p.id || `parcel-${idx}`,
                section: p.section || "",
                number: p.number || "",
                area: typeof p.area === "number" ? p.area : 0,
                coordinates: p.coordinates,
              };
            }

            // Cannot extract geometry — drop this parcel
            console.warn(`[site-plan] Could not extract coordinates for parcel ${idx}`, p);
            return null;
          }).filter(Boolean);
        }
        // Ensure topographyGrid and stats have expected fields
        if (!normalized.topographyGrid) normalized.topographyGrid = [];
        if (normalized.stats && !("meanElevation" in normalized.stats)) {
          normalized.stats.meanElevation = normalized.stats.avgElevation ?? 0;
        }
        if (normalized.stats && !("slopePercent" in normalized.stats)) {
          normalized.stats.slopePercent = null;
        }

        siteData = normalized as ProcessedSiteData;
        setProcessedSiteData(siteData);

        // ── Build setback config from PLU data ──
        const pluSb = (projectData as any)?.pluSetbacks || {};
        const sbConfig: SetbackConfig | undefined = (pluSb.front || pluSb.side || pluSb.rear)
          ? { front: pluSb.front ?? 5, side: pluSb.side ?? 3, rear: pluSb.rear ?? 4 }
          : { front: 5, side: 3, rear: 4 }; // Default UC zone setbacks for demo

        // ── Render using the full pipeline (boundary + parcels + setbacks + edge labels + NGF labels) ──
        const projected = renderProcessedSite(
          fabric as any,
          canvas as any,
          siteData,
          {
            canvasWidth: canvasSize.width,
            canvasHeight: canvasSize.height,
            pixelsPerMeter: currentScale.pixelsPerMeter,
          },
          sbConfig
        );

        // Store setback segments for the snap engine
        setbackSegmentsRef.current = projected.setbackSegments || [];

        // Also set elevation points from the projected data for the terrain store
        if (projected.vertexLabels && projected.vertexLabels.length > 0) {
          const pts = projected.vertexLabels
            .map((label, i) => ({
              id: `ngf-${i}`,
              x: label.position.x,
              y: label.position.y,
              value: parseFloat(label.text.replace(/[^0-9.]/g, "")) || 0,
            }))
            .filter(p => p.value > 0);
          if (pts.length > 0) setElevationPoints(pts);
        }

        // ── Auto-zoom-to-fit: use ALL parcel absolute canvas points ──────────
        // This replaces the old approach of using the merged boundary polygon,
        // which was inaccurate when parcels were small or the boundary was a
        // simplified union. We compute bbox from every corner of every parcel.
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        // Primary: walk all parcel absolutePoints (real projected corner coords)
        if (projected.parcels && projected.parcels.length > 0) {
          projected.parcels.forEach((parcel) => {
            if (parcel.absolutePoints) {
              parcel.absolutePoints.forEach((pt) => {
                if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
                if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
              });
            } else {
              // Fallback: centroid + relative points
              parcel.points.forEach((p) => {
                const px = parcel.left + p.x;
                const py = parcel.top + p.y;
                if (px < minX) minX = px; if (px > maxX) maxX = px;
                if (py < minY) minY = py; if (py > maxY) maxY = py;
              });
            }
          });
        }

        // Fallback to merged boundary if no parcel points available
        if (!Number.isFinite(minX)) {
          const boundary = projected.boundary;
          if (boundary && boundary.points.length > 0) {
            boundary.points.forEach((p) => {
              const px = boundary.left + p.x;
              const py = boundary.top + p.y;
              if (px < minX) minX = px; if (px > maxX) maxX = px;
              if (py < minY) minY = py; if (py > maxY) maxY = py;
            });
          }
        }

        if (Number.isFinite(minX) && maxX > minX && maxY > minY) {
          const parcelsW = maxX - minX;
          const parcelsH = maxY - minY;
          const containerEl = containerRef?.current;
          const viewW = containerEl ? containerEl.clientWidth : canvasSize.width;
          const viewH = containerEl ? containerEl.clientHeight : canvasSize.height;
          const padding = 80;
          const zoomX = (viewW - padding * 2) / parcelsW;
          const zoomY = (viewH - padding * 2) / parcelsH;
          // Allow full zoom range: 0.1 (very large site) to 20 (small parcel)
          // 0.95 cap was wrong — it prevented seeing small parcels correctly
          const targetZoom = Math.max(0.1, Math.min(zoomX, zoomY, 20));
          if (isFinite(targetZoom)) {
            const centerPX = (minX + maxX) / 2;
            const centerPY = (minY + maxY) / 2;
            canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
            const vpt: [number, number, number, number, number, number] = [
              targetZoom, 0, 0, targetZoom,
              viewW / 2 - centerPX * targetZoom,
              viewH / 2 - centerPY * targetZoom,
            ];
            canvas.setViewportTransform(vpt);
            setZoom(Math.round(targetZoom * 100));
          }
        }
      } else {
        // No ProcessedSiteData available and API fallback failed — nothing to render
        console.warn("[site-plan] No ProcessedSiteData available, skipping parcel rendering");
      }
    } catch (err) {
      console.error("[site-plan] Error in drawParcelsFromProjectData:", err);
    }

    canvas.renderAll();
    updateLayers(canvas);
    setLoadingParcelsGeoJSON(false);
  }, [currentProjectId, processedSiteData, projectData?.parcelsGeoJSON, projectData?.parcelGeometry, currentScale.pixelsPerMeter, canvasSize, updateLayers]);

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
                // ─── Pass 1: Remove orphaned measurement/overlay objects ─────────────
                // Objects saved before CANVAS_PROPS was added lost their isMeasurement flag.
                // Reliable heuristic: selectable=false + evented=false + no elementName
                // = system-generated marker (dimension line, corner node, label text).
                // We delete them so they don't pollute the canvas or trigger the naming warning.
                const toRemove = canvas.getObjects().filter((o: any) => {
                  if (o.isGrid || o.isPolygonPreview) return false; // keep explicit grid
                  
                  // Aggressive purge for objects that were accidentally serialized 
                  // to the database due to CANVAS_PROPS including their flags.
                  const eName = String(o.elementName ?? o.name ?? "").trim();
                  if (o.isParcel || o.isBoundaryOverlay || o.isRegulatoryFootprint || o.isMeasurement || eName.startsWith("Parcelle")) {
                    return true;
                  }

                  if (o.selectable === false && o.evented === false) {
                    const name = String(o.elementName ?? o.name ?? "").trim();
                    const hasUserMeaning = name || o.surfaceType || o.isElevationPoint;
                    if (!hasUserMeaning) return true; // orphaned measurement object → delete
                  }
                  return false;
                });
                toRemove.forEach((o: any) => canvas.remove(o));

                // ─── Pass 2: Re-apply elementNames + rehydrate tags ──────────────────
                const savedElements = Array.isArray(data.sitePlan?.elements) ? data.sitePlan.elements : [];
                const userObjects = canvas.getObjects().filter((o: any) => !o.isGrid && !o.isMeasurement && !o.isPolygonPreview);
                savedElements.forEach((el: any, i: number) => { if (userObjects[i] && el?.name) (userObjects[i] as any).elementName = el.name; });
                // Rehydrate flags for objects that DID preserve their data fields
                canvas.getObjects().forEach((o: any) => {
                  if (o.isMeasurement || o.isGrid) return;
                  if (o.elevationValue != null) o.isElevationPoint = true;
                  if (o.vegetationType != null) o.isVegetation = true;
                  if (o.buildingDetailId != null) o.buildingDetailId = o.buildingDetailId;
                  if (o.parentId && !String(o.elementName ?? "").trim()) o.isMeasurement = true;
                });

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

  // ── Stable refs for callbacks — prevents effect re-fire on scale/canvas changes ──
  const loadSitePlanRef = useRef(loadSitePlan);
  loadSitePlanRef.current = loadSitePlan;
  const drawParcelsRef = useRef(drawParcelsFromProjectData);
  drawParcelsRef.current = drawParcelsFromProjectData;

  useEffect(() => {
    if (currentProjectId && canvasReady) {
      setLoadingEditorData(true);
      loadSitePlanRef.current(currentProjectId, () => {
        drawParcelsRef.current();
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
        setLoadingEditorData(false);
        // Mark initial load as complete — enable undo/redo tracking from this point
        initialLoadCompleteRef.current = true;
        // Clear any stale undo/redo from setup events and take a clean baseline
        undoStackRef.current = [];
        redoStackRef.current = [];
        setCanUndo(false);
        setCanRedo(false);
        // Take one baseline snapshot so the first undo reverts to the loaded state
        setTimeout(() => {
          const c = fabricRef.current;
          if (c) {
            try {
              const json = JSON.stringify((c as any).toJSON([...CANVAS_PROPS]));
              undoStackRef.current = [{ canvas: json, buildings: buildingDetailsSnapshotRef.current }];
              setCanUndo(false); // baseline itself shouldn't be "undoable"
              // ── Persist canvas snapshot to editor store ──
              useEditorStore.getState().setCanvasData(json);
              useEditorStore.getState().setBuildingDetails(buildingDetailsSnapshotRef.current);
              useEditorStore.getState().markClean(); // Initial load = not dirty
            } catch { /* ignore */ }
          }
        }, 500);
      });
    } else {
      setLoadingEditorData(false);
    }
  }, [currentProjectId, canvasReady]); // Only re-run when project or canvas readiness changes

  // ── RACE-CONDITION FIX: re-draw parcels when data arrives late ──────────────
  // On refresh, loadSitePlan's callback calls drawParcelsFromProjectData() before
  // the /api/projects/{id} fetch completes → data is null → early return.
  // This effect ensures parcels are drawn when processedSiteData OR projectData becomes available.
  // Guards inside drawParcelsFromProjectData (parcelsDrawnFromGeometryRef, hasParcel)
  // prevent double-drawing when data arrives in the correct order.
  useEffect(() => {
    if (canvasReady && currentProjectId && (processedSiteData || projectData?.parcelsGeoJSON)) {
      // Only trigger if parcels haven't been drawn yet for this project
      if (parcelsDrawnFromGeometryRef.current !== currentProjectId) {
        const canvas = fabricRef.current;
        const hasParcel = canvas?.getObjects().some((o: any) => (o as any).isParcel);
        if (!hasParcel) {
          drawParcelsRef.current();
        }
      }
    }
  }, [canvasReady, currentProjectId, processedSiteData, projectData?.parcelsGeoJSON]);

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

    // Production-grade overlay/internal-object predicate.
    // Any object produced by the system (markers, measurements, internal overlays)
    // is excluded from the "must have a name" requirement.
    const isOverlay = (o: any) =>
      o.isGrid ||
      o.isMeasurement ||
      o.isPolygonPreview ||
      o.isBoundaryOverlay ||
      o.isBoundaryDimension ||
      o.isRegulatoryFootprint ||
      o.isNorthArrow ||
      o.isInteriorLayout ||
      o.isBuildingOpening ||
      o.isBuildingOverhang ||
      o.isExteriorEnvelope ||
      o.isWallThickness ||
      o.isRoomLabel ||
      o.isElevationPoint ||
      o.isVegetation ||
      o.isViewpoint ||
      o.isAnnotation ||
      o.isVrd ||
      o.isSectionLine ||
      o.excludeFromExport === true;
    const drawable = canvas.getObjects().filter((o: any) => !isOverlay(o));
    const ppm = currentScale.pixelsPerMeter;
    const toM = (p: number) => p / ppm;

    const elements = drawable.map((o: any) => {
      // Auto-name fallback: if an object has a known type marker but no name, infer one.
      const inferredName =
        o.isParcel ? "Land Parcel" :
          o.isVrd ? o.vrdType || "VRD" :
            o.isSectionLine ? "Section line" :
              o.isAnnotation ? (o.type === "i-text" ? "Text Label" : o.elementName || "Annotation") :
                o.type === "i-text" ? "Text Label" :
                  o.type === "path" ? "Freehand Drawing" :
                    null;
      const rawName = String(o.elementName ?? o.name ?? "").trim();
      const name = rawName || inferredName || "Unnamed";
      // Backfill the elementName so the layers panel and save both reflect it
      if (!rawName && inferredName) {
        o.elementName = inferredName;
        o.name = inferredName;
      }
      return {
        type: o.type, name: name || "Unnamed",
        category: o.templateType || o.surfaceType === "building" ? "building" : undefined,
        templateType: o.templateType, surfaceType: o.surfaceType, vrdType: o.vrdType,
        constructionType: o.constructionType,
        width: o.width, height: o.height,
        area: o.width != null && o.height != null ? toM(o.width * (o.scaleX || 1)) * toM(o.height * (o.scaleY || 1)) : undefined,
      };
    });



    setSaving(true);
    try {
      const elementsToSend = elements.map(({ _index, ...rest }: any) => rest);
      const canvasData = (canvas as any).toJSON([...CANVAS_PROPS]);
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
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus(null), 2500);
        const compRes = await fetch("/api/compliance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: currentProjectId, elements: elementsToSend }),
        });
        const compData = await compRes.json();
        if (compData.checks) { setComplianceChecks(compData.checks); }
        setSaving(false);
        return true;
      }
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (e) {
      console.error(e);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 3000);
    }
    setSaving(false);
    return false;
  }, [currentProjectId, currentScale.pixelsPerMeter, projectData, buildingDetails]);

  // Auto-save every 45s when dirty so content is not lost if user navigates via menu
  useEffect(() => {
    if (!isDirty || !currentProjectId) return;
    const t = setInterval(() => saveSitePlan(), 45000);
    return () => clearInterval(t);
  }, [isDirty, currentProjectId, saveSitePlan]);

  // ── Auto-save on unmount (router navigation away from the page) ──────────
  // Next.js SPA router does NOT trigger beforeunload, so we save in cleanup.
  // Refs capture the latest state without stale closures.
  const isDirtyAutosaveRef = useRef(false);
  useEffect(() => { isDirtyAutosaveRef.current = isDirty; }, [isDirty]);
  const saveSitePlanAutosaveRef = useRef(saveSitePlan);
  useEffect(() => { saveSitePlanAutosaveRef.current = saveSitePlan; }, [saveSitePlan]);
  const projectIdAutosaveRef = useRef(currentProjectId);
  useEffect(() => { projectIdAutosaveRef.current = currentProjectId; }, [currentProjectId]);

  useEffect(() => {
    return () => {
      // Only fire if: load completed AND project exists AND unsaved changes
      if (
        initialLoadCompleteRef.current &&
        projectIdAutosaveRef.current &&
        isDirtyAutosaveRef.current
      ) {
        // Fire-and-forget (can't await in cleanup function)
        saveSitePlanAutosaveRef.current().catch(() => {/* silent */});
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — intentionally empty: mount/unmount only


  // ─── Guided placement & preset helpers (must be before canvas mouse handlers) ─
  const addBuildingToCanvasAt = useCallback(
    (b: BuildingDetail, isExisting: boolean, centerX: number, centerY: number, surfaceType: string = "house") => {
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
      (rect as any).surfaceType = surfaceType;
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

      if (selectedPreset.surfaceType === "garden" || selectedPreset.category === "other") {
        const wPx = metersToPixels(selectedPreset.width);
        const dPx = metersToPixels(selectedPreset.depth);
        const fill =
          selectedPreset.surfaceType === "garden"
            ? "rgba(34, 197, 94, 0.4)"
            : "rgba(168, 162, 158, 0.3)";
        const stroke = selectedPreset.surfaceType === "garden" ? "#22c55e" : "#a8a29e";
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
        // ── 3D bridge: set buildingDetailId so userBuildings3d can find this shape ──
        (rect as any).buildingDetailId = shapeId;
        canvas.add(rect);
        addRectMeasurements(rect as fabric.Rect, shapeId);
        canvas.renderAll();
        updateLayers(canvas);

        // Create a minimal BuildingDetail so the element appears in the 3D viewer.
        // name = lowercase surfaceType (e.g. 'garden') so Terrain3DViewer type-matching works.
        const surfType = selectedPreset.surfaceType; // 'garden' | 'other'
        const flatPreset = getPresetById("green"); // closest physical preset
        if (flatPreset) {
          const b = createDefaultBuilding({
            name: surfType, // lowercase — critical for Terrain3DViewer type-matching
            width: selectedPreset.width,
            depth: selectedPreset.depth,
            wallHeights: flatPreset.wallHeights,
            roof: { type: flatPreset.roof.type, pitch: flatPreset.roof.pitch, overhang: flatPreset.roof.overhang, material: "None" },
            color: stroke,
          });
          (b as any).id = shapeId;
          setBuildingDetails((prev) => [...prev, b]);
        }

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
      addBuildingToCanvasAt(b, false, pointerX, pointerY, selectedPreset.surfaceType);
      setLastPlacedBuildingId(b.id);
      setPlacementMode(false);
      setGuidedStep(3);
    },
    [selectedPreset, customDimensions, buildingDetailFromPreset, metersToPixels, addRectMeasurements, updateLayers, addBuildingToCanvasAt]
  );

  useEffect(() => {
    placeGuidedBuildingAtRef.current = placeGuidedBuildingAt;
  }, [placeGuidedBuildingAt]);

  // ─── Canvas init & resize ──────────────────────────────────────────────────
  
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ width, height });
        if (fabricRef.current) {
          fabricRef.current.setDimensions({ width, height });
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // CRITICAL: Do NOT include viewMode in deps — canvas must persist across 2D/3D switches
    if (!canvasRef.current) return;
    // Skip re-init if canvas already exists
    if (fabricRef.current) return;

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
    canvas.on("object:modified", (e) => {
      setIsDirty(true);
      if (e.target) updateObjectMeasurements(e.target);
      // Clean up snap highlight lines
      const snapLines = canvas.getObjects().filter((o: any) => o._snapHighlight);
      if (snapLines.length) canvas.remove(...snapLines);
      // Bump canvasVersion so userBuildings3d reflects the new position in 3D
      setCanvasVersion((v) => v + 1);
      runComplianceCheck();
      pushUndoState();
    });
    canvas.on("object:scaling", (e) => { if (e.target) updateObjectMeasurements(e.target); runComplianceCheck(); });
    canvas.on("object:moving", (e) => {
      if (!e.target) return;
      const obj = e.target;

      // ── Grid snap ──
      if (snapEnabledRef.current) {
        const gridSize = currentScale.pixelsPerMeter;
        const left = obj.left ?? 0;
        const top = obj.top ?? 0;
        obj.set({ left: Math.round(left / gridSize) * gridSize, top: Math.round(top / gridSize) * gridSize });
        obj.setCoords();
      }

      // ── Magnetic setback snap ──
      if (setbackSegmentsRef.current.length > 0 && (obj as any).isBuilding) {
        const bbox = {
          cx: obj.left ?? 0,
          cy: obj.top ?? 0,
          width: (obj.width ?? 0) * (obj.scaleX ?? 1),
          height: (obj.height ?? 0) * (obj.scaleY ?? 1),
          angle: obj.angle ?? 0,
        };

        const snap = findNearestSetbackSnap(bbox, setbackSegmentsRef.current, 15);

        // Remove old snap highlight
        const old = canvas.getObjects().filter((o: any) => o._snapHighlight);
        if (old.length) canvas.remove(...old);

        if (snap) {
          obj.set({ left: snap.snapLeft, top: snap.snapTop, angle: snap.angle });
          obj.setCoords();

          // Draw snap highlight line
          const line = new fabric.Line(
            [snap.segment.p1.x, snap.segment.p1.y, snap.segment.p2.x, snap.segment.p2.y],
            {
              stroke: "#06b6d4",
              strokeWidth: 3,
              strokeDashArray: [4, 2],
              selectable: false,
              evented: false,
              _snapHighlight: true,
            } as any
          );
          canvas.add(line);
        }
      }

      updateObjectMeasurements(e.target);
      runComplianceCheck();
    });
    canvas.on("object:added", (e: any) => {
      // Skip ALL internal helper objects — triggering state here causes infinite loops
      // because state updates → re-renders → useEffects remove helpers → object:removed → repeat
      const o = e.target as any;
      if (o?.isMeasurement || o?._snapHighlight || o?.isGrid || o?.isPolygonPreview || o?.isRegulatoryFootprint || o?.excludeFromExport) return;
      setIsDirty(true); updateLayers(canvas); runComplianceCheck(); pushUndoState();
    });
    canvas.on("object:removed", (e: any) => {
      const o = e.target as any;
      if (o?.isMeasurement || o?._snapHighlight || o?.isGrid || o?.isPolygonPreview || o?.isRegulatoryFootprint || o?.excludeFromExport) return;
      setIsDirty(true); updateLayers(canvas); runComplianceCheck(); pushUndoState();
    });



    return () => { setCanvasReady(false); fabricRef.current = null; canvas.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Mouse handlers ────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || viewMode !== "2d") return;

    const handleMouseMove = (e: fabric.TPointerEventInfo) => {
      // Avoid null {0,0} fallback on spurious events
      if (!e.scenePoint && !e.viewportPoint) return;
      const pointer = e.scenePoint || e.viewportPoint || { x: 0, y: 0 };
      // NOTE: setMousePos is intentionally NOT here — it lives in a separate
      // lightweight useEffect below to prevent infinite re-render loops.

      if (isDrawingRef.current && drawingStartRef.current) {
        const distance = calculateDistance(drawingStartRef.current.x, drawingStartRef.current.y, pointer.x, pointer.y);
        if (activeTool === "line" || activeTool === "measure" || activeTool === "vrd" || activeTool === "section") {
          setCurrentMeasurement(formatMeasurement(distance));
        } else if (activeTool === "rectangle") {
          const w = pixelsToMeters(Math.abs(pointer.x - drawingStartRef.current.x));
          const h = pixelsToMeters(Math.abs(pointer.y - drawingStartRef.current.y));
          setCurrentMeasurement(`${formatMeasurement(w)} x ${formatMeasurement(h)}`);
        } else if (activeTool === "circle") {
          setCurrentMeasurement(`\u00D8 ${formatMeasurement(distance * 2)}`);
        }

        if (tempShapeRef.current) {
          canvas.remove(tempShapeRef.current);
          tempShapeRef.current = null;
        }
        let newTemp: fabric.FabricObject | null = null;

        if (activeTool === "line" || activeTool === "measure" || activeTool === "vrd" || activeTool === "section") {
          const vrdColor = activeTool === "vrd" ? activeVrdType.color : undefined;
          const sectionColor = activeTool === "section" ? "#ec4899" : undefined;
          newTemp = new fabric.Line([drawingStartRef.current.x, drawingStartRef.current.y, pointer.x, pointer.y], {
            stroke: sectionColor || (activeTool === "measure" ? "#22c55e" : vrdColor || activeColor),
            strokeWidth: activeTool === "measure" ? 2 : strokeWidth,
            strokeDashArray: activeTool === "section" ? [12, 6] : (activeTool === "measure" || activeTool === "vrd" ? [8, 4] : undefined),
            selectable: false, evented: false,
          });
        } else if (activeTool === "rectangle") {
          newTemp = new fabric.Rect({
            left: Math.min(drawingStartRef.current.x, pointer.x), top: Math.min(drawingStartRef.current.y, pointer.y),
            width: Math.abs(pointer.x - drawingStartRef.current.x), height: Math.abs(pointer.y - drawingStartRef.current.y),
            fill: "transparent", stroke: activeColor, strokeWidth, selectable: false, evented: false,
          });
        } else if (activeTool === "circle") {
          const r = Math.sqrt(Math.pow(pointer.x - drawingStartRef.current.x, 2) + Math.pow(pointer.y - drawingStartRef.current.y, 2));
          newTemp = new fabric.Circle({
            left: drawingStartRef.current.x - r, top: drawingStartRef.current.y - r, radius: r,
            fill: "transparent", stroke: activeColor, strokeWidth, selectable: false, evented: false,
          });
        }

        if (newTemp) { canvas.add(newTemp); tempShapeRef.current = newTemp; }
      }
    };

    const handleMouseDown = (e: fabric.TPointerEventInfo) => {
      const pointer = e.scenePoint || e.viewportPoint || { x: 0, y: 0 };

      if (placementMode && selectedPreset) {
        placeGuidedBuildingAtRef.current(pointer.x, pointer.y);
        return;
      }

      if (activeTool === "select" || activeTool === "pan" || activeTool === "pencil") return;

      // If user clicked on an existing canvas object (to move/select it), don't start drawing a new shape.
      // Only skip for tools that draw shapes via drag (not point-click tools like text/callout/elevation/vegetation/viewpoint).
      const DRAG_DRAW_TOOLS = ["line", "rectangle", "circle", "measure", "vrd", "section", "arrow"];
      if (DRAG_DRAW_TOOLS.includes(activeTool)) {
        const hitTarget = (e as any).target;
        if (hitTarget && !(hitTarget as any).isMeasurement && !(hitTarget as any).isGrid && !(hitTarget as any).isPolygonPreview) {
          // Clicked on an existing real object — let Fabric handle move/select, don't draw.
          return;
        }
      }
      if (activeTool === "text") {
        // Phase 8: IText — editable text, immediately enters edit mode
        const itext = new fabric.IText("Text", {
          left: pointer.x,
          top: pointer.y,
          fontSize: 16,
          fill: activeColor,
          fontFamily: "sans-serif",
          selectable: true,
          editable: true,
        });
        (itext as any).elementName = "Text Label";
        (itext as any).isAnnotation = true;
        canvas.add(itext);
        canvas.setActiveObject(itext);
        itext.enterEditing();
        itext.selectAll();
        canvas.requestRenderAll();
        pushUndoState();
        return;
      }
      if (activeTool === "callout") {
        // Phase 8: Callout bubble
        const bx = pointer.x - 60, by = pointer.y - 30;
        const bubble = new fabric.Rect({
          left: bx, top: by, width: 120, height: 60,
          rx: 10, ry: 10,
          fill: "rgba(255,255,255,0.9)", stroke: activeColor, strokeWidth: 1.5,
          selectable: false,
        });
        const itext = new fabric.IText("Note...", {
          left: bx + 8, top: by + 12,
          fontSize: 13, fill: "#1e293b", fontFamily: "sans-serif",
          width: 104, selectable: false,
        });
        const group = new fabric.Group([bubble, itext], {
          left: pointer.x - 60, top: pointer.y - 30,
          selectable: true,
        });
        (group as any).elementName = "Callout";
        (group as any).isAnnotation = true;
        canvas.add(group);
        canvas.setActiveObject(group);
        canvas.requestRenderAll();
        pushUndoState();
        return;
      }

      // Phase 8: Arrow annotation — handled in mouseUp (needs start+end drag)
      if (activeTool === "arrow") {
        setIsDrawing(true);
        return;
      }

      if (activeTool === "elevation" || activeTool === "vegetation" || activeTool === "viewpoint") {
        const evt = e.e as MouseEvent | TouchEvent;
        const rect = containerRef.current?.getBoundingClientRect();
        const clientX = (evt as MouseEvent).clientX ?? (evt as TouchEvent).touches?.[0]?.clientX ?? 0;
        const clientY = (evt as MouseEvent).clientY ?? (evt as TouchEvent).touches?.[0]?.clientY ?? 0;
        const x = rect ? clientX - rect.left : clientX;
        const y = rect ? clientY - rect.top : clientY;
        setInlinePrompt({ type: activeTool as "elevation" | "vegetation" | "viewpoint", clientX: x, clientY: y, pointer });
        return;
      }
      if (activeTool === "polygon" || activeTool === "parcel") {
        setPolygonPoints((prev) => [...prev, { x: pointer.x, y: pointer.y }]);
        return;
      }
      setIsDrawing(true);
      isDrawingRef.current = true;
      const startPt = { x: pointer.x, y: pointer.y };
      setDrawingStart(startPt);
      drawingStartRef.current = startPt;
    };

    const handleMouseUp = (e: fabric.TPointerEventInfo) => {
      if (!isDrawingRef.current || !drawingStartRef.current) return;
      const pointer = (e.scenePoint || e.viewportPoint) ? (e.scenePoint || e.viewportPoint) : drawingStartRef.current;
      if (!pointer) return;

      const currentStart = drawingStartRef.current;

      if (tempShapeRef.current) { canvas.remove(tempShapeRef.current); tempShapeRef.current = null; }

      const shapeId = `shape-${Date.now()}`;

      if (activeTool === "line") {
        const line = new fabric.Line([currentStart.x, currentStart.y, pointer.x, pointer.y], {
          stroke: activeColor, strokeWidth,
        });
        (line as any).id = shapeId;
        (line as any).elementName = "Line";
        canvas.add(line);
        addLineMeasurement(line, shapeId);
      } else if (activeTool === "section") {
        const line = new fabric.Line([currentStart.x, currentStart.y, pointer.x, pointer.y], {
          stroke: "#ec4899", strokeWidth: 2.5, strokeDashArray: [12, 6],
        });
        (line as any).id = shapeId;
        (line as any).elementName = "Section line";
        (line as any).isSectionLine = true;
        canvas.add(line);
        addLineMeasurement(line, shapeId);

        // Archicad-style section markers at endpoints
        const dx = pointer.x - currentStart.x;
        const dy = pointer.y - currentStart.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 10) {
          const nx = -dy / len; // normal direction (viewing direction)
          const ny = dx / len;
          const ms = 10; // marker size

          // Start marker (A) - triangle pointing in viewing direction
          const mkA = new fabric.Polygon([
            { x: currentStart.x + nx * ms, y: currentStart.y + ny * ms },
            { x: currentStart.x - nx * ms * 0.3 - (dx / len) * ms * 0.5, y: currentStart.y - ny * ms * 0.3 - (dy / len) * ms * 0.5 },
            { x: currentStart.x - nx * ms * 0.3 + (dx / len) * ms * 0.5, y: currentStart.y - ny * ms * 0.3 + (dy / len) * ms * 0.5 },
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
            left: currentStart.x + nx * ms * 1.5, top: currentStart.y + ny * ms * 1.5,
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
        const line = new fabric.Line([currentStart.x, currentStart.y, pointer.x, pointer.y], {
          stroke: activeVrdType.color, strokeWidth, strokeDashArray: [8, 4],
        });
        (line as any).id = shapeId;
        (line as any).isVrd = true;
        (line as any).vrdType = activeVrdType.id;
        (line as any).elementName = activeVrdType.label;
        canvas.add(line);
        addLineMeasurement(line, shapeId);
      } else if (activeTool === "measure") {
        const line = new fabric.Line([currentStart.x, currentStart.y, pointer.x, pointer.y], {
          stroke: "#22c55e", strokeWidth: 2, strokeDashArray: [5, 5],
        });
        (line as any).id = shapeId;
        (line as any).elementName = "Measure";
        canvas.add(line);
        addLineMeasurement(line, shapeId);
      } else if (activeTool === "rectangle") {
        const left = Math.min(currentStart.x, pointer.x), top = Math.min(currentStart.y, pointer.y);
        const w = Math.abs(pointer.x - currentStart.x), h = Math.abs(pointer.y - currentStart.y);
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
        const r = Math.sqrt(Math.pow(pointer.x - currentStart.x, 2) + Math.pow(pointer.y - currentStart.y, 2));
        if (r > 5) {
          const circle = new fabric.Circle({
            left: currentStart.x - r, top: currentStart.y - r, radius: r,
            fill: activeSurfaceType.fill, stroke: activeSurfaceType.color, strokeWidth,
          });
          (circle as any).surfaceType = activeSurfaceType.id;
          (circle as any).id = shapeId;
          (circle as any).elementName = activeSurfaceType.label || "Circle";
          canvas.add(circle);
          addCircleMeasurements(circle, shapeId);
        }
      } else if (activeTool === "arrow") {
        // Phase 8: Arrow annotation
        const dx = pointer.x - currentStart.x;
        const dy = pointer.y - currentStart.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 10) {
          const line = new fabric.Line([currentStart.x, currentStart.y, pointer.x, pointer.y], {
            stroke: activeColor, strokeWidth: Math.max(2, strokeWidth),
            selectable: false, evented: false,
          });
          const headSize = Math.max(12, strokeWidth * 4);
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
          const head = new fabric.Triangle({
            left: pointer.x, top: pointer.y,
            width: headSize, height: headSize,
            fill: activeColor, stroke: activeColor,
            originX: "center", originY: "center",
            angle: angle + 90,
            selectable: false, evented: false,
          });
          const group = new fabric.Group([line, head], { selectable: true });
          (group as any).id = shapeId;
          (group as any).elementName = "Arrow";
          (group as any).isAnnotation = true;
          canvas.add(group);
        }
      }

      canvas.renderAll();
      setIsDrawing(false);
      isDrawingRef.current = false;
      setDrawingStart(null);
      drawingStartRef.current = null;
      setCurrentMeasurement("");
    };

    canvas.on("mouse:move", handleMouseMove);
    canvas.on("mouse:down", handleMouseDown);
    canvas.on("mouse:up", handleMouseUp);
    return () => { canvas.off("mouse:move", handleMouseMove); canvas.off("mouse:down", handleMouseDown); canvas.off("mouse:up", handleMouseUp); };
  }, [activeTool, activeColor, strokeWidth, activeVrdType, activeSurfaceType, calculateDistance, formatMeasurement, pixelsToMeters, addLineMeasurement, addRectMeasurements, addCircleMeasurements, viewMode, placementMode, selectedPreset, updateLayers, pushUndoState]);

  // ─── Mouse position tracking (isolated — runs once, never causes re-register) ────
  // Kept separate from the drawing useEffect so that setMousePos does NOT
  // cause the heavy drawing effect to re-run on every mouse move, which was
  // creating the "Maximum update depth exceeded" cascade.
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const trackPos = (e: fabric.TPointerEventInfo) => {
      const p = e.scenePoint || e.viewportPoint || { x: 0, y: 0 };
      setMousePos({ x: p.x, y: p.y });
    };
    canvas.on("mouse:move", trackPos);
    return () => { canvas.off("mouse:move", trackPos); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — register once and never re-register

  // ─── Mouse wheel zoom ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const onWheel = (opt: fabric.TPointerEventInfo<WheelEvent>) => {
      const e = opt.e;
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY;
      let currentZoom = canvas.getZoom();
      const zoomStep = delta > 0 ? -0.05 : 0.05;
      currentZoom = Math.max(0.1, Math.min(5, currentZoom + zoomStep));
      // Zoom towards mouse pointer
      const rect = canvas.getElement().getBoundingClientRect();
      const point = new fabric.Point(e.clientX - rect.left, e.clientY - rect.top);
      canvas.zoomToPoint(point, currentZoom);
      setZoom(Math.round(currentZoom * 100));
      canvas.renderAll();
    };
    canvas.on("mouse:wheel", onWheel);
    return () => { canvas.off("mouse:wheel", onWheel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Delete selected ────────────────────────────────────────────────────────
  const handleDelete = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObjects();
    if (active.length === 0) return;
    const deletedIds = new Set<string>();
    active.forEach((obj) => {
      const id = (obj as any).id;
      if (id) { removeMeasurements(id); deletedIds.add(id); }
      // Remove overlay children (_overlayBuildingId)
      canvas.getObjects().filter((o: any) => o._overlayBuildingId === id).forEach((o) => canvas.remove(o));
      // Remove template children (parentId) — parking car body, wheels, labels, etc.
      canvas.getObjects().filter((o: any) => o.parentId === id).forEach((o) => canvas.remove(o));
      canvas.remove(obj);
    });
    canvas.discardActiveObject();
    canvas.renderAll();
    if (deletedIds.size > 0) {
      setBuildingDetails((prev) => prev.filter((b) => !deletedIds.has(b.id)));
    }
    pushUndoState();
    setIsDirty(true);
    updateLayers(canvas);
  }, [removeMeasurements, pushUndoState, updateLayers]);

  // ─── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore when user is typing in an input, textarea, or editable element
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        handleDelete();
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "z") || (e.shiftKey && e.key === "Z"))) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleDelete, handleUndo, handleRedo]);

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
        // Phase 6: Auto-switch to parcel management tab when parcel drawn
        if (activeTool === "parcel" && creationMode === "free") {
        }
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
    if (tool === "pencil") {
      canvas.isDrawingMode = true;
      // PencilBrush for freehand
      const brush = new fabric.PencilBrush(canvas);
      brush.color = activeColor;
      brush.width = strokeWidth;
      canvas.freeDrawingBrush = brush;
      canvas.selection = false;
    } else {
      canvas.isDrawingMode = false;
      canvas.selection = tool === "select";
      
      // Fix: Bulk toggle interactability for drawn objects
      const isSelect = tool === "select";
      canvas.getObjects().forEach((o: any) => {
        // Skip grid, measurements, and other system overlays
        if (o.isGrid || o.isMeasurement || o.isPolygonPreview || o.isRegulatoryFootprint || o.excludeFromExport) return;
        o.set("selectable", isSelect);
        o.set("evented", isSelect);
      });
      if (!isSelect) canvas.discardActiveObject();
      canvas.requestRenderAll();
    }
  };

  const handleZoom = (delta: number) => {
    const nz = Math.max(25, Math.min(400, zoom + delta));
    setZoom(nz);
    const canvas = fabricRef.current;
    if (!canvas) return;
    const newZoom = nz / 100;
    const oldZoom = canvas.getZoom();
    if (oldZoom === newZoom) return;
    // Zoom towards the center of the visible area, preserving pan position
    const vpt = canvas.viewportTransform;
    if (!vpt) { canvas.setZoom(newZoom); canvas.renderAll(); return; }
    // Get the visible container center
    const el = containerRef?.current;
    const cx = el ? el.clientWidth / 2 : canvasSize.width / 2;
    const cy = el ? el.clientHeight / 2 : canvasSize.height / 2;
    // Compute the new pan so the same content point stays at screen center
    const ratio = newZoom / oldZoom;
    const newVpt: [number, number, number, number, number, number] = [
      newZoom, 0, 0, newZoom,
      cx - (cx - vpt[4]) * ratio,
      cy - (cy - vpt[5]) * ratio,
    ];
    canvas.setViewportTransform(newVpt);
    canvas.renderAll();
  };

  const handleClearAll = async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    // Confirm before clearing everything
    if (!window.confirm("Reset editor to initial state? All your drawings and buildings will be removed. This cannot be undone.")) return;
    // Suppress undo tracking during bulk removal
    isRestoringRef.current = true;
    
    // Remove all user-drawn objects, but KEEP the base map layers
    const toRemove = canvas.getObjects().filter((o: any) => 
      !o.isGrid && 
      !o.isOverlay && 
      !o.sourceBdtopo && 
      !o.isExistingBuilding && 
      !o.processedBoundary && 
      !o.processedParcel && 
      !o.isRegulatoryFootprint &&
      !o.isCadastral 
    );
    toRemove.forEach((o) => canvas.remove(o));
    
    measurementLabelsRef.current.clear();
    // Reset user-placed elements so 3D viewer doesn't show stale objects
    setBuildingDetails([]);
    setElevationPoints([]);
    setLastPlacedBuildingId(null);
    buildingPositionsRef.current = {};
    setLayers([]);
    setSelectedObject(null);
    
    // Ensure dark background is preserved and redraw grid
    canvas.backgroundColor = "#0f172a";
    if (showGrid) {
      // Remove existing grid lines and redraw
      canvas.getObjects().filter((o: any) => o.isGrid).forEach((o) => canvas.remove(o));
      drawGrid(canvas);
    }
    
    updateLayers(canvas);
    canvas.renderAll();
    
    // Release restoring lock
    setTimeout(() => { isRestoringRef.current = false; }, 50);
    // Clear undo/redo stacks and push the fresh "reset" baseline
    undoStackRef.current = [];
    redoStackRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    
    // Take one baseline snapshot so the first undo reverts to the loaded state
    setTimeout(() => {
      const c = fabricRef.current;
      if (c) {
        try {
          const json = JSON.stringify((c as any).toJSON([...CANVAS_PROPS]));
          undoStackRef.current = [{ canvas: json, buildings: [] }];
          useEditorStore.getState().setCanvasData(json);
          useEditorStore.getState().setBuildingDetails([]);
          useEditorStore.getState().markClean();
        } catch { /* ignore */ }
      }
    }, 500);

    // Persist the reset state to DB so refresh reflects the reset map
    if (currentProjectId) {
      await saveSitePlan();
    }
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
    (rect as any).buildingDetailId = shapeId;
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
    // Place label inside the rect (top-left corner) and track it so it moves with the shape
    const labelText = new fabric.Text(template.label, {
      left: (center.x - wPx / 2) + 4, top: (center.y - hPx / 2) + 2,
      fontSize: Math.min(12, hPx * 0.3), fontFamily: "sans-serif",
      fill: template.color, selectable: false, evented: false,
    });
    (labelText as any).isMeasurement = true;
    (labelText as any).parentId = shapeId;
    canvas.add(labelText);
    addRectMeasurements(rect, shapeId);
    // Store the label alongside measurements so it gets repositioned on move/resize
    const existing = measurementLabelsRef.current.get(shapeId) || [];
    existing.push(labelText);
    measurementLabelsRef.current.set(shapeId, existing);
    canvas.setActiveObject(rect);

    // For all renderable templates, create a BuildingDetail so they appear in the 3D viewer.
    // 'type' is always the lowercase templateId so Terrain3DViewer type-matching works.
    const BUILDING_TEMPLATE_IDS = ["house", "garage", "pool", "terrace", "garden", "parking"];
    if (BUILDING_TEMPLATE_IDS.includes(templateId)) {
      const presetMap: Record<string, string> = {
        house: "house-small",
        garage: "garage",
        pool: "pool",
        terrace: "terrace",
        garden: "green",
        parking: "carport", // closest preset — wall heights irrelevant for flat surface
      };
      const presetId = presetMap[templateId];
      const preset = presetId ? getPresetById(presetId) : null;
      if (preset) {
        const b = createDefaultBuilding({
          // IMPORTANT: name must equal templateId (lowercase) so Terrain3DViewer
          // type-string matching (buildingType.includes('garden') etc.) works.
          name: templateId,
          width: template.width,
          depth: template.height,
          wallHeights: preset.wallHeights,
          roof: { type: preset.roof.type, pitch: preset.roof.pitch, overhang: preset.roof.overhang, material: "Tuile terre cuite" },
          color: template.color,
        });
        // Override with the canvas shape id so 3D viewer can find the rect
        (b as any).id = shapeId;
        setBuildingDetails((prev) => [...prev, b]);
      }
    }

    canvas.renderAll();
    updateLayers(canvas);
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pluSetbacks = (projectData as any)?.pluSetbacks || {};
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

  // ─── Phase 6: Parcel Management & Geometry ───────────────────────────────

  /** Build a summary of all isParcel objects on the canvas. */
  const getParcelSummary = (): ParcelSummary => {
    const canvas = fabricRef.current;
    if (!canvas) return { count: 0, totalAreaM2: 0, parcelIds: [] };
    const parcels = canvas.getObjects().filter((o: any) => o.isParcel);
    const ppm = currentScale.pixelsPerMeter;
    let totalAreaM2 = 0;
    let sumX = 0, sumY = 0, ptCount = 0;
    const ids: string[] = [];
    parcels.forEach((p: any) => {
      const area = p.area || (() => {
        const w = (p.width || 0) * (p.scaleX || 1);
        const h = (p.height || 0) * (p.scaleY || 1);
        return (w / ppm) * (h / ppm);
      })();
      totalAreaM2 += area;
      if (p.id) ids.push(p.id);
      const c = (p as fabric.Object).getCenterPoint();
      sumX += c.x; sumY += c.y; ptCount++;
    });
    // Convert canvas centre to geo if project has parcel geometry
    let centroid: { lat: number; lng: number } | undefined;
    if (projectData?.parcelGeometry && ptCount > 0) {
      try {
        const geo = typeof projectData.parcelGeometry === "string"
          ? JSON.parse(projectData.parcelGeometry) : projectData.parcelGeometry;
        // Use first coordinate as approximate centre
        const coords: number[][] = geo?.coordinates?.[0] || geo?.features?.[0]?.geometry?.coordinates?.[0] || [];
        if (coords.length > 0) {
          const lats = coords.map((c: number[]) => c[1]);
          const lngs = coords.map((c: number[]) => c[0]);
          centroid = {
            lat: lats.reduce((a: number, b: number) => a + b, 0) / lats.length,
            lng: lngs.reduce((a: number, b: number) => a + b, 0) / lngs.length,
          };
        }
      } catch {
        // ignore
      }
    }
    // Fallback: use project location
    if (!centroid && (projectData as any)?.latitude && (projectData as any)?.longitude) {
      centroid = { lat: (projectData as any).latitude, lng: (projectData as any).longitude };
    }
    return { count: parcels.length, totalAreaM2, parcelIds: ids, centroid };
  };

  /** Fetch road types from Overpass around the parcel centroid. */
  const fetchParcelRoads = async () => {
    const summary = getParcelSummary();
    if (!summary.centroid) {
      alert("No parcel location found. Ensure your project has an address and parcel geometry.");
      return;
    }
    try {
      const res = await fetch("/api/cadastre/road-type", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: summary.centroid.lat, lng: summary.centroid.lng, radius: 120 }),
      });
      if (res.ok) {
        const data = await res.json();
        setParcelRoads(data.roads || []);
        // Draw overlay on canvas after fetching roads
        if (data.roads?.length > 0) drawBoundaryOverlay(data.roads);
      }
    } catch (err) {
      console.error("Road type fetch error:", err);
    } finally {
    }
  };

  /**
   * Draw colour-coded boundary edge overlay on canvas.
   * Darkens the parcel edges based on adjacent road type.
   * Order: front (nearest road) = road colour, sides/rear = private green.
   */
  const drawBoundaryOverlay = (roads: DetectedRoad[]) => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    // Remove old overlay
    canvas.getObjects().filter((o: any) => o.isBoundaryOverlay).forEach(o => canvas.remove(o));

    const parcels = canvas.getObjects().filter((o: any) => o.isParcel);
    if (parcels.length === 0) return;

    const frontRoad = roads.find(r => r.classification !== "voie_privee" && r.classification !== "inconnu");
    const COLORS: Record<string, string> = {
      autoroute: "#b91c1c",
      voie_nationale: "#c2410c",
      voie_departementale: "#dc2626",
      voie_communale: "#d97706",
      chemin_rural: "#ca8a04",
      voie_privee: "#16a34a",
      inconnu: "#6b7280",
    };
    const frontColor = frontRoad ? (COLORS[frontRoad.classification] ?? "#d97706") : "#16a34a";
    const sideColor = "#16a34a"; // private/neighbor = green

    // Skip merged/global boundary polygons — only draw on individual parcels
    parcels.filter((p: any) => !p.isMerged && !p.processedBoundary).forEach((parcel: any, pi: number) => {
      const pts: { x: number; y: number }[] = parcel.points?.map((p: { x: number; y: number }) => {
        const pt = fabric.util.transformPoint(new fabric.Point(p.x, p.y), parcel.calcTransformMatrix());
        return { x: pt.x, y: pt.y };
      }) || [];
      if (pts.length < 3) return;

      // Find the "front" edge — closest to canvas top (street side heuristic)
      let frontIdx = 0;
      let minY = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        const midY = (pts[i].y + pts[i + 1].y) / 2;
        if (midY < minY) { minY = midY; frontIdx = i; }
      }

      pts.forEach((pt, i) => {
        if (i >= pts.length - 1) return;
        const next = pts[i + 1];

        // Skip edges longer than 500px (prevent long diagonal lines from bad data)
        const edgeLen = Math.sqrt((next.x - pt.x) ** 2 + (next.y - pt.y) ** 2);
        if (edgeLen > 500) return;

        const color = i === frontIdx ? frontColor : sideColor;
        const line = new fabric.Line([pt.x, pt.y, next.x, next.y], {
          stroke: color,
          strokeWidth: 4,
          strokeDashArray: i === frontIdx ? undefined : [6, 4],
          selectable: false,
          evented: false,
          opacity: 0.85,
        });
        (line as any).isBoundaryOverlay = true;
        (line as any).parentParcelIdx = pi;
        canvas.add(line);

        // Edge label
        const mx = (pt.x + next.x) / 2;
        const my = (pt.y + next.y) / 2;
        const lbl = i === frontIdx
          ? (frontRoad?.classificationLabel || "Voie publique")
          : "Limite privée";
        const tag = new fabric.Text(lbl, {
          left: mx, top: my - 16,
          fontSize: 9, fontFamily: "sans-serif",
          fill: color,
          backgroundColor: "rgba(255,255,255,0.9)",
          padding: 2,
          originX: "center", originY: "bottom",
          selectable: false, evented: false,
          opacity: 0.95,
        });
        (tag as any).isBoundaryOverlay = true;
        canvas.add(tag);
      });
    });

    canvas.renderAll();
  };

  /** Merge all isParcel polygons into one using the cadastre/merge API. */
  const handleMergeParcels = async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const summary = getParcelSummary();
    if (summary.count < 2) return;

    try {
      // Use project parcelIds from the DB if available
      const projectParcelIds = (projectData as any)?.parcelIds
        ? String((projectData as any).parcelIds).split(",").map((s: string) => s.trim()).filter(Boolean)
        : [];

      if (projectParcelIds.length >= 2) {
        // Call the API with real IGN parcel IDs
        const res = await fetch("/api/cadastre/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parcelIds: projectParcelIds }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.merged?.geometry) {
            // Remove existing parcel polygons
            canvas.getObjects().filter((o: any) => o.isParcel).forEach(o => canvas.remove(o));
            canvas.getObjects().filter((o: any) => o.isBoundaryOverlay).forEach(o => canvas.remove(o));
            // COMPUTE SHIFT: Draw merged polygon using geoToCanvas instead of parcelGeometryToShapes
            const { geoToCanvas } = await import("@/lib/projectToCanvas");
            const geom = data.merged.geometry;
            const rings = geom.type === "Polygon" ? [geom.coordinates[0]] : geom.coordinates.map((p: number[][][]) => p[0]);
            const refPt = processedSiteData?.refPoint || { lng: 0, lat: 0 };
            const projOpts = { canvasWidth: canvasSize.width, canvasHeight: canvasSize.height, pixelsPerMeter: currentScale.pixelsPerMeter };
            rings.forEach((ring: number[][], idx: number) => {
              const projected = ring.map(([lng, lat]: number[]) => geoToCanvas(lng, lat, refPt, projOpts));
              let shapeMinX = Infinity, shapeMinY = Infinity;
              projected.forEach(p => { shapeMinX = Math.min(shapeMinX, p.x); shapeMinY = Math.min(shapeMinY, p.y); });
              const points = projected.map(p => new fabric.Point(p.x - shapeMinX, p.y - shapeMinY));
              const poly = new fabric.Polygon(points, {
                left: shapeMinX, top: shapeMinY,
                fill: "rgba(34, 197, 94, 0.1)",
                stroke: "#22c55e", strokeWidth: 2, strokeDashArray: [4, 2],
              });
              const pid = `parcel-merged-${currentProjectId}-${idx}`;
              (poly as any).id = pid;
              (poly as any).elementName = "Merged Parcel";
              (poly as any).isParcel = true;
              (poly as any).isMerged = true;
              canvas.add(poly);
              canvas.sendObjectToBack(poly);
            });
            canvas.renderAll();
            updateLayers(canvas);
            // Re-classify boundaries after merge
            if (parcelRoads.length > 0) drawBoundaryOverlay(parcelRoads);
          }
        }
      } else {
        // Fallback: visual-only merge using convex hull of canvas parcel points
        const allPts: { x: number; y: number }[] = [];
        canvas.getObjects().filter((o: any) => o.isParcel).forEach((parcel: any) => {
          (parcel.points || []).forEach((p: { x: number; y: number }) => {
            const wpt = fabric.util.transformPoint(new fabric.Point(p.x, p.y), parcel.calcTransformMatrix());
            allPts.push({ x: wpt.x, y: wpt.y });
          });
        });
        if (allPts.length >= 3) {
          canvas.getObjects().filter((o: any) => o.isParcel).forEach(o => canvas.remove(o));
          const cx = allPts.reduce((s, p) => s + p.x, 0) / allPts.length;
          const cy = allPts.reduce((s, p) => s + p.y, 0) / allPts.length;
          const merged = new fabric.Polygon(allPts.map(p => new fabric.Point(p.x - cx, p.y - cy)), {
            left: cx, top: cy,
            fill: "rgba(34, 197, 94, 0.1)", stroke: "#22c55e", strokeWidth: 2, strokeDashArray: [4, 2],
            originX: "center", originY: "center",
          });
          (merged as any).isParcel = true;
          (merged as any).isMerged = true;
          (merged as any).elementName = "Merged Parcel";
          canvas.add(merged);
          canvas.sendObjectToBack(merged);
          canvas.renderAll();
          updateLayers(canvas);
        }
      }
    } catch (err) {
      console.error("Parcel merge error:", err);
    } finally {
    }
  };

  const addBuildingToCanvas = (b: BuildingDetail, isExisting: boolean) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const center = canvas.getCenterPoint();
    addBuildingToCanvasAt(b, isExisting, center.x, center.y, "house");
  };

  const addExistingBuilding = () => {
    const b = createDefaultBuilding({ isExisting: true, name: "Existing Building", color: "#6b7280" });
    setBuildingDetails((prev) => [...prev, b]);
    addBuildingToCanvas(b, true);
  };

  const addNewBuilding = () => {
    const b = createDefaultBuilding({ name: "New Construction", color: "#3b82f6" });
    setBuildingDetails((prev) => [...prev, b]);
    addBuildingToCanvas(b, false);
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

    // Phase 7: Compute roof data, NIA, and GEA from building details
    let roofSurfaceArea = 0;
    let drainageArea = 0;
    let totalNIA = 0;
    let totalGEA = 0;
    buildingDetails.forEach((b) => {
      const rd = calculateRoofData(
        b.width, b.depth,
        { type: b.roof.type, pitch: b.roof.pitch, overhang: b.roof.overhang },
        b.wallThickness || 0.2
      );
      roofSurfaceArea += rd.surfaceArea;
      drainageArea += rd.drainageArea;
      totalNIA += rd.netInternalArea;
      totalGEA += rd.grossExternalArea;
    });

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
      roofSurfaceArea,
      drainageArea,
      totalNIA,
      totalGEA,
    };
  };

  const footprintData = computeFootprintData();
  const greenPct = footprintData.totalSiteArea > 0 ? (footprintData.greenSpaceArea / footprintData.totalSiteArea) * 100 : 0;
  const hasContent = footprintData.projectedFootprint > 0 || Object.values(footprintData.surfacesByType).some((v) => v > 0);

  const hasUnnamedElements = (() => {
    const canvas = fabricRef.current;
    if (!canvas) return false;
    // Must be kept in sync with isOverlay in saveSitePlan
    const isOverlay = (o: any) =>
      o.isGrid ||
      o.isMeasurement ||
      o.isPolygonPreview ||
      o.isBoundaryOverlay ||
      o.isBoundaryDimension ||
      o.isRegulatoryFootprint ||
      o.isNorthArrow ||
      o.isInteriorLayout ||
      o.isBuildingOpening ||
      o.isBuildingOverhang ||
      o.isExteriorEnvelope ||
      o.isWallThickness ||
      o.isRoomLabel ||
      o.isElevationPoint ||
      o.isVegetation ||
      o.isViewpoint ||
      o.isAnnotation ||
      o.isVrd ||
      o.isSectionLine ||
      o.excludeFromExport === true;
    return canvas.getObjects().filter((o: any) => !isOverlay(o)).some((o: any) => {
      // Auto-name fallback (mirrors saveSitePlan logic)
      const inferred =
        o.isParcel ? "Land Parcel" :
          o.type === "i-text" ? "Text Label" :
            o.type === "path" ? "Freehand Drawing" :
              null;
      if (inferred && !String(o.elementName ?? "").trim()) {
        o.elementName = inferred;
        o.name = inferred;
      }
      const name = String(o.elementName ?? o.name ?? "").trim();
      return !name || name === "Unnamed";
    });
  })();

  const editorCanProceed = !!currentProjectId && !hasUnnamedElements && greenPct >= (projectData?.minGreenPct ?? 20) && hasContent;

  const handleInlineConfirm = (value: string | null) => {
    if (!inlinePrompt || !fabricRef.current) return;
    const canvas = fabricRef.current;
    const { pointer, type } = inlinePrompt;
    
    setInlinePrompt(null);
    if (!value) return;

    if (type === "elevation") {
      const v = parseFloat(value.replace(",", ".")) || 0;
      const id = `elev-${Date.now()}`;
      setElevationPoints((prev) => [...prev, { id, x: pointer.x, y: pointer.y, value: v }]);
      const r = 8;
      const circle = new fabric.Circle({
        left: pointer.x - r, top: pointer.y - r, radius: r,
        fill: "#0ea5e9", stroke: "#0284c7", strokeWidth: 1,
      });
      (circle as any).id = id;
      (circle as any).isElevationPoint = true;
      (circle as any).elevationValue = v;
      (circle as any).excludeFromExport = false;
      canvas.add(circle);
      const label = new fabric.Text(`${v >= 0 ? "+" : ""}${v.toFixed(2)}`, {
        left: pointer.x, top: pointer.y + r + 2, fontSize: 10, fontFamily: "monospace",
        fill: "#0ea5e9", originX: "center", originY: "top",
      });
      (label as any).isMeasurement = true;
      (label as any).parentId = id;
      canvas.add(label);
    } else if (type === "vegetation") {
      const treeType = value || "deciduous";
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
    } else if (type === "viewpoint") {
      const vpName = value || "PC7";
      const vpId = `vp-${Date.now()}`;
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
      const arrowLen = 40;
      const arrow = new fabric.Line([pointer.x, pointer.y, pointer.x + arrowLen, pointer.y], {
        stroke: "#6366f1", strokeWidth: 2.5,
      });
      (arrow as any).isMeasurement = true;
      (arrow as any).parentId = vpId;
      canvas.add(arrow);
      const ah = new fabric.Polygon([
        { x: pointer.x + arrowLen, y: pointer.y },
        { x: pointer.x + arrowLen - 8, y: pointer.y - 5 },
        { x: pointer.x + arrowLen - 8, y: pointer.y + 5 },
      ], { fill: "#6366f1", selectable: false, evented: false });
      (ah as any).isMeasurement = true;
      (ah as any).parentId = vpId;
      canvas.add(ah);
      const vpLabel = new fabric.Text(vpName, {
        left: pointer.x, top: pointer.y - camSize - 10, fontSize: 10, fontFamily: "monospace",
        fill: "#6366f1", fontWeight: "bold", originX: "center", selectable: false, evented: false,
      });
      (vpLabel as any).isMeasurement = true;
      (vpLabel as any).parentId = vpId;
      canvas.add(vpLabel);
    }
    
    canvas.renderAll();
    updateLayers(canvas);
    pushUndoState();
  };

  // ─── Render ────────────────────────────────────────────────────────────────


  return (
    <div className={cn("bg-white flex flex-col overflow-hidden", isFullScreen ? "fixed inset-0 z-50 h-screen" : "h-screen")}>
      {/* Real-time PLU Compliance Banner — powered by plu-math.ts engine */}
      <PluAlertBanner report={pluComplianceReport} />

      {/* Top Bar */}
      <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {(() => {
            const backHref = currentProjectId ? `/projects/${currentProjectId}/dashboard` : "/projects";
            return (
              <button
                type="button"
                onClick={async () => {
                  if (isDirty && currentProjectId) await saveSitePlan();
                  router.push(backHref);
                }}
                className="flex items-center gap-2 text-slate-400 hover:text-slate-900 transition-colors shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="text-sm font-medium hidden sm:block">
                  Back to Dashboard
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
              onClick={() => {
                setViewMode("2d");
                setSelectedBuildingId3d(null);
                // Force canvas re-render on switch back
                setTimeout(() => fabricRef.current?.requestRenderAll(), 50);
              }}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1",
                viewMode === "2d" ? "bg-blue-500 text-slate-900 shadow" : "text-slate-400 hover:text-slate-900"
              )}
            >
              <LayoutGrid className="w-4 h-4" />
              2D
            </button>
            <button
              onClick={() => {
                // Cache building positions from canvas before switching
                const canvas = fabricRef.current;
                if (canvas) {
                  const positions: Record<string, { x: number; y: number; angle: number }> = {};
                  buildingDetails.forEach((b) => {
                    const obj = canvas.getObjects().find((o: any) =>
                      (o.id === b.id || o.buildingDetailId === b.id)
                    );
                    if (obj) {
                      const l = obj.left ?? 0;
                      const t = obj.top ?? 0;
                      const w = (obj.width ?? 0) * (obj.scaleX ?? 1);
                      const h = (obj.height ?? 0) * (obj.scaleY ?? 1);
                      positions[b.id] = { x: l + w / 2, y: t + h / 2, angle: obj.angle || 0 };
                    }
                  });
                  buildingPositionsRef.current = positions;
                }
                setScene3dVersion(v => v + 1);
                setViewMode("3d");
              }}
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

              {saveStatus === 'saved' && (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-medium animate-pulse">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Saved!
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 text-red-500 text-xs font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" /> Save failed
                </span>
              )}
              {editorCanProceed && (
                <span className="hidden sm:inline flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-100 text-emerald-600 text-xs font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Site plan completed
                </span>
              )}
              {(() => {
                const nextHref = `/terrain?project=${currentProjectId}`;
                const nextLabel = "Next: Terrain";
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


      <div className="flex-1 flex overflow-hidden relative">

        {/* Left Toolbar (2D only) — Free wall drawing + tools (always visible) */}
        {viewMode === "2d" && (
          <div className="w-56 bg-white border-r border-slate-200 flex flex-col py-2 overflow-y-auto shrink-0">
            {/* ─── Drawing Tools ─── */}
            <div className="flex flex-col gap-0 px-1">
              {TOOL_GROUPS.map((group) => (
                <div key={group.label} className="mb-0.5">
                  <p className="text-[9px] font-bold uppercase text-slate-400/70 tracking-widest px-2 py-1">{group.label}</p>
                  {tools.filter((t) => group.ids.includes(t.id)).map((tool) => {
                    const Icon = tool.icon;
                    const tooltip = (tool as { tooltip?: string }).tooltip || `${tool.label} (${tool.shortcut})`;
                    return (
                      <button key={tool.id} onClick={() => handleToolSelect(tool.id as Tool)}
                        className={cn("w-full h-8 rounded-lg flex items-center gap-2 px-2.5 transition-all text-left",
                          activeTool === tool.id
                            ? "bg-gradient-to-br from-blue-500 to-purple-500 text-white shadow-md"
                            : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        )} title={tooltip}>
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="text-[11px] font-medium truncate">{tool.label}</span>
                      </button>
                    );
                  })}
                  <div className="h-px bg-slate-100 mx-2 my-0.5" />
                </div>
              ))}
            </div>

            {/* ─── Add Elements (Templates) ─── */}
            <div className="px-2 pt-1 pb-1">
              <p className="text-[9px] font-bold uppercase text-amber-600 tracking-widest py-1">Add Elements</p>
            </div>
            <div className="px-1.5 space-y-0.5">
              {templatesList.map((t) => {
                const Icon = t.icon;
                return (
                  <button key={t.id} onClick={() => addTemplate(t.id)}
                    className="w-full h-9 rounded-lg flex items-center gap-2.5 px-2.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all border border-transparent hover:border-slate-200"
                    title={t.id === "access" ? "Site access point" : `${t.label}${t.width && t.height ? ` (${t.width}×${t.height} m)` : ""}`}>
                    <Icon className="w-4 h-4 shrink-0" style={{ color: t.color }} />
                    <span className="text-[11px] font-medium">{t.label}</span>
                    {t.width > 0 && t.height > 0 && (
                      <span className="text-[9px] text-slate-400 ml-auto font-mono">{t.width}×{t.height}m</span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="h-px bg-slate-200 mx-3 my-1.5" />

            {/* ─── Buildings ─── */}
            <div className="px-2 pb-0.5">
              <p className="text-[9px] font-bold uppercase text-slate-400/70 tracking-widest py-1">Buildings</p>
            </div>
            <div className="px-1.5 space-y-0.5">
              <button onClick={() => { addExistingBuilding(); }} className="w-full h-9 rounded-lg flex items-center gap-2.5 px-2.5 text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-all border border-transparent hover:border-slate-200" title="Add Existing Building">
                <Building2 className="w-4 h-4 shrink-0 text-gray-500" />
                <span className="text-[11px] font-medium">Existing Building</span>
              </button>
              <button onClick={() => { addNewBuilding(); }} className="w-full h-9 rounded-lg flex items-center gap-2.5 px-2.5 text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-all border border-transparent hover:border-blue-200" title="Add New Construction">
                <Plus className="w-4 h-4 shrink-0" />
                <span className="text-[11px] font-medium">New Construction</span>
              </button>
            </div>
            <div className="h-px bg-slate-200 mx-3 my-1.5" />

            {/* ─── Utilities ─── */}
            <div className="px-2 pb-0.5">
              <p className="text-[9px] font-bold uppercase text-slate-400/70 tracking-widest py-1">Utilities</p>
            </div>
            <div className="px-1.5 space-y-0.5">
              <button onClick={addNorthArrow} className="w-full h-8 rounded-lg flex items-center gap-2.5 px-2.5 text-sky-500 hover:bg-sky-50 transition-all" title="North Arrow">
                <Compass className="w-4 h-4 shrink-0" />
                <span className="text-[11px] font-medium">North Arrow</span>
              </button>
              <button onClick={() => setShowLegend(v => !v)} className={cn("w-full h-8 rounded-lg flex items-center gap-2.5 px-2.5 transition-all", showLegend ? "bg-violet-50 text-violet-600" : "text-violet-500 hover:bg-violet-50")} title="Legend">
                <FileText className="w-4 h-4 shrink-0" />
                <span className="text-[11px] font-medium">Legend</span>
              </button>
              <button onClick={autoAddBoundaryDimensions} className="w-full h-8 rounded-lg flex items-center gap-2.5 px-2.5 text-orange-500 hover:bg-orange-50 transition-all" title="Auto Boundary Dimensions">
                <Ruler className="w-4 h-4 shrink-0" />
                <span className="text-[11px] font-medium">Auto Dimensions</span>
              </button>
              {currentProjectId && (
                <button
                  onClick={loadTerrainFromIgn}
                  disabled={loadingIgnTerrain}
                  className="w-full h-8 rounded-lg flex items-center gap-2.5 px-2.5 text-emerald-600 hover:bg-emerald-50 transition-all disabled:opacity-50"
                  title="Load terrain from IGN (RGE ALTI®)"
                >
                  {loadingIgnTerrain ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Mountain className="w-4 h-4 shrink-0" />}
                  <span className="text-[11px] font-medium">Terrain IGN</span>
                </button>
              )}

            </div>

            {/* Spacer + Delete at bottom */}
            <div className="flex-1" />
            <div className="px-1.5 pb-1">
              <button onClick={handleDelete} className="w-full h-8 rounded-lg flex items-center gap-2.5 px-2.5 text-red-500 hover:bg-red-50 transition-all" title="Delete Selected">
                <Trash2 className="w-4 h-4 shrink-0" />
                <span className="text-[11px] font-medium">Delete</span>
              </button>
            </div>
          </div>
        )}

        {/* Main Area */}
        <div className="flex-1 relative overflow-hidden" ref={containerRef}>
          {/* === Full-screen loading overlay while editor data is fetching === */}
          {loadingEditorData && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-5 px-10 py-8 rounded-2xl bg-white/95 border border-slate-200 shadow-2xl">
                <style>{`
                  @keyframes editorRing { 0% { stroke-dashoffset: 188; } 100% { stroke-dashoffset: 0; } }
                  @keyframes editorPulse { 0%,100% { opacity: 0.4; transform: scale(0.95); } 50% { opacity: 1; transform: scale(1.02); } }
                `}</style>
                <div className="relative w-20 h-20">
                  <svg className="w-20 h-20 -rotate-90" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="28" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                    <circle cx="32" cy="32" r="28" fill="none" stroke="url(#editorGrad)" strokeWidth="3" strokeLinecap="round" strokeDasharray="176" style={{ animation: 'editorRing 2.5s ease-in-out infinite' }} />
                    <defs><linearGradient id="editorGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#3b82f6" /><stop offset="100%" stopColor="#8b5cf6" /></linearGradient></defs>
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-7 h-7 text-blue-500" style={{ animation: 'editorPulse 2s ease-in-out infinite' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <p className="text-base font-semibold text-slate-700">Loading Site Plan…</p>
                  <p className="text-xs text-slate-400 max-w-[240px] text-center">Fetching project data, canvas elements and parcel boundaries</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  <div className="w-8 h-0.5 rounded-full bg-blue-300" />
                  <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" style={{ animationDelay: '0.3s' }} />
                  <div className="w-8 h-0.5 rounded-full bg-violet-300" />
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" style={{ animationDelay: '0.6s' }} />
                </div>
              </div>
            </div>
          )}
          {/* === 2D Canvas Layer (always mounted, hidden via CSS when in 3D) === */}
          <div style={{ display: viewMode === "2d" ? "block" : "none" }} className="absolute inset-0">
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
            {loadingParcelsGeoJSON && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px]">
                <div className="flex flex-col items-center gap-4 px-8 py-6 rounded-2xl bg-white/95 border border-slate-200 shadow-2xl">
                  <style>{`
                      @keyframes parcelDraw { 0% { stroke-dashoffset: 188; } 100% { stroke-dashoffset: 0; } }
                      @keyframes parcelFade { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
                    `}</style>
                  <div className="relative w-16 h-16">
                    <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r="28" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                      <circle cx="32" cy="32" r="28" fill="none" stroke="url(#parcelGrad)" strokeWidth="3" strokeLinecap="round" strokeDasharray="176" style={{ animation: 'parcelDraw 2s ease-in-out infinite' }} />
                      <defs><linearGradient id="parcelGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#22c55e" /><stop offset="100%" stopColor="#3b82f6" /></linearGradient></defs>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg className="w-6 h-6 text-emerald-500" style={{ animation: 'parcelFade 2s ease-in-out infinite' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-sm font-semibold text-slate-700">Drawing parcel boundaries…</p>
                    <p className="text-xs text-slate-400">Importing GeoJSON data onto the canvas</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <div className="w-8 h-0.5 rounded-full bg-emerald-300" />
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" style={{ animationDelay: '0.3s' }} />
                  </div>
                </div>
              </div>
            )}
            {placementMode && selectedPreset && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-6 py-3 rounded-xl bg-amber-500 text-slate-900 font-medium text-sm shadow-lg">
                Click on the plan to place your {selectedPreset.shortLabel}
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
            <div className="absolute inset-0 bg-white">
              <canvas ref={canvasRef} />
            </div>

            {inlinePrompt && (
              <div 
                className="absolute z-50 bg-white shadow-2xl rounded-xl border border-slate-200 flex flex-col items-start p-3 w-64 animate-in fade-in zoom-in-95 duration-200"
                style={{
                  left: Math.min(inlinePrompt.clientX + 10, canvasSize.width - 260),
                  top: Math.min(inlinePrompt.clientY + 10, canvasSize.height - 100),
                }}
              >
                <p className="text-xs font-semibold text-slate-700 mb-2">
                  {inlinePrompt.type === 'elevation' ? "Set Elevation (m)" : inlinePrompt.type === 'vegetation' ? "Select Vegetation Type" : "Set Viewpoint Name"}
                </p>
                {inlinePrompt.type === 'vegetation' ? (
                   <select 
                     autoFocus
                     className="w-full bg-slate-50 border border-slate-200 rounded-md text-sm p-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
                     onKeyDown={(e) => {
                       if (e.key === "Enter") handleInlineConfirm((e.target as HTMLSelectElement).value);
                       if (e.key === "Escape") handleInlineConfirm(null);
                     }}
                     id="inline-select"
                   >
                     <option value="deciduous">Deciduous Tree</option>
                     <option value="coniferous">Coniferous Tree</option>
                     <option value="shrub">Shrub</option>
                   </select>
                ) : (
                  <input
                    type="text"
                    autoFocus
                    placeholder={inlinePrompt.type === 'elevation' ? "e.g. 0.00 or +1.50" : "e.g. PC7"}
                    defaultValue={inlinePrompt.type === 'elevation' ? "0.00" : "PC7"}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md text-sm p-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleInlineConfirm((e.target as HTMLInputElement).value);
                      if (e.key === "Escape") handleInlineConfirm(null);
                    }}
                    id="inline-input"
                  />
                )}
                <div className="flex items-center gap-2 w-full">
                  <button onClick={() => handleInlineConfirm(null)} className="flex-1 py-1.5 rounded bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200 transition-colors">Cancel</button>
                  <button onClick={() => {
                     const el = document.getElementById(inlinePrompt.type === 'vegetation' ? 'inline-select' : 'inline-input') as HTMLInputElement | HTMLSelectElement;
                     handleInlineConfirm(el.value);
                  }} className="flex-1 py-1.5 rounded bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors">Confirm</button>
                </div>
              </div>
            )}

            <SitePlanLegend isOpen={showLegend} onToggle={() => setShowLegend(false)} />

            {/* ── Element Properties Panel (2D floating overlay) ── */}
            {viewMode === "2d" && (() => {
              const bdId = (selectedObject as any)?.buildingDetailId;
              const selBuilding = bdId ? buildingDetails.find((b) => b.id === bdId) ?? null : null;
              return selBuilding ? (
                <ElementPropertiesPanel
                  building={selBuilding}
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
                />
              ) : null;
            })()}

          </div>

          {/* === 3D Viewer Layer (kept mounted to prevent heavy unmount/rebuild lag) === */}
          <div className={cn("absolute inset-0 transition-opacity duration-300 flex overflow-hidden", viewMode === "3d" ? "opacity-100 z-30 pointer-events-auto" : "opacity-0 -z-10 pointer-events-none")} style={{ background: "#111827" }}>
            {/* 3D canvas — fills remaining width */}
            <div className="flex-1 relative min-w-0 overflow-hidden" style={{ background: "#c8ddf0" }}>
              <Terrain3DViewer
                key="3d-terrain-stable"
                processedSiteData={processedSiteData}
                parcelGeoJSON={projectData?.parcelsGeoJSON || projectData?.parcelGeometry || null}
                userBuildings={userBuildings3d.length > 0 ? userBuildings3d : undefined}
                canvasWidth={canvasSize.width}
                canvasHeight={canvasSize.height}
                pixelsPerMeter={currentScale.pixelsPerMeter}
                zScale={zScale}
              />
              {/* Switch to 2D bottom hint */}
              <div className="absolute bottom-4 left-4 z-10 flex items-center gap-3 px-4 py-2 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-300 text-sm backdrop-blur-sm">
                <span>Wall drawing is in <strong className="text-white">2D</strong> view.</span>
                <button
                  onClick={() => { setViewMode("2d"); setSelectedBuildingId3d(null); setTimeout(() => fabricRef.current?.requestRenderAll(), 50); }}
                  className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-semibold hover:bg-blue-400 transition-colors"
                >
                  Switch to 2D
                </button>
              </div>
            </div>

            {/* ── Right Sidebar Panel ── */}
            <Terrain3DRightPanel
              zScale={zScale}
              setZScale={setZScale}
            />
          </div>
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
                  const housePreset = getPresetById("house-medium");
                  if (housePreset) {
                    const b = buildingDetailFromPreset(housePreset);
                    setBuildingDetails((prev) => [...prev, b]);
                    addBuildingToCanvasAt(b, false, center.x - 80, center.y, "house");
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
