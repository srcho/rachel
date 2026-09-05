import { afterEach, expect, it, vi } from "vitest";

const signIn = vi.hoisted(() => vi.fn(async () => ({ error: null })));
vi.mock("@/core/db/server", () => ({
  createServerSupabase: async () => ({ auth: { signInWithPassword: signIn } }),
}));

import { POST } from "@/app/api/test/login/route";

afterEach(() => {
  vi.unstubAllEnvs();
  signIn.mockClear();
});
const request = (origin: string) =>
  new Request(`${origin}/api/test/login`, {
    method: "POST",
    headers: { "x-e2e-secret": "test-secret" },
    body: JSON.stringify({ email: "fixture@test.local", password: "fixture" }),
  });
it("cannot enable the test login in production even when the secret exists", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("E2E_TEST_SECRET", "test-secret");
  expect((await POST(request("http://localhost:3200"))).status).toBe(404);
  expect(signIn).not.toHaveBeenCalled();
});
it("only serves the isolated local test host in development", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("E2E_TEST_SECRET", "test-secret");
  expect((await POST(request("https://rachel.example"))).status).toBe(404);
  expect(signIn).not.toHaveBeenCalled();
  expect((await POST(request("http://127.0.0.1:3200"))).status).toBe(200);
  expect(signIn).toHaveBeenCalledOnce();
});
