/**
 * CortexDesk — Next.js 16 Request Guard (`proxy.ts`)
 *
 * Framework Context:
 * - In Next.js 16+, `middleware.ts` is replaced by `proxy.ts`, exporting
 *   the entrypoint function `proxy(request: NextRequest)`.
 *
 * Security Architecture & Defense in Depth:
 * 1. Frontend Route Guard (This file):
 *    - Validates presence and authenticity of user sessions via Supabase Auth.
 *    - Protects user navigation UX: redirects unauthenticated users away from
 *      private pages (e.g. `/dashboard`, `/projects/*`) to `/login`.
 *    - Preserves the original requested URL via the `?next=` query parameter.
 *    - Refreshes auth cookies on the fly and propagates them to both the
 *      server request and client response.
 *    - IMPORTANT: Frontend route guarding is a presentation/navigation boundary.
 *      It DOES NOT replace backend API authorization.
 * 2. Backend API Authorization:
 *    - The FastAPI backend independently validates cryptographic JWT signatures
 *      and enforces tenant isolation/RLS for every data request.
 *
 * Session Refresh Guarantee:
 * - Uses `supabase.auth.getUser()` rather than `getSession()` to ensure identity
 *   is cryptographically verified with Supabase Auth servers on every route transition.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Public route prefixes that remain accessible without an active user session.
const PUBLIC_PATHS = ["/", "/login", "/auth"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)),
  );
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const { pathname } = request.nextUrl;

  // Dedicated auth endpoints handle their own token exchanges / verifications (e.g. /auth/callback).
  // Never intercept or clear cookies on these routes to ensure PKCE code verifiers remain intact.
  if (pathname.startsWith("/auth")) {
    return response;
  }

  // Gracefully bypass if Supabase is not configured yet in local/test environments
  if (!supabaseUrl || !supabaseAnonKey || !supabaseUrl.startsWith("http")) {
    return response;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Authenticate user identity with Supabase Auth server and refresh session tokens if expired.
  // Note: No logic should run between createServerClient and getUser().
  let user = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      // If the refresh token is missing or invalid, clear only the stale auth token cookies
      // while keeping code-verifier cookies intact for in-flight OAuth handshakes.
      if (error.code === "refresh_token_not_found") {
        const authCookies = request.cookies
          .getAll()
          .filter((c) => c.name.startsWith("sb-") && !c.name.includes("code-verifier"));

        if (authCookies.length > 0) {
          authCookies.forEach((c) => request.cookies.delete(c.name));
          response = NextResponse.next({ request });
          authCookies.forEach((c) =>
            response.cookies.set(c.name, "", { maxAge: 0, path: "/" })
          );
        }
      }
      user = null;
    } else {
      user = data?.user || null;
    }
  } catch {
    user = null;
  }

  // Redirect unauthenticated requests attempting to access private routes
  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const originalDestination = request.nextUrl.pathname + request.nextUrl.search;
    url.search = "";
    if (originalDestination && originalDestination !== "/") {
      url.searchParams.set("next", originalDestination);
    }

    const redirect = NextResponse.redirect(url);
    // Carry over any refreshed or cleared cookies to the redirect response
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api routes (/api/*)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - Static asset extensions (.svg, .png, .jpg, .jpeg, .gif, .webp, .ico)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};