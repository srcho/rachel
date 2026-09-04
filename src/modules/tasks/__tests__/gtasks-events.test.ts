import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DomainEvent, ServiceContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { gtaskChangedHandler, gtaskCreatedHandler } from "../events";
import { tasksService } from "../service";

const available = await localSupabaseAvailable();

/** Google Tasks 되돌려 받기: 이벤트 페이로드 스냅샷 + origin 표시 + 완료/재오픈/제목/마감 반영 */
describe.skipIf(!available)("tasks ↔ Google Tasks 이벤트", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  const emitted: Array<{ type: string; payload: Record<string, unknown> }> = [];
  let ctx: ServiceContext;
  const ev = (type: string, payload: unknown): DomainEvent => ({
    id: "e",
    userId: ctx.userId,
    occurredAt: new Date().toISOString(),
    type: type as `${string}.${string}`,
    entity: { type: "card", id: "" },
    payload,
    actor: "system",
  });

  beforeAll(async () => {
    user = await testUser("gtasks");
    ctx = {
      userId: user.id,
      db: user.db,
      actor: "user",
      now: new Date("2026-09-03T01:00:00Z"),
      timezone: "Asia/Seoul",
      registry: createRegistry(() => []),
      emit: async (e) => {
        emitted.push({
          type: e.type,
          payload: (e.payload ?? {}) as Record<string, unknown>,
        });
      },
      enqueue: async () => "job",
    };
  });
  afterAll(async () => {
    await user?.cleanup();
  });

  it("쓰기 이벤트마다 카드 스냅샷이 실린다", async () => {
    const svc = tasksService(ctx);
    const card = await svc.createCard({
      title: "미러 테스트",
      dueAt: "2026-09-05T09:00:00+09:00",
      dueHasTime: true,
    });
    const created = emitted.find((e) => e.type === "task.created");
    expect(created?.payload.card).toMatchObject({
      id: card.id,
      title: "미러 테스트",
      completed: false,
      archived: false,
    });
    expect(created?.payload.origin).toBeUndefined();
    await svc.updateCard(
      card.id,
      { title: "미러 테스트 2" },
      { origin: "google" },
    );
    const updated = emitted.filter((e) => e.type === "task.updated").at(-1);
    expect(updated?.payload.origin).toBe("google");
    expect((updated?.payload.card as { title: string }).title).toBe(
      "미러 테스트 2",
    );
  });

  it("bulkUpdate 도 카드 스냅샷을 싣는다(레이첼의 여러 건 변경이 미러를 탄다)", async () => {
    const svc = tasksService(ctx);
    const a = await svc.createCard({ title: "벌크 A" });
    const b = await svc.createCard({ title: "벌크 B" });
    await svc.bulkUpdate([a.id, b.id], { dueAt: "2026-09-10T00:00:00+09:00" });
    const evs = emitted.filter(
      (e) => e.type === "task.updated" && e.payload.bulk === true,
    );
    expect(evs).toHaveLength(2);
    for (const e of evs)
      expect((e.payload.card as { dueAt: string }).dueAt).toBe(
        "2026-09-09T15:00:00+00:00",
      );
  });

  it("Google 에서 완료 → Done 으로, 다시 미완료 → Todo 로", async () => {
    const svc = tasksService(ctx);
    const card = await svc.createCard({
      title: "구글 완료",
      dueAt: "2026-09-06T00:00:00+09:00",
    });
    await gtaskChangedHandler.handle(
      ev("gtask.changed", {
        cardId: card.id,
        title: "구글 완료",
        dueYmd: "2026-09-06",
        completed: true,
      }),
      ctx,
    );
    let now = await svc.getCard(card.id);
    expect(now?.completed_at).not.toBeNull();
    const completedEv = emitted
      .filter((e) => e.type === "task.completed")
      .at(-1);
    expect(completedEv?.payload.origin).toBe("google");

    await gtaskChangedHandler.handle(
      ev("gtask.changed", {
        cardId: card.id,
        title: "구글에서 제목 수정",
        dueYmd: "2026-09-08",
        completed: false,
      }),
      ctx,
    );
    now = await svc.getCard(card.id);
    expect(now?.completed_at).toBeNull();
    expect(now?.title).toBe("구글에서 제목 수정");
    expect(now?.due_at).toBe("2026-09-07T15:00:00+00:00"); // 9/8 00:00 KST
    const view = await svc.getBoardView(card.board_id);
    const col = view.columns.find((c) => c.id === now?.column_id);
    expect(col?.name).toBe("Todo");
  });

  it("Google 의 Rachel 목록에 만든 항목이 카드가 된다(origin google + gtaskId)", async () => {
    await gtaskCreatedHandler.handle(
      ev("gtask.created", {
        gtaskId: "gt-1",
        title: "구글에서 만든 할 일",
        notes: "메모",
        dueAt: null,
        completed: false,
      }),
      ctx,
    );
    const created = emitted
      .filter((e) => e.type === "task.created")
      .find(
        (e) =>
          (e.payload.card as { title: string }).title === "구글에서 만든 할 일",
      );
    expect(created?.payload.origin).toBe("google");
    expect(created?.payload.gtaskId).toBe("gt-1");
  });
});
