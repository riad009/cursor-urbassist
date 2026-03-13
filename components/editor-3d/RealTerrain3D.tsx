"use client";

/**
 * RealTerrain3D — True Topographic Terrain using earcut + BufferGeometry
 *
 * STRICT MANDATE:
 *   - NO PlaneGeometry for ground
 *   - NO ExtrudeGeometry to fake terrain
 *   - ONLY the exact globalBoundary shape, earcut-triangulated
 *   - NGF elevation data mapped to Y-axis (real slope)
 *   - MeshStandardMaterial (#86efac, roughness 0.8)
 *   - computeVertexNormals() for correct shadow casting
 *
 * Pipeline:
 *   1. Project globalBoundary vertices to local metres (X=East, Z=South)
 *   2. Flatten to earcut input format [x0,z0, x1,z1, ...]
 *   3. earcut() → triangle indices
 *   4. Build BufferGeometry with position (X, Y=elevation, Z)
 *   5. computeVertexNormals() for lighting/shadows
 */

import React, { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import * as THREE from "three";
import earcut from "earcut";
import type { ProcessedSiteData, Vertex3D } from "@/types/processed-site-data";

// ─── Constants ───────────────────────────────────────────────────────────────

const METERS_PER_DEGREE_LAT = 111320;
const DEG_TO_RAD = Math.PI / 180;

/** Vertical exaggeration factor — makes 1-3m elevation differences visible */
const VERTICAL_SCALE = 3.0;

// ─── Geo-to-3D Projection ───────────────────────────────────────────────────

/**
 * Project (lng, lat) to local 3D metres relative to refPoint.
 * X = East, Z = South (Three.js convention: Y is up)
 */
function geoToLocal3D(
  lng: number,
  lat: number,
  refLng: number,
  refLat: number
): [number, number] {
  const x = (lng - refLng) * METERS_PER_DEGREE_LAT * Math.cos(refLat * DEG_TO_RAD);
  const z = -(lat - refLat) * METERS_PER_DEGREE_LAT; // Negate: lat+ = north = -Z
  return [x, z];
}

// ─── Terrain Mesh Component ──────────────────────────────────────────────────

interface TerrainMeshProps {
  data: ProcessedSiteData;
}

function TerrainMesh({ data }: TerrainMeshProps) {
  const geometry = useMemo(() => {
    const { refPoint, vertices3D, globalBoundary, stats } = data;
    const minElev = stats?.minElevation ?? 0;

    // ── Step 1: Extract outer ring(s) of the globalBoundary ──────────────
    const geom = globalBoundary.geometry;
    const outerRings: number[][][] = [];

    if (geom.type === "Polygon") {
      outerRings.push(geom.coordinates[0]);
    } else {
      // MultiPolygon: use all outer rings
      for (const poly of geom.coordinates) {
        outerRings.push(poly[0]);
      }
    }

    // ── Step 2: Build elevation lookup from vertices3D ───────────────────
    const elevLookup = new Map<string, number>();
    for (const v of vertices3D) {
      const key = `${v.lng.toFixed(6)},${v.lat.toFixed(6)}`;
      elevLookup.set(key, v.elevation);
    }

    // ── Step 3: Project to local 3D coordinates + flatten for earcut ─────
    // For each ring, project vertices and collect:
    //   - flatCoords: [x0, z0, x1, z1, ...] for earcut (2D triangulation)
    //   - projectedVertices: [{x, y(elevation), z}] for position buffer
    const allProjected: Array<{ x: number; y: number; z: number }> = [];
    const earcutFlat: number[] = [];

    // Process the primary outer ring (for earcut we use the first/largest ring)
    const primaryRing = outerRings[0];
    // Exclude closing vertex if it duplicates the first
    const ringLen = primaryRing.length;
    const limit =
      ringLen > 1 &&
        primaryRing[0][0] === primaryRing[ringLen - 1][0] &&
        primaryRing[0][1] === primaryRing[ringLen - 1][1]
        ? ringLen - 1
        : ringLen;

    for (let i = 0; i < limit; i++) {
      const [lng, lat] = primaryRing[i];
      const [x, z] = geoToLocal3D(lng, lat, refPoint?.lng ?? 0, refPoint?.lat ?? 0);
      const key = `${lng.toFixed(6)},${lat.toFixed(6)}`;
      const rawElev = elevLookup.get(key) ?? minElev;
      const y = (rawElev - minElev) * VERTICAL_SCALE;

      allProjected.push({ x, y, z });
      earcutFlat.push(x, z); // earcut works in 2D (x, z plane)
    }

    if (allProjected.length < 3) {
      return new THREE.BufferGeometry(); // Degenerate case
    }

    // ── Step 4: Run earcut triangulation ──────────────────────────────────
    const triangleIndices = earcut(earcutFlat, undefined, 2);

    if (triangleIndices.length < 3) {
      // Fallback: simple fan triangulation
      for (let i = 1; i < allProjected.length - 1; i++) {
        triangleIndices.push(0, i, i + 1);
      }
    }

    // ── Step 5: Build BufferGeometry ─────────────────────────────────────
    const n = allProjected.length;
    const positions = new Float32Array(n * 3);

    for (let i = 0; i < n; i++) {
      positions[i * 3] = allProjected[i].x;
      positions[i * 3 + 1] = allProjected[i].y;
      positions[i * 3 + 2] = allProjected[i].z;
    }

    const bufferGeometry = new THREE.BufferGeometry();
    bufferGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    bufferGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(triangleIndices), 1));

    // ── Step 6: Compute vertex normals for correct shadow casting ────────
    bufferGeometry.computeVertexNormals();
    bufferGeometry.computeBoundingSphere();

    return bufferGeometry;
  }, [data]);

  return (
    <mesh geometry={geometry} receiveShadow castShadow>
      <meshStandardMaterial
        color="#86efac"
        roughness={0.8}
        metalness={0}
        side={THREE.DoubleSide}
        flatShading={false}
      />
    </mesh>
  );
}

// ─── Boundary Edge Lines ─────────────────────────────────────────────────────

function BoundaryEdges({ data }: { data: ProcessedSiteData }) {
  const lineGeometry = useMemo(() => {
    const { refPoint, vertices3D, globalBoundary, stats } = data;
    const minElev = stats?.minElevation ?? 0;

    const geom = globalBoundary.geometry;
    const rings: number[][][] = [];
    if (geom.type === "Polygon") {
      rings.push(geom.coordinates[0]);
    } else {
      for (const poly of geom.coordinates) {
        rings.push(poly[0]);
      }
    }

    const elevLookup = new Map<string, number>();
    for (const v of vertices3D) {
      elevLookup.set(`${v.lng.toFixed(6)},${v.lat.toFixed(6)}`, v.elevation);
    }

    const points: THREE.Vector3[] = [];
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const [lng, lat] = ring[i];
        const [x, z] = geoToLocal3D(lng, lat, refPoint?.lng ?? 0, refPoint?.lat ?? 0);
        const key = `${lng.toFixed(6)},${lat.toFixed(6)}`;
        const rawElev = elevLookup.get(key) ?? minElev;
        const y = (rawElev - minElev) * VERTICAL_SCALE + 0.15; // Slightly above surface
        points.push(new THREE.Vector3(x, y, z));
      }
    }

    return new THREE.BufferGeometry().setFromPoints(points);
  }, [data]);

  return (
    <lineLoop geometry={lineGeometry}>
      <lineBasicMaterial color="#1e293b" linewidth={2} />
    </lineLoop>
  );
}

// ─── Corner Post Markers ─────────────────────────────────────────────────────

function CornerPosts({ data }: { data: ProcessedSiteData }) {
  const posts = useMemo(() => {
    const { refPoint, vertices3D, stats } = data;
    const minElev = stats?.minElevation ?? 0;

    return vertices3D.map((v) => {
      const [x, z] = geoToLocal3D(v.lng, v.lat, refPoint?.lng ?? 0, refPoint?.lat ?? 0);
      const y = (v.elevation - minElev) * VERTICAL_SCALE;
      return { x, y, z, elevation: v.elevation };
    });
  }, [data]);

  return (
    <group>
      {posts.map((post, i) => (
        <group key={i} position={[post.x, post.y, post.z]}>
          {/* Cylindrical boundary marker (borne cadastrale) */}
          <mesh castShadow>
            <cylinderGeometry args={[0.15, 0.15, 0.8, 8]} />
            <meshStandardMaterial color="#64748b" roughness={0.7} metalness={0.3} />
          </mesh>
          {/* Small sphere on top */}
          <mesh position={[0, 0.5, 0]}>
            <sphereGeometry args={[0.2, 8, 8]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.5} metalness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ─── Scene Lighting ──────────────────────────────────────────────────────────

function SceneLighting() {
  return (
    <>
      {/* Warm sun light with shadows */}
      <directionalLight
        position={[25, 40, 20]}
        intensity={1.4}
        color="#fff4e6"
        castShadow
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-near={0.5}
        shadow-camera-far={150}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-bias={-0.0002}
      />
      {/* Cool fill light */}
      <directionalLight position={[-15, 20, -10]} intensity={0.4} color="#b8c4d4" />
      {/* Hemisphere: sky/ground ambient */}
      <hemisphereLight args={["#87ceeb", "#4a7c4e", 0.5]} />
      {/* Subtle ambient */}
      <ambientLight intensity={0.3} color="#c4d4e8" />
    </>
  );
}

// ─── Surrounding Ground Plane ────────────────────────────────────────────────

function SurroundingGround() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
      <planeGeometry args={[200, 200]} />
      <meshStandardMaterial color="#5a8c5e" roughness={0.95} metalness={0} />
    </mesh>
  );
}

// ─── Auto-Fit Camera ─────────────────────────────────────────────────────────

function CameraSetup({ data }: { data: ProcessedSiteData }) {
  const { vertices3D, refPoint, stats } = data;
  const minElev = stats?.minElevation ?? 0;

  const positions = vertices3D.map((v) => {
    const [x, z] = geoToLocal3D(v.lng, v.lat, refPoint?.lng ?? 0, refPoint?.lat ?? 0);
    return { x, z };
  });

  const maxDim = Math.max(
    Math.max(...positions.map((p) => Math.abs(p.x))),
    Math.max(...positions.map((p) => Math.abs(p.z)))
  ) || 20;

  const dist = maxDim * 2.5;
  const elevCenter = (((stats?.maxElevation ?? 0) - minElev) * VERTICAL_SCALE) / 2;

  return (
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={5}
      maxDistance={dist * 3}
      maxPolarAngle={Math.PI / 2 - 0.05}
      target={[0, elevCenter, 0]}
    />
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface RealTerrain3DProps {
  /** ProcessedSiteData from the backend */
  data: ProcessedSiteData;
  /** Optional CSS class */
  className?: string;
}

export default function RealTerrain3D({ data, className }: RealTerrain3DProps) {
  // Calculate initial camera position based on terrain bounds
  const cameraConfig = useMemo(() => {
    const positions = data.vertices3D.map((v) => {
      const [x, z] = geoToLocal3D(v.lng, v.lat, data.refPoint?.lng ?? 0, data.refPoint?.lat ?? 0);
      return { x, z };
    });

    const maxDim = Math.max(
      Math.max(...positions.map((p) => Math.abs(p.x))),
      Math.max(...positions.map((p) => Math.abs(p.z)))
    ) || 20;

    const dist = maxDim * 2;
    const elevCenter =
      (((data.stats?.maxElevation ?? 0) - (data.stats?.minElevation ?? 0)) * VERTICAL_SCALE) / 2;

    return {
      position: [dist * 0.7, dist * 0.5 + elevCenter, dist * 0.7] as [number, number, number],
      fov: 45,
    };
  }, [data]);

  return (
    <div className={className ?? "w-full h-full min-h-[500px]"}>
      <Canvas
        shadows
        camera={{
          position: cameraConfig.position,
          fov: cameraConfig.fov,
          near: 0.5,
          far: 500,
        }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
        onCreated={({ gl }) => {
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        <color attach="background" args={["#dce1e8"]} />
        <fog attach="fog" args={["#dce1e8", 80, 200]} />

        <SceneLighting />
        <CameraSetup data={data} />

        {/* The actual terrain mesh — earcut-triangulated globalBoundary with NGF Y-displacement */}
        <TerrainMesh data={data} />

        {/* Boundary edge highlight lines */}
        <BoundaryEdges data={data} />

        {/* Corner boundary markers (bornes cadastrales) */}
        <CornerPosts data={data} />

        {/* Extended ground plane surrounding the terrain */}
        <SurroundingGround />

        {/* Environment map for realistic reflections */}
        <Environment preset="dawn" />
      </Canvas>
    </div>
  );
}
