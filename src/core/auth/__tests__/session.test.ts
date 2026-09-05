import { afterEach, describe, expect, it, vi } from "vitest";

const claims = vi.hoisted(() => vi.fn());
vi.mock("@/core/db/server", () => ({
  createServerSupabase: async () => ({ auth: { getClaims: claims } }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

import { getSessionUser, requireUser } from "../session";

afterEach(() => vi.unstubAllEnvs());
describe("allowlist enforcement for pre-existing JWT sessions", () => {
  it("denies a valid signed session outside the configured email without relying on OAuth callback", async () => {
    vi.stubEnv("ALLOWED_GOOGLE_EMAIL", "owner@example.com");
    claims.mockResolvedValue({
      data: { claims: { sub: "other-id", email: "other@example.com" } },
    });
    expect(await getSessionUser()).toBeNull();
    await expect(requireUser()).rejects.toThrow("redirect:/login");
  });
  it("allows the configured owner and rejects missing authentication", async () => {
    vi.stubEnv("ALLOWED_GOOGLE_EMAIL", "owner@example.com");
    claims.mockResolvedValue({
      data: { claims: { sub: "owner-id", email: "owner@example.com" } },
    });
    expect(await requireUser()).toEqual({
      id: "owner-id",
      email: "owner@example.com",
    });
    claims.mockResolvedValue({ data: { claims: {} } });
    await expect(requireUser()).rejects.toThrow("redirect:/login");
  });
});
