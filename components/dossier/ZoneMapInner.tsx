"use client";

import React, { useCallback, useEffect, useMemo } from "react";
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
function createParcelLabelIcon(label: string): L.DivIcon {
  return L.divIcon({
    className: "parcel-label-marker",
    html: `<span style="display:inline-block;padding:2px 6px;background:rgba(0,0,0,0.6);color:white;font-size:11px;font-weight:600;border-radius:2px;pointer-events:none;">${label}</span>`,
    iconSize: [60, 20],
    iconAnchor: [30, 10],
  });
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
      if (pos) out.push({ position: pos, label: `${p.section} ${p.number}`.trim() || p.id });
    }
    return out;
  }, [parcels]);

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
      <div className={showRegulationSidebar ? "grid grid-cols-1 lg:grid-cols-3 gap-4" : "block"}>
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
        <div className={showRegulationSidebar ? "lg:col-span-2 order-1 lg:order-2 rounded-xl overflow-hidden border border-white/10 bg-slate-900" : "w-full h-full min-h-[380px] rounded-xl overflow-hidden border border-white/10 bg-slate-900"}>
          <style>{`.parcel-label-marker { border: none !important; background: transparent !important; }`}</style>
          <MapContainer
            center={center ? [center.lat, center.lng] : FRANCE_CENTER}
            zoom={center ? 18 : 6}
            minZoom={6}
            maxZoom={21}
            className="w-full rounded-xl"
            zoomControl={false}
            style={{ height: showRegulationSidebar ? 320 : "100%", minHeight: showRegulationSidebar ? 320 : 380 }}
          >
            <ZoomControl position="topright" />
            <TileLayer url={AERIAL_TILE_URL} attribution={AERIAL_ATTRIBUTION} />
            {center && <Marker position={[center.lat, center.lng]} />}
            {parcelCollection && (
              <GeoJSON
                key={`parcels-${parcelCollection.features.map((f) => (f.properties as { id?: string })?.id).join("-")}-sel-${selectedParcelIds.join(",")}`}
                data={parcelCollection as GeoJsonObject}
                style={parcelStyle}
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
            {parcelLabels.map(({ position, label }, i) => (
              <Marker key={`label-${i}-${label}`} position={position} icon={createParcelLabelIcon(label)} zIndexOffset={400} />
            ))}
            <MapController center={center} zoom={zoom} onZoomChange={setZoom} />
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
