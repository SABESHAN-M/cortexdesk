/**
 * CortexDesk — Supabase Server Client
 *
 * Implements an asynchronous server-side client for Server Components,
 * Server Actions, and Route Handlers using `@supabase/ssr` and Next.js cookie store.
 *
 * Security & Cookie Lifecycle:
 * - Requires `await cookies()` compliant with Next.js 15+ / 16 asynchronous cookie headers.
 * - Safely handles cookie mutations: catches and silences `setAll` failures when invoked
 *   from Server Components (where cookie mutation is disallowed by Next.js architecture).
 * - Full cookie write operations succeed within Route Handlers and Server Actions.
 * - Reads only client-safe public anon keys to act strictly on behalf of the request's
 *   authenticated user session; never exposes backend service role privileges.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable. " +
      "Ensure these public variables are declared in frontend/.env.local."
    );
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware/proxy refreshing user sessions.
        }
      },
    },
  });
}
