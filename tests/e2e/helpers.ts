import { execSync } from "node:child_process";
import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/** 로컬 Supabase 에 테스트 사용자를 만들고 E2E 로그인 라우트로 세션 쿠키를 받는다. */
export async function loginAsTestUser(
  page: Page,
): Promise<{ id: string; email: string; cleanup: () => Promise<void> }> {
  const status = Object.fromEntries(
    execSync("pnpm supabase status -o env", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")
      .filter((l) => l.includes("="))
      .map((l) => {
        const [k, ...v] = l.split("=");
        return [k?.trim() ?? "", v.join("=").trim().replace(/^"|"$/g, "")];
      }),
  );
  const admin = createClient(
    status.API_URL ?? "http://127.0.0.1:55321",
    status.SECRET_KEY ?? "",
    { auth: { persistSession: false } },
  );
  const email = `e2e-${Date.now()}@test.local`;
  const password = "e2e-password-1234";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  const res = await page.request.post("/api/test/login", {
    headers: {
      "x-e2e-secret": process.env.E2E_TEST_SECRET ?? "e2e-local-secret",
    },
    data: { email, password },
  });
  if (!res.ok())
    throw new Error(`e2e login failed: ${res.status()} ${await res.text()}`);
  return {
    id: data.user.id,
    email,
    cleanup: async () => void (await admin.auth.admin.deleteUser(data.user.id)),
  };
}
