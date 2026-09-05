import { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";

const getClaims = vi.hoisted(() => vi.fn());
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getClaims } }),
}));

import { proxy } from "@/proxy";

afterEach(() => vi.unstubAllEnvs());
it("denies a disallowed existing session at the API proxy while allowing the configured owner", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "local-test");
  vi.stubEnv("ALLOWED_GOOGLE_EMAIL", "owner@example.com");
  getClaims.mockResolvedValue({
    data: { claims: { sub: "other", email: "other@example.com" } },
  });
  const blocked = await proxy(
    new NextRequest("https://rachel.example/api/chat"),
  );
  expect(blocked.status).toBe(307);
  expect(blocked.headers.get("location")).toBe(
    "https://rachel.example/login?next=%2Fapi%2Fchat",
  );
  getClaims.mockResolvedValue({
    data: { claims: { sub: "owner", email: "owner@example.com" } },
  });
  expect(
    (await proxy(new NextRequest("https://rachel.example/api/chat"))).status,
  ).toBe(200);
});
