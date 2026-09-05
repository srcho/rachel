import { z } from "zod";
import type { ServiceContext } from "@/core/contracts";
import type { Json } from "@/core/db/types.generated";
import { meetingsRepository } from "./repository";
import { meetingActionKey, meetingDue } from "./review-items";
import { meetingSummarySchema } from "./schema";

export const reviewChoiceSchema = z.object({
  key: z.string().min(1).max(2000),
  title: z.string().trim().min(1).max(200),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  dueHasTime: z.boolean().optional(),
  owner: z.string().trim().max(60).optional(),
  description: z.string().max(2000).optional(),
  kind: z.enum(["task", "waiting", "event", "reference"]).optional(),
});
export type ReviewChoice = z.infer<typeof reviewChoiceSchema>;

export interface MeetingFollowupResult {
  id: string;
  entityId: string;
  key: string;
  kind: "task" | "waiting" | "event" | "reference";
  createdNow: boolean;
  version?: string;
  href: string;
}

export async function createMeetingTasks(
  ctx: ServiceContext,
  meetingId: string,
  raw: ReviewChoice[],
) {
  const choices = z.array(reviewChoiceSchema).max(15).parse(raw);
  const meeting = await meetingsRepository(ctx.db, ctx.userId).get(meetingId);
  if (!meeting) throw new Error("회의를 찾을 수 없어요");
  const summary = meetingSummarySchema.parse(meeting.summary);
  const create = ctx.registry.tools()["tasks.create"];
  if (!create) throw new Error("할 일 기능을 사용할 수 없어요");
  const result: MeetingFollowupResult[] = [];
  // Validate all selections before creating the first resource.
  for (const choice of choices) {
    const original = summary.actionItems.find(
      (a) => meetingActionKey(meetingId, a) === choice.key,
    );
    if (!original)
      throw new Error("회의 요약이 바뀌었어요. 후속 할 일을 다시 열어 주세요");
    if (choice.kind === "waiting" && choice.title.length > 196)
      throw new Error("확인할 일의 제목은 196자 이하로 입력해 주세요");
    const existing = await ctx.db
      .from("meeting_followups")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("action_key", choice.key)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (
      !existing.data &&
      choice.kind === "event" &&
      !(choice.dueAt === undefined
        ? meetingDue(original.due, meeting.started_at, ctx.timezone)?.dueAt
        : choice.dueAt)
    )
      throw new Error("일정으로 추가할 날짜를 먼저 정해 주세요");
  }
  for (const requested of choices) {
    const original = summary.actionItems.find(
      (a) => meetingActionKey(meetingId, a) === requested.key,
    );
    if (!original)
      throw new Error("회의 요약이 바뀌었어요. 후속 할 일을 다시 열어 주세요");
    const parsed = meetingDue(original.due, meeting.started_at, ctx.timezone);
    const legacy = await ctx.db
      .from("cards")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("creation_key", requested.key)
      .maybeSingle();
    if (legacy.error) throw legacy.error;
    const frozen = await ctx.db.from("meeting_followups").upsert(
      {
        user_id: ctx.userId,
        meeting_id: meetingId,
        action_key: requested.key,
        kind: legacy.data ? "task" : (requested.kind ?? "task"),
        result_id: legacy.data?.id,
        choice: requested as unknown as Json,
      },
      { onConflict: "user_id,action_key", ignoreDuplicates: true },
    );
    if (frozen.error) throw frozen.error;
    const saved = await ctx.db
      .from("meeting_followups")
      .select("*")
      .eq("user_id", ctx.userId)
      .eq("action_key", requested.key)
      .single();
    if (saved.error) throw saved.error;
    const choice = reviewChoiceSchema.parse(saved.data.choice);
    const kind = saved.data.kind as MeetingFollowupResult["kind"];
    const addResult = async (
      id: string,
      createdNow: boolean,
      createdVersion?: string,
    ) => {
      let version = createdVersion;
      let href =
        kind === "event" ? `/calendar?event=${id}` : `/meetings/${meetingId}`;
      if (kind === "task" || kind === "waiting") {
        const card = await ctx.db
          .from("cards")
          .select("updated_at, board_id")
          .eq("user_id", ctx.userId)
          .eq("id", id)
          .maybeSingle();
        if (card.error) throw card.error;
        version ??= card.data?.updated_at;
        if (card.data) href = `/tasks/${card.data.board_id}?card=${id}`;
      } else if (kind === "event" && !version) {
        const event = await ctx.db
          .from("calendar_events")
          .select("updated_at")
          .eq("user_id", ctx.userId)
          .eq("id", id)
          .maybeSingle();
        if (event.error) throw event.error;
        version = event.data?.updated_at;
      }
      result.push({
        id,
        entityId: id,
        key: choice.key,
        kind,
        createdNow,
        version,
        href,
      });
    };
    if (saved.data.result_id) {
      await addResult(saved.data.result_id, false);
      continue;
    }
    const finish = async (
      id: string,
      createdNow?: boolean,
      version?: string,
    ) => {
      const updated = await ctx.db
        .from("meeting_followups")
        .update({ result_id: id })
        .eq("user_id", ctx.userId)
        .eq("id", saved.data.id)
        .is("result_id", null)
        .select("id");
      if (updated.error) throw updated.error;
      await addResult(id, createdNow ?? updated.data.length === 1, version);
    };
    if (saved.data.kind === "reference") {
      await finish(saved.data.id);
      continue;
    }
    if (saved.data.kind === "event") {
      const startAt = choice.dueAt === undefined ? parsed?.dueAt : choice.dueAt;
      if (!startAt) throw new Error("일정으로 추가할 날짜를 먼저 정해 주세요");
      const eventTool = ctx.registry.tools()["calendar.createEvent"];
      if (!eventTool) throw new Error("캘린더 기능을 사용할 수 없어요");
      const prior = await ctx.db
        .from("calendar_events")
        .select("deleted_at")
        .eq("user_id", ctx.userId)
        .eq("creation_key", choice.key)
        .maybeSingle();
      if (prior.error) throw prior.error;
      // A new confirmation after Undo needs a new event; retries of this
      // confirmation keep the same persisted followup generation.
      const creationKey = prior.data?.deleted_at
        ? `${choice.key}:confirmation:${saved.data.id}`
        : choice.key;
      const event = (await eventTool.execute(
        {
          creationKey,
          title: choice.title,
          startAt,
          allDay: !(choice.dueHasTime ?? parsed?.hasTime),
          description: `${choice.description ?? ""}\n원본 회의: /meetings/${meetingId}`,
        },
        ctx,
      )) as { id: string; createdNow: boolean; version?: string };
      await finish(event.id, event.createdNow, event.version);
      continue;
    }
    const card = (await create.execute(
      {
        creationKey: choice.key,
        title:
          saved.data.kind === "waiting"
            ? `확인: ${choice.title}`
            : choice.title,
        description:
          choice.description ??
          ((choice.owner ?? original.owner)
            ? `담당: ${choice.owner ?? original.owner}`
            : ""),
        dueAt:
          choice.dueAt === undefined ? (parsed?.dueAt ?? null) : choice.dueAt,
        dueHasTime: choice.dueHasTime ?? parsed?.hasTime ?? false,
        meetingId,
        source: {
          type: "meeting",
          ref_id: meetingId,
          source_seq: original.sourceSeq,
          source_at_ms: original.sourceAtMs ?? [],
        },
      },
      ctx,
    )) as { id: string; createdNow: boolean; version?: string };
    await finish(card.id, card.createdNow, card.version);
  }
  return result;
}

export async function undoMeetingFollowups(
  ctx: ServiceContext,
  meetingId: string,
  results: MeetingFollowupResult[],
) {
  for (const result of results.filter((r) => r.createdNow)) {
    const saved = await ctx.db
      .from("meeting_followups")
      .select("id, kind, result_id")
      .eq("user_id", ctx.userId)
      .eq("meeting_id", meetingId)
      .eq("action_key", result.key)
      .maybeSingle();
    if (saved.error) throw saved.error;
    if (!saved.data) continue;
    if (
      saved.data.result_id !== result.entityId ||
      saved.data.kind !== result.kind
    )
      throw new Error("후속 항목이 바뀌어 되돌릴 수 없어요");
    if (result.kind !== "reference") {
      const tool =
        ctx.registry.tools()[
          result.kind === "event" ? "calendar.deleteEvent" : "tasks.delete"
        ];
      if (!tool) throw new Error("되돌리기 기능을 사용할 수 없어요");
      await tool.execute(
        { id: result.entityId, expectedVersion: result.version },
        ctx,
      );
    }
    const removed = await ctx.db
      .from("meeting_followups")
      .delete()
      .eq("user_id", ctx.userId)
      .eq("id", saved.data.id)
      .eq("result_id", result.entityId);
    if (removed.error) throw removed.error;
  }
}
