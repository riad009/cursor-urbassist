"use client";

/**
 * Phase 6 — Parcel Management Panel
 *
 * Right-panel tab that shows:
 * 1. Parcel summary (count, total area)
 * 2. Merge button (if ≥2 parcels detected)
 * 3. Boundary classification from OSM road-type API
 * 4. Auto-dimension button
 */

import React, { useState } from "react";
import {
  MapPin,
  Merge,
  Route,
  Ruler,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface DetectedRoad {
  name: string;
  type: string;
  classification:
    | "voie_communale"
    | "voie_departementale"
    | "voie_nationale"
    | "chemin_rural"
    | "autoroute"
    | "voie_privee"
    | "inconnu";
  classificationLabel: string;
  distance: number;
  ref?: string;
}

export interface ParcelSummary {
  count: number;
  totalAreaM2: number;
  parcelIds: string[];
  centroid?: { lat: number; lng: number };
}

interface ParcelManagementPanelProps {
  parcelSummary: ParcelSummary;
  roads: DetectedRoad[];
  isLoadingRoads: boolean;
  isMerging: boolean;
  onClassifyBoundaries: () => void;
  onMergeParcels: () => void;
  onAddDimensions: () => void;
  projectId: string | null;
}

// Colour + label by boundary classification
const CLASSIFICATION_META: Record<
  DetectedRoad["classification"],
  { color: string; badge: string; pluNote: string; dotColor: string }
> = {
  voie_departementale: {
    color: "text-red-600",
    badge: "bg-red-100 text-red-700 border border-red-200",
    dotColor: "bg-red-500",
    pluNote: "Specific PLU setback rules may apply (Art. R.111-6 Dept. roads)",
  },
  voie_nationale: {
    color: "text-orange-600",
    badge: "bg-orange-100 text-orange-700 border border-orange-200",
    dotColor: "bg-orange-500",
    pluNote: "National road — check PLU for specific recul rules",
  },
  voie_communale: {
    color: "text-amber-600",
    badge: "bg-amber-100 text-amber-700 border border-amber-200",
    dotColor: "bg-amber-500",
    pluNote: "Public communal road — standard front setback applies",
  },
  chemin_rural: {
    color: "text-yellow-600",
    badge: "bg-yellow-100 text-yellow-700 border border-yellow-200",
    dotColor: "bg-yellow-500",
    pluNote: "Rural path — verify access rights with commune",
  },
  autoroute: {
    color: "text-red-700",
    badge: "bg-red-200 text-red-800 border border-red-300",
    dotColor: "bg-red-700",
    pluNote: "Motorway — 100m setback minimum (Art. L.111-6)",
  },
  voie_privee: {
    color: "text-green-600",
    badge: "bg-green-100 text-green-700 border border-green-200",
    dotColor: "bg-green-500",
    pluNote: "Private boundary — neighbour/co-owner consent required",
  },
  inconnu: {
    color: "text-slate-500",
    badge: "bg-slate-100 text-slate-600 border border-slate-200",
    dotColor: "bg-slate-400",
    pluNote: "Unclassified — verify with cadastre",
  },
};

function RoadBadge({ road }: { road: DetectedRoad }) {
  const meta = CLASSIFICATION_META[road.classification];
  return (
    <div className="flex items-start gap-2 py-2 border-b border-slate-100 last:border-0">
      <span className={cn("mt-0.5 w-2 h-2 rounded-full flex-shrink-0", meta.dotColor)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-slate-900 truncate">{road.name}</span>
          {road.ref && (
            <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1 rounded">
              {road.ref}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", meta.badge)}>
            {road.classificationLabel}
          </span>
          <span className="text-[10px] text-slate-400">{road.distance}m away</span>
        </div>
        <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{meta.pluNote}</p>
      </div>
    </div>
  );
}

export function ParcelManagementPanel({
  parcelSummary,
  roads,
  isLoadingRoads,
  isMerging,
  onClassifyBoundaries,
  onMergeParcels,
  onAddDimensions,
  projectId,
}: ParcelManagementPanelProps) {
  const [roadsExpanded, setRoadsExpanded] = useState(true);

  const hasMultipleParcels = parcelSummary.count >= 2;
  const hasRoads = roads.length > 0;
  const frontRoad = roads.find(
    (r) =>
      r.classification !== "voie_privee" && r.classification !== "inconnu"
  );

  const areaHa = (parcelSummary.totalAreaM2 / 10000).toFixed(4);
  const areaDisplay =
    parcelSummary.totalAreaM2 >= 10000
      ? `${areaHa} ha`
      : `${Math.round(parcelSummary.totalAreaM2)} m²`;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-3 border-b border-slate-200 bg-emerald-50/50">
        <div className="flex items-center gap-2 mb-2">
          <MapPin className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-semibold text-slate-900">
            Parcel Management
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white rounded-lg p-2 border border-slate-200">
            <div className="text-[10px] text-slate-400 mb-0.5">Parcels</div>
            <div className="text-lg font-bold text-slate-900">
              {parcelSummary.count}
            </div>
          </div>
          <div className="bg-white rounded-lg p-2 border border-slate-200">
            <div className="text-[10px] text-slate-400 mb-0.5">Total area</div>
            <div className="text-sm font-bold text-slate-900">{areaDisplay}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 p-3 space-y-3">
        {/* Merge parcels */}
        {hasMultipleParcels && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <Merge className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-xs font-semibold text-blue-800">
                Multiple parcels detected
              </span>
            </div>
            <p className="text-[10px] text-blue-600 mb-2">
              {parcelSummary.count} parcels can be merged into one unified
              polygon using geometric union.
            </p>
            <button
              onClick={onMergeParcels}
              disabled={isMerging}
              className={cn(
                "w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors",
                isMerging
                  ? "bg-blue-200 text-blue-400 cursor-not-allowed"
                  : "bg-blue-500 hover:bg-blue-600 text-white"
              )}
            >
              {isMerging ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <Merge className="w-3 h-3" />
              )}
              {isMerging ? "Merging…" : "Merge into single polygon"}
            </button>
          </div>
        )}

        {/* Boundary classification */}
        <div>
          <button
            onClick={() => setRoadsExpanded((v) => !v)}
            className="w-full flex items-center justify-between mb-2"
          >
            <div className="flex items-center gap-1.5">
              <Route className="w-3.5 h-3.5 text-slate-600" />
              <span className="text-xs font-semibold text-slate-800">
                Boundary Classification
              </span>
              {hasRoads && (
                <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">
                  {roads.length} road{roads.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
            {roadsExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>

          {roadsExpanded && (
            <>
              {!hasRoads ? (
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 text-center">
                  <Route className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
                  <p className="text-xs text-slate-400 mb-2">
                    No boundary data yet. Click to detect bordering roads and
                    classify each boundary edge.
                  </p>
                  <button
                    onClick={onClassifyBoundaries}
                    disabled={isLoadingRoads || !parcelSummary.centroid}
                    className={cn(
                      "w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors",
                      isLoadingRoads || !parcelSummary.centroid
                        ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                        : "bg-emerald-500 hover:bg-emerald-600 text-white"
                    )}
                  >
                    {isLoadingRoads ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Route className="w-3 h-3" />
                    )}
                    {isLoadingRoads
                      ? "Detecting roads…"
                      : !parcelSummary.centroid
                      ? "No parcel location"
                      : "Classify boundaries"}
                  </button>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  {/* Legend */}
                  <div className="px-3 pt-2.5 pb-1.5 bg-slate-50 border-b border-slate-100 flex items-center gap-3 flex-wrap">
                    {[
                      { dot: "bg-red-500", label: "Departmental" },
                      { dot: "bg-amber-500", label: "Public" },
                      { dot: "bg-green-500", label: "Private" },
                    ].map((l) => (
                      <div key={l.label} className="flex items-center gap-1">
                        <span className={cn("w-2 h-2 rounded-full", l.dot)} />
                        <span className="text-[10px] text-slate-500">{l.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="px-3 divide-y divide-slate-100">
                    {roads.map((road, i) => (
                      <RoadBadge key={i} road={road} />
                    ))}
                  </div>
                  <div className="px-3 py-2 border-t border-slate-100">
                    <button
                      onClick={onClassifyBoundaries}
                      disabled={isLoadingRoads}
                      className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors"
                    >
                      <RefreshCw
                        className={cn(
                          "w-3 h-3",
                          isLoadingRoads && "animate-spin"
                        )}
                      />
                      Refresh from OSM
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* PLU warnings from detected road types */}
        {frontRoad &&
          (frontRoad.classification === "voie_departementale" ||
            frontRoad.classification === "autoroute") && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-800 mb-0.5">
                  PLU Alert:{" "}
                  {frontRoad.classification === "autoroute"
                    ? "Motorway"
                    : "Departmental road"}{" "}
                  detected
                </p>
                <p className="text-[10px] text-amber-700 leading-tight">
                  {frontRoad.classification === "autoroute"
                    ? "Minimum 100m setback from motorway edge (Art. L.111-6 C.urb.)."
                    : `Route "${frontRoad.name}" may impose additional setback rules. Verify with local PLU before drawing.`}
                </p>
              </div>
            </div>
          )}

        {/* Dimension annotations */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Ruler className="w-3.5 h-3.5 text-slate-600" />
            <span className="text-xs font-semibold text-slate-800">
              Distance Annotations
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mb-2">
            Auto-draw dimension lines from each building to its nearest parcel
            boundary edges.
          </p>
          <button
            onClick={onAddDimensions}
            className="w-full py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
          >
            <Ruler className="w-3 h-3" />
            Add boundary dimensions
          </button>
        </div>

        {/* Info */}
        <div className="flex items-start gap-2 p-2 rounded-lg bg-blue-50/50 border border-blue-100">
          <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-slate-500 leading-tight">
            Boundary data sourced from OpenStreetMap via Overpass API. Road
            classification follows French PLU/Code de l&apos;urbanisme conventions.
          </p>
        </div>

        {/* All compliant indicator */}
        {hasRoads &&
          roads.every(
            (r) =>
              r.classification !== "autoroute" &&
              r.classification !== "voie_departementale"
          ) && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <p className="text-[10px] text-emerald-700">
                No special road setbacks detected. Standard PLU rules apply.
              </p>
            </div>
          )}
      </div>
    </div>
  );
}
