import { NextResponse } from "next/server";
import { safeLocalRedirect } from "@/core/auth/policy";
import { isAllowedEmail } from "@/core/auth/session";
import { createServerSupabase } from "@/core/db/server";

/** OAuth 코드 교환. 허용 계정이 아니면 즉시 로그아웃 + 안내. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/today";
  const origin = url.origin;

  if (!code) return NextResponse.redirect(`${origin}/login?error=exchange`);

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user)
    return NextResponse.redirect(`${origin}/login?error=exchange`);

  if (!isAllowedEmail(data.user.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not-allowed`);
  }
  const safeNext = safeLocalRedirect(next, origin);
  return NextResponse.redirect(`${origin}${safeNext}`);
}
