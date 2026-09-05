import { execFileSync } from "node:child_process";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { adminClient } from "../../src/test/supabase";
import { loginAsTestUser } from "./helpers";

const db = adminClient();
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
async function saved<T>(
  query: PromiseLike<{ data: T; error: unknown }>,
): Promise<NonNullable<T>> {
  const { data, error } = await query;
  if (error) throw error;
  return data as NonNullable<T>;
}
async function seedTasks(userId: string) {
  const board = await saved(
    db
      .from("boards")
      .insert({
        user_id: userId,
        name: "E2E 보드",
        is_default: true,
        position: "a0",
      })
      .select()
      .single(),
  );
  const column = await saved(
    db
      .from("board_columns")
      .insert({
        user_id: userId,
        board_id: board.id,
        name: "Todo",
        position: "a0",
        is_done: false,
      })
      .select()
      .single(),
  );
  const cards = await saved(
    db
      .from("cards")
      .insert([
        {
          user_id: userId,
          board_id: board.id,
          column_id: column.id,
          title: "E2E 오늘 결과",
          position: "a0",
          priority: 0,
          plan_date: null,
          due_at: null,
        },
        {
          user_id: userId,
          board_id: board.id,
          column_id: column.id,
          title: "E2E 남은 계획",
          position: "a1",
          priority: 0,
          plan_date: today(),
          due_at: "2027-12-30T03:00:00Z",
        },
      ])
      .select(),
  );
  await saved(
    db.from("insights").insert({
      user_id: userId,
      kind: "daily_brief",
      period_start: today(),
      period_end: today(),
      content_md: "테스트 사용자의 오늘 계획이에요.",
      data: {},
    }),
  );
  return cards;
}
async function openThread(page: Page, title: string) {
  await page.getByRole("button", { name: /레이첼 열기/ }).click();
  await page.getByRole("button", { name: "대화 목록", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(title) }).click();
}
async function screenshot(page: Page, name: string) {
  await mkdir("output/playwright", { recursive: true });
  await page.screenshot({
    path: `output/playwright/${name}.png`,
    fullPage: !name.startsWith("approval"),
  });
}

test("A29 A30 Today plan actions preserve deadlines at 375px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const user = await loginAsTestUser(page);
  try {
    const cards = await seedTasks(user.id);
    const chosen = cards.find((c) => c.title === "E2E 오늘 결과");
    const remaining = cards.find((c) => c.title === "E2E 남은 계획");
    if (!chosen || !remaining) throw new Error("missing cards");
    await page.goto("/today");
    await expect(
      page.getByRole("heading", { name: "오늘", exact: true }),
    ).toBeVisible();
    await page.getByText(/미완료 계획 .*개 정리하기/).click();
    await page
      .getByRole("button", { name: "그대로 두기", exact: true })
      .click();
    await expect(page.getByText("오늘 계획에 그대로 뒀어요.")).toBeVisible();
    expect(
      await saved(
        db
          .from("cards")
          .select("plan_date,due_at,updated_at")
          .eq("id", remaining.id)
          .single(),
      ),
    ).toEqual({
      plan_date: remaining.plan_date,
      due_at: remaining.due_at,
      updated_at: remaining.updated_at,
    });
    await page.reload();
    await page
      .getByRole("checkbox", { name: "E2E 오늘 결과 오늘 계획에 선택" })
      .check();
    await page
      .getByRole("button", { name: "선택한 1개 오늘 계획에 넣기" })
      .click();
    await expect
      .poll(
        async () =>
          (
            await saved(
              db.from("cards").select("plan_date").eq("id", chosen.id).single(),
            )
          ).plan_date,
      )
      .toBe(today());
    await page.getByText(/미완료 계획 .*개 정리하기/).click();
    const close = page
      .getByRole("heading", { name: "하루 정리", exact: true })
      .locator("xpath=ancestor::section[1]");
    const row = close
      .getByRole("listitem")
      .filter({ hasText: "E2E 남은 계획" });
    await row.getByRole("button", { name: "내일 계획", exact: true }).click();
    await expect
      .poll(
        async () =>
          (
            await saved(
              db
                .from("cards")
                .select("plan_date")
                .eq("id", remaining.id)
                .single(),
            )
          ).plan_date,
      )
      .not.toBe(today());
    const moved = await saved(
      db.from("cards").select("due_at").eq("id", remaining.id).single(),
    );
    expect(moved.due_at).toBe(remaining.due_at);
    const chosenRow = close
      .getByRole("listitem")
      .filter({ hasText: "E2E 오늘 결과" });
    await chosenRow.getByRole("button", { name: "계획에서 빼기" }).click();
    await expect
      .poll(
        async () =>
          (
            await saved(
              db.from("cards").select("plan_date").eq("id", chosen.id).single(),
            )
          ).plan_date,
      )
      .toBeNull();
    expect(
      (
        await saved(
          db.from("cards").select("due_at").eq("id", chosen.id).single(),
        )
      ).due_at,
    ).toBe(chosen.due_at);
    await expect(page.getByText("오늘 남은 계획이 없어요.")).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await screenshot(page, `today-mobile-${test.info().project.name}`);
  } finally {
    await user.cleanup();
  }
});

test("A07 newest persisted messages survive and older pages load", async ({
  page,
}) => {
  const user = await loginAsTestUser(page);
  try {
    await seedTasks(user.id);
    const thread = await saved(
      db
        .from("chat_threads")
        .insert({ user_id: user.id, title: "긴 대화 E2E" })
        .select()
        .single(),
    );
    const base = Date.now() - 300_000;
    await saved(
      db.from("chat_messages").insert(
        Array.from({ length: 205 }, (_, i) => ({
          id: `history-${randomUUID()}`,
          user_id: user.id,
          thread_id: thread.id,
          role: i % 2 ? "assistant" : "user",
          parts: [
            { type: "text", text: `E2E 기록 ${String(i).padStart(3, "0")}` },
          ],
          created_at: new Date(base + i * 1000).toISOString(),
        })),
      ),
    );
    await page.goto("/today");
    await openThread(page, "긴 대화 E2E");
    await expect(page.getByText("E2E 기록 204", { exact: true })).toBeVisible();
    await expect(page.getByText("E2E 기록 000", { exact: true })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "이전 대화 보기" }).click();
    await expect(page.getByText("E2E 기록 000", { exact: true })).toHaveCount(
      1,
    );
    await page.reload();
    await openThread(page, "긴 대화 E2E");
    await expect(page.getByText("E2E 기록 204", { exact: true })).toBeVisible();
    await screenshot(page, `history-${test.info().project.name}`);
  } finally {
    await user.cleanup();
  }
});

test("settings preferences and processed capture links persist", async ({
  page,
}) => {
  const user = await loginAsTestUser(page);
  try {
    const cards = await seedTasks(user.id);
    const card = cards[0];
    if (!card) throw new Error("missing card");
    const capture = await saved(
      db
        .from("captures")
        .insert({
          user_id: user.id,
          raw_text: "E2E 처리한 계약 메모",
          origin: "text",
          status: "resolved",
          resolved_ref: { type: "card", id: card.id },
        })
        .select()
        .single(),
    );
    await page.goto("/settings");
    await page
      .getByRole("combobox", { name: "답변 길이", exact: true })
      .selectOption("brief");
    await page.getByText("시간 배치와 시간대", { exact: true }).click();
    await page
      .getByLabel("시간 추천 시작 (시, 선택)", { exact: true })
      .fill("13");
    await page.getByRole("button", { name: "선호 저장", exact: true }).click();
    await expect(page.getByText("선호를 저장했어요.")).toBeVisible();
    const profile = await saved(
      db.from("profiles").select("settings").eq("id", user.id).single(),
    );
    expect(profile.settings).toMatchObject({
      assistant: {
        responseLength: "brief",
        scheduling: { preferredStartHour: 13 },
      },
    });
    await page.reload();
    await expect(
      page.getByRole("combobox", { name: "답변 길이", exact: true }),
    ).toHaveValue("brief");
    await screenshot(page, `settings-${test.info().project.name}`);
    await page.goto(`/capture/${capture.id}`);
    await expect(page.getByText("처리 완료", { exact: true })).toBeVisible();
    await screenshot(page, `capture-processed-${test.info().project.name}`);
    await page.getByRole("link", { name: "연결된 항목 열기" }).click();
    await expect(page).toHaveURL(new RegExp(`card=${card.id}`));
    await page.goto(`/capture/${capture.id}`);
    await page.getByRole("button", { name: "수집함으로 복원" }).click();
    await expect
      .poll(
        async () =>
          (
            await saved(
              db
                .from("captures")
                .select("status")
                .eq("id", capture.id)
                .single(),
            )
          ).status,
      )
      .toBe("triaged");
  } finally {
    await user.cleanup();
  }
});

for (const { approved, deletingCurrent } of [
  { approved: true, deletingCurrent: false },
  { approved: false, deletingCurrent: false },
  { approved: true, deletingCurrent: true },
])
  test(`A01 A02 pending signed approval ${deletingCurrent ? "deletes current thread and starts a new conversation" : approved ? "executes once" : "rejects without mutation"}`, async ({
    page,
  }) => {
    const user = await loginAsTestUser(page);
    try {
      const card = (await seedTasks(user.id))[0];
      if (!card) throw new Error("missing card");
      const thread = await saved(
        db
          .from("chat_threads")
          .insert({ user_id: user.id, title: "승인 대기 E2E" })
          .select()
          .single(),
      );
      const userMessageId = `user-${randomUUID()}`;
      const callId = `call-${randomUUID()}`;
      const approvalId = `approval-${randomUUID()}`;
      const turnKey = `${thread.id}:${userMessageId}`;
      const input = { id: deletingCurrent ? thread.id : card.id };
      const name = deletingCurrent ? "agent.deleteThread" : "tasks.delete";
      const aiName = name.replace(".", "_");
      const requestText = deletingCurrent
        ? "현재 대화 삭제 E2E"
        : "이 테스트 할 일을 삭제해줘";
      const env = Object.fromEntries(
        execFileSync("pnpm", ["supabase", "status", "-o", "env"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        })
          .split("\n")
          .filter((line) => line.includes("="))
          .map((line) => {
            const at = line.indexOf("=");
            return [
              line.slice(0, at),
              line.slice(at + 1).replace(/^"|"$/g, ""),
            ];
          }),
      );
      const secret = createHash("sha256")
        .update(`${env.SECRET_KEY}:rachel-approval:${user.id}:${thread.id}`)
        .digest("hex");
      const digest = createHash("sha256")
        .update(JSON.stringify(input))
        .digest("base64url");
      const signature = createHmac("sha256", secret)
        .update(
          JSON.stringify([
            "ai-sdk-tool-approval-v1",
            approvalId,
            callId,
            aiName,
            digest,
          ]),
        )
        .digest("base64url");
      const targets = [
        deletingCurrent
          ? {
              table: "chat_threads",
              id: thread.id,
              version: JSON.stringify([thread.created_at, thread.title]),
            }
          : { table: "cards", id: card.id, version: card.updated_at },
      ];
      await saved(
        db.from("agent_tool_approvals").insert({
          user_id: user.id,
          turn_key: turnKey,
          tool_call_id: callId,
          tool_name: name,
          input,
          targets,
          preview: {
            targets,
            count: 1,
            google: false,
            undo: false,
            rows: [
              {
                title: deletingCurrent ? thread.title : card.title,
                changes: [],
                action: "영구 삭제",
              },
            ],
          },
        }),
      );
      await saved(
        db.from("chat_messages").insert([
          {
            id: userMessageId,
            user_id: user.id,
            thread_id: thread.id,
            role: "user",
            parts: [{ type: "text", text: requestText }],
            created_at: new Date(Date.now() - 2000).toISOString(),
          },
          {
            id: `assistant-${randomUUID()}`,
            user_id: user.id,
            thread_id: thread.id,
            role: "assistant",
            parts: [
              {
                type: `tool-${aiName}`,
                toolCallId: callId,
                state: "approval-requested",
                input,
                approval: { id: approvalId, signature },
              },
            ],
            created_at: new Date(Date.now() - 1000).toISOString(),
          },
        ]),
      );
      await page.goto("/today");
      await openThread(page, "승인 대기 E2E");
      await expect(
        page.getByRole("button", { name: "변경 실행", exact: true }),
      ).toBeEnabled();
      // Reload an unresolved request; both persisted message and bound proposal must survive.
      await page.reload();
      await openThread(page, "승인 대기 E2E");
      await expect(
        page.getByRole("button", { name: "변경 실행", exact: true }),
      ).toBeEnabled();
      await screenshot(
        page,
        `approval-pending-${deletingCurrent ? "current-thread" : approved}-${test.info().project.name}`,
      );
      const resumed: string[] = [];
      page.on("request", (request) => {
        if (request.url().endsWith("/api/chat"))
          resumed.push(request.postData() ?? "");
      });
      await page
        .getByRole("button", {
          name: approved ? "변경 실행" : "취소",
          exact: true,
        })
        .dblclick();
      await expect
        .poll(
          async () =>
            (
              await saved(
                db
                  .from("agent_tool_approvals")
                  .select("status")
                  .eq("tool_call_id", callId)
                  .single(),
              )
            ).status,
        )
        .toBe(approved ? "approved" : "rejected");
      await expect.poll(() => resumed.length).toBe(1);
      if (deletingCurrent) {
        await expect
          .poll(
            async () =>
              (
                await saved(
                  db.from("chat_threads").select("id").eq("id", thread.id),
                )
              ).length,
          )
          .toBe(0);
        await expect(
          page.getByText("대화를 삭제했어요. 새 대화를 시작할 수 있어요.", {
            exact: true,
          }),
        ).toBeVisible();
        await expect(page.getByText(requestText, { exact: true })).toHaveCount(
          0,
        );
        const runs = await saved(
          db
            .from("agent_tool_runs")
            .select("status,thread_id")
            .eq("turn_key", turnKey)
            .eq("tool_name", name),
        );
        expect(runs).toEqual([{ status: "done", thread_id: null }]);
        const composer = page.getByPlaceholder("레이첼에게 말하기", {
          exact: true,
        });
        await expect(composer).toBeEmpty();
        await composer.fill("삭제 후 새 대화 E2E");
        await composer.press("Enter");
        await expect(
          page.getByText("브라우저 검증 응답입니다.", { exact: true }),
        ).toBeVisible();
        expect(JSON.parse(resumed[1] ?? "{}").id).not.toBe(thread.id);
        expect(
          await saved(db.from("chat_threads").select("id").eq("id", thread.id)),
        ).toEqual([]);
        await screenshot(
          page,
          `approval-current-thread-${test.info().project.name}`,
        );
        return;
      }
      await expect(
        page.getByText("브라우저 검증 응답입니다.", { exact: true }),
      ).toBeVisible();
      const remaining = await saved(
        db.from("cards").select("id").eq("id", card.id),
      );
      expect(remaining).toHaveLength(approved ? 0 : 1);
      const receipts = await saved(
        db
          .from("agent_tool_runs")
          .select("status")
          .eq("user_id", user.id)
          .eq("turn_key", turnKey)
          .eq("tool_name", "tasks.delete"),
      );
      expect(receipts).toHaveLength(approved ? 1 : 0);
      if (approved) expect(receipts[0]?.status).toBe("done");
      await page.reload();
      await openThread(page, "승인 대기 E2E");
      await expect(
        page.getByText("브라우저 검증 응답입니다.", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "변경 실행", exact: true }),
      ).toHaveCount(0);
      await screenshot(
        page,
        `approval-${approved}-${test.info().project.name}`,
      );
    } finally {
      await user.cleanup();
    }
  });
