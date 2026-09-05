import { defineConfig } from "vitest/config";

// Historical diagnostics: these assertions reproduce defects, not desired behavior.
export default defineConfig({
  test: {
    environment: "node",
    include: ["docs/plans/rachel-assistant-2026-09-05/diagnostics.test.ts"],
    testTimeout: 15000,
  },
  resolve: {
    alias: { "@": new URL("../../../src", import.meta.url).pathname },
  },
});
