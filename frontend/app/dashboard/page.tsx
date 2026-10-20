import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import LogoutButton from "./logout-button";
import NewProjectDialog from "./new-project-dialog";
import DeleteButton from "./delete-button";

export interface ProjectRecord {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  owner_id: string;
}

export default async function DashboardPage() {
  const supabase = await createClient();

  // 1. Authenticate user server-side
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 2. Fetch user's projects under authenticated session with RLS
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id, title, description, created_at, owner_id")
    .order("created_at", { ascending: false });

  if (projectsError) {
    console.error("Dashboard failed to fetch projects:", projectsError);
  }

  // User metadata resolution
  const userEmail =
    user.email || (user.user_metadata?.email as string | undefined);
  const gitHubUsername =
    (user.user_metadata?.user_name as string | undefined) ||
    (user.user_metadata?.preferred_username as string | undefined);
  const fullName =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined);

  const greetingIdentifier =
    fullName ||
    (gitHubUsername ? `@${gitHubUsername}` : null) ||
    userEmail ||
    "Explorer";

  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
  const projectCount = projects?.length ?? 0;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Top Navigation */}
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
              C
            </div>
            <div>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                CortexDesk
              </span>
              <span className="ml-2 rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                Workspace
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {greetingIdentifier}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {userEmail || "Authenticated User"}
              </p>
            </div>
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={greetingIdentifier}
                width={36}
                height={36}
                unoptimized
                className="h-9 w-9 rounded-full border border-zinc-200 dark:border-zinc-700"
              />
            ) : null}
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Main Dashboard Content */}
      <main className="mx-auto max-w-6xl px-6 py-10 space-y-8">
        {/* Welcome Banner & Summary */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Session Active & Verified</span>
              </div>
              <h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                Welcome back, {greetingIdentifier}
              </h1>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Manage your workspaces, synthesize knowledge, and orchestrate cognitive tasks.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <NewProjectDialog buttonLabel="New Project" />
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-zinc-100 pt-6 dark:border-zinc-800 sm:grid-cols-4">
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Active Projects
              </p>
              <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">
                {projectCount}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Auth Role
              </p>
              <p className="mt-1 text-sm font-semibold capitalize text-zinc-900 dark:text-zinc-100">
                {user.role || "Authenticated"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Database Isolation
              </p>
              <p className="mt-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                RLS Enforced
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Environment
              </p>
              <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {process.env.NODE_ENV || "Development"}
              </p>
            </div>
          </div>
        </div>

        {/* Projects Section */}
        <section aria-labelledby="projects-heading" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2
                id="projects-heading"
                className="text-lg font-bold text-zinc-900 dark:text-zinc-100"
              >
                Workspaces & Projects
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {projectCount === 0
                  ? "No projects currently created"
                  : `Showing ${projectCount} ${
                      projectCount === 1 ? "project" : "projects"
                    }`}
              </p>
            </div>

            {projectCount > 0 && (
              <NewProjectDialog
                buttonLabel="Add Project"
                variant="secondary"
              />
            )}
          </div>

          {/* Error State */}
          {projectsError && (
            <div
              className="rounded-2xl border border-red-200 bg-red-50/50 p-8 text-center dark:border-red-900/60 dark:bg-red-950/20"
              role="alert"
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">
                <svg
                  className="h-6 w-6"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-red-900 dark:text-red-200">
                Unable to load projects
              </h3>

              {projectsError.code === "PGRST205" ||
              projectsError.message?.includes("public.projects") ? (
                <div className="mt-3 text-xs bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 p-4 rounded-xl max-w-lg mx-auto text-left space-y-2">
                  <p className="font-semibold flex items-center gap-1.5 text-amber-900 dark:text-amber-200">
                    <span>⚠️</span> Database Schema Migration Required
                  </p>
                  <p>
                    The <code className="bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded font-mono">public.projects</code> table has not been created in your Supabase project yet.
                  </p>
                  <p className="text-amber-700 dark:text-amber-400">
                    Run the following migrations in your Supabase SQL Editor:
                  </p>
                  <ol className="list-decimal list-inside font-mono text-2xs space-y-1 bg-white/60 dark:bg-black/40 p-2.5 rounded-lg border border-amber-200/60 dark:border-amber-800/60">
                    <li>database/migrations/0001_core.sql</li>
                    <li>database/migrations/0001_core_rls.sql</li>
                  </ol>
                </div>
              ) : (
                <p className="mt-1 text-sm text-red-700 dark:text-red-300 max-w-md mx-auto">
                  {projectsError.message ||
                    "A database query error occurred while fetching your workspace data. Please verify database connectivity and try again."}
                </p>
              )}

              <div className="mt-5">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-red-700 transition"
                >
                  Retry Loading
                </Link>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!projectsError && projectCount === 0 && (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                <svg
                  className="h-7 w-7"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-bold text-zinc-900 dark:text-zinc-100">
                No projects yet
              </h3>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
                Create your first project workspace to start organizing tasks, research, and documents.
              </p>
              <div className="mt-6">
                <NewProjectDialog buttonLabel="Create Your First Project" />
              </div>
            </div>
          )}

          {/* Responsive Projects Grid: 1 col on mobile, 2 cols on tablet, 3 cols on desktop */}
          {!projectsError && projectCount > 0 && (
            <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {(projects as ProjectRecord[]).map((project) => {
                const formattedDate = new Date(project.created_at).toLocaleDateString(
                  "en-US",
                  {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  }
                );

                return (
                  <div
                    key={project.id}
                    className="group relative flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-5 shadow-xs transition hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <Link
                          href={`/projects/${project.id}`}
                          className="font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                        >
                          <span className="line-clamp-1">{project.title}</span>
                        </Link>
                        <DeleteButton
                          projectId={project.id}
                          projectTitle={project.title}
                        />
                      </div>

                      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400 line-clamp-3">
                        {project.description || (
                          <span className="italic text-zinc-400 dark:text-zinc-500">
                            No description provided
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="mt-5 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-2xs text-zinc-400 dark:text-zinc-500">
                      <span>Created {formattedDate}</span>
                      <Link
                        href={`/projects/${project.id}`}
                        className="font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition flex items-center gap-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 rounded"
                      >
                        <span>Open</span>
                        <svg
                          className="h-3 w-3"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M8.25 4.5l7.5 7.5-7.5 7.5"
                          />
                        </svg>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
