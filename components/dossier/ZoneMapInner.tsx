"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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

/** Aerial/satellite base map — avoids OSM tile grid look; cadastral outlines overlay clearly */
const AERIAL_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const AERIAL_ATTRIBUTION = "Tiles © Esri, Maxar, Earthstar Geographics, and the GIS User Community";

/** OpenStreetMap plan base (used in cadastre/plan mode) */
const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = "© OpenStreetMap contributors";

/** IGN Cadastral parcel overlay (WMTS) — shows detailed parcel numbers, boundaries, section labels */
const CADASTRAL_TILE_URL =
  "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}";

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
  const lastCenterRef = React.useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (center) {
      const latLng = `${center.lat},${center.lng}`;
      const lastLatLng = lastCenterRef.current ? `${lastCenterRef.current.lat},${lastCenterRef.current.lng}` : null;
      // Only set view when address changes; do not reset zoom on parcel selection (parent re-renders)
      if (latLng !== lastLatLng) {
        lastCenterRef.current = { lat: center.lat, lng: center.lng };
        map.setView([center.lat, center.lng], 18);
      }
    } else {
      lastCenterRef.current = null;
      map.setView(FRANCE_CENTER, zoom);
    }
  }, [center?.lat, center?.lng, map, zoom]);
  useMapEvents({
    zoomend: () => onZoomChange(map.getZoom()),
  });
  return null;
}

/** Get center [lat, lng] of a GeoJSON geometry (Leaflet convention). */
function getGeometryCenter(geometry: unknown): [number, number] | null {
  try {
    const feature = { type: "Feature" as const, geometry, properties: {} };
    const layer = L.geoJSON(feature as GeoJsonObject);
    const bounds = layer.getBounds();
    if (!bounds.isValid()) return null;
    const c = bounds.getCenter();
    return [c.lat, c.lng];
  } catch {
    return null;
  }
}

export interface ParcelWithGeometry {
  id: string;
  section: string;
  number: string;
  area: number;
  geometry?: unknown;
  coordinates?: number[];
}

/** Only real cadastral Polygon/MultiPolygon from IGN — no fake squares or tile-like shapes. */
function hasRealParcelGeometry(parcel: ParcelWithGeometry): boolean {
  const g = parcel.geometry;
  if (!g || typeof g !== "object" || !("type" in (g as object)) || !("coordinates" in (g as object))) return false;
  const type = (g as { type: string }).type;
  return type === "Polygon" || type === "MultiPolygon";
}

function getParcelGeometry(parcel: ParcelWithGeometry): Feature["geometry"] | null {
  if (hasRealParcelGeometry(parcel)) return parcel.geometry as Feature["geometry"];
  return null;
}

function getParcelCenter(parcel: ParcelWithGeometry): [number, number] | null {
  const geom = getParcelGeometry(parcel);
  if (geom) {
    const c = getGeometryCenter(geom);
    if (c) return c;
  }
  const coords = parcel.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) return [lat, lng];
  }
  return null;
}

/** Small parcel number label (e.g. "BI 259") at centroid — like cadastral map. */
function createParcelLabelIcon(label: string, mode: "satellite" | "cadastre" = "satellite"): L.DivIcon {
  const bg = mode === "cadastre" ? "rgba(30,58,138,0.75)" : "rgba(0,0,0,0.6)";
  return L.divIcon({
    className: "parcel-label-marker",
    html: `<span style="display:inline-block;padding:2px 6px;background:${bg};color:white;font-size:10px;font-weight:600;border-radius:3px;pointer-events:none;white-space:nowrap;letter-spacing:0.3px;">${label}</span>`,
    iconSize: [80, 20],
    iconAnchor: [40, 10],
  });
}

/** Floating toggle button for switching between Vue carte (cadastre) and Vue satellite */
function ViewToggle({ mode, onChange }: { mode: "satellite" | "cadastre"; onChange: (m: "satellite" | "cadastre") => void }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 1000,
        display: "flex",
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
        border: "1px solid rgba(255,255,255,0.15)",
      }}
    >
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange("cadastre"); }}
        style={{
          padding: "6px 14px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          border: "none",
          background: mode === "cadastre" ? "#2563eb" : "rgba(30,41,59,0.85)",
          color: mode === "cadastre" ? "#fff" : "#94a3b8",
          transition: "all 0.15s",
        }}
      >
        Vue carte
      </button>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange("satellite"); }}
        style={{
          padding: "6px 14px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          border: "none",
          borderLeft: "1px solid rgba(255,255,255,0.1)",
          background: mode === "satellite" ? "#2563eb" : "rgba(30,41,59,0.85)",
          color: mode === "satellite" ? "#fff" : "#94a3b8",
          transition: "all 0.15s",
        }}
      >
        Vue satellite
      </button>
    </div>
  );
}

export function ZoneMapInner({
  center,
  parcels = [],
  selectedParcelIds = [],
  onParcelSelect,
  zoneFeatures = [],
  pluZone,
  pluName,
  pluType,
  showRegulationSidebar = true,
  className = "",
}: {
  center: { lat: number; lng: number } | null;
  parcels?: ParcelWithGeometry[];
  selectedParcelIds?: string[];
  onParcelSelect?: (ids: string[]) => void;
  zoneFeatures?: unknown[];
  pluZone: string | null;
  pluName: string | null;
  pluType?: string | null;
  showRegulationSidebar?: boolean;
  className?: string;
}) {
  const [zoom, setZoom] = React.useState(17);
  const [viewMode, setViewMode] = useState<"satellite" | "cadastre">("cadastre");

  const handleParcelClick = useCallback(
    (id: string) => {
      if (!onParcelSelect) return;
      const isSelected = selectedParcelIds.includes(id);
      const next = isSelected
        ? selectedParcelIds.filter((x) => x !== id)
        : [...selectedParcelIds, id];
      onParcelSelect(next);
    },
    [selectedParcelIds, onParcelSelect]
  );

  const zoneCollection = useMemo((): FeatureCollection | null => {
    if (!zoneFeatures || zoneFeatures.length === 0) return null;
    const features = zoneFeatures.filter(
      (f): f is Feature => typeof f === "object" && f !== null && "type" in f && "geometry" in (f as Feature)
    ) as Feature[];
    if (features.length === 0) return null;
    return { type: "FeatureCollection", features };
  }, [zoneFeatures]);

  /** Only real cadastral polygons — no fake rectangles or tile-like shapes. */
  const parcelCollection = useMemo((): FeatureCollection | null => {
    const features: Feature[] = [];
    for (const p of parcels) {
      if (!hasRealParcelGeometry(p)) continue;
      const geom = getParcelGeometry(p);
      if (!geom) continue;
      features.push({
        type: "Feature",
        geometry: geom,
        properties: {
          id: p.id,
          section: p.section,
          number: p.number,
          area: p.area,
          selected: selectedParcelIds.includes(p.id),
        },
      });
    }
    if (features.length === 0) return null;
    return { type: "FeatureCollection", features };
  }, [parcels, selectedParcelIds]);

  /** Parcel labels (section + number) at centroid for each parcel with real geometry. */
  const parcelLabels = useMemo(() => {
    const out: { position: [number, number]; label: string }[] = [];
    for (const p of parcels) {
      if (!hasRealParcelGeometry(p)) continue;
      const pos = getParcelCenter(p);
      if (pos) {
        const areaStr = p.area >= 1000 ? `${(p.area / 1000).toFixed(1)}k` : `${p.area}`;
        out.push({ position: pos, label: `${p.section} ${p.number} · ${areaStr}m²`.trim() });
      }
    }
    return out;
  }, [parcels]);

  const zoneStyle = (feature?: { properties?: Record<string, unknown> }) => {
    const typezone = (feature?.properties?.typezone ?? feature?.properties?.libelle ?? "default") as string;
    const color = getZoneColor(typezone);
    return {
      fillColor: color,
      color: color,
      weight: 1.5,
      opacity: 0.5,
      fillOpacity: 0.08,
      dashArray: "6 4",
    };
  };

  /** Cadastral look: white outlines, yellow highlight for selected (no red rectangles). */
  const parcelStyle = (feature?: { properties?: { id?: string; selected?: boolean } }) => {
    const selected = feature?.properties?.selected ?? false;
    return {
      color: selected ? "#b45309" : "#ffffff",
      weight: selected ? 3 : 1.5,
      fillColor: selected ? "#eab308" : "rgba(255,255,255,0.15)",
      fillOpacity: selected ? 0.7 : 0.2,
      fill: true,
      fillRule: "nonzero" as const,
      opacity: selected ? 1 : 0.95,
    };
  };

  return (
    <div className={className}>
      <div className={showRegulationSidebar ? "grid grid-cols-1 lg:grid-cols-3 gap-4" : "block h-full"}>
        {/* Sidebar: Applicable regulation (like Géoportail) — hidden when map full width */}
        {showRegulationSidebar && (
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
        )}

        {/* Map — full width when no sidebar, else 2/3 */}
        <div className={showRegulationSidebar ? "lg:col-span-2 order-1 lg:order-2 rounded-xl overflow-hidden border border-white/10 bg-slate-900" : "w-full h-full rounded-xl overflow-hidden border border-white/10 bg-slate-900"} style={{ position: "relative" }}>
          <style>{`.parcel-label-marker { border: none !important; background: transparent !important; }`}</style>
          <ViewToggle mode={viewMode} onChange={setViewMode} />
          <MapContainer
            center={center ? [center.lat, center.lng] : FRANCE_CENTER}
            zoom={center ? 18 : 6}
            minZoom={13}
            maxZoom={21}
            className="w-full rounded-xl"
            zoomControl={false}
            style={showRegulationSidebar ? { height: 320, minHeight: 320 } : { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          >
            <ZoomControl position="topright" />
            {/* Base layer: satellite or OSM plan */}
            {viewMode === "satellite" ? (
              <TileLayer key="base-satellite" url={AERIAL_TILE_URL} attribution={AERIAL_ATTRIBUTION} maxNativeZoom={19} maxZoom={21} />
            ) : (
              <TileLayer key="base-osm" url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} maxNativeZoom={19} maxZoom={21} />
            )}
            {/* IGN Cadastral parcel overlay — only in cadastre/plan mode */}
            {viewMode === "cadastre" && (
              <TileLayer
                key="cadastral-overlay"
                url={CADASTRAL_TILE_URL}
                attribution="© IGN Cadastre"
                opacity={0.85}
                zIndex={10}
                minZoom={14}
                maxNativeZoom={19}
                maxZoom={20}
              />
            )}
            {center && <Marker position={[center.lat, center.lng]} />}
            {parcelCollection && (
              <GeoJSON
                key={`parcels-${parcelCollection.features.map((f) => (f.properties as { id?: string })?.id).join("-")}-sel-${selectedParcelIds.join(",")}-vm-${viewMode}`}
                data={parcelCollection as GeoJsonObject}
                style={(feature) => {
                  const selected = (feature?.properties as { selected?: boolean })?.selected ?? false;
                  if (viewMode === "cadastre") {
                    // In cadastre mode: subtle outline for unselected, bold highlight for selected
                    return {
                      color: selected ? "#b45309" : "#3b82f6",
                      weight: selected ? 3 : 1.5,
                      fillColor: selected ? "#eab308" : "#3b82f6",
                      fillOpacity: selected ? 0.45 : 0.08,
                      fill: true,
                      fillRule: "nonzero" as const,
                      opacity: selected ? 1 : 0.5,
                      dashArray: selected ? undefined : "4 4",
                    };
                  }
                  // Satellite mode: original cadastral-look styling
                  return {
                    color: selected ? "#b45309" : "#ffffff",
                    weight: selected ? 3 : 1.5,
                    fillColor: selected ? "#eab308" : "rgba(255,255,255,0.15)",
                    fillOpacity: selected ? 0.7 : 0.2,
                    fill: true,
                    fillRule: "nonzero" as const,
                    opacity: selected ? 1 : 0.95,
                  };
                }}
                onEachFeature={(feature, layer) => {
                  const props = feature.properties as { id?: string; section?: string; number?: string; area?: number };
                  const id = props?.id;
                  if (id && onParcelSelect) {
                    layer.on({
                      click: (e: L.LeafletMouseEvent) => {
                        L.DomEvent.stopPropagation(e);
                        handleParcelClick(id);
                      },
                    });
                    const el = (layer as L.Path & { _path?: HTMLElement })._path;
                    if (el) el.style.cursor = "pointer";
                  }
                  const section = props?.section ?? "";
                  const number = props?.number ?? "";
                  const area = typeof props?.area === "number" ? props.area : 0;
                  const contenanceAres = (area / 100).toFixed(2);
                  layer.bindPopup(
                    `<div class="text-sm"><strong>Parcelle ${section} N°${number}</strong><br/>Contenance ${area} m² (${contenanceAres} a)</div>`,
                    { className: "parcel-popup" }
                  );
                }}
              />
            )}
            {/* Parcel labels: shown in all modes with section, number, and area */}
            {parcelLabels.map(({ position, label }, i) => (
              <Marker key={`label-${i}-${label}-${viewMode}`} position={position} icon={createParcelLabelIcon(label, viewMode)} zIndexOffset={400} />
            ))}
            <MapController center={center} zoom={zoom} onZoomChange={setZoom} />
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
