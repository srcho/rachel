import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventHandler, ServiceContext } from "@/core/contracts";
import { createEmitter } from "@/core/events/bus";
import { createRegistry } from "@/core/registry/registry";
import {
  getProfileSettings,
  updateProfileSettings,
} from "@/core/settings/profile";
import {
  gtaskChangedHandler,
  gtaskCreatedHandler,
  gtasksEnabledHandler,
} from "@/modules/tasks/events";
import { cardSnapshot, tasksService } from "@/modules/tasks/service";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { eventService } from "../events";
import { GoogleApiError, GTASKS_SCOPE, google, gtasks } from "../google";
import { gtasksService } from "../gtasks";
import { gtasksPushHandler } from "../gtasks-handlers";
import { type CalendarRow, calendarRepository } from "../repository";
import { syncCalendars } from "../sync";

vi.mock("../tokens", () => ({
  getAccessToken: async () => "test-only",
  NeedsReauthError: class extends Error {},
}));
const available = await localSupabaseAvailable();
describe.skipIf(!available)("calendar review regressions", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let ctx: ServiceContext;
  let cal: CalendarRow;
  beforeEach(async () => {
    user = await testUser("cal-review");
    ctx = {
      db: user.db,
      userId: user.id,
      actor: "system",
      now: new Date("2026-09-05T01:00:00Z"),
      timezone: "Asia/Seoul",
      registry: createRegistry(() => []),
      emit: async () => {},
      enqueue: async () => "job",
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(google, "insertEvent").mockRejectedValue(new Error("offline"));
    vi.spyOn(google, "patchEvent").mockRejectedValue(new Error("offline"));
    const repo = calendarRepository(user.db, user.id);
    const integration = await repo.upsertIntegration({
      account_email: user.email,
      scopes: [GTASKS_SCOPE],
      status: "connected",
    });
    const rows = await repo.upsertCalendars([
      {
        integration_id: integration.id,
        external_id: "primary",
        name: "Calendar",
        is_primary: true,
        writable: true,
        selected: true,
        color: null,
      },
    ]);
    if (!rows[0]) throw new Error("missing calendar fixture");
    cal = rows[0];
    await updateProfileSettings(user.db, user.id, {
      gtasks: { enabled: true, listId: "list" },
    });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await user?.cleanup();
  });

  async function mirror(externalId: string) {
    return calendarRepository(user.db, user.id).insertEvent({
      calendar_id: cal.id,
      external_id: externalId,
      title: externalId,
      start_at: "2026-09-10T00:00:00Z",
      end_at: "2026-09-10T01:00:00Z",
      sync_status: "synced",
    });
  }
  it("preserves all-day dates and event timezone when only a title changes after travel", async () => {
    const original = await eventService(ctx).createEvent({
      title: "day",
      startAt: "2026-09-10T00:00:00+09:00",
      allDay: true,
    });
    const { event } = await eventService({
      ...ctx,
      timezone: "America/New_York",
    }).updateEvent(original.id, { title: "renamed" });
    expect([event.start_at, event.end_at, event.timezone]).toEqual([
      original.start_at,
      original.end_at,
      original.timezone,
    ]);
  });
  it("keeps event expansion parameters for incremental requests", async () => {
    await calendarRepository(user.db, user.id).updateCalendar(cal.id, {
      sync_token: "old",
    });
    const list = vi
      .spyOn(google, "listEvents")
      .mockResolvedValue({ items: [], nextSyncToken: "new" });
    expect((await syncCalendars(ctx)).errors).toEqual([]);
    expect(list).toHaveBeenCalledWith(
      "test-only",
      "primary",
      expect.objectContaining({
        syncToken: "old",
        singleEvents: "true",
        showDeleted: "true",
        maxResults: "250",
      }),
    );
    expect(list.mock.calls[0]?.[2]).not.toHaveProperty("timeMin");
  });
  it("reconciles missing rows after a token410 full snapshot while preserving concurrent and pending writes", async () => {
    const repo = calendarRepository(user.db, user.id);
    const missing = await mirror("gone");
    const edited = await mirror("changed-during-sync");
    const pending = await mirror("pending");
    await repo.updateEvent(pending.id, { sync_status: "conflict" });
    await repo.updateCalendar(cal.id, { sync_token: "expired" });
    vi.spyOn(google, "listEvents")
      .mockRejectedValueOnce(new GoogleApiError(410, "expired"))
      .mockImplementationOnce(async () => {
        await repo.updateEvent(edited.id, { title: "newer sync" });
        return { items: [], nextPageToken: "page2" };
      })
      .mockResolvedValueOnce({ items: [], nextSyncToken: "fresh" });
    expect((await syncCalendars(ctx)).errors).toEqual([]);
    expect((await repo.getEvent(missing.id))?.deleted_at).not.toBeNull();
    expect((await repo.getEvent(edited.id))?.deleted_at).toBeNull();
    expect((await repo.getEvent(pending.id))?.deleted_at).toBeNull();
    expect((await repo.getCalendar(cal.id))?.sync_token).toBe("fresh");
  });
  it("does not delete missing rows or mark coverage fresh after a later page fails", async () => {
    const row = await mirror("keep-until-complete");
    vi.spyOn(google, "listEvents")
      .mockResolvedValueOnce({ items: [], nextPageToken: "page2" })
      .mockRejectedValueOnce(new Error("page failed"));
    expect((await syncCalendars(ctx)).errors).toHaveLength(1);
    const repo = calendarRepository(user.db, user.id);
    expect((await repo.getEvent(row.id))?.deleted_at).toBeNull();
    expect((await repo.getCalendar(cal.id))?.last_synced_at).toBeNull();
  });
  it("drops stale pushes after a newer title and after canonical deletion", async () => {
    const tasks = tasksService(ctx);
    const card = await tasks.createCard({
      title: "old",
      dueAt: "2026-09-10T00:00:00Z",
    });
    const snapshot = cardSnapshot(card);
    const insert = vi
      .spyOn(gtasks, "insert")
      .mockResolvedValue({ id: "remote", updated: "2026-09-05T02:00:00Z" });
    const patch = vi.spyOn(gtasks, "patch").mockResolvedValue({ id: "remote" });
    const latest = await tasks.updateCard(card.id, { title: "new" });
    await gtasksService(ctx).push(cardSnapshot(latest.card));
    expect(await gtasksService(ctx).push(snapshot)).toBe("skipped");
    expect(insert).toHaveBeenCalledTimes(1);
    expect(patch).not.toHaveBeenCalled();
    await tasks.deleteCard(card.id);
    expect(await gtasksService(ctx).push(snapshot)).toBe("skipped");
    expect(insert).toHaveBeenCalledTimes(1);
  });
  it("keeps the pull cursor when an inbound handler fails, then retries successfully", async () => {
    const card = await tasksService(ctx).createCard({ title: "local" });
    await calendarRepository(user.db, user.id).upsertTaskLink({
      card_id: card.id,
      tasklist_id: "list",
      gtask_id: "remote",
    });
    const handler = vi.fn<EventHandler["handle"]>(async () => {
      throw new Error("database unavailable");
    });
    vi.spyOn(ctx.registry, "eventHandlers").mockImplementation((type) =>
      type === "gtask.changed"
        ? [{ on: "gtask.changed", handle: handler }]
        : [],
    );
    ctx.emit = createEmitter({
      db: user.db,
      userId: user.id,
      actor: "system",
      registry: ctx.registry,
      ctx: () => ctx,
    });
    vi.spyOn(gtasks, "list").mockResolvedValue({
      items: [
        {
          id: "remote",
          title: "remote change",
          updated: "2026-09-04T00:00:00Z",
        },
      ],
    });
    await expect(gtasksService(ctx).pull()).rejects.toThrow(
      "database unavailable",
    );
    expect(
      (await getProfileSettings(user.db, user.id)).gtasks?.pulledAt,
    ).toBeUndefined();
    handler.mockImplementation(async (event, context) =>
      gtaskChangedHandler.handle(event, context),
    );
    expect(await gtasksService(ctx).pull()).toMatchObject({ changed: 1 });
    expect((await tasksService(ctx).getCard(card.id))?.title).toBe(
      "remote change",
    );
  });
  it("keeps the requested date when editing an imported task in UTC+14", async () => {
    const card = await tasksService(ctx).createCard({ title: "date" });
    await gtaskChangedHandler.handle(
      {
        id: "event",
        userId: user.id,
        occurredAt: ctx.now.toISOString(),
        actor: "system",
        type: "gtask.changed",
        entity: { type: "card", id: card.id },
        payload: {
          cardId: card.id,
          title: "date",
          dueYmd: "2026-09-22",
          completed: false,
        },
      },
      { ...ctx, timezone: "Pacific/Kiritimati" },
    );
    expect((await tasksService(ctx).getCard(card.id))?.due_at).toBe(
      "2026-09-21T10:00:00+00:00",
    );
  });

  it("backfills due cards beyond the first 200 active cards", async () => {
    const seed = await tasksService(ctx).createCard({
      title: "seed without due",
    });
    const { data, error } = await user.db
      .from("cards")
      .insert(
        Array.from({ length: 205 }, (_, index) => ({
          user_id: user.id,
          board_id: seed.board_id,
          column_id: seed.column_id,
          title: `backfill ${index}`,
          position: `p${String(index).padStart(3, "0")}`,
          due_at: "2026-09-10T00:00:00Z",
        })),
      )
      .select("id");
    if (error) throw error;
    const enqueue = vi.fn<ServiceContext["enqueue"]>(async () => "job");
    await gtasksEnabledHandler.handle(
      {
        id: "enable",
        userId: user.id,
        occurredAt: ctx.now.toISOString(),
        actor: "user",
        type: "gtasks.enabled",
        entity: { type: "integration", id: cal.integration_id },
        payload: {},
      },
      { ...ctx, enqueue },
    );
    expect(enqueue).toHaveBeenCalledTimes(205);
    expect(
      new Set(
        enqueue.mock.calls.map(
          ([job]) => (job.payload as { card: { id: string } }).card.id,
        ),
      ),
    ).toEqual(new Set(data.map((row) => row.id)));
  });

  it("retries a partially imported Google task without duplicating its card", async () => {
    let failed = false;
    vi.spyOn(ctx.registry, "eventHandlers").mockImplementation((type) =>
      type === "gtask.created"
        ? [gtaskCreatedHandler]
        : type === "task.created"
          ? [
              {
                on: type,
                handle: async (event, context) => {
                  if (!failed) {
                    failed = true;
                    throw new Error("link failed");
                  }
                  await gtasksPushHandler.handle(event, context);
                },
              },
            ]
          : [],
    );
    ctx.emit = createEmitter({
      db: user.db,
      userId: user.id,
      actor: "system",
      registry: ctx.registry,
      ctx: () => ctx,
    });
    vi.spyOn(gtasks, "list").mockResolvedValue({
      items: [{ id: "new-remote", title: "import once" }],
    });
    await expect(gtasksService(ctx).pull()).rejects.toThrow("link failed");
    await gtasksService(ctx).pull();
    expect(
      await tasksService(ctx).listCards({ q: "import once" }),
    ).toHaveLength(1);
    expect(
      await calendarRepository(user.db, user.id).listTaskLinks(),
    ).toHaveLength(1);
  });
});
