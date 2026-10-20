/**
 * CortexDesk — Dashboard Input Validation Rules (Task 1.3.3 & 1.3.5)
 *
 * Pure validation utility module shared between client dialogs and Server Actions.
 */

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates the project title.
 * Constraint: 1 to 120 characters, non-empty when trimmed.
 */
export function validateProjectTitle(rawTitle: unknown): {
  valid: boolean;
  value?: string;
  error?: string;
} {
  if (typeof rawTitle !== "string") {
    return {
      valid: false,
      error: "Project title is required and must be text.",
    };
  }
  const trimmed = rawTitle.trim();
  if (trimmed.length === 0) {
    return {
      valid: false,
      error: "Project title cannot be empty.",
    };
  }
  if (trimmed.length > 120) {
    return {
      valid: false,
      error: "Project title must not exceed 120 characters.",
    };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validates the project description.
 * Constraint: optional, max 2000 characters when trimmed.
 */
export function validateProjectDescription(rawDesc: unknown): {
  valid: boolean;
  value?: string | null;
  error?: string;
} {
  if (rawDesc === null || rawDesc === undefined) {
    return { valid: true, value: null };
  }
  if (typeof rawDesc !== "string") {
    return {
      valid: false,
      error: "Project description must be text.",
    };
  }
  const trimmed = rawDesc.trim();
  if (trimmed.length === 0) {
    return { valid: true, value: null };
  }
  if (trimmed.length > 2000) {
    return {
      valid: false,
      error: "Project description must not exceed 2000 characters.",
    };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validates a UUID string.
 */
export function validateUuid(rawId: unknown): {
  valid: boolean;
  value?: string;
  error?: string;
} {
  if (typeof rawId !== "string") {
    return {
      valid: false,
      error: "Project ID is required.",
    };
  }
  const trimmed = rawId.trim();
  if (!UUID_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: "Invalid project ID format. Must be a valid UUID.",
    };
  }
  return { valid: true, value: trimmed };
}
