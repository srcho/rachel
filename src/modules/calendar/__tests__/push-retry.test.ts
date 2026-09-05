import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ServiceContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { eventService } from "../events";
import { type GEvent, GoogleApiError, google } from "../google";
import { calendarRepository } from "../repository";

vi.mock("../tokens", () => ({
  getAccessToken: async () => "test-only",
  NeedsReauthError: class extends Error {},
}));
const available = await localSupabaseAvailable();
describe.skipIf(!available)(
  "calendar retry after a lost Google response",
  () => {
    let user: Awaited<ReturnType<typeof testUser>>;
    let ctx: ServiceContext;
    beforeAll(async () => {
      user = await testUser("push-retry");
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
    });
    afterAll(async () => {
      vi.restoreAllMocks();
      await user?.cleanup();
    });
    it("recovers the same remote event with a stable id instead of creating a second event", async () => {
      let remote: GEvent | undefined;
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const insert = vi
        .spyOn(google, "insertEvent")
        .mockImplementation(async (_token, _cal, body) => {
          if (remote) throw new GoogleApiError(409, "exists");
          remote = { ...body, id: body.id ?? "missing", etag: "v1" };
          throw new Error("network response lost after insert");
        });
      vi.spyOn(google, "getEvent").mockImplementation(
        async (_token, _cal, id) => {
          if (!remote || id !== remote.id) throw new Error("not found");
          return remote;
        },
      );
      const svc = eventService(ctx);
      const row = await svc.createEvent({
        creationKey: "capture:retry",
        title: "시안 검토",
        startAt: "2026-09-07T10:00:00+09:00",
        endAt: "2026-09-07T11:00:00+09:00",
      });
      expect(row.sync_status).toBe("pending_push");
      expect(await svc.pushPending()).toBe(1);
      const saved = await svc.getEvent(row.id);
      expect(saved?.external_id).toBe(row.id.replaceAll("-", ""));
      expect(saved?.sync_status).toBe("synced");
      expect(
        (
          await svc.createEvent({
            creationKey: "capture:retry",
            title: "시안 검토",
            startAt: "2026-09-07T10:00:00+09:00",
          })
        ).id,
      ).toBe(row.id);
      expect(insert).toHaveBeenCalledTimes(2);
      expect(insert.mock.calls[0]?.[2].id).toBe(insert.mock.calls[1]?.[2].id);
    });
  },
);
