"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createBrowserSupabase } from "@/core/db/browser";

export function LoginButton({ next }: { next?: string }) {
  const [loading, setLoading] = useState(false);
  async function signIn() {
    setLoading(true);
    const supabase = createBrowserSupabase();
    const redirectTo = new URL("/auth/callback", window.location.origin);
    if (next) redirectTo.searchParams.set("next", next);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo.toString(),
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) setLoading(false);
  }
  return (
    <Button onClick={signIn} disabled={loading} size="lg">
      {loading ? "이동 중…" : "Google로 계속하기"}
    </Button>
  );
}
