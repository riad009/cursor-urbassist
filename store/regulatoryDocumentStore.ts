/**
 * Regulatory Document Store — Zustand state for ABF-aware document management.
 *
 * PURPOSE: Persist the ABF detection result and computed document list so that
 * Phase 2 (document generation, CERFA pre-fill, PDF export) can consume them
 * without re-querying the protected-areas API.
 *
 * DESIGN PRINCIPLES:
 *  - Single source of truth for "which documents are required"
 *  - Auto-recomputes documents whenever isABFZone or projectType changes
 *  - Tracks which specific codes were added because of ABF for UI highlighting
 *  - Immutable snapshot pattern: each recomputation creates a new array reference
 */

import { create } from "zustand";
import {
  type AuthorizationDocument,
  type RequiredDocumentsResult,
  calculateRequiredDocuments,
} from "@/lib/authorization-documents";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegulatoryDocumentState {
  // ── Detection results (set by Phase 1) ────────────────────────────────
  /** Whether the parcel is in an ABF / heritage protection perimeter */
  isABFZone: boolean;
  /** Resolved authorization type from the decision engine */
  projectType: "DP" | "PC" | null;
  /** Whether the project involves an existing structure (triggers PC5 split) */
  isExistingStructure: boolean;

  // ── Computed document list ─────────────────────────────────────────────
  /** Full ordered list of required documents for this project context */
  requiredDocuments: AuthorizationDocument[];
  /** Document codes that exist solely because of ABF zone detection */
  abfSpecificCodes: string[];
  /** Human-readable ABF impact summary for UI display */
  abfImpactSummary: string | null;
  /** Timestamp of last recomputation (for cache invalidation) */
  lastComputedAt: number | null;

  // ── Actions ────────────────────────────────────────────────────────────
  /** Set ABF detection result — triggers document recomputation */
  setABFDetection: (isABF: boolean) => void;
  /** Set project type (DP/PC) — triggers document recomputation */
  setProjectType: (type: "DP" | "PC") => void;
  /** Set existing structure flag — triggers document recomputation */
  setIsExistingStructure: (isExisting: boolean) => void;
  /** Force full recomputation (e.g. after manual PLU override) */
  recompute: () => void;
  /** Get computed result as a snapshot (for server-side consumption) */
  getSnapshot: () => RequiredDocumentsResult | null;
  /** Reset to clean state (e.g. new dossier) */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useRegulatoryDocumentStore = create<RegulatoryDocumentState>(
  (set, get) => {
    /**
     * Internal recomputation helper.
     * Only runs if both ABF detection and project type are known.
     */
    function recomputeDocuments(
      isABFZone: boolean,
      projectType: "DP" | "PC" | null,
      isExistingStructure: boolean
    ): Partial<RegulatoryDocumentState> {
      if (!projectType) {
        // Can't compute without project type — clear computed state
        return {
          requiredDocuments: [],
          abfSpecificCodes: [],
          abfImpactSummary: null,
          lastComputedAt: null,
        };
      }

      const result = calculateRequiredDocuments(projectType, isABFZone, {
        isExistingStructure,
      });

      return {
        requiredDocuments: result.documents,
        abfSpecificCodes: result.abfSpecificCodes,
        abfImpactSummary: result.abfImpactSummary,
        lastComputedAt: Date.now(),
      };
    }

    return {
      // Defaults
      isABFZone: false,
      projectType: null,
      isExistingStructure: false,
      requiredDocuments: [],
      abfSpecificCodes: [],
      abfImpactSummary: null,
      lastComputedAt: null,

      // ── Actions ──────────────────────────────────────────────────────

      setABFDetection: (isABF) =>
        set((state) => ({
          isABFZone: isABF,
          ...recomputeDocuments(isABF, state.projectType, state.isExistingStructure),
        })),

      setProjectType: (type) =>
        set((state) => ({
          projectType: type,
          ...recomputeDocuments(state.isABFZone, type, state.isExistingStructure),
        })),

      setIsExistingStructure: (isExisting) =>
        set((state) => ({
          isExistingStructure: isExisting,
          ...recomputeDocuments(state.isABFZone, state.projectType, isExisting),
        })),

      recompute: () =>
        set((state) => ({
          ...recomputeDocuments(
            state.isABFZone,
            state.projectType,
            state.isExistingStructure
          ),
        })),

      getSnapshot: () => {
        const state = get();
        if (!state.projectType) return null;
        return {
          projectType: state.projectType,
          isABFZone: state.isABFZone,
          documents: state.requiredDocuments,
          abfSpecificCodes: state.abfSpecificCodes,
          abfImpactSummary: state.abfImpactSummary,
        };
      },

      reset: () =>
        set({
          isABFZone: false,
          projectType: null,
          isExistingStructure: false,
          requiredDocuments: [],
          abfSpecificCodes: [],
          abfImpactSummary: null,
          lastComputedAt: null,
        }),
    };
  }
);
