import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { ComplianceReport } from '@/lib/plu-math';

// ─── Core Interface Definitions ─────────────────────────────────────────────

export type SurfaceType =
  | 'house'       // residential building (gable roof)
  | 'garage'      // multi-storey or standalone garage/large building
  | 'pool'        // swimming pool
  | 'parking'     // parking lot / car park
  | 'garden'      // garden / green space
  | 'terrace'     // deck / patio / terrace
  | 'access'      // driveway / access path
  | 'vrd'         // technical network point
  | 'boundary'    // parcel boundary (invisible in 3D)
  | 'other';      // free-form fallback

export type EditorTool =
  | 'select'
  | 'parcel'
  | 'house'
  | 'garage'
  | 'pool'
  | 'parking'
  | 'garden'
  | 'terrace'
  | 'access'
  | 'vrd'
  | 'freeform';

// ─── Placement State Machine ────────────────────────────────────────────────

export type PlacementPhase = 'idle' | 'guided' | 'active';

export interface PlacementMode {
  /** Which surface type is being placed — null when idle */
  tool: SurfaceType | null;
  /**
   * State machine phase:
   *   idle    → no placement in progress
   *   guided  → crosshair reticle following mouse, waiting for click
   *   active  → object placed, user is manipulating it (drag/rotate/scale)
   */
  phase: PlacementPhase;
}

export interface CursorGuidePoint {
  x: number;
  y: number;
}

// ─── Object Interfaces ──────────────────────────────────────────────────────

export interface FabricProps {
  x: number;
  y: number;
  angle: number;
  scaleX: number;
  scaleY: number;
  width: number;
  height: number;
}

export interface RealWorldProps {
  widthMeters: number;
  lengthMeters: number;
  areaM2: number;
  elevationMeters: number;
  heightMeters: number;
}

export interface ProjectObject {
  id: string;
  type: SurfaceType;
  fabricProps: FabricProps;
  realWorldProps: RealWorldProps;
  meshPath: string | null;
  color?: string;
  name?: string;
}

// ─── Store State ────────────────────────────────────────────────────────────

export interface UrbAssistProjectState {
  // ── Reference Data ──
  parcelBoundary: any | null;
  pluRules: any | null;
  pixelsPerMeter: number;

  // ── Reactive 2D/3D Elements ──
  projectObjects: ProjectObject[];

  // ── PLU Compliance (live compliance bridge) ──
  complianceReport: ComplianceReport | null;
  setComplianceReport: (report: ComplianceReport | null) => void;

  // ── UI Slice (Decoupled — toolbar reads from here, NOT local state) ──
  activeTool: EditorTool;
  setActiveTool: (tool: EditorTool) => void;

  // ── Guided Placement State Machine ──
  placementMode: PlacementMode;
  cursorGuidePoint: CursorGuidePoint;

  startGuidedPlacement: (tool: SurfaceType) => void;
  updateCursorGuide: (x: number, y: number) => void;
  commitPlacement: () => void;
  cancelPlacement: () => void;

  // ── Actions ──
  setParcelBoundary: (geoJson: any) => void;
  setPluRules: (rules: any) => void;
  setPixelsPerMeter: (ppm: number) => void;
  syncObjects: (objects: ProjectObject[]) => void;
  updateObject: (id: string, updates: Partial<ProjectObject>) => void;
  removeObject: (id: string) => void;
  clearObjects: () => void;
}

// ─── Tool → SurfaceType Mapping ─────────────────────────────────────────────

const TOOL_TO_SURFACE: Partial<Record<EditorTool, SurfaceType>> = {
  house:      'house',
  garage:     'garage',
  pool:       'pool',
  parking:    'parking',
  garden:     'garden',
  terrace:    'terrace',
  access:     'access',
  vrd:        'vrd',
  freeform:   'other',
};

// ─── Store Initialization ───────────────────────────────────────────────────

export const useUrbAssistProjectStore = create<UrbAssistProjectState>((set) => ({
  // Initial State
  parcelBoundary: null,
  pluRules: null,
  pixelsPerMeter: 10,
  projectObjects: [],
  complianceReport: null,

  // UI Slice
  activeTool: 'select',
  setActiveTool: (tool) => {
    const surfaceType = TOOL_TO_SURFACE[tool] ?? null;

    // If a placement tool is selected, enter guided mode automatically
    if (surfaceType) {
      set({
        activeTool: tool,
        placementMode: { tool: surfaceType, phase: 'guided' },
      });
    } else {
      // Selection or non-placement tool — cancel any active placement
      set({
        activeTool: tool,
        placementMode: { tool: null, phase: 'idle' },
      });
    }
  },

  // PLU Compliance
  setComplianceReport: (report) => set({ complianceReport: report }),

  // ── Guided Placement State Machine ──
  placementMode: { tool: null, phase: 'idle' },
  cursorGuidePoint: { x: 0, y: 0 },

  startGuidedPlacement: (tool) =>
    set({
      placementMode: { tool, phase: 'guided' },
      cursorGuidePoint: { x: 0, y: 0 },
    }),

  updateCursorGuide: (x, y) =>
    set({ cursorGuidePoint: { x, y } }),

  commitPlacement: () =>
    set({
      placementMode: { tool: null, phase: 'idle' },
      activeTool: 'select',
    }),

  cancelPlacement: () =>
    set({
      placementMode: { tool: null, phase: 'idle' },
      activeTool: 'select',
      cursorGuidePoint: { x: 0, y: 0 },
    }),

  // Data Actions
  setParcelBoundary: (geoJson) => set({ parcelBoundary: geoJson }),
  setPluRules: (rules) => set({ pluRules: rules }),
  setPixelsPerMeter: (ppm) => set({ pixelsPerMeter: ppm }),

  syncObjects: (objects) => set({ projectObjects: objects }),

  updateObject: (id, updates) => set((state) => ({
    projectObjects: state.projectObjects.map(obj =>
      obj.id === id ? { ...obj, ...updates } : obj
    )
  })),

  removeObject: (id) => set((state) => ({
    projectObjects: state.projectObjects.filter(obj => obj.id !== id)
  })),

  clearObjects: () => set({ projectObjects: [] })
}));

// ─── Selector Hooks (useShallow for render isolation) ────────────────────────

/**
 * ONLY picks `activeTool` and `setActiveTool`.
 * The toolbar memoizes on this → clicking a tool never re-renders the canvas.
 */
export const useActiveToolSlice = () =>
  useUrbAssistProjectStore(
    useShallow((s) => ({ activeTool: s.activeTool, setActiveTool: s.setActiveTool }))
  );

/**
 * ONLY picks `projectObjects` — for the 3D scene.
 * Moving a house in 2D → store updates → ONLY TerrainDioramaScene re-renders.
 */
export const useProjectObjects = () =>
  useUrbAssistProjectStore(useShallow((s) => s.projectObjects));

/**
 * ONLY picks compliance report data — for the PLU Alert Banner.
 * Canvas changes → debounced compliance calc → ONLY banner re-renders.
 */
export const useComplianceSlice = () =>
  useUrbAssistProjectStore(
    useShallow((s) => ({
      complianceReport: s.complianceReport,
      parcelBoundary: s.parcelBoundary,
    }))
  );

/**
 * Summary data for the right-panel TABLEAU RÉCAPITULATIF.
 * Reads compliance report + project objects count — NOTHING else.
 */
export const useSummarySlice = () =>
  useUrbAssistProjectStore(
    useShallow((s) => ({
      complianceReport: s.complianceReport,
      objectCount: s.projectObjects.length,
    }))
  );

/**
 * Guided Placement slice — for PlacementGuideOverlay and SitePlanEditorV2.
 * ONLY re-renders the overlay when placement phase or cursor position changes.
 */
export const usePlacementSlice = () =>
  useUrbAssistProjectStore(
    useShallow((s) => ({
      placementMode: s.placementMode,
      cursorGuidePoint: s.cursorGuidePoint,
      startGuidedPlacement: s.startGuidedPlacement,
      updateCursorGuide: s.updateCursorGuide,
      commitPlacement: s.commitPlacement,
      cancelPlacement: s.cancelPlacement,
    }))
  );
