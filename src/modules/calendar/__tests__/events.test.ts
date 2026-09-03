import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ServiceContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { eventService } from "../events";
import { calendarRepository } from "../repository";

const available = await localSupabaseAvailable();

describe.skipIf(!available)("eventService (mirror only, no Google)", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let ctx: ServiceContext;
  beforeAll(async () => {
    user = await testUser("cal");
    ctx = {
      userId: user.id,
      db: user.db,
      actor: "user",
      now: new Date("2026-09-03T01:00:00Z"),
      timezone: "Asia/Seoul",
      registry: createRegistry(() => []),
      emit: async () => {},
      enqueue: async () => "",
    };
    const repo = calendarRepository(user.db, user.id);
    // 연결 없이 캘린더 행만 만든다(needs_reauth 상태 → Google 호출 없이 pending 유지)
    const integration = await repo.upsertIntegration({
      account_email: "t@test.local",
      scopes: [],
      status: "needs_reauth",
    });
    await repo.upsertCalendars([
      {
        integration_id: integration.id,
        external_id: "primary",
        name: "기본",
        color: null,
        is_primary: true,
        writable: true,
        selected: true,
      },
    ]);
  });
  afterAll(async () => user?.cleanup());

  it("creates local pending events, lists by range, and finds free slots in work hours", async () => {
    const svc = eventService(ctx);
    const e = await svc.createEvent({
      title: "주간 싱크",
      startAt: "2026-09-04T10:00:00+09:00",
      endAt: "2026-09-04T11:00:00+09:00",
    });
    expect(e.sync_status).toBe("pending_push");
    expect(e.external_id.startsWith("local:")).toBe(true);
    await svc.createEvent({
      title: "점심",
      startAt: "2026-09-04T12:00:00+09:00",
      endAt: "2026-09-04T13:00:00+09:00",
    });
    const list = await svc.listEvents({
      from: "2026-09-03T15:00:00Z",
      to: "2026-09-04T15:00:00Z",
    });
    expect(list.map((x) => x.title)).toEqual(["주간 싱크", "점심"]);
    const slots = await svc.findFreeSlots({
      from: "2026-09-03T15:00:00Z",
      to: "2026-09-04T15:00:00Z",
      durationMinutes: 60,
      limit: 3,
    });
    expect(slots[0]).toEqual({
      startAt: "2026-09-04T00:00:00.000Z",
      endAt: "2026-09-04T01:00:00.000Z",
    }); // 09:00 KST
    expect(slots[1]?.startAt).toBe("2026-09-04T02:00:00.000Z"); // 11:00 KST
    const { event } = await svc.updateEvent(e.id, { title: "주간 싱크(변경)" });
    expect(event.title).toBe("주간 싱크(변경)");
    await svc.deleteEvent(e.id);
    expect(
      (
        await svc.listEvents({
          from: "2026-09-03T15:00:00Z",
          to: "2026-09-04T15:00:00Z",
        })
      ).map((x) => x.title),
    ).toEqual(["점심"]);
  });
});
