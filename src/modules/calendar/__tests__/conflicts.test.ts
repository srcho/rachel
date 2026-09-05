import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ServiceContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { eventService } from "../events";
import { type GEvent, google } from "../google";
import { type CalendarRow, calendarRepository } from "../repository";
import { toRow } from "../sync";

vi.mock("../tokens", () => ({
  getAccessToken: async () => "test-only",
  NeedsReauthError: class extends Error {},
}));
const available = await localSupabaseAvailable();
describe.skipIf(!available)("calendar local/remote conflicts", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let other: Awaited<ReturnType<typeof testUser>>;
  let ctx: ServiceContext;
  let cal: CalendarRow;
  const remote: GEvent = {
    id: "conflict-event",
    summary: "Google 제목",
    etag: "v2",
    start: { dateTime: "2026-09-07T10:00:00+09:00" },
    end: { dateTime: "2026-09-07T11:00:00+09:00" },
  };
  beforeAll(async () => {
    user = await testUser("calendar-conflict");
    other = await testUser("calendar-other");
    ctx = {
      db: user.db,
      userId: user.id,
      actor: "user",
      now: new Date(),
      timezone: "Asia/Seoul",
      registry: createRegistry(() => []),
      emit: async () => {},
      enqueue: async () => "",
    };
    const repo = calendarRepository(user.db, user.id);
    const integration = await repo.upsertIntegration({
      account_email: user.email,
      status: "connected",
      scopes: [],
    });
    await repo.upsertCalendars([
      {
        integration_id: integration.id,
        external_id: "primary",
        name: "기본",
        color: null,
        selected: true,
        writable: true,
        is_primary: true,
      },
    ]);
    const first = (await repo.listCalendars())[0];
    if (!first) throw new Error("calendar fixture missing");
    cal = first;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await user?.cleanup();
    await other?.cleanup();
  });
  it("preserves pending edits on pull, checks both versions, and accepts the chosen remote values", async () => {
    const repo = calendarRepository(user.db, user.id);
    const row = await repo.insertEvent({
      ...toRow(cal, { ...remote, summary: "원래 제목", etag: "v1" }),
      sync_status: "synced",
    });
    await repo.updateEvent(row.id, {
      title: "레이첼 수정",
      sync_status: "pending_push",
    });
    await repo.upsertEvents([toRow(cal, remote)]);
    const conflict = await repo.getEvent(row.id);
    if (!conflict) throw new Error("conflict fixture missing");
    expect(conflict.title).toBe("레이첼 수정");
    expect(conflict?.sync_status).toBe("conflict");
    expect(conflict?.remote_snapshot).toMatchObject({
      title: "Google 제목",
      etag: "v2",
    });
    const get = vi.spyOn(google, "getEvent").mockResolvedValue(remote);
    const svc = eventService(ctx);
    await expect(
      svc.resolveConflict(row.id, "remote", row.updated_at, "v2"),
    ).rejects.toThrow("내용이 변경");
    get.mockResolvedValue({ ...remote, etag: "v3" });
    await expect(
      svc.resolveConflict(row.id, "remote", conflict.updated_at, "v2"),
    ).rejects.toThrow("내용이 변경");
    get.mockResolvedValue(remote);
    const resolved = await svc.resolveConflict(
      row.id,
      "remote",
      conflict.updated_at,
      "v2",
    );
    expect(resolved.title).toBe("Google 제목");
    expect(resolved.sync_status).toBe("synced");
    expect(resolved.remote_snapshot).toBeNull();
    const otherRepo = calendarRepository(other.db, other.id);
    expect(
      await otherRepo.upsertEvents([
        toRow(cal, { ...remote, summary: "다른 사용자의 수정" }),
      ]),
    ).toBe(0);
    expect((await repo.getEvent(row.id))?.title).toBe("Google 제목");
  });
  it("never overwrites newer local edits when an older push completes", async () => {
    const repo = calendarRepository(user.db, user.id);
    const row = await repo.insertEvent({
      ...toRow(cal, { ...remote, id: "racing-event" }),
      sync_status: "pending_push",
    });
    await repo.updateEvent(row.id, { title: "응답 대기 중 다시 수정" });
    const after = await repo.finishPush(row.id, row.updated_at, {
      title: "이전 제목",
      sync_status: "synced",
    });
    expect(after.title).toBe("응답 대기 중 다시 수정");
    expect(after.sync_status).toBe("pending_push");
  });
});
