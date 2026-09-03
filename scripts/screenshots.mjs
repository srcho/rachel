// 사용: 로컬 Supabase env 로 빌드한 뒤 OUT=<dir> node scripts/screenshots.mjs
// 테스트 사용자를 만들고 카드·일정·회의·기억·캡처를 심은 다음 데스크톱/모바일 화면을 찍는다(UI 리뷰용).
import { execSync, spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const PORT = 3300;
const secret = "e2e-local-secret";
const base = `http://localhost:${PORT}`;
process.on("exit", () => server.kill());
process.on("uncaughtException", (e) => {
  console.error(e);
  server.kill();
  process.exit(1);
});
const out = process.env.OUT;
const server = spawn("pnpm", ["exec", "next", "start", "-p", String(PORT)], {
  stdio: "ignore",
  env: { ...process.env, E2E_TEST_SECRET: secret },
});
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
const email = `shot-${Date.now()}@test.local`;
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
async function shoot(ctx, name, path, fn) {
  const page = await ctx.newPage();
  await page.request.post(`${base}/api/test/login`, {
    headers: { "x-e2e-secret": secret },
    data: { email, password: "e2e-password-1234" },
  });
  await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
  if (fn) await fn(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}.png` });
  await page.close();
}
// ensure default board via /tasks, then seed
const desk = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
{
  const p = await desk.newPage();
  await p.request.post(`${base}/api/test/login`, {
    headers: { "x-e2e-secret": secret },
    data: { email, password: "e2e-password-1234" },
  });
  await p.goto(`${base}/tasks`, { waitUntil: "networkidle" });
  await p.close();
}
const boardId = sql(`select id from boards where user_id='${uid}' limit 1`);
const cols = sql(
  `select id||'|'||name from board_columns where board_id='${boardId}' order by position`,
)
  .split("\n")
  .map((l) => l.split("|"));
const col = (n) => cols.find((c) => c[1] === n)?.[0] ?? cols[0][0];
const now = new Date();
const d = (days, h = 10) => {
  const x = new Date(now);
  x.setDate(x.getDate() + days);
  x.setHours(h, 0, 0, 0);
  return x.toISOString();
};
sql(`insert into cards (user_id, board_id, column_id, title, position, priority, due_at, due_has_time, labels) values
 ('${uid}','${boardId}','${col("Todo")}','PRD 검토 의견 정리','a0',1,'${d(0, 15)}',true,'{"문서"}'),
 ('${uid}','${boardId}','${col("Todo")}','Muse 파이널 패스 결과 검수','a1',2,'${d(1)}',false,'{}'),
 ('${uid}','${boardId}','${col("Todo")}','아이폰 PWA 설치 테스트','a2',2,'${d(3)}',false,'{"기기"}'),
 ('${uid}','${boardId}','${col("Doing")}','회의 요약 프롬프트 v2','a0',0,'${d(-2)}',false,'{}'),
 ('${uid}','${boardId}','${col("Doing")}','주간 리뷰 크론 점검','a1',2,null,false,'{}'),
 ('${uid}','${boardId}','${col("Done")}','캘린더 증분 동기화','a0',2,null,false,'{}')`);
sql(
  `update cards set completed_at=now() where user_id='${uid}' and title='캘린더 증분 동기화'`,
);
const intId = sql(
  `insert into integrations (user_id, provider, account_email, status, last_synced_at) values ('${uid}','google_calendar','${email}','connected',now()) returning id`,
);
const calId = sql(
  `insert into calendars (user_id, integration_id, external_id, name, color, is_primary, selected, writable) values ('${uid}','${intId}','primary','내 캘린더','#4f46e5',true,true,true) returning id`,
);
const ev = [
  ["팀 스탠드업", 0, 9, 9.5],
  ["PRD 리뷰", 0, 14, 15],
  ["1:1 디자인", 1, 11, 12],
  ["Muse 스파이크 공유", 2, 16, 17],
  ["치과", 4, 18, 19],
  ["주간 계획", 7, 10, 11],
  ["런치 미팅", -1, 12, 13],
];
for (const [t, dd, h1, h2] of ev) {
  const s = new Date(now);
  s.setDate(s.getDate() + dd);
  s.setHours(Math.floor(h1), (h1 % 1) * 60, 0, 0);
  const e = new Date(now);
  e.setDate(e.getDate() + dd);
  e.setHours(Math.floor(h2), (h2 % 1) * 60, 0, 0);
  sql(
    `insert into calendar_events (user_id, calendar_id, external_id, title, start_at, end_at, all_day, sync_status) values ('${uid}','${calId}','ev-${t}-${dd}','${t}','${s.toISOString()}','${e.toISOString()}',false,'synced')`,
  );
}
sql(`insert into meetings (user_id, title, status, final_pass_status, started_at, ended_at, duration_sec) values
 ('${uid}','제품 로드맵 싱크','ready','done','${d(-1, 14)}','${d(-1, 15)}',3480),
 ('${uid}','Muse 전사 품질 리뷰','ready','done','${d(-3, 10)}','${d(-3, 11)}',2700),
 ('${uid}','온보딩 인터뷰','ready','running','${d(-6, 16)}','${d(-6, 17)}',1980)`);
sql(`insert into memories (user_id, kind, content, importance, source, status) values
 ('${uid}','preference','아침 9시 전 회의는 피한다',4,'{"type":"thread"}','active'),
 ('${uid}','person','지수는 디자인 리드, 금요일 오후는 비어 있다',3,'{"type":"meeting"}','active'),
 ('${uid}','decision','파이널 패스는 맥 워커 우선, Muse 폴백',5,'{"type":"thread"}','active'),
 ('${uid}','routine','일요일 저녁에 주간 리뷰를 읽는다',2,'{"type":"manual"}','active')`);
sql(`insert into captures (user_id, raw_text, origin, status, triage) values
 ('${uid}','내일 오후 3시에 지수랑 디자인 리뷰','text','triaged','{"type":"event","reason":"시간이 명시됨","event":{"title":"디자인 리뷰","startAt":"${d(1, 15)}","endAt":"${d(1, 16)}"}}'),
 ('${uid}','회의 요약 프롬프트에 참석자 역할 넣기','voice','triaged','{"type":"task","reason":"할 일","task":{"title":"회의 요약 프롬프트에 참석자 역할 넣기","priority":2}}')`);

const openChat = async (page) => {
  await page.keyboard.press("Shift+Space");
  await page.waitForTimeout(1200);
};
await shoot(desk, "d-today", "/today");
await shoot(desk, "d-today-chat", "/today", openChat);
await shoot(desk, "d-tasks", `/tasks/${boardId}`);
await shoot(desk, "d-cal-month", "/calendar?view=month");
await shoot(desk, "d-cal-week", "/calendar?view=week");
await shoot(desk, "d-cal-agenda", "/calendar?view=agenda");
await shoot(desk, "d-meetings", "/meetings");
await shoot(desk, "d-insights", "/insights");
await shoot(desk, "d-memory", "/memory");
await shoot(desk, "d-capture", "/capture");
await shoot(desk, "d-settings", "/settings");
const mob = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
await shoot(mob, "m-today", "/today");
await shoot(mob, "m-tasks", `/tasks/${boardId}`);
await shoot(mob, "m-cal-agenda", "/calendar?view=agenda");
await shoot(mob, "m-cal-month", "/calendar?view=month");
await shoot(mob, "m-meetings", "/meetings");
await shoot(mob, "m-insights", "/insights");
await browser.close();
await admin.auth.admin.deleteUser(uid);
server.kill();
console.log("shots done", boardId);
