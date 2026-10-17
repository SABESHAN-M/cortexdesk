import { redirect } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/utils/supabase/server";
import LogoutButton from "./logout-button";

export default async function DashboardPage() {
  const supabase = await createClient();

  // Read the session and verify authentication on the server
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated visitors to /login
  if (!user) {
    redirect("/login");
  }

  // Retrieve user email or fallback to GitHub username / profile name
  const userEmail =
    user.email || (user.user_metadata?.email as string | undefined);

  const gitHubUsername =
    (user.user_metadata?.user_name as string | undefined) ||
    (user.user_metadata?.preferred_username as string | undefined);

  const fullName =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined);

  // Fallback greeting if email is private on GitHub
  const greetingIdentifier =
    userEmail ||
    (gitHubUsername ? `@${gitHubUsername}` : null) ||
    fullName ||
    "GitHub User";

  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Top Navigation */}
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
              C
            </div>
            <div>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                Cortexdesk
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
                {userEmail ? "Verified GitHub Account" : "Private Email (GitHub)"}
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
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Welcome, {greetingIdentifier}
            </h1>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              You are authenticated with your GitHub credentials. Your secure session is active.
            </p>
          </div>

          {/* Account Details Card */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-800/40">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Account Email
              </p>
              <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {userEmail || "Private on GitHub"}
              </p>
            </div>

            <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-800/40">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                GitHub Username
              </p>
              <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {gitHubUsername ? `@${gitHubUsername}` : "Connected via OAuth"}
              </p>
            </div>

            <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-800/40">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Auth Status
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  Active Session
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
