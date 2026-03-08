"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  credits: number;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

/** Stale-while-revalidate: cache session for 30 seconds */
const SESSION_CACHE_TTL_MS = 30_000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Deduplication & caching refs ──────────────────────────────────
  /** In-flight promise — if a fetch is already running, subsequent callers await the same promise */
  const pendingRef = useRef<Promise<User | null> | null>(null);
  /** Timestamp of last successful fetch */
  const lastFetchRef = useRef<number>(0);
  /** Cached user from last successful fetch */
  const cachedUserRef = useRef<User | null>(null);
  /** AbortController for cancelling stale requests */
  const abortRef = useRef<AbortController | null>(null);

  const fetchSession = useCallback(async (force = false): Promise<User | null> => {
    // ── Stale-while-revalidate: return cached data if fresh ──
    const now = Date.now();
    if (!force && lastFetchRef.current > 0 && now - lastFetchRef.current < SESSION_CACHE_TTL_MS) {
      return cachedUserRef.current;
    }

    // ── Deduplication: if a request is already in-flight, await it ──
    if (pendingRef.current) {
      return pendingRef.current;
    }

    // Cancel any previous request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const promise = (async (): Promise<User | null> => {
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
          signal: controller.signal,
        });
        if (res.ok) {
          const { user: fetchedUser } = await res.json();
          cachedUserRef.current = fetchedUser;
          lastFetchRef.current = Date.now();
          return fetchedUser;
        }
        cachedUserRef.current = null;
        lastFetchRef.current = Date.now();
        return null;
      } catch {
        // Aborted or network error — don't update cache
        return cachedUserRef.current;
      } finally {
        pendingRef.current = null;
      }
    })();

    pendingRef.current = promise;
    return promise;
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const result = await fetchSession(true); // force = true bypasses cache
      setUser(result);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [fetchSession]);

  useEffect(() => {
    let cancelled = false;
    fetchSession()
      .then((result) => {
        if (!cancelled) setUser(result);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchSession]);

  const login = async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      credentials: "include",
    });
    if (!res.ok) {
      let message = "Unable to login";
      try {
        const data = await res.json();
        if (data?.error && typeof data.error === "string") message = data.error;
      } catch {
        message = res.status === 503 ? "Database not configured. Run: npx prisma generate then restart the server." : "Unable to login";
      }
      throw new Error(message);
    }
    // Invalidate cache and re-fetch
    lastFetchRef.current = 0;
    cachedUserRef.current = null;
    pendingRef.current = null;
    await refreshUser();
  };

  const register = async (email: string, password: string, name?: string) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
      credentials: "include",
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Registration failed");
    }
    // Invalidate cache and re-fetch
    lastFetchRef.current = 0;
    cachedUserRef.current = null;
    pendingRef.current = null;
    await refreshUser();
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
    cachedUserRef.current = null;
    lastFetchRef.current = 0;
    pendingRef.current = null;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
