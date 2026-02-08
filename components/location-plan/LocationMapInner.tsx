"use client";

import React, { useEffect, useState } from "react";
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
import type { FeatureCollection, Feature } from "geojson";
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

export function LocationMapInner({
  center,
  zoom,
  baseLayer,
  cadastralOverlay,
  onZoomChange,
  className = "",
}: {
  center: { lat: number; lng: number } | null;
  zoom: number;
  baseLayer: "street" | "satellite" | "ign";
  cadastralOverlay: boolean;
  onZoomChange: (zoom: number) => void;
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
          .map((p: { geometry: Feature["geometry"] }): Feature => ({
            type: "Feature",
            geometry: p.geometry,
            properties: {},
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
            data={cadastralData}
            style={{ color: "#3b82f6", weight: 2, fillOpacity: 0.15 }}
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
