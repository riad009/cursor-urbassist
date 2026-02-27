"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Home,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Layers,
  PanelRightOpen,
  AlertTriangle,
  Ruler,
  Box,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  calculateRoofData,
  generatePitchProfile,
  validateOpenings,
  type OpeningConflict,
} from "@/lib/roofCalculations";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BuildingOpening {
  id: string;
  type: "window" | "door" | "sliding_door" | "garage_door" | "skylight" | "french_window";
  facade: "north" | "south" | "east" | "west";
  width: number; // meters
  height: number; // meters
  sillHeight: number; // meters from floor
  count: number;
  /** Shutter type (spec 2.6: hinged or rolling) */
  shutter?: "none" | "roller_shutter" | "traditional_shutter" | "venetian" | "hinged";
}

export interface BuildingRoom {
  id: string;
  label: string;
  area: number; // m²
  flooringType: string;
}

export interface BuildingDetail {
  id: string;
  name: string;
  isExisting: boolean;
  width: number; // meters
  depth: number; // meters
  wallHeights: { ground: number; first: number; second: number };
  /** Wall thickness in meters (default 0.2) */
  wallThickness: number;
  roof: {
    type: "flat" | "gable" | "hip" | "shed" | "mansard";
    pitch: number; // degrees
    overhang: number; // meters
    material: string;
  };
  materials: {
    walls: string;
    roof: string;
    facade: string;
  };
  openings: BuildingOpening[];
  /** Interior rooms with labels and flooring */
  rooms: BuildingRoom[];
  color: string;
  /** Altitude (m) for placement on terrain, e.g. 0.00 or +1.50 */
  altitudeM?: number;
  /** Phase 7: interior layout preset */
  layoutPreset?: "open_plan" | "corridor" | "room_per_floor" | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROOF_TYPES = [
  { id: "flat", label: "Flat (Toit plat)" },
  { id: "gable", label: "Gable (2 pans)" },
  { id: "hip", label: "Hip (4 pans)" },
  { id: "shed", label: "Shed (1 pan)" },
  { id: "mansard", label: "Mansard" },
];

const WALL_MATERIALS = [
  "Enduit blanc",
  "Enduit creme",
  "Pierre naturelle",
  "Brique rouge",
  "Bois (bardage)",
  "Parpaing",
  "Béton brut",
  "Composite",
];

const ROOF_MATERIALS = [
  "Tuile terre cuite",
  "Tuile béton",
  "Ardoise",
  "Zinc",
  "Bac acier",
  "Toiture végétalisée",
  "Membrane EPDM",
  "Shingle",
];

const OPENING_TYPES = [
  { id: "window",        label: "Window (Fenêtre)",          emoji: "🪟" },
  { id: "door",          label: "Door (Porte)",               emoji: "🚪" },
  { id: "sliding_door",  label: "Sliding Door (Coulissante)", emoji: "↔️" },
  { id: "french_window", label: "French Window (Baie vitrée)",emoji: "🏠" },
  { id: "garage_door",   label: "Garage Door (Garage)",       emoji: "🔳" },
  { id: "skylight",      label: "Skylight (Velux)",           emoji: "☀️" },
];

const FACADES = [
  { id: "north", label: "North" },
  { id: "south", label: "South" },
  { id: "east", label: "East" },
  { id: "west", label: "West" },
];

const SHUTTER_OPTIONS = [
  { id: "none",                 label: "None",                      icon: "—" },
  { id: "roller_shutter",       label: "Roller (Volet roulant)",    icon: "≡" },
  { id: "traditional_shutter",  label: "Traditional (Volet battant)",icon: "◫" },
  { id: "venetian",             label: "Venetian (Store vénitien)", icon: "☰" },
  { id: "hinged",               label: "Hinged (Battant)",          icon: "◨" },
];

const FLOORING_TYPES = [
  "Tiles (Carrelage)",
  "Hardwood (Parquet)",
  "Concrete (Béton)",
  "Laminate (Stratifié)",
  "Stone (Pierre)",
  "Carpet (Moquette)",
];

const ROOM_PRESETS = [
  "Bedroom (Chambre)",
  "Living Room (Séjour)",
  "Kitchen (Cuisine)",
  "Bathroom (Salle de bain)",
  "Garage",
  "Office (Bureau)",
  "Hallway (Couloir)",
  "Laundry (Buanderie)",
  "Storage (Rangement)",
];

// ─── Sub-components ───────────────────────────────────────────────────────────

/** SVG cross-section thumbnail for roof pitch */
function RoofProfileThumb({ pitch, roofType }: { pitch: number; roofType: string }) {
  const profile = useMemo(
    () => generatePitchProfile(pitch, roofType as any),
    [pitch, roofType]
  );

  return (
    <svg viewBox={profile.viewBox} className="w-full h-14 rounded-md bg-slate-900/50 border border-white/5">
      {/* Ground */}
      <path d={profile.groundLine} stroke="#475569" strokeWidth="1.5" fill="none" />
      {/* Walls */}
      <path d={profile.wallPath} stroke="#94a3b8" strokeWidth="1.5" fill="none" />
      {/* Roof */}
      <path d={profile.roofPath} stroke="#f97316" strokeWidth="2" fill="rgba(249,115,22,0.15)" strokeLinejoin="round" />
    </svg>
  );
}

/** Stat pill for roof calculations */
function StatPill({ label, value, unit, accent }: { label: string; value: string; unit: string; accent?: string }) {
  return (
    <div className="flex flex-col items-center px-2 py-1.5 rounded-lg bg-slate-900/40 border border-white/5 min-w-0">
      <span className="text-[9px] text-slate-500 uppercase tracking-wide truncate">{label}</span>
      <span className={cn("text-sm font-semibold tabular-nums", accent || "text-white")}>{value}</span>
      <span className="text-[9px] text-slate-500">{unit}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface BuildingDetailPanelProps {
  building: BuildingDetail;
  onChange: (updated: BuildingDetail) => void;
  onRemove?: () => void;
  className?: string;
  /** When true, expand panel and show highlight (e.g. selected from 3D view) */
  highlight?: boolean;
}

export function BuildingDetailPanel({
  building,
  onChange,
  onRemove,
  className,
  highlight = false,
}: BuildingDetailPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [openingsExpanded, setOpeningsExpanded] = useState(false);
  const [roomsExpanded, setRoomsExpanded] = useState(false);
  const [roofCalcExpanded, setRoofCalcExpanded] = useState(false);

  useEffect(() => {
    if (highlight) setExpanded(true);
  }, [highlight]);

  const update = (patch: Partial<BuildingDetail>) => {
    onChange({ ...building, ...patch });
  };

  // ─── Openings ─────────────────────────────────────────────────────────────

  const addOpening = () => {
    const newOpening: BuildingOpening = {
      id: `opening-${Date.now()}`,
      type: "window",
      facade: "south",
      width: 1.2,
      height: 1.4,
      sillHeight: 0.9,
      count: 1,
      shutter: "none",
    };
    update({ openings: [...(building.openings || []), newOpening] });
  };

  const updateOpening = (index: number, patch: Partial<BuildingOpening>) => {
    const openings = [...(building.openings || [])];
    openings[index] = { ...openings[index], ...patch };
    update({ openings });
  };

  const removeOpening = (index: number) => {
    const openings = [...(building.openings || [])];
    openings.splice(index, 1);
    update({ openings });
  };

  // ─── Rooms ────────────────────────────────────────────────────────────────

  const addRoom = () => {
    const newRoom: BuildingRoom = {
      id: `room-${Date.now()}`,
      label: "Bedroom (Chambre)",
      area: 12,
      flooringType: "Tiles (Carrelage)",
    };
    update({ rooms: [...(building.rooms || []), newRoom] });
  };

  const updateRoom = (index: number, patch: Partial<BuildingRoom>) => {
    const rooms = [...(building.rooms || [])];
    rooms[index] = { ...rooms[index], ...patch };
    update({ rooms });
  };

  const removeRoom = (index: number) => {
    const rooms = [...(building.rooms || [])];
    rooms.splice(index, 1);
    update({ rooms });
  };

  // ─── Computed Values ──────────────────────────────────────────────────────

  const roofData = useMemo(
    () =>
      calculateRoofData(
        building.width,
        building.depth,
        { type: building.roof.type, pitch: building.roof.pitch, overhang: building.roof.overhang },
        building.wallThickness || 0.2
      ),
    [building.width, building.depth, building.roof.type, building.roof.pitch, building.roof.overhang, building.wallThickness]
  );

  const openingConflicts = useMemo(
    () =>
      validateOpenings(building.openings || [], building.width, building.depth),
    [building.openings, building.width, building.depth]
  );

  const totalRoomArea = useMemo(
    () => (building.rooms || []).reduce((sum, r) => sum + r.area, 0),
    [building.rooms]
  );

  const conflictMap = useMemo(() => {
    const map: Record<string, OpeningConflict[]> = {};
    for (const c of openingConflicts) {
      (map[c.openingId] ??= []).push(c);
    }
    return map;
  }, [openingConflicts]);

  return (
    <div className={cn("rounded-xl border overflow-hidden transition-all duration-200", highlight ? "border-blue-500 ring-2 ring-blue-500/30 bg-slate-800/80" : "border-white/10 bg-slate-800/50", className)}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 hover:bg-slate-700/30 transition-colors"
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: building.color + "30" }}
        >
          <Home className="w-4 h-4" style={{ color: building.color }} />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-medium text-white">{building.name}</p>
          <p className="text-xs text-slate-400">
            {building.width}m × {building.depth}m ·{" "}
            {building.isExisting ? "Existing" : "New"} ·{" "}
            {ROOF_TYPES.find((r) => r.id === building.roof.type)?.label || "Flat"}
          </p>
        </div>
        {openingConflicts.length > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-amber-400" title={`${openingConflicts.length} conflict(s)`}>
            <AlertTriangle className="w-3 h-3" />
            {openingConflicts.length}
          </span>
        )}
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      <div
        className={cn(
          "transition-all duration-200 overflow-hidden",
          expanded ? "max-h-[3000px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="p-3 pt-0 space-y-4 border-t border-white/5">
          {/* Name */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Name</label>
            <input
              type="text"
              value={building.name}
              onChange={(e) => update({ name: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
            />
          </div>

          {/* Dimensions */}
          <div>
            <label className="block text-xs text-slate-500 mb-2 flex items-center gap-1">
              <Ruler className="w-3 h-3" />
              Dimensions (m)
            </label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">Width</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={0.5}
                  value={building.width}
                  onChange={(e) => update({ width: Number(e.target.value) || 6 })}
                  className="w-full px-2 py-1.5 rounded bg-slate-800 border border-white/10 text-white text-sm"
                  title="Building width in meters"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">Depth</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={0.5}
                  value={building.depth}
                  onChange={(e) => update({ depth: Number(e.target.value) || 6 })}
                  className="w-full px-2 py-1.5 rounded bg-slate-800 border border-white/10 text-white text-sm"
                  title="Building depth in meters"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">Wall (m)</label>
                <input
                  type="number"
                  min={0.1}
                  max={0.5}
                  step={0.05}
                  value={building.wallThickness || 0.2}
                  onChange={(e) => update({ wallThickness: Number(e.target.value) || 0.2 })}
                  className="w-full px-2 py-1.5 rounded bg-slate-800 border border-white/10 text-white text-sm"
                  title="Wall thickness in meters (affects NIA vs GEA)"
                />
              </div>
            </div>
            {/* NIA vs GEA */}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="px-2 py-1.5 rounded bg-slate-900/40 border border-white/5">
                <span className="block text-[9px] text-slate-500 uppercase">GEA</span>
                <span className="text-xs text-white font-medium">{roofData.grossExternalArea} m²</span>
              </div>
              <div className="px-2 py-1.5 rounded bg-slate-900/40 border border-white/5">
                <span className="block text-[9px] text-slate-500 uppercase">NIA</span>
                <span className="text-xs text-emerald-400 font-medium">{roofData.netInternalArea} m²</span>
              </div>
            </div>
            <div className="mt-2">
              <label className="block text-[10px] text-slate-500 mb-0.5">Altitude (m)</label>
              <input
                type="number"
                step={0.01}
                placeholder="0.00"
                value={building.altitudeM ?? ""}
                onChange={(e) => update({ altitudeM: e.target.value === "" ? undefined : Number(e.target.value) })}
                className="w-full px-2 py-1.5 rounded bg-slate-800 border border-white/10 text-white text-sm"
                title="Height relative to terrain for placement"
              />
            </div>
          </div>

          {/* Wall Heights */}
          <div>
            <label className="block text-xs text-slate-500 mb-2">Wall Heights (m)</label>
            <div className="grid grid-cols-3 gap-2">
              {(["ground", "first", "second"] as const).map((floor) => (
                <div key={floor}>
                  <label className="block text-[10px] text-slate-500 mb-0.5 capitalize">
                    {floor === "ground" ? "Ground" : floor === "first" ? "1st" : "2nd"}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    step={0.1}
                    value={building.wallHeights[floor]}
                    onChange={(e) =>
                      update({
                        wallHeights: {
                          ...building.wallHeights,
                          [floor]: Number(e.target.value) || 0,
                        },
                      })
                    }
                    className="w-full px-2 py-1.5 rounded bg-slate-800 border border-white/10 text-white text-sm"
                    title={`${floor} floor wall height in meters`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Roof */}
          <div>
            <label className="block text-xs text-slate-500 mb-2">Roof</label>
            <div className="space-y-2">
              <select
                value={building.roof.type}
                onChange={(e) =>
                  update({
                    roof: {
                      ...building.roof,
                      type: e.target.value as BuildingDetail["roof"]["type"],
                      pitch: e.target.value === "flat" ? 0 : building.roof.pitch || 35,
                    },
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
                title="Roof shape type"
              >
                {ROOF_TYPES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>

              {/* Cross-section preview thumbnail */}
              <RoofProfileThumb pitch={building.roof.type === "flat" ? 0 : building.roof.pitch} roofType={building.roof.type} />

              {/* Pitch slider + Overhang */}
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">
                    {building.roof.type !== "flat" ? `Pitch ${building.roof.pitch}°` : "Pitch (n/a)"}
                  </label>
                  <input
                    type="range"
                    min={5}
                    max={60}
                    value={building.roof.type === "flat" ? 0 : building.roof.pitch}
                    disabled={building.roof.type === "flat"}
                    onChange={(e) =>
                      update({ roof: { ...building.roof, pitch: Number(e.target.value) || 35 } })
                    }
                    className="w-full h-2 accent-orange-500 disabled:opacity-30"
                    title="Drag to adjust roof pitch angle"
                  />
                  {/* Numeric input below slider */}
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={building.roof.type === "flat" ? 0 : building.roof.pitch}
                    disabled={building.roof.type === "flat"}
                    onChange={(e) =>
                      update({ roof: { ...building.roof, pitch: Number(e.target.value) || 35 } })
                    }
                    className="w-full mt-1 px-2 py-1 rounded bg-slate-800 border border-white/10 text-white text-[11px] disabled:opacity-40 text-center"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">Overhang (m)</label>
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={building.roof.overhang}
                    onChange={(e) =>
                      update({ roof: { ...building.roof, overhang: Number(e.target.value) || 0 } })
                    }
                    className="w-full px-2 py-1.5 rounded bg-slate-800 border border-white/10 text-white text-sm"
                    title="Roof overhang distance in meters"
                  />
                </div>
              </div>
              <div className="mt-2">
                <label className="block text-[10px] text-slate-500 mb-0.5">Roof Material</label>
                <select
                  value={building.roof.material || ROOF_MATERIALS[0]}
                  onChange={(e) =>
                    update({ roof: { ...building.roof, material: e.target.value } })
                  }
                  className="w-full px-2 py-1.5 rounded bg-slate-800 border border-white/10 text-white text-sm"
                >
                  {ROOF_MATERIALS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Roof Calculations Summary */}
          <div>
            <button
              type="button"
              onClick={() => setRoofCalcExpanded(!roofCalcExpanded)}
              className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white transition-colors"
            >
              <span className="font-medium flex items-center gap-1">
                <Box className="w-3 h-3" />
                Roof Calculations
              </span>
              {roofCalcExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <div className={cn("transition-all duration-200 overflow-hidden", roofCalcExpanded ? "max-h-[400px] opacity-100 mt-2" : "max-h-0 opacity-0")}>
              <div className="grid grid-cols-2 gap-1.5">
                <StatPill label="Surface Area" value={roofData.surfaceArea.toFixed(1)} unit="m²" accent="text-orange-400" />
                <StatPill label="Ridge Height" value={roofData.ridgeHeight.toFixed(2)} unit="m" accent="text-sky-400" />
                <StatPill label="Drainage Area" value={roofData.drainageArea.toFixed(1)} unit="m²" />
                <StatPill label="Attic Volume" value={roofData.atticVolume.toFixed(1)} unit="m³" />
                <StatPill label="Footprint+OH" value={roofData.footprintWithOverhang.toFixed(1)} unit="m²" accent="text-amber-400" />
                <StatPill label="Wall Vol." value={(2 * (building.width + building.depth) * (building.wallHeights.ground + building.wallHeights.first + building.wallHeights.second) * (building.wallThickness || 0.2)).toFixed(1)} unit="m³" />
              </div>
            </div>
          </div>

          {/* Materials */}
          <div>
            <label className="block text-xs text-slate-500 mb-2 flex items-center gap-1">
              <PanelRightOpen className="w-3 h-3" />
              Wall Materials
            </label>
            <select
              value={building.materials.walls || WALL_MATERIALS[0]}
              onChange={(e) =>
                update({
                  materials: { ...building.materials, walls: e.target.value },
                })
              }
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
            >
              {WALL_MATERIALS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Interior Layout */}
          <div>
            <label className="block text-xs text-slate-500 mb-2 flex items-center gap-1">
              <Layers className="w-3 h-3" />
              Interior Layout
            </label>
            <div className="grid grid-cols-3 gap-1">
              {([
                { id: "open_plan",     label: "Open",     emoji: "□" },
                { id: "corridor",      label: "Corridor", emoji: "⊟" },
                { id: "room_per_floor",label: "Rooms",    emoji: "⊞" },
              ] as const).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => update({ layoutPreset: p.id })}
                  className={cn(
                    "py-1.5 text-[10px] rounded border transition-colors",
                    (building.layoutPreset ?? "open_plan") === p.id
                      ? "border-blue-400 bg-blue-500/20 text-blue-300"
                      : "border-white/10 bg-slate-800/40 text-slate-400 hover:text-white"
                  )}
                >
                  <span className="block text-sm">{p.emoji}</span>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rooms Editor */}
          <div>
            <button
              type="button"
              onClick={() => setRoomsExpanded(!roomsExpanded)}
              className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white transition-colors"
            >
              <span className="font-medium">
                Rooms ({(building.rooms || []).length})
                {totalRoomArea > 0 && (
                  <span className="ml-1 text-emerald-400">· {totalRoomArea.toFixed(1)} m²</span>
                )}
              </span>
              {roomsExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            <div className={cn("transition-all duration-200 overflow-hidden", roomsExpanded ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0")}>
              <div className="mt-2 space-y-2">
                {/* Area budget bar */}
                {totalRoomArea > 0 && (
                  <div>
                    <div className="flex justify-between text-[9px] text-slate-500 mb-0.5">
                      <span>Room area budget</span>
                      <span>{totalRoomArea.toFixed(1)} / {roofData.netInternalArea.toFixed(1)} m²</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-300", totalRoomArea > roofData.netInternalArea ? "bg-red-500" : "bg-emerald-500")}
                        style={{ width: `${Math.min(100, (totalRoomArea / roofData.netInternalArea) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {(building.rooms || []).map((room, idx) => (
                  <div
                    key={room.id}
                    className="p-2 rounded-lg bg-slate-900/50 border border-white/5 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white font-medium">#{idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeRoom(idx)}
                        className="p-1 text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <select
                        value={room.label}
                        onChange={(e) => updateRoom(idx, { label: e.target.value })}
                        className="px-2 py-1 rounded bg-slate-800 border border-white/10 text-white text-[11px]"
                      >
                        {ROOM_PRESETS.map((rp) => (
                          <option key={rp} value={rp}>{rp}</option>
                        ))}
                      </select>
                      <select
                        value={room.flooringType}
                        onChange={(e) => updateRoom(idx, { flooringType: e.target.value })}
                        className="px-2 py-1 rounded bg-slate-800 border border-white/10 text-white text-[11px]"
                      >
                        {FLOORING_TYPES.map((ft) => (
                          <option key={ft} value={ft}>{ft}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] text-slate-500">Area (m²)</label>
                      <input
                        type="number"
                        min={1}
                        max={200}
                        step={0.5}
                        value={room.area}
                        onChange={(e) => updateRoom(idx, { area: Number(e.target.value) || 1 })}
                        className="w-full px-2 py-1 rounded bg-slate-800 border border-white/10 text-white text-[11px]"
                      />
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addRoom}
                  className="w-full flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-white/10 text-slate-400 hover:text-white hover:border-white/20 text-xs transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add room
                </button>
              </div>
            </div>
          </div>

          {/* Openings */}
          <div>
            <button
              type="button"
              onClick={() => setOpeningsExpanded(!openingsExpanded)}
              className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white transition-colors"
            >
              <span className="font-medium">
                Openings ({(building.openings || []).length})
                {openingConflicts.length > 0 && (
                  <span className="ml-1 text-amber-400">· {openingConflicts.length} issue(s)</span>
                )}
              </span>
              {openingsExpanded ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>

            <div className={cn("transition-all duration-200 overflow-hidden", openingsExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0")}>
              <div className="mt-2 space-y-2">
                {(building.openings || []).map((opening, idx) => {
                  const conflicts = conflictMap[opening.id] || [];
                  return (
                    <div
                      key={opening.id}
                      className={cn(
                        "p-2 rounded-lg border space-y-2",
                        conflicts.length > 0
                          ? "bg-red-950/30 border-red-500/30"
                          : "bg-slate-900/50 border-white/5"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white font-medium">
                          #{idx + 1} {OPENING_TYPES.find((o) => o.id === opening.type)?.label}
                        </span>
                        <div className="flex items-center gap-1">
                          {conflicts.length > 0 && (
                            <span className="text-[9px] text-red-400 flex items-center gap-0.5" title={conflicts.map(c => c.message).join('\n')}>
                              <AlertTriangle className="w-3 h-3" />
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => removeOpening(idx)}
                            className="p-1 text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      {/* Conflict messages */}
                      {conflicts.length > 0 && (
                        <div className="text-[9px] text-red-400 space-y-0.5">
                          {conflicts.map((c, ci) => (
                            <p key={ci}>⚠ {c.message}</p>
                          ))}
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-1.5">
                        <select
                          value={opening.type}
                          onChange={(e) =>
                            updateOpening(idx, {
                              type: e.target.value as BuildingOpening["type"],
                            })
                          }
                          className="px-2 py-1 rounded bg-slate-800 border border-white/10 text-white text-[11px]"
                        >
                          {OPENING_TYPES.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <select
                          value={opening.facade}
                          onChange={(e) =>
                            updateOpening(idx, {
                              facade: e.target.value as BuildingOpening["facade"],
                            })
                          }
                          className="px-2 py-1 rounded bg-slate-800 border border-white/10 text-white text-[11px]"
                        >
                          {FACADES.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[9px] text-slate-500 mb-0.5">Shutter</label>
                        <select
                          value={opening.shutter ?? "none"}
                          onChange={(e) =>
                            updateOpening(idx, {
                              shutter: e.target.value as BuildingOpening["shutter"],
                            })
                          }
                          className="w-full px-2 py-1 rounded bg-slate-800 border border-white/10 text-white text-[11px]"
                          title="Hinged (battants) or rolling (roulants)"
                        >
                          {SHUTTER_OPTIONS.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        <div>
                          <label className="block text-[9px] text-slate-500">W (m)</label>
                          <input
                            type="number"
                            min={0.3}
                            max={5}
                            step={0.1}
                            value={opening.width}
                            onChange={(e) =>
                              updateOpening(idx, { width: Number(e.target.value) || 1 })
                            }
                            className="w-full px-1.5 py-1 rounded bg-slate-800 border border-white/10 text-white text-[11px]"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] text-slate-500">H (m)</label>
                          <input
                            type="number"
                            min={0.3}
                            max={4}
                            step={0.1}
                            value={opening.height}
                            onChange={(e) =>
                              updateOpening(idx, { height: Number(e.target.value) || 1 })
                            }
                            className="w-full px-1.5 py-1 rounded bg-slate-800 border border-white/10 text-white text-[11px]"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] text-slate-500">Sill</label>
                          <input
                            type="number"
                            min={0}
                            max={3}
                            step={0.1}
                            value={opening.sillHeight}
                            onChange={(e) =>
                              updateOpening(idx, {
                                sillHeight: Number(e.target.value) || 0,
                              })
                            }
                            className="w-full px-1.5 py-1 rounded bg-slate-800 border border-white/10 text-white text-[11px]"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] text-slate-500">Qty</label>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={opening.count}
                            onChange={(e) =>
                              updateOpening(idx, {
                                count: parseInt(e.target.value, 10) || 1,
                              })
                            }
                            className="w-full px-1.5 py-1 rounded bg-slate-800 border border-white/10 text-white text-[11px]"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={addOpening}
                  className="w-full flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-white/10 text-slate-400 hover:text-white hover:border-white/20 text-xs transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add opening
                </button>
              </div>
            </div>
          </div>

          {/* Remove */}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Remove building
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Utility: Create Default Building ─────────────────────────────────────────

export function createDefaultBuilding(
  overrides: Partial<BuildingDetail> = {}
): BuildingDetail {
  return {
    id: `building-${Date.now()}`,
    name: "New Building",
    isExisting: false,
    width: 12,
    depth: 10,
    wallHeights: { ground: 3, first: 0, second: 0 },
    wallThickness: 0.2,
    roof: {
      type: "gable",
      pitch: 35,
      overhang: 0.5,
      material: "Tuile terre cuite",
    },
    materials: {
      walls: "Enduit blanc",
      roof: "Tuile terre cuite",
      facade: "Enduit blanc",
    },
    openings: [],
    rooms: [],
    color: "#3b82f6",
    altitudeM: 0,
    ...overrides,
  };
}

// ─── Utility: Create from OSM data ───────────────────────────────────────────

export function createBuildingFromOSM(osmBuilding: {
  id: string;
  name: string;
  estimatedHeight: number;
  estimatedLevels: number;
  roofType: string;
  coordinates: Array<{ lat: number; lng: number }>;
}): BuildingDetail {
  const groundHeight = Math.min(osmBuilding.estimatedHeight, 3);
  const remainingHeight = Math.max(0, osmBuilding.estimatedHeight - groundHeight);
  const firstFloor = Math.min(remainingHeight, 2.7);
  const secondFloor = Math.max(0, remainingHeight - firstFloor);

  // Estimate width/depth from coordinates bounding box
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const c of osmBuilding.coordinates) {
    if (c.lat < minLat) minLat = c.lat;
    if (c.lat > maxLat) maxLat = c.lat;
    if (c.lng < minLng) minLng = c.lng;
    if (c.lng > maxLng) maxLng = c.lng;
  }
  // Approximate meters from lat/lng
  const latMeters = (maxLat - minLat) * 111320;
  const lngMeters = (maxLng - minLng) * 111320 * Math.cos((minLat * Math.PI) / 180);

  return createDefaultBuilding({
    id: osmBuilding.id,
    name: osmBuilding.name,
    isExisting: true,
    width: Math.round(Math.max(lngMeters, 4) * 10) / 10,
    depth: Math.round(Math.max(latMeters, 4) * 10) / 10,
    wallHeights: {
      ground: Math.round(groundHeight * 10) / 10,
      first: Math.round(firstFloor * 10) / 10,
      second: Math.round(secondFloor * 10) / 10,
    },
    roof: {
      type: (["flat", "gable", "hip", "shed", "mansard"].includes(osmBuilding.roofType)
        ? osmBuilding.roofType
        : "flat") as BuildingDetail["roof"]["type"],
      pitch: osmBuilding.roofType === "flat" ? 0 : 35,
      overhang: 0.5,
      material: "Tuile terre cuite",
    },
    color: "#6b7280",
  });
}
