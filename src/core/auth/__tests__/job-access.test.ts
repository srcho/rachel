import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  context: vi.fn(),
  run: vi.fn(),
}));
vi.mock("@/core/db/admin", () => ({
  createAdminSupabase: () => ({
    auth: { admin: { getUserById: mocks.account } },
  }),
}));
vi.mock("@/core/context", () => ({ createContext: mocks.context }));
vi.mock("@/core/env", () => ({
  env: () => ({ CRON_SECRET: "cron-test-secret" }),
}));
vi.mock("@/core/jobs/runner", () => ({ runJobs: mocks.run }));
vi.mock("@/core/jobs/supabase-store", () => ({
  createSupabaseJobStore: () => ({}),
}));
vi.mock("@/core/settings/assistant", () => ({
  getUserTimezone: async () => "Asia/Seoul",
}));
vi.mock("@/modules", () => ({ registry: {} }));

import { POST } from "@/app/api/jobs/run/route";

beforeEach(() => {
  vi.stubEnv("ALLOWED_GOOGLE_EMAIL", "owner@example.com");
  mocks.context.mockReturnValue({ userId: "owner" });
  mocks.run.mockImplementation(async ({ contextFor }) => {
    await contextFor({ user_id: "job-owner" });
    return { done: 1 };
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
const request = () =>
  new Request("http://localhost/api/jobs/run", {
    method: "POST",
    headers: { "x-cron-secret": "cron-test-secret" },
  });
it("rejects disallowed registered users before provider-backed job context is created", async () => {
  mocks.account.mockResolvedValue({
    data: { user: { id: "job-owner", email: "other@example.com" } },
    error: null,
  });
  await expect(POST(request())).rejects.toThrow("허용되지 않은 계정");
  expect(mocks.context).not.toHaveBeenCalled();
});
it("allows the configured account and the explicitly unrestricted local test environment", async () => {
  mocks.account.mockResolvedValue({
    data: { user: { id: "job-owner", email: "owner@example.com" } },
    error: null,
  });
  expect((await POST(request())).status).toBe(200);
  vi.stubEnv("ALLOWED_GOOGLE_EMAIL", "");
  mocks.account.mockResolvedValue({
    data: { user: { id: "job-owner", email: "fixture@test.local" } },
    error: null,
  });
  expect((await POST(request())).status).toBe(200);
});
it("rejects missing or deleted job accounts", async () => {
  mocks.account.mockResolvedValue({ data: { user: null }, error: null });
  await expect(POST(request())).rejects.toThrow("허용되지 않은 계정");
  expect(mocks.context).not.toHaveBeenCalled();
});
