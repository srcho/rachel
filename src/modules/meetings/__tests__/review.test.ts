import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ServiceContext } from "@/core/contracts";
import type { Json } from "@/core/db/types.generated";
import { createRegistry } from "@/core/registry/registry";
import { tasksModule } from "@/modules/tasks/module";
import { tasksService } from "@/modules/tasks/service";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { createMeetingTasks } from "../review";
import { meetingActionKey, meetingDue } from "../review-items";
import type { MeetingSummary } from "../schema";

const startedAt = "2026-09-04T05:00:00Z";
const summary: MeetingSummary = {
  tldr: "제품 검토",
  keyPoints: [],
  decisions: [],
  participants: [],
  openQuestions: [],
  followups: [],
  actionItems: [
    { title: "PRD 검토", owner: "나", due: "내일", sourceSeq: [1] },
    {
      title: "시안 공유",
      owner: "민수",
      due: "다음 주 월요일",
      sourceSeq: [2],
    },
  ],
};
it("resolves relative meeting due dates from the meeting, even when reviewed days later", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-07T05:00:00Z"));
  try {
    expect(meetingDue("내일", startedAt, "Asia/Seoul")?.dueAt).toBe(
      "2026-09-05T14:59:00.000Z",
    );
    expect(meetingDue("2026-09-05", startedAt, "Asia/Seoul")?.dueAt).toBe(
      "2026-09-05T14:59:00.000Z",
    );
    expect(meetingDue("조만간", startedAt, "Asia/Seoul")).toBeNull();
    expect(meetingDue("2026-02-30", startedAt, "Asia/Seoul")).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
const available = await localSupabaseAvailable();
describe.skipIf(!available)("meeting follow-up creation", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let other: Awaited<ReturnType<typeof testUser>>;
  let ctx: ServiceContext;
  let meetingId: string;
  beforeAll(async () => {
    user = await testUser("review");
    other = await testUser("review-other");
    ctx = {
      db: user.db,
      userId: user.id,
      now: new Date("2026-09-07T05:00:00Z"),
      timezone: "Asia/Seoul",
      actor: "user",
      registry: createRegistry(() => [tasksModule]),
      emit: async () => {},
      enqueue: async () => "",
    };
    await tasksService(ctx).ensureDefaultBoard();
    const { data, error } = await user.db
      .from("meetings")
      .insert({
        title: "제품 검토",
        started_at: startedAt,
        summary: summary as unknown as Json,
      })
      .select("id")
      .single();
    if (error) throw error;
    meetingId = data.id;
  });
  afterAll(async () => {
    await user?.cleanup();
    await other?.cleanup();
  });
  it("keeps one result across concurrent and repeated review and uses the historical due date", async () => {
    const choices = summary.actionItems.map((a) => ({
      key: meetingActionKey(meetingId, a),
      title: a.title,
    }));
    const [a, b] = await Promise.all([
      createMeetingTasks(ctx, meetingId, choices),
      createMeetingTasks(ctx, meetingId, choices),
    ]);
    expect(a).toEqual(b);
    expect(await createMeetingTasks(ctx, meetingId, choices)).toEqual(a);
    const cards = await tasksService(ctx).listCards({});
    expect(cards).toHaveLength(2);
    expect(
      new Date(
        cards.find((c) => c.title === "PRD 검토")?.due_at ?? "",
      ).toISOString(),
    ).toBe("2026-09-05T14:59:00.000Z");
  });
  it("rejects another user's meeting and stale action keys", async () => {
    await expect(
      createMeetingTasks(
        { ...ctx, db: other.db, userId: other.id },
        meetingId,
        [],
      ),
    ).rejects.toThrow("회의를 찾을 수 없어요");
    await expect(
      createMeetingTasks(ctx, meetingId, [
        { key: "stale", title: "다른 작업" },
      ]),
    ).rejects.toThrow("요약이 바뀌었어요");
  });
  it("freezes reference classification and does not create a task on retry", async () => {
    const m = await user.db
      .from("meetings")
      .insert({
        title: "분류 검토",
        started_at: startedAt,
        summary: summary as unknown as Json,
      })
      .select("id")
      .single();
    if (m.error) throw m.error;
    const key = meetingActionKey(m.data.id, summary.actionItems[0]!);
    const a = await createMeetingTasks(ctx, m.data.id, [
      { key, title: "참고 자료", kind: "reference" },
    ]);
    const b = await createMeetingTasks(ctx, m.data.id, [
      { key, title: "다시 시도", kind: "task" },
    ]);
    expect(b).toEqual(a);
    const cards = await user.db
      .from("cards")
      .select("id")
      .eq("creation_key", key);
    expect(cards.data).toEqual([]);
  });
});
