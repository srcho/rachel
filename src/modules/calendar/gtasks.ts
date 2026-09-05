import type { ServiceContext } from "@/core/contracts";
import {
  getProfileSettings,
  updateProfileSettings,
} from "@/core/settings/profile";
import { dateTimeInZone, localYmd } from "@/core/utils/date";
import { GoogleApiError, GTASKS_SCOPE, type GTask, gtasks } from "./google";
import { calendarRepository } from "./repository";
import { getAccessToken } from "./tokens";

/**
 * 카드 → Google Tasks 단방향 미러 + 되돌려 받기.
 * - 마감이 있는(보관 안 된) 카드만 "Rachel" 목록에 비춘다. Google 캘린더가 Tasks 를 기본으로 함께 보여준다.
 * - Google 쪽에서 완료·제목·마감을 바꾸면 이벤트(gtask.changed)로 tasks 모듈에 돌려준다.
 * - Google 쪽에서 Rachel 목록에 새로 만든 항목은 gtask.created 로 카드가 된다.
 * tasks 모듈을 import 하지 않는다 — 카드 데이터는 이벤트 페이로드(스냅샷)로만 받는다.
 */
export const LIST_TITLE = "Rachel";
export const GTASK_EVENTS = {
  changed: "gtask.changed",
  created: "gtask.created",
  enabled: "gtasks.enabled",
} as const;

/** tasks 모듈이 task.* 이벤트 페이로드에 싣는 카드 스냅샷 */
export interface CardSnapshot {
  id: string;
  title: string;
  description: string;
  dueAt: string | null;
  dueHasTime: boolean;
  completed: boolean;
  archived: boolean;
  boardId: string;
  updatedAt: string;
}

export interface GtasksStatus {
  connected: boolean;
  hasScope: boolean;
  enabled: boolean;
  listId: string | null;
  linked: number;
  pulledAt: string | null;
}

export function gtasksService(ctx: ServiceContext) {
  const repo = calendarRepository(ctx.db, ctx.userId);

  async function status(): Promise<GtasksStatus> {
    const [integration, settings, linked] = await Promise.all([
      repo.getIntegration(),
      getProfileSettings(ctx.db, ctx.userId),
      repo.countTaskLinks(),
    ]);
    return {
      connected: Boolean(integration && integration.status === "connected"),
      hasScope: Boolean(integration?.scopes?.includes(GTASKS_SCOPE)),
      enabled: settings.gtasks?.enabled ?? false,
      listId: settings.gtasks?.listId ?? null,
      linked,
      pulledAt: settings.gtasks?.pulledAt ?? null,
    };
  }

  async function setEnabled(enabled: boolean): Promise<GtasksStatus> {
    const st = await status();
    if (enabled && !st.connected)
      throw new Error("Google 캘린더를 먼저 연결해 주세요.");
    if (enabled && !st.hasScope)
      throw new Error(
        "Google Tasks 권한이 없어요. 설정에서 Google 을 다시 연결하면 권한을 받아요.",
      );
    const settings = await getProfileSettings(ctx.db, ctx.userId);
    await updateProfileSettings(ctx.db, ctx.userId, {
      gtasks: { ...(settings.gtasks ?? { enabled }), enabled },
    });
    if (enabled) {
      await ensureList();
      // tasks 모듈이 마감 있는 카드를 다시 내보내도록(백필)
      await ctx.emit({
        type: GTASK_EVENTS.enabled,
        entity: { type: "integration", id: ctx.userId },
        payload: {},
      });
    }
    return status();
  }

  async function token(): Promise<{ token: string; integrationId: string }> {
    const integration = await repo.getIntegration();
    if (!integration) throw new Error("Google 이 연결되지 않았어요.");
    return {
      token: await getAccessToken(ctx, integration.id),
      integrationId: integration.id,
    };
  }

  /** "Rachel" 목록을 찾거나 만들고 id 를 설정에 저장 */
  async function ensureList(): Promise<string> {
    const settings = await getProfileSettings(ctx.db, ctx.userId);
    if (settings.gtasks?.listId) return settings.gtasks.listId;
    const { token: t } = await token();
    const { items = [] } = await gtasks.listLists(t);
    const found =
      items.find((l) => l.title === LIST_TITLE) ??
      (await gtasks.createList(t, LIST_TITLE));
    await updateProfileSettings(ctx.db, ctx.userId, {
      gtasks: { ...(settings.gtasks ?? { enabled: false }), listId: found.id },
    });
    return found.id;
  }

  /** 카드 마감(ISO) → Google Tasks due(RFC3339, 자정 UTC, 날짜만 의미) */
  function toDue(dueAt: string): string {
    return `${localYmd(new Date(dueAt), ctx.timezone)}T00:00:00.000Z`;
  }
  function toBody(card: CardSnapshot): Partial<GTask> {
    return {
      title: card.title,
      notes: card.description || undefined,
      due: card.dueAt ? toDue(card.dueAt) : undefined,
      status: card.completed ? "completed" : "needsAction",
      ...(card.completed ? {} : { completed: null }),
    };
  }

  /** 카드 하나를 Google 에 반영(생성·수정·삭제 판단 포함). 미러 꺼짐이면 아무것도 안 함 */
  async function push(
    card: CardSnapshot,
  ): Promise<"skipped" | "created" | "updated" | "removed" | "none"> {
    const st = await status();
    if (!st.enabled || !st.hasScope || !st.connected) return "skipped";
    const current = await repo.getTaskCard(card.id);
    // Old retries never recreate deleted cards or overwrite a newer local revision.
    if (!current && !card.archived) return "skipped";
    if (current && current.updated_at !== card.updatedAt) return "skipped";
    const link = await repo.getTaskLink(card.id);
    // 마감이 있는 카드는 새로 비추고, 이미 연결된 카드(Google 에서 온 것 포함)는 마감이 없어져도 유지한다.
    // Google 항목이 사라지는 건 보관·삭제뿐.
    const shouldExist =
      !card.archived && (Boolean(card.dueAt) || Boolean(link));
    const { token: t } = await token();
    if (!shouldExist) {
      if (!link) return "none";
      await gtasks.delete(t, link.tasklist_id, link.gtask_id).catch((e) => {
        if (!(e instanceof GoogleApiError && e.status === 404)) throw e;
      });
      await repo.deleteTaskLink(card.id);
      return "removed";
    }
    const listId = await ensureList();
    const body = toBody(card);
    if (!card.dueAt) body.due = undefined; // 마감이 지워진 경우 Google 쪽 날짜도 비운다(PATCH 는 undefined 를 보내지 않으므로 null 로)
    const now = ctx.now.toISOString();
    if (link) {
      try {
        const patched = await gtasks.patch(t, link.tasklist_id, link.gtask_id, {
          ...body,
          ...(card.dueAt ? {} : { due: null }),
        });
        await repo.upsertTaskLink({
          card_id: card.id,
          tasklist_id: link.tasklist_id,
          gtask_id: link.gtask_id,
          // 메아리 판정은 Google 의 updated 기준(잡 시작 시각이 아니라)
          last_pushed_at: patched.updated ?? now,
        });
        return "updated";
      } catch (e) {
        if (!(e instanceof GoogleApiError && e.status === 404)) throw e;
        // Google 에서 지워짐 → 새로 만든다
      }
    }
    const created = await gtasks.insert(t, listId, body);
    await repo.upsertTaskLink({
      card_id: card.id,
      tasklist_id: listId,
      gtask_id: created.id,
      last_pushed_at: created.updated ?? now,
    });
    return "created";
  }

  /** Google 에서 만든 항목을 카드와 연결만(카드는 tasks 모듈이 이미 만들었다) */
  async function link(cardId: string, gtaskId: string): Promise<void> {
    const listId = await ensureList();
    await repo.upsertTaskLink({
      card_id: cardId,
      tasklist_id: listId,
      gtask_id: gtaskId,
      last_pulled_at: ctx.now.toISOString(),
    });
  }

  /** Google 쪽 변경을 가져와 이벤트로 돌려준다(15분 크론 + 수동). */
  async function pull(): Promise<{
    changed: number;
    created: number;
    unlinked: number;
  }> {
    const st = await status();
    const out = { changed: 0, created: 0, unlinked: 0 };
    if (!st.enabled || !st.hasScope || !st.connected) return out;
    const listId = await ensureList();
    const { token: t } = await token();
    const links = await repo.listTaskLinks();
    const byGtask = new Map(links.map((l) => [l.gtask_id, l]));
    const started = ctx.now.toISOString();
    let pageToken: string | undefined;
    do {
      const page = await gtasks.list(t, listId, {
        updatedMin: st.pulledAt ?? undefined,
        showDeleted: "true",
        pageToken,
      });
      for (const task of page.items ?? []) {
        const l = byGtask.get(task.id);
        if (task.deleted) {
          if (l) {
            await repo.deleteTaskLink(l.card_id);
            out.unlinked++;
          }
          continue;
        }
        if (l) {
          // 우리가 방금 밀어넣은 변경의 메아리는 건너뛴다
          if (
            l.last_pushed_at &&
            task.updated &&
            Date.parse(task.updated) <= Date.parse(l.last_pushed_at) + 2000
          )
            continue;
          await ctx.emit({
            type: GTASK_EVENTS.changed,
            requireHandlersSuccess: true,
            entity: { type: "card", id: l.card_id },
            payload: {
              cardId: l.card_id,
              title: task.title ?? "",
              dueYmd: task.due ? task.due.slice(0, 10) : null,
              completed: task.status === "completed",
            },
          });
          await repo.upsertTaskLink({
            card_id: l.card_id,
            tasklist_id: l.tasklist_id,
            gtask_id: l.gtask_id,
            last_pushed_at: l.last_pushed_at,
            last_pulled_at: started,
          });
          out.changed++;
        } else if (task.title?.trim()) {
          await ctx.emit({
            type: GTASK_EVENTS.created,
            requireHandlersSuccess: true,
            entity: { type: "gtask", id: task.id },
            payload: {
              gtaskId: task.id,
              listId,
              title: task.title.trim(),
              notes: task.notes ?? "",
              dueAt: task.due
                ? dateTimeInZone(`${task.due.slice(0, 10)}T00:00`, ctx.timezone)
                : null,
              completed: task.status === "completed",
            },
          });
          out.created++;
        }
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    const settings = await getProfileSettings(ctx.db, ctx.userId);
    await updateProfileSettings(ctx.db, ctx.userId, {
      gtasks: {
        ...(settings.gtasks ?? { enabled: true }),
        listId,
        pulledAt: started,
      },
    });
    return out;
  }

  return { status, setEnabled, ensureList, push, link, pull };
}
