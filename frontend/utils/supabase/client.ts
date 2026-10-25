/**
 * CortexDesk — Supabase Browser Client
 *
 * Implements a typed browser client for client-side authentication and queries
 * using `@supabase/ssr`.
 *
 * Security Architecture:
 * - Reads only client-safe public credentials (`NEXT_PUBLIC_SUPABASE_URL`,
 *   `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
 * - Never references privileged service-role secrets.
 * - Handles browser session storage via cookie-based PKCE authentication.
 */
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable. " +
      "Ensure these public variables are declared in frontend/.env.local."
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
