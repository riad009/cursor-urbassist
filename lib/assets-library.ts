/**
 * assets-library.ts — Type-Safe 3D Asset Mapping
 *
 * Maps SurfaceType → GLB path + fallback procedural config.
 * Every SurfaceType now has a unique, distinct ProceduralType so the 3D router
 * can dispatch to the correct Kenney/3D-Mapper-style premium component.
 *
 * Used by:
 *   - SitePlanEditorV2.tsx : tags Fabric objects with meshPath for 3D sync
 *   - TerrainDioramaScene.tsx : determine how each object renders in R3F
 */

import type { SurfaceType } from "@/store/useUrbAssistProjectStore";

// ─── Procedural Mesh Types ────────────────────────────────────────────────────

export type ProceduralType =
  | "house"     // White walls, terracotta hip-roof, accent bands, window grid
  | "garage"    // Grey multi-storey block, dome, orange pipes
  | "pool"      // Recessed basin, physical water, coping rim
  | "parking"   // Asphalt slab, lane markings, bollards
  | "garden"    // Dirt patch, blob trees, bushes
  | "terrace"   // Oak deck, rail posts, patio table
  | "access"    // Grey path, kerb edges, centre dashes
  | "generic";  // Simple box (absolute last resort)

// ─── Asset Descriptor ─────────────────────────────────────────────────────────

export interface AssetDescriptor {
  /** Path to GLB in /public — used when the file actually exists */
  glbPath: string | null;
  /** Fallback tint + 2D canvas fill colour */
  color: string;
  /** Default real-world dimensions [width, height, depth] in meters */
  defaultMeters: [number, number, number];
  /** Procedural mesh type rendered when glbPath is null or fails */
  procedural: ProceduralType;
  /** Human-readable label (French) */
  label: string;
  /** Semi-transparent fill used in the 2D Fabric canvas */
  canvasFill: string;
}

// ─── The Library ──────────────────────────────────────────────────────────────

export const ASSET_LIBRARY: Record<SurfaceType, AssetDescriptor> = {
  house: {
    glbPath: null,
    color: "#F5F5F0",
    defaultMeters: [8, 5, 6],
    procedural: "house",
    label: "Maison",
    canvasFill: "rgba(245,158,11,0.28)",
  },
  garage: {
    glbPath: null,
    color: "#B0B0AA",
    defaultMeters: [10, 8, 7],
    procedural: "garage",
    label: "Garage / Grand bâtiment",
    canvasFill: "rgba(100,116,139,0.28)",
  },
  pool: {
    glbPath: null,
    color: "#3A8FD4",
    defaultMeters: [5, 0.5, 3],
    procedural: "pool",
    label: "Piscine",
    canvasFill: "rgba(56,189,248,0.35)",
  },
  parking: {
    glbPath: null,
    color: "#3D4652",
    defaultMeters: [12, 0.1, 6],
    procedural: "parking",
    label: "Parking",
    canvasFill: "rgba(71,85,105,0.30)",
  },
  garden: {
    glbPath: null,
    color: "#2E9E8A",
    defaultMeters: [8, 0, 6],
    procedural: "garden",
    label: "Jardin",
    canvasFill: "rgba(34,197,94,0.35)",
  },
  terrace: {
    glbPath: null,
    color: "#C87D2C",
    defaultMeters: [6, 0.2, 5],
    procedural: "terrace",
    label: "Terrasse",
    canvasFill: "rgba(217,119,6,0.30)",
  },
  access: {
    glbPath: null,
    color: "#6B7280",
    defaultMeters: [4, 0.05, 8],
    procedural: "access",
    label: "Accès / Voie",
    canvasFill: "rgba(107,114,128,0.30)",
  },
  vrd: {
    glbPath: null,
    color: "#6366F1",
    defaultMeters: [0.4, 1.2, 0.4],
    procedural: "access",    // renders as a small marker — closest visual match
    label: "Réseau VRD",
    canvasFill: "rgba(99,102,241,0.35)",
  },
  boundary: {
    glbPath: null,
    color: "#10B981",
    defaultMeters: [0, 0, 0],
    procedural: "generic",
    label: "Limite parcelle",
    canvasFill: "transparent",
  },
  other: {
    glbPath: null,
    color: "#94A3B8",
    defaultMeters: [6, 3, 6],
    procedural: "generic",
    label: "Forme libre",
    canvasFill: "rgba(148,163,184,0.30)",
  },
} as const;

// ─── Utility Helpers ──────────────────────────────────────────────────────────

export function getAssetDescriptor(type: SurfaceType): AssetDescriptor {
  return ASSET_LIBRARY[type] ?? ASSET_LIBRARY.other;
}

export function getGlbPath(type: SurfaceType): string | null {
  return ASSET_LIBRARY[type]?.glbPath ?? null;
}

export function getCanvasFill(type: SurfaceType): string {
  return ASSET_LIBRARY[type]?.canvasFill ?? ASSET_LIBRARY.other.canvasFill;
}
