/**
 * Centralized credit cost configuration for all billable features.
 * Single source of truth — import this everywhere instead of hardcoding.
 */
export const CREDIT_COSTS = {
  // PLU Analysis
  PLU_ANALYSIS_FIRST: 3,
  PLU_ANALYSIS_RELAUNCH: 1,

  // Document exports (per document type)
  DOCUMENT_EXPORT: {
    LOCATION_PLAN: 2,
    SITE_PLAN: 3,
    SECTION: 2,
    ELEVATION: 2,
    LANDSCAPE_INSERTION: 5,
    DESCRIPTIVE_STATEMENT: 2,
    FULL_PACKAGE: 10,
  } as Record<string, number>,

  // Standalone features
  LANDSCAPE_INSERTION: 5,
  DESCRIPTIVE_STATEMENT: 2,
  REGULATORY_ANALYSIS: 1,

  // Rendering
  RENDERING_BASE: 10,
} as const;

/** Helper to get PLU analysis cost based on analysis count */
export function getPluAnalysisCost(pluAnalysisCount: number): number {
  return pluAnalysisCount > 0
    ? CREDIT_COSTS.PLU_ANALYSIS_RELAUNCH
    : CREDIT_COSTS.PLU_ANALYSIS_FIRST;
}

/** Helper to get document export cost */
export function getDocumentExportCost(documentType: string): number {
  return CREDIT_COSTS.DOCUMENT_EXPORT[documentType] ?? 2;
}
