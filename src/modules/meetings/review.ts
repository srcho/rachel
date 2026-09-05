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
  description: z.string().max(2000).optional(),
  kind: z.enum(["task", "waiting", "event", "reference"]).optional(),
});
export type ReviewChoice = z.infer<typeof reviewChoiceSchema>;

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
  const result: Array<{ id: string; key: string }> = [];
  for (const requested of choices) {
    const original = summary.actionItems.find(
      (a) => meetingActionKey(meetingId, a) === requested.key,
    );
    if (!original)
      throw new Error("회의 요약이 바뀌었어요. 후속 할 일을 다시 열어 주세요");
    const parsed = meetingDue(original.due, meeting.started_at, ctx.timezone);
    if (
      requested.kind === "event" &&
      !(requested.dueAt === undefined ? parsed?.dueAt : requested.dueAt)
    )
      throw new Error("일정으로 추가할 날짜를 먼저 정해 주세요");
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
    if (saved.data.result_id) {
      result.push({ id: saved.data.result_id, key: choice.key });
      continue;
    }
    const finish = async (id: string) => {
      const updated = await ctx.db
        .from("meeting_followups")
        .update({ result_id: id })
        .eq("user_id", ctx.userId)
        .eq("id", saved.data.id);
      if (updated.error) throw updated.error;
      result.push({ id, key: choice.key });
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
      const event = (await eventTool.execute(
        {
          creationKey: choice.key,
          title: choice.title,
          startAt,
          allDay: !(choice.dueHasTime ?? parsed?.hasTime),
          description: `${choice.description ?? ""}\n원본 회의: /meetings/${meetingId}`,
        },
        ctx,
      )) as { id: string };
      await finish(event.id);
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
          (original.owner ? `담당: ${original.owner}` : ""),
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
    )) as { id: string };
    await finish(card.id);
  }
  return result;
}
