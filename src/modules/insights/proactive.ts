import { createHash } from "node:crypto";
import { z } from "zod";
import type { DomainEvent, ToolContext } from "@/core/contracts";
import type { Database, Json } from "@/core/db/types.generated";
import {
  getAssistantPreferences,
  getUserTimezone,
} from "@/core/settings/assistant";
import { getProfileSettings } from "@/core/settings/profile";
import { dayBounds, localYmd, tzOffsetMs } from "@/core/utils/date";
import { eventService } from "@/modules/calendar/events";
import { meetingActionKey } from "@/modules/meetings/review-items";
import { meetingSummarySchema } from "@/modules/meetings/schema";
import {
  type SuggestionKind,
  type SuggestionResponse,
  suggestionKindSchema,
  suggestionResponseSchema,
} from "./proactive-schema";

export type SuggestionRow =
  Database["public"]["Tables"]["assistant_suggestions"]["Row"];
export interface SuggestionCandidate {
  kind: SuggestionKind;
  key: string;
  title: string;
  body: string;
  href: string;
  priority: number;
  evidence: Record<string, unknown>;
  proposal?: { key: string; value: number };
}
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function allPages<T>(
  fetchPage: (
    offset: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await fetchPage(offset);
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 500) return rows;
  }
}
function wallClock(now: Date, hour: number, timezone: string) {
  const raw = new Date(
    `${localYmd(now, timezone)}T${String(hour).padStart(2, "0")}:00:00Z`,
  );
  return raw.getTime() - tzOffsetMs(timezone, raw);
}
export function availableMinutes(
  from: number,
  to: number,
  busy: Array<{ start: number; end: number }>,
) {
  if (to <= from) return 0;
  const sorted = busy
    .map((b) => ({ start: Math.max(from, b.start), end: Math.min(to, b.end) }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);
  let used = 0;
  let cursor = from;
  for (const b of sorted) {
    used += Math.max(0, b.end - Math.max(cursor, b.start));
    cursor = Math.max(cursor, b.end);
  }
  return Math.max(0, (to - from - used) / 60_000);
}

export function proactiveService(initialCtx: ToolContext) {
  async function context() {
    return {
      ...initialCtx,
      timezone: await getUserTimezone(initialCtx.db, initialCtx.userId),
    };
  }
  async function controls() {
    const { data, error } = await initialCtx.db
      .from("notification_controls")
      .select("*")
      .eq("user_id", initialCtx.userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function collect(): Promise<{
    candidates: SuggestionCandidate[];
    notices: string[];
  }> {
    const ctx = await context();
    const { db, userId } = ctx;
    const prefs = await getAssistantPreferences(db, userId);
    const settings = await getProfileSettings(db, userId);
    const today = dayBounds(ctx.now, ctx.timezone);
    const range = {
      from: ctx.now.toISOString(),
      to: dayBounds(ctx.now, ctx.timezone, 7).end,
    };
    const candidates: SuggestionCandidate[] = [];
    const notices: string[] = [];
    const [cards, meetings, followups, memories] = await Promise.all([
      allPages((offset) =>
        db
          .from("cards")
          .select(
            "id,title,board_id,due_at,due_has_time,calendar_event_id,updated_at",
          )
          .eq("user_id", userId)
          .is("completed_at", null)
          .is("archived_at", null)
          .order("id")
          .range(offset, offset + 499),
      ),
      allPages((offset) =>
        db
          .from("meetings")
          .select("id,title,summary,started_at,updated_at")
          .eq("user_id", userId)
          .gte(
            "started_at",
            new Date(ctx.now.getTime() - 30 * 86400000).toISOString(),
          )
          .order("id")
          .range(offset, offset + 499),
      ),
      allPages((offset) =>
        db
          .from("meeting_followups")
          .select("meeting_id,action_key,kind,result_id,choice")
          .eq("user_id", userId)
          .order("id")
          .range(offset, offset + 499),
      ),
      allPages((offset) =>
        db
          .from("memories")
          .select("id,content,invalidated_at")
          .eq("user_id", userId)
          .not("invalidated_at", "is", null)
          .order("id")
          .range(offset, offset + 499),
      ),
    ]);
    for (const memory of memories)
      candidates.push({
        kind: "changed_evidence",
        key: `evidence:${memory.id}:${memory.invalidated_at}`,
        priority: 70,
        title: "기억의 근거가 바뀌었어요",
        body: memory.content.slice(0, 160),
        href: `/memory?id=${memory.id}#memory-${memory.id}`,
        evidence: { memoryId: memory.id, invalidatedAt: memory.invalidated_at },
      });
    const myName = String(settings.honorific ?? "")
      .replace(/님$/u, "")
      .trim();
    for (const meeting of meetings) {
      const parsed = meetingSummarySchema.safeParse(meeting.summary);
      if (!parsed.success) continue;
      const own = parsed.data.actionItems
        .filter(
          (a) =>
            !a.ownerInferred &&
            (/^(나|저|본인|me)$/i.test(a.owner?.trim() ?? "") ||
              Boolean(myName && a.owner?.trim() === myName)),
        )
        .filter(
          (a) =>
            !followups.some(
              (f) =>
                f.meeting_id === meeting.id &&
                f.action_key === meetingActionKey(meeting.id, a) &&
                f.result_id,
            ),
        );
      if (own.length)
        candidates.push({
          kind: "meeting_followup",
          key: `meeting:${meeting.id}:${hash(own.map((a) => meetingActionKey(meeting.id, a)).sort())}`,
          priority: 50,
          title: "내 회의 후속 항목을 확인해 주세요",
          body: `${meeting.title} · 미확정 ${own.length}개`,
          href: `/meetings/${meeting.id}`,
          evidence: {
            meetingId: meeting.id,
            actionKeys: own.map((a) => meetingActionKey(meeting.id, a)),
          },
        });
    }
    for (const f of followups.filter(
      (f) => f.kind === "waiting" && f.result_id,
    )) {
      const card = cards.find((c) => c.id === f.result_id);
      if (
        !card?.due_at ||
        (card.due_has_time
          ? Date.parse(card.due_at) > ctx.now.getTime()
          : localYmd(new Date(card.due_at), ctx.timezone) >
            localYmd(ctx.now, ctx.timezone))
      )
        continue;
      candidates.push({
        kind: "waiting_followup",
        key: `waiting:${card.id}:${card.due_at}`,
        priority: 60,
        title: "받기로 한 답을 확인할 때예요",
        body: card.title.slice(0, 180),
        href: `/tasks/${card.board_id}?card=${card.id}`,
        evidence: {
          cardId: card.id,
          dueAt: card.due_at,
          meetingId: f.meeting_id,
        },
      });
    }
    const calendar = eventService(ctx);
    const connection = await calendar.connectionStatus(range);
    if (!connection.complete)
      notices.push(
        "캘린더 동기화·조회 범위가 완전하지 않아 시간 충돌·가용 시간 제안을 보류했어요.",
      );
    else {
      const selected = connection.calendars
        .filter((c) => c.selected)
        .map((c) => c.id);
      const events = await allPages((offset) =>
        db
          .from("calendar_events")
          .select("id,title,start_at,end_at,is_busy,all_day,updated_at")
          .eq("user_id", userId)
          .in("calendar_id", selected)
          .is("deleted_at", null)
          .neq("status", "cancelled")
          .gt("end_at", range.from)
          .lt("start_at", range.to)
          .order("id")
          .range(offset, offset + 499),
      );
      const activeBlocks = new Set(
        cards.map((c) => c.calendar_event_id).filter(Boolean),
      );
      for (const card of cards) {
        const block = events.find((e) => e.id === card.calendar_event_id);
        if (!block) continue;
        const overlaps = events.filter(
          (e) =>
            e.id !== block.id &&
            e.is_busy &&
            Date.parse(e.start_at) < Date.parse(block.end_at) &&
            Date.parse(e.end_at) > Date.parse(block.start_at),
        );
        if (overlaps.length)
          candidates.push({
            kind: "time_conflict",
            key: `conflict:${card.id}:${hash([block.start_at, block.end_at, ...overlaps.map((e) => [e.id, e.start_at, e.end_at]).sort()])}`,
            priority: 100,
            title: "약속과 할 일 시간이 겹쳐요",
            body: `${card.title} · ${overlaps
              .map((e) => e.title)
              .join(", ")
              .slice(0, 140)}`,
            href: `/tasks/${card.board_id}?card=${card.id}`,
            evidence: {
              cardId: card.id,
              blockId: block.id,
              conflictingEventIds: overlaps.map((e) => e.id),
              blockVersion: block.updated_at,
            },
          });
      }
      const due = cards.filter(
        (c) => c.due_at && c.due_at >= today.start && c.due_at < today.end,
      );
      const allocations = due.map((c) => ({
        card: c,
        block: events.find((e) => e.id === c.calendar_event_id),
      }));
      if (due.length && allocations.every((a) => a.block && !a.block.all_day)) {
        const earliestTimedDeadline = Math.min(
          ...due
            .filter((c) => c.due_has_time)
            .map((c) => Date.parse(c.due_at ?? today.end)),
          Infinity,
        );
        const dueAllocations = Number.isFinite(earliestTimedDeadline)
          ? allocations.filter(
              (a) =>
                a.card.due_has_time &&
                Date.parse(a.card.due_at ?? today.end) <= earliestTimedDeadline,
            )
          : allocations;
        const required = dueAllocations.reduce(
          (sum, a) =>
            sum +
            (Date.parse(a.block?.end_at ?? "") -
              Date.parse(a.block?.start_at ?? "")) /
              60_000,
          0,
        );
        const from = Math.max(
          ctx.now.getTime(),
          wallClock(
            ctx.now,
            prefs.scheduling?.workStartHour ?? 9,
            ctx.timezone,
          ),
        );
        const to = wallClock(
          ctx.now,
          prefs.scheduling?.workEndHour ?? 19,
          ctx.timezone,
        );
        const busy = events
          .filter((e) => e.is_busy && !activeBlocks.has(e.id))
          .map((e) => ({
            start: Date.parse(e.start_at),
            end: Date.parse(e.end_at),
          }));
        const deadline = Math.min(
          to,
          ...due
            .filter((c) => c.due_has_time)
            .map((c) => Date.parse(c.due_at ?? today.end)),
        );
        const available = availableMinutes(from, deadline, busy);
        const hoursLabel =
          prefs.scheduling?.workStartHour !== undefined &&
          prefs.scheduling?.workEndHour !== undefined
            ? "설정한 근무시간"
            : "기본 근무시간(9–19시)";
        if (required > available)
          candidates.push({
            kind: "capacity_risk",
            key: `capacity:${localYmd(ctx.now, ctx.timezone)}:${hash([allocations.map((a) => [a.card.id, a.card.due_at, a.block?.start_at, a.block?.end_at]), busy])}`,
            priority: 80,
            title: "오늘 계획한 작업 시간이 남은 시간보다 많아요",
            body: `오늘 마감 작업에 잡은 시간 ${Math.round(required)}분 · ${hoursLabel}에서 마감 전 빈 시간 ${Math.floor(available)}분. 마감은 그대로 두고 계획을 확인해 주세요.`,
            href: "/today",
            evidence: {
              requiredMinutes: required,
              availableMinutes: available,
              cardIds: due.map((c) => c.id),
              basis: "user_scheduled_blocks",
            },
          });
      } else if (due.length)
        notices.push(
          "소요시간이 확인되지 않은 할 일은 작업량 초과로 단정하지 않았어요.",
        );
    }
    return { candidates, notices };
  }

  async function refresh() {
    const { candidates, notices } = await collect();
    const { db, userId } = initialCtx;
    const existing = await allPages((offset) =>
      db
        .from("assistant_suggestions")
        .select("*")
        .eq("user_id", userId)
        .order("id")
        .range(offset, offset + 499),
    );
    const activeKeys = new Set(candidates.map((c) => c.key));
    for (const c of candidates) {
      const before = existing.find((r) => r.dedupe_key === c.key);
      const fields = {
        title: c.title,
        body: c.body,
        href: c.href,
        evidence: c.evidence as Json,
        priority: c.priority,
      };
      if (!before) {
        const { error } = await db.from("assistant_suggestions").upsert(
          {
            user_id: userId,
            dedupe_key: c.key,
            kind: c.kind,
            ...fields,
            proposal: (c.proposal as Json) ?? null,
          },
          { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
        );
        if (error) throw error;
      } else if (
        before.status === "obsolete" ||
        before.title !== c.title ||
        before.body !== c.body
      ) {
        const { error } = await db
          .from("assistant_suggestions")
          .update({
            ...fields,
            ...(before.status === "obsolete" ? { status: "pending" } : {}),
          })
          .eq("user_id", userId)
          .eq("id", before.id)
          .eq("updated_at", before.updated_at);
        if (error) throw error;
      }
    }
    for (const before of existing) {
      if (
        before.kind !== "preference" &&
        ["pending", "snoozed"].includes(before.status) &&
        !activeKeys.has(before.dedupe_key)
      ) {
        const { error } = await db
          .from("assistant_suggestions")
          .update({ status: "obsolete" })
          .eq("user_id", userId)
          .eq("id", before.id)
          .eq("updated_at", before.updated_at);
        if (error) throw error;
      }
    }
    return { notices, candidates: candidates.length };
  }

  async function list(explicit = false) {
    const prefs = await getAssistantPreferences(
      initialCtx.db,
      initialCtx.userId,
    );
    const control = await controls();
    if (!explicit && prefs.initiative === "on_request")
      return { items: [], initiative: prefs.initiative };
    const rows = await allPages((offset) =>
      initialCtx.db
        .from("assistant_suggestions")
        .select("*")
        .eq("user_id", initialCtx.userId)
        .in("status", ["pending", "snoozed"])
        .order("priority", { ascending: false })
        .order("created_at")
        .order("id")
        .range(offset, offset + 499),
    );
    return {
      items: rows.filter(
        (r) =>
          !control?.disabled_suggestion_kinds.includes(r.kind) &&
          (!r.snoozed_until ||
            Date.parse(r.snoozed_until) <= initialCtx.now.getTime()) &&
          (explicit ||
            prefs.initiative === "active" ||
            r.kind !== "preference"),
      ),
      initiative: prefs.initiative,
    };
  }

  async function respond(raw: SuggestionResponse) {
    const input = suggestionResponseSchema.parse(raw);
    const { db, userId } = initialCtx;
    const { data: row, error } = await db
      .from("assistant_suggestions")
      .select("*")
      .eq("user_id", userId)
      .eq("id", input.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("제안을 찾을 수 없어요");
    if (row.updated_at !== input.expectedVersion)
      throw new Error("제안이 바뀌었어요. 다시 확인해 주세요");
    if (
      input.action === "accept_preference" ||
      input.action === "reject_preference"
    ) {
      if (input.action === "accept_preference" && initialCtx.actor !== "user") {
        const quote = input.userQuote?.trim();
        if (
          initialCtx.actor !== "agent" ||
          !quote ||
          !initialCtx.latestUserMessage?.text.includes(quote) ||
          !/(수락|동의|적용|그렇게\s*(해|하)|그걸로|기본값으로|^(?:응|네|좋아|좋아요|yes|ok|okay)[.! ]*$)/iu.test(
            quote,
          ) ||
          /(하지\s*마|싫|거절|취소|안\s*해|아니|미루|나중)/u.test(quote)
        )
          throw new Error(
            "현재 사용자 메시지에서 이 선호를 수락한 내용을 확인해 주세요",
          );
        const proposal = row.proposal as { value?: number } | null;
        const pending = await db
          .from("assistant_suggestions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("kind", "preference")
          .in("status", ["pending", "snoozed"]);
        if (pending.error) throw pending.error;
        if (pending.count !== 1 && !quote.includes(String(proposal?.value)))
          throw new Error("어느 선호를 수락하는지 값과 함께 확인해 주세요");
      }
      const result = await db.rpc("resolve_preference_suggestion", {
        p_id: row.id,
        p_user_id: userId,
        p_accept: input.action === "accept_preference",
        p_version: input.expectedVersion,
      });
      if (result.error) throw result.error;
      return {
        id: row.id,
        ...(result.data as { changed: boolean; status: string }),
      };
    }
    if (input.action === "disable_kind") {
      await setKindEnabled(suggestionKindSchema.parse(row.kind), false);
      return { id: row.id, changed: true, status: "kind_disabled" };
    }
    if (
      input.action === "snooze" &&
      (!input.until ||
        Date.parse(input.until) <= initialCtx.now.getTime() ||
        Date.parse(input.until) > initialCtx.now.getTime() + 30 * 86400000)
    )
      throw new Error("30일 안의 미래 시각으로 미뤄 주세요");
    const result = await db
      .from("assistant_suggestions")
      .update({
        status: input.action === "dismiss" ? "dismissed" : "snoozed",
        snoozed_until: input.action === "snooze" ? input.until : null,
      })
      .eq("user_id", userId)
      .eq("id", row.id)
      .eq("updated_at", input.expectedVersion)
      .in("status", ["pending", "snoozed"])
      .select("id");
    if (result.error) throw result.error;
    return {
      id: row.id,
      changed: result.data.length === 1,
      status: result.data.length ? input.action : row.status,
    };
  }

  async function setKindEnabled(kind: SuggestionKind, enabled: boolean) {
    suggestionKindSchema.parse(kind);
    const { error } = await initialCtx.db.rpc(
      "set_notification_suggestion_kind",
      { p_user_id: initialCtx.userId, p_kind: kind, p_enabled: enabled },
    );
    if (error) throw error;
  }

  async function recordCorrection(e: DomainEvent) {
    if (
      e.userId !== initialCtx.userId ||
      e.actor !== "user" ||
      e.type !== "calendar_event.updated"
    )
      return;
    const shape = z.object({
      before: z.object({
        startAt: z.string().datetime({ offset: true }),
        endAt: z.string().datetime({ offset: true }),
        allDay: z.boolean(),
      }),
      after: z.object({
        startAt: z.string().datetime({ offset: true }),
        endAt: z.string().datetime({ offset: true }),
        allDay: z.boolean(),
      }),
      source: z.object({ eligibleForPreferenceLearning: z.literal(true) }),
    });
    const parsed = shape.safeParse(e.payload);
    if (
      !parsed.success ||
      parsed.data.before.allDay ||
      parsed.data.after.allDay
    )
      return;
    const ctx = await context();
    const { before, after } = parsed.data;
    const hour = (iso: string) =>
      Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: ctx.timezone,
          hour: "2-digit",
          hourCycle: "h23",
        }).format(new Date(iso)),
      );
    const changes: Array<{
      key: "preferredStartHour" | "defaultDurationMinutes";
      value: number;
    }> = [];
    if (hour(before.startAt) !== hour(after.startAt))
      changes.push({ key: "preferredStartHour", value: hour(after.startAt) });
    const duration = (x: typeof before) =>
      (Date.parse(x.endAt) - Date.parse(x.startAt)) / 60000;
    if (
      duration(before) !== duration(after) &&
      Number.isInteger(duration(after)) &&
      duration(after) >= 5 &&
      duration(after) <= 480
    )
      changes.push({ key: "defaultDurationMinutes", value: duration(after) });
    const prefs = await getAssistantPreferences(ctx.db, ctx.userId);
    for (const change of changes) {
      const { error } = await ctx.db
        .from("assistant_preference_corrections")
        .upsert(
          {
            user_id: ctx.userId,
            correction_key: e.id,
            preference_key: change.key,
            value: change.value,
            evidence: {
              eventId: e.id,
              entityId: e.entity.id,
              before,
              after,
            } as Json,
          },
          {
            onConflict: "user_id,correction_key,preference_key",
            ignoreDuplicates: true,
          },
        );
      if (error) throw error;
      const rows = await allPages((offset) =>
        ctx.db
          .from("assistant_preference_corrections")
          .select("evidence")
          .eq("user_id", ctx.userId)
          .eq("preference_key", change.key)
          .eq("value", change.value)
          .gte(
            "created_at",
            new Date(ctx.now.getTime() - 30 * 86400000).toISOString(),
          )
          .order("id")
          .range(offset, offset + 499),
      );
      const distinct = new Set(
        rows.map((r) => (r.evidence as { entityId?: string }).entityId),
      );
      if (distinct.size < 3 || prefs.scheduling?.[change.key] === change.value)
        continue;
      const candidate = {
        user_id: ctx.userId,
        dedupe_key: `preference:${change.key}:${change.value}`,
        kind: "preference",
        priority: 10,
        title: "반복해서 고친 시간 설정을 기본값으로 둘까요?",
        body:
          change.key === "preferredStartHour"
            ? `서로 다른 일정 3개 이상을 ${change.value}시대로 옮겼어요. 앞으로 ${change.value}시 이후 시간을 우선 제안할까요?`
            : `서로 다른 일정 3개 이상을 ${change.value}분으로 고쳤어요. 길이 미정 일정의 기본값으로 사용할까요?`,
        href: "/settings",
        proposal: {
          ...change,
          previousValue: prefs.scheduling?.[change.key] ?? null,
        },
        evidence: {
          correctionCount: distinct.size,
          events: rows.map((r) => r.evidence),
        },
      };
      const result = await ctx.db
        .from("assistant_suggestions")
        .upsert(
          candidate as unknown as Database["public"]["Tables"]["assistant_suggestions"]["Insert"],
          { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
        );
      if (result.error) throw result.error;
    }
  }

  return {
    collect,
    refresh,
    list,
    respond,
    setKindEnabled,
    recordCorrection,
    controls,
  };
}
