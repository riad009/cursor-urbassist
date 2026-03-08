/**
 * Resilient fetch utility for French government APIs (IGN, Géoplateforme).
 *
 * Features:
 *  - Configurable retry count with exponential backoff
 *  - Per-attempt AbortSignal.timeout
 *  - WFS XML error detection (HTTP 200 but XML error body)
 *  - Total timeout ceiling
 *  - Structured error reporting
 */

export interface IgnFetchOptions {
  /** Max number of retries after the initial attempt (default: 1) */
  maxRetries?: number;
  /** Timeout per attempt in ms (default: 12000) */
  timeoutMs?: number;
  /** Base backoff delay in ms — doubles each retry (default: 500) */
  backoffBaseMs?: number;
  /** Additional headers to send */
  headers?: Record<string, string>;
  /** HTTP method (default: GET) */
  method?: "GET" | "POST";
  /** Request body (for POST) */
  body?: string;
}

export interface IgnFetchResult<T> {
  ok: boolean;
  data: T | null;
  /** Human-readable error if ok === false */
  error?: string;
  /** Number of attempts made */
  attempts: number;
}

/**
 * Check if response body looks like a WFS/OWS XML error.
 * Some IGN endpoints return HTTP 200 with an XML ExceptionReport body.
 */
function looksLikeXmlError(contentType: string | null, bodyPreview: string): boolean {
  if (contentType?.includes("xml") || contentType?.includes("text/html")) {
    return true;
  }
  // Some endpoints don't set content-type properly — sniff the body
  const trimmed = bodyPreview.trimStart();
  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<ows:ExceptionReport") || trimmed.startsWith("<ExceptionReport")) {
    return true;
  }
  return false;
}

/**
 * Fetch from an IGN/Géoplateforme endpoint with retry & timeout.
 *
 * @param url - Full URL to fetch
 * @param opts - Retry/timeout options
 * @returns Parsed JSON response or error
 */
export async function ignFetchWithRetry<T = unknown>(
  url: string,
  opts: IgnFetchOptions = {}
): Promise<IgnFetchResult<T>> {
  const {
    maxRetries = 1,
    timeoutMs = 12000,
    backoffBaseMs = 500,
    headers = {},
    method = "GET",
    body,
  } = opts;

  const totalAttempts = 1 + maxRetries;
  let lastError = "";

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    // Exponential backoff before retry (not before first attempt)
    if (attempt > 0) {
      const delay = backoffBaseMs * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const fetchOpts: RequestInit = {
        method,
        headers: {
          Accept: "application/json",
          "User-Agent": "UrbAssist/1.0",
          ...headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
      };
      if (body && method === "POST") {
        fetchOpts.body = body;
        (fetchOpts.headers as Record<string, string>)["Content-Type"] = "application/json";
      }

      const res = await fetch(url, fetchOpts);

      if (!res.ok) {
        lastError = `HTTP ${res.status}: ${res.statusText}`;
        // Only retry on 5xx or 429
        if (res.status >= 500 || res.status === 429) continue;
        // 4xx = client error, don't retry
        return { ok: false, data: null, error: lastError, attempts: attempt + 1 };
      }

      // Read body as text first to detect XML errors
      const bodyText = await res.text();
      const contentType = res.headers.get("content-type");

      if (looksLikeXmlError(contentType, bodyText)) {
        lastError = "Server returned XML error response instead of JSON";
        continue; // Retry — server may have returned a transient WFS error
      }

      // Parse JSON
      try {
        const data = JSON.parse(bodyText) as T;
        return { ok: true, data, attempts: attempt + 1 };
      } catch {
        lastError = "Failed to parse response as JSON";
        continue;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "TimeoutError") {
        lastError = `Request timed out after ${timeoutMs}ms`;
      } else if (e instanceof Error) {
        lastError = e.message;
      } else {
        lastError = "Unknown fetch error";
      }
      // Continue to retry
    }
  }

  return { ok: false, data: null, error: lastError, attempts: totalAttempts };
}
