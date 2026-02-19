/**
 * Decision Engine Store — Zustand state for the dossier / authorization flow.
 *
 * KEY DESIGN: When the user changes their parcel selection the entire regulatory
 * check resets instantly to prevent "Data Ghosting" (stale data from a previous
 * parcel leaking into the new context).
 *
 * All thresholds (dpThreshold) are derived from the API response objects and are
 * NEVER hardcoded here.
 */

import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParcelSelection {
  id: string;
  section: string;
  number: string;
  area: number; // m² from IGN API
  centroid: [number, number]; // [lng, lat]
  geometry: unknown | null; // GeoJSON geometry
  commune?: string;
}

export interface RegulatoryInfo {
  hasPlu: boolean;
  pluName: string | null;
  pluType: string | null; // PLU | PLUi | CC | RNU
  zoneCode: string | null; // UA, UB, N, A …
  zoneLongLabel: string | null;
  isUrbanZone: boolean;
  dpThreshold: number; // 20 or 40, derived from GPU API
  isRnu: boolean;
  rnuWarning: string | null;
}

export interface ProtectedAreaInfo {
  type: string;
  name: string;
  description: string;
  distance: number | null;
  constraints: string[];
  sourceUrl: string | null;
  severity: "high" | "medium" | "low" | "info";
  categorie?: string;
}

export interface HeritageInfo {
  isProtectedZone: boolean;
  protectedAreas: ProtectedAreaInfo[];
  requiresDpc11: boolean;
  timelineAdjustmentMonths: number; // +1 month when heritage detected
}

export interface DecisionResult {
  determination: "DP" | "PC" | "ARCHITECT_REQUIRED" | "NONE";
  explanation: string;
  architectRequired: boolean;
  dpThreshold: number;
  source: "server" | "client"; // authoritative vs preview
}

export interface LoadingStates {
  address: boolean;
  parcel: boolean;
  regulatory: boolean;
  heritage: boolean;
  decision: boolean;
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface DossierState {
  // Address ─────────────────────────────────────────────────────────────────
  address: string | null;
  addressCoordinates: [number, number] | null; // [lng, lat]
  municipality: string | null;
  citycode: string | null;
  departement: string | null;

  // Parcel ──────────────────────────────────────────────────────────────────
  selectedParcel: ParcelSelection | null;

  // Regulatory (from GPU API) ──────────────────────────────────────────────
  regulatory: RegulatoryInfo | null;

  // Heritage / Protected areas ─────────────────────────────────────────────
  heritage: HeritageInfo | null;

  // Decision result ────────────────────────────────────────────────────────
  decision: DecisionResult | null;

  // Loading states ─────────────────────────────────────────────────────────
  loading: LoadingStates;

  // ── Actions ──
  setAddress: (
    address: string,
    coordinates: [number, number],
    municipality?: string,
    citycode?: string,
    departement?: string,
  ) => void;

  /** Select a new parcel. RESETS regulatory, heritage, and decision. */
  selectParcel: (parcel: ParcelSelection) => void;

  setRegulatory: (regulatory: RegulatoryInfo) => void;
  setHeritage: (heritage: HeritageInfo) => void;
  setDecision: (decision: DecisionResult) => void;

  setLoading: (key: keyof LoadingStates, value: boolean) => void;

  /** Reset everything — e.g. user starts a completely new dossier. */
  resetAll: () => void;
}

// ---------------------------------------------------------------------------
// Initial / empty states
// ---------------------------------------------------------------------------

const INITIAL_LOADING: LoadingStates = {
  address: false,
  parcel: false,
  regulatory: false,
  heritage: false,
  decision: false,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useDossierStore = create<DossierState>((set) => ({
  // Defaults
  address: null,
  addressCoordinates: null,
  municipality: null,
  citycode: null,
  departement: null,
  selectedParcel: null,
  regulatory: null,
  heritage: null,
  decision: null,
  loading: { ...INITIAL_LOADING },

  // ── Address ──────────────────────────────────────────────────────────────
  setAddress: (address, coordinates, municipality, citycode, departement) =>
    set({
      address,
      addressCoordinates: coordinates,
      municipality: municipality ?? null,
      citycode: citycode ?? null,
      departement: departement ?? null,
      // Changing address resets downstream state
      selectedParcel: null,
      regulatory: null,
      heritage: null,
      decision: null,
    }),

  // ── Parcel (cascade-reset) ──────────────────────────────────────────────
  selectParcel: (parcel) =>
    set({
      selectedParcel: parcel,
      // Reset all downstream data to prevent Data Ghosting
      regulatory: null,
      heritage: null,
      decision: null,
    }),

  // ── Regulatory ──────────────────────────────────────────────────────────
  setRegulatory: (regulatory) => set({ regulatory }),

  // ── Heritage ────────────────────────────────────────────────────────────
  setHeritage: (heritage) => set({ heritage }),

  // ── Decision ────────────────────────────────────────────────────────────
  setDecision: (decision) => set({ decision }),

  // ── Loading ─────────────────────────────────────────────────────────────
  setLoading: (key, value) =>
    set((state) => ({
      loading: { ...state.loading, [key]: value },
    })),

  // ── Full reset ──────────────────────────────────────────────────────────
  resetAll: () =>
    set({
      address: null,
      addressCoordinates: null,
      municipality: null,
      citycode: null,
      departement: null,
      selectedParcel: null,
      regulatory: null,
      heritage: null,
      decision: null,
      loading: { ...INITIAL_LOADING },
    }),
}));
