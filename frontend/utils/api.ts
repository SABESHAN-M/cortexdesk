/**
 * CortexDesk — Authenticated Backend API Client
 *
 * Provides a typed wrapper around `fetch` that automatically attaches the
 * authenticated user's Supabase JWT access token to backend requests.
 *
 * Architectural & Security Principles:
 * 1. Bearer Token Authorization:
 *    - Reads active session from the official Supabase browser client.
 *    - Injects `Authorization: Bearer <access_token>` on all requests.
 *    - Fails safely with `ApiAuthError` if the user is unauthenticated or token is missing.
 * 2. Origin & Path Safety:
 *    - Restricts requests strictly to relative paths (`/api/...`) resolved against
 *      `NEXT_PUBLIC_API_URL` (default: http://localhost:8000).
 *    - Rejects external protocol URLs (e.g. `https://...`, `//...`) to prevent SSRF / token leakage.
 * 3. Payload & Header Fidelity:
 *    - Preserves all caller-supplied headers, options, and abort signals (`AbortSignal`).
 *    - Automatically sets `Content-Type: application/json` only for JSON-serializable payloads.
 *    - Intentionally omits `Content-Type` for `FormData` to allow the browser to generate
 *      the appropriate `multipart/form-data` boundary.
 * 4. Cold-Start & Timeout Resilience:
 *    - Supports `onSlowRequest` notification callback to detect slow cold starts (> 2000ms).
 *    - Supports configurable timeouts with dedicated `ApiTimeoutError`.
 * 5. Zero Credential Exposure:
 *    - Never logs, echoes, or stores access tokens in error messages, consoles, or storage.
 * 6. Lifecycle Delegation:
 *    - Delegates token refresh to Supabase Auth client session lifecycle.
 */

import { createClient } from "@/utils/supabase/client";

export class ApiAuthError extends Error {
  constructor(message = "Authentication required to access this resource.") {
    super(message);
    this.name = "ApiAuthError";
  }
}

export class ApiNetworkError extends Error {
  public originalError: unknown;
  constructor(
    message = "Network error occurred while contacting the backend.",
    originalError?: unknown
  ) {
    super(message);
    this.name = "ApiNetworkError";
    this.originalError = originalError;
  }
}

export class ApiTimeoutError extends Error {
  public timeoutMs: number;
  constructor(
    message = "Request timed out waiting for backend response.",
    timeoutMs = 45000
  ) {
    super(message);
    this.name = "ApiTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export class ApiResponseError extends Error {
  public status: number;
  public statusText: string;
  public response: Response;
  public data: unknown;

  constructor(response: Response, data?: unknown) {
    super(`Backend API error [${response.status}]: ${response.statusText}`);
    this.name = "ApiResponseError";
    this.status = response.status;
    this.statusText = response.statusText;
    this.response = response;
    this.data = data;
  }
}

/**
 * Resolves the backend base URL dynamically depending on the execution context:
 * 1. Server-side (functions, Server Actions, Route Handlers):
 *    Prefers the internal service binding `BACKEND_URL` injected by Vercel Services.
 * 2. Client-side (browser components):
 *    Uses `NEXT_PUBLIC_API_URL` if configured (e.g. for standalone local dev), or
 *    defaults to relative `/api` when hosted under Vercel's unified services domain.
 */
export function getApiBaseUrl(): string {
  if (typeof window === "undefined" && process.env.BACKEND_URL) {
    return process.env.BACKEND_URL.replace(/\/+$/, "");
  }
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");
  }
  // When running in the browser without an explicit external API URL, use same-domain /api rewrite
  if (typeof window !== "undefined") {
    return "/api";
  }
  return "http://localhost:8000";
}

export const API_BASE_URL = getApiBaseUrl();

/**
 * Validates that an endpoint path is strictly relative and resolves it
 * against the configured backend base URL.
 */
export function resolveBackendUrl(endpoint: string): string {
  if (!endpoint) {
    throw new Error("API endpoint cannot be empty.");
  }

  // Disallow absolute protocol schemes (http:, https:) and protocol-relative URLs (//)
  if (/^(?:[a-z]+:)?\/\//i.test(endpoint)) {
    throw new Error(
      `Invalid endpoint path: "${endpoint}". Authenticated API requests only accept relative backend paths.`
    );
  }

  const cleanPath = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}${cleanPath}`;
}

export interface AuthenticatedApiOptions extends RequestInit {
  /**
   * If true, allows the request to proceed without an Authorization header if no
   * user is currently signed in. Defaults to false (strict authentication required).
   */
  allowAnonymous?: boolean;
  /**
   * Request timeout in milliseconds. If omitted, no automatic timeout is enforced.
   */
  timeoutMs?: number;
  /**
   * Optional callback invoked when the request takes longer than slowThresholdMs
   * (e.g. during a free-tier hosting cold start).
   */
  onSlowRequest?: () => void;
  /**
   * Delay in milliseconds before triggering onSlowRequest. Defaults to 2000ms.
   */
  slowThresholdMs?: number;
}

/**
 * Performs a fetch request to the CortexDesk backend, automatically attaching
 * the active user's Supabase JWT access token as a Bearer authorization header.
 */
export async function authenticatedFetch(
  endpoint: string,
  options: AuthenticatedApiOptions = {}
): Promise<Response> {
  const url = resolveBackendUrl(endpoint);
  const {
    allowAnonymous = false,
    timeoutMs,
    onSlowRequest,
    slowThresholdMs = 2000,
    headers: customHeaders,
    signal: userSignal,
    ...restOptions
  } = options;

  const headers = new Headers(customHeaders);

  // 1. Retrieve session and access token
  let token: string | null = null;
  try {
    const supabase = createClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      throw new ApiAuthError(`Session error: ${sessionError.message}`);
    }

    if (session?.access_token) {
      token = session.access_token.trim();
    }
  } catch (err) {
    if (err instanceof ApiAuthError) throw err;
    if (!allowAnonymous) {
      throw new ApiAuthError(
        "Failed to verify active Supabase authentication session."
      );
    }
  }

  // 2. Enforce token presence unless explicitly anonymous
  if (!token) {
    if (!allowAnonymous) {
      throw new ApiAuthError(
        "No active user session. Sign in is required to perform this request."
      );
    }
  } else {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // 3. Handle Content-Type without corrupting FormData boundaries
  const isFormData =
    typeof FormData !== "undefined" && restOptions.body instanceof FormData;

  if (
    !isFormData &&
    !headers.has("Content-Type") &&
    restOptions.body !== undefined &&
    restOptions.body !== null
  ) {
    if (
      typeof restOptions.body === "object" &&
      !(restOptions.body instanceof Blob) &&
      !(restOptions.body instanceof ArrayBuffer) &&
      !ArrayBuffer.isView(restOptions.body)
    ) {
      restOptions.body = JSON.stringify(restOptions.body);
      headers.set("Content-Type", "application/json");
    }
  }

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  // 4. Set up AbortController, Timeout, and Slow Request Watchers
  const internalController = new AbortController();
  let isTimedOut = false;
  let slowTimer: ReturnType<typeof setTimeout> | null = null;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

  if (onSlowRequest) {
    slowTimer = setTimeout(() => {
      onSlowRequest();
    }, slowThresholdMs);
  }

  if (timeoutMs && timeoutMs > 0) {
    timeoutTimer = setTimeout(() => {
      isTimedOut = true;
      internalController.abort("TIMEOUT");
    }, timeoutMs);
  }

  // Forward external cancellation
  if (userSignal) {
    if (userSignal.aborted) {
      internalController.abort(userSignal.reason);
    } else {
      userSignal.addEventListener("abort", () => {
        internalController.abort(userSignal.reason);
      });
    }
  }

  // 5. Execute fetch with network error boundary and signal propagation
  try {
    const response = await fetch(url, {
      ...restOptions,
      headers,
      signal: internalController.signal,
    });
    return response;
  } catch (err: unknown) {
    if (isTimedOut) {
      throw new ApiTimeoutError(
        `Backend request timed out after ${timeoutMs}ms waiting for response.`,
        timeoutMs
      );
    }
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err; // Preserve natural abort handling for callers
    }
    throw new ApiNetworkError(
      "Failed to connect to backend server. Verify the API service is running.",
      err
    );
  } finally {
    if (slowTimer) clearTimeout(slowTimer);
    if (timeoutTimer) clearTimeout(timeoutTimer);
  }
}

/**
 * High-level helper that invokes `authenticatedFetch`, checks for response.ok,
 * and parses JSON response data.
 */
export async function fetchApi<T = unknown>(
  endpoint: string,
  options?: AuthenticatedApiOptions
): Promise<T> {
  const response = await authenticatedFetch(endpoint, options);

  if (!response.ok) {
    let errorData: unknown = null;
    try {
      errorData = await response.json();
    } catch {
      // Body may not be valid JSON
    }
    throw new ApiResponseError(response, errorData);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

export default authenticatedFetch;
