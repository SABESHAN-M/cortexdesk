import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");
  const next = requestUrl.searchParams.get("next") || "/dashboard";

  // 1 & 2. Check for OAuth errors, missing authorization code, or invalid state values
  if (error || !code || (state !== null && state.trim().length === 0)) {
    const errorParam = encodeURIComponent(
      errorDescription ||
        error ||
        (!code ? "missing_authorization_code" : "invalid_state_parameter")
    );
    return NextResponse.redirect(
      new URL(`/login?error=${errorParam}`, requestUrl.origin)
    );
  }

  try {
    // 3. Exchange the authorization code with GitHub from the server
    const supabase = await createClient();
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error("OAuth code exchange error:", exchangeError.message);
      return NextResponse.redirect(
        new URL(
          `/login?error=${encodeURIComponent(exchangeError.message)}`,
          requestUrl.origin
        )
      );
    }

    // 4. Retrieve authenticated user identity to verify active session
    // Security requirement: Never treat the presence of a code as proof of session
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error(
        "Failed to verify authenticated user:",
        userError?.message || "User not found"
      );
      return NextResponse.redirect(
        new URL(
          "/login?error=failed_to_verify_session",
          requestUrl.origin
        )
      );
    }

    // 5 & 6. Secure session established; redirect to /dashboard
    const forwardedHost = request.headers.get("x-forwarded-host");
    const isLocalEnv = process.env.NODE_ENV === "development";

    // Ensure relative redirect path to prevent open redirect vulnerabilities
    const targetPath = next.startsWith("/") ? next : "/dashboard";

    if (isLocalEnv) {
      return NextResponse.redirect(new URL(targetPath, requestUrl.origin));
    } else if (forwardedHost) {
      return NextResponse.redirect(
        new URL(targetPath, `https://${forwardedHost}`)
      );
    } else {
      return NextResponse.redirect(new URL(targetPath, requestUrl.origin));
    }
  } catch (err: unknown) {
    console.error("Unhandled OAuth callback error:", err);
    return NextResponse.redirect(
      new URL("/login?error=internal_auth_error", requestUrl.origin)
    );
  }
}
