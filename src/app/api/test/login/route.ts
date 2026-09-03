import { NextResponse } from "next/server";
import { createServerSupabase } from "@/core/db/server";

/**
 * E2E 전용 로그인(이메일+비밀번호). E2E_TEST_SECRET 이 설정된 환경(로컬·CI)에서만 동작하고 프로덕션에는 키가 없어 404.
 */
export async function POST(req: Request) {
  const secret = process.env.E2E_TEST_SECRET;
  if (!secret || req.headers.get("x-e2e-secret") !== secret)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  const { email, password } = (await req.json()) as {
    email: string;
    password: string;
  };
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 401 });
  return NextResponse.json({ ok: true });
}
