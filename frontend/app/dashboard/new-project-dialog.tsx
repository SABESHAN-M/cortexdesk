"use client";

/**
 * CortexDesk — New Project Dialog Modal
 *
 * Implements an accessible, mobile-responsive modal dialog for creating
 * project workspaces with client-side feedback and authoritative Server Action execution.
 */

import { useState, useTransition, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "./actions";

interface NewProjectDialogProps {
  buttonLabel?: string;
  className?: string;
  variant?: "primary" | "secondary";
}

export default function NewProjectDialog({
  buttonLabel = "New Project",
  className = "",
  variant = "primary",
}: NewProjectDialogProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [clientErrors, setClientErrors] = useState<{
    title?: string;
    description?: string;
  }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const titleInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    if (isPending) return;
    setIsOpen(false);
    setClientErrors({});
    setServerError(null);
  }, [isPending]);

  const handleOpen = () => {
    setTitle("");
    setDescription("");
    setClientErrors({});
    setServerError(null);
    setIsOpen(true);
  };

  // Focus the title input when dialog opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        titleInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle ESC key to dismiss dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isPending) {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isPending, handleClose]);

  const validateForm = (): boolean => {
    const errors: { title?: string; description?: string } = {};
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      errors.title = "Project title is required.";
    } else if (trimmedTitle.length > 120) {
      errors.title = "Project title cannot exceed 120 characters.";
    }

    if (description.trim().length > 2000) {
      errors.description = "Description cannot exceed 2000 characters.";
    }

    setClientErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;

    if (!validateForm()) {
      return;
    }

    setServerError(null);

    startTransition(async () => {
      try {
        const result = await createProject({
          title,
          description: description || null,
        });

        if (!result.success) {
          if (result.fieldErrors) {
            setClientErrors({
              title: result.fieldErrors.title?.[0],
              description: result.fieldErrors.description?.[0],
            });
          }
          setServerError(result.error || "Failed to create project.");
          return;
        }

        // Success: close modal and refresh route
        setIsOpen(false);
        router.refresh();
      } catch {
        setServerError("A network error occurred. Please try again.");
      }
    });
  };

  const triggerButtonStyles =
    variant === "primary"
      ? "inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:focus-visible:ring-zinc-300"
      : "inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-900 dark:text-zinc-100 shadow-2xs transition hover:bg-zinc-50 dark:hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400";

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={`${triggerButtonStyles} ${className}`}
      >
        <svg
          className="h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
        <span>{buttonLabel}</span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-project-title"
          aria-describedby="new-project-desc"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Modal Card */}
          <div
            ref={dialogRef}
            className="relative w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 sm:p-8"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <h2
                  id="new-project-title"
                  className="text-lg font-bold text-zinc-900 dark:text-zinc-100"
                >
                  Create New Project
                </h2>
                <p
                  id="new-project-desc"
                  className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5"
                >
                  Workspaces group tasks, synthesis notes, and research documents.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={isPending}
                className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                aria-label="Close dialog"
              >
                <svg
                  className="h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              {serverError && (
                <div
                  className="rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900"
                  role="alert"
                >
                  {serverError}
                </div>
              )}

              {/* Title Field */}
              <div>
                <div className="flex justify-between items-center">
                  <label
                    htmlFor="project-title"
                    className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
                  >
                    Project Title <span className="text-red-500">*</span>
                  </label>
                  <span
                    className={`text-2xs ${
                      title.length > 120
                        ? "text-red-500 font-bold"
                        : "text-zinc-400"
                    }`}
                  >
                    {title.length}/120
                  </span>
                </div>
                <input
                  ref={titleInputRef}
                  id="project-title"
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (clientErrors.title) {
                      setClientErrors((prev) => ({ ...prev, title: undefined }));
                    }
                  }}
                  disabled={isPending}
                  placeholder="e.g. Cognitive Engine v2"
                  maxLength={130}
                  className={`mt-1.5 w-full rounded-lg border px-3.5 py-2 text-sm text-zinc-900 placeholder-zinc-400 dark:text-zinc-100 dark:placeholder-zinc-500 focus-visible:outline-none focus-visible:ring-2 disabled:bg-zinc-100 dark:disabled:bg-zinc-800 disabled:opacity-70 ${
                    clientErrors.title
                      ? "border-red-500 focus-visible:ring-red-500"
                      : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200"
                  }`}
                  aria-invalid={Boolean(clientErrors.title)}
                  aria-describedby={
                    clientErrors.title ? "title-error" : undefined
                  }
                />
                {clientErrors.title && (
                  <p id="title-error" className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
                    {clientErrors.title}
                  </p>
                )}
              </div>

              {/* Description Field */}
              <div>
                <div className="flex justify-between items-center">
                  <label
                    htmlFor="project-desc"
                    className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
                  >
                    Description{" "}
                    <span className="text-zinc-400 text-3xs font-normal normal-case">
                      (optional)
                    </span>
                  </label>
                  <span
                    className={`text-2xs ${
                      description.length > 2000
                        ? "text-red-500 font-bold"
                        : "text-zinc-400"
                    }`}
                  >
                    {description.length}/2000
                  </span>
                </div>
                <textarea
                  id="project-desc"
                  rows={3}
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    if (clientErrors.description) {
                      setClientErrors((prev) => ({
                        ...prev,
                        description: undefined,
                      }));
                    }
                  }}
                  disabled={isPending}
                  placeholder="Summarize the core objectives, architecture, or references..."
                  maxLength={2100}
                  className={`mt-1.5 w-full rounded-lg border px-3.5 py-2 text-sm text-zinc-900 placeholder-zinc-400 dark:text-zinc-100 dark:placeholder-zinc-500 focus-visible:outline-none focus-visible:ring-2 disabled:bg-zinc-100 dark:disabled:bg-zinc-800 disabled:opacity-70 resize-none ${
                    clientErrors.description
                      ? "border-red-500 focus-visible:ring-red-500"
                      : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200"
                  }`}
                  aria-invalid={Boolean(clientErrors.description)}
                  aria-describedby={
                    clientErrors.description ? "desc-error" : undefined
                  }
                />
                {clientErrors.description && (
                  <p id="desc-error" className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
                    {clientErrors.description}
                  </p>
                )}
              </div>

              {/* Footer CTA */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isPending}
                  className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 transition hover:bg-zinc-50 dark:hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:focus-visible:ring-zinc-300 disabled:opacity-50"
                >
                  {isPending ? (
                    <>
                      <svg
                        className="h-4 w-4 animate-spin text-current"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create Project</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
