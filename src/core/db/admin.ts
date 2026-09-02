import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/core/env";
import type { Database } from "./types.generated";

/**
 * service-role 클라이언트. 잡·크론·서버 내부 경로 전용. 절대 브라우저로 내보내지 않는다.
 * RLS를 우회하므로 리포지토리는 반드시 ctx.userId 로 스코프한다(`.eq('user_id', ctx.userId)`).
 */
export function createAdminSupabase() {
  return createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SECRET_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
