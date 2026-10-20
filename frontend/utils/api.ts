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
 * 4. Zero Credential Exposure:
 *    - Never logs, echoes, or stores access tokens in error messages, consoles, or storage.
 * 5. Lifecycle Delegation:
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

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");

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
  return `${API_BASE_URL}${cleanPath}`;
}

export interface AuthenticatedApiOptions extends RequestInit {
  /**
   * If true, allows the request to proceed without an Authorization header if no
   * user is currently signed in. Defaults to false (strict authentication required).
   */
  allowAnonymous?: boolean;
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
    headers: customHeaders,
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
    // If body is an object that is not a binary stream/blob, auto-serialize
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

  // 4. Execute fetch with network error boundary and signal propagation
  try {
    return await fetch(url, {
      ...restOptions,
      headers,
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err; // Preserve natural abort handling for callers
    }
    throw new ApiNetworkError(
      "Failed to connect to backend server. Verify the API service is running.",
      err
    );
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
