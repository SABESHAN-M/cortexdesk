"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import ChatBox from "./chat-box";
import LogoutButton from "../app/dashboard/logout-button";

export interface ProjectRecord {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  owner_id: string;
}

export interface UserRecord {
  id: string;
  email?: string;
  user_metadata?: {
    name?: string;
    full_name?: string;
    user_name?: string;
    preferred_username?: string;
    avatar_url?: string;
  };
}

interface ProjectWorkspaceViewProps {
  project: ProjectRecord;
  user: UserRecord;
}

export default function ProjectWorkspaceView({
  project,
  user,
}: ProjectWorkspaceViewProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const formattedDate = new Date(project.created_at).toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );

  const handleCopyProjectId = async () => {
    try {
      await navigator.clipboard.writeText(project.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      // Fallback
    }
  };

  const userEmail = user.email;
  const fullName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    (user.user_metadata?.user_name ? `@${user.user_metadata.user_name}` : null) ||
    userEmail ||
    "Explorer";
  const avatarUrl = user.user_metadata?.avatar_url;

  return (
    <div className="h-screen max-h-screen w-screen overflow-hidden flex flex-col bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 font-sans selection:bg-blue-500/20">
      {/* Top Application Bar (Razor-thin, 52px height) */}
      <header className="h-13 shrink-0 border-b border-zinc-200/80 bg-white/80 dark:border-zinc-800/80 dark:bg-zinc-900/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between z-30 transition-colors">
        {/* Left: Navigation & Workspace Identity */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition py-1 px-1.5 -ml-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/80 focus-visible:outline-2 focus-visible:outline-zinc-500 shrink-0"
            aria-label="Back to dashboard"
          >
            <svg
              className="h-3.5 w-3.5"
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
            <span className="hidden sm:inline">Dashboard</span>
          </Link>

          <span className="text-zinc-300 dark:text-zinc-700 select-none text-xs">/</span>

          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-xs sm:text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[160px] sm:max-w-xs md:max-w-sm">
              {project.title}
            </h1>
            <span className="hidden md:inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-3xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200/60 dark:border-zinc-700/60">
              Workspace
            </span>
          </div>
        </div>

        {/* Right: Controls & Inspector Toggle */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Toggle Project Details Inspector */}
          <button
            type="button"
            onClick={() => setDetailsOpen((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition active:scale-95 focus-visible:outline-2 focus-visible:outline-zinc-500 ${
              detailsOpen
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-transparent shadow-2xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 bg-white/50 dark:bg-zinc-800/50 border-zinc-200/80 dark:border-zinc-700/80 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
            aria-label={detailsOpen ? "Hide project details" : "Show project details"}
            title="Toggle project details"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.75"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
              />
            </svg>
            <span className="text-2xs hidden sm:inline">Details</span>
          </button>

          {/* User profile avatar or initial */}
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={fullName}
              width={26}
              height={26}
              unoptimized
              className="h-6.5 w-6.5 rounded-full border border-zinc-200 dark:border-zinc-700 shrink-0"
            />
          ) : (
            <div className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800 text-3xs font-semibold text-zinc-700 dark:text-zinc-300">
              {fullName.charAt(0).toUpperCase()}
            </div>
          )}

          <LogoutButton />
        </div>
      </header>

      {/* Main Workspace Canvas (Fit to screen) */}
      <div className="flex-1 min-h-0 flex flex-row overflow-hidden relative">
        {/* Main Central Chat Stage */}
        <main className="flex-1 min-w-0 h-full flex flex-col bg-zinc-50/50 dark:bg-[#09090b] overflow-hidden">
          <ChatBox
            projectId={project.id}
            projectTitle={project.title}
            projectDescription={project.description}
          />
        </main>

        {/* Collapsible Slide-over Inspector (Right side) */}
        {detailsOpen && (
          <aside
            className="w-full sm:w-80 md:w-88 shrink-0 h-full border-l border-zinc-200/80 dark:border-zinc-800/80 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl flex flex-col justify-between p-6 overflow-y-auto animate-in slide-in-from-right duration-200 z-20 shadow-xl shadow-zinc-950/5 dark:shadow-black/40"
            aria-label="Project details inspector"
          >
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-2xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Project Inspector
                </span>
                <button
                  type="button"
                  onClick={() => setDetailsOpen(false)}
                  className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                  aria-label="Close inspector"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Title & Description */}
              <div>
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
                  {project.title}
                </h2>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">
                  {project.description || "No project description provided."}
                </p>
              </div>

              {/* Metadata Attributes */}
              <div className="space-y-3 pt-2 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-zinc-100 dark:border-zinc-800/60">
                  <span className="text-zinc-400 dark:text-zinc-500 text-2xs">Created</span>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300 text-2xs">
                    {formattedDate}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-zinc-100 dark:border-zinc-800/60">
                  <span className="text-zinc-400 dark:text-zinc-500 text-2xs">Context Scope</span>
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-3xs font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    RLS Protected
                  </span>
                </div>

                <div className="flex items-center justify-between py-1">
                  <span className="text-zinc-400 dark:text-zinc-500 text-2xs">Project ID</span>
                  <button
                    type="button"
                    onClick={handleCopyProjectId}
                    className="inline-flex items-center gap-1 text-3xs font-mono text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 py-1 px-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                    title="Click to copy full UUID"
                  >
                    <span>{project.id.slice(0, 8)}...</span>
                    {copiedId ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-sans font-semibold">
                        Copied!
                      </span>
                    ) : (
                      <svg
                        className="h-3 w-3 text-zinc-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Shortcuts Reference */}
            <div className="pt-6 border-t border-zinc-100 dark:border-zinc-800 text-3xs text-zinc-400 dark:text-zinc-500 space-y-2">
              <span className="font-semibold text-zinc-600 dark:text-zinc-400 text-2xs block">
                Keyboard Shortcuts
              </span>
              <div className="flex items-center justify-between">
                <span>Send message</span>
                <kbd className="font-mono rounded bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 border border-zinc-200/80 dark:border-zinc-700">
                  Enter
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span>New line</span>
                <kbd className="font-mono rounded bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 border border-zinc-200/80 dark:border-zinc-700">
                  Shift + Enter
                </kbd>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
