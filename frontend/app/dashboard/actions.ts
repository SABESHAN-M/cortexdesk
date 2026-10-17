"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export async function signOut() {
  const supabase = await createClient();

  // Invalidate the session on the Supabase auth server and clear session cookies
  await supabase.auth.signOut();

  // Redirect to login page
  redirect("/login");
}
