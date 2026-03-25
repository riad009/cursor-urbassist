/**
 * AltimetrySculptor.ts — High-Performance 3D Terrain Sculpting Engine
 *
 * ARCHITECTURE:
 *   This module provides standalone functions that attach sculpting behavior
 *   to an existing imperative Three.js terrain mesh. It is NOT a React component
 *   because our Terrain3DViewer uses raw Three.js (not R3F).
 *
 * PERFORMANCE CONTRACT:
 *   - pointerMove: ZERO React re-renders. All vertex manipulation is done by
 *     directly mutating the geometry.attributes.position buffer array and
 *     flagging .needsUpdate = true.
 *   - pointerUp: Single Zustand store commit (pushes delta snapshot to undo stack).
 *   - Raycasting uses a reusable Raycaster + Vector2 to avoid GC pressure.
 *
 * HOW IT WORKS:
 *   1. attachSculptHandlers() is called once after the terrain mesh is created.
 *   2. It registers pointerdown/pointermove/pointerup handlers on the canvas element.
 *   3. On pointerDown in sculpt mode: raycast → find nearest vertex → start drag.
 *   4. On pointerMove during drag: compute Y delta from mouse movement,
 *      apply to vertices within brush radius via direct buffer mutation.
 *   5. On pointerUp: commit accumulated deltas to the Zustand store.
 *   6. On hover (pointerMove, not dragging): update cursor position for visual feedback.
 *
 * VERTEX INDEX LAYOUT:
 *   The terrain is a PlaneGeometry(width, depth, GRID_RES, GRID_RES) rotated -90° on X.
 *   After rotation: X=East, Y=Elevation, Z=Depth.
 *   Grid has (GRID_RES+1)² vertices. Index = row * (GRID_RES+1) + col.
 */

import * as THREE from "three";
import { useSculptStore, type SculptBrushConfig } from "@/store/useSculptStore";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TerrainSculptContext {
  /** The terrain mesh with PlaneGeometry */
  terrainMesh: THREE.Mesh;
  /** The WebGL renderer */
  renderer: THREE.WebGLRenderer;
  /** The perspective camera */
  camera: THREE.PerspectiveCamera;
  /** Grid resolution (e.g. 128 → 129×129 vertices) */
  gridRes: number;
  /** Base elevation exaggeration factor */
  baseExag: number;
  /** Minimum raw elevation from API data */
  minElev: number;
  /** Elevation range from API data */
  elevRange: number;
  /**
   * Optional: mesh for the visual sculpt cursor.
   * If provided, its position will be updated on hover.
   */
  cursorMesh?: THREE.Mesh;
  /**
   * Optional: mesh for the brush radius ring.
   * If provided, its scale and position will be updated on hover.
   */
  brushRingMesh?: THREE.Mesh;
}

interface DragState {
  isDragging: boolean;
  /** Y screen coordinate on pointerDown — used to compute drag delta */
  startScreenY: number;
  /** The vertex index at the center of the drag */
  centerVertexIndex: number;
  /** Snapshot of Y values for all affected vertices at drag start */
  startYValues: Map<number, number>;
  /** Accumulated delta entries for this drag operation */
  accumulatedDeltas: Map<number, number>;
}

// ─── Reusable objects (zero allocation in hot path) ─────────────────────────

const _raycaster = new THREE.Raycaster();
const _mouse = new THREE.Vector2();
const _tempVec3 = new THREE.Vector3();

// ─── Core: Find nearest vertex to a raycast intersection ────────────────────

/**
 * Given a raycaster intersection on a PlaneGeometry terrain mesh,
 * find the index of the nearest vertex in the position buffer.
 *
 * We use the intersected face's vertex indices (a, b, c) and pick
 * the one closest to the intersection point. This is O(1) per click.
 */
function findNearestVertexIndex(
  intersection: THREE.Intersection,
  posAttr: THREE.BufferAttribute
): number {
  const face = intersection.face;
  if (!face) return -1;

  const point = intersection.point;
  // The mesh may have a world transform — we need local-space point
  const localPoint = intersection.object.worldToLocal(point.clone());

  let bestIdx = face.a;
  let bestDist = Infinity;

  for (const idx of [face.a, face.b, face.c]) {
    const vx = posAttr.getX(idx);
    const vy = posAttr.getY(idx);
    const vz = posAttr.getZ(idx);
    const d =
      (localPoint.x - vx) ** 2 +
      (localPoint.y - vy) ** 2 +
      (localPoint.z - vz) ** 2;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = idx;
    }
  }

  return bestIdx;
}

// ─── Core: Get vertices within brush radius ─────────────────────────────────

/**
 * Returns all vertex indices within the brush radius of the center vertex,
 * along with their falloff weight (0–1).
 *
 * Uses the XZ plane distance (horizontal) for radius check, since
 * we're sculpting elevation (Y axis).
 */
function getVerticesInBrush(
  centerIdx: number,
  posAttr: THREE.BufferAttribute,
  brush: SculptBrushConfig,
  gridRes: number
): Array<{ index: number; weight: number }> {
  const result: Array<{ index: number; weight: number }> = [];
  const gridN = gridRes + 1;
  const cx = posAttr.getX(centerIdx);
  const cz = posAttr.getZ(centerIdx);
  const r = brush.radius;
  const rSq = r * r;

  // Compute how many grid cells the brush radius covers
  // PlaneGeometry lays out vertices in a regular grid, so spacing = planeWidth / gridRes
  // We approximate: check a square region around the center vertex
  const centerCol = centerIdx % gridN;
  const centerRow = Math.floor(centerIdx / gridN);

  // Estimate grid spacing from neighbors (handles non-square planes)
  let gridSpacingX = 1;
  let gridSpacingZ = 1;
  if (centerCol < gridRes) {
    gridSpacingX = Math.abs(posAttr.getX(centerIdx + 1) - cx) || 1;
  }
  if (centerRow < gridRes) {
    gridSpacingZ = Math.abs(posAttr.getZ(centerIdx + gridN) - cz) || 1;
  }

  const cellsX = Math.ceil(r / gridSpacingX) + 1;
  const cellsZ = Math.ceil(r / gridSpacingZ) + 1;

  for (let dr = -cellsZ; dr <= cellsZ; dr++) {
    for (let dc = -cellsX; dc <= cellsX; dc++) {
      const row = centerRow + dr;
      const col = centerCol + dc;
      if (row < 0 || row >= gridN || col < 0 || col >= gridN) continue;

      const idx = row * gridN + col;
      const vx = posAttr.getX(idx);
      const vz = posAttr.getZ(idx);
      const distSq = (vx - cx) ** 2 + (vz - cz) ** 2;

      if (distSq <= rSq) {
        const dist = Math.sqrt(distSq);
        let weight: number;
        if (brush.falloff === "smooth") {
          // Gaussian bell: w = exp(-3 * (d/r)²) — smooth falloff
          const t = dist / r;
          weight = Math.exp(-3.0 * t * t);
        } else {
          // Linear cone: w = 1 - d/r
          weight = 1.0 - dist / r;
        }
        result.push({ index: idx, weight: Math.max(0, weight) });
      }
    }
  }

  return result;
}

// ─── Apply deltas to geometry buffer (HOT PATH — zero allocation) ───────────

/**
 * Directly mutate the position buffer to apply elevation changes.
 * This is the performance-critical function — called on every pointerMove.
 *
 * @param posAttr - The geometry.attributes.position buffer
 * @param startYValues - Y values at drag start (baseline)
 * @param deltaEntries - Map of vertex index → absolute delta from drag start
 */
function applyDeltasToBuffer(
  posAttr: THREE.BufferAttribute,
  startYValues: Map<number, number>,
  deltaEntries: Map<number, number>
): void {
  for (const [idx, delta] of deltaEntries) {
    const baseY = startYValues.get(idx);
    if (baseY !== undefined) {
      posAttr.setY(idx, baseY + delta);
    }
  }
  posAttr.needsUpdate = true;
}

// ─── Update visual cursor position ──────────────────────────────────────────

function updateCursorPosition(
  ctx: TerrainSculptContext,
  intersection: THREE.Intersection,
  vertexIdx: number
): void {
  const posAttr = (ctx.terrainMesh.geometry as THREE.BufferGeometry).attributes
    .position as THREE.BufferAttribute;

  // Get vertex world position
  const vx = posAttr.getX(vertexIdx);
  const vy = posAttr.getY(vertexIdx);
  const vz = posAttr.getZ(vertexIdx);

  // Transform to world space
  _tempVec3.set(vx, vy, vz);
  ctx.terrainMesh.localToWorld(_tempVec3);

  const worldPos: [number, number, number] = [_tempVec3.x, _tempVec3.y, _tempVec3.z];

  // Update cursor mesh position
  if (ctx.cursorMesh) {
    ctx.cursorMesh.position.set(_tempVec3.x, _tempVec3.y + 0.15, _tempVec3.z);
    ctx.cursorMesh.visible = true;
  }

  // Update brush ring
  if (ctx.brushRingMesh) {
    const brush = useSculptStore.getState().brush;
    ctx.brushRingMesh.position.set(_tempVec3.x, _tempVec3.y + 0.05, _tempVec3.z);
    const ringScale = brush.radius;
    ctx.brushRingMesh.scale.set(ringScale, ringScale, ringScale);
    ctx.brushRingMesh.visible = true;
  }

  // Update store (for UI display) — use getState() to avoid triggering re-render
  useSculptStore.getState().setHoveredVertex(vertexIdx, worldPos);
}

// ─── Create visual cursor meshes ────────────────────────────────────────────

/**
 * Creates the sculpt cursor and brush ring meshes.
 * Returns them so the caller can add/remove from scene.
 */
export function createSculptCursorMeshes(): {
  cursor: THREE.Mesh;
  brushRing: THREE.Mesh;
} {
  // Cursor: small glowing sphere at the hovered vertex
  const cursorGeo = new THREE.SphereGeometry(0.25, 16, 16);
  const cursorMat = new THREE.MeshBasicMaterial({
    color: 0xff4444,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
  });
  const cursor = new THREE.Mesh(cursorGeo, cursorMat);
  cursor.visible = false;
  cursor.renderOrder = 999;

  // Brush ring: torus at ground level showing brush radius
  const ringGeo = new THREE.RingGeometry(0.9, 1.0, 64);
  ringGeo.rotateX(-Math.PI / 2); // Lay flat on XZ plane
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xff6644,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  const brushRing = new THREE.Mesh(ringGeo, ringMat);
  brushRing.visible = false;
  brushRing.renderOrder = 998;

  return { cursor, brushRing };
}

// ─── Main: Attach sculpt event handlers ─────────────────────────────────────

/**
 * Attaches pointerdown/pointermove/pointerup handlers to the renderer's canvas.
 * Returns a cleanup function that removes all handlers.
 *
 * CALL THIS ONCE after the terrain mesh is built in Terrain3DViewer.
 */
export function attachSculptHandlers(ctx: TerrainSculptContext): () => void {
  const canvas = ctx.renderer.domElement;
  const posAttr = (ctx.terrainMesh.geometry as THREE.BufferGeometry).attributes
    .position as THREE.BufferAttribute;

  // Drag state — mutable, never causes React re-render
  const drag: DragState = {
    isDragging: false,
    startScreenY: 0,
    centerVertexIndex: -1,
    startYValues: new Map(),
    accumulatedDeltas: new Map(),
  };

  // ── Helper: screen coords → normalized device coords ──
  function updateMouseNDC(e: PointerEvent): void {
    const rect = canvas.getBoundingClientRect();
    _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  // ── Helper: raycast terrain ──
  function raycastTerrain(): THREE.Intersection | null {
    _raycaster.setFromCamera(_mouse, ctx.camera);
    const hits = _raycaster.intersectObject(ctx.terrainMesh, false);
    return hits.length > 0 ? hits[0] : null;
  }

  // ── POINTER DOWN ──
  function onPointerDown(e: PointerEvent): void {
    if (!useSculptStore.getState().isSculptMode) return;
    if (e.button !== 0) return; // Left click only

    updateMouseNDC(e);
    const hit = raycastTerrain();
    if (!hit) return;

    const nearestIdx = findNearestVertexIndex(hit, posAttr);
    if (nearestIdx < 0) return;

    // Snapshot pre-drag state, save undo BEFORE the drag
    useSculptStore.getState().commitToUndo();

    // Get all vertices in brush radius
    const brush = useSculptStore.getState().brush;
    const affected = getVerticesInBrush(nearestIdx, posAttr, brush, ctx.gridRes);

    // Snapshot their current Y values
    drag.startYValues.clear();
    drag.accumulatedDeltas.clear();
    for (const { index } of affected) {
      drag.startYValues.set(index, posAttr.getY(index));
      drag.accumulatedDeltas.set(index, 0);
    }

    drag.isDragging = true;
    drag.startScreenY = e.clientY;
    drag.centerVertexIndex = nearestIdx;

    // Update selection in store
    useSculptStore.getState().setSelectedVertex(nearestIdx);

    // Prevent OrbitControls from consuming the drag
    e.stopPropagation();
    canvas.style.cursor = "ns-resize";

    // Capture pointer for reliable tracking
    canvas.setPointerCapture(e.pointerId);
  }

  // ── POINTER MOVE ──
  function onPointerMove(e: PointerEvent): void {
    const state = useSculptStore.getState();
    if (!state.isSculptMode) return;

    if (drag.isDragging) {
      // ── DRAG MODE: sculpt vertices ──
      // Compute Y delta from mouse movement (pixels → scene units)
      const pixelDelta = drag.startScreenY - e.clientY; // Up = positive
      const brush = state.brush;
      const baseDelta = pixelDelta * brush.strength;

      // Apply weighted delta to all affected vertices
      const affected = getVerticesInBrush(
        drag.centerVertexIndex,
        posAttr,
        brush,
        ctx.gridRes
      );

      for (const { index, weight } of affected) {
        const weightedDelta = baseDelta * weight;
        drag.accumulatedDeltas.set(index, weightedDelta);
      }

      // Mutate buffer directly — ZERO React re-renders
      applyDeltasToBuffer(posAttr, drag.startYValues, drag.accumulatedDeltas);

      // Recompute normals for correct lighting
      (ctx.terrainMesh.geometry as THREE.BufferGeometry).computeVertexNormals();

      e.stopPropagation();
    } else {
      // ── HOVER MODE: show cursor at nearest vertex ──
      updateMouseNDC(e);
      const hit = raycastTerrain();

      if (hit) {
        const nearestIdx = findNearestVertexIndex(hit, posAttr);
        if (nearestIdx >= 0) {
          updateCursorPosition(ctx, hit, nearestIdx);
          canvas.style.cursor = "crosshair";
        }
      } else {
        // No intersection — hide cursor
        if (ctx.cursorMesh) ctx.cursorMesh.visible = false;
        if (ctx.brushRingMesh) ctx.brushRingMesh.visible = false;
        state.setHoveredVertex(null);
        canvas.style.cursor = "grab";
      }
    }
  }

  // ── POINTER UP ──
  function onPointerUp(e: PointerEvent): void {
    if (!drag.isDragging) return;

    // Commit the accumulated deltas to the Zustand store
    const storeDeltas: [number, number][] = [];
    for (const [idx, delta] of drag.accumulatedDeltas) {
      if (Math.abs(delta) > 0.0001) {
        storeDeltas.push([idx, delta]);
      }
    }

    if (storeDeltas.length > 0) {
      // We already pushed to undo on pointerDown, so here we just
      // update the elevation deltas in the store
      useSculptStore.getState().applyBrushDeltas(storeDeltas);
    }

    // Reset drag state
    drag.isDragging = false;
    drag.startYValues.clear();
    drag.accumulatedDeltas.clear();
    drag.centerVertexIndex = -1;

    canvas.releasePointerCapture(e.pointerId);
    canvas.style.cursor = "crosshair";
  }

  // ── POINTER LEAVE ──
  function onPointerLeave(): void {
    if (ctx.cursorMesh) ctx.cursorMesh.visible = false;
    if (ctx.brushRingMesh) ctx.brushRingMesh.visible = false;
    useSculptStore.getState().setHoveredVertex(null);
  }

  // ── Register handlers ──
  // Use capture phase so we can stopPropagation before OrbitControls fires
  canvas.addEventListener("pointerdown", onPointerDown, { capture: true });
  canvas.addEventListener("pointermove", onPointerMove, { capture: true });
  canvas.addEventListener("pointerup", onPointerUp, { capture: true });
  canvas.addEventListener("pointerleave", onPointerLeave);

  // ── Return cleanup function ──
  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown, { capture: true } as EventListenerOptions);
    canvas.removeEventListener("pointermove", onPointerMove, { capture: true } as EventListenerOptions);
    canvas.removeEventListener("pointerup", onPointerUp, { capture: true } as EventListenerOptions);
    canvas.removeEventListener("pointerleave", onPointerLeave);

    // Hide cursors
    if (ctx.cursorMesh) ctx.cursorMesh.visible = false;
    if (ctx.brushRingMesh) ctx.brushRingMesh.visible = false;
  };
}

// ─── Utility: Rebuild terrain with stored deltas ────────────────────────────

/**
 * Apply all stored elevation deltas to the terrain mesh position buffer.
 * Call this when restoring terrain state (e.g., after 2D↔3D toggle).
 *
 * @param terrainMesh - The terrain mesh
 * @param deltas - The elevation deltas from useSculptStore
 */
export function applyStoredDeltas(
  terrainMesh: THREE.Mesh,
  deltas: Record<number, number>
): void {
  const posAttr = (terrainMesh.geometry as THREE.BufferGeometry).attributes
    .position as THREE.BufferAttribute;

  for (const [idxStr, delta] of Object.entries(deltas)) {
    const idx = Number(idxStr);
    if (idx >= 0 && idx < posAttr.count && Math.abs(delta) > 0.0001) {
      const currentY = posAttr.getY(idx);
      posAttr.setY(idx, currentY + delta);
    }
  }

  posAttr.needsUpdate = true;
  (terrainMesh.geometry as THREE.BufferGeometry).computeVertexNormals();
}

// ─── Utility: Get vertex world-space elevation ──────────────────────────────

/**
 * Returns the current Y (elevation) of a vertex in world space.
 * Useful for the UI panel to display "Current Elevation (NGF)".
 */
export function getVertexElevation(
  terrainMesh: THREE.Mesh,
  vertexIndex: number,
  baseExag: number,
  minElev: number
): number {
  const posAttr = (terrainMesh.geometry as THREE.BufferGeometry).attributes
    .position as THREE.BufferAttribute;

  if (vertexIndex < 0 || vertexIndex >= posAttr.count) return 0;

  const sceneY = posAttr.getY(vertexIndex);
  // Reverse the exaggeration: realElev = sceneY / exag + minElev
  return baseExag > 0 ? sceneY / baseExag + minElev : sceneY + minElev;
}
