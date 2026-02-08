"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const FRANCE_CENTER = { lat: 46.603354, lng: 1.888334 };

interface LocationMapProps {
  center: { lat: number; lng: number } | null;
  zoom: number;
  baseLayer: "street" | "satellite" | "ign";
  cadastralOverlay: boolean;
  onZoomChange: (zoom: number) => void;
  selectedParcelIds?: string[];
  onParcelSelect?: (ids: string[]) => void;
  className?: string;
}

const MapInner = dynamic(
  () => import("./LocationMapInner").then((m) => m.LocationMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-500">
        <span>Loading map…</span>
      </div>
    ),
  }
);

export function LocationMap(props: LocationMapProps) {
  return <MapInner {...props} />;
}
