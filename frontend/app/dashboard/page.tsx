import LogoutButton from "./logout-button";

export default function DashboardPage() {
  const placeholderEmail = "demo@example.com";

  return (
    <main className="min-h-screen bg-neutral-50 p-6 text-neutral-900 transition-colors dark:bg-neutral-950 dark:text-neutral-50 sm:p-10">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Top Navigation Bar / Header */}
        <header className="flex flex-col gap-4 border-b border-neutral-200 pb-6 dark:border-neutral-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-900 text-white shadow-sm dark:bg-white dark:text-neutral-950">
                <svg
                  className="h-5 w-5"
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
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Welcome, <span className="font-semibold text-neutral-900 dark:text-neutral-200">{placeholderEmail}</span>
            </p>
          </div>

          <div className="flex items-center gap-4">
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-400/30">
              Demo Mode
            </span>
            <LogoutButton />
          </div>
        </header>

        {/* Demo Mode Notice Banner */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
          <div className="flex items-start gap-3">
            <svg
              className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="text-sm">
              <p className="font-semibold">Demo account — authentication is not enabled.</p>
              <p className="mt-0.5 text-amber-700 dark:text-amber-400/90">
                You are currently viewing a placeholder dashboard preview. Real session checks and protected route redirects will be connected in future subtasks.
              </p>
            </div>
          </div>
        </div>

        {/* Dashboard Workspace Overview Card */}
        <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-base font-semibold">Active Projects</h2>
            <p className="mt-1 text-2xl font-bold tracking-tight">0</p>
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              Create your first project once connected.
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-base font-semibold">Cognitive Agent</h2>
            <p className="mt-1 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">Standby</p>
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              FastAPI backend is ready at port 8000.
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-base font-semibold">Auth Status</h2>
            <p className="mt-1 text-2xl font-bold tracking-tight text-neutral-400">Unauthenticated</p>
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              Supabase OAuth flow pending integration.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
