"use client";

import React, { useState, useEffect } from "react";
import {
  Home,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Layers,
  PanelRightOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface BuildingOpening {
  id: string;
  type: "window" | "door" | "garage_door" | "skylight" | "french_window";
  facade: "north" | "south" | "east" | "west";
  width: number; // meters
  height: number; // meters
  sillHeight: number; // meters from floor
  count: number;
  /** Shutter type (spec 2.6: hinged or rolling) */
  shutter?: "hinged" | "rolling" | "none";
}

export interface BuildingDetail {
  id: string;
  name: string;
  isExisting: boolean;
  width: number; // meters
  depth: number; // meters
  wallHeights: { ground: number; first: number; second: number };
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
  color: string;
  /** Altitude (m) for placement on terrain, e.g. 0.00 or +1.50 */
  altitudeM?: number;
}

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
  { id: "window", label: "Window" },
  { id: "door", label: "Door" },
  { id: "french_window", label: "French Window" },
  { id: "garage_door", label: "Garage Door" },
  { id: "skylight", label: "Skylight" },
];

const FACADES = [
  { id: "north", label: "North" },
  { id: "south", label: "South" },
  { id: "east", label: "East" },
  { id: "west", label: "West" },
];

const SHUTTER_OPTIONS = [
  { id: "none", label: "None" },
  { id: "hinged", label: "Hinged (Battants)" },
  { id: "rolling", label: "Rolling (Roulants)" },
];

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

  useEffect(() => {
    if (highlight) setExpanded(true);
  }, [highlight]);

  const update = (patch: Partial<BuildingDetail>) => {
    onChange({ ...building, ...patch });
  };

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

  return (
    <div className={cn("rounded-xl border overflow-hidden", highlight ? "border-blue-500 ring-2 ring-blue-500/30 bg-slate-800/80" : "border-white/10 bg-slate-800/50", className)}>
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
            {building.width}m x {building.depth}m ·{" "}
            {building.isExisting ? "Existing" : "New"} ·{" "}
            {ROOF_TYPES.find((r) => r.id === building.roof.type)?.label || "Flat"}
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {expanded && (
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
              <Layers className="w-3 h-3" />
              Dimensions (m)
            </label>
            <div className="grid grid-cols-2 gap-2">
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
                />
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
                    },
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-white text-sm"
              >
                {ROOF_TYPES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              {building.roof.type !== "flat" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">
                      Pitch (deg)
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={60}
                      value={building.roof.pitch}
                      onChange={(e) =>
                        update({
                          roof: {
                            ...building.roof,
                            pitch: Number(e.target.value) || 35,
                          },
                        })
                      }
                      className="w-full px-2 py-1.5 rounded bg-slate-800 border border-white/10 text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">
                      Overhang (m)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={2}
                      step={0.1}
                      value={building.roof.overhang}
                      onChange={(e) =>
                        update({
                          roof: {
                            ...building.roof,
                            overhang: Number(e.target.value) || 0,
                          },
                        })
                      }
                      className="w-full px-2 py-1.5 rounded bg-slate-800 border border-white/10 text-white text-sm"
                    />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">
                  Roof Material
                </label>
                <select
                  value={building.roof.material || ROOF_MATERIALS[0]}
                  onChange={(e) =>
                    update({
                      roof: { ...building.roof, material: e.target.value },
                    })
                  }
                  className="w-full px-2 py-1.5 rounded bg-slate-800 border border-white/10 text-white text-sm"
                >
                  {ROOF_MATERIALS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
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

          {/* Openings */}
          <div>
            <button
              type="button"
              onClick={() => setOpeningsExpanded(!openingsExpanded)}
              className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white transition-colors"
            >
              <span className="font-medium">
                Openings ({(building.openings || []).length})
              </span>
              {openingsExpanded ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>

            {openingsExpanded && (
              <div className="mt-2 space-y-2">
                {(building.openings || []).map((opening, idx) => (
                  <div
                    key={opening.id}
                    className="p-2 rounded-lg bg-slate-900/50 border border-white/5 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white font-medium">
                        #{idx + 1} {OPENING_TYPES.find((o) => o.id === opening.type)?.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeOpening(idx)}
                        className="p-1 text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
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
                ))}
                <button
                  type="button"
                  onClick={addOpening}
                  className="w-full flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-white/10 text-slate-400 hover:text-white hover:border-white/20 text-xs transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add opening
                </button>
              </div>
            )}
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
      )}
    </div>
  );
}

// Utility to create a default building detail
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
    color: "#3b82f6",
    altitudeM: 0,
    ...overrides,
  };
}

// Create from OSM data
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
