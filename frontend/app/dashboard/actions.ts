"use server";

/**
 * CortexDesk — Dashboard Project Server Actions (Task 1.3.3)
 *
 * Implements authenticated Server Actions for project creation and deletion.
 *
 * Security & RLS Principles:
 * 1. Uses the user-scoped server Supabase client (`@/utils/supabase/server`), preserving
 *    the active session and enforcing PostgreSQL Row Level Security (RLS). Never uses
 *    service-role privileges.
 * 2. Identity is securely retrieved via `supabase.auth.getUser()`. Never trusts
 *    client-supplied `owner_id`.
 * 3. Enforces server-side validation for title (1-120 chars), description (<= 2000 chars),
 *    and UUID format.
 * 4. Invalidates dashboard cache via `revalidatePath("/dashboard")` on mutation.
 * 5. Returns typed action results without leaking raw database errors.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import {
  validateProjectTitle,
  validateProjectDescription,
  validateUuid,
} from "./validation";

export interface Project {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  created_at: string;
}

export type ActionErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "NOT_FOUND"
  | "DATABASE_ERROR";

export type ActionResult<T> =
  | {
      success: true;
      data: T;
      error?: never;
      code?: never;
      fieldErrors?: never;
    }
  | {
      success: false;
      error: string;
      code: ActionErrorCode;
      fieldErrors?: Record<string, string[]>;
      data?: never;
    };

export type CreateProjectInput =
  | FormData
  | {
      title?: unknown;
      description?: unknown;
    };

export type DeleteProjectInput =
  | string
  | FormData
  | {
      id?: unknown;
      projectId?: unknown;
    };

/**
 * Server Action: Creates a new project in public.projects.
 */
export async function createProject(
  input: CreateProjectInput
): Promise<ActionResult<Project>> {
  let rawTitle: unknown;
  let rawDescription: unknown;

  if (typeof FormData !== "undefined" && input instanceof FormData) {
    rawTitle = input.get("title");
    rawDescription = input.get("description");
  } else if (input && typeof input === "object") {
    rawTitle = (input as { title?: unknown }).title;
    rawDescription = (input as { description?: unknown }).description;
  }

  // 1. Validate Form Input
  const titleValidation = validateProjectTitle(rawTitle);
  const descValidation = validateProjectDescription(rawDescription);

  if (!titleValidation.valid || !descValidation.valid) {
    const fieldErrors: Record<string, string[]> = {};
    if (!titleValidation.valid && titleValidation.error) {
      fieldErrors.title = [titleValidation.error];
    }
    if (!descValidation.valid && descValidation.error) {
      fieldErrors.description = [descValidation.error];
    }
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error:
        titleValidation.error ||
        descValidation.error ||
        "Invalid project input.",
      fieldErrors,
    };
  }

  // 2. Authenticate User via Server-Side Supabase Client
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return {
      success: false,
      code: "UNAUTHENTICATED",
      error: "Authentication service unavailable. Please sign in again.",
    };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return {
      success: false,
      code: "UNAUTHENTICATED",
      error: "You must be signed in to create a project.",
    };
  }

  // 3. Database Insertion under user's session with RLS
  const { data, error: dbError } = await supabase
    .from("projects")
    .insert({
      title: titleValidation.value!,
      description: descValidation.value ?? null,
      owner_id: user.id,
    })
    .select("id, owner_id, title, description, created_at")
    .single();

  if (dbError) {
    return {
      success: false,
      code: "DATABASE_ERROR",
      error: "Failed to create project. Please try again.",
    };
  }

  // 4. Invalidate Dashboard Cache
  try {
    revalidatePath("/dashboard");
  } catch {
    // Graceful fallback when executed in non-Next runtime/test environments
  }

  return {
    success: true,
    data: data as Project,
  };
}

/**
 * Server Action: Deletes an existing project owned by the caller.
 */
export async function deleteProject(
  input: DeleteProjectInput
): Promise<ActionResult<{ id: string }>> {
  let rawId: unknown;

  if (typeof FormData !== "undefined" && input instanceof FormData) {
    rawId = input.get("id") ?? input.get("projectId");
  } else if (typeof input === "string") {
    rawId = input;
  } else if (input && typeof input === "object") {
    rawId =
      (input as { id?: unknown; projectId?: unknown }).id ??
      (input as { id?: unknown; projectId?: unknown }).projectId;
  }

  // 1. Validate UUID format
  const idValidation = validateUuid(rawId);
  if (!idValidation.valid) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      error: idValidation.error || "Invalid project ID.",
      fieldErrors: { id: [idValidation.error || "Invalid project ID."] },
    };
  }
  const projectId = idValidation.value!;

  // 2. Authenticate User
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return {
      success: false,
      code: "UNAUTHENTICATED",
      error: "Authentication service unavailable. Please sign in again.",
    };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return {
      success: false,
      code: "UNAUTHENTICATED",
      error: "You must be signed in to delete a project.",
    };
  }

  // 3. Database Deletion with RLS enforcement
  const { data, error: dbError } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .select("id");

  if (dbError) {
    return {
      success: false,
      code: "DATABASE_ERROR",
      error: "Failed to delete project. Please try again.",
    };
  }

  // Under RLS, deleting a nonexistent row or a row owned by another user yields 0 returned rows
  if (!data || data.length === 0) {
    return {
      success: false,
      code: "NOT_FOUND",
      error: "Project not found or you do not have permission to delete it.",
    };
  }

  // 4. Invalidate Dashboard Cache
  try {
    revalidatePath("/dashboard");
  } catch {
    // Graceful fallback for non-Next environments
  }

  return {
    success: true,
    data: { id: projectId },
  };
}
