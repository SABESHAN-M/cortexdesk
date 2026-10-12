"use client";

import React, { useState } from "react";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);

  const handleGitHubLogin = async () => {
    setIsLoading(true);
    // TODO: Subtask 1.2.3 — Initiate Supabase GitHub OAuth flow here:
    // const supabase = createClient();
    // await supabase.auth.signInWithOAuth({
    //   provider: "github",
    //   options: {
    //     redirectTo: `${window.location.origin}/auth/callback`,
    //   },
    // });
    console.log("GitHub OAuth flow will be triggered here.");
    setIsLoading(false);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4 py-12 transition-colors dark:bg-neutral-950 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        {/* Brand header */}
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-900 text-white shadow-md dark:bg-white dark:text-neutral-950">
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-3xl">
            Welcome to CortexDesk
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Sign in with your GitHub account to access your cognitive workspace.
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="space-y-4">
            <button
              id="github-login-btn"
              type="button"
              onClick={handleGitHubLogin}
              disabled={isLoading}
              className="group relative flex w-full items-center justify-center gap-3 rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-800 shadow-sm transition-all duration-200 hover:bg-neutral-50 hover:text-neutral-950 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-750 dark:focus:ring-white dark:focus:ring-offset-neutral-900"
            >
              {/* GitHub SVG Icon */}
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
              <span>{isLoading ? "Connecting..." : "Continue with GitHub"}</span>
            </button>
          </div>

          <div className="mt-6 border-t border-neutral-100 pt-6 text-center dark:border-neutral-800">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              By continuing, you agree to CortexDesk&apos;s Terms of Service and Privacy Policy.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
