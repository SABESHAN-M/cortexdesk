import { NextResponse } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";

/**
 * Validates the target redirect path to prevent open redirect vulnerabilities.
 * Ensures the destination is strictly a relative path on the same origin.
 */
function getSafeRedirectPath(candidate: string | null): string {
  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\")
  ) {
    return "/dashboard";
  }
  return candidate;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const error = requestUrl.searchParams.get("error");
  const next = requestUrl.searchParams.get("next");

  const targetPath = getSafeRedirectPath(next);

  // 1. Guard against upstream OAuth provider error responses
  if (error) {
    return NextResponse.redirect(
      new URL("/login?error=oauth_provider_error", requestUrl.origin)
    );
  }

  try {
    const supabase = await createClient();

    // 2. Handle PKCE authorization code exchange (GitHub OAuth / PKCE magic links)
    if (code) {
      const { error: exchangeError } =
        await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        return NextResponse.redirect(
          new URL("/login?error=exchange_code_failed", requestUrl.origin)
        );
      }
    }
    // 3. Handle Token Hash OTP verification (Supabase email magic links)
    else if (tokenHash && type) {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });

      if (verifyError) {
        return NextResponse.redirect(
          new URL("/login?error=magic_link_invalid_or_expired", requestUrl.origin)
        );
      }
    }
    // 4. Missing required authentication credentials
    else {
      return NextResponse.redirect(
        new URL("/login?error=missing_auth_credentials", requestUrl.origin)
      );
    }

    // 5. Cryptographically verify that an active, valid user session now exists
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.redirect(
        new URL("/login?error=failed_to_verify_session", requestUrl.origin)
      );
    }

    // 6. Direct user to destination with host validation
    const forwardedHost = request.headers.get("x-forwarded-host");
    const isLocalEnv = process.env.NODE_ENV === "development";

    if (isLocalEnv) {
      return NextResponse.redirect(new URL(targetPath, requestUrl.origin));
    } else if (forwardedHost) {
      return NextResponse.redirect(
        new URL(targetPath, `https://${forwardedHost}`)
      );
    } else {
      return NextResponse.redirect(new URL(targetPath, requestUrl.origin));
    }
  } catch {
    // Avoid leaking internal error stack or token details to the browser
    return NextResponse.redirect(
      new URL("/login?error=internal_auth_error", requestUrl.origin)
    );
  }
}
