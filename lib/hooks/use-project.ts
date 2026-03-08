"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ── Module-level deduplication & cache ──────────────────────────────
// Shared across ALL component instances — if two components call
// useProject("abc") simultaneously, only ONE fetch fires.

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

/** In-flight promises keyed by projectId */
const inflightRequests = new Map<string, Promise<unknown>>();

/** Cached project data keyed by projectId */
const projectCache = new Map<string, CacheEntry>();

/** Cache TTL: 30 seconds */
const CACHE_TTL_MS = 30_000;

async function fetchProjectData(projectId: string): Promise<unknown> {
  // Return cached data if still fresh
  const cached = projectCache.get(projectId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // Deduplication: if a fetch for this project is already in-flight, await it
  const existing = inflightRequests.get(projectId);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      const json = await res.json();
      const project = json.project ?? null;
      if (project) {
        projectCache.set(projectId, { data: project, timestamp: Date.now() });
      }
      return project;
    } catch {
      return null;
    } finally {
      inflightRequests.delete(projectId);
    }
  })();

  inflightRequests.set(projectId, promise);
  return promise;
}

/** Invalidate cache for a specific project (call after PUT/DELETE mutations). */
export function invalidateProjectCache(projectId: string) {
  projectCache.delete(projectId);
  // Don't cancel in-flight — let it complete so other listeners get data
}

/** Invalidate all cached project data. */
export function invalidateAllProjectCache() {
  projectCache.clear();
}

/**
 * Deduplicating, caching hook for project data.
 *
 * Features:
 * - Module-level request deduplication: multiple components using the same
 *   projectId will share a single in-flight fetch.
 * - 30-second in-memory cache: avoids re-fetching on route transitions.
 * - `refresh()` force-invalidates cache and re-fetches.
 */
export function useProject(projectId: string | null | undefined) {
  const [project, setProject] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchProjectData(projectId)
      .then((data) => {
        if (!cancelled && mountedRef.current) {
          setProject(data as Record<string, unknown> | null);
        }
      })
      .catch((err) => {
        if (!cancelled && mountedRef.current) {
          setError(err?.message ?? "Failed to load project");
          setProject(null);
        }
      })
      .finally(() => {
        if (!cancelled && mountedRef.current) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    invalidateProjectCache(projectId);
    setLoading(true);
    try {
      const data = await fetchProjectData(projectId);
      if (mountedRef.current) {
        setProject(data as Record<string, unknown> | null);
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setError((err as Error)?.message ?? "Failed to load project");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [projectId]);

  return { project, loading, error, refresh };
}
