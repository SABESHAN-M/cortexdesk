"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

function LoginForm() {
  const searchParams = useSearchParams();
  const urlError =
    searchParams.get("error_description") || searchParams.get("error");
  const nextParam = searchParams.get("next");

  const [errorMessage, setErrorMessage] = useState<string | null>(urlError);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [isGitHubLoading, setIsGitHubLoading] = useState(false);
  const [isMagicLinkLoading, setIsMagicLinkLoading] = useState(false);

  const isBusy = isGitHubLoading || isMagicLinkLoading;

  // 1. GitHub OAuth Login Handler
  const handleGitHubLogin = async () => {
    if (isBusy) return;

    setIsGitHubLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const supabase = createClient();
      const redirectOrigin =
        typeof window !== "undefined" ? window.location.origin : "";

      const callbackUrl = new URL(`${redirectOrigin}/auth/callback`);
      if (nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")) {
        callbackUrl.searchParams.set("next", nextParam);
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: callbackUrl.toString(),
        },
      });

      if (error) {
        setErrorMessage(error.message);
        setIsGitHubLoading(false);
      }
      // On success, Supabase redirects the browser to GitHub OAuth
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while connecting to GitHub.";
      setErrorMessage(message);
      setIsGitHubLoading(false);
    }
  };

  // 2. Email Magic Link Login Handler
  const handleMagicLinkLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBusy || !email.trim()) return;

    setIsMagicLinkLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const supabase = createClient();
      const redirectOrigin =
        typeof window !== "undefined" ? window.location.origin : "";

      const callbackUrl = new URL(`${redirectOrigin}/auth/callback`);
      if (nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")) {
        callbackUrl.searchParams.set("next", nextParam);
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: callbackUrl.toString(),
        },
      });

      if (error) {
        setErrorMessage(error.message);
      } else {
        setSuccessMessage(
          `Magic link sent! Check ${email} for your secure login link.`
        );
        setEmail("");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to send magic link. Please try again.";
      setErrorMessage(message);
    } finally {
      setIsMagicLinkLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
      {/* Brand Header */}
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
          C
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Sign in to CortexDesk
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Access your AI-augmented personal cognitive workspace
        </p>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div
          role="alert"
          aria-live="polite"
          className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400"
        >
          <p className="font-medium">Authentication Error</p>
          <p className="mt-0.5 text-xs">{errorMessage}</p>
        </div>
      )}

      {/* Success Alert */}
      {successMessage && (
        <div
          role="status"
          aria-live="polite"
          className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400"
        >
          <p className="font-medium">Email Sent</p>
          <p className="mt-0.5 text-xs">{successMessage}</p>
        </div>
      )}

      {/* Primary Action: GitHub OAuth */}
      <div className="mt-6">
        <button
          type="button"
          onClick={handleGitHubLogin}
          disabled={isBusy}
          aria-busy={isGitHubLoading}
          className="group relative flex w-full items-center justify-center gap-3 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:focus-visible:ring-zinc-300"
        >
          {isGitHubLoading ? (
            <svg
              className="h-5 w-5 animate-spin text-current"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <svg
              className="h-5 w-5 fill-current"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              />
            </svg>
          )}
          <span>
            {isGitHubLoading ? "Connecting to GitHub..." : "Continue with GitHub"}
          </span>
        </button>
      </div>

      {/* Divider */}
      <div className="relative my-6 flex items-center justify-center">
        <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
        <span className="absolute bg-white px-3 text-xs font-medium uppercase tracking-wider text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500">
          or
        </span>
      </div>

      {/* Secondary Action: Email Magic Link */}
      <form onSubmit={handleMagicLinkLogin} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
          >
            Email address
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isBusy}
            placeholder="name@example.com"
            autoComplete="email"
            className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 shadow-2xs transition focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
          />
        </div>

        <button
          type="submit"
          disabled={isBusy || !email.trim()}
          aria-busy={isMagicLinkLoading}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 shadow-2xs transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700/80 dark:focus-visible:ring-zinc-300"
        >
          {isMagicLinkLoading ? (
            <>
              <svg
                className="h-4 w-4 animate-spin text-current"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>Sending magic link...</span>
            </>
          ) : (
            <span>Send Magic Link</span>
          )}
        </button>
      </form>

      {/* Footer Notice */}
      <div className="mt-8 text-center text-xs text-zinc-500 dark:text-zinc-500">
        By continuing, you agree to CortexDesk terms and privacy policies.
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-black">
      <Suspense
        fallback={
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            Loading sign in...
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
