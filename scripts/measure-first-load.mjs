// 첫 로드 JS 예산: 실제 브라우저(Chromium)로 라우트를 열어 전송된 JS 바이트(압축 후)를 합산한다.
// 사용: 빌드 후 `E2E_TEST_SECRET=... node scripts/measure-first-load.mjs` (next start 를 자동 실행)
import { spawn } from "node:child_process";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const PORT = 3300;
// 첫 로드 gzip 예산(KB). Next/React 런타임 바닥값 ≈132KB + 앱 셸(vaul·sonner·radix·tailwind-merge) ≈60KB.
// 2026-09-03 실측: today 201 / tasks 224 / calendar 207 / meetings 201 / insights 202 / memory 204 / capture 203.
// zod·chrono·supabase-js·lucide 동적 인덱스가 첫 로드로 새면 즉시 30KB+ 튀므로 여유는 5~8%만 둔다.
const BUDGET_KB = {
  "/today": 215,
  "/tasks": 240,
  "/calendar": 220,
  "/meetings": 215,
  "/insights": 230,
  "/memory": 220,
  "/capture": 220,
};
const secret = process.env.E2E_TEST_SECRET ?? "e2e-local-secret";

const server = spawn("pnpm", ["exec", "next", "start", "-p", String(PORT)], {
  stdio: "ignore",
  env: { ...process.env, E2E_TEST_SECRET: secret },
});
const base = `http://localhost:${PORT}`;
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`${base}/login`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } },
);
const email = `perf-${Date.now()}@test.local`;
const { data: u } = await admin.auth.admin.createUser({
  email,
  password: "e2e-password-1234",
  email_confirm: true,
});

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage();
const login = await page.request.post(`${base}/api/test/login`, {
  headers: { "x-e2e-secret": secret },
  data: { email, password: "e2e-password-1234" },
});
if (!login.ok()) {
  console.error(
    `테스트 로그인 실패: ${login.status()} ${await login.text()}\n` +
      "빌드가 로컬 Supabase env 로 되었는지 확인하세요 (NEXT_PUBLIC_* 는 빌드 시 고정됩니다).",
  );
  server.kill();
  process.exit(2);
}

let fail = false;
for (const [route, budget] of Object.entries(BUDGET_KB)) {
  const chunks = new Map(); // url -> gzip bytes (모든 /_next/static 스크립트)
  let initialHtml = "";
  const pending = [];
  const onResp = (r) => {
    const url = r.url();
    const type = r.request().resourceType();
    if (type === "document" && url.startsWith(base)) {
      if (process.env.DEBUG) console.log(`  [doc] ${url}`);
      pending.push(
        r
          .text()
          .then((t) => {
            initialHtml = t;
          })
          .catch(() => {}),
      );
      return;
    }
    if (type !== "script" || !url.includes("/_next/static/")) return;
    pending.push(
      r
        .body()
        .then((b) => {
          chunks.set(url, gzipSync(b).length);
        })
        .catch(() => {}),
    );
  };
  page.on("response", onResp);
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  await Promise.all(pending);
  page.off("response", onResp);
  // 첫 로드 = 초기 HTML 이 직접 참조하는 <script src>. 나머지는 지연 로드(dynamic import).
  const initialSrcs = new Set(
    [...initialHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) =>
      m[1].startsWith("http") ? m[1] : `${base}${m[1]}`,
    ),
  );
  let js = 0;
  let lazy = 0;
  const initialList = [];
  for (const [url, gz] of chunks) {
    if (initialSrcs.has(url)) {
      js += gz;
      initialList.push([url.split("/").pop(), gz]);
    } else lazy += gz;
  }
  const kb = Math.round(js / 1024);
  const ok = kb <= budget;
  if (!ok) fail = true;
  console.log(
    `${ok ? "✓" : "✗"} ${route}: 첫 로드 ${kb} KB gzip (${initialList.length} scripts, 예산 ${budget} KB) + 지연 ${Math.round(lazy / 1024)} KB`,
  );
  if (process.env.DEBUG)
    for (const [url, gz] of chunks)
      console.log(
        `  [${initialSrcs.has(url) ? "init" : "lazy"}] ${Math.round(gz / 1024)} KB ${url.split("/").pop()}`,
      );
  if (route === "/today") {
    for (const [n, g] of initialList.sort((a, b) => b[1] - a[1]).slice(0, 8))
      console.log(`    ${Math.round(g / 1024)} KB  ${n}`);
  }
}
await browser.close();
if (u?.user) await admin.auth.admin.deleteUser(u.user.id);
server.kill();
process.exit(fail ? 1 : 0);
