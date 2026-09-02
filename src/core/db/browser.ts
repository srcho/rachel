"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types.generated";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createBrowserSupabase() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key)
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL / PUBLISHABLE_KEY가 비어 있어요.",
      );
    client = createBrowserClient<Database>(url, key);
  }
  return client;
}
