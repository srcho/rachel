import { cache } from "react";
import type { DateRange, ServiceContext } from "@/core/contracts";
import { localYmd } from "@/core/utils/date";

/** 범위 안의 월요일 목록(빈 주도 0 으로 채우기 위해) */
export function weeksIn(range: DateRange, timeZone: string): string[] {
  const out: string[] = [];
  const startYmd = localYmd(range.from, timeZone);
  const d = new Date(`${startYmd}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  const end = new Date(`${localYmd(range.to, timeZone)}T00:00:00Z`);
  while (d < end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

function fill<T extends { week: string }>(
  weeks: string[],
  rows: T[],
  zero: Omit<T, "week">,
): T[] {
  return weeks.map(
    (w) => rows.find((r) => r.week === w) ?? ({ week: w, ...zero } as T),
  );
}

async function tasksWeeklyRaw(ctx: ServiceContext, range: DateRange) {
  const weeks = weeksIn(range, ctx.timezone);
  const [a, b] = await Promise.all([
    ctx.db
      .from("v_tasks_weekly")
      .select("week, created, completed")
      .eq("user_id", ctx.userId)
      .gte("week", weeks[0] ?? "1970-01-01")
      .lte("week", weeks.at(-1) ?? "2100-01-01"),
    ctx.db
      .from("v_task_cycle_time")
      .select("week, completed, avg_hours, median_hours")
      .eq("user_id", ctx.userId)
      .gte("week", weeks[0] ?? "1970-01-01")
      .lte("week", weeks.at(-1) ?? "2100-01-01"),
  ]);
  const rows = (a.data ?? []).map((r) => ({
    week: String(r.week),
    created: Number(r.created ?? 0),
    completed: Number(r.completed ?? 0),
  }));
  const cycle = (b.data ?? []).map((r) => ({
    week: String(r.week),
    completed: Number(r.completed ?? 0),
    avgHours: Number(r.avg_hours ?? 0),
    medianHours: Number(r.median_hours ?? 0),
  }));
  return { weekly: fill(weeks, rows, { created: 0, completed: 0 }), cycle };
}

async function meetingsWeeklyRaw(ctx: ServiceContext, range: DateRange) {
  const weeks = weeksIn(range, ctx.timezone);
  const { data } = await ctx.db
    .from("v_meetings_weekly")
    .select("week, meetings, minutes")
    .eq("user_id", ctx.userId)
    .gte("week", weeks[0] ?? "1970-01-01")
    .lte("week", weeks.at(-1) ?? "2100-01-01");
  return fill(
    weeks,
    (data ?? []).map((r) => ({
      week: String(r.week),
      meetings: Number(r.meetings ?? 0),
      minutes: Number(r.minutes ?? 0),
    })),
    { meetings: 0, minutes: 0 },
  );
}

async function calendarWeeklyRaw(ctx: ServiceContext, range: DateRange) {
  const weeks = weeksIn(range, ctx.timezone);
  const { data } = await ctx.db
    .from("v_calendar_load_weekly")
    .select("week, events, hours")
    .eq("user_id", ctx.userId)
    .gte("week", weeks[0] ?? "1970-01-01")
    .lte("week", weeks.at(-1) ?? "2100-01-01");
  return fill(
    weeks,
    (data ?? []).map((r) => ({
      week: String(r.week),
      events: Number(r.events ?? 0),
      hours: Number(r.hours ?? 0),
    })),
    { events: 0, hours: 0 },
  );
}

async function captureWeeklyRaw(ctx: ServiceContext, range: DateRange) {
  const weeks = weeksIn(range, ctx.timezone);
  const { data } = await ctx.db
    .from("v_capture_conversion")
    .select("week, captured, resolved, dismissed")
    .eq("user_id", ctx.userId)
    .gte("week", weeks[0] ?? "1970-01-01")
    .lte("week", weeks.at(-1) ?? "2100-01-01");
  return fill(
    weeks,
    (data ?? []).map((r) => ({
      week: String(r.week),
      captured: Number(r.captured ?? 0),
      resolved: Number(r.resolved ?? 0),
      dismissed: Number(r.dismissed ?? 0),
    })),
    { captured: 0, resolved: 0, dismissed: 0 },
  );
}

/** 완료 스트릭(오늘 포함 연속 일수)과 최근 30일 완료 일수 */
async function streakRaw(ctx: ServiceContext) {
  const { data } = await ctx.db
    .from("v_completion_days")
    .select("day, completed")
    .eq("user_id", ctx.userId)
    .order("day", { ascending: false })
    .limit(60);
  const days = new Set((data ?? []).map((r) => String(r.day)));
  let n = 0;
  const d = new Date(`${localYmd(ctx.now, ctx.timezone)}T00:00:00Z`);
  if (!days.has(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() - 1); // 오늘 아직 없으면 어제부터
  while (days.has(d.toISOString().slice(0, 10))) {
    n++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  const cutoff = new Date(ctx.now.getTime() - 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return {
    current: n,
    activeDays30: [...days].filter((x) => x >= cutoff).length,
  };
}

async function overdueStatsRaw(ctx: ServiceContext) {
  const { data } = await ctx.db
    .from("cards")
    .select("labels, priority, due_at")
    .eq("user_id", ctx.userId)
    .is("completed_at", null)
    .is("archived_at", null)
    .lt("due_at", ctx.now.toISOString());
  const byLabel = new Map<string, number>();
  const byPriority = [0, 0, 0, 0];
  for (const c of data ?? []) {
    byPriority[c.priority] = (byPriority[c.priority] ?? 0) + 1;
    for (const l of c.labels) byLabel.set(l, (byLabel.get(l) ?? 0) + 1);
  }
  return {
    total: data?.length ?? 0,
    byPriority,
    byLabel: [...byLabel.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
}

/** 회의·일정 시간대 히트맵(요일×시) — 최근 range */
async function slotHeatRaw(ctx: ServiceContext, range: DateRange) {
  const { data } = await ctx.db
    .from("v_event_slots")
    .select("dow, hour, hours")
    .eq("user_id", ctx.userId)
    .gte("start_at", range.from.toISOString())
    .lt("start_at", range.to.toISOString());
  const grid: number[][] = Array.from({ length: 7 }, () =>
    new Array(24).fill(0),
  );
  for (const r of data ?? []) {
    const row = grid[Number(r.dow)];
    if (row)
      row[Number(r.hour)] = (row[Number(r.hour)] ?? 0) + Number(r.hours ?? 0);
  }
  return grid;
}

/** 요청 스코프 캐시 — 인사이트 페이지의 위젯 여럿(패턴 포함)이 같은 지표를 다시 계산하지 않게 */
export const tasksWeekly = cache(tasksWeeklyRaw);
export const meetingsWeekly = cache(meetingsWeeklyRaw);
export const calendarWeekly = cache(calendarWeeklyRaw);
export const captureWeekly = cache(captureWeeklyRaw);
export const streak = cache(streakRaw);
export const overdueStats = cache(overdueStatsRaw);
export const slotHeat = cache(slotHeatRaw);
