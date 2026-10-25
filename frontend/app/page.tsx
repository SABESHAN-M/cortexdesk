import Link from "next/link";
import { ApiStatus } from "@/components/api-status";
import { createClient } from "@/utils/supabase/server";

export default async function HomePage() {
  let user = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data?.user || null;
  } catch {
    // Graceful fallback if Supabase credentials are placeholder in development
    user = null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900 transition-colors dark:bg-zinc-950 dark:text-zinc-100">
      {/* Navigation Header */}
      <header className="border-b border-zinc-200/80 bg-white/70 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-900/70">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 font-semibold text-white shadow-xs dark:bg-zinc-100 dark:text-zinc-900">
              C
            </div>
            <span className="text-base font-semibold tracking-tight">
              CortexDesk
            </span>
          </div>

          <nav aria-label="Quick links" className="flex items-center gap-3">
            <span className="rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              Foundation 1.2
            </span>
            {user ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Dashboard &rarr;
              </Link>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <div className="max-w-3xl">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            AI-Augmented Cognitive Workspace
          </div>

          {/* Product Heading */}
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl sm:leading-tight">
            CortexDesk
          </h1>

          {/* API Status Component Placed Immediately Beneath Product Heading */}
          <div className="mt-4 flex justify-center">
            <ApiStatus />
          </div>

          {/* Product Description */}
          <p className="mt-6 text-lg leading-relaxed text-zinc-600 sm:text-xl dark:text-zinc-400">
            An AI-augmented personal cognitive workspace engineered for focused
            thinking, knowledge synthesis, and contextual task execution.
          </p>

          {/* Primary Call to Action */}
          <div className="mt-8 flex items-center justify-center gap-4">
            {user ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Open Workspace Dashboard &rarr;
              </Link>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Sign in to Workspace &rarr;
              </Link>
            )}
          </div>
        </div>

        {/* Foundation Pillars */}
        <section
          aria-label="Core architecture foundations"
          className="mt-16 grid w-full grid-cols-1 gap-6 text-left sm:grid-cols-3"
        >
          <article className="rounded-xl border border-zinc-200/80 bg-white p-6 shadow-xs transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-zinc-700">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <h2 className="mt-4 text-base font-semibold">
              FastAPI Agentic Backend
            </h2>
            <p className="mt-2 text-sm leading-normal text-zinc-600 dark:text-zinc-400">
              High-performance asynchronous API service orchestrating agent
              tools, background workers, and streaming responses.
            </p>
          </article>

          <article className="rounded-xl border border-zinc-200/80 bg-white p-6 shadow-xs transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-zinc-700">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 7v10c0 2 1.5 3 3.5 3h9c2 0 3.5-1 3.5-3V7c0-2-1.5-3-3.5-3h-9C5.5 4 4 5 4 7z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h6M9 16h6M9 8h2"
                />
              </svg>
            </div>
            <h2 className="mt-4 text-base font-semibold">
              Next.js Web Experience
            </h2>
            <p className="mt-2 text-sm leading-normal text-zinc-600 dark:text-zinc-400">
              Responsive App Router frontend built with TypeScript, Tailwind
              CSS, and accessible interactive components.
            </p>
          </article>

          <article className="rounded-xl border border-zinc-200/80 bg-white p-6 shadow-xs transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-zinc-700">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </div>
            <h2 className="mt-4 text-base font-semibold">
              PostgreSQL & pgvector
            </h2>
            <p className="mt-2 text-sm leading-normal text-zinc-600 dark:text-zinc-400">
              Persistent local vector storage container for embeddings, document
              chunks, and hybrid similarity search.
            </p>
          </article>
        </section>
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-zinc-200/80 bg-white/50 py-6 text-center text-xs text-zinc-500 dark:border-zinc-800/80 dark:bg-zinc-950/50 dark:text-zinc-400">
        <p>CortexDesk Workspace — Milestone 1.2 Authentication Foundation</p>
      </footer>
    </div>
  );
}