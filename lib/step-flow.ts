/**
 * Planning application step order. Used for step bar UI and "Next step" navigation.
 */
export const PLANNING_STEPS = [
  { step: 1, label: "Overview", path: "/projects/", pathMatch: (p: string) => /^\/projects\/[^/]+$/.test(p), href: (id: string) => `/projects/${id}` },
  { step: 2, label: "Location Plan", path: "/location-plan", pathMatch: (p: string) => p === "/location-plan" || p.startsWith("/location-plan/"), href: (id: string) => `/location-plan?project=${id}` },
  { step: 3, label: "Site Plan", path: "/editor", pathMatch: (p: string) => p === "/editor" || p.startsWith("/editor/"), href: (id: string) => `/editor?project=${id}` },
  { step: 4, label: "Terrain", path: "/terrain", pathMatch: (p: string) => p === "/terrain" || p.startsWith("/terrain/"), href: (id: string) => `/terrain?project=${id}` },
  { step: 5, label: "Building 3D", path: "/building-3d", pathMatch: (p: string) => p === "/building-3d" || p.startsWith("/building-3d/"), href: (id: string) => `/building-3d?project=${id}` },
  { step: 6, label: "Landscape", path: "/landscape", pathMatch: (p: string) => p === "/landscape" || p.startsWith("/landscape/"), href: (id: string) => `/landscape?project=${id}` },
  { step: 7, label: "Statement", path: "/statement", pathMatch: (p: string) => p === "/statement" || p.startsWith("/statement/"), href: (id: string) => `/statement?project=${id}` },
  { step: 8, label: "Export", path: "/export", pathMatch: (p: string) => p === "/export" || p.startsWith("/export/"), href: (id: string) => `/export?project=${id}` },
] as const;

/** Paths that accept ?project= for step context (without being under /projects/[id]) */
const PROJECT_QUERY_PATHS = ["/editor", "/location-plan", "/terrain", "/building-3d", "/landscape", "/statement", "/export"];

export function getProjectIdFromRoute(pathname: string, projectParam: string | null): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)$/);
  if (match) return match[1];
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
