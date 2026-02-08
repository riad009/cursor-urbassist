"use client";

import React, { useEffect, useState, useCallback } from "react";
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

// Fix Leaflet default icon in Next.js (webpack doesn't resolve default paths)
const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

const FRANCE_CENTER: [number, number] = [46.603354, 1.888334];

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
      map.setView([center.lat, center.lng], 18);
    } else {
      map.setView(FRANCE_CENTER, 6);
    }
  }, [center, map]);

  useMapEvents({
    zoomend: () => onZoomChange(map.getZoom()),
  });

  return null;
}

interface ParcelFeatureProperties {
  id?: string;
  section?: string;
  number?: string;
  area?: number;
}

export function LocationMapInner({
  center,
  zoom,
  baseLayer,
  cadastralOverlay,
  onZoomChange,
  selectedParcelIds = [],
  onParcelSelect,
  className = "",
}: {
  center: { lat: number; lng: number } | null;
  zoom: number;
  baseLayer: "street" | "satellite" | "ign";
  cadastralOverlay: boolean;
  onZoomChange: (zoom: number) => void;
  selectedParcelIds?: string[];
  onParcelSelect?: (ids: string[]) => void;
  className?: string;
}) {
  const [cadastralData, setCadastralData] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    if (!center || !cadastralOverlay) {
      setCadastralData(null);
      return;
    }
    fetch("/api/cadastre/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates: [center.lng, center.lat] }),
    })
      .then((r) => r.json())
      .then((d) => {
        const parcels = d.parcels || [];
        const features = parcels
          .filter((p: { geometry?: unknown }) => p.geometry)
          .map((p: {
            id?: string;
            section?: string;
            number?: string;
            area?: number;
            geometry: Feature["geometry"];
          }): Feature<GeoJsonObject, ParcelFeatureProperties> => ({
            type: "Feature",
            geometry: p.geometry,
            properties: {
              id: p.id,
              section: p.section,
              number: p.number,
              area: p.area,
            },
          }));
        if (features.length > 0) {
          setCadastralData({
            type: "FeatureCollection",
            features,
          });
        } else {
          setCadastralData(null);
        }
      })
      .catch(() => setCadastralData(null));
  }, [center, cadastralOverlay]);

  const handleParcelClick = useCallback(
    (featureId: string | undefined) => {
      if (!featureId || !onParcelSelect) return;
      const id = featureId;
      const isSelected = selectedParcelIds.includes(id);
      const next = isSelected
        ? selectedParcelIds.filter((x) => x !== id)
        : [...selectedParcelIds, id];
      onParcelSelect(next);
    },
    [selectedParcelIds, onParcelSelect]
  );

  const streetUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const satelliteUrl =
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  // IGN orthophoto (France) - data.geopf.fr WMTS, Leaflet z/x/y mapped to TILEMATRIX/TILECOL/TILEROW
  const ignUrl =
    "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&TILEMATRIXSET=PM&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}";

  const tileUrl =
    baseLayer === "street"
      ? streetUrl
      : baseLayer === "ign"
        ? ignUrl
        : satelliteUrl;
  const attribution =
    baseLayer === "street"
      ? "&copy; OpenStreetMap"
      : baseLayer === "ign"
        ? "&copy; IGN / data.gouv.fr"
        : "&copy; Esri";

  return (
    <div className={className}>
      <MapContainer
        center={center ? [center.lat, center.lng] : FRANCE_CENTER}
        zoom={center ? 18 : zoom}
        className="w-full h-full rounded-xl"
        zoomControl={false}
        style={{ height: "100%", minHeight: 400 }}
      >
        <ZoomControl position="topright" />
        <TileLayer url={tileUrl} attribution={attribution} />
        {center && <Marker position={[center.lat, center.lng]} />}
        {cadastralData && cadastralOverlay && (
          <GeoJSON
            data={cadastralData as GeoJsonObject}
            style={(feature) => {
              const id = feature?.properties?.id;
              const selected = id && selectedParcelIds.includes(id);
              return {
                color: selected ? "#1d4ed8" : "#3b82f6",
                weight: selected ? 3 : 2,
                fillColor: selected ? "#2563eb" : "#93c5fd",
                fillOpacity: selected ? 0.35 : 0.15,
              };
            }}
            onEachFeature={(feature, layer) => {
              const id = feature?.properties?.id;
              layer.on({
                click: () => handleParcelClick(id),
                mouseover: function (this: L.GeoJSON) {
                  const path = (this as unknown as { _path?: HTMLElement })._path;
                  if (path) path.style.cursor = "pointer";
                },
                mouseout: function (this: L.GeoJSON) {
                  const path = (this as unknown as { _path?: HTMLElement })._path;
                  if (path) path.style.cursor = "";
                },
              });
            }}
          />
        )}
        <MapController center={center} zoom={zoom} onZoomChange={onZoomChange} />
        <div className="leaflet-bottom leaflet-right">
          <div className="leaflet-control-attribution leaflet-control">
            Leaflet | © OpenStreetMap
          </div>
        </div>
      </MapContainer>
    </div>
  );
}
