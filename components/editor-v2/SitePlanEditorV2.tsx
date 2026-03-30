"use client";

/**
 * SitePlanEditorV2.tsx — Render-Isolated 2D Site Plan Editor
 *
 * Architecture:
 *  - activeTool lives in ZUSTAND (not local state) → toolbar never re-renders canvas
 *  - ProjectToolbar + PluAlertBanner are React.memo'd → 0ms re-render on tool switch
 *  - Canvas bridge uses a stable ref (canvasRef) + module-level debounce
 *  - Parcel boundary loaded via hardened parsePrimaryParcel → single clean ring
 *  - PLU compliance recalculated on every canvas mutation via debounced bridge
 *  - All Fabric.js objects tagged with surfaceType for PLU / R3F engines
 *  - Guided placement flow: tool click → reticle follows mouse → click to place
 *
 * Mandates:
 *  1. Sanitized parcel import (no trash lines)
 *  2. Zero-lag UI (useShallow + React.memo isolation)
 *  3. PLU engine preservation (surfaceType tags + live compliance)
 *  4. 3D sync via projectObjects Zustand slice
 *  5. Guided placement UX (crosshair reticle + French tooltip)
 */

import React, { useRef, useEffect, useCallback } from "react";
import * as fabric from "fabric";

// Inline debounce (no lodash dependency)
function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  debounced.cancel = () => { if (timer) clearTimeout(timer); timer = null; };
  return debounced as T & { cancel: () => void };
}

import {
  useUrbAssistProjectStore,
  useActiveToolSlice,
  ProjectObject,
  SurfaceType,
  EditorTool,
} from "@/store/useUrbAssistProjectStore";
import { parsePrimaryParcel, createFabricParcelBoundary } from "@/lib/parcelSanitizer";
import {
  generateComplianceReport,
  type FabricCanvasObject,
  type SetbackRequirements,
} from "@/lib/plu-math";
import { getAssetDescriptor, getGlbPath, getCanvasFill } from "@/lib/assets-library";

import PluAlertBanner from "./PluAlertBanner";
import ProjectToolbar from "./ProjectToolbar";
import PlacementGuideOverlay from "./PlacementGuideOverlay";

// ─── Module-Level Debounced Bridge ────────────────────────────────────────────
// Created exactly ONCE outside React. Never invalidated by re-renders.
// Fires on object:modified/added/removed → syncs canvas → Zustand → 3D scene.

const _bridgeFactory = () => {
  let _syncFn: ((objects: ProjectObject[]) => void) | null = null;
  let _complianceFn: ((report: any) => void) | null = null;
  let _ppm = 10;
  let _pluRules: any = null;
  let _parcelAreaOverride: number | undefined;

  const exec = debounce((canvas: fabric.Canvas) => {
    if (!_syncFn) return;

    const raw = canvas.getObjects() as any[];

    // ── Sync projectObjects to Zustand ──────────────────────────────
    const payload: ProjectObject[] = raw
      .filter((o) => !o.excludeFromExport && o.surfaceType && o.surfaceType !== "boundary")
      .map((o) => {
        const scaleX = o.scaleX ?? 1;
        const scaleY = o.scaleY ?? 1;
        const w = (o.width ?? 0) * scaleX;
        const h = (o.height ?? 0) * scaleY;
        const type: SurfaceType = o.surfaceType ?? "other";

        return {
          id: o.id ?? `auto_${Math.random().toString(36).slice(2, 9)}`,
          type,
          fabricProps: {
            x: o.left ?? 0,
            y: o.top ?? 0,
            angle: o.angle ?? 0,
            scaleX,
            scaleY,
            width: w,
            height: h,
          },
          realWorldProps: {
            widthMeters:   w / _ppm,
            lengthMeters:  h / _ppm,
            areaM2:        (w * h) / (_ppm * _ppm),
            elevationMeters: o.elevationValue ?? 0,
            heightMeters:    o.heightMeters ?? 4.5,
          },
          meshPath: getGlbPath(type),
          color: typeof o.fill === "string" ? o.fill : getAssetDescriptor(type).color,
        };
      });

    _syncFn(payload);

    // ── Live PLU Compliance ──────────────────────────────────────────
    if (_complianceFn) {
      const canvasObjects = raw as FabricCanvasObject[];
      const maxCoverage = _pluRules?.maxCoverageRatio ?? null;
      const setbacks: SetbackRequirements | null = _pluRules?.setbacks ?? null;

      const report = generateComplianceReport(
        canvasObjects,
        _ppm,
        maxCoverage,
        setbacks,
        _parcelAreaOverride
      );
      _complianceFn(report);
    }
  }, 100);

  return {
    bind: (
      syncFn: (objects: ProjectObject[]) => void,
      complianceFn: (report: any) => void,
      ppm: number,
      pluRules: any,
      parcelAreaOverride?: number
    ) => {
      _syncFn = syncFn;
      _complianceFn = complianceFn;
      _ppm = ppm;
      _pluRules = pluRules;
      _parcelAreaOverride = parcelAreaOverride;
    },
    fire: (canvas: fabric.Canvas) => exec(canvas),
    cancel: () => exec.cancel(),
  };
};

const _bridge = _bridgeFactory();

// ─── Props ────────────────────────────────────────────────────────────────────

interface SitePlanEditorV2Props {
  canvasWidth?: number;
  canvasHeight?: number;
  pixelsPerMeter?: number;
  /** Raw GeoJSON from the backend — sanitized into a single parcel boundary */
  rawParcelGeoJSON?: unknown;
  /** PLU rules for live compliance (optional — compliance degrades gracefully) */
  pluRules?: any;
  /** Override parcel area from DB */
  parcelAreaOverrideM2?: number;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SitePlanEditorV2({
  canvasWidth = 1200,
  canvasHeight = 800,
  pixelsPerMeter = 10,
  rawParcelGeoJSON,
  pluRules,
  parcelAreaOverrideM2,
}: SitePlanEditorV2Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);

  // Stable store references (actions only — no reactive state)
  const syncObjects         = useUrbAssistProjectStore((s) => s.syncObjects);
  const setComplianceReport = useUrbAssistProjectStore((s) => s.setComplianceReport);
  const setPixelsPerMeter   = useUrbAssistProjectStore((s) => s.setPixelsPerMeter);
  const setPluRules         = useUrbAssistProjectStore((s) => s.setPluRules);

  // Read activeTool via shallow selector — keep in a ref for stable mouse handler
  const { activeTool } = useActiveToolSlice();
  const activeToolRef = useRef<EditorTool>(activeTool);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);

  // ── Bind the bridge (sync + compliance) ─────────────────────────────────
  useEffect(() => {
    setPixelsPerMeter(pixelsPerMeter);
    if (pluRules) setPluRules(pluRules);
    _bridge.bind(syncObjects, setComplianceReport, pixelsPerMeter, pluRules, parcelAreaOverrideM2);
  }, [pixelsPerMeter, syncObjects, setComplianceReport, setPixelsPerMeter, setPluRules, pluRules, parcelAreaOverrideM2]);

  // ── Fabric.js Initialization (runs ONCE) ──────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current || fabricRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: canvasWidth,
      height: canvasHeight,
      backgroundColor: "#f8f9fb",
      selection: true,
      preserveObjectStacking: true,
      renderOnAddRemove: true,
    });

    fabricRef.current = canvas;

    // Bridge events
    const onChange = () => _bridge.fire(canvas);
    canvas.on("object:modified", onChange);
    canvas.on("object:added",    onChange);
    canvas.on("object:removed",  onChange);

    // ── Guided Placement: mouse:move → update cursor guide point ──
    canvas.on("mouse:move", (opt: fabric.TEvent) => {
      const state = useUrbAssistProjectStore.getState();
      if (state.placementMode.phase !== "guided") return;

      // Get canvas-relative pixel coordinates for the HTML overlay
      const canvasEl = canvas.getSelectionElement();
      if (!canvasEl) return;
      const rect = canvasEl.getBoundingClientRect();
      const hostRect = canvasHostRef.current?.getBoundingClientRect();
      if (!hostRect) return;

      const me = opt.e as MouseEvent;
      const relX = me.clientX - hostRect.left;
      const relY = me.clientY - hostRect.top;

      state.updateCursorGuide(relX, relY);
    });

    // ── Escape key → cancel placement ──
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const state = useUrbAssistProjectStore.getState();
        if (state.placementMode.phase !== "idle") {
          state.cancelPlacement();
        }
      }
    };
    window.addEventListener("keydown", handleKey);

    return () => {
      _bridge.cancel();
      canvas.off("object:modified", onChange);
      canvas.off("object:added",    onChange);
      canvas.off("object:removed",  onChange);
      canvas.dispose();
      fabricRef.current = null;
      window.removeEventListener("keydown", handleKey);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Mandate 1: Parcel Sanitizer + Auto-Zoom ──────────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !rawParcelGeoJSON) return;

    const parsed = parsePrimaryParcel(rawParcelGeoJSON);
    if (!parsed) return;

    // Remove any previously loaded boundary objects
    const existing = canvas.getObjects().filter((o: any) => o.isParcel);
    existing.forEach((o) => canvas.remove(o));

    const parcelPoly = createFabricParcelBoundary(parsed, {
      pixelsPerMeter,
      canvasCenterX: canvasWidth / 2,
      canvasCenterY: canvasHeight / 2,
      metersPerDegLng: Math.cos((parsed.centroid[1] * Math.PI) / 180) * 111_320,
      metersPerDegLat: 111_320,
    });

    canvas.add(parcelPoly);

    // Auto-zoom to fit the parcel boundary with padding
    const parcelBounds = parcelPoly.getBoundingRect();
    if (parcelBounds.width > 0 && parcelBounds.height > 0) {
      const padX = 80;
      const padY = 80;
      const scaleX = (canvasWidth - padX * 2) / parcelBounds.width;
      const scaleY = (canvasHeight - padY * 2) / parcelBounds.height;
      const zoom = Math.min(scaleX, scaleY, 3);

      const centerX = parcelBounds.left + parcelBounds.width / 2;
      const centerY = parcelBounds.top + parcelBounds.height / 2;

      canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
      canvas.zoomToPoint(new fabric.Point(centerX, centerY), zoom);

      const vpt = canvas.viewportTransform!;
      vpt[4] = canvasWidth / 2 - centerX * zoom;
      vpt[5] = canvasHeight / 2 - centerY * zoom;
      canvas.setViewportTransform(vpt);
    }

    canvas.renderAll();
    _bridge.fire(canvas);
  }, [rawParcelGeoJSON, pixelsPerMeter, canvasWidth, canvasHeight]);

  // ── Guided Placement: mouse:down handler ──────────────────────────────────
  const handleMouseDown = useCallback((opt: fabric.TEvent) => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const state = useUrbAssistProjectStore.getState();
    const { placementMode } = state;

    // ── Phase: GUIDED → place the object at click position ──
    if (placementMode.phase === "guided" && placementMode.tool) {
      const pointer = canvas.getScenePoint(opt.e as MouseEvent);
      const surfaceType = placementMode.tool;
      const descriptor = getAssetDescriptor(surfaceType);
      const ppm = pixelsPerMeter;
      const [wm, hm, dm] = descriptor.defaultMeters;

      let obj: fabric.FabricObject | null = null;

      if (surfaceType === "vrd") {
        // VRD: dashed line
        const line = new fabric.Line(
          [pointer.x, pointer.y, pointer.x + 60, pointer.y],
          { stroke: descriptor.color, strokeWidth: 3, strokeDashArray: [6, 3] }
        );
        line.set({ id: `vrd_${Date.now()}`, surfaceType: "vrd" } as any);
        obj = line;
      } else if (surfaceType === "garden") {
        // Garden: circle representing green space
        const radius = Math.max(10, (wm * ppm) / 2);
        const circle = new fabric.Circle({
          left: pointer.x - radius,
          top: pointer.y - radius,
          radius,
          fill: descriptor.canvasFill,
          stroke: "#16a34a",
          strokeWidth: 1.5,
        });
        circle.set({ id: `garden_${Date.now()}`, surfaceType: "garden" } as any);
        obj = circle;
      } else {
        // Building, pool, parking, access, freeform → tagged Rect
        const pw = wm * ppm;
        const ph = dm * ppm;
        const rect = new fabric.Rect({
          left: pointer.x - pw / 2,
          top: pointer.y - ph / 2,
          width: pw,
          height: ph,
          fill: descriptor.canvasFill,
          stroke: "rgba(0,0,0,0.15)",
          strokeWidth: 1,
          cornerColor: "#2563eb",
          transparentCorners: false,
        });
        rect.set({
          id: `${surfaceType}_${Date.now()}`,
          surfaceType,
          heightMeters: hm,
        } as any);
        obj = rect;
      }

      if (obj) {
        canvas.add(obj);
        canvas.setActiveObject(obj);
        canvas.renderAll();
      }

      // Transition: guided → idle (object is now active / selected)
      state.commitPlacement();
      return;
    }

    // ── Phase: IDLE / ACTIVE with 'select' tool → default Fabric behavior ──
    // No custom action needed — Fabric handles selection/dragging natively
  }, [pixelsPerMeter]);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.on("mouse:down", handleMouseDown as any);
    return () => { canvas.off("mouse:down", handleMouseDown as any); };
  }, [handleMouseDown]);

  // ── Dynamic canvas cursor based on placement phase ────────────────────────
  useEffect(() => {
    return useUrbAssistProjectStore.subscribe((state, prev) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      if (state.placementMode.phase !== prev.placementMode.phase) {
        if (state.placementMode.phase === "guided") {
          canvas.defaultCursor = "crosshair";
          canvas.hoverCursor = "crosshair";
        } else {
          canvas.defaultCursor = "default";
          canvas.hoverCursor = "move";
        }
      }
    });
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 overflow-hidden select-none">
      {/* PLU ALERT BANNER — Only re-renders when compliance report changes */}
      <PluAlertBanner />

      {/* HEADER */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200">
        <button className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors">
          ← Retour
        </button>
        <div className="text-center">
          <h1 className="text-lg font-semibold text-slate-900 italic">
            Éditeur <span className="not-italic">Plan de masse</span>
          </h1>
          <span className="text-[10px] text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">
            by RG Conception
          </span>
        </div>
        <button className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors">
          Terminer →
        </button>
      </div>

      {/* MAIN BODY: Canvas fills full space; ProjectToolbar floats over it */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas Host — floating toolbar renders INSIDE here as absolute child */}
        <div
          ref={canvasHostRef}
          className="flex-1 relative flex items-center justify-center bg-slate-100 overflow-auto p-6"
        >
          <div className="shadow-xl rounded-lg border border-slate-200 overflow-hidden">
            <canvas ref={canvasRef} />
          </div>

          {/* Guided Placement Overlay — zero cost when idle */}
          <PlacementGuideOverlay />

          {/* Floating Left Toolbar — absolute over canvas host */}
          <ProjectToolbar />
        </div>
      </div>
    </div>
  );
}
