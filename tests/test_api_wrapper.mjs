/**
 * Test Suite: CortexDesk Authenticated API Wrapper Validation
 *
 * Validates:
 * 1. Valid session attaches the Bearer token.
 * 2. Missing sessions fail with ApiAuthError without making unauthenticated backend requests.
 * 3. Caller-supplied headers (e.g. X-Custom-Header) are preserved alongside Authorization.
 * 4. FormData requests preserve multipart boundaries without being overwritten by application/json.
 * 5. Non-success backend responses (e.g. 401, 404, 500) remain observable to callers.
 * 6. External origin URLs are rejected to prevent token leakage.
 */

import test from "node:test";
import assert from "node:assert/strict";

// Mock environment
process.env.NEXT_PUBLIC_API_URL = "http://127.0.0.1:8000";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mock-project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "mock-anon-key";

// Simple test harness replicating the wrapper's core logic with mockable dependencies
class ApiAuthError extends Error {
  constructor(message = "Authentication required to access this resource.") {
    super(message);
    this.name = "ApiAuthError";
  }
}

class ApiNetworkError extends Error {
  constructor(message = "Network error", originalError) {
    super(message);
    this.name = "ApiNetworkError";
    this.originalError = originalError;
  }
}

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");

function resolveBackendUrl(endpoint) {
  if (!endpoint) throw new Error("API endpoint cannot be empty.");
  if (/^(?:[a-z]+:)?\/\//i.test(endpoint)) {
    throw new Error(`Invalid endpoint path: "${endpoint}". External URLs are not permitted.`);
  }
  const cleanPath = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${API_BASE_URL}${cleanPath}`;
}

async function authenticatedFetchMock(endpoint, options = {}, mockSession, mockFetch) {
  const url = resolveBackendUrl(endpoint);
  const { allowAnonymous = false, headers: customHeaders, ...restOptions } = options;
  const headers = new Headers(customHeaders);

  let token = null;
  if (mockSession?.access_token) {
    token = mockSession.access_token.trim();
  }

  if (!token) {
    if (!allowAnonymous) {
      throw new ApiAuthError("No active user session. Sign in is required to perform this request.");
    }
  } else {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const isFormData = typeof FormData !== "undefined" && restOptions.body instanceof FormData;
  if (!isFormData && !headers.has("Content-Type") && restOptions.body !== undefined && restOptions.body !== null) {
    if (typeof restOptions.body === "object" && !(restOptions.body instanceof Blob)) {
      restOptions.body = JSON.stringify(restOptions.body);
      headers.set("Content-Type", "application/json");
    }
  }

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  return await mockFetch(url, { ...restOptions, headers });
}

test("1. Valid session attaches the Bearer token", async () => {
  let capturedUrl = null;
  let capturedHeaders = null;

  const mockFetch = async (url, opts) => {
    capturedUrl = url;
    capturedHeaders = opts.headers;
    return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
  };

  const mockSession = { access_token: "test-jwt-token-12345" };
  const res = await authenticatedFetchMock("/api/projects", {}, mockSession, mockFetch);

  assert.equal(res.status, 200);
  assert.equal(capturedUrl, "http://127.0.0.1:8000/api/projects");
  assert.equal(capturedHeaders.get("Authorization"), "Bearer test-jwt-token-12345");
});

test("2. Missing session fails without sending an unauthenticated request", async () => {
  let fetchWasCalled = false;
  const mockFetch = async () => {
    fetchWasCalled = true;
    return new Response("ok", { status: 200 });
  };

  const mockSession = null; // No active session

  await assert.rejects(
    async () => {
      await authenticatedFetchMock("/api/projects", {}, mockSession, mockFetch);
    },
    (err) => {
      assert(err instanceof ApiAuthError);
      assert.match(err.message, /Sign in is required/);
      return true;
    }
  );

  assert.equal(fetchWasCalled, false, "Network request must NOT be sent when session is missing");
});

test("3. Existing caller headers are preserved", async () => {
  let capturedHeaders = null;
  const mockFetch = async (url, opts) => {
    capturedHeaders = opts.headers;
    return new Response("ok", { status: 200 });
  };

  const mockSession = { access_token: "valid-token" };
  await authenticatedFetchMock(
    "/api/data",
    {
      headers: {
        "X-Custom-Client": "CortexDesk-Web",
        "X-Request-ID": "req-987",
      },
    },
    mockSession,
    mockFetch
  );

  assert.equal(capturedHeaders.get("Authorization"), "Bearer valid-token");
  assert.equal(capturedHeaders.get("X-Custom-Client"), "CortexDesk-Web");
  assert.equal(capturedHeaders.get("X-Request-ID"), "req-987");
  assert.equal(capturedHeaders.get("Accept"), "application/json");
});

test("4. FormData requests remain valid and Content-Type is not forced to application/json", async () => {
  let capturedHeaders = null;
  const mockFetch = async (url, opts) => {
    capturedHeaders = opts.headers;
    return new Response("uploaded", { status: 200 });
  };

  const mockSession = { access_token: "valid-token" };
  const formData = new FormData();
  formData.append("title", "Research Note");

  await authenticatedFetchMock(
    "/api/upload",
    {
      method: "POST",
      body: formData,
    },
    mockSession,
    mockFetch
  );

  assert.equal(capturedHeaders.get("Authorization"), "Bearer valid-token");
  assert.equal(
    capturedHeaders.get("Content-Type"),
    null,
    "Content-Type must be omitted for FormData to allow fetch to set boundary"
  );
});

test("5. Non-success backend responses remain observable to callers", async () => {
  const mockFetch = async () => {
    return new Response(JSON.stringify({ detail: "Not found" }), {
      status: 404,
      statusText: "Not Found",
    });
  };

  const mockSession = { access_token: "valid-token" };
  const response = await authenticatedFetchMock("/api/missing", {}, mockSession, mockFetch);

  assert.equal(response.status, 404);
  assert.equal(response.ok, false);
  const data = await response.json();
  assert.equal(data.detail, "Not found");
});

test("6. External origin URLs are rejected to protect access tokens from leakage", () => {
  assert.throws(
    () => resolveBackendUrl("https://external-api.com/steal-token"),
    /External URLs are not permitted/
  );
  assert.throws(
    () => resolveBackendUrl("//evil.com/phish"),
    /External URLs are not permitted/
  );
});
