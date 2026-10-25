"use client";

import { useEffect, useState } from "react";

import { authenticatedFetch } from "@/utils/api";

type ApiState = "loading" | "ok" | "error";

export function ApiStatus() {
  const [state, setState] = useState<ApiState>("loading");

  useEffect(() => {
    const controller = new AbortController();

    async function checkHealth() {
      try {
        const response = await authenticatedFetch("/health", {
          allowAnonymous: true,
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          setState("error");
          return;
        }

        const data = await response.json();
        if (data && data.status === "ok") {
          setState("ok");
        } else {
          setState("error");
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setState("error");
      }
    }

    checkHealth();

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-3.5 py-1.5 text-xs font-medium shadow-xs backdrop-blur-xs transition dark:border-zinc-800 dark:bg-zinc-900/80"
    >
      <span className="relative flex h-2 w-2" aria-hidden="true">
        {state === "loading" && (
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
        )}
        {state === "ok" && (
          <>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </>
        )}
        {state === "error" && (
          <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
        )}
      </span>

      <span className="text-zinc-600 dark:text-zinc-400">
        {state === "loading" && "API: checking..."}
        {state === "ok" && (
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            API: ok
          </span>
        )}
        {state === "error" && (
          <span className="font-medium text-rose-600 dark:text-rose-400">
            API: unavailable
          </span>
        )}
      </span>
    </div>
  );
}

export default ApiStatus;
