/**
 * CortexDesk — Dashboard Route Loading UI (Task 1.3.5)
 *
 * Provides instant feedback during server-side navigation and initial data load.
 * Respects `motion-reduce:animate-none`.
 */

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Top Navigation Skeleton */}
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse motion-reduce:animate-none" />
            <div className="h-5 w-28 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse motion-reduce:animate-none" />
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:block space-y-1">
              <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse motion-reduce:animate-none ml-auto" />
              <div className="h-3 w-40 rounded bg-zinc-100 dark:bg-zinc-800/60 animate-pulse motion-reduce:animate-none ml-auto" />
            </div>
            <div className="h-9 w-20 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse motion-reduce:animate-none" />
          </div>
        </div>
      </header>

      {/* Main Content Skeleton */}
      <main className="mx-auto max-w-6xl px-6 py-10 space-y-8">
        {/* Banner Skeleton */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
          <div className="h-8 w-64 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse motion-reduce:animate-none" />
          <div className="h-4 w-96 max-w-full rounded bg-zinc-100 dark:bg-zinc-800/60 animate-pulse motion-reduce:animate-none" />
        </div>

        {/* Section Header */}
        <div className="flex items-center justify-between pt-4">
          <div className="space-y-1">
            <div className="h-6 w-32 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse motion-reduce:animate-none" />
            <div className="h-4 w-48 rounded bg-zinc-100 dark:bg-zinc-800/60 animate-pulse motion-reduce:animate-none" />
          </div>
          <div className="h-9 w-32 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse motion-reduce:animate-none" />
        </div>

        {/* Projects Grid Skeleton (1 col phone, 2 col tablet, 3 col desktop) */}
        <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-4"
            >
              <div className="flex items-start justify-between">
                <div className="h-5 w-40 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse motion-reduce:animate-none" />
                <div className="h-6 w-6 rounded bg-zinc-100 dark:bg-zinc-800/60 animate-pulse motion-reduce:animate-none" />
              </div>
              <div className="space-y-2">
                <div className="h-3.5 w-full rounded bg-zinc-100 dark:bg-zinc-800/60 animate-pulse motion-reduce:animate-none" />
                <div className="h-3.5 w-3/4 rounded bg-zinc-100 dark:bg-zinc-800/60 animate-pulse motion-reduce:animate-none" />
              </div>
              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
                <div className="h-3 w-24 rounded bg-zinc-100 dark:bg-zinc-800/60 animate-pulse motion-reduce:animate-none" />
                <div className="h-4 w-12 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse motion-reduce:animate-none" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
