"use client";

/**
 * TerrainDioramaScene.tsx — Premium R3F 3D Diorama
 *
 * Render isolation:
 *  - VolumetricTerrain is React.memo'd — NEVER rebuilds when objects change
 *  - Objects are read via useProjectObjects (useShallow)
 *  - Each SceneObject is memo'd per-object — only updates when that object moves
 *  - Raycaster allocated ONCE outside useFrame; targetY via ref → zero re-renders
 *
 * Premium visuals (Kenney.nl low-poly style):
 *  - All 7 procedural assets imported from ProceduralAssets.tsx
 *  - ContactShadows for soft ground contact
 *  - Environment + Sky + dual directional + hemisphere fill
 *  - GLTF pipeline: Suspense + ErrorBoundary → procedural fallback
 */

import React, { useRef, useMemo, memo, Component } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sky, useGLTF, Environment, ContactShadows } from "@react-three/drei";

import { useProjectObjects, ProjectObject } from "@/store/useUrbAssistProjectStore";
import { PROCEDURAL_ASSET_MAP } from "@/components/three-v2/ProceduralAssets";

// ─── Constants ────────────────────────────────────────────────────────────────

const CANVAS_ORIGIN_X = 600;
const CANVAS_ORIGIN_Z = 400;

// ─── VolumetricTerrain (React.memo → NEVER rebuilds when objects change) ─────

interface VolumetricTerrainProps {
  width?: number;
  depth?: number;
  gridRes?: number;
  skirtDepth?: number;
  noiseScale?: number;
  noiseHeight?: number;
}

const VolumetricTerrain = memo(function VolumetricTerrain({
  width = 120,
  depth = 120,
  gridRes = 128,
  skirtDepth = 10,
  noiseScale = 0.05,
  noiseHeight = 4,
}: VolumetricTerrainProps) {
  const terrainGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(width, depth, gridRes, gridRes);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const y = Math.sin(vx * noiseScale) * Math.cos(vz * noiseScale) * noiseHeight;
      pos.setY(i, y);

      const t = Math.max(0, Math.min(1, (y + noiseHeight) / (noiseHeight * 2)));
      colors[i * 3]     = 0.35 + t * 0.27;
      colors[i * 3 + 1] = 0.58 + t * 0.12;
      colors[i * 3 + 2] = 0.22 + t * 0.15;
    }

    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, [width, depth, gridRes, noiseScale, noiseHeight]);

  const skirtGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = terrainGeo.attributes.position;
    const eN = gridRes + 1;
    const bottomY = -skirtDepth;
    const vertices: number[] = [];
    const indices: number[] = [];
    let vtxCount = 0;

    const addQuad = (i1: number, i2: number, flip: boolean) => {
      const p1x = pos.getX(i1), p1y = pos.getY(i1), p1z = pos.getZ(i1);
      const p2x = pos.getX(i2), p2y = pos.getY(i2), p2z = pos.getZ(i2);
      const base = vtxCount;
      if (flip) {
        vertices.push(p2x, p2y, p2z, p1x, p1y, p1z, p1x, bottomY, p1z, p2x, bottomY, p2z);
      } else {
        vertices.push(p1x, p1y, p1z, p2x, p2y, p2z, p2x, bottomY, p2z, p1x, bottomY, p1z);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      vtxCount += 4;
    };

    for (let i = 0; i < gridRes; i++) addQuad(i, i + 1, false);
    for (let i = 0; i < gridRes; i++) addQuad(gridRes * eN + i, gridRes * eN + i + 1, true);
    for (let j = 0; j < gridRes; j++) addQuad(j * eN, (j + 1) * eN, true);
    for (let j = 0; j < gridRes; j++) addQuad(j * eN + gridRes, (j + 1) * eN + gridRes, false);

    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vertices), 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    geo.computeVertexNormals();
    return geo;
  }, [terrainGeo, gridRes, skirtDepth]);

  return (
    <group>
      <mesh geometry={terrainGeo} receiveShadow castShadow name="TERRAIN_SURFACE">
        <meshStandardMaterial vertexColors roughness={0.85} metalness={0} />
      </mesh>
      <mesh geometry={skirtGeo} receiveShadow>
        <meshStandardMaterial color="#3E2723" roughness={1} metalness={0} />
      </mesh>
    </group>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// DIRECT SURFACE → COMPONENT MAP  (SurfaceType → premium procedural component)
// No ProceduralType indirection — every SurfaceType resolves directly.
// ═════════════════════════════════════════════════════════════════════════════

import type { SurfaceType } from "@/store/useUrbAssistProjectStore";

const SURFACE_COMPONENT_MAP: Partial<Record<SurfaceType, React.ComponentType<{ w?: number; h?: number; d?: number }>>> = {
  house:   PROCEDURAL_ASSET_MAP.house,
  garage:  PROCEDURAL_ASSET_MAP.garage,
  pool:    PROCEDURAL_ASSET_MAP.pool,
  parking: PROCEDURAL_ASSET_MAP.parking,
  garden:  PROCEDURAL_ASSET_MAP.garden,
  terrace: PROCEDURAL_ASSET_MAP.terrace,
  access:  PROCEDURAL_ASSET_MAP.access,
  vrd:     PROCEDURAL_ASSET_MAP.access,   // small marker — closest visual
  other:   PROCEDURAL_ASSET_MAP.house,    // freeform fallback
};

interface ProceduralMeshProps {
  obj: ProjectObject;
}

const ProceduralMesh = memo(function ProceduralMesh({ obj }: ProceduralMeshProps) {
  const { widthMeters: w, heightMeters: h, lengthMeters: d } = obj.realWorldProps;
  const AssetComponent = SURFACE_COMPONENT_MAP[obj.type];

  if (AssetComponent) {
    return <AssetComponent w={w || 8} h={h || 4} d={d || 6} />;
  }

  // Absolute last resort (boundary, unknown type)
  return (
    <mesh castShadow receiveShadow>
      <boxGeometry args={[Math.max(1, w), Math.max(1, h), Math.max(1, d)]} />
      <meshStandardMaterial color={obj.color ?? "#94a3b8"} roughness={0.8} metalness={0.1} />
    </mesh>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// GLTF PIPELINE: ErrorBoundary → Suspense → useGLTF → procedural fallback
// ═════════════════════════════════════════════════════════════════════════════

interface GLTFErrorBoundaryProps {
  fallback: React.ReactNode;
  children: React.ReactNode;
}

interface GLTFErrorBoundaryState {
  hasError: boolean;
}

class GLTFErrorBoundary extends Component<GLTFErrorBoundaryProps, GLTFErrorBoundaryState> {
  constructor(props: GLTFErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): GLTFErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn("[GLTFErrorBoundary] Model load failed, using procedural fallback:", error.message);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

// ─── AssetMesh (GLTF pipeline — activates when .glb file exists at meshPath) ──

interface AssetMeshProps {
  groupRef: React.RefObject<THREE.Group | null>;
  obj: ProjectObject;
}

const AssetMesh = memo(function AssetMesh({ groupRef, obj }: AssetMeshProps) {
  const { nodes, materials } = useGLTF(obj.meshPath!);

  return (
    <group ref={groupRef} castShadow receiveShadow>
      {Object.values(nodes).map((node: any) => {
        if (!node.isMesh) return null;
        const mat = node.material?.name
          ? (materials[node.material.name] ??
              new THREE.MeshStandardMaterial({ color: obj.color ?? "#dedede", roughness: 0.8, metalness: 0.1 }))
          : new THREE.MeshStandardMaterial({ color: obj.color ?? "#dedede", roughness: 0.8, metalness: 0.1 });
        return (
          <mesh key={node.uuid} geometry={node.geometry} material={mat} castShadow receiveShadow />
        );
      })}
    </group>
  );
});

// ─── SceneObject (Per-object raycasting + smooth lerp to terrain height) ─────

interface SceneObjectProps {
  obj: ProjectObject;
}

/**
 * Epsilon for position-change detection.
 * Raycasting is ONLY performed when the 2D (X, Z) coordinates change
 * by more than this threshold. Position lerping still runs every frame
 * for smooth animation.
 */
const POSITION_EPSILON = 0.01;

const SceneObject = memo(function SceneObject({ obj }: SceneObjectProps) {
  const groupRef     = useRef<THREE.Group>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const rayOriginRef = useRef(new THREE.Vector3());
  const rayDirRef    = useRef(new THREE.Vector3(0, -1, 0));
  const targetYRef   = useRef(0);
  // Track previous 2D coordinates to avoid raycasting every frame
  const prevXRef     = useRef(NaN);
  const prevZRef     = useRef(NaN);

  useFrame(({ scene }) => {
    const group = groupRef.current;
    if (!group) return;

    const worldX = obj.fabricProps.x - CANVAS_ORIGIN_X;
    const worldZ = obj.fabricProps.y - CANVAS_ORIGIN_Z;

    // ── Conditional Raycasting (performance optimisation) ──────────────
    // Only cast a ray when the 2D position actually changed.
    // This avoids 60+ intersection tests per frame per object.
    const dx = Math.abs(worldX - prevXRef.current);
    const dz = Math.abs(worldZ - prevZRef.current);

    if (dx > POSITION_EPSILON || dz > POSITION_EPSILON || Number.isNaN(prevXRef.current)) {
      prevXRef.current = worldX;
      prevZRef.current = worldZ;

      const terrainMesh = scene.getObjectByName("TERRAIN_SURFACE");
      if (terrainMesh) {
        rayOriginRef.current.set(worldX, 200, worldZ);
        raycasterRef.current.set(rayOriginRef.current, rayDirRef.current);
        const hits = raycasterRef.current.intersectObject(terrainMesh);
        if (hits.length > 0) targetYRef.current = hits[0].point.y;
      }
    }

    // ── Smooth position lerp (runs every frame for animation) ─────────
    group.position.x += (worldX - group.position.x) * 0.15;
    group.position.y += (targetYRef.current - group.position.y) * 0.15;
    group.position.z += (worldZ - group.position.z) * 0.15;
    group.rotation.y = THREE.MathUtils.degToRad(obj.fabricProps.angle);
  });

  const proceduralFallback = (
    <group ref={groupRef}>
      <ProceduralMesh obj={obj} />
    </group>
  );

  if (obj.meshPath) {
    return (
      <GLTFErrorBoundary fallback={proceduralFallback}>
        <React.Suspense fallback={proceduralFallback}>
          <AssetMesh groupRef={groupRef} obj={obj} />
        </React.Suspense>
      </GLTFErrorBoundary>
    );
  }

  return proceduralFallback;
}, (prev, next) =>
  prev.obj.fabricProps.x     === next.obj.fabricProps.x     &&
  prev.obj.fabricProps.y     === next.obj.fabricProps.y     &&
  prev.obj.fabricProps.angle === next.obj.fabricProps.angle &&
  prev.obj.meshPath          === next.obj.meshPath          &&
  prev.obj.type              === next.obj.type              &&
  prev.obj.realWorldProps.widthMeters  === next.obj.realWorldProps.widthMeters  &&
  prev.obj.realWorldProps.heightMeters === next.obj.realWorldProps.heightMeters &&
  prev.obj.realWorldProps.lengthMeters === next.obj.realWorldProps.lengthMeters
);

// ─── Scene Objects Layer ──────────────────────────────────────────────────────

function SceneObjects() {
  const objects = useProjectObjects();

  return (
    <>
      {objects
        .filter((obj) => obj.type !== "boundary")
        .map((obj) => (
          <SceneObject key={obj.id} obj={obj} />
        ))}
    </>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export default function TerrainDioramaScene() {
  return (
    <div className="relative w-full h-full">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [60, 45, 60], fov: 42 }}
        performance={{ min: 0.5 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.4,
        }}
      >
        {/* ── Environment & Sky ── */}
        <Environment preset="city" environmentIntensity={0.3} />
        <Sky sunPosition={[100, 25, 100]} turbidity={0.1} rayleigh={0.5} />

        {/* ── Premium Lighting ── */}
        <ambientLight intensity={0.35} color="#f0f4ff" />
        <hemisphereLight color="#87ceeb" groundColor="#5a7b4e" intensity={0.5} />

        <directionalLight
          castShadow
          position={[60, 120, -60]}
          intensity={1.6}
          color="#fff8e8"
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={0.5}
          shadow-camera-far={500}
          shadow-camera-left={-100}
          shadow-camera-right={100}
          shadow-camera-top={100}
          shadow-camera-bottom={-100}
          shadow-bias={-0.0003}
        />
        <directionalLight position={[-40, 60, 50]} intensity={0.35} color="#c8d8e8" />
        <directionalLight position={[20, 30, 80]}  intensity={0.15} color="#ffe4c4" />

        {/* ── Contact Shadows ── */}
        <ContactShadows
          position={[0, -0.02, 0]}
          opacity={0.40}
          scale={200}
          blur={2.0}
          far={50}
          resolution={1024}
          color="#0a0a1a"
        />

        {/* ── Controls ── */}
        <OrbitControls
          makeDefault
          maxPolarAngle={Math.PI / 2 - 0.04}
          minDistance={10}
          maxDistance={300}
          enableDamping
          dampingFactor={0.08}
        />

        {/* TERRAIN — memo'd, never updates when objects change */}
        <VolumetricTerrain />

        {/* OBJECTS — separate render tree */}
        <SceneObjects />
      </Canvas>

      {/* HUD */}
      <div
        className="absolute bottom-4 right-4 px-4 py-2 rounded-lg font-mono text-xs pointer-events-none"
        style={{
          background: "rgba(15, 23, 42, 0.65)",
          backdropFilter: "blur(8px)",
          color: "#94a3b8",
          border: "1px solid rgba(148,163,184,0.15)",
        }}
      >
        R3F · V2 · Kenney Assets
      </div>
    </div>
  );
}
