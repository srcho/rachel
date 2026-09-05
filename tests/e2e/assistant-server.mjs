import { execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";

const values = Object.fromEntries(
  execFileSync("pnpm", ["supabase", "status", "-o", "env"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at), line.slice(at + 1).replace(/^"|"$/g, "")];
    }),
);
const child = spawn("pnpm", ["exec", "next", "dev", "-p", "3200"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: values.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: values.PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: values.SECRET_KEY,
    E2E_TEST_SECRET: "e2e-local-secret",
    ALLOWED_GOOGLE_EMAIL: "",
    OPENAI_API_KEY: "e2e-model-stub",
    RACHEL_E2E_MODEL_STUB: "1",
    META_MODEL_API_KEY: "",
    NODE_OPTIONS: `--require=${resolve("tests/e2e/assistant-model-stub.cjs")}`,
  },
});
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
child.on("exit", (code) => process.exit(code ?? 0));
