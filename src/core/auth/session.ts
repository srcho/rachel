import { redirect } from "next/navigation";
import { createServerSupabase } from "@/core/db/server";
import { isAllowedEmail } from "./policy";

export { isAllowedEmail } from "./policy";

export interface SessionUser {
  id: string;
  email: string | null;
}

/** 세션 확인(JWT 로컬 검증). 없으면 null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub || !isAllowedEmail(claims.email as string | undefined))
    return null;
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
