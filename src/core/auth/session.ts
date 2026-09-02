import { redirect } from "next/navigation";
import { createServerSupabase } from "@/core/db/server";
import { env } from "@/core/env";

export interface SessionUser {
  id: string;
  email: string | null;
}

/** 허용된 단일 계정인지. ALLOWED_GOOGLE_EMAIL 이 비어 있으면(로컬) 모두 허용. */
export function isAllowedEmail(email: string | null | undefined): boolean {
  const allowed = env().ALLOWED_GOOGLE_EMAIL;
  if (!allowed) return true;
  return (email ?? "").toLowerCase() === allowed.toLowerCase();
}

/** 세션 확인(JWT 로컬 검증). 없으면 null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return {
    id: claims.sub,
    email: (claims.email as string | undefined) ?? null,
  };
}

/** 로그인 필수 경로에서 사용. 없으면 /login 으로. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
