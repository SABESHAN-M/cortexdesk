export default function ProjectLoading() {
  return (
    <div className="h-screen max-h-screen w-screen overflow-hidden flex flex-col bg-zinc-50 dark:bg-[#09090b]">
      {/* Top Navigation Skeleton (h-13) */}
      <header className="h-13 shrink-0 border-b border-zinc-200/80 bg-white/80 dark:border-zinc-800/80 dark:bg-zinc-900/80 px-4 sm:px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-5 w-20 bg-zinc-200 dark:bg-zinc-800 rounded-md animate-pulse" />
          <span className="text-zinc-300 dark:text-zinc-700 select-none text-xs">/</span>
          <div className="h-5 w-32 bg-zinc-200 dark:bg-zinc-800 rounded-md animate-pulse" />
        </div>
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-16 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
          <div className="h-6.5 w-6.5 rounded-full bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
          <div className="h-7 w-16 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
        </div>
      </header>

      {/* Main Workspace Canvas Skeleton */}
      <main className="flex-1 min-w-0 h-full flex flex-col justify-between p-6 sm:p-8 max-w-3xl mx-auto w-full">
        <div className="space-y-4 pt-16 flex flex-col items-center">
          <div className="h-12 w-12 rounded-2xl bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
          <div className="h-7 w-64 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
          <div className="h-4 w-80 bg-zinc-100 dark:bg-zinc-800/60 rounded animate-pulse" />
        </div>

        <div className="w-full pb-4">
          <div className="h-20 w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 animate-pulse" />
        </div>
      </main>
    </div>
  );
}
