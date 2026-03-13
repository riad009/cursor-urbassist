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

// ─── Constants ──────────────────────────────────────────────────────────────

const METERS_PER_DEG = 111320;
const DEG_TO_RAD = Math.PI / 180;
const GRID_RES = 128; // 128×128 terrain mesh — smooth diorama quality
const SAT_PAD = 0.5;  // Satellite bbox padding factor
const CONTOUR_INTERVAL = 2; // metres between contour lines
const TREE_COUNT = 400; // max instanced trees
const TREE_SKIP_RADIUS = 3; // metres clearance inside boundary for trees

interface Terrain3DViewerProps {
  processedSiteData: ProcessedSiteData | null;
  parcelGeoJSON?: any;
  width?: number;
  height?: number;
}

// ─── Elevation fetcher (via our proxy to avoid CORS) ────────────────────────

async function fetchElevationsBatch(
  coords: [number, number][],
  onProgress?: (msg: string) => void
): Promise<number[]> {
  if (coords.length === 0) return [];

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

// ─── Satellite Texture Loader ───────────────────────────────────────────────

async function loadSatelliteTexture(
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

export default function Terrain3DViewer({ processedSiteData, parcelGeoJSON, width, height }: Terrain3DViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    animId: number;
  } | null>(null);
  const [status, setStatus] = useState("Initializing...");
  const [isReady, setIsReady] = useState(false);

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
    const targetH = tSpan * 0.25;
    const exag = hasElev ? targetH / eRange : 1;

    // Normalize elevation to [0, targetH]
    const normPts = hasElev
      ? sceneElev.map((p) => ({ x: p.x, z: p.z, y: (p.y - minE) * exag }))
      : [];

    setStatus("Building 3D terrain mesh...");

    // ═══════════════════════════════════════════════════════════════════════
    // ── STEP 3: THREE.JS SCENE ──
    // ═══════════════════════════════════════════════════════════════════════

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f0);  // Warm off-white — museum gallery

    const far = Math.max(500, tSpan * 12);
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
    renderer.toneMappingExposure = 1.3;

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
    const sun = new THREE.DirectionalLight(0xfff8e8, 2.0);  // Warm sunlight
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
    scene.add(new THREE.DirectionalLight(0xc8d8e8, 0.4));  // Cool fill
    scene.add(new THREE.HemisphereLight(0x87ceeb, 0x5a7b4e, 0.45));
    scene.add(new THREE.AmbientLight(0xf0f0f0, 0.25));

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

    // Vertex colors (natural gradient fallback — used until satellite loads)
    const colors = new Float32Array(pos.count * 3);
    let yMin = Infinity, yMax = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      yMin = Math.min(yMin, pos.getY(i));
      yMax = Math.max(yMax, pos.getY(i));
    }
    const yR = yMax - yMin || 1;

    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) - yMin) / yR;
      let r: number, g: number, b: number;
      if (t < 0.3) {
        r = 0.22 + t; g = 0.48 + t * 0.5; b = 0.15 + t * 0.3;
      } else if (t < 0.6) {
        const s = (t - 0.3) / 0.3;
        r = 0.52 + s * 0.2; g = 0.63 + s * 0.04; b = 0.24 + s * 0.1;
      } else {
        const s = (t - 0.6) / 0.4;
        r = 0.72 + s * 0.12; g = 0.67 - s * 0.08; b = 0.34 + s * 0.12;
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
      roughness: 0.75,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });

    const terrainMesh = new THREE.Mesh(terrainGeom, terrainMat);
    terrainMesh.position.set(cX, 0, cZ);
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = true;
    scene.add(terrainMesh);

    // ═══════════════════════════════════════════════════════════════════════
    // ── THICK BASE SLAB + SKIRT ──
    // ═══════════════════════════════════════════════════════════════════════

    const slabH = Math.max(0.8, targetH * 0.15);
    const skirtMat = new THREE.MeshStandardMaterial({
      color: 0x5c4033,     // Medium walnut brown — visible maquette edge
      roughness: 0.80,
      metalness: 0.08,
    });
    const eN = GRID_RES + 1;

    const addSkirt = (i1: number, i2: number, flip: boolean) => {
      const x1 = pos.getX(i1) + cX, z1 = pos.getZ(i1) + cZ, y1 = pos.getY(i1);
      const x2 = pos.getX(i2) + cX, z2 = pos.getZ(i2) + cZ, y2 = pos.getY(i2);
      const v = flip
        ? new Float32Array([x2, y2, z2, x1, y1, z1, x1, -slabH, z1, x2, -slabH, z2])
        : new Float32Array([x1, y1, z1, x2, y2, z2, x2, -slabH, z2, x1, -slabH, z1]);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(v, 3));
      g.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
      g.computeVertexNormals();
      scene.add(new THREE.Mesh(g, skirtMat));
    };

    for (let i = 0; i < GRID_RES; i++) {
      addSkirt(i, i + 1, false);
      addSkirt(GRID_RES * eN + i, GRID_RES * eN + i + 1, true);
    }
    for (let j = 0; j < GRID_RES; j++) {
      addSkirt(j * eN, (j + 1) * eN, true);
      addSkirt(j * eN + GRID_RES, (j + 1) * eN + GRID_RES, false);
    }

    // Bottom plate
    scene.add((() => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(tW + 0.3, slabH * 0.2, tD + 0.3),
        new THREE.MeshStandardMaterial({ color: 0x4a3628, roughness: 0.85, metalness: 0.08 })
      );
      m.position.set(cX, -slabH - slabH * 0.2, cZ);
      m.receiveShadow = true;
      return m;
    })());

    // ═══════════════════════════════════════════════════════════════════════
    // ── BOUNDARY + PARCEL LINES ON TERRAIN ──
    // ═══════════════════════════════════════════════════════════════════════

    const sampleY = (sx: number, sz: number) =>
      normPts.length >= 3 ? idwInterpolate(sx, sz, normPts, 2) + 0.4 : 0.4;

    // Main boundary
    const bPts = bCoords.map((c) => {
      const sx = (c[0] - refPoint.lng) * METERS_PER_DEG * cosLat;
      const sz = -(c[1] - refPoint.lat) * METERS_PER_DEG;
      return new THREE.Vector3(sx, sampleY(sx, sz), sz);
    });
    scene.add(new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(bPts),
      new THREE.LineBasicMaterial({ color: 0xff2222, linewidth: 3 })
    ));

    // Corner posts
    bPts.forEach((pt, i) => {
      if (i >= bCoords.length - 1) return;
      const pH = Math.max(0.8, targetH * 0.10);
      const pMat = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.4, metalness: 0.15 });
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, pH, 6), pMat);
      post.position.set(pt.x, pt.y + pH / 2, pt.z);
      post.castShadow = true;
      scene.add(post);
    });

    // Parcel boundaries
    if (processedSiteData?.parcels && processedSiteData.parcels.length > 1) {
      const PC = [0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6, 0xec4899];
      processedSiteData.parcels.forEach((parcel, idx) => {
        const coords = parcel.coordinates;
        if (!coords || coords.length === 0 || coords[0].length < 3) return;
        const ring = coords[0];
        const pts = ring.map((c) => {
          const sx = (c[0] - refPoint.lng) * METERS_PER_DEG * cosLat;
          const sz = -(c[1] - refPoint.lat) * METERS_PER_DEG;
          return new THREE.Vector3(sx, sampleY(sx, sz), sz);
        });
        scene.add(new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: PC[idx % PC.length] })
        ));
      });
    }

    // Floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(tSpan * 6, tSpan * 6),
      new THREE.MeshStandardMaterial({ color: 0xc8c0b8, roughness: 0.92 })  // Warm concrete floor
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -slabH - slabH * 0.4 - 0.01;
    floor.receiveShadow = true;
    scene.add(floor);

    // ═══════════════════════════════════════════════════════════════════════
    // ── SATELLITE ORTHOPHOTO DRAPING ──
    // ═══════════════════════════════════════════════════════════════════════

    setStatus("Loading satellite imagery from IGN...");

    // Load satellite in background — scene renders immediately with vertex colors
    loadSatelliteTexture(bbox, SAT_PAD, renderer).then((result) => {
      if (!result) {
        console.warn("[terrain3d] Satellite texture unavailable, keeping vertex colors");
        setStatus("");
        return;
      }

      const { texture, gridBounds } = result;

      // ── Compute UV remapping for geo-accurate satellite placement ──
      const satUvs = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        // World-space position of this vertex
        const wx = pos.getX(i) + cX;
        const wz = pos.getZ(i) + cZ;
        // Convert back to lng/lat
        const vLng = refPoint.lng + wx / (METERS_PER_DEG * cosLat);
        const vLat = refPoint.lat - wz / METERS_PER_DEG;
        // Map to satellite grid bounds
        const u = (vLng - gridBounds.minLng) / (gridBounds.maxLng - gridBounds.minLng);
        const v = (vLat - gridBounds.minLat) / (gridBounds.maxLat - gridBounds.minLat);
        satUvs[i * 2] = Math.max(0, Math.min(1, u));
        satUvs[i * 2 + 1] = Math.max(0, Math.min(1, v));
      }
      terrainGeom.setAttribute("uv", new THREE.BufferAttribute(satUvs, 2));
      terrainGeom.attributes.uv.needsUpdate = true;

      // Apply satellite texture to terrain material
      terrainMat.map = texture;
      terrainMat.vertexColors = false;
      terrainMat.needsUpdate = true;

      console.log("[terrain3d] Satellite texture applied successfully");

      // ═══════════════════════════════════════════════════════════════════
      // ── PROCEDURAL VEGETATION (instanced trees) ──
      // ═══════════════════════════════════════════════════════════════════

      setStatus("Planting trees & vegetation...");

      try {
        // Read satellite pixels to find green zones
        const satCanvas = (texture.image as HTMLCanvasElement);
        const satCtx = satCanvas.getContext("2d");
        if (satCtx) {
          const imgData = satCtx.getImageData(0, 0, satCanvas.width, satCanvas.height);
          const treePts: Array<{ x: number; y: number; z: number; greenness: number }> = [];

          // Sample terrain grid vertices for greenness — every vertex for high density
          for (let i = 0; i < pos.count && treePts.length < TREE_COUNT * 4; i += 1) {
            const u = satUvs[i * 2];
            const v = satUvs[i * 2 + 1];
            if (u < 0.01 || u > 0.99 || v < 0.01 || v > 0.99) continue; // skip edges
            const px = Math.floor(u * (satCanvas.width - 1));
            const py = Math.floor((1 - v) * (satCanvas.height - 1));
            const idx = (py * satCanvas.width + px) * 4;
            const rr = imgData.data[idx], gg = imgData.data[idx + 1], bb = imgData.data[idx + 2];

            // Detect green vegetation: green dominates, or dark green (forests)
            const greenness = gg - Math.max(rr, bb);
            const isDarkGreen = gg > 40 && rr < 100 && bb < 100 && gg > rr;
            const isBlue = bb > rr + 30 && bb > gg;
            const isGrey = Math.abs(rr - gg) < 15 && Math.abs(gg - bb) < 15 && rr > 120; // roads/buildings
            if ((greenness > 5 || isDarkGreen) && !isBlue && !isGrey && gg > 35) {
              const wx = pos.getX(i) + cX;
              const wy = pos.getY(i);
              const wz = pos.getZ(i) + cZ;

              // Skip if inside property boundary (keep build site clear)
              let insideBoundary = false;
              const vLng = refPoint.lng + wx / (METERS_PER_DEG * cosLat);
              const vLat = refPoint.lat - wz / METERS_PER_DEG;
              // Simple point-in-polygon check for boundary
              let inside = false;
              for (let bi = 0, bj = bCoords.length - 1; bi < bCoords.length; bj = bi++) {
                const xi = bCoords[bi][0], yi = bCoords[bi][1];
                const xj = bCoords[bj][0], yj = bCoords[bj][1];
                if ((yi > vLat) !== (yj > vLat) && vLng < ((xj - xi) * (vLat - yi)) / (yj - yi) + xi) {
                  inside = !inside;
                }
              }
              insideBoundary = inside;

              if (!insideBoundary) {
                treePts.push({ x: wx, y: wy, z: wz, greenness });
              }
            }
          }

          // Limit to TREE_COUNT and place instanced meshes
          const treePositions = treePts.slice(0, TREE_COUNT);
          if (treePositions.length > 0) {
            // Tree trunk (cylinder)
            const trunkGeom = new THREE.CylinderGeometry(0.08, 0.12, 1.2, 5);
            const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d3a1a, roughness: 0.9 });
            const trunkMesh = new THREE.InstancedMesh(trunkGeom, trunkMat, treePositions.length);
            trunkMesh.castShadow = true;

            // Tree canopy (cone)
            const canopyGeom = new THREE.ConeGeometry(0.6, 1.8, 6);
            const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.85 });
            const canopyMesh = new THREE.InstancedMesh(canopyGeom, canopyMat, treePositions.length);
            canopyMesh.castShadow = true;

            // Bush (sphere) for variety
            const bushGeom = new THREE.SphereGeometry(0.4, 6, 5);
            const bushMat = new THREE.MeshStandardMaterial({ color: 0x3a7d32, roughness: 0.9 });
            const bushCount = Math.floor(treePositions.length * 0.3);
            const bushMesh = new THREE.InstancedMesh(bushGeom, bushMat, bushCount);
            bushMesh.castShadow = true;

            const mat4 = new THREE.Matrix4();
            const colorObj = new THREE.Color();

            for (let ti = 0; ti < treePositions.length; ti++) {
              const tp = treePositions[ti];
              // Randomize height and position slightly
              const hScale = 0.6 + Math.random() * 0.8;
              const xOff = (Math.random() - 0.5) * 1.5;
              const zOff = (Math.random() - 0.5) * 1.5;

              // Trunk
              mat4.makeTranslation(tp.x + xOff, tp.y + 0.6 * hScale, tp.z + zOff);
              mat4.scale(new THREE.Vector3(hScale, hScale, hScale));
              trunkMesh.setMatrixAt(ti, mat4);

              // Canopy
              mat4.makeTranslation(tp.x + xOff, tp.y + 1.8 * hScale, tp.z + zOff);
              mat4.scale(new THREE.Vector3(hScale, hScale, hScale));
              canopyMesh.setMatrixAt(ti, mat4);

              // Vary canopy color
              const gVar = 0.15 + Math.random() * 0.25;
              colorObj.setRGB(0.1 + Math.random() * 0.1, 0.25 + gVar, 0.08 + Math.random() * 0.08);
              canopyMesh.setColorAt(ti, colorObj);

              // Bush (only for first bushCount)
              if (ti < bushCount) {
                mat4.makeTranslation(
                  tp.x + (Math.random() - 0.5) * 2,
                  tp.y + 0.3,
                  tp.z + (Math.random() - 0.5) * 2
                );
                bushMesh.setMatrixAt(ti, mat4);
                colorObj.setRGB(0.15 + Math.random() * 0.1, 0.35 + Math.random() * 0.2, 0.1);
                bushMesh.setColorAt(ti, colorObj);
              }
            }

            trunkMesh.instanceMatrix.needsUpdate = true;
            canopyMesh.instanceMatrix.needsUpdate = true;
            if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true;
            bushMesh.instanceMatrix.needsUpdate = true;
            if (bushMesh.instanceColor) bushMesh.instanceColor.needsUpdate = true;

            scene.add(trunkMesh);
            scene.add(canopyMesh);
            scene.add(bushMesh);
            console.log(`[terrain3d] Placed ${treePositions.length} trees + ${bushCount} bushes`);
          }

          // ═══════════════════════════════════════════════════════════════
          // ── WATER DETECTION + RENDERING ──
          // ═══════════════════════════════════════════════════════════════

          // Detect blue-dominant areas in satellite image → water
          let waterVertices = 0;
          const waterYPositions: number[] = [];
          for (let i = 0; i < pos.count; i += 2) {
            const u = satUvs[i * 2];
            const v = satUvs[i * 2 + 1];
            const px = Math.floor(u * (satCanvas.width - 1));
            const py = Math.floor((1 - v) * (satCanvas.height - 1));
            const idx = (py * satCanvas.width + px) * 4;
            const rr = imgData.data[idx], gg = imgData.data[idx + 1], bb = imgData.data[idx + 2];
            if (bb > rr + 25 && bb > gg + 10 && bb > 100) {
              waterVertices++;
              waterYPositions.push(pos.getY(i));
            }
          }

          if (waterVertices > 5) {
            const waterLevel = Math.min(...waterYPositions) + 0.1;
            const waterGeom = new THREE.PlaneGeometry(tW * 1.2, tD * 1.2, 32, 32);
            waterGeom.rotateX(-Math.PI / 2);
            const waterMat = new THREE.MeshPhysicalMaterial({
              color: 0x1a6fa8,
              transparent: true,
              opacity: 0.7,
              roughness: 0.1,
              metalness: 0.3,
              transmission: 0.3,
              side: THREE.DoubleSide,
            });
            const waterMesh = new THREE.Mesh(waterGeom, waterMat);
            waterMesh.position.set(cX, waterLevel, cZ);
            waterMesh.receiveShadow = true;
            scene.add(waterMesh);
            console.log(`[terrain3d] Water plane at Y=${waterLevel.toFixed(1)}, ${waterVertices} blue vertices`);
          }
        }
      } catch (vegErr) {
        console.warn("[terrain3d] Vegetation/water generation error:", vegErr);
      }

      // ═══════════════════════════════════════════════════════════════════
      // ── CONTOUR LINES ──
      // ═══════════════════════════════════════════════════════════════════

      try {
        if (hasElev && eRange > CONTOUR_INTERVAL) {
          const contourMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15 });
          const contourGridN = GRID_RES + 1;

          for (let elev = Math.ceil(minE / CONTOUR_INTERVAL) * CONTOUR_INTERVAL; elev <= maxE; elev += CONTOUR_INTERVAL) {
            const normElev = (elev - minE) * exag;
            const contourPts: THREE.Vector3[] = [];

            // Scan rows for contour crossings using marching approach
            for (let row = 0; row < GRID_RES; row++) {
              for (let col = 0; col < GRID_RES; col++) {
                const i00 = row * contourGridN + col;
                const i10 = row * contourGridN + col + 1;
                const y00 = pos.getY(i00);
                const y10 = pos.getY(i10);

                // Check if contour crosses this edge (horizontal)
                if ((y00 - normElev) * (y10 - normElev) < 0) {
                  const t = (normElev - y00) / (y10 - y00);
                  const cx = pos.getX(i00) + t * (pos.getX(i10) - pos.getX(i00)) + cX;
                  const cz = pos.getZ(i00) + t * (pos.getZ(i10) - pos.getZ(i00)) + cZ;
                  contourPts.push(new THREE.Vector3(cx, normElev + 0.15, cz));
                }
              }
            }

            if (contourPts.length > 2) {
              // Sort points by angle from centroid for cleaner lines
              const centX = contourPts.reduce((s, p) => s + p.x, 0) / contourPts.length;
              const centZ = contourPts.reduce((s, p) => s + p.z, 0) / contourPts.length;
              contourPts.sort((a, b) => Math.atan2(a.z - centZ, a.x - centX) - Math.atan2(b.z - centZ, b.x - centX));

              const lineGeom = new THREE.BufferGeometry().setFromPoints(contourPts);
              const isMajor = elev % (CONTOUR_INTERVAL * 5) === 0;
              const mat = isMajor
                ? new THREE.LineBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.3 })
                : contourMat;
              scene.add(new THREE.LineLoop(lineGeom, mat));
            }
          }
          console.log("[terrain3d] Contour lines added");
        }
      } catch (contourErr) {
        console.warn("[terrain3d] Contour generation error:", contourErr);
      }

      setStatus("");
    }).catch((err) => {
      console.warn("[terrain3d] Satellite loading failed:", err);
      setStatus("");
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ── ZONE OVERLAY LINES (parcel colors like reference) ──
    // ═══════════════════════════════════════════════════════════════════════

    // Render ALL parcels with distinct, vibrant survey colors (matching reference diorama)
    const ZONE_COLORS = [0xe74c3c, 0x2ecc71, 0x3498db, 0xf1c40f, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xf39c12];
    if (processedSiteData?.parcels) {
      processedSiteData.parcels.forEach((parcel, idx) => {
        const coords = parcel.coordinates;
        if (!coords || coords.length === 0 || coords[0].length < 3) return;
        const ring = coords[0];
        const zoneColor = ZONE_COLORS[idx % ZONE_COLORS.length];

        // Create thicker, dashed zone lines
        const zonePts: THREE.Vector3[] = [];
        // Subdivide edges for smooth terrain following
        for (let ei = 0; ei < ring.length; ei++) {
          const c = ring[ei];
          const sx = (c[0] - refPoint.lng) * METERS_PER_DEG * cosLat;
          const sz = -(c[1] - refPoint.lat) * METERS_PER_DEG;
          zonePts.push(new THREE.Vector3(sx, sampleY(sx, sz) + 0.2, sz));
        }

        // Outer glow line (thicker, semi-transparent)
        const glowMat = new THREE.LineBasicMaterial({
          color: zoneColor,
          transparent: true,
          opacity: 0.5,
          linewidth: 2,
        });
        scene.add(new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(zonePts),
          glowMat
        ));

        // Inner solid line
        const solidMat = new THREE.LineBasicMaterial({ color: zoneColor, linewidth: 1 });
        const innerPts = zonePts.map(p => new THREE.Vector3(p.x, p.y + 0.1, p.z));
        scene.add(new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(innerPts),
          solidMat
        ));
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ── 3D BUILDING EXTRUSIONS FROM IGN BDTOPO ──
    // ═══════════════════════════════════════════════════════════════════════

    // Fetch building footprints from BDTOPO and extrude them as 3D blocks
    if (boundary?.geometry) {
      setStatus("Loading 3D buildings from IGN BDTOPO...");
      fetch("/api/existing-buildings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parcelGeometry: boundary.geometry }),
      }).then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        const feats = data?.buildings?.features;
        if (!Array.isArray(feats) || feats.length === 0) {
          console.log("[terrain3d] No buildings found nearby");
          setStatus("");
          return;
        }

        const wallMat = new THREE.MeshStandardMaterial({
          color: 0xd4c5b2, roughness: 0.65, metalness: 0.08,
        });
        const roofMat = new THREE.MeshStandardMaterial({
          color: 0xa0522d, roughness: 0.55, metalness: 0.12,
        });
        const edgeMat = new THREE.LineBasicMaterial({ color: 0x555555 });

        let count = 0;
        for (const feat of feats) {
          try {
            const geom = feat.geometry;
            if (!geom || (geom.type !== "Polygon" && geom.type !== "MultiPolygon")) continue;

            const rawH = feat.properties?.height ?? 7;
            const bHeight = Math.max(2.5, rawH) * exag * 0.08;
            const polyRings = geom.type === "Polygon"
              ? [geom.coordinates[0]]
              : geom.coordinates.map((p: number[][][]) => p[0]);

            for (const ring of polyRings) {
              if (!ring || ring.length < 3) continue;

              const pts2d = ring.map((c: number[]) => {
                const sx = (c[0] - refPoint.lng) * METERS_PER_DEG * cosLat;
                const sz = -(c[1] - refPoint.lat) * METERS_PER_DEG;
                return new THREE.Vector2(sx, sz);
              });

              const shape = new THREE.Shape(pts2d);
              const extGeom = new THREE.ExtrudeGeometry(shape, {
                depth: bHeight,
                bevelEnabled: false,
              });
              extGeom.rotateX(-Math.PI / 2);

              // Ground elevation at building centroid
              const cx2 = ring.reduce((a: number, c: number[]) => a + c[0], 0) / ring.length;
              const cy2 = ring.reduce((a: number, c: number[]) => a + c[1], 0) / ring.length;
              const bsx2 = (cx2 - refPoint.lng) * METERS_PER_DEG * cosLat;
              const bsz2 = -(cy2 - refPoint.lat) * METERS_PER_DEG;
              const groundY = sampleY(bsx2, bsz2) - 0.3;

              const mesh = new THREE.Mesh(extGeom, wallMat);
              mesh.position.set(0, groundY, 0);
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              scene.add(mesh);

              // Add edges for crisp building outlines
              const edges = new THREE.EdgesGeometry(extGeom);
              const line = new THREE.LineSegments(edges, edgeMat);
              line.position.set(0, groundY, 0);
              scene.add(line);

              count++;
            }
          } catch { /* skip bad building */ }
        }
        console.log(`[terrain3d] Extruded ${count} 3D buildings from BDTOPO`);
        setStatus("");
      }).catch((err) => {
        console.warn("[terrain3d] Building fetch error:", err);
        setStatus("");
      });
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

    sceneRef.current = { renderer, controls, animId };
    setIsReady(true);
    setStatus("");
  }, [processedSiteData, parcelGeoJSON, width, height]);

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

  return (
    <div className="relative w-full h-full" style={{ minHeight: 300, background: "#f0f0f0" }}>
      <div ref={containerRef} className="w-full h-full" />
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
