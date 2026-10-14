import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  // Invalidate session on Supabase auth server and clear cookies
  await supabase.auth.signOut();

  const requestUrl = new URL(request.url);
  // Status 303 (See Other) forces the browser to follow the redirect using GET /login
  return NextResponse.redirect(new URL("/login", requestUrl.origin), {
    status: 303,
  });
}
