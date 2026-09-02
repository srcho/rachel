import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireEnv } from "@/core/env";
import type { Database } from "./types.generated";

/** 요청 쿠키 기반 사용자 세션 클라이언트(RLS 적용). Server Component·Action·Route에서 사용. */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (all) => {
          try {
            for (const { name, value, options } of all)
              cookieStore.set(name, value, options);
          } catch {
            // Server Component에서는 쿠키를 쓸 수 없다. proxy.ts가 세션을 갱신한다.
          }
        },
      },
    },
  );
}
