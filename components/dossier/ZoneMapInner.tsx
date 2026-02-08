"use client";

import React, { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  GeoJSON,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import type { FeatureCollection, Feature, GeoJsonObject } from "geojson";
import "leaflet/dist/leaflet.css";

const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

const FRANCE_CENTER: [number, number] = [46.603354, 1.888334];

/** Colors for PLU zone types (Géoportail-style) */
const ZONE_COLORS: Record<string, string> = {
  UA: "#c0392b",
  UB: "#e67e22",
  UC: "#f1c40f",
  UD: "#27ae60",
  UH: "#16a085",
  AU: "#9b59b6",
  AUD: "#d35400",
  A: "#7f8c8d",
  N: "#2c3e50",
  U: "#27ae60",
  // fallback
  default: "#95a5a6",
};

function getZoneColor(zoneCode: string): string {
  const code = (zoneCode || "").toUpperCase().trim();
  const match = Object.keys(ZONE_COLORS).find((k) => code.startsWith(k) || code === k);
  return match ? ZONE_COLORS[match] : ZONE_COLORS.default;
}

function MapController({
  center,
  zoom,
  onZoomChange,
}: {
  center: { lat: number; lng: number } | null;
  zoom: number;
  onZoomChange: (z: number) => void;
}) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView([center.lat, center.lng], 17);
    } else {
      map.setView(FRANCE_CENTER, zoom);
    }
  }, [center, map, zoom]);
  useMapEvents({
    zoomend: () => onZoomChange(map.getZoom()),
  });
  return null;
}

export interface ParcelWithGeometry {
  id: string;
  section: string;
  number: string;
  area: number;
  geometry?: unknown;
}

export function ZoneMapInner({
  center,
  parcels = [],
  selectedParcelIds = [],
  zoneFeatures = [],
  pluZone,
  pluName,
  pluType,
  className = "",
}: {
  center: { lat: number; lng: number } | null;
  parcels?: ParcelWithGeometry[];
  selectedParcelIds?: string[];
  zoneFeatures?: unknown[];
  pluZone: string | null;
  pluName: string | null;
  pluType?: string | null;
  className?: string;
}) {
  const [zoom, setZoom] = React.useState(17);

  const zoneCollection = useMemo((): FeatureCollection | null => {
    if (!zoneFeatures || zoneFeatures.length === 0) return null;
    const features = zoneFeatures.filter(
      (f): f is Feature => typeof f === "object" && f !== null && "type" in f && "geometry" in (f as Feature)
    ) as Feature[];
    if (features.length === 0) return null;
    return { type: "FeatureCollection", features };
  }, [zoneFeatures]);

  const parcelCollection = useMemo((): FeatureCollection | null => {
    const withGeom = parcels.filter((p) => p.geometry);
    if (withGeom.length === 0) return null;
    const features: Feature[] = withGeom.map((p) => ({
      type: "Feature",
      geometry: p.geometry as Feature["geometry"],
      properties: { id: p.id, selected: selectedParcelIds.includes(p.id) },
    }));
    return { type: "FeatureCollection", features };
  }, [parcels, selectedParcelIds]);

  const zoneStyle = (feature?: { properties?: Record<string, unknown> }) => {
    const typezone = (feature?.properties?.typezone ?? feature?.properties?.libelle ?? "default") as string;
    const color = getZoneColor(typezone);
    return {
      fillColor: color,
      color: color,
      weight: 2,
      opacity: 0.85,
      fillOpacity: 0.35,
    };
  };

  const parcelStyle = (feature?: { properties?: { id?: string; selected?: boolean } }) => {
    const selected = feature?.properties?.selected ?? false;
    return {
      color: selected ? "#3b82f6" : "#64748b",
      weight: selected ? 3 : 1.5,
      fillColor: selected ? "#3b82f6" : "transparent",
      fillOpacity: selected ? 0.25 : 0.05,
    };
  };

  const tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

  return (
    <div className={className}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sidebar: Applicable regulation (like Géoportail) */}
        <div className="lg:col-span-1 order-2 lg:order-1 space-y-2">
          <div className="rounded-xl bg-slate-800/80 border border-white/10 p-4">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
              Applicable regulation
            </p>
            {pluZone || pluName ? (
              <>
                <p className="text-sm font-semibold text-white">
                  Zone classée {pluZone || pluName}
                  {pluName && pluZone && pluName !== pluZone ? ` — ${pluName}` : ""}
                </p>
                {pluType && (
                  <p className="text-xs text-slate-400 mt-1">
                    Plan Local d&apos;Urbanisme{pluType === "PLUi" ? " intercommunal (PLUi)" : " (PLU)"}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-500">No zone detected at this address.</p>
            )}
          </div>
          {zoneCollection && zoneCollection.features.length > 0 && (
            <div className="rounded-xl bg-slate-800/50 border border-white/10 p-3">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                Zones on map
              </p>
              <ul className="space-y-1 text-xs text-slate-300">
                {zoneCollection.features.slice(0, 8).map((f, i) => {
                  const props = f.properties as Record<string, unknown> | undefined;
                  const code = (props?.typezone ?? props?.libelle ?? `Zone ${i + 1}`) as string;
                  const long = (props?.libelong ?? code) as string;
                  return (
                    <li key={i} className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: getZoneColor(code) }}
                      />
                      {code}
                      {long !== code && <span className="text-slate-500 truncate">{long}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Map */}
        <div className="lg:col-span-2 order-1 lg:order-2 rounded-xl overflow-hidden border border-white/10 bg-slate-900">
          <MapContainer
            center={center ? [center.lat, center.lng] : FRANCE_CENTER}
            zoom={center ? 17 : 6}
            className="w-full rounded-xl"
            zoomControl={false}
            style={{ height: 320, minHeight: 320 }}
          >
            <ZoomControl position="topright" />
            <TileLayer url={tileUrl} attribution="&copy; OpenStreetMap" />
            {center && <Marker position={[center.lat, center.lng]} />}
            {zoneCollection && (
              <GeoJSON
                key="zones"
                data={zoneCollection as GeoJsonObject}
                style={zoneStyle}
              />
            )}
            {parcelCollection && (
              <GeoJSON
                key="parcels"
                data={parcelCollection as GeoJsonObject}
                style={parcelStyle}
              />
            )}
            <MapController center={center} zoom={zoom} onZoomChange={setZoom} />
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
