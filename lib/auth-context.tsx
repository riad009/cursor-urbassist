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

  /** Timestamp of last successful fetch */
  const lastFetchRef = useRef<number>(0);
  /** Cached user from last successful fetch */
  const cachedUserRef = useRef<User | null>(null);
  /**
   * In-flight promise — deduplicates concurrent calls.
   * IMPORTANT: We intentionally do NOT abort in-flight requests on cleanup.
   * React strict mode (and concurrent features) unmount+remount, which was
   * aborting the initial /api/auth/me fetch and leaving user === null.
   */
  const pendingRef = useRef<Promise<User | null> | null>(null);

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

    const promise = (async (): Promise<User | null> => {
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
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
        // Network error — return cached value (may be null on first load)
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
    // We use a `mounted` flag to guard stale state updates, but we
    // intentionally do NOT abort the fetch. In React strict mode the
    // component unmounts → remounts instantly; aborting would kill the
    // in-flight request and leave session === null on first render.
    let mounted = true;

    fetchSession()
      .then((result) => {
        if (mounted) setUser(result);
      })
      .catch(() => {
        if (mounted) setUser(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      // Note: NOT aborting the request here — this is intentional.
      // The deduplication ref ensures the remounted effect awaits
      // the same in-flight promise and applies the result.
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
