export default function ProjectLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Top Navigation Skeleton */}
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            <div className="space-y-1">
              <div className="h-4 w-24 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
              <div className="h-3 w-16 bg-zinc-100 dark:bg-zinc-800/60 rounded animate-pulse" />
            </div>
          </div>
          <div className="h-8 w-20 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
        </div>
      </header>

      {/* Main Content Skeleton */}
      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        <div className="space-y-3">
          <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
          <div className="h-8 w-64 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
          <div className="h-4 w-96 bg-zinc-100 dark:bg-zinc-800/60 rounded animate-pulse" />
        </div>

        {/* Chat Box Container Skeleton */}
        <div className="h-[650px] rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="h-6 w-48 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
            <div className="h-20 w-3/4 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl animate-pulse" />
          </div>
          <div className="h-14 w-full bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
        </div>
      </main>
    </div>
  );
}
