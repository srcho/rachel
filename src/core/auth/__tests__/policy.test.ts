import { afterEach, describe, expect, it, vi } from "vitest";
import { isAllowedEmail, safeLocalRedirect } from "../policy";

afterEach(() => vi.unstubAllEnvs());
describe("session allowlist and same-origin return paths", () => {
  it("rejects an authenticated email outside configured allowlist, including missing email", () => {
    vi.stubEnv("ALLOWED_GOOGLE_EMAIL", "owner@example.com");
    expect(isAllowedEmail("other@example.com")).toBe(false);
    expect(isAllowedEmail(null)).toBe(false);
    expect(isAllowedEmail("OWNER@EXAMPLE.COM")).toBe(true);
    vi.stubEnv("ALLOWED_GOOGLE_EMAIL", "");
    expect(isAllowedEmail("local-fixture@test.local")).toBe(true);
  });
  it("rejects external, protocol-relative, backslash-normalized and control-character targets", () => {
    for (const path of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/\nevil.example",
      "javascript:alert(1)",
    ]) {
      expect(
        safeLocalRedirect(path, "https://rachel.example", "/settings"),
      ).toBe("/settings");
    }
  });
  it("preserves local paths, queries containing colons and hashes", () => {
    expect(
      safeLocalRedirect("/calendar?at=10:30#today", "https://rachel.example"),
    ).toBe("/calendar?at=10:30#today");
    expect(
      safeLocalRedirect("/tasks/../today?q=test", "https://rachel.example"),
    ).toBe("/today?q=test");
  });
});
