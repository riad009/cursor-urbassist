"use client";

import React from "react";
import dynamic from "next/dynamic";
import type { ParcelWithGeometry } from "./ZoneMapInner";

const ZoneMapInner = dynamic(
  () => import("./ZoneMapInner").then((m) => ({ default: m.ZoneMapInner })),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl bg-slate-800/50 border border-white/10 flex items-center justify-center h-[320px] text-slate-500">
        Loading zone map…
      </div>
    ),
  }
);

export type { ParcelWithGeometry };

export interface ZoneMapProps {
  center: { lat: number; lng: number } | null;
  parcels?: ParcelWithGeometry[];
  selectedParcelIds?: string[];
  onParcelSelect?: (ids: string[]) => void;
  zoneFeatures?: unknown[];
  pluZone: string | null;
  pluName: string | null;
  pluType?: string | null;
  /** When false, only the map is shown (no regulation sidebar), so the map uses full width. */
  showRegulationSidebar?: boolean;
  className?: string;
}

export function ZoneMap(props: ZoneMapProps) {
  return <ZoneMapInner {...props} />;
}
