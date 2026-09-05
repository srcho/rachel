import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const live = process.argv.includes("--live");
const selected = live
  ? ["src/modules/agent/__tests__/agent.integration.test.ts"]
  : [
      "src/modules/tasks/__tests__/parse-due.test.ts",
      "src/modules/tasks/__tests__/tools.test.ts",
      "src/modules/tasks/__tests__/scheduling.test.ts",
      "src/modules/tasks/__tests__/repeat.test.ts",
      "src/modules/calendar/__tests__/free-slots.test.ts",
      "src/modules/meetings/__tests__/review.test.ts",
      "src/modules/meetings/__tests__/editing.test.ts",
      "src/modules/capture/__tests__/service.test.ts",
      "src/modules/memory/__tests__/service.test.ts",
      "src/modules/agent/__tests__/tool-once.test.ts",
    ];
const temp = mkdtempSync(join(tmpdir(), "rachel-eval-"));
const resultPath = join(temp, "results.json");
const result = spawnSync(
  "pnpm",
  [
    "exec",
    "vitest",
    "run",
    ...selected,
    "--reporter=json",
    `--outputFile=${resultPath}`,
  ],
  {
    stdio: "inherit",
    env: live
      ? process.env
      : { ...process.env, OPENAI_API_KEY: "", META_MODEL_API_KEY: "" },
  },
);
try {
  const raw = JSON.parse(readFileSync(resultPath, "utf8"));
  const cases = raw.testResults.flatMap((file) =>
    file.assertionResults.map((test) => ({
      name: test.fullName,
      status: test.status,
      durationMs: test.duration,
    })),
  );
  const passed = cases.filter((c) => c.status === "passed").length;
  const executed = cases.filter((c) =>
    ["passed", "failed"].includes(c.status),
  ).length;
  const report = {
    at: new Date().toISOString(),
    mode: live ? "luna-live" : "service-contract",
    model: live ? "gpt-5.6-luna" : null,
    passed,
    executed,
    skipped: cases.length - executed,
    successRate: executed ? passed / executed : null,
    cases,
  };
  const outputArg = process.argv.indexOf("--output");
  if (outputArg >= 0 && process.argv[outputArg + 1])
    writeFileSync(
      process.argv[outputArg + 1],
      JSON.stringify(report, null, 2) + "\n",
    );
  console.log(JSON.stringify({ ...report, cases: undefined }, null, 2));
  process.exitCode = result.status || (executed === 0 ? 1 : 0);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
