"use client";

/**
 * CortexDesk — Project Delete Button Component
 *
 * Implements safe, accessible project deletion with confirmation, loading states,
 * and error feedback. Executes via the server action `deleteProject` to enforce RLS.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteProject } from "./actions";

interface DeleteButtonProps {
  projectId: string;
  projectTitle: string;
}

export default function DeleteButton({
  projectId,
  projectTitle,
}: DeleteButtonProps) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setError(null);

    startTransition(async () => {
      try {
        const result = await deleteProject(projectId);
        if (!result.success) {
          setError(result.error || "Failed to delete project.");
          return;
        }
        setIsConfirming(false);
        router.refresh();
      } catch {
        setError("Network error while deleting project. Please try again.");
      }
    });
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsConfirming(false);
    setError(null);
  };

  const handleTrigger = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsConfirming(true);
    setError(null);
  };

  if (isConfirming) {
    return (
      <div
        className="flex flex-col items-end gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-1.5 bg-white dark:bg-zinc-900 p-1 rounded-lg border border-red-200 dark:border-red-900/60 shadow-xs"
          role="group"
          aria-label={`Confirm deletion of ${projectTitle}`}
        >
          <span className="text-xs font-medium text-red-600 dark:text-red-400 pl-1">
            Delete?
          </span>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white shadow-2xs transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"
            aria-label={`Confirm delete of ${projectTitle}`}
          >
            {isPending ? "Deleting..." : "Yes, delete"}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={isPending}
            className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition hover:bg-zinc-100 dark:hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={handleTrigger}
        disabled={isPending}
        className="rounded-lg p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"
        title="Delete project"
        aria-label={`Delete ${projectTitle}`}
      >
        <svg
          className="h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.75"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
          />
        </svg>
      </button>
      {error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
