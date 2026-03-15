/**
 * Project route utilities.
 *
 * Stripped-down version — only retains `getProjectIdFromRoute` which is
 * used by the Navigation breadcrumb to detect the active project context.
 * All step-bar / step-navigation infrastructure has been removed.
 */

/** Paths that accept ?project= for project context (without being under /projects/[id]) */
const PROJECT_QUERY_PATHS = ["/site-plan", "/location-plan", "/terrain", "/building-3d", "/landscape", "/statement", "/export"];

export function getProjectIdFromRoute(pathname: string, projectParam: string | null): string | null {
  // /projects/new is step 1 — no project ID yet
  if (pathname === "/projects/new") return projectParam || null;
  // Match /projects/[id] or /projects/[id]/<sub-route>
  const match = pathname.match(/^\/projects\/([^/]+)(?:\/(?:authorization|payment|description|project-description|documents|dashboard))?$/);
  if (match && match[1] !== "new") return match[1];
  if (projectParam && PROJECT_QUERY_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return projectParam;
  }
  return null;
}
