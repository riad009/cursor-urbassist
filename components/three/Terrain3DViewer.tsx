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
import { attachSculptHandlers, createSculptCursorMeshes, applyStoredDeltas, getVertexElevation } from "@/components/editor3d/AltimetrySculptor";
import { useSculptStore } from "@/store/useSculptStore";
import dynamic from "next/dynamic";

// AltimetryUI moved to the right sidebar panel in page.tsx

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
  /** Terrain vertical exaggeration — controlled from parent right panel */
  zScale?: number;
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

// ═════════════════════════════════════════════════════════════════════════════
// ── PREMIUM PROCEDURAL ASSET FACTORY ──
// Each builder returns a THREE.Group positioned at world origin ready for
// placement. All meshes use castShadow + receiveShadow for quality rendering.
// ═════════════════════════════════════════════════════════════════════════════

function _box(g:THREE.Group,w:number,h:number,d:number,color:number,opts?:Partial<THREE.MeshStandardMaterialParameters>):THREE.Mesh{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:0.75,metalness:0.02,...opts}));m.castShadow=true;m.receiveShadow=true;g.add(m);return m;}
function _cyl(g:THREE.Group,rt:number,rb:number,h:number,segs:number,color:number,opts?:Partial<THREE.MeshStandardMaterialParameters>):THREE.Mesh{const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,segs),new THREE.MeshStandardMaterial({color,roughness:0.7,metalness:0.05,...opts}));m.castShadow=true;g.add(m);return m;}

function _addWindows(g:THREE.Group,count:number,wallW:number,centerX:number,centerY:number,wallZ:number):void{
  const ww=Math.min(0.65,wallW/count*0.5),wh=0.6,sp=wallW/count;
  for(let i=0;i<count;i++){
    const wx=centerX-wallW/2+sp*(i+0.5);
    const fr=new THREE.Mesh(new THREE.BoxGeometry(ww+0.08,wh+0.08,0.05),new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.5}));
    fr.position.set(wx,centerY,wallZ+0.005);g.add(fr);
    const gl=new THREE.Mesh(new THREE.BoxGeometry(ww,wh,0.04),new THREE.MeshStandardMaterial({color:0x90caf9,roughness:0.04,metalness:0.2,transparent:true,opacity:0.8}));
    gl.position.set(wx,centerY,wallZ+0.03);g.add(gl);
  }
}

function _buildGableRoof(g:THREE.Group,w:number,d:number,pitchDeg:number,overhang:number,color:number):THREE.Mesh{
  const pitch=(pitchDeg*Math.PI)/180,hw=w/2+overhang,hd=d/2+overhang,roofH=(Math.min(w,d)/2)*Math.tan(pitch),isX=w>=d;
  const rPts=isX?[new THREE.Vector3(-hw,roofH,0),new THREE.Vector3(hw,roofH,0)]:[new THREE.Vector3(0,roofH,-hd),new THREE.Vector3(0,roofH,hd)];
  const [p1,p2,p3,p4]=[new THREE.Vector3(-hw,0,hd),new THREE.Vector3(hw,0,hd),new THREE.Vector3(hw,0,-hd),new THREE.Vector3(-hw,0,-hd)];
  const v=isX?new Float32Array([...p4.toArray(),...p1.toArray(),...rPts[0].toArray(),...p1.toArray(),...rPts[1].toArray(),...rPts[0].toArray(),...p2.toArray(),...p3.toArray(),...rPts[1].toArray(),...p3.toArray(),...rPts[0].toArray(),...rPts[1].toArray(),...p1.toArray(),...p2.toArray(),...rPts[1].toArray(),...p3.toArray(),...p4.toArray(),...rPts[0].toArray()])
    :new Float32Array([...p1.toArray(),...p2.toArray(),...rPts[0].toArray(),...p2.toArray(),...rPts[1].toArray(),...rPts[0].toArray(),...p3.toArray(),...p4.toArray(),...rPts[1].toArray(),...p4.toArray(),...rPts[0].toArray(),...rPts[1].toArray(),...p4.toArray(),...p1.toArray(),...rPts[0].toArray(),...p2.toArray(),...p3.toArray(),...rPts[1].toArray()]);
  const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.BufferAttribute(v,3));geom.computeVertexNormals();
  const m=new THREE.Mesh(geom,new THREE.MeshStandardMaterial({color,roughness:0.70,metalness:0.04}));m.castShadow=true;m.receiveShadow=true;g.add(m);return m;
}

function _buildTree(g:THREE.Group,x:number,y:number,z:number){
  const trunk=_cyl(g,0.08,0.10,0.8,8,0x5d4037,{roughness:0.9});trunk.position.set(x,y+0.4,z);
  const crown=new THREE.Mesh(new THREE.SphereGeometry(0.48,10,8),new THREE.MeshStandardMaterial({color:0x2e7d32,roughness:0.85}));
  crown.position.set(x,y+0.8+0.38,z);crown.castShadow=true;g.add(crown);
}

function _buildLampPost(g:THREE.Group,x:number,y:number,z:number){
  const pole=_cyl(g,0.035,0.045,3.2,8,0x424242,{roughness:0.35,metalness:0.55});pole.position.set(x,y+1.6,z);
  const arm=new THREE.Mesh(new THREE.BoxGeometry(0.55,0.04,0.04),new THREE.MeshStandardMaterial({color:0x424242,roughness:0.35,metalness:0.55}));
  arm.position.set(x+0.275,y+3.14,z);g.add(arm);
  const lamp=new THREE.Mesh(new THREE.SphereGeometry(0.13,8,6),new THREE.MeshStandardMaterial({color:0xfff9c4,roughness:0.1,emissive:0xfff176,emissiveIntensity:0.7}));
  lamp.position.set(x+0.55,y+3.05,z);g.add(lamp);
}

// ── HOUSE / GARAGE ────────────────────────────────────────────────────────────
interface UBLike{width?:number;depth?:number;roofType?:string;roofPitch?:number;roofOverhang?:number;wallHeights?:{ground?:number;first?:number;second?:number};type?:string;name?:string}

function buildPremiumHouse(ub:UBLike,gY:number,lx:number,lz:number,ry:number):THREE.Group{
  const g=new THREE.Group();g.position.set(lx,gY,lz);g.rotation.y=ry;
  const w=ub.width||10,d=ub.depth||8;
  const isGarage=(ub.type||ub.name||'').toLowerCase().includes('garage');
  const totalH=((ub.wallHeights?.ground||0)+(ub.wallHeights?.first||0)+(ub.wallHeights?.second||0))||(isGarage?3.0:3.8);
  const pH=0.18;

  // Plinth
  const plinth=_box(g,w+0.12,pH,d+0.12,0x90a4ae,{roughness:0.95});plinth.position.y=pH/2;

  // Main walls
  const wallColor=isGarage?0xf5f5f5:0xfafafa;
  const wallGeom=new THREE.BoxGeometry(w,totalH,d);
  const walls=new THREE.Mesh(wallGeom,new THREE.MeshStandardMaterial({color:wallColor,roughness:0.68,metalness:0.01}));
  walls.position.y=pH+totalH/2;walls.castShadow=true;walls.receiveShadow=true;g.add(walls);
  // Edge outline
  const el=new THREE.LineSegments(new THREE.EdgesGeometry(wallGeom,20),new THREE.LineBasicMaterial({color:0xbdbdbd,opacity:0.4,transparent:true}));
  el.position.y=walls.position.y;g.add(el);

  const baseY=pH;

  if(isGarage){
    // Garage roller door panels
    for(let pi=0;pi<4;pi++){
      const p=_box(g,w*0.74,0.38,0.06,pi%2===0?0xe0e0e0:0xeeeeee,{roughness:0.55});
      p.position.set(0,baseY+0.1+pi*0.40,d/2+0.04);
    }
    // Door frame
    const gdf=_box(g,w*0.74+0.12,1.66,0.04,0x616161,{roughness:0.6});gdf.position.set(0,baseY+0.83,d/2+0.02);
    // Side pedestrian door
    const sd=_box(g,0.75,1.85,0.06,0xef5350,{roughness:0.6});sd.position.set(-w/2+0.5,baseY+0.925,d/2+0.04);
    void sd;
    // Windows high
    _addWindows(g,2,w*0.55,0,baseY+totalH*0.72,d/2+0.01);
    // Red accent stripe
    const stripe=_box(g,w,0.18,d+0.02,0xef5350,{roughness:0.6,metalness:0.05});stripe.position.y=baseY+totalH*0.88;
    void stripe;
  } else {
    // Front door
    const doorFrame=_box(g,0.88,2.05,0.055,0x4e342e,{roughness:0.65});doorFrame.position.set(0,baseY+1.025,d/2+0.01);
    const door=_box(g,0.72,1.9,0.05,0x6d4c41,{roughness:0.7});door.position.set(0,baseY+0.95,d/2+0.035);
    // Door knob
    const knob=new THREE.Mesh(new THREE.SphereGeometry(0.045,6,5),new THREE.MeshStandardMaterial({color:0xf9a825,roughness:0.15,metalness:0.9}));
    knob.position.set(0.26,baseY+0.85,d/2+0.065);g.add(knob);
    // Door step
    const step=_box(g,0.95,0.10,0.28,0x9e9e9e,{roughness:0.9});step.position.set(0,baseY+0.05,d/2+0.16);
    void doorFrame;void door;void step;
    // Ground floor windows (left/right of door)
    const wWing=(w-1.1)/2;
    _addWindows(g,Math.max(1,Math.round(wWing/1.6)),wWing,-wWing/2-0.55,baseY+totalH*0.28+0.1,d/2+0.01);
    _addWindows(g,Math.max(1,Math.round(wWing/1.6)),wWing, wWing/2+0.55,baseY+totalH*0.28+0.1,d/2+0.01);
    // Back windows
    const wnCount=Math.max(1,Math.round((w-0.4)/1.7));
    _addWindows(g,wnCount,w*0.85,0,baseY+totalH*0.28+0.1,-(d/2+0.01));
    // Upper floor
    if(totalH>3.2){
      _addWindows(g,wnCount+1,w*0.9,0,baseY+totalH*0.66,d/2+0.01);
      _addWindows(g,wnCount+1,w*0.9,0,baseY+totalH*0.66,-(d/2+0.01));
    }
    // Chimney
    const chX=w*0.28,chH=0.85;
    const ch=_box(g,0.36,totalH*0.55+chH,0.36,0x8d6e63,{roughness:0.9});ch.position.set(chX,pH+(totalH*0.55+chH)/2,-d*0.22);
    const chCap=_box(g,0.48,0.08,0.48,0x5d4037,{roughness:0.8});chCap.position.set(chX,pH+totalH*0.55+chH+0.04,-d*0.22);
    void ch;void chCap;
  }

  // ROOF
  const rBaseY=pH+totalH;
  const roofType=ub.roofType||'gable';
  const roofColor=isGarage?0x1a1a2e:0xc0392b;
  const pitchDeg=ub.roofPitch||40,ovr=ub.roofOverhang||0.45;

  if(roofType==='flat'){
    const fr=_box(g,w+0.3,0.20,d+0.3,roofColor,{roughness:0.78});fr.position.y=rBaseY+0.10;
    // Parapet
    for(const[px,pz,pw,pd] of [[0,d/2+0.09,w+0.3,0.12],[0,-d/2-0.09,w+0.3,0.12],[w/2+0.09,0,0.12,d],[- w/2-0.09,0,0.12,d]] as [number,number,number,number][]){
      const par=_box(g,pw,0.38,pd,0x546e7a,{roughness:0.88});par.position.set(px,rBaseY+0.38/2,pz);void par;
    }
  } else {
    const roofMesh=_buildGableRoof(g,w,d,pitchDeg,ovr,roofColor);
    roofMesh.position.y=rBaseY;
    // Ridge cap
    const ridgeH=(Math.min(w,d)/2)*Math.tan((pitchDeg*Math.PI)/180);
    const isX=w>=d,ridgeLen=(isX?w:d)+ovr*2;
    const ridgeCap=_box(g,isX?ridgeLen:0.16,0.09,isX?0.16:ridgeLen,0x7f1d1d,{roughness:0.68});
    ridgeCap.position.set(0,rBaseY+ridgeH,0);void ridgeCap;
  }
  return g;
}

// ── POOL ──────────────────────────────────────────────────────────────────────
function buildPremiumPool(ub:UBLike,gY:number,lx:number,lz:number,ry:number):THREE.Group{
  const g=new THREE.Group();g.position.set(lx,gY,lz);g.rotation.y=ry;
  const w=ub.width||8,d=ub.depth||5;
  const dH=0.20;

  // Travertine deck
  const deck=_box(g,w+2.4,dH,d+2.4,0xe8dbc8,{roughness:0.62});deck.position.y=dH/2;

  // Pool basin
  _box(g,w,0.22,d,0x1565c0,{roughness:0.5}).position.y=dH/2+0.11;

  // Water surface
  const water=new THREE.Mesh(new THREE.PlaneGeometry(w-0.06,d-0.06),
    new THREE.MeshPhysicalMaterial({color:0x26c6da,roughness:0.01,metalness:0.1,transparent:true,opacity:0.88,transmission:0.22,clearcoat:1.0,clearcoatRoughness:0.04}));
  water.rotation.x=-Math.PI/2;water.position.y=dH+0.21;g.add(water);

  // White pool edge tiles
  const eM=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.4});
  for(const[ex,ez,ew,ed] of [[0,d/2+0.06,w+0.12,0.12],[0,-d/2-0.06,w+0.12,0.12],[w/2+0.06,0,0.12,d],[-w/2-0.06,0,0.12,d]] as [number,number,number,number][]){
    const e=new THREE.Mesh(new THREE.BoxGeometry(ew,0.055,ed),eM);e.position.set(ex,dH+0.225,ez);g.add(e);
  }

  // Stainless ladder
  const lM=new THREE.MeshStandardMaterial({color:0xe0e0e0,roughness:0.15,metalness:0.88});
  const rail=new THREE.Mesh(new THREE.CylinderGeometry(0.024,0.024,0.9,6),lM);rail.position.set(w/2-0.12,dH+0.5,d/2-0.04);g.add(rail);
  for(let r=0;r<3;r++){const rg=new THREE.Mesh(new THREE.BoxGeometry(0.32,0.04,0.04),lM);rg.position.set(w/2-0.12,dH+0.2+r*0.22,d/2-0.04);g.add(rg);}

  // Lounge chairs × 4
  const chM=new THREE.MeshStandardMaterial({color:0xfff9c4,roughness:0.7});
  for(const[cx,cz] of [[-(w/2+0.9),d/4],[-(w/2+0.9),-d/4],[(w/2+0.9),d/4],[(w/2+0.9),-d/4]] as [number,number][]){
    const seat=new THREE.Mesh(new THREE.BoxGeometry(0.58,0.07,1.52),chM);seat.position.set(cx,dH+0.10,cz);g.add(seat);
    const back=new THREE.Mesh(new THREE.BoxGeometry(0.58,0.5,0.06),chM);back.position.set(cx,dH+0.32,cz+0.7);back.rotation.x=-0.33;g.add(back);
    const lM2=new THREE.MeshStandardMaterial({color:0xbdbdbd,roughness:0.2,metalness:0.7});
    for(const[lsx,lsz] of [[-0.21,-0.62],[-0.21,0.62],[0.21,-0.62],[0.21,0.62]] as [number,number][]){
      const lg=new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,0.10,5),lM2);lg.position.set(cx+lsx,dH+0.05,cz+lsz);g.add(lg);
    }
  }
  // Parasol
  const pp=new THREE.Mesh(new THREE.CylinderGeometry(0.028,0.035,2.0,8),new THREE.MeshStandardMaterial({color:0xbdbdbd,roughness:0.28,metalness:0.72}));
  pp.position.set(-(w/2+0.9),dH+1.0,0);g.add(pp);
  const pr=new THREE.Mesh(new THREE.ConeGeometry(1.05,0.20,12,1,true),new THREE.MeshStandardMaterial({color:0xf44336,roughness:0.62,side:THREE.DoubleSide}));
  pr.position.set(-(w/2+0.9),dH+1.95,0);g.add(pr);
  return g;
}

// ── GARDEN ────────────────────────────────────────────────────────────────────
function buildPremiumGarden(ub:UBLike,gY:number,lx:number,lz:number,ry:number):THREE.Group{
  const g=new THREE.Group();g.position.set(lx,gY,lz);g.rotation.y=ry;
  const w=ub.width||8,d=ub.depth||8;

  // Lush base lawn
  const lawn=_box(g,w,0.16,d,0x43a047,{roughness:0.97});lawn.position.y=0.08;

  // Gravel path (central cross)
  const pM=new THREE.MeshStandardMaterial({color:0xd7ccc8,roughness:0.93});
  const pathL=new THREE.Mesh(new THREE.BoxGeometry(0.55,0.05,d*0.86),pM);pathL.position.set(0,0.195,0);g.add(pathL);

  // Flower beds
  const flColors=[0xe91e63,0xff9800,0xffeb3b,0xab47bc];
  for(const[fz,side] of [[-d*0.28,1],[d*0.28,-1]] as [number,number][]){
    for(let fi=0;fi<3;fi++){
      const bed=_box(g,w*0.22,0.10,d*0.07,0x6d4c41,{roughness:0.97});bed.position.set(-w*0.22+fi*w*0.22,0.21,fz);
      const fc=flColors[fi%flColors.length];
      const bloom=new THREE.Mesh(new THREE.SphereGeometry(0.17,6,5),new THREE.MeshStandardMaterial({color:fc,roughness:0.82}));
      bloom.position.set(-w*0.22+fi*w*0.22,0.42,fz);bloom.castShadow=true;g.add(bloom);void bed;void side;
    }
  }

  // Perimeter hedge
  const hM=new THREE.MeshStandardMaterial({color:0x2e7d32,roughness:0.88});
  const hH=0.78,hT=0.26;
  for(const hx of [-w/2+hT/2,w/2-hT/2]){const h=new THREE.Mesh(new THREE.BoxGeometry(hT,hH,d-hT*2),hM);h.position.set(hx,0.16+hH/2,0);h.castShadow=true;g.add(h);}
  // Back hedge
  const hb=new THREE.Mesh(new THREE.BoxGeometry(w-hT*2,hH,hT),hM);hb.position.set(0,0.16+hH/2,-d/2+hT/2);hb.castShadow=true;g.add(hb);
  // Front hedge (with gate gap)
  for(const hx of [-w/4-0.28,w/4+0.28]){const h=new THREE.Mesh(new THREE.BoxGeometry(w/2-0.85,hH,hT),hM);h.position.set(hx,0.16+hH/2,d/2-hT/2);h.castShadow=true;g.add(h);}
  // Gate posts
  for(const gpx of [-0.52,0.52]){
    const gp=_cyl(g,0.052,0.068,hH+0.28,8,0x8d6e63,{roughness:0.68});gp.position.set(gpx,0.16+(hH+0.28)/2,d/2-hT/2);
  }

  // Corner topiary trees
  for(const[tx,tz] of [[-w/2+0.75,-d/2+0.75],[w/2-0.75,-d/2+0.75],[-w/2+0.75,d/2-0.75],[w/2-0.75,d/2-0.75]] as [number,number][]){
    _buildTree(g,tx,0.16,tz);
  }

  // Garden bench
  const bM=new THREE.MeshStandardMaterial({color:0x8d6e63,roughness:0.78});
  const bs=new THREE.Mesh(new THREE.BoxGeometry(0.85,0.055,0.36),bM);bs.position.set(w*0.2,0.36,0);g.add(bs);
  const bb=new THREE.Mesh(new THREE.BoxGeometry(0.85,0.30,0.05),bM);bb.position.set(w*0.2,0.52,0.20);g.add(bb);
  for(const blx of [-0.36,0.36]){const bl=new THREE.Mesh(new THREE.BoxGeometry(0.045,0.36,0.36),new THREE.MeshStandardMaterial({color:0x616161,roughness:0.3,metalness:0.6}));bl.position.set(w*0.2+blx,0.18,0);g.add(bl);}
  return g;
}

// ── PARKING ───────────────────────────────────────────────────────────────────
function buildPremiumParking(ub:UBLike,gY:number,lx:number,lz:number,ry:number):THREE.Group{
  const g=new THREE.Group();g.position.set(lx,gY,lz);g.rotation.y=ry;
  const w=ub.width||10,d=ub.depth||6;

  // Tarmac
  const surf=_box(g,w,0.10,d,0x37474f,{roughness:0.90});surf.position.y=0.05;

  // Kerb
  const kM=new THREE.MeshStandardMaterial({color:0xbdbdbd,roughness:0.83});
  const kH=0.10,kT=0.13;
  for(const[kx,kz,kw,kd] of [[0,d/2+kT/2,w+kT*2,kT],[0,-d/2-kT/2,w+kT*2,kT],[w/2+kT/2,0,kT,d],[-w/2-kT/2,0,kT,d]] as [number,number,number,number][]){
    const k=new THREE.Mesh(new THREE.BoxGeometry(kw,kH,kd),kM);k.position.set(kx,kH/2,kz);g.add(k);
  }

  // Bay lines
  const numSlots=Math.max(1,Math.round(w/2.6));
  const slotW=w/numSlots;
  const lM=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.68});
  for(let si=0;si<=numSlots;si++){
    const sx=-w/2+slotW*si;
    const ln=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.025,d*0.88),lM);ln.position.set(sx,0.113,0);g.add(ln);
  }
  // Stop lines
  for(const sz of [-d*0.44,d*0.44]){const sl=new THREE.Mesh(new THREE.BoxGeometry(w,0.025,0.07),lM);sl.position.set(0,0.113,sz);g.add(sl);}

  // Directional arrows
  const aM=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.68});
  const numArrows=Math.max(1,Math.round(numSlots/2));
  for(let ai=0;ai<numArrows;ai++){
    const ax=-w/2+slotW*(ai*2+0.5);
    const shaft=new THREE.Mesh(new THREE.BoxGeometry(0.11,0.025,0.5),aM);shaft.position.set(ax,0.116,0.08);g.add(shaft);
    const head=new THREE.Mesh(new THREE.ConeGeometry(0.14,0.26,3),aM);head.rotation.x=Math.PI/2;head.position.set(ax,0.116,-0.22);g.add(head);
  }

  // Lamp posts (2 corners)
  for(const[lpx,lpz] of [[-w/2+0.28,-d/2+0.28],[w/2-0.28,-d/2+0.28]] as [number,number][]){_buildLampPost(g,lpx,0.10,lpz);}

  // Parking sign
  const signGeom=new THREE.BoxGeometry(0.42,0.42,0.04);
  const sign=new THREE.Mesh(signGeom,new THREE.MeshStandardMaterial({color:0x1565c0,roughness:0.45}));
  sign.position.set(w/2-0.28,1.7,d/2-0.28);g.add(sign);
  const sp=_cyl(g,0.028,0.038,1.7,6,0x9e9e9e,{roughness:0.28,metalness:0.65});sp.position.set(w/2-0.28,0.85,d/2-0.28);void sp;
  return g;
}

// ── CARPORT ───────────────────────────────────────────────────────────────────
function buildPremiumCarport(ub:UBLike,gY:number,lx:number,lz:number,ry:number):THREE.Group{
  const g=new THREE.Group();g.position.set(lx,gY,lz);g.rotation.y=ry;
  const w=ub.width||6,d=ub.depth||4;

  // Concrete pad
  _box(g,w+0.28,0.07,d+0.28,0xb0bec5,{roughness:0.90}).position.y=0.035;

  const cH=2.65;
  const pM=new THREE.MeshStandardMaterial({color:0x607d8b,roughness:0.38,metalness:0.52});
  // I-beam posts
  for(const[px,pz] of [[-w/2+0.14,-d/2+0.14],[-w/2+0.14,d/2-0.14],[w/2-0.14,-d/2+0.14],[w/2-0.14,d/2-0.14]] as [number,number][]){
    for(const fz of[-0.075,0.075]){const fl=new THREE.Mesh(new THREE.BoxGeometry(0.12,cH,0.038),pM);fl.position.set(px,0.07+cH/2,pz+fz);g.add(fl);}
    const web=new THREE.Mesh(new THREE.BoxGeometry(0.036,cH,0.15),pM);web.position.set(px,0.07+cH/2,pz);g.add(web);
    const bp=_box(g,0.20,0.055,0.20,0x9e9e9e,{roughness:0.5,metalness:0.45});bp.position.set(px,0.028,pz);void bp;
  }

  // Longitudinal ridge beam
  const rb=_box(g,w,0.10,0.10,0x546e7a,{roughness:0.32,metalness:0.58});rb.position.set(0,0.07+cH+0.05,0);void rb;
  // Cross beams
  const nBeams=Math.max(2,Math.round(w/1.4));
  for(let bi=0;bi<nBeams;bi++){
    const bx=-w/2+(bi+0.5)*(w/nBeams);
    const cb=_box(g,0.07,0.09,d,0x546e7a,{roughness:0.32,metalness:0.58});cb.position.set(bx,0.07+cH+0.045,0);void cb;
  }

  // Translucent polycarbonate roof
  const roofPanel=new THREE.Mesh(new THREE.BoxGeometry(w-0.18,0.038,d-0.18),
    new THREE.MeshPhysicalMaterial({color:0x90caf9,roughness:0.04,metalness:0.04,transparent:true,opacity:0.42,transmission:0.62,clearcoat:0.85}));
  roofPanel.position.set(0,0.07+cH+0.115,0);g.add(roofPanel);

  return g;
}


// ─── Module-Level 3D Context Registry (for cross-module capture access) ─────
// Only one Terrain3DViewer exists at a time. This singleton exposes the active
// renderer/scene/camera so the captureEngine can grab them without prop-drilling.
let _active3DContext: {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  buildingsGroup?: THREE.Group;
} | null = null;

/** Returns the active Three.js context, or null if the viewer is unmounted. */
export function getActive3DContext() { return _active3DContext; }


export default function Terrain3DViewer({ processedSiteData, parcelGeoJSON, width, height, userBuildings, canvasWidth, canvasHeight, pixelsPerMeter, zScale: zScaleProp = 1.0 }: Terrain3DViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    normPts: Array<{ x: number; z: number; y: number }>;
    controls: OrbitControls;
    animId: number;
    terrainMesh?: THREE.Mesh;
    skirtMesh?: THREE.Mesh;
    bottomCap?: THREE.Mesh;
    buildingsGroup: THREE.Group;
    cX: number;
    cZ: number;
  } | null>(null);
  const [status, setStatus] = useState("Initializing...");
  const [isReady, setIsReady] = useState(false);
  const sculptCleanupRef = useRef<(() => void) | null>(null);
  // zScale is now controlled by the parent right panel via prop
  const zScale = zScaleProp;
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
    baseY: Float32Array;
  } | null>(null);
  // Stores exag value from last buildScene run so buildings useEffect can use it
  const exagRef = useRef<number>(1);
  // Always-current ref for userBuildings — lets buildScene read latest value
  // without needing userBuildings in its dep array (which would cause full rebuilds)
  const userBuildingsRef = useRef<UserBuilding3D[] | undefined>(undefined);
  useEffect(() => { userBuildingsRef.current = userBuildings; }, [userBuildings]);

  const buildScene = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    if (!processedSiteData && !parcelGeoJSON) return;

    // Cleanup previous renderer (NOT called when only buildings change)
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

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.5; // Brighter for vibrant satellite colors

    container.innerHTML = "";
    const cvs = renderer.domElement;
    cvs.setAttribute('data-terrain-3d', 'true');
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
    const basePos = terrainGeom.attributes.position as THREE.BufferAttribute;
    const baseY = new Float32Array(basePos.count);
    for (let i = 0; i < basePos.count; i++) baseY[i] = basePos.getY(i);

    terrainDataRef.current = {
      baseExag: exag,
      minE,
      eRange,
      sceneElev,
      normPts,
      cX,
      cZ,
      slabH,
      pos: basePos,
      gridN: GRID_RES + 1,
      baseY,
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
    // Terrain always uses procedural vertex colors (green/brown diorama style)
    // — consistent, fast, and reliable for every project location

    // Zone overlay lines removed — they float and the topographic map already shows zones

    // ── Dedicated group for user-placed buildings ──
    // Buildings are added to this group (not directly to scene) so they can be
    // cleared and repopulated without rebuilding terrain.
    const buildingsGroup = new THREE.Group();
    scene.add(buildingsGroup);

    const latestBuildings = userBuildingsRef.current;
    if (latestBuildings && latestBuildings.length > 0 && canvasWidth && canvasHeight && pixelsPerMeter) {
      setStatus("Placing user buildings on terrain...");
      const ppm = pixelsPerMeter;
      for (const ub of latestBuildings) {
        try {
          const localX = (ub.canvasX - canvasWidth / 2) / ppm;
          const localZ = (ub.canvasY - canvasHeight / 2) / ppm;
          const rotY = ub.canvasAngle ? -ub.canvasAngle * DEG_TO_RAD : 0;
          const groundY = normPts.length >= 3 ? idwInterpolate(localX, localZ, normPts, 2) : 0;
          const buildingType = (ub.type || ub.name || '').toLowerCase().trim();
          let assetGroup: THREE.Group;
          if (buildingType.includes('pool') || buildingType.includes('piscine')) {
            assetGroup = buildPremiumPool(ub, groundY, localX, localZ, rotY);
          } else if (buildingType.includes('garden') || buildingType.includes('jardin') || buildingType.includes('green')) {
            assetGroup = buildPremiumGarden(ub, groundY, localX, localZ, rotY);
          } else if (buildingType.includes('parking') || buildingType.includes('stationnement')) {
            assetGroup = buildPremiumParking(ub, groundY, localX, localZ, rotY);
          } else if (buildingType.includes('carport')) {
            assetGroup = buildPremiumCarport(ub, groundY, localX, localZ, rotY);
          } else {
            assetGroup = buildPremiumHouse(ub, groundY, localX, localZ, rotY);
          }
          buildingsGroup.add(assetGroup);
        } catch { /* skip bad building */ }
      }
      console.log(`[terrain3d] Rendered ${latestBuildings.length} premium buildings into buildingsGroup`);
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

    sceneRef.current = {
      renderer,
      scene,
      camera,
      normPts,
      controls,
      animId,
      terrainMesh,
      skirtMesh,
      bottomCap,
      buildingsGroup,
      cX,
      cZ,
    };
    // Publish to module-level registry for cross-module capture access
    _active3DContext = { renderer, scene, camera, buildingsGroup };
    // Store exag for buildings effect
    exagRef.current = exag;

    // ── Sculpt System: attach handlers + cursor meshes ──
    {
      const { cursor, brushRing } = createSculptCursorMeshes();
      scene.add(cursor);
      scene.add(brushRing);

      // Restore any previously sculpted deltas (survives 2D↔3D toggle)
      const storedDeltas = useSculptStore.getState().elevationDeltas;
      if (Object.keys(storedDeltas).length > 0) {
        applyStoredDeltas(terrainMesh, storedDeltas);
        terrainGeom.computeVertexNormals();
      }

      sculptCleanupRef.current = attachSculptHandlers({
        terrainMesh,
        renderer,
        camera,
        gridRes: GRID_RES,
        baseExag: exag,
        minElev: minE,
        elevRange: eRange,
        cursorMesh: cursor,
        brushRingMesh: brushRing,
      });
    }

    setIsReady(true);
    setStatus("");
  }, [processedSiteData, parcelGeoJSON, width, height]);
  // NOTE: userBuildings intentionally omitted — buildings are rendered imperatively
  // in a separate useEffect below to avoid full scene teardown on element changes.

  useEffect(() => {
    buildScene();
    return () => {
      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animId);
        sceneRef.current.renderer.dispose();
        sceneRef.current.controls.dispose();
      }
      // Clear module-level registry on unmount
      _active3DContext = null;
      if (sculptCleanupRef.current) {
        sculptCleanupRef.current();
        sculptCleanupRef.current = null;
      }
    };
  }, [buildScene]);

  // ── Buildings-only update (no terrain rebuild) ──
  // Runs whenever the 2D canvas elements change. If the scene isn't ready yet
  // (buildScene is still async), we retry in 200ms intervals until it is.
  useEffect(() => {
    let cancelled = false;

    function applyBuildings() {
      const sr = sceneRef.current;
      if (!sr?.buildingsGroup) {
        // Scene not ready yet — retry after 200ms
        if (!cancelled) setTimeout(applyBuildings, 200);
        return;
      }
      if (!canvasWidth || !canvasHeight || !pixelsPerMeter) return;

      const { buildingsGroup, normPts } = sr;

      // Dispose & clear existing building meshes
      buildingsGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
          if (Array.isArray(m.material)) m.material.forEach(mat => mat.dispose());
          else (m.material as THREE.Material)?.dispose();
        }
      });
      buildingsGroup.clear();

      if (!userBuildings || userBuildings.length === 0) {
        console.log('[terrain3d] No buildings to render');
        return;
      }
      const ppm = pixelsPerMeter;

      for (const ub of userBuildings) {
        try {
          const localX = (ub.canvasX - canvasWidth / 2) / ppm;
          const localZ = (ub.canvasY - canvasHeight / 2) / ppm;
          const rotY = ub.canvasAngle ? -ub.canvasAngle * DEG_TO_RAD : 0;
          const groundY = normPts.length >= 3 ? idwInterpolate(localX, localZ, normPts, 2) : 0;
          const buildingType = (ub.type || ub.name || '').toLowerCase().trim();

          let assetGroup: THREE.Group;
          if (buildingType.includes('pool') || buildingType.includes('piscine')) {
            assetGroup = buildPremiumPool(ub, groundY, localX, localZ, rotY);
          } else if (buildingType.includes('garden') || buildingType.includes('jardin') || buildingType.includes('green')) {
            assetGroup = buildPremiumGarden(ub, groundY, localX, localZ, rotY);
          } else if (buildingType.includes('parking') || buildingType.includes('stationnement')) {
            assetGroup = buildPremiumParking(ub, groundY, localX, localZ, rotY);
          } else if (buildingType.includes('carport')) {
            assetGroup = buildPremiumCarport(ub, groundY, localX, localZ, rotY);
          } else {
            assetGroup = buildPremiumHouse(ub, groundY, localX, localZ, rotY);
          }
          buildingsGroup.add(assetGroup);
        } catch { /* skip bad building */ }
      }
      console.log(`[terrain3d] Buildings imperatively updated: ${userBuildings.length}`);
    }

    applyBuildings();
    return () => { cancelled = true; };
  }, [userBuildings, canvasWidth, canvasHeight, pixelsPerMeter]);


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

  // ── Sync Undo/Reset from Zustand to Geometry ──
  useEffect(() => {
    return useSculptStore.subscribe((state, prevState) => {
      // Re-apply if deltas object changed (undo, reset), but NOT on hover
      if (state.elevationDeltas !== prevState.elevationDeltas) {
        const td = terrainDataRef.current;
        const sr = sceneRef.current;
        if (!td || !td.baseY || !sr?.terrainMesh) return;

        const pos = td.pos;
        const deltas = state.elevationDeltas;

        // 1. Reset exactly to baseY and add the active deltas
        for (let i = 0; i < pos.count; i++) {
          pos.setY(i, td.baseY[i] + (deltas[i] || 0));
        }

        pos.needsUpdate = true;
        sr.terrainMesh.geometry.computeVertexNormals();

        // 2. Rebuild skirt vertices to match new edge heights
        if (sr.skirtMesh) {
          const eN = td.gridN;
          const bottomY = -td.slabH;
          const cX = td.cX;
          const cZ = td.cZ;
          const skirtPos = sr.skirtMesh.geometry.attributes.position as THREE.BufferAttribute;
          
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
          
          const GR = td.gridN - 1;
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
      }
    });
  }, []);

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
      for (let i = 0; i < pos.count; i++) {
        pos.setY(i, smoothed[i]);
        td.baseY[i] = smoothed[i];
      }
    }

    // Re-apply any active sculpt deltas on top of the new base
    const currentDeltas = useSculptStore.getState().elevationDeltas;
    for (const [idxStr, delta] of Object.entries(currentDeltas)) {
      const idx = Number(idxStr);
      if (idx >= 0 && idx < pos.count) {
        pos.setY(idx, td.baseY[idx] + delta);
      }
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


      {/* ── Loading Overlay ── */}
      {(!isReady || status) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 px-6 py-4 bg-white/95 rounded-xl shadow-lg border border-slate-200">
            {!isReady && (
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            )}
            <span className="text-sm text-slate-600 font-medium max-w-xs text-center">
              {status || "Construction du terrain 3D..."}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
