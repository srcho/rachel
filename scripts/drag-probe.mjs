// 로컬: 모바일 뷰포트에서 카드를 다른 섹션의 빈 자리로 드래그해 컬럼 판정이 맞는지 본다
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
const email = `drag-${Date.now()}@test.local`;
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
const browser = await chromium.launch();
const desktop = process.env.VIEW === "desktop";
const ctx = await browser.newContext(
  desktop
    ? { viewport: { width: 1440, height: 900 } }
    : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
);
const page = await ctx.newPage();
await page.request.post(`${base}/api/test/login`, {
  headers: { "x-e2e-secret": secret },
  data: { email, password: "e2e-password-1234" },
});
await page.goto(`${base}/tasks`, { waitUntil: "networkidle" });
const boardId = sql(`select id from boards where user_id='${uid}' limit 1`);
const cols = Object.fromEntries(
  sql(`select name||'|'||id from board_columns where board_id='${boardId}'`)
    .split("\n")
    .map((l) => l.split("|")),
);
sql(
  `insert into cards (user_id, board_id, column_id, title, position) values ('${uid}','${boardId}','${cols.Todo}','드래그 A','a0'),('${uid}','${boardId}','${cols.Todo}','드래그 B','a1'),('${uid}','${boardId}','${cols.Doing}','기존 C','a0'),('${uid}','${boardId}','${cols.Doing}','기존 D','a1'),('${uid}','${boardId}','${cols.Doing}','기존 E','a2'),('${uid}','${boardId}','${cols.Doing}','기존 F','a3')`,
);
await page.goto(`${base}/tasks/${boardId}`, { waitUntil: "networkidle" });
const count = (name) =>
  page
    .locator(`section[aria-label="${name}"] button[aria-label$="열기"]`)
    .count();
async function dragTo(cardTitle, colName, where) {
  const card = page.locator(`button[aria-label="${cardTitle} 열기"]`);
  const cb = await card.boundingBox();
  const col = page.getByRole("region", { name: colName });
  const rb = await col.boundingBox();
  const target =
    where === "empty"
      ? { x: rb.x + rb.width / 2, y: rb.y + rb.height - 40 }
      : { x: rb.x + rb.width / 2, y: rb.y + 30 };
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250); // TouchSensor delay 180ms 보다 길게, PointerSensor distance 6
  await page.mouse.move(cb.x + cb.width / 2 + 10, cb.y + cb.height / 2 + 10, {
    steps: 3,
  });
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.waitForTimeout(150);
  const over = await page.evaluate(() =>
    [...document.querySelectorAll("section[aria-label]")]
      .filter((s) => s.className.includes("border-foreground/30"))
      .map((s) => s.getAttribute("aria-label")),
  );
  console.log("  highlight while over", colName, "→", over);
  if (process.env.DEBUG_RECTS) {
    const info = await page.evaluate(
      ({ col, target }) => {
        const g = document
          .querySelector("[data-drag-ghost]")
          ?.getBoundingClientRect();
        const sec = document.querySelector(`section[aria-label="${col}"]`);
        const cards = [...(sec?.querySelectorAll("[data-card-id]") ?? [])].map(
          (el) => {
            const r = el.getBoundingClientRect();
            return {
              id: el.querySelector("button")?.getAttribute("aria-label"),
              top: Math.round(r.top),
              h: Math.round(r.height),
              op: getComputedStyle(el).opacity,
            };
          },
        );
        return {
          ghost: g ? { top: Math.round(g.top), h: Math.round(g.height) } : null,
          target,
          cards,
        };
      },
      { col: colName, target },
    );
    console.log("  rects", JSON.stringify(info));
  }
  await page.mouse.up();
  await page.waitForTimeout(600);
  if (process.env.DEBUG_RECTS)
    console.log(
      "  lastDrop",
      await page.evaluate(() => document.body.dataset.lastDrop),
    );
}
console.log(
  "cols",
  Object.keys(cols),
  "cards:",
  sql(`select title||'@'||column_id from cards where board_id='${boardId}'`),
);
console.log("before", {
  backlog: await count("Backlog"),
  todo: await count("Todo"),
  doing: await count("Doing"),
  done: await count("Done"),
});
await dragTo("드래그 A", "Doing", "top");
console.log(
  "A→Doing(top) order:",
  await page
    .locator('section[aria-label="Doing"] [data-card-id] button')
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label"))),
);
console.log("A→Done(empty)", {
  todo: await count("Todo"),
  done: await count("Done"),
});
await dragTo("드래그 B", "Backlog", "empty");
console.log("B→Backlog(empty)", {
  todo: await count("Todo"),
  backlog: await count("Backlog"),
});
await dragTo("기존 C", "Todo", "empty");
console.log("C→Todo(empty)", {
  doing: await count("Doing"),
  todo: await count("Todo"),
});
await page.waitForLoadState("networkidle");
await page.reload({ waitUntil: "networkidle" });
console.log("after reload", {
  backlog: await count("Backlog"),
  todo: await count("Todo"),
  doing: await count("Doing"),
  done: await count("Done"),
});
await browser.close();
await admin.auth.admin.deleteUser(uid);
server.kill();
