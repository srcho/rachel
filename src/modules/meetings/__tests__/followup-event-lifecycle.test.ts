import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ServiceContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { calendarTools } from "@/modules/calendar/tools";
import { tasksModule } from "@/modules/tasks/module";
import { tasksService } from "@/modules/tasks/service";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { createMeetingTasks, undoMeetingFollowups } from "../review";
import { meetingActionKey } from "../review-items";

vi.mock("@/modules/calendar/tokens", () => ({
  getAccessToken: async () => {
    throw new Error("test: Google offline");
  },
  NeedsReauthError: class extends Error {},
}));
const available = await localSupabaseAvailable();
describe.skipIf(!available)("meeting followup event reconfirmation", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let ctx: ServiceContext;
  beforeAll(async () => {
    user = await testUser("followup-reconfirm");
    ctx = {
      userId: user.id,
      db: user.db,
      actor: "user",
      now: new Date(),
      timezone: "Asia/Seoul",
      registry: createRegistry(() => [
        tasksModule,
        {
          manifest: {
            id: "calendar",
            name: "Calendar",
            icon: "calendar",
            schemaVersion: 1,
          },
          tools: calendarTools,
        },
      ]),
      emit: async () => {},
      enqueue: async () => "",
    };
    await tasksService(ctx).ensureDefaultBoard();
    const integration = await user.db
      .from("integrations")
      .insert({ provider: "google_calendar", status: "connected" })
      .select("id")
      .single();
    if (integration.error) throw integration.error;
    const calendar = await user.db.from("calendars").insert({
      integration_id: integration.data.id,
      external_id: "test",
      name: "Test",
      writable: true,
      selected: true,
      is_primary: true,
    });
    if (calendar.error) throw calendar.error;
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await user?.cleanup();
  });
  it("creates a live event after each Undo and reuses the current confirmation under concurrent retries", async () => {
    const action = { title: "후속 일정", owner: "나", sourceSeq: [0] };
    const meeting = await user.db
      .from("meetings")
      .insert({
        title: "회의",
        status: "ready",
        summary: {
          tldr: "회의",
          keyPoints: [],
          decisions: [],
          actionItems: [action],
          participants: [],
          openQuestions: [],
          followups: [],
        },
      })
      .select("id")
      .single();
    if (meeting.error) throw meeting.error;
    const choice = {
      key: meetingActionKey(meeting.data.id, action),
      title: action.title,
      kind: "event" as const,
      dueAt: "2026-10-01T00:00:00Z",
      dueHasTime: true,
    };
    const ids = new Set<string>();
    for (let generation = 0; generation < 3; generation++) {
      const [a, b] = await Promise.all([
        createMeetingTasks(ctx, meeting.data.id, [choice]),
        createMeetingTasks(ctx, meeting.data.id, [choice]),
      ]);
      const created = [...a, ...b].filter((r) => r.createdNow);
      expect(created).toHaveLength(1);
      const result = created[0];
      if (!result) throw new Error("missing created followup");
      expect(a[0]?.id).toBe(b[0]?.id);
      expect(ids.has(result.entityId)).toBe(false);
      ids.add(result.entityId);
      const event = await user.db
        .from("calendar_events")
        .select("deleted_at")
        .eq("id", result.entityId)
        .single();
      if (event.error) throw event.error;
      expect(event.data.deleted_at).toBeNull();
      const reused = await createMeetingTasks(ctx, meeting.data.id, [
        { ...choice, kind: "task" },
      ]);
      expect(reused[0]).toMatchObject({
        kind: "event",
        entityId: result.entityId,
        createdNow: false,
      });
      await undoMeetingFollowups(ctx, meeting.data.id, created);
      const deleted = await user.db
        .from("calendar_events")
        .select("deleted_at")
        .eq("id", result.entityId)
        .single();
      if (deleted.error) throw deleted.error;
      expect(deleted.data.deleted_at).not.toBeNull();
    }
  });
});
