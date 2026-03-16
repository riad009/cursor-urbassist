/**
 * Terrain3DViewer — Physical Diorama-style 3D Terrain Model
 *
 * Creates a Three.js scene with:
 *  - Real elevation data from IGN RGE Alti® (fetched via /api/terrain/elevation proxy)
 *  - Satellite orthophoto draped OVER the sculpted terrain surface
 *  - Thick dark base slab (physical maquette/diorama style)
 *  - Boundary + parcel lines on terrain
 */
"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ProcessedSiteData } from "@/types/processed-site-data";

// ─── Realistic Procedural Sky (matches 3D-Mapper HDRI-like sky with clouds) ───

function createSkyDome(scene: THREE.Scene): void {
  const skyGeo = new THREE.SphereGeometry(5000, 64, 32);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunPosition: { value: new THREE.Vector3(0.4, 0.3, 0.5) },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      varying vec3 vPosition;
      void main() {
        vPosition = position;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uSunPosition;
      varying vec3 vWorldPosition;
      varying vec3 vPosition;

      // Simple hash for noise
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      // Value noise
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      // FBM for clouds
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p *= 2.0;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorldPosition);
        float y = dir.y;

        // Sky gradient: deep blue zenith -> light blue horizon
        vec3 zenith = vec3(0.30, 0.55, 0.92);  // Deep sky blue
        vec3 horizon = vec3(0.68, 0.80, 0.92); // Pale blue-grey horizon
        vec3 belowHorizon = vec3(0.75, 0.82, 0.90); // Below horizon fade

        float t = max(y, 0.0);
        vec3 skyColor = mix(horizon, zenith, pow(t, 0.5));

        // Below horizon: fade to lighter blue-grey
        if (y < 0.0) {
          skyColor = mix(horizon, belowHorizon, min(-y * 3.0, 1.0));
        }

        // Sun glow
        vec3 sunDir = normalize(uSunPosition);
        float sunDot = max(dot(dir, sunDir), 0.0);
        vec3 sunColor = vec3(1.0, 0.95, 0.85);
        skyColor += sunColor * pow(sunDot, 64.0) * 0.8;
        skyColor += sunColor * pow(sunDot, 8.0) * 0.15;

        // Procedural clouds (only above horizon)
        if (y > 0.01) {
          vec2 uv = dir.xz / (y + 0.1) * 1.8;
          float cloud = fbm(uv * 3.0 + vec2(0.3, 0.7));
          cloud = smoothstep(0.35, 0.65, cloud);

          // Cloud color: white with slight blue tint in shadows
          vec3 cloudColor = vec3(1.0, 1.0, 1.0);
          vec3 cloudShadow = vec3(0.75, 0.80, 0.88);
          float cloudLit = max(dot(vec3(0.0, 1.0, 0.0), sunDir), 0.3);
          vec3 finalCloud = mix(cloudShadow, cloudColor, cloudLit);

          // Fade clouds near horizon
          float horizonFade = smoothstep(0.01, 0.15, y);
          cloud *= horizonFade * 0.7;

          skyColor = mix(skyColor, finalCloud, cloud);
        }

        // Horizon haze
        float haze = 1.0 - smoothstep(0.0, 0.12, abs(y));
        skyColor = mix(skyColor, vec3(0.78, 0.85, 0.92), haze * 0.5);

        gl_FragColor = vec4(skyColor, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
}

// ─── Sedimentary Layer Skirt Material (matches 3D-Mapper earth crust look) ───

function createSkirtMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTopY: { value: 0 },
      uBottomY: { value: -5 },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      void main() {
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vNormal = normalMatrix * normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      uniform float uTopY;
      uniform float uBottomY;

      void main() {
        float range = uTopY - uBottomY;
        float t = clamp((vWorldPos.y - uBottomY) / range, 0.0, 1.0);

        // Sedimentary rock layers (top to bottom)
        vec3 topSoil    = vec3(0.45, 0.32, 0.20); // Dark brown topsoil
        vec3 clay       = vec3(0.62, 0.42, 0.25); // Terracotta clay
        vec3 sandstone  = vec3(0.72, 0.58, 0.38); // Sandy layer
        vec3 darkRock   = vec3(0.35, 0.25, 0.18); // Dark sediment
        vec3 limestone  = vec3(0.65, 0.55, 0.42); // Lighter band
        vec3 bedrock    = vec3(0.30, 0.22, 0.16); // Deep bedrock

        // Create banded layers
        vec3 color;
        if (t > 0.85) {
          color = mix(clay, topSoil, (t - 0.85) / 0.15);
        } else if (t > 0.70) {
          color = mix(sandstone, clay, (t - 0.70) / 0.15);
        } else if (t > 0.55) {
          color = mix(darkRock, sandstone, (t - 0.55) / 0.15);
        } else if (t > 0.35) {
          color = mix(limestone, darkRock, (t - 0.35) / 0.20);
        } else if (t > 0.15) {
          color = mix(bedrock, limestone, (t - 0.15) / 0.20);
        } else {
          color = bedrock;
        }

        // Subtle horizontal striations
        float stripe = sin(vWorldPos.y * 12.0) * 0.03 + sin(vWorldPos.y * 27.0) * 0.015;
        color += stripe;

        // Simple directional lighting
        vec3 lightDir = normalize(vec3(0.4, 1.0, 0.35));
        float diff = max(dot(normalize(vNormal), lightDir), 0.0) * 0.5 + 0.5;
        color *= diff;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  });
}

// ─── Constants ──────────────────────────────────────────────────────────────

const METERS_PER_DEG = 111320;
const DEG_TO_RAD = Math.PI / 180;
const GRID_RES = 128; // 128×128 terrain mesh — smooth diorama quality
const SAT_PAD = 0.5;  // Map tile bbox padding factor

// ─── Module-level elevation cache (survives 2D↔3D toggles) ────────────────
const elevationCache = new Map<string, number[]>();

function getElevationCacheKey(coords: [number, number][]): string {
  // Use first + last + count as a fast key
  if (coords.length === 0) return '';
  const f = coords[0], l = coords[coords.length - 1];
  return `${f[0].toFixed(6)},${f[1].toFixed(6)}|${l[0].toFixed(6)},${l[1].toFixed(6)}|${coords.length}`;
}

// ── User-placed building from 2D canvas ──
export interface UserBuilding3D {
  id: string;
  name: string;
  type: string; // house, pool, garden, terrace, parking, garage, shed, carport, annex, extension
  width: number;   // meters
  depth: number;   // meters
  canvasX: number; // px on 2D canvas
  canvasY: number; // px on 2D canvas
  canvasAngle: number; // degrees
  wallHeights?: { ground?: number; first?: number; second?: number };
  roofType?: string; // flat, gable, hip, shed
  roofPitch?: number; // degrees
  roofOverhang?: number; // meters
  color?: string;
}

interface Terrain3DViewerProps {
  processedSiteData: ProcessedSiteData | null;
  parcelGeoJSON?: any;
  width?: number;
  height?: number;
  userBuildings?: UserBuilding3D[];
  canvasWidth?: number;
  canvasHeight?: number;
  pixelsPerMeter?: number;
}

// ─── Elevation fetcher (via our proxy to avoid CORS) ────────────────────────

async function fetchElevationsBatch(
  coords: [number, number][],
  onProgress?: (msg: string) => void
): Promise<number[]> {
  if (coords.length === 0) return [];

  // Check module-level cache first
  const cacheKey = getElevationCacheKey(coords);
  if (elevationCache.has(cacheKey)) {
    onProgress?.('Using cached elevation data...');
    return elevationCache.get(cacheKey)!;
  }

  const CHUNK = 50;
  const result: number[] = [];

  for (let i = 0; i < coords.length; i += CHUNK) {
    const chunk = coords.slice(i, i + CHUNK);
    const pointsParam = chunk.map(([lng, lat]) => `${lng},${lat}`).join("|");

    onProgress?.(`Fetching elevations ${i + 1}-${Math.min(i + CHUNK, coords.length)} of ${coords.length}...`);

    try {
      const res = await fetch(`/api/terrain/elevation?points=${encodeURIComponent(pointsParam)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.elevations)) {
          result.push(...data.elevations);
        } else {
          result.push(...chunk.map(() => 0));
        }
      } else {
        result.push(...chunk.map(() => 0));
      }
    } catch {
      result.push(...chunk.map(() => 0));
    }

    // Small delay between batches
    if (i + CHUNK < coords.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // Save to module-level cache for 2D↔3D toggle persistence
  elevationCache.set(cacheKey, result);
  return result;
}

/**
 * Generate a dense grid of elevation points for the given bounding box.
 */
async function fetchDenseElevationGrid(
  minLng: number, maxLng: number, minLat: number, maxLat: number,
  targetPoints: number,
  onProgress?: (msg: string) => void
): Promise<Array<{ lng: number; lat: number; elevation: number }>> {
  const centerLat = (minLat + maxLat) / 2;
  const widthM = (maxLng - minLng) * METERS_PER_DEG * Math.cos(centerLat * DEG_TO_RAD);
  const heightM = (maxLat - minLat) * METERS_PER_DEG;

  // Compute spacing to get roughly targetPoints
  const area = widthM * heightM;
  const spacing = Math.sqrt(area / targetPoints);
  const dLng = spacing / (METERS_PER_DEG * Math.cos(centerLat * DEG_TO_RAD));
  const dLat = spacing / METERS_PER_DEG;

  // Generate grid
  const gridPts: [number, number][] = [];
  for (let lng = minLng; lng <= maxLng; lng += dLng) {
    for (let lat = minLat; lat <= maxLat; lat += dLat) {
      gridPts.push([lng, lat]);
    }
  }

  if (gridPts.length === 0) return [];

  onProgress?.(`Generating ${gridPts.length} elevation points...`);
  const elevations = await fetchElevationsBatch(gridPts, onProgress);

  const validCount = elevations.filter((e) => e > 0).length;
  onProgress?.(`Got ${validCount} valid elevations from IGN`);

  return gridPts.map((coord, i) => ({
    lng: coord[0],
    lat: coord[1],
    elevation: elevations[i] ?? 0,
  }));
}

// ─── IDW Interpolation ─────────────────────────────────────────────────────

function idwInterpolate(
  x: number, z: number,
  pts: Array<{ x: number; z: number; y: number }>,
  power: number = 2
): number {
  let wSum = 0, vSum = 0;
  for (const p of pts) {
    const d = Math.sqrt((x - p.x) ** 2 + (z - p.z) ** 2);
    if (d < 0.001) return p.y;
    const w = 1 / Math.pow(d, power);
    wSum += w;
    vSum += w * p.y;
  }
  return wSum > 0 ? vSum / wSum : 0;
}

// ─── Boundary helpers ─────────────────────────────────────────────────────

function extractBoundaryCoords(geom: { type: string; coordinates: unknown }): number[][] {
  if (geom.type === "Polygon") {
    return (geom.coordinates as number[][][])[0];
  }
  return (geom.coordinates as number[][][][])[0][0];
}

function computeBbox(coords: number[][]): { minLng: number; maxLng: number; minLat: number; maxLat: number } {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  }
  return { minLng, maxLng, minLat, maxLat };
}

// ─── Map Tile Texture Loader (topographic map from IGN PLANIGNV2) ────────────

async function loadMapTexture(
  bbox: { minLng: number; maxLng: number; minLat: number; maxLat: number },
  pad: number,
  renderer: THREE.WebGLRenderer
): Promise<{ texture: THREE.Texture; gridBounds: any } | null> {
  try {
    const pLng = (bbox.maxLng - bbox.minLng) * pad;
    const pLat = (bbox.maxLat - bbox.minLat) * pad;
    const bboxStr = `${bbox.minLng - pLng},${bbox.minLat - pLat},${bbox.maxLng + pLng},${bbox.maxLat + pLat}`;

    const res = await fetch(`/api/terrain/satellite?bbox=${bboxStr}&width=2048&height=2048`);
    if (!res.ok) return null;
    const data = await res.json();

    const { tileUrls, tileSize, numTiles, gridBounds } = data;
    const canvas = document.createElement("canvas");
    canvas.width = numTiles.x * tileSize;
    canvas.height = numTiles.y * tileSize;
    const ctx = canvas.getContext("2d")!;

    const loadImg = (url: string) => new Promise<HTMLImageElement>((ok, fail) => {
      const img = new Image(); img.crossOrigin = "anonymous";
      img.onload = () => ok(img); img.onerror = fail; img.src = url;
    });

    const all: Promise<{ r: number; c: number; img: HTMLImageElement | null }>[] = [];
    for (let r = 0; r < tileUrls.length; r++)
      for (let c = 0; c < tileUrls[r].length; c++)
        all.push(loadImg(tileUrls[r][c]).then((img) => ({ r, c, img })).catch(() => ({ r, c, img: null })));

    (await Promise.all(all)).forEach(({ r, c, img }) => {
      if (img) ctx.drawImage(img, c * tileSize, r * tileSize, tileSize, tileSize);
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    return { texture, gridBounds };
  } catch {
    return null;
  }
}


// ═════════════════════════════════════════════════════════════════════════════
// ── COMPONENT ──
// ═════════════════════════════════════════════════════════════════════════════

export default function Terrain3DViewer({ processedSiteData, parcelGeoJSON, width, height, userBuildings, canvasWidth, canvasHeight, pixelsPerMeter }: Terrain3DViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    animId: number;
    terrainMesh?: THREE.Mesh;
    skirtMesh?: THREE.Mesh;
    bottomCap?: THREE.Mesh;
  } | null>(null);
  const [status, setStatus] = useState("Initializing...");
  const [isReady, setIsReady] = useState(false);
  const [zScale, setZScale] = useState(1.0);
  // Store terrain build data for dynamic z-exaggeration
  const terrainDataRef = useRef<{
    baseExag: number;
    minE: number;
    eRange: number;
    sceneElev: Array<{ x: number; z: number; y: number }>;
    normPts: Array<{ x: number; z: number; y: number }>;
    cX: number;
    cZ: number;
    slabH: number;
    pos: THREE.BufferAttribute;
    gridN: number;
  } | null>(null);

  const buildScene = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    if (!processedSiteData && !parcelGeoJSON) return;

    // Cleanup previous
    if (sceneRef.current) {
      cancelAnimationFrame(sceneRef.current.animId);
      sceneRef.current.renderer.dispose();
      sceneRef.current.controls.dispose();
      container.innerHTML = "";
    }

    const W = width || container.clientWidth || 800;
    const H = height || container.clientHeight || 600;

    // ── Resolve boundary with comprehensive fallback chain ──
    // Priority: globalBoundary → mergedBoundary → build from parcels → parcelGeoJSON prop
    let boundary: any = null;

    // 1. Try globalBoundary (new pipeline)
    if (processedSiteData?.globalBoundary?.geometry) {
      boundary = processedSiteData.globalBoundary;
      console.log("[terrain3d] Using globalBoundary");
    }

    // 2. Try mergedBoundary (old pipeline)
    if (!boundary && (processedSiteData as any)?.mergedBoundary?.geometry) {
      boundary = (processedSiteData as any).mergedBoundary;
      console.log("[terrain3d] Using mergedBoundary (legacy)");
    }

    // 3. Build boundary from parcels[].coordinates
    if (!boundary && processedSiteData?.parcels && processedSiteData.parcels.length > 0) {
      try {
        // Collect ALL coordinates from all parcels to compute a bounding envelope
        const allRings: number[][] = [];
        processedSiteData.parcels.forEach((p) => {
          if (p.coordinates?.[0]) {
            allRings.push(...p.coordinates[0]);
          }
        });

        if (allRings.length >= 3) {
          // Use the first parcel's ring as boundary (or bbox if multiple parcels)
          let ring: number[][];
          if (processedSiteData.parcels.length === 1) {
            ring = processedSiteData.parcels[0].coordinates[0];
          } else {
            // Create bbox from all parcel coords
            let mnLng = Infinity, mxLng = -Infinity, mnLat = Infinity, mxLat = -Infinity;
            allRings.forEach(([lng, lat]) => {
              mnLng = Math.min(mnLng, lng); mxLng = Math.max(mxLng, lng);
              mnLat = Math.min(mnLat, lat); mxLat = Math.max(mxLat, lat);
            });
            ring = [
              [mnLng, mnLat], [mxLng, mnLat], [mxLng, mxLat],
              [mnLng, mxLat], [mnLng, mnLat]
            ];
          }

          boundary = {
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: [ring] }
          };
          console.log("[terrain3d] Built boundary from", processedSiteData.parcels.length, "parcels,", ring.length, "vertices");
        }
      } catch (e) {
        console.warn("[terrain3d] Failed to build boundary from parcels:", e);
      }
    }

    // 4. Try parcelGeoJSON prop (raw data from project)
    if (!boundary && parcelGeoJSON) {
      try {
        let extractedCoords: number[][][] | null = null;

        if (parcelGeoJSON.type === "FeatureCollection" && Array.isArray(parcelGeoJSON.features)) {
          const firstFeature = parcelGeoJSON.features[0];
          if (firstFeature?.geometry?.coordinates?.[0]) {
            extractedCoords = firstFeature.geometry.coordinates;
          }
        } else if (parcelGeoJSON.type === "Polygon" && parcelGeoJSON.coordinates) {
          extractedCoords = parcelGeoJSON.coordinates;
        } else if (parcelGeoJSON.type === "Feature" && parcelGeoJSON.geometry?.coordinates) {
          extractedCoords = parcelGeoJSON.geometry.coordinates;
        }

        if (extractedCoords && extractedCoords[0] && extractedCoords[0].length >= 3) {
          boundary = {
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: extractedCoords }
          };
          console.log("[terrain3d] Built boundary from parcelGeoJSON prop");
        }
      } catch (e) {
        console.warn("[terrain3d] Failed to extract boundary from parcelGeoJSON:", e);
      }
    }

    if (!boundary?.geometry) {
      setStatus("No boundary geometry found");
      console.error("[terrain3d] No boundary available from any source");
      return;
    }

    const bCoords = extractBoundaryCoords(boundary.geometry);
    const bbox = computeBbox(bCoords);
    const refPoint = processedSiteData?.refPoint || {
      lng: (bbox.minLng + bbox.maxLng) / 2,
      lat: (bbox.minLat + bbox.maxLat) / 2,
    };
    const cosLat = Math.cos(refPoint.lat * DEG_TO_RAD);

    // ═══════════════════════════════════════════════════════════════════════
    // ── STEP 1: GET REAL ELEVATION DATA ──
    // ═══════════════════════════════════════════════════════════════════════

    interface ElevPt { lng: number; lat: number; elevation: number }
    let elevPoints: ElevPt[] = [];

    // Check pipeline data first
    if (processedSiteData?.topographyGrid && processedSiteData.topographyGrid.length > 3) {
      elevPoints = processedSiteData.topographyGrid;
      console.log(`[terrain3d] Using ${elevPoints.length} cached topography points`);
    }

    // Add vertices3D if they have elevations
    if (processedSiteData?.vertices3D) {
      const withElev = processedSiteData.vertices3D.filter((v) => v.elevation > 0);
      if (withElev.length > 0) {
        elevPoints = [...elevPoints, ...withElev];
      }
    }

    // If no elevation data, FETCH from IGN via our proxy
    const validElevCount = elevPoints.filter((v) => v.elevation > 0).length;
    if (validElevCount < 3) {
      setStatus("Fetching real elevation data from IGN RGE Alti®...");
      console.log("[terrain3d] No cached elevation data, fetching from IGN...");

      try {
        // Expand bbox for terrain padding
        const padLng = (bbox.maxLng - bbox.minLng) * 0.5;
        const padLat = (bbox.maxLat - bbox.minLat) * 0.5;
        const fetched = await fetchDenseElevationGrid(
          bbox.minLng - padLng, bbox.maxLng + padLng,
          bbox.minLat - padLat, bbox.maxLat + padLat,
          300, // ~300 points for good coverage
          setStatus
        );
        const validFetched = fetched.filter((v) => v.elevation > 0);
        if (validFetched.length >= 3) {
          elevPoints = fetched;
          console.log(`[terrain3d] Got ${validFetched.length} valid elevations from IGN`);
        } else {
          console.warn("[terrain3d] IGN returned no valid elevations");
          setStatus("No elevation data available — using flat terrain with satellite");
        }
      } catch (err) {
        console.warn("[terrain3d] Elevation fetch failed:", err);
        setStatus("Elevation unavailable — flat terrain");
      }
    }

    // ── Project to scene space ──
    const validElev = elevPoints.filter((v) => v.elevation > 0);
    const sceneElev = validElev.map((v) => ({
      x: (v.lng - refPoint.lng) * METERS_PER_DEG * cosLat,
      z: -(v.lat - refPoint.lat) * METERS_PER_DEG,
      y: v.elevation,
    }));

    const eVals = sceneElev.map((v) => v.y);
    const minE = eVals.length > 0 ? Math.min(...eVals) : 0;
    const maxE = eVals.length > 0 ? Math.max(...eVals) : 0;
    const eRange = maxE - minE;
    const hasElev = sceneElev.length >= 3 && eRange > 0.01;

    console.log(`[terrain3d] Elevation: ${sceneElev.length} pts, range: ${minE.toFixed(1)}-${maxE.toFixed(1)}m (Δ${eRange.toFixed(2)}m), hasElev: ${hasElev}`);

    // ═══════════════════════════════════════════════════════════════════════
    // ── STEP 2: TERRAIN GEOMETRY ──
    // ═══════════════════════════════════════════════════════════════════════

    // Scene-space boundary extent
    let minSX = Infinity, maxSX = -Infinity, minSZ = Infinity, maxSZ = -Infinity;
    bCoords.forEach(([lng, lat]) => {
      const sx = (lng - refPoint.lng) * METERS_PER_DEG * cosLat;
      const sz = -(lat - refPoint.lat) * METERS_PER_DEG;
      minSX = Math.min(minSX, sx); maxSX = Math.max(maxSX, sx);
      minSZ = Math.min(minSZ, sz); maxSZ = Math.max(maxSZ, sz);
    });

    const TPAD = 0.6;
    const pX = (maxSX - minSX) * TPAD || 15;
    const pZ = (maxSZ - minSZ) * TPAD || 15;
    minSX -= pX; maxSX += pX; minSZ -= pZ; maxSZ += pZ;

    const tW = maxSX - minSX;
    const tD = maxSZ - minSZ;
    const tSpan = Math.max(tW, tD, 30);
    const cX = (minSX + maxSX) / 2;
    const cZ = (minSZ + maxSZ) / 2;

    // Exaggeration: dramatic visible relief — 25% of span for maquette-like diorama
    // For flat terrain (small eRange), enforce a minimum exaggeration so it's always visible
    const targetH = tSpan * 0.25;
    const rawExag = hasElev ? targetH / eRange : 1;
    const exag = Math.max(rawExag, 3.0); // Minimum 3× exag — flat areas still show relief

    // Normalize elevation to [0, targetH]
    const normPts = hasElev
      ? sceneElev.map((p) => ({ x: p.x, z: p.z, y: (p.y - minE) * exag }))
      : [];

    setStatus("Building 3D terrain mesh...");

    // ═══════════════════════════════════════════════════════════════════════
    // ── STEP 3: THREE.JS SCENE ──
    // ═══════════════════════════════════════════════════════════════════════

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xc8ddf0);  // Sky-matching pale blue
    scene.fog = null; // No fog — terrain must stay fully colored at all zoom distances

    const far = Math.max(6000, tSpan * 12);
    const camera = new THREE.PerspectiveCamera(35, W / H, 0.3, far);
    const cd = tSpan * 1.0;
    camera.position.set(cX + cd * 0.55, targetH + cd * 0.65, cZ + cd * 0.55);
    camera.lookAt(cX, hasElev ? targetH * 0.3 : 0, cZ);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.5; // Brighter for vibrant satellite colors

    container.innerHTML = "";
    const cvs = renderer.domElement;
    cvs.style.cursor = "grab";
    cvs.style.touchAction = "none";
    cvs.addEventListener("pointerdown", () => (cvs.style.cursor = "grabbing"));
    cvs.addEventListener("pointerup", () => (cvs.style.cursor = "grab"));
    cvs.addEventListener("pointerleave", () => (cvs.style.cursor = "grab"));
    container.appendChild(cvs);

    const controls = new OrbitControls(camera, cvs);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = Math.max(3, tSpan * 0.1);
    controls.maxDistance = tSpan * 5;
    controls.target.set(cX, hasElev ? targetH * 0.3 : 0, cZ);
    controls.enablePan = true;

    // Lighting
    const sd = Math.max(80, tSpan * 1.5);
    const sun = new THREE.DirectionalLight(0xfff8e8, 2.5);  // Warm sunlight — boosted
    sun.position.set(sd * 0.4, sd * 1.0, sd * 0.35);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = sd * 4;
    sun.shadow.camera.left = -sd;
    sun.shadow.camera.right = sd;
    sun.shadow.camera.top = sd;
    sun.shadow.camera.bottom = -sd;
    sun.shadow.bias = -0.0002;
    scene.add(sun);
    scene.add(new THREE.DirectionalLight(0xc8d8e8, 0.5));  // Cool fill — boosted
    scene.add(new THREE.HemisphereLight(0x87ceeb, 0x5a7b4e, 0.55));
    scene.add(new THREE.AmbientLight(0xf0f0f0, 0.3));

    // ── SKY DOME ──
    createSkyDome(scene);

    // ═══════════════════════════════════════════════════════════════════════
    // ── TERRAIN MESH ──
    // ═══════════════════════════════════════════════════════════════════════

    const terrainGeom = new THREE.PlaneGeometry(tW, tD, GRID_RES, GRID_RES);
    terrainGeom.rotateX(-Math.PI / 2);
    const pos = terrainGeom.attributes.position;

    if (normPts.length >= 3) {
      // Phase 1: IDW interpolation with higher power for smoother falloff
      for (let i = 0; i < pos.count; i++) {
        const gx = pos.getX(i) + cX;
        const gz = pos.getZ(i) + cZ;
        pos.setY(i, idwInterpolate(gx, gz, normPts, 3));
      }

      // Phase 2: Gaussian-like smoothing pass — eliminates spikes
      const gridN = GRID_RES + 1;
      const smoothed = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) smoothed[i] = pos.getY(i);

      const SMOOTH_PASSES = 3;
      for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
        for (let row = 1; row < gridN - 1; row++) {
          for (let col = 1; col < gridN - 1; col++) {
            const idx = row * gridN + col;
            // 3×3 weighted average (center=4, sides=2, corners=1 → total=16)
            const c = smoothed[idx] * 4;
            const n = (smoothed[idx - gridN] + smoothed[idx + gridN] + smoothed[idx - 1] + smoothed[idx + 1]) * 2;
            const d = smoothed[idx - gridN - 1] + smoothed[idx - gridN + 1] + smoothed[idx + gridN - 1] + smoothed[idx + gridN + 1];
            smoothed[idx] = (c + n + d) / 16;
          }
        }
      }
      for (let i = 0; i < pos.count; i++) pos.setY(i, smoothed[i]);
    }
    // Recompute normals after height displacement + smoothing
    terrainGeom.computeVertexNormals();

    // Vertex colors — matching 3D Mapper's vibrant topographic palette
    // Strong greens dominate, grey only at the steepest rocky peaks
    const colors = new Float32Array(pos.count * 3);
    let yMin = Infinity, yMax = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      yMin = Math.min(yMin, pos.getY(i));
      yMax = Math.max(yMax, pos.getY(i));
    }
    const yR = yMax - yMin || 1;

    // Also compute slope per vertex for rocky grey areas
    const slopeGridN = GRID_RES + 1;
    const slopes = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const col = i % slopeGridN;
      const row = Math.floor(i / slopeGridN);
      let maxDiff = 0;
      // Check neighbors
      if (col > 0) maxDiff = Math.max(maxDiff, Math.abs(pos.getY(i) - pos.getY(i - 1)));
      if (col < GRID_RES) maxDiff = Math.max(maxDiff, Math.abs(pos.getY(i) - pos.getY(i + 1)));
      if (row > 0) maxDiff = Math.max(maxDiff, Math.abs(pos.getY(i) - pos.getY(i - slopeGridN)));
      if (row < GRID_RES) maxDiff = Math.max(maxDiff, Math.abs(pos.getY(i) - pos.getY(i + slopeGridN)));
      slopes[i] = maxDiff;
    }
    const maxSlope = Math.max(...slopes) || 1;

    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) - yMin) / yR; // 0=lowest, 1=highest
      const slopeT = slopes[i] / maxSlope;  // 0=flat, 1=steepest
      let r: number, g: number, b: number;

      // Base color: vivid green gradient (matching 3D Mapper closely)
      if (t < 0.25) {
        // Valley: vivid grass green — clearly green even on flat terrain
        r = 0.35 + t * 0.3;  g = 0.58 + t * 0.24;  b = 0.22 + t * 0.12;
      } else if (t < 0.55) {
        // Mid: bright lime-green (dominant 3D Mapper color)
        const s = (t - 0.25) / 0.30;
        r = 0.42 + s * 0.10;  g = 0.64 + s * 0.06;  b = 0.25 + s * 0.06;
      } else if (t < 0.80) {
        // Upper: olive → sage green
        const s = (t - 0.55) / 0.25;
        r = 0.52 + s * 0.10;  g = 0.70 - s * 0.08;  b = 0.31 + s * 0.10;
      } else {
        // Peak: sage → light grey-green (only at absolute peaks)
        const s = (t - 0.80) / 0.20;
        r = 0.62 + s * 0.10;  g = 0.62 + s * 0.04;  b = 0.41 + s * 0.12;
      }

      // Blend towards grey on steep slopes (rocky faces)
      if (slopeT > 0.3) {
        const rockBlend = Math.min(1, (slopeT - 0.3) / 0.5);
        const grey = 0.55 + t * 0.15; // light grey rock
        r = r + (grey - r) * rockBlend * 0.7;
        g = g + (grey - g) * rockBlend * 0.7;
        b = b + (grey - b) * rockBlend * 0.7;
      }

      colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
    }
    terrainGeom.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    // ── UV coordinates for satellite texture mapping ──
    const uvs = new Float32Array(pos.count * 2);
    const gridN = GRID_RES + 1;
    for (let i = 0; i < pos.count; i++) {
      const col = i % gridN;
      const row = Math.floor(i / gridN);
      uvs[i * 2] = col / GRID_RES;
      uvs[i * 2 + 1] = 1 - row / GRID_RES;
    }
    terrainGeom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.65,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const terrainMesh = new THREE.Mesh(terrainGeom, terrainMat);
    terrainMesh.position.set(cX, 0, cZ);
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = true;
    scene.add(terrainMesh);

    // ═══════════════════════════════════════════════════════════════════════
    // ── THICK BASE SLAB + MERGED SKIRT ──
    // ═══════════════════════════════════════════════════════════════════════

    const slabH = Math.max(2.0, targetH * 0.25); // Chunky diorama base

    // Store terrain data for dynamic z-exaggeration (after slabH is computed)
    terrainDataRef.current = {
      baseExag: exag,
      minE,
      eRange,
      sceneElev,
      normPts,
      cX,
      cZ,
      slabH,
      pos: terrainGeom.attributes.position as THREE.BufferAttribute,
      gridN: GRID_RES + 1,
    };
    const skirtMat = createSkirtMaterial();
    // Set uniform Y range: top of terrain to bottom of slab
    skirtMat.uniforms.uTopY.value = targetH;
    skirtMat.uniforms.uBottomY.value = -slabH;
    const eN = GRID_RES + 1;
    const bottomY = -slabH;

    // Build ONE merged skirt geometry for all 4 edges (watertight belt)
    const skirtVertices: number[] = [];
    const skirtIndices: number[] = [];
    let skirtVtxCount = 0;

    const addSkirtQuad = (i1: number, i2: number, flip: boolean) => {
      const x1 = pos.getX(i1) + cX, z1 = pos.getZ(i1) + cZ, y1 = pos.getY(i1);
      const x2 = pos.getX(i2) + cX, z2 = pos.getZ(i2) + cZ, y2 = pos.getY(i2);
      const base = skirtVtxCount;
      if (flip) {
        skirtVertices.push(x2, y2, z2, x1, y1, z1, x1, bottomY, z1, x2, bottomY, z2);
      } else {
        skirtVertices.push(x1, y1, z1, x2, y2, z2, x2, bottomY, z2, x1, bottomY, z1);
      }
      skirtIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      skirtVtxCount += 4;
    };

    // Top edge (row 0)
    for (let i = 0; i < GRID_RES; i++) addSkirtQuad(i, i + 1, false);
    // Bottom edge (last row)
    for (let i = 0; i < GRID_RES; i++) addSkirtQuad(GRID_RES * eN + i, GRID_RES * eN + i + 1, true);
    // Left edge
    for (let j = 0; j < GRID_RES; j++) addSkirtQuad(j * eN, (j + 1) * eN, true);
    // Right edge
    for (let j = 0; j < GRID_RES; j++) addSkirtQuad(j * eN + GRID_RES, (j + 1) * eN + GRID_RES, false);

    const skirtGeom = new THREE.BufferGeometry();
    skirtGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(skirtVertices), 3));
    skirtGeom.setIndex(new THREE.BufferAttribute(new Uint32Array(skirtIndices), 1));
    skirtGeom.computeVertexNormals();
    const skirtMesh = new THREE.Mesh(skirtGeom, skirtMat);
    skirtMesh.receiveShadow = true;
    scene.add(skirtMesh);

    // Bottom cap plate (dark bedrock)
    const bottomCapGeom = new THREE.PlaneGeometry(tW + 0.6, tD + 0.6);
    bottomCapGeom.rotateX(-Math.PI / 2);
    const bottomCap = new THREE.Mesh(bottomCapGeom, new THREE.MeshStandardMaterial({
      color: 0x302216, roughness: 0.95, metalness: 0.02,
    }));
    bottomCap.position.set(cX, bottomY, cZ);
    bottomCap.receiveShadow = true;
    scene.add(bottomCap);

    // ── Parcel boundary outline on terrain (green line) ──
    if (bCoords.length >= 3) {
      const boundaryPts3D = bCoords.map(([lng, lat]) => {
        const sx = (lng - refPoint.lng) * METERS_PER_DEG * cosLat;
        const sz = -(lat - refPoint.lat) * METERS_PER_DEG;
        // Sample terrain height via IDW
        const groundY = normPts.length >= 3 ? idwInterpolate(sx, sz, normPts, 2) : 0;
        return new THREE.Vector3(sx, groundY + 0.3, sz); // +0.3m above terrain to avoid z-fight
      });
      const bLineGeom = new THREE.BufferGeometry().setFromPoints(boundaryPts3D);
      const bLineMat = new THREE.LineBasicMaterial({ color: 0x10b981, linewidth: 2, depthTest: true });
      const bLine = new THREE.LineLoop(bLineGeom, bLineMat);
      scene.add(bLine);
    }

    // No floor plane needed — sky dome provides the background

    // ═══════════════════════════════════════════════════════════════════════
    // ── MAP TILE DRAPING (topographic map — shows real land use colors) ──
    // ═══════════════════════════════════════════════════════════════════════

    setStatus("Loading map tiles...");

    // Load topographic map tiles in background — scene renders with vertex colors first
    loadMapTexture(bbox, SAT_PAD, renderer).then((result) => {
      if (!result) {
        console.warn("[terrain3d] Map tiles unavailable, keeping vertex color fallback");
        setStatus("");
        return;
      }

      const { texture, gridBounds } = result;

      // ── Quality check: reject nearly-white tiles (OpenTopoMap sometimes returns blank tiles) ──
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = 64; tmpCanvas.height = 64;
      const tmpCtx = tmpCanvas.getContext('2d');
      if (tmpCtx && texture.image) {
        try {
          tmpCtx.drawImage(texture.image as HTMLCanvasElement, 0, 0, 64, 64);
          const sampleData = tmpCtx.getImageData(0, 0, 64, 64).data;
          let totalBrightness = 0;
          for (let px = 0; px < sampleData.length; px += 4) {
            totalBrightness += (sampleData[px] + sampleData[px + 1] + sampleData[px + 2]) / 3;
          }
          const avgBrightness = totalBrightness / (sampleData.length / 4);
          if (avgBrightness > 200) {
            console.warn(`[terrain3d] Map tiles too bright (avg=${avgBrightness.toFixed(0)}), keeping vertex colors`);
            setStatus("");
            return;
          }
        } catch { /* ignore sampling errors */ }
      }

      // Compute UV remapping for geo-accurate map placement
      const mapUvs = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        const wx = pos.getX(i) + cX;
        const wz = pos.getZ(i) + cZ;
        const vLng = refPoint.lng + wx / (METERS_PER_DEG * cosLat);
        const vLat = refPoint.lat - wz / METERS_PER_DEG;
        const u = (vLng - gridBounds.minLng) / (gridBounds.maxLng - gridBounds.minLng);
        const v = (vLat - gridBounds.minLat) / (gridBounds.maxLat - gridBounds.minLat);
        mapUvs[i * 2] = Math.max(0, Math.min(1, u));
        mapUvs[i * 2 + 1] = Math.max(0, Math.min(1, v));
      }
      terrainGeom.setAttribute("uv", new THREE.BufferAttribute(mapUvs, 2));
      terrainGeom.attributes.uv.needsUpdate = true;

      // Apply map texture — replaces vertex colors with real map data
      terrainMat.map = texture;
      terrainMat.vertexColors = false;
      terrainMat.needsUpdate = true;

      console.log("[terrain3d] Topographic map tiles applied");
      setStatus("");
    }).catch((err) => {
      console.warn("[terrain3d] Map tile loading failed:", err);
      setStatus("");
    });

    // Zone overlay lines removed — they float and the topographic map already shows zones

    // (BDTOPO auto-fetched buildings removed — only user-placed buildings from 2D canvas are rendered)

    // ═══════════════════════════════════════════════════════════════════════
    // ── USER-PLACED BUILDINGS FROM 2D CANVAS ──
    // ═══════════════════════════════════════════════════════════════════════

    if (userBuildings && userBuildings.length > 0 && canvasWidth && canvasHeight && pixelsPerMeter) {
      setStatus("Placing user buildings on terrain...");
      const ppm = pixelsPerMeter;

      for (const ub of userBuildings) {
        try {
          // Convert canvas coords to 3D scene coords:
          // Canvas (0,0) is top-left; scene uses refPoint as origin
          // canvasX/Y are pixel positions on the 2D Fabric.js canvas
          const localX = (ub.canvasX - canvasWidth / 2) / ppm;
          const localZ = (ub.canvasY - canvasHeight / 2) / ppm;
          const rotY = ub.canvasAngle ? -ub.canvasAngle * DEG_TO_RAD : 0;

          // Ground elevation at building position
          const groundY = normPts.length >= 3 ? idwInterpolate(localX, localZ, normPts, 2) : 0;

          const w = ub.width || 6;
          const d = ub.depth || 6;
          const buildingType = (ub.type || ub.name || '').toLowerCase().trim();

          // ── POOL ──
          if (buildingType.includes('pool') || buildingType.includes('piscine')) {
            const poolDepth = 1.5 * exag * 0.06;
            const deckH = 0.1;
            // Deck
            const deckGeom = new THREE.BoxGeometry(w + 2, deckH, d + 2);
            const deckMat = new THREE.MeshStandardMaterial({ color: 0xddd0b8, roughness: 0.75 });
            const deck = new THREE.Mesh(deckGeom, deckMat);
            deck.position.set(localX, groundY + deckH / 2, localZ); deck.rotation.y = rotY;
            deck.receiveShadow = true; deck.castShadow = true; scene.add(deck);
            // Water surface
            const waterGeom = new THREE.PlaneGeometry(w - 0.2, d - 0.2);
            const waterMat = new THREE.MeshPhysicalMaterial({
              color: 0x3ec8e8, roughness: 0.02, metalness: 0.1, transparent: true, opacity: 0.78,
              transmission: 0.3, clearcoat: 1.0,
            });
            const water = new THREE.Mesh(waterGeom, waterMat);
            water.rotation.x = -Math.PI / 2; water.rotation.z = rotY;
            water.position.set(localX, groundY + deckH + 0.01, localZ);
            water.receiveShadow = true; scene.add(water);
            continue;
          }

          // ── GARDEN ──
          if (buildingType.includes('garden') || buildingType.includes('jardin') || buildingType.includes('green')) {
            const lawnGeom = new THREE.BoxGeometry(w, 0.15, d);
            const lawn = new THREE.Mesh(lawnGeom, new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.95 }));
            lawn.position.set(localX, groundY + 0.075, localZ); lawn.rotation.y = rotY;
            lawn.receiveShadow = true; scene.add(lawn);
            // Hedges
            const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.9 });
            [{ p: [0, 0.55, d/2 - 0.15], s: [w*0.9, 0.8, 0.3] }, { p: [0, 0.55, -d/2 + 0.15], s: [w*0.9, 0.8, 0.3] }].forEach(h => {
              const m = new THREE.Mesh(new THREE.BoxGeometry(h.s[0], h.s[1], h.s[2]), hedgeMat);
              m.position.set(localX + h.p[0], groundY + h.p[1], localZ + h.p[2]); m.rotation.y = rotY;
              m.castShadow = true; scene.add(m);
            });
            continue;
          }

          // ── TERRACE ──
          if (buildingType.includes('terrace') || buildingType.includes('terrasse') || buildingType.includes('deck')) {
            const deckGeom = new THREE.BoxGeometry(w, 0.2, d);
            const deck = new THREE.Mesh(deckGeom, new THREE.MeshStandardMaterial({ color: 0xa1887f, roughness: 0.85 }));
            deck.position.set(localX, groundY + 0.1, localZ); deck.rotation.y = rotY;
            deck.receiveShadow = true; deck.castShadow = true; scene.add(deck);
            continue;
          }

          // ── PARKING ──
          if (buildingType.includes('parking') || buildingType.includes('stationnement')) {
            const surfGeom = new THREE.BoxGeometry(w, 0.08, d);
            const surf = new THREE.Mesh(surfGeom, new THREE.MeshStandardMaterial({ color: 0x455a64, roughness: 0.95 }));
            surf.position.set(localX, groundY + 0.04, localZ); surf.rotation.y = rotY;
            surf.receiveShadow = true; scene.add(surf);
            // Stripes
            const numSlots = Math.max(1, Math.round(w / 2.5));
            for (let si = 0; si <= numSlots; si++) {
              const sx = -w/2 + (w/numSlots) * si;
              const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, d*0.8), new THREE.MeshStandardMaterial({ color: 0xffffff }));
              stripe.position.set(localX + sx, groundY + 0.09, localZ); stripe.rotation.y = rotY; scene.add(stripe);
            }
            continue;
          }

          // ── CARPORT ──
          if (buildingType.includes('carport')) {
            const cH = 2.5;
            const postMat = new THREE.MeshStandardMaterial({ color: 0x757575, roughness: 0.5, metalness: 0.3 });
            [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([sx,sz]) => {
              const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, cH, 8), postMat);
              post.position.set(localX + sx*(w/2-0.15), groundY + cH/2, localZ + sz*(d/2-0.15));
              post.castShadow = true; scene.add(post);
            });
            const canopy = new THREE.Mesh(new THREE.BoxGeometry(w+0.3, 0.08, d+0.3),
              new THREE.MeshStandardMaterial({ color: 0x78909c, roughness: 0.6, metalness: 0.2, transparent: true, opacity: 0.85 }));
            canopy.position.set(localX, groundY + cH, localZ); canopy.rotation.y = rotY;
            canopy.castShadow = true; scene.add(canopy);
            continue;
          }

          // ── DEFAULT: HOUSE / GARAGE / SHED / EXTENSION / ANNEX ──
          const totalH = ((ub.wallHeights?.ground || 0) + (ub.wallHeights?.first || 0) + (ub.wallHeights?.second || 0)) || 3;

          // Foundation plinth
          const plinthH = 0.15;
          const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, plinthH, d + 0.1),
            new THREE.MeshStandardMaterial({ color: 0x807872, roughness: 0.95 }));
          plinth.position.set(localX, groundY + plinthH/2, localZ); plinth.rotation.y = rotY;
          plinth.receiveShadow = true; plinth.castShadow = true; scene.add(plinth);

          // Walls (warm cream stucco like French villas)
          const wallMat = new THREE.MeshStandardMaterial({ color: 0xf5ead0, roughness: 0.78, metalness: 0.01 });
          const wallGeom = new THREE.BoxGeometry(w, totalH, d);
          const walls = new THREE.Mesh(wallGeom, wallMat);
          walls.position.set(localX, groundY + plinthH + totalH/2, localZ); walls.rotation.y = rotY;
          walls.castShadow = true; walls.receiveShadow = true; scene.add(walls);

          // Crisp edge lines
          const edgesG = new THREE.EdgesGeometry(wallGeom, 30);
          const edgeL = new THREE.LineSegments(edgesG, new THREE.LineBasicMaterial({ color: 0xaaaaaa, opacity: 0.3, transparent: true }));
          edgeL.position.copy(walls.position); edgeL.rotation.copy(walls.rotation); scene.add(edgeL);

          // Roof
          const roofType = ub.roofType || 'gable';
          const roofBaseY = groundY + plinthH + totalH;
          const roofColor = roofType === 'flat' ? 0x6b6b6b : 0xc45a2c; // grey flat or terra cotta
          const roofMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.82, metalness: 0.03 });

          if (roofType === 'flat') {
            const flatRoof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.2, d + 0.3), roofMat);
            flatRoof.position.set(localX, roofBaseY + 0.1, localZ); flatRoof.rotation.y = rotY;
            flatRoof.castShadow = true; scene.add(flatRoof);
          } else {
            // Gable or hip roof
            const pitch = ((ub.roofPitch || 35) * Math.PI) / 180;
            const over = ub.roofOverhang || 0.3;
            const halfW = w / 2 + over;
            const halfD = d / 2 + over;
            const roofH = (Math.min(w, d) / 2) * Math.tan(pitch);
            // Ridge line along the longer dimension
            const isLongX = w >= d;
            const ridgePts = isLongX
              ? [new THREE.Vector3(-halfW, roofH, 0), new THREE.Vector3(halfW, roofH, 0)]
              : [new THREE.Vector3(0, roofH, -halfD), new THREE.Vector3(0, roofH, halfD)];
            const p1 = new THREE.Vector3(-halfW, 0, halfD);
            const p2 = new THREE.Vector3(halfW, 0, halfD);
            const p3 = new THREE.Vector3(halfW, 0, -halfD);
            const p4 = new THREE.Vector3(-halfW, 0, -halfD);

            let roofVerts: Float32Array;
            if (isLongX) {
              roofVerts = new Float32Array([
                ...p4.toArray(), ...p1.toArray(), ...ridgePts[0].toArray(),
                ...p1.toArray(), ...ridgePts[1].toArray(), ...ridgePts[0].toArray(),
                ...p2.toArray(), ...p3.toArray(), ...ridgePts[1].toArray(),
                ...p3.toArray(), ...ridgePts[0].toArray(), ...ridgePts[1].toArray(),
                ...p1.toArray(), ...p2.toArray(), ...ridgePts[1].toArray(),
                ...p3.toArray(), ...p4.toArray(), ...ridgePts[0].toArray(),
              ]);
            } else {
              roofVerts = new Float32Array([
                ...p1.toArray(), ...p2.toArray(), ...ridgePts[0].toArray(),
                ...p2.toArray(), ...ridgePts[1].toArray(), ...ridgePts[0].toArray(),
                ...p3.toArray(), ...p4.toArray(), ...ridgePts[1].toArray(),
                ...p4.toArray(), ...ridgePts[0].toArray(), ...ridgePts[1].toArray(),
                ...p4.toArray(), ...p1.toArray(), ...ridgePts[0].toArray(),
                ...p2.toArray(), ...p3.toArray(), ...ridgePts[1].toArray(),
              ]);
            }
            const roofGeom = new THREE.BufferGeometry();
            roofGeom.setAttribute('position', new THREE.BufferAttribute(roofVerts, 3));
            roofGeom.computeVertexNormals();
            const roof = new THREE.Mesh(roofGeom, roofMat);
            roof.position.set(localX, roofBaseY, localZ); roof.rotation.y = rotY;
            roof.castShadow = true; scene.add(roof);
          }
        } catch { /* skip bad building */ }
      }
      console.log(`[terrain3d] Rendered ${userBuildings.length} user buildings from 2D canvas`);
    }

    setStatus("");

    // ═══════════════════════════════════════════════════════════════════════
    // ── ANIMATION ──
    // ═══════════════════════════════════════════════════════════════════════

    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    sceneRef.current = { renderer, controls, animId, terrainMesh, skirtMesh, bottomCap };
    setIsReady(true);
    setStatus("");
  }, [processedSiteData, parcelGeoJSON, width, height, userBuildings, canvasWidth, canvasHeight, pixelsPerMeter]);

  useEffect(() => {
    buildScene();
    return () => {
      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animId);
        sceneRef.current.renderer.dispose();
        sceneRef.current.controls.dispose();
      }
    };
  }, [buildScene]);

  useEffect(() => {
    const onResize = () => {
      if (!sceneRef.current || !containerRef.current) return;
      const nw = width || containerRef.current.clientWidth;
      const nh = height || containerRef.current.clientHeight;
      sceneRef.current.renderer.setSize(nw, nh);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [width, height]);

  // ── Dynamic Z-Exaggeration: update terrain vertices when slider changes ──
  useEffect(() => {
    const td = terrainDataRef.current;
    const sr = sceneRef.current;
    if (!td || !sr?.terrainMesh) return;

    const { baseExag, minE, sceneElev, pos, gridN, cX, cZ, slabH } = td;
    const userExag = baseExag * zScale;

    // Recompute normPts with new exaggeration
    const hasElev = sceneElev.length >= 3 && td.eRange > 0.01;
    const newNormPts = hasElev
      ? sceneElev.map((p) => ({ x: p.x, z: p.z, y: (p.y - minE) * userExag }))
      : [];

    // Update terrain mesh vertices
    if (newNormPts.length >= 3) {
      for (let i = 0; i < pos.count; i++) {
        const gx = pos.getX(i) + cX;
        const gz = pos.getZ(i) + cZ;
        pos.setY(i, idwInterpolate(gx, gz, newNormPts, 3));
      }
      // Re-smooth
      const smoothed = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) smoothed[i] = pos.getY(i);
      for (let pass = 0; pass < 3; pass++) {
        for (let row = 1; row < gridN - 1; row++) {
          for (let col = 1; col < gridN - 1; col++) {
            const idx = row * gridN + col;
            const c = smoothed[idx] * 4;
            const n = (smoothed[idx - gridN] + smoothed[idx + gridN] + smoothed[idx - 1] + smoothed[idx + 1]) * 2;
            const d = smoothed[idx - gridN - 1] + smoothed[idx - gridN + 1] + smoothed[idx + gridN - 1] + smoothed[idx + gridN + 1];
            smoothed[idx] = (c + n + d) / 16;
          }
        }
      }
      for (let i = 0; i < pos.count; i++) pos.setY(i, smoothed[i]);
    }

    pos.needsUpdate = true;
    sr.terrainMesh.geometry.computeVertexNormals();

    // Update skirt vertices to match new edge heights
    if (sr.skirtMesh) {
      const eN = gridN;
      const bottomY = -slabH;
      const skirtPos = sr.skirtMesh.geometry.attributes.position as THREE.BufferAttribute;
      // Rebuild skirt from scratch with same edge logic
      const skirtVertices: number[] = [];
      const addSQ = (i1: number, i2: number, flip: boolean) => {
        const x1 = pos.getX(i1) + cX, z1 = pos.getZ(i1) + cZ, y1 = pos.getY(i1);
        const x2 = pos.getX(i2) + cX, z2 = pos.getZ(i2) + cZ, y2 = pos.getY(i2);
        if (flip) {
          skirtVertices.push(x2, y2, z2, x1, y1, z1, x1, bottomY, z1, x2, bottomY, z2);
        } else {
          skirtVertices.push(x1, y1, z1, x2, y2, z2, x2, bottomY, z2, x1, bottomY, z1);
        }
      };
      const GR = gridN - 1;
      for (let i = 0; i < GR; i++) addSQ(i, i + 1, false);
      for (let i = 0; i < GR; i++) addSQ(GR * eN + i, GR * eN + i + 1, true);
      for (let j = 0; j < GR; j++) addSQ(j * eN, (j + 1) * eN, true);
      for (let j = 0; j < GR; j++) addSQ(j * eN + GR, (j + 1) * eN + GR, false);

      const newSkirtArr = new Float32Array(skirtVertices);
      if (skirtPos.count * 3 === newSkirtArr.length) {
        skirtPos.set(newSkirtArr);
        skirtPos.needsUpdate = true;
        sr.skirtMesh.geometry.computeVertexNormals();
      }
    }
  }, [zScale]);

  return (
    <div className="relative w-full h-full" style={{ minHeight: 300, background: "#c8ddf0" }}>
      <div ref={containerRef} className="w-full h-full" />

      {/* ── Height Exaggeration UI Panel ── */}
      {isReady && (
        <div
          className="absolute left-4 top-4 z-20 flex flex-col gap-3 p-4 rounded-xl"
          style={{
            background: "rgba(15, 23, 42, 0.90)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            width: 220,
            color: "#e2e8f0",
          }}
        >
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#94a3b8" }}>Terrain Controls</div>
          {/* Height Exaggeration Slider */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "#cbd5e1" }}>🏔️ Height Exaggeration</span>
              <span className="text-xs font-mono font-bold" style={{ color: "#38bdf8" }}>{zScale.toFixed(1)}×</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="5"
              step="0.1"
              value={zScale}
              onChange={(e) => setZScale(parseFloat(e.target.value))}
              className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #0ea5e9 0%, #0ea5e9 ${((zScale - 0.5) / 4.5) * 100}%, #334155 ${((zScale - 0.5) / 4.5) * 100}%, #334155 100%)`,
              }}
            />
          </div>
          {/* Reset View Button */}
          <button
            onClick={() => {
              if (sceneRef.current?.controls) {
                sceneRef.current.controls.reset();
              }
            }}
            className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
            style={{
              background: "rgba(51, 65, 85, 0.8)",
              color: "#94a3b8",
              border: "1px solid rgba(148, 163, 184, 0.15)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(71, 85, 105, 0.9)"; e.currentTarget.style.color = "#e2e8f0"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(51, 65, 85, 0.8)"; e.currentTarget.style.color = "#94a3b8"; }}
          >
            🔄 Reset View
          </button>
        </div>
      )}

      {/* ── Loading Overlay ── */}
      {(!isReady || status) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 px-6 py-4 bg-white/95 rounded-xl shadow-lg border border-slate-200">
            {!isReady && (
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            )}
            <span className="text-sm text-slate-600 font-medium max-w-xs text-center">
              {status || "Building 3D terrain..."}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
