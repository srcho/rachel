import type { ServiceContext } from "@/core/contracts";
import { meetingSummarySchema } from "./schema";

export async function meetingPreparation(ctx: ServiceContext, eventId: string) {
  const { data: event, error } = await ctx.db
    .from("calendar_events")
    .select("id, title, description, recurring_event_id, calendar_id")
    .eq("user_id", ctx.userId)
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!event) throw new Error("일정을 찾을 수 없어요");
  const { data: linked, error: linkedError } = await ctx.db
    .from("meetings")
    .select("id, title, status")
    .eq("user_id", ctx.userId)
    .eq("calendar_event_id", eventId)
    .order("started_at", { ascending: false });
  if (linkedError) throw linkedError;
  const eventIds = [eventId];
  if (event.recurring_event_id) {
    const siblings = await ctx.db
      .from("calendar_events")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("calendar_id", event.calendar_id)
      .eq("recurring_event_id", event.recurring_event_id);
    if (siblings.error) throw siblings.error;
    eventIds.push(...siblings.data.map((e) => e.id));
  }
  const { data: previous, error: previousError } = await ctx.db
    .from("meetings")
    .select("id, title, summary, started_at, content_version")
    .eq("user_id", ctx.userId)
    .in("calendar_event_id", eventIds)
    .lt("started_at", ctx.now.toISOString())
    .neq("status", "recording")
    .order("started_at", { ascending: false })
    .limit(3);
  if (previousError) throw previousError;
  // A title is only a discovery hint: never treat an unlinked meeting as history.
  const candidates = previous.length
    ? { data: [], error: null }
    : await ctx.db
        .from("meetings")
        .select("id, title, started_at")
        .eq("user_id", ctx.userId)
        .eq("title", event.title)
        .lt("started_at", ctx.now.toISOString())
        .neq("status", "recording")
        .order("started_at", { ascending: false })
        .limit(3);
  if (candidates.error) throw candidates.error;
  const ids = previous.map((m) => m.id);
  const cards = ids.length
    ? await ctx.db
        .from("cards")
        .select("id, board_id, title, meeting_id")
        .eq("user_id", ctx.userId)
        .in("meeting_id", ids)
        .is("completed_at", null)
        .is("archived_at", null)
        .limit(20)
    : { data: [], error: null };
  if (cards.error) throw cards.error;
  return {
    event,
    linked,
    relationship: previous.length
      ? event.recurring_event_id
        ? "event_or_series"
        : "event"
      : "none",
    unverifiedTitleMatches: candidates.data,
    previous: previous.map((m) => {
      const summary = meetingSummarySchema.safeParse(m.summary);
      return {
        ...m,
        summary: undefined,
        decisions: summary.success ? summary.data.decisions.slice(0, 3) : [],
        openQuestions: summary.success
          ? summary.data.openQuestions.slice(0, 3)
          : [],
      };
    }),
    tasks: cards.data ?? [],
  };
}
