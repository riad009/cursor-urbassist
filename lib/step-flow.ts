/**
 * Planning application step order. Used for step bar UI and "Next step" navigation.
 *
 * Phase 1 (before payment): Localisation → Authorization → Documents → Payment
 * Phase 2 (after payment):  Overview → Description → Location Plan → Site Plan → Statement → Export
 *
 * Note: PLU/Regulation Analysis is now a produced document, not a numbered step.
 */

export type StepPhase = 1 | 2;

export interface PlanningStep {
  step: number;
  label: string;
  phase: StepPhase;
  path: string;
  pathMatch: (p: string) => boolean;
  href: (id: string) => string;
}

export const PLANNING_STEPS: readonly PlanningStep[] = [
  // ── Phase 1 – Project Creation (before payment) ──────────────────────
  { step: 1, phase: 1, label: "Localisation", path: "/projects/new", pathMatch: (p) => p === "/projects/new", href: (_id) => `/projects/new` },
  { step: 2, phase: 1, label: "Authorization", path: "/projects/", pathMatch: (p) => /^\/projects\/[^/]+\/authorization$/.test(p), href: (id) => `/projects/${id}/authorization` },
  { step: 3, phase: 1, label: "Documents", path: "/projects/", pathMatch: (p) => /^\/projects\/[^/]+\/documents$/.test(p), href: (id) => `/projects/${id}/documents` },
  { step: 4, phase: 1, label: "Payment", path: "/projects/", pathMatch: (p) => /^\/projects\/[^/]+\/payment$/.test(p), href: (id) => `/projects/${id}/payment` },

  // ── Phase 2 – Project Dashboard / Production (after payment) ─────────
  { step: 5, phase: 2, label: "Dashboard", path: "/projects/", pathMatch: (p) => /^\/projects\/[^/]+\/dashboard$/.test(p), href: (id) => `/projects/${id}/dashboard` },
  { step: 6, phase: 2, label: "Overview", path: "/projects/", pathMatch: (p) => /^\/projects\/[^/]+$/.test(p) && p !== "/projects/new", href: (id) => `/projects/${id}` },
  { step: 7, phase: 2, label: "Description", path: "/projects/", pathMatch: (p) => /^\/projects\/[^/]+\/description$/.test(p), href: (id) => `/projects/${id}/description` },
  { step: 8, phase: 2, label: "Location Plan", path: "/location-plan", pathMatch: (p) => p === "/location-plan" || p.startsWith("/location-plan/"), href: (id) => `/location-plan?project=${id}` },
  { step: 9, phase: 2, label: "Site Plan", path: "/site-plan", pathMatch: (p) => p === "/site-plan" || p.startsWith("/site-plan/") || p === "/editor" || p.startsWith("/editor/"), href: (id) => `/site-plan?project=${id}` },
  { step: 10, phase: 2, label: "Statement", path: "/statement", pathMatch: (p) => p === "/statement" || p.startsWith("/statement/"), href: (id) => `/statement?project=${id}` },
  { step: 11, phase: 2, label: "Export", path: "/export", pathMatch: (p) => p === "/export" || p.startsWith("/export/"), href: (id) => `/export?project=${id}` },
] as const;

/** Return only the steps that belong to a given phase */
export function getPhaseSteps(phase: StepPhase): PlanningStep[] {
  return PLANNING_STEPS.filter((s) => s.phase === phase);
}

/** Paths that accept ?project= for step context (without being under /projects/[id]) */
const PROJECT_QUERY_PATHS = ["/plu-analysis", "/site-plan", "/editor", "/location-plan", "/terrain", "/building-3d", "/landscape", "/statement", "/export"];

export function getProjectIdFromRoute(pathname: string, projectParam: string | null): string | null {
  // /projects/new is step 1 — no project ID yet
  if (pathname === "/projects/new") return projectParam || null;
  // Match /projects/[id] or /projects/[id]/authorization or /projects/[id]/payment or /projects/[id]/description or /projects/[id]/documents
  const match = pathname.match(/^\/projects\/([^/]+)(?:\/(?:authorization|payment|description|project-description|documents|dashboard))?$/);
  if (match && match[1] !== "new") return match[1];
  if (projectParam && PROJECT_QUERY_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return projectParam;
  }
  return null;
}

export function getStepIndex(pathname: string): number {
  const idx = PLANNING_STEPS.findIndex((s) => s.pathMatch(pathname));
  return idx >= 0 ? idx : -1;
}

/** Determine which phase the current pathname belongs to */
export function getStepPhase(pathname: string): StepPhase | null {
  const idx = getStepIndex(pathname);
  if (idx < 0) return null;
  return PLANNING_STEPS[idx].phase;
}

export function getNextStep(pathname: string, projectId: string | null): { href: string; label: string } | null {
  if (!projectId) return null;
  const idx = getStepIndex(pathname);
  if (idx < 0 || idx >= PLANNING_STEPS.length - 1) return null;
  const next = PLANNING_STEPS[idx + 1];
  return { href: next.href(projectId), label: next.label };
}

export function getPrevStep(pathname: string, projectId: string | null): { href: string; label: string } | null {
  if (!projectId) return null;
  const idx = getStepIndex(pathname);
  if (idx <= 0) return null;
  const prev = PLANNING_STEPS[idx - 1];
  return { href: prev.href(projectId), label: prev.label };
}
