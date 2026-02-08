"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

export interface Building3DModel {
  width: number;
  depth: number;
  wallHeights: Record<string, number>;
  roof: { type: string; pitch: number; overhang?: number };
  materials: Record<string, string>;
}

interface Building3DViewerProps {
  model: Building3DModel;
  className?: string;
  onInteractionHint?: (hint: string) => void;
}

export function Building3DViewer({ model, className, onInteractionHint }: Building3DViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovering, setHovering] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controlsRef = useRef<{ resetCamera: () => void; zoomIn: () => void; zoomOut: () => void } | null>(null);

  useEffect(() => {
    if (!containerRef.current || !model) return;
    let frameId = 0;
    let cleanup: (() => void) | undefined;
    let orbitControls: { update: () => void; reset: () => void; target: { set: (x: number, y: number, z: number) => void }; object: { position: { set: (x: number, y: number, z: number) => void }; zoomIn: () => void; zoomOut: () => void } };

    const init = async () => {
      const container = containerRef.current;
      if (!container) return;
      try {
        const THREE = await import("three");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");

        const width = container.clientWidth || 800;
        const height = Math.max(400, container.clientHeight || 500);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xdce1e8);
        scene.fog = new THREE.Fog(0xdce1e8, 45, 95);
        scene.environment = null;

        const camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 500);
        const dist = Math.max(model.width ?? 12, model.depth ?? 10) * 1.8;
        camera.position.set(dist * 0.7, dist * 0.5, dist * 0.7);
        camera.lookAt(0, 4, 0);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio : 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        container.innerHTML = "";
        container.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = 5;
        controls.maxDistance = 120;
        controls.maxPolarAngle = Math.PI / 2 - 0.05;
        controls.target.set(0, 0, 0);

        const gh = model.wallHeights?.ground ?? 3;
        const fh = model.wallHeights?.first ?? 0;
        const sh = model.wallHeights?.second ?? 0;
        const totalHeight = gh + fh + sh;
        const w = model.width ?? 12;
        const d = model.depth ?? 10;
        const roofType = model.roof?.type ?? "gable";
        const pitch = (model.roof?.pitch ?? 35) * (Math.PI / 180);
        const overhang = model.roof?.overhang ?? 0.5;

        const boxGeom = new THREE.BoxGeometry(w, totalHeight, d);
        const boxMat = new THREE.MeshStandardMaterial({
          color: 0xe8e4dc,
          emissive: 0x0a0806,
          roughness: 0.9,
          metalness: 0,
          flatShading: false,
        });
        const box = new THREE.Mesh(boxGeom, boxMat);
        box.position.y = totalHeight / 2;
        box.castShadow = true;
        box.receiveShadow = true;
        box.name = "building";

        const buildingGroup = new THREE.Group();
        buildingGroup.add(box);

        const winW = Math.min(1.2, w * 0.12);
        const winH = Math.min(1.4, (gh || 3) * 0.4);
        const floorHeights = [gh, fh, sh].filter((h) => h > 0);
        const winGlassMat = new THREE.MeshStandardMaterial({
          color: 0x2a3f4f,
          roughness: 0.15,
          metalness: 0.35,
          emissive: 0x0a1628,
        });
        const winFrameMat = new THREE.MeshStandardMaterial({
          color: 0xf5f5f0,
          roughness: 0.85,
          metalness: 0.02,
        });
        const frameThick = 0.08;

        const glassOff = frameThick / 2 + 0.01;
        function addWindow(px: number, py: number, pz: number, rotY: number, nX: number, nZ: number) {
          const frameOuter = new THREE.BoxGeometry(winW + frameThick * 2, winH + frameThick * 2, frameThick);
          const frameMesh = new THREE.Mesh(frameOuter, winFrameMat);
          frameMesh.position.set(px, py, pz);
          frameMesh.rotation.y = rotY;
          frameMesh.castShadow = true;
          frameMesh.receiveShadow = true;
          buildingGroup.add(frameMesh);
          const glassGeom = new THREE.PlaneGeometry(winW, winH);
          const glassMesh = new THREE.Mesh(glassGeom, winGlassMat);
          glassMesh.position.set(px + nX * glassOff, py, pz + nZ * glassOff);
          glassMesh.rotation.y = rotY;
          glassMesh.receiveShadow = true;
          buildingGroup.add(glassMesh);
        }

        const nWinX = w > 10 ? 3 : 2;
        const nWinZ = d > 10 ? 3 : 2;
        for (let fi = 0; fi < floorHeights.length; fi++) {
          const floorBase = floorHeights.slice(0, fi).reduce((a, b) => a + b, 0);
          const floorH = floorHeights[fi];
          const cy = floorBase + floorH / 2;
          for (let i = 0; i < nWinX; i++) {
            const cx = (i + 1) / (nWinX + 1) * w - w / 2;
            addWindow(cx, cy, d / 2 + 0.02, 0, 0, 1);
            addWindow(cx, cy, -d / 2 - 0.02, Math.PI, 0, -1);
          }
          for (let i = 0; i < nWinZ; i++) {
            const cz = (i + 1) / (nWinZ + 1) * d - d / 2;
            addWindow(w / 2 + 0.02, cy, cz, -Math.PI / 2, 1, 0);
            addWindow(-w / 2 - 0.02, cy, cz, Math.PI / 2, -1, 0);
          }
        }
        scene.add(buildingGroup);

        if (roofType === "flat") {
          const flatGeom = new THREE.BoxGeometry(w + overhang * 2, 0.25, d + overhang * 2);
          const roofMat = new THREE.MeshStandardMaterial({
            color: 0x5c5c5c,
            roughness: 0.92,
            metalness: 0.05,
          });
          const roofMesh = new THREE.Mesh(flatGeom, roofMat);
          roofMesh.position.set(0, totalHeight + 0.125, 0);
          roofMesh.castShadow = true;
          roofMesh.receiveShadow = true;
          scene.add(roofMesh);
        } else if (roofType === "gable") {
          const roofHeight = (w / 2) * Math.tan(pitch);
          const halfW = w / 2 + overhang;
          const halfD = d / 2 + overhang;
          const geom = new THREE.BufferGeometry();
          const vertices = new Float32Array([
            -halfW, totalHeight, -halfD,
            halfW, totalHeight, -halfD,
            0, totalHeight + roofHeight, 0,
            halfW, totalHeight, -halfD,
            halfW, totalHeight, halfD,
            0, totalHeight + roofHeight, 0,
            halfW, totalHeight, halfD,
            -halfW, totalHeight, halfD,
            0, totalHeight + roofHeight, 0,
            -halfW, totalHeight, halfD,
            -halfW, totalHeight, -halfD,
            0, totalHeight + roofHeight, 0,
          ]);
          const normals = new Float32Array(vertices.length);
          for (let i = 0; i < vertices.length; i += 9) {
            const ax = vertices[i + 3] - vertices[i];
            const ay = vertices[i + 4] - vertices[i + 1];
            const az = vertices[i + 5] - vertices[i + 2];
            const bx = vertices[i + 6] - vertices[i];
            const by = vertices[i + 7] - vertices[i + 1];
            const bz = vertices[i + 8] - vertices[i + 2];
            let nx = ay * bz - az * by;
            let ny = az * bx - ax * bz;
            let nz = ax * by - ay * bx;
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
            nx /= len; ny /= len; nz /= len;
            normals[i] = nx; normals[i + 1] = ny; normals[i + 2] = nz;
            normals[i + 3] = nx; normals[i + 4] = ny; normals[i + 5] = nz;
            normals[i + 6] = nx; normals[i + 7] = ny; normals[i + 8] = nz;
          }
          geom.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
          geom.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
          geom.computeVertexNormals();
          const roofMat = new THREE.MeshStandardMaterial({
            color: 0x7d4e2e,
            roughness: 0.9,
            metalness: 0.03,
            emissive: 0x0a0604,
          });
          const roofMesh = new THREE.Mesh(geom, roofMat);
          roofMesh.castShadow = true;
          roofMesh.receiveShadow = true;
          scene.add(roofMesh);
        } else {
          const roofHeight = (Math.max(w, d) / 2) * Math.tan(pitch);
          const size = Math.sqrt(w * w + d * d) / 2 + overhang;
          const roofGeom = new THREE.ConeGeometry(size, roofHeight, roofType === "hip" ? 4 : 4);
          const roofMat = new THREE.MeshStandardMaterial({
            color: 0x7d4e2e,
            roughness: 0.9,
            metalness: 0.03,
            emissive: 0x0a0604,
          });
          const roofMesh = new THREE.Mesh(roofGeom, roofMat);
          roofMesh.rotation.y = Math.PI / 4;
          roofMesh.position.set(0, totalHeight + roofHeight / 2, 0);
          roofMesh.castShadow = true;
          scene.add(roofMesh);
        }

        const dirLight = new THREE.DirectionalLight(0xfffaf0, 1.3);
        dirLight.position.set(20, 35, 15);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 100;
        dirLight.shadow.camera.left = -35;
        dirLight.shadow.camera.right = 35;
        dirLight.shadow.camera.top = 35;
        dirLight.shadow.camera.bottom = -35;
        dirLight.shadow.bias = -0.0002;
        scene.add(dirLight);

        const fillLight = new THREE.DirectionalLight(0xb8c4d4, 0.5);
        fillLight.position.set(-12, 15, -8);
        scene.add(fillLight);
        const rimLight = new THREE.DirectionalLight(0xf0f4f8, 0.25);
        rimLight.position.set(-5, 8, 15);
        scene.add(rimLight);
        scene.add(new THREE.AmbientLight(0xa8b4c4, 0.6));

        const plotSize = 60;
        const groundGeom = new THREE.PlaneGeometry(plotSize, plotSize, 32, 32);
        const groundMat = new THREE.MeshStandardMaterial({
          color: 0x4a7c4e,
          roughness: 0.95,
          metalness: 0,
          flatShading: false,
        });
        const ground = new THREE.Mesh(groundGeom, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        const paveW = w + 4;
        const paveD = d + 4;
        const paveGeom = new THREE.PlaneGeometry(paveW, paveD);
        const paveMat = new THREE.MeshStandardMaterial({
          color: 0x7d7d7d,
          roughness: 0.92,
          metalness: 0.02,
        });
        const paving = new THREE.Mesh(paveGeom, paveMat);
        paving.rotation.x = -Math.PI / 2;
        paving.position.y = 0.005;
        paving.receiveShadow = true;
        scene.add(paving);

        const footprintGeom = new THREE.PlaneGeometry(w, d);
        const footprintMat = new THREE.MeshStandardMaterial({
          color: 0x6b6b6b,
          roughness: 0.9,
          metalness: 0,
        });
        const footprint = new THREE.Mesh(footprintGeom, footprintMat);
        footprint.rotation.x = -Math.PI / 2;
        footprint.position.y = 0.01;
        footprint.receiveShadow = true;
        scene.add(footprint);

        const northArrowGeom = new THREE.ConeGeometry(0.25, 0.7, 8);
        const northArrowMat = new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.6 });
        const northArrow = new THREE.Mesh(northArrowGeom, northArrowMat);
        northArrow.rotation.x = Math.PI / 2;
        northArrow.position.set(0, 0.36, -d / 2 - 2);
        northArrow.castShadow = true;
        scene.add(northArrow);

        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        controlsRef.current = {
          resetCamera() {
            const dist = Math.max(w, d) * 1.8;
            camera.position.set(dist * 0.7, dist * 0.5, dist * 0.7);
            controls.target.set(0, 0, 0);
          },
          zoomIn() {
            camera.position.multiplyScalar(0.85);
          },
          zoomOut() {
            camera.position.multiplyScalar(1.18);
          },
        };

        const containerEl = container;
        function onPointerMove(event: MouseEvent) {
          if (!containerEl.contains(event.target as Node)) return;
          const rect = containerEl.getBoundingClientRect();
          mouse.x = ((event.clientX - rect.left) / width) * 2 - 1;
          mouse.y = -((event.clientY - rect.top) / height) * 2 + 1;
          raycaster.setFromCamera(mouse, camera);
          const intersects = raycaster.intersectObject(buildingGroup, true);
          const hit = intersects.length > 0;
          setHovering(hit);
          const mat = boxMat as { emissive?: { setHex: (n: number) => void } };
          if (mat.emissive) mat.emissive.setHex(hit ? 0x0f1820 : 0x0a0806);
        }

        function onDoubleClick() {
          if (!containerEl.contains(document.activeElement)) return;
          controls.target.set(0, totalHeight / 2, 0);
          const dist = Math.max(w, d) * 1.2;
          camera.position.set(dist, totalHeight / 2 + dist * 0.4, dist);
        }

        containerEl.addEventListener("pointermove", onPointerMove);
        renderer.domElement.addEventListener("dblclick", onDoubleClick);

        function animate() {
          frameId = requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        }
        animate();
        setIsReady(true);

        const resizeObserver = new ResizeObserver(() => {
          const c = containerRef.current;
          if (!c) return;
          const ww = c.clientWidth;
          const hh = Math.max(400, c.clientHeight);
          camera.aspect = ww / hh;
          camera.updateProjectionMatrix();
          renderer.setSize(ww, hh);
        });
        resizeObserver.observe(containerEl);

        cleanup = () => {
          cancelAnimationFrame(frameId);
          resizeObserver.disconnect();
          containerEl.removeEventListener("pointermove", onPointerMove);
          renderer.domElement.removeEventListener("dblclick", onDoubleClick);
          renderer.dispose();
          boxGeom.dispose();
          boxMat.dispose();
        };
      } catch (e) {
        setError(e instanceof Error ? e.message : "3D failed to load");
      }
    };

    init();
    return () => {
      cleanup?.();
      controlsRef.current = null;
    };
  }, [model]);

  const resetCamera = useCallback(() => {
    controlsRef.current?.resetCamera();
  }, []);
  const zoomIn = useCallback(() => {
    controlsRef.current?.zoomIn();
  }, []);
  const zoomOut = useCallback(() => {
    controlsRef.current?.zoomOut();
  }, []);

  return (
    <div className={cn("relative", className)}>
      <div
        ref={containerRef}
        className="w-full min-h-[70vh] bg-slate-900 rounded-b-xl overflow-hidden cursor-grab active:cursor-grabbing"
      />
      {isReady && (
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
          <p className="text-xs text-slate-400 bg-slate-900/80 px-2 py-1 rounded">
            Drag to rotate · Scroll to zoom · Right-drag to pan · Double-click to focus
          </p>
        </div>
      )}
      <div className="absolute top-3 right-3 flex flex-col gap-1 pointer-events-auto">
        <button
          type="button"
          onClick={zoomIn}
          className="p-2 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-white border border-white/10"
          title="Zoom in"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={zoomOut}
          className="p-2 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-white border border-white/10"
          title="Zoom out"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <button
          type="button"
          onClick={resetCamera}
          className="p-2 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-white border border-white/10"
          title="Reset view"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
      {hovering && (
        <div className="absolute top-3 left-3 px-2 py-1 rounded bg-amber-500/20 text-amber-400 text-xs pointer-events-none">
          Building · Double-click to focus
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
