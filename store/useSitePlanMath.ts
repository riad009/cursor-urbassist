/**
 * useSitePlanMath.ts — Real-Time Area Calculation Engine (Zustand Store)
 *
 * Manages the spatial math state for the Smart Editor:
 *   - Total parcel area (m²)
 *   - Existing building footprint area → CES existant
 *   - New building footprint area → CES projeté (existing + new)
 *   - Remaining buildable area based on PLU max CES
 *   - Green space, impermeable, and free space ratios
 *
 * ARCHITECTURE:
 *   - Pure Zustand store with computed getters via `get()`
 *   - No React hooks or Fabric.js imports — fully decoupled
 *   - Inputs are primitive arrays of building dimensions
 *   - Outputs are derived metrics recomputed on every state change
 *
 * INTEGRATION:
 *   - Fed by the site plan editor on canvas object:modified events
 *   - Consumed by the PLU compliance panel, surface tables, and PC4 generator
 *   - Syncs with `editorStore.ts` via the building details array
 *
 * CES FORMULA (Code de l'Urbanisme):
 *   CES = Σ emprise_au_sol / surface_parcelle
 *   Where emprise_au_sol = width × depth of each building footprint
 *   (overhangs may or may not be included per PLU rules)
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SitePlanBuilding {
  /** Unique identifier (matches Fabric.js object ID / BuildingDetail.id) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Footprint width in meters */
  width: number;
  /** Footprint depth in meters */
  depth: number;
  /** Whether this is a pre-existing building (from BD TOPO import) */
  isExisting: boolean;
  /** Whether to include roof overhang in footprint (PLU-dependent) */
  overhang?: number;
  /** Whether PLU rules include overhang in CES */
  includeOverhangInFootprint?: boolean;
}

export interface SurfaceBreakdown {
  /** Total parcel area in m² */
  parcelArea: number;
  /** Sum of existing building footprints in m² */
  existingFootprint: number;
  /** Sum of new (proposed) building footprints in m² */
  newFootprint: number;
  /** Total footprint (existing + new) in m² */
  totalFootprint: number;
  /** CES existant (existing footprint / parcel area) as decimal */
  cesExistant: number;
  /** CES projeté (total footprint / parcel area) as decimal */
  cesProjete: number;
  /** PLU maximum CES as decimal (e.g. 0.40 = 40%) */
  maxCes: number;
  /** Remaining buildable area before exceeding CES in m² */
  remainingBuildable: number;
  /** Whether the project exceeds PLU CES */
  isOverCes: boolean;
  /** Percentage of max CES consumed (0-100+) */
  cesUsagePercent: number;
  /** Estimated green space (parcel - total footprint - hardscaped) */
  estimatedGreenSpace: number;
  /** Free (unbuilt) area in m² */
  freeArea: number;
}

export interface SitePlanMathState {
  // ── Inputs ──────────────────────────────────────────────────────────────
  /** Total parcel area in m² (from parcel geometry or DB) */
  parcelArea: number;
  /** All buildings on canvas */
  buildings: SitePlanBuilding[];
  /** PLU max CES as decimal (0.0–1.0). Default: 0.40 = 40% */
  maxCesPercent: number;
  /** Whether PLU rules include overhang in footprint calc */
  includeOverhangInFootprint: boolean;

  // ── Actions ─────────────────────────────────────────────────────────────
  /** Set/update the parcel area */
  setParcelArea: (area: number) => void;
  /** Replace the entire buildings array (called on canvas sync) */
  setBuildings: (buildings: SitePlanBuilding[]) => void;
  /** Add a single building */
  addBuilding: (building: SitePlanBuilding) => void;
  /** Update a building by ID */
  updateBuilding: (id: string, patch: Partial<SitePlanBuilding>) => void;
  /** Remove a building by ID */
  removeBuilding: (id: string) => void;
  /** Set the PLU max CES percentage (as decimal 0–1) */
  setMaxCes: (maxCes: number) => void;
  /** Set overhang inclusion rule */
  setOverhangInclusion: (include: boolean) => void;
  /** Reset to initial state */
  reset: () => void;
}

// ─── Pure Calculation Functions ─────────────────────────────────────────────

/**
 * Compute the effective footprint of a single building in m².
 *
 * If the PLU includes overhangs, the footprint is expanded by the
 * overhang distance on all sides (width + 2*overhang) × (depth + 2*overhang).
 * This is the "emprise au sol" definition per Code de l'Urbanisme R420-1.
 */
export function computeBuildingFootprint(
  building: SitePlanBuilding,
  includeOverhang: boolean
): number {
  const { width, depth, overhang = 0 } = building;

  if (width <= 0 || depth <= 0) return 0;

  if (includeOverhang && overhang > 0) {
    return (width + 2 * overhang) * (depth + 2 * overhang);
  }

  return width * depth;
}

/**
 * Compute the full surface breakdown from buildings and parcel data.
 *
 * This is a PURE FUNCTION — no side effects, no state reads.
 * Can be used standalone in tests or from the PDF generators.
 */
export function computeSurfaceBreakdown(
  parcelArea: number,
  buildings: SitePlanBuilding[],
  maxCesPercent: number,
  includeOverhangInFootprint: boolean
): SurfaceBreakdown {
  let existingFootprint = 0;
  let newFootprint = 0;

  for (const b of buildings) {
    const fp = computeBuildingFootprint(b, includeOverhangInFootprint);
    if (b.isExisting) {
      existingFootprint += fp;
    } else {
      newFootprint += fp;
    }
  }

  const totalFootprint = existingFootprint + newFootprint;
  const safeParcel = Math.max(parcelArea, 0.01); // prevent division by zero

  const cesExistant = existingFootprint / safeParcel;
  const cesProjete = totalFootprint / safeParcel;

  const maxAllowedFootprint = safeParcel * maxCesPercent;
  const remainingBuildable = Math.max(0, maxAllowedFootprint - totalFootprint);
  const isOverCes = totalFootprint > maxAllowedFootprint;
  const cesUsagePercent =
    maxCesPercent > 0 ? (cesProjete / maxCesPercent) * 100 : 0;

  const freeArea = Math.max(0, parcelArea - totalFootprint);
  // Rough estimate: 60% of free area is green space, 40% hardscaped
  // (this is a planning heuristic — real value comes from site plan drawing)
  const estimatedGreenSpace = freeArea * 0.6;

  return {
    parcelArea,
    existingFootprint: round2(existingFootprint),
    newFootprint: round2(newFootprint),
    totalFootprint: round2(totalFootprint),
    cesExistant: round4(cesExistant),
    cesProjete: round4(cesProjete),
    maxCes: maxCesPercent,
    remainingBuildable: round2(remainingBuildable),
    isOverCes,
    cesUsagePercent: round2(cesUsagePercent),
    estimatedGreenSpace: round2(estimatedGreenSpace),
    freeArea: round2(freeArea),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ─── Zustand Store ──────────────────────────────────────────────────────────

const INITIAL_STATE = {
  parcelArea: 0,
  buildings: [] as SitePlanBuilding[],
  maxCesPercent: 0.4, // 40% default — common French urban zones
  includeOverhangInFootprint: false,
};

export const useSitePlanMath = create<SitePlanMathState>()(
  subscribeWithSelector((set) => ({
    ...INITIAL_STATE,

    setParcelArea: (area) => set({ parcelArea: Math.max(0, area) }),

    setBuildings: (buildings) => set({ buildings }),

    addBuilding: (building) =>
      set((s) => ({ buildings: [...s.buildings, building] })),

    updateBuilding: (id, patch) =>
      set((s) => ({
        buildings: s.buildings.map((b) =>
          b.id === id ? { ...b, ...patch } : b
        ),
      })),

    removeBuilding: (id) =>
      set((s) => ({
        buildings: s.buildings.filter((b) => b.id !== id),
      })),

    setMaxCes: (maxCes) =>
      set({ maxCesPercent: Math.max(0, Math.min(1, maxCes)) }),

    setOverhangInclusion: (include) =>
      set({ includeOverhangInFootprint: include }),

    reset: () => set(INITIAL_STATE),
  }))
);

// ─── Selector / Derived State ───────────────────────────────────────────────

/**
 * Hook-compatible selector: returns the full SurfaceBreakdown.
 *
 * USAGE:
 *   const breakdown = useSitePlanMath(selectSurfaceBreakdown);
 *
 * The selector is stable — only recalculates when inputs change.
 */
export function selectSurfaceBreakdown(
  state: SitePlanMathState
): SurfaceBreakdown {
  return computeSurfaceBreakdown(
    state.parcelArea,
    state.buildings,
    state.maxCesPercent,
    state.includeOverhangInFootprint
  );
}

/**
 * Hook-compatible selector: returns just the remaining buildable area in m².
 *
 * USAGE:
 *   const remaining = useSitePlanMath(selectRemainingBuildable);
 */
export function selectRemainingBuildable(state: SitePlanMathState): number {
  const breakdown = computeSurfaceBreakdown(
    state.parcelArea,
    state.buildings,
    state.maxCesPercent,
    state.includeOverhangInFootprint
  );
  return breakdown.remainingBuildable;
}

/**
 * Hook-compatible selector: returns whether the project exceeds CES.
 */
export function selectIsOverCes(state: SitePlanMathState): boolean {
  const breakdown = computeSurfaceBreakdown(
    state.parcelArea,
    state.buildings,
    state.maxCesPercent,
    state.includeOverhangInFootprint
  );
  return breakdown.isOverCes;
}
