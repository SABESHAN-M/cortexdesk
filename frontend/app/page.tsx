import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export default async function Home() {
  console.log("Intentional harmless lint violation for CI gate enforcement test");
  let user = null;

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  } catch {
    user = null;
  }

  if (user) {
    redirect("/dashboard");
  }

  redirect("/login");
}