/**
 * Planning application step order. Used for step bar UI and "Next step" navigation.
 * Flow: Project → Authorization → Payment → Description → Overview → Location Plan → Site Plan → Statement → Export
 * Note: PLU/Regulation Analysis is now a produced document, not a numbered step.
 */
export const PLANNING_STEPS = [
  { step: 1, label: "Project", path: "/projects/new", pathMatch: (p: string) => p === "/projects/new", href: (_id: string) => `/projects/new` },
  { step: 2, label: "Authorization", path: "/projects/", pathMatch: (p: string) => /^\/projects\/[^/]+\/authorization$/.test(p), href: (id: string) => `/projects/${id}/authorization` },
  { step: 3, label: "Payment", path: "/projects/", pathMatch: (p: string) => /^\/projects\/[^/]+\/payment$/.test(p), href: (id: string) => `/projects/${id}/payment` },
  { step: 4, label: "Description", path: "/projects/", pathMatch: (p: string) => /^\/projects\/[^/]+\/description$/.test(p), href: (id: string) => `/projects/${id}/description` },
  { step: 5, label: "Overview", path: "/projects/", pathMatch: (p: string) => /^\/projects\/[^/]+$/.test(p) && p !== "/projects/new", href: (id: string) => `/projects/${id}` },
  { step: 6, label: "Location Plan", path: "/location-plan", pathMatch: (p: string) => p === "/location-plan" || p.startsWith("/location-plan/"), href: (id: string) => `/location-plan?project=${id}` },
  { step: 7, label: "Site Plan", path: "/site-plan", pathMatch: (p: string) => p === "/site-plan" || p.startsWith("/site-plan/") || p === "/editor" || p.startsWith("/editor/"), href: (id: string) => `/site-plan?project=${id}` },
  { step: 8, label: "Statement", path: "/statement", pathMatch: (p: string) => p === "/statement" || p.startsWith("/statement/"), href: (id: string) => `/statement?project=${id}` },
  { step: 9, label: "Export", path: "/export", pathMatch: (p: string) => p === "/export" || p.startsWith("/export/"), href: (id: string) => `/export?project=${id}` },
] as const;

/** Paths that accept ?project= for step context (without being under /projects/[id]) */
const PROJECT_QUERY_PATHS = ["/plu-analysis", "/site-plan", "/editor", "/location-plan", "/terrain", "/building-3d", "/landscape", "/statement", "/export"];

export function getProjectIdFromRoute(pathname: string, projectParam: string | null): string | null {
  // /projects/new is step 1 — no project ID yet
  if (pathname === "/projects/new") return projectParam || null;
  // Match /projects/[id] or /projects/[id]/authorization or /projects/[id]/payment or /projects/[id]/description
  const match = pathname.match(/^\/projects\/([^/]+)(?:\/(?:authorization|payment|description))?$/);
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
