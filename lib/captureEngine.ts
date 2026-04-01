/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Enterprise Document Capture Engine — UrbAssist
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Memory-safe capture pipeline converting Fabric.js 2D canvases and Three.js
 * WebGL renders to Blob URLs (NOT raw Base64). Supports orthographic facade
 * captures for legally compliant French building permits (PC3/PC5.2).
 *
 * ALL public functions return `blob:` URLs via `URL.createObjectURL()`.
 * Callers MUST revoke URLs via `URL.revokeObjectURL()` when no longer needed.
 *
 * ─── MANDATE 1 FIX: Bounding-box calculation EXCLUDES the sky dome ──────────
 * The sky dome sphere (radius=5000) was polluting `Box3.setFromObject(scene)`,
 * making the frustum gigantic and the user geometry invisible (a tiny dot).
 * We now iterate scene children, skip sky/helper/light objects, and compute
 * the bounding box ONLY from real meshes (terrain, buildings, pools, etc.).
 *
 * ─── MANDATE 2 FIX: Fabric.js white background ─────────────────────────────
 * `fabric.Canvas.toDataURL()` exports transparent pixels by default. When
 * displayed on a dark/system background the image looks black. We now paint
 * a temporary white `fabric.Rect` behind everything before capture.
 */

import * as THREE from 'three';

// ─── Blob URL Utilities ─────────────────────────────────────────────────────

/** Convert an HTMLCanvasElement to a Blob URL (memory-safe, async) */
export function canvasToBlobUrl(
  canvas: HTMLCanvasElement,
  type = 'image/png',
  quality = 0.92
): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('[captureEngine] canvas.toBlob returned null'));
        resolve(URL.createObjectURL(blob));
      },
      type,
      quality
    );
  });
}

// ─── 2D Fabric.js Capture ───────────────────────────────────────────────────

/**
 * Captures a Fabric.js canvas as a memory-safe Blob URL.
 *
 * MANDATE 2: Forces an opaque white background behind all objects so the
 * exported PNG is NEVER transparent (prevents black/dark backgrounds).
 *
 * @returns Blob URL string (e.g. `blob:http://localhost:3000/abc-123`)
 */
export async function captureFabricCanvas(
  fabricCanvas: any, // fabric.Canvas — typed as any to avoid import dependency
  multiplier = 1.5
): Promise<string> {
  fabricCanvas.discardActiveObject();
  fabricCanvas.renderAll();

  // ── MANDATE 2: Force white background ──────────────────────────────────
  // Save original background, set white, capture, then restore.
  const originalBg = fabricCanvas.backgroundColor;
  fabricCanvas.backgroundColor = '#ffffff';
  fabricCanvas.renderAll();

  const dataURL: string = fabricCanvas.toDataURL({
    format: 'png',
    multiplier,
  });

  // Restore original background immediately
  fabricCanvas.backgroundColor = originalBg;
  fabricCanvas.renderAll();

  // Convert Base64 dataURL → Blob → Blob URL (never store the raw base64)
  const resp = await fetch(dataURL);
  const blob = await resp.blob();
  return URL.createObjectURL(blob);
}

// ─── 3D Three.js Captures ───────────────────────────────────────────────────

export type CaptureAngle = 'front' | 'side' | 'top' | 'perspective';

interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  buildingsGroup?: THREE.Group;
}

/**
 * Compute a bounding box from ONLY the user-relevant geometry.
 *
 * MANDATE 1 (REVISED): Prioritize the `buildingsGroup` so the camera rigidly
 * frames the user's structures. The terrain slab is hundreds of meters wide
 * and dwarves the buildings. If we frame the whole terrain, the buildings are
 * too small. By framing ONLY the buildings, we get a tight, zoomed-in shot
 * perfect for facade/section views.
 */
function computeContentBoundingBox(ctx: SceneContext): THREE.Box3 {
  const bbox = new THREE.Box3();

  // 1. FAST PATH: If we have explicit buildings, frame them directly!
  // This ignores the massive terrain mesh entirely.
  if (ctx.buildingsGroup && ctx.buildingsGroup.children.length > 0) {
    bbox.setFromObject(ctx.buildingsGroup);
    if (!bbox.isEmpty()) {
      return bbox;
    }
  }

  // 2. FALLBACK: If no buildings exist, fallback to traversing the scene
  // but skipping sky domes, helpers, and sprites.
  let hasContent = false;
  ctx.scene.traverse((obj) => {
    // Skip non-mesh objects (lights, cameras, helpers, sprites)
    if (!(obj instanceof THREE.Mesh) && !(obj instanceof THREE.Group)) return;

    // Skip if it's a Group without geometry (just a container)
    if (obj instanceof THREE.Group) return;

    const mesh = obj as THREE.Mesh;

    // Skip sky dome: SphereGeometry with huge radius (> 1000)
    if (mesh.geometry instanceof THREE.SphereGeometry) {
      const params = (mesh.geometry as THREE.SphereGeometry).parameters;
      if (params && params.radius > 1000) return;
    }

    // Skip objects with BackSide material (sky dome shaders)
    const mat = mesh.material;
    if (mat && !Array.isArray(mat) && (mat as THREE.Material).side === THREE.BackSide) return;

    // Skip objects with depthWrite=false that have huge geometry (sky helpers)
    if (mat && !Array.isArray(mat) && !(mat as THREE.Material).depthWrite) {
      const geoBox = new THREE.Box3().setFromObject(mesh);
      const geoSize = geoBox.getSize(new THREE.Vector3());
      if (Math.max(geoSize.x, geoSize.y, geoSize.z) > 2000) return;
    }

    // This is real content — expand bbox
    const objBox = new THREE.Box3().setFromObject(mesh);
    if (!objBox.isEmpty()) {
      bbox.union(objBox);
      hasContent = true;
    }
  });

  // Fallback 3: if we found nothing, use the whole scene (shouldn't happen)
  if (!hasContent) {
    bbox.setFromObject(ctx.scene);
  }

  return bbox;
}

/**
 * Captures the active Three.js scene from an orthographic angle.
 *
 * MANDATE 1: Computes bounding box ONLY from user-placed geometry (terrain,
 * buildings, pools, gardens) — NOT from the sky dome or helper objects.
 * Creates a temporary OrthographicCamera, positions it to frame the content
 * tightly with controlled padding, renders a single frame to a clean white
 * background (no sky dome), captures as Blob URL, then restores everything.
 */
export async function capture3DOrthographic(
  ctx: SceneContext,
  angle: CaptureAngle = 'front'
): Promise<string> {
  const { renderer, scene, camera: originalCamera } = ctx;
  const size = renderer.getSize(new THREE.Vector2());

  // ── MANDATE 1: Content-only bounding box ───────────────────────────────
  const bbox = computeContentBoundingBox(ctx);
  const center = bbox.getCenter(new THREE.Vector3());
  const bboxSize = bbox.getSize(new THREE.Vector3());
  const maxDim = Math.max(bboxSize.x, bboxSize.y, bboxSize.z, 1);
  const padding = maxDim * 0.15; // Tight 15% padding

  // Orthographic camera frustum — tight framing
  const aspect = size.x / size.y;
  const frustumHalf = (maxDim + padding * 2) / 2;
  const ortho = new THREE.OrthographicCamera(
    -frustumHalf * aspect,
    frustumHalf * aspect,
    frustumHalf,
    -frustumHalf,
    0.01,
    maxDim * 10
  );

  // Position based on angle — offset from content center
  const d = maxDim * 3;
  switch (angle) {
    case 'front':
      ortho.position.set(center.x, center.y, center.z + d);
      break;
    case 'side':
      ortho.position.set(center.x + d, center.y, center.z);
      break;
    case 'top':
      ortho.position.set(center.x, center.y + d, center.z);
      ortho.up.set(0, 0, -1); // Look down with Z as "forward"
      break;
    case 'perspective':
      ortho.position.set(center.x + d * 0.5, center.y + d * 0.5, center.z + d * 0.5);
      break;
  }
  ortho.lookAt(center);
  ortho.updateProjectionMatrix();

  // ── Temporarily hide sky dome and set clean white background ───────────
  const originalBg = scene.background;
  scene.background = new THREE.Color(0xffffff);

  // Hide sky dome meshes during capture
  const hiddenObjects: THREE.Object3D[] = [];
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mesh = obj as THREE.Mesh;
    // Hide sky dome sphere
    if (mesh.geometry instanceof THREE.SphereGeometry) {
      const params = (mesh.geometry as THREE.SphereGeometry).parameters;
      if (params && params.radius > 1000) {
        mesh.visible = false;
        hiddenObjects.push(mesh);
      }
    }
    // Hide BackSide shader materials (sky dome)
    const mat = mesh.material;
    if (mat && !Array.isArray(mat) && (mat as THREE.Material).side === THREE.BackSide) {
      mesh.visible = false;
      hiddenObjects.push(mesh);
    }
  });

  // Render one frame with ortho camera + white background
  renderer.render(scene, ortho);

  // Capture as Blob URL
  const blobUrl = await canvasToBlobUrl(renderer.domElement);

  // ── RESTORE everything ─────────────────────────────────────────────────
  scene.background = originalBg;
  hiddenObjects.forEach((obj) => { obj.visible = true; });

  // Re-render with original camera so the viewport isn't corrupted
  renderer.render(scene, originalCamera);

  return blobUrl;
}

/**
 * Captures the current perspective view of the 3D scene (as-is).
 * Simpler than orthographic — just snapshots the current render.
 */
export async function capture3DPerspective(ctx: SceneContext): Promise<string> {
  const { renderer, scene, camera } = ctx;
  renderer.render(scene, camera);
  return canvasToBlobUrl(renderer.domElement);
}

// ─── PC1: Static Map (OSM) ─────────────────────────────────────────────────

/**
 * Generates a static map URL for PC1 (Plan de Situation) using OSM.
 * Returns a direct image URL at neighborhood zoom level.
 */
export function getStaticMapUrl(
  lat: number,
  lng: number,
  zoom = 15,
  width = 800,
  height = 500
): string {
  // Free open-source static map renderer — no API key required
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${width}x${height}&maptype=mapnik&markers=${lat},${lng},red-pushpin`;
}

/**
 * Extracts centroid [lat, lng] from any GeoJSON geometry.
 * Handles Feature, Polygon, and MultiPolygon types.
 */
export function extractCentroid(
  geoJson: any
): { lat: number; lng: number } | null {
  try {
    if (!geoJson) return null;

    if (geoJson.type === 'Feature') return extractCentroid(geoJson.geometry);
    if (geoJson.type === 'FeatureCollection' && geoJson.features?.length) {
      return extractCentroid(geoJson.features[0]);
    }

    let coords: number[][] = [];
    if (geoJson.type === 'Polygon') {
      coords = geoJson.coordinates[0];
    } else if (geoJson.type === 'MultiPolygon') {
      coords = geoJson.coordinates[0][0];
    } else if (Array.isArray(geoJson.coordinates)) {
      coords = Array.isArray(geoJson.coordinates[0])
        ? geoJson.coordinates[0]
        : [geoJson.coordinates];
    }

    if (coords.length === 0) return null;

    const sumLng = coords.reduce((s, c) => s + (c[0] || 0), 0);
    const sumLat = coords.reduce((s, c) => s + (c[1] || 0), 0);

    return {
      lng: sumLng / coords.length,
      lat: sumLat / coords.length,
    };
  } catch {
    return null;
  }
}

// ─── Blob URL Cleanup ───────────────────────────────────────────────────────

/**
 * Revokes all Blob URLs in a record to free browser memory.
 * Call this when navigating away from the document viewer.
 */
export function revokeAllBlobUrls(docs: Record<string, string | null>): void {
  for (const url of Object.values(docs)) {
    if (url && url.startsWith('blob:')) {
      try { URL.revokeObjectURL(url); } catch { /* already revoked */ }
    }
  }
}
