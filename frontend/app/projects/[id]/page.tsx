import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import ChatBox from "@/components/chat-box";
import LogoutButton from "../../dashboard/logout-button";

interface ProjectPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: ProjectPageProps) {
  const { id } = await params;

  // 1. Authenticate user server-side
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/projects/${encodeURIComponent(id)}`);
  }

  // 2. Fetch project with row-level security (RLS) enforcement
  // Queries execute under the caller's verified token; unowned or nonexistent rows return null.
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, title, description, created_at, owner_id")
    .eq("id", id)
    .maybeSingle();

  if (projectError || !project) {
    // Uniform 404 response to avoid cross-tenant existence disclosure
    notFound();
  }

  const formattedDate = new Date(project.created_at).toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Top Navigation */}
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white transition rounded py-1 px-1.5 -ml-1.5 focus-visible:outline-2 focus-visible:outline-zinc-500"
              aria-label="Back to dashboard"
            >
              <svg
                className="h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
                />
              </svg>
              <span>Dashboard</span>
            </Link>

            <span className="text-zinc-300 dark:text-zinc-700">/</span>

            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm line-clamp-1 max-w-[200px] sm:max-w-xs">
                {project.title}
              </span>
              <span className="hidden sm:inline-flex rounded-md bg-zinc-100 px-2 py-0.5 text-2xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                Workspace
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Main Workspace Content */}
      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        {/* Project Header Banner */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                <span>Project Workspace</span>
              </div>
              <h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                {project.title}
              </h1>
              {project.description ? (
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 max-w-3xl leading-relaxed">
                  {project.description}
                </p>
              ) : (
                <p className="mt-1 text-xs italic text-zinc-400 dark:text-zinc-500">
                  No description provided for this workspace.
                </p>
              )}
            </div>

            <div className="flex sm:flex-col items-start sm:items-end justify-between text-2xs text-zinc-400 dark:text-zinc-500 shrink-0">
              <span>Created on {formattedDate}</span>
              <span className="font-mono text-3xs mt-1 text-zinc-400">
                ID: {project.id.slice(0, 8)}...
              </span>
            </div>
          </div>
        </div>

        {/* Embedded AI Chat Box */}
        <section aria-labelledby="chat-section-heading">
          <h2 id="chat-section-heading" className="sr-only">
            Project Assistant Chat
          </h2>
          <ChatBox projectId={project.id} projectTitle={project.title} />
        </section>
      </main>
    </div>
  );
}
