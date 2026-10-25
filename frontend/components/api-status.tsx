"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { authenticatedFetch } from "@/utils/api";

export type ApiConnectionState =
  | "checking"     // Initial check (< 2s)
  | "waking"       // Slow response detected (> 2s), free-tier server cold start
  | "connected"    // Health endpoint returned 200 OK
  | "http_error"   // Backend returned non-200 HTTP response
  | "unavailable"; // Network error or connection timeout

export interface ApiStatusProps {
  /**
   * Threshold in milliseconds before switching from 'checking' to 'waking'.
   * Defaults to 2000ms (2 seconds).
   */
  slowThresholdMs?: number;
  /**
   * Request timeout in milliseconds before marking the service as unavailable.
   * Defaults to 45000ms (45 seconds, accounting for Render/Koyeb cold starts).
   */
  timeoutMs?: number;
}

export function ApiStatus({
  slowThresholdMs = 2000,
  timeoutMs = 45000,
}: ApiStatusProps) {
  const [state, setState] = useState<ApiConnectionState>("checking");
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const inFlightRef = useRef<boolean>(false);
  const activeControllerRef = useRef<AbortController | null>(null);

  const runHealthCheck = useCallback(
    (controller: AbortController, onComplete: () => void) => {
      const slowTimer = setTimeout(() => {
        setState("waking");
      }, slowThresholdMs);

      const timeoutTimer = setTimeout(() => {
        controller.abort("TIMEOUT");
      }, timeoutMs);

      authenticatedFetch("/health", {
        allowAnonymous: true,
        signal: controller.signal,
        headers: { Accept: "application/json" },
      })
        .then(async (response) => {
          clearTimeout(slowTimer);
          clearTimeout(timeoutTimer);
          setHttpStatus(response.status);
          if (response.ok) {
            const data = await response.json();
            if (data && data.status === "ok") {
              setState("connected");
            } else {
              setState("http_error");
            }
          } else {
            setState("http_error");
          }
        })
        .catch((err: unknown) => {
          clearTimeout(slowTimer);
          clearTimeout(timeoutTimer);
          if (err instanceof DOMException && err.name === "AbortError") {
            if (controller.signal.reason === "TIMEOUT") {
              setState("unavailable");
            }
            return;
          }
          setState("unavailable");
        })
        .finally(() => {
          onComplete();
        });

      return () => {
        clearTimeout(slowTimer);
        clearTimeout(timeoutTimer);
      };
    },
    [slowThresholdMs, timeoutMs]
  );

  const handleRetry = useCallback(() => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setState("checking");
    setHttpStatus(null);

    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }
    const controller = new AbortController();
    activeControllerRef.current = controller;

    runHealthCheck(controller, () => {
      inFlightRef.current = false;
    });
  }, [runHealthCheck]);

  useEffect(() => {
    inFlightRef.current = true;
    const controller = new AbortController();
    activeControllerRef.current = controller;

    const cleanupTimers = runHealthCheck(controller, () => {
      inFlightRef.current = false;
    });

    return () => {
      cleanupTimers();
      controller.abort();
    };
  }, [runHealthCheck]);

  const isLoading = state === "checking" || state === "waking";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={isLoading}
      className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/90 px-3.5 py-1.5 text-xs font-medium shadow-xs backdrop-blur-xs transition dark:border-zinc-800 dark:bg-zinc-900/90"
    >
      {/* Visual Indicator Status Dot */}
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
        {state === "checking" && (
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
        )}

        {state === "waking" && (
          <>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
          </>
        )}

        {state === "connected" && (
          <>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </>
        )}

        {state === "http_error" && (
          <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
        )}

        {state === "unavailable" && (
          <span className="relative inline-flex h-2 w-2 rounded-full bg-zinc-400 dark:bg-zinc-600" />
        )}
      </span>

      {/* Message Label */}
      <span className="text-zinc-600 dark:text-zinc-300">
        {state === "checking" && "API: checking..."}

        {state === "waking" && (
          <span className="text-amber-600 dark:text-amber-400 font-medium animate-pulse">
            Waking up the server…
          </span>
        )}

        {state === "connected" && (
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            API: connected
          </span>
        )}

        {state === "http_error" && (
          <span className="font-medium text-rose-600 dark:text-rose-400">
            API: error {httpStatus ? `(${httpStatus})` : ""}
          </span>
        )}

        {state === "unavailable" && (
          <span className="font-medium text-zinc-500 dark:text-zinc-400">
            API: unavailable
          </span>
        )}
      </span>

      {/* Clear, Accessible Retry Action */}
      {(state === "http_error" || state === "unavailable") && (
        <button
          type="button"
          onClick={handleRetry}
          aria-label="Retry backend connection check"
          className="ml-1 cursor-pointer rounded px-1.5 py-0.5 text-[10px] font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export default ApiStatus;
