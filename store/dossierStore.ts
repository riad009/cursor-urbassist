/**
 * Decision Engine Store — Zustand state for the dossier / authorization flow.
 *
 * KEY DESIGN: When the user changes their parcel selection the entire regulatory
 * check resets instantly to prevent "Data Ghosting" (stale data from a previous
 * parcel leaking into the new context).
 *
 * All thresholds (dpThreshold) are derived from the API response objects and are
 * NEVER hardcoded here.
 *
 * Production-hardened:
 *  - submitterType for Individual/Company popup logic
 *  - popupStage for deterministic popup flow tracking
 *  - Error states parallel to loading states
 *  - Multi-parcel support (selectedParcels[])
 *  - mergedParcelGeometry for unified polygon
 */

import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SubmitterType = "individual" | "company";

/**
 * Popup flow stage — tracks the harmonized popup state machine.
 *
 * Flow: idle → detecting → company_warning | individual_payment → redirecting → complete
 */
export type PopupStage =
  | "idle"                   // No popup active
  | "detecting"              // Detecting authorization type (DP/PC)
  | "company_warning"        // Showing architect mandatory warning (Company + PC)
  | "individual_payment"     // Showing Stripe redirect for individual
  | "redirecting"            // Redirect in progress (Stripe or architect page)
  | "complete";              // Flow completed

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

export interface ErrorStates {
  address: string | null;
  parcel: string | null;
  regulatory: string | null;
  heritage: string | null;
  decision: string | null;
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
  /** @deprecated Use selectedParcels[] for multi-parcel support */
  selectedParcel: ParcelSelection | null;
  /** Multi-parcel selection (replaces selectedParcel for new code) */
  selectedParcels: ParcelSelection[];
  /** Merged polygon geometry from all selected parcels (set by merge operation) */
  mergedParcelGeometry: unknown | null;

  // Submitter type ─────────────────────────────────────────────────────────
  submitterType: SubmitterType | null;

  // Popup flow ─────────────────────────────────────────────────────────────
  popupStage: PopupStage;

  // Regulatory (from GPU API) ──────────────────────────────────────────────
  regulatory: RegulatoryInfo | null;

  // Heritage / Protected areas ─────────────────────────────────────────────
  heritage: HeritageInfo | null;

  // Decision result ────────────────────────────────────────────────────────
  decision: DecisionResult | null;

  // Loading states ─────────────────────────────────────────────────────────
  loading: LoadingStates;

  // Error states ───────────────────────────────────────────────────────────
  errors: ErrorStates;

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

  /** Add a parcel to the selection (multi-parcel). RESETS downstream. */
  addParcel: (parcel: ParcelSelection) => void;

  /** Remove a parcel from the selection. RESETS downstream. */
  removeParcel: (parcelId: string) => void;

  /** Set the merged parcel geometry (from mergeParcelGeometries result). */
  setMergedParcelGeometry: (geometry: unknown | null) => void;

  /** Set the submitter type (Individual or Company). */
  setSubmitterType: (type: SubmitterType) => void;

  /** Set the popup flow stage. */
  setPopupStage: (stage: PopupStage) => void;

  setRegulatory: (regulatory: RegulatoryInfo) => void;
  setHeritage: (heritage: HeritageInfo) => void;
  setDecision: (decision: DecisionResult) => void;

  setLoading: (key: keyof LoadingStates, value: boolean) => void;
  setError: (key: keyof ErrorStates, error: string | null) => void;

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

const INITIAL_ERRORS: ErrorStates = {
  address: null,
  parcel: null,
  regulatory: null,
  heritage: null,
  decision: null,
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
  selectedParcels: [],
  mergedParcelGeometry: null,
  submitterType: null,
  popupStage: "idle",
  regulatory: null,
  heritage: null,
  decision: null,
  loading: { ...INITIAL_LOADING },
  errors: { ...INITIAL_ERRORS },

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
      selectedParcels: [],
      mergedParcelGeometry: null,
      regulatory: null,
      heritage: null,
      decision: null,
      popupStage: "idle",
      errors: { ...INITIAL_ERRORS },
    }),

  // ── Single Parcel (backward compat — cascade-reset) ─────────────────────
  selectParcel: (parcel) =>
    set({
      selectedParcel: parcel,
      selectedParcels: [parcel],
      mergedParcelGeometry: null,
      // Reset all downstream data to prevent Data Ghosting
      regulatory: null,
      heritage: null,
      decision: null,
      popupStage: "idle",
      errors: { ...INITIAL_ERRORS },
    }),

  // ── Multi-parcel ────────────────────────────────────────────────────────
  addParcel: (parcel) =>
    set((state) => {
      // Don't add duplicates
      if (state.selectedParcels.some((p) => p.id === parcel.id)) return state;
      const newParcels = [...state.selectedParcels, parcel];
      return {
        selectedParcels: newParcels,
        selectedParcel: newParcels[0] ?? null, // backward compat: point to first
        mergedParcelGeometry: null,
        regulatory: null,
        heritage: null,
        decision: null,
        popupStage: "idle",
        errors: { ...INITIAL_ERRORS },
      };
    }),

  removeParcel: (parcelId) =>
    set((state) => {
      const newParcels = state.selectedParcels.filter((p) => p.id !== parcelId);
      return {
        selectedParcels: newParcels,
        selectedParcel: newParcels[0] ?? null,
        mergedParcelGeometry: null,
        regulatory: null,
        heritage: null,
        decision: null,
        popupStage: "idle",
        errors: { ...INITIAL_ERRORS },
      };
    }),

  setMergedParcelGeometry: (geometry) => set({ mergedParcelGeometry: geometry }),

  // ── Submitter type ──────────────────────────────────────────────────────
  setSubmitterType: (type) => set({ submitterType: type }),

  // ── Popup flow ──────────────────────────────────────────────────────────
  setPopupStage: (stage) => set({ popupStage: stage }),

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

  // ── Errors ──────────────────────────────────────────────────────────────
  setError: (key, error) =>
    set((state) => ({
      errors: { ...state.errors, [key]: error },
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
      selectedParcels: [],
      mergedParcelGeometry: null,
      submitterType: null,
      popupStage: "idle",
      regulatory: null,
      heritage: null,
      decision: null,
      loading: { ...INITIAL_LOADING },
      errors: { ...INITIAL_ERRORS },
    }),
}));

