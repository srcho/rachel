import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/core/contracts";
import type { Database } from "@/core/db/types.generated";

/**
 * 로컬 Supabase(supabase start) 통합 테스트 헬퍼. 프로덕션 키는 절대 쓰지 않는다.
 * 키는 `supabase status -o env` 에서 읽는다(레포에 값을 두지 않는다). 환경변수 TEST_SUPABASE_* 가 있으면 우선.
 */
function localStatus(): Record<string, string> {
  try {
    const out = execSync("pnpm supabase status -o env", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 15_000,
    });
    const entries = out
      .split("\n")
      .filter((l) => l.includes("="))
      .map((l) => {
        const [k, ...v] = l.split("=");
        return [
          k?.trim() ?? "",
          v.join("=").trim().replace(/^"|"$/g, ""),
        ] as const;
      });
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}
const status = localStatus();
const URL =
  process.env.TEST_SUPABASE_URL ?? status.API_URL ?? "http://127.0.0.1:55321";
const PUBLISHABLE =
  process.env.TEST_SUPABASE_PUBLISHABLE_KEY ?? status.PUBLISHABLE_KEY ?? "";
const SECRET = process.env.TEST_SUPABASE_SECRET_KEY ?? status.SECRET_KEY ?? "";

export function adminClient(): Db {
  return createClient<Database>(URL, SECRET, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function localSupabaseAvailable(): Promise<boolean> {
  if (!PUBLISHABLE || !SECRET) return false;
  try {
    const res = await fetch(`${URL}/auth/v1/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 테스트 사용자를 만들고 RLS 가 적용되는 세션 클라이언트를 돌려준다. */
export async function testUser(label = "u"): Promise<{
  id: string;
  email: string;
  db: Db;
  cleanup: () => Promise<void>;
}> {
  const admin = adminClient();
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@test.local`;
  const password = "test-password-1234";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  const db = createClient<Database>(URL, PUBLISHABLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await db.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw signInError;
  const id = data.user.id;
  return {
    id,
    email,
    db,
    cleanup: async () => {
      await admin.auth.admin.deleteUser(id);
    },
  };
}
