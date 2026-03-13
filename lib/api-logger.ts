/**
 * API Call Logger — Global fetch interceptor for debugging.
 *
 * Monkey-patches window.fetch to log every API call with:
 *   - URL, method, status, duration
 *   - Request body (truncated)
 *   - Response body (truncated)
 *   - Timestamp
 *
 * Usage:
 *   import { apiLogger } from "@/lib/api-logger";
 *   apiLogger.enable();   // start capturing
 *   apiLogger.disable();  // stop capturing
 *   apiLogger.getLogs();  // get all captured logs
 *   apiLogger.clear();    // clear logs
 */

export interface ApiLogEntry {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  status: number | null;
  duration: number; // ms
  requestBody: unknown;
  responseBody: unknown;
  error: string | null;
  /** Size of the response in bytes (approx) */
  responseSize: number;
}

type Listener = () => void;

class ApiLogger {
  private logs: ApiLogEntry[] = [];
  private enabled = false;
  private originalFetch: typeof fetch | null = null;
  private listeners: Set<Listener> = new Set();
  private idCounter = 0;
  private snapshot: ApiLogEntry[] = [];

  enable() {
    if (this.enabled || typeof window === "undefined") return;
    this.enabled = true;
    this.originalFetch = window.fetch;

    const self = this;
    window.fetch = async function patchedFetch(
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : input instanceof Request
          ? input.url
          : String(input);

      // Only log /api/* calls
      if (!url.includes("/api/")) {
        return self.originalFetch!.call(window, input, init);
      }

      const method = init?.method?.toUpperCase() || "GET";
      const start = performance.now();
      const id = `log-${++self.idCounter}-${Date.now()}`;

      // Parse request body
      let requestBody: unknown = null;
      if (init?.body) {
        try {
          requestBody =
            typeof init.body === "string" ? JSON.parse(init.body) : "[binary]";
        } catch {
          requestBody =
            typeof init.body === "string"
              ? init.body.slice(0, 500)
              : "[binary]";
        }
      }

      const entry: ApiLogEntry = {
        id,
        timestamp: new Date().toISOString(),
        method,
        url: url.replace(window.location.origin, ""),
        status: null,
        duration: 0,
        requestBody,
        responseBody: null,
        error: null,
        responseSize: 0,
      };

      try {
        const res = await self.originalFetch!.call(window, input, init);
        entry.status = res.status;
        entry.duration = Math.round(performance.now() - start);

        // Clone response to read body without consuming it
        const clone = res.clone();
        try {
          const text = await clone.text();
          entry.responseSize = text.length;
          try {
            entry.responseBody = JSON.parse(text);
          } catch {
            entry.responseBody = text.slice(0, 2000);
          }
        } catch {
          entry.responseBody = "[unreadable]";
        }

        self.logs.push(entry);
        self.notify();
        return res;
      } catch (err) {
        entry.error =
          err instanceof Error ? err.message : String(err);
        entry.duration = Math.round(performance.now() - start);
        self.logs.push(entry);
        self.notify();
        throw err;
      }
    };
  }

  disable() {
    if (!this.enabled || typeof window === "undefined") return;
    if (this.originalFetch) {
      window.fetch = this.originalFetch;
      this.originalFetch = null;
    }
    this.enabled = false;
  }

  isEnabled() {
    return this.enabled;
  }

  getLogs(): ApiLogEntry[] {
    return this.snapshot;
  }

  clear() {
    this.logs = [];
    this.snapshot = [];
    this.notify();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.snapshot = [...this.logs];
    this.listeners.forEach((l) => l());
  }

  getLogCount(): number {
    return this.logs.length;
  }
}

/** Singleton instance */
export const apiLogger = new ApiLogger();
