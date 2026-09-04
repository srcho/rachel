// 로컬: 캘린더 화면을 열고 SQL 로 일정을 넣은 뒤 Realtime → router.refresh 가 도는지 본다
import { execSync, spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const PORT = 3300,
  secret = "e2e-local-secret",
  base = `http://localhost:${PORT}`;
const server = spawn("pnpm", ["exec", "next", "start", "-p", String(PORT)], {
  stdio: "ignore",
  env: { ...process.env, E2E_TEST_SECRET: secret },
});
process.on("exit", () => server.kill());
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
const email = `rt-${Date.now()}@test.local`;
const { data: u } = await admin.auth.admin.createUser({
  email,
  password: "e2e-password-1234",
  email_confirm: true,
});
const uid = u.user.id;
const sql = (q) =>
  execSync(
    `docker exec -i supabase_db_rachel psql -U postgres -d postgres -Atc ${JSON.stringify(q.replace(/\s+/g, " "))}`,
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter((l) => !/^(INSERT|UPDATE) /.test(l))
    .join("\n");
const intId = sql(
  `insert into integrations (user_id, provider, account_email, status) values ('${uid}','google_calendar','${email}','connected') returning id`,
);
const calId = sql(
  `insert into calendars (user_id, integration_id, external_id, name, color, is_primary, selected, writable) values ('${uid}','${intId}','primary','내 캘린더','#4f46e5',true,true,true) returning id`,
);
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1200, height: 800 },
});
const page = await ctx.newPage();
page.on("console", (m) => {
  if (m.type() === "error" || /realtime|session/i.test(m.text()))
    console.log("[console]", m.text().slice(0, 200));
});

page.on("pageerror", (e) =>
  console.log("[pageerror]", String(e).slice(0, 300)),
);

page.on("websocket", (ws) => {
  console.log("[ws]", ws.url().slice(0, 80));
  ws.on("framesent", (f) => {
    const p = String(f.payload);
    if (/phx_join/.test(p)) {
      const m = /"access_token":"([^"]{0,40})/.exec(p);
      console.log("[ws->join] token:", m ? m[1] : "(none)");
    }
  });
  ws.on("framereceived", (f) => {
    const p = String(f.payload);
    if (/phx_reply|postgres_changes|error/i.test(p))
      console.log("[ws<-]", p.slice(0, 200));
  });
});
await page.request.post(`${base}/api/test/login`, {
  headers: { "x-e2e-secret": secret },
  data: { email, password: "e2e-password-1234" },
});
await page.goto(`${base}/calendar?view=month`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const now = new Date();
now.setHours(15, 0, 0, 0);
sql(
  `insert into calendar_events (user_id, calendar_id, external_id, title, start_at, end_at, all_day, sync_status) values ('${uid}','${calId}','ev-probe','실시간 프로브 일정','${now.toISOString()}','${new Date(now.getTime() + 3600000).toISOString()}',false,'synced')`,
);
const t0 = Date.now();
try {
  await page.getByText("실시간 프로브 일정").waitFor({ timeout: 15000 });
  console.log("REFRESHED after", Date.now() - t0, "ms");
} catch {
  console.log("NOT REFRESHED within 15s");
}
await browser.close();
await admin.auth.admin.deleteUser(uid);
server.kill();
