"use server";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/core/db/server";

export async function signOut() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
