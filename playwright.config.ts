import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 1,
  workers: 1,
  fullyParallel: false,
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
    // 브리핑 자동 생성 등 LLM 호출이 E2E 에서 돈을 쓰지 않도록 키를 비운다
    env: {
      E2E_TEST_SECRET: process.env.E2E_TEST_SECRET ?? "e2e-local-secret",
      OPENAI_API_KEY: "",
      META_MODEL_API_KEY: "",
    },
  },
});
