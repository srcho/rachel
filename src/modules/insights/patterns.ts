import type { DateRange, ServiceContext } from "@/core/contracts";
import {
  calendarWeekly,
  captureWeekly,
  meetingsWeekly,
  overdueStats,
  slotHeat,
  streak,
  tasksWeekly,
} from "./metrics";

export interface Pattern {
  id: string;
  text: string;
  severity: "info" | "warn";
}

const DOW = ["월", "화", "수", "목", "금", "토", "일"];

/** 규칙 기반 패턴 탐지(LLM 0회). 주간 리뷰 서사의 재료가 된다. */
export async function detectPatterns(
  ctx: ServiceContext,
  range: DateRange,
): Promise<{ patterns: Pattern[]; facts: Record<string, unknown> }> {
  const [tasks, meetings, cal, cap, st, overdue, heat] = await Promise.all([
    tasksWeekly(ctx, range),
    meetingsWeekly(ctx, range),
    calendarWeekly(ctx, range),
    captureWeekly(ctx, range),
    streak(ctx),
    overdueStats(ctx),
    slotHeat(ctx, range),
  ]);
  const p: Pattern[] = [];
  const last = tasks.weekly.at(-1);
  const prev = tasks.weekly.at(-2);
  if (
    last &&
    prev &&
    prev.completed > 0 &&
    last.completed < prev.completed * 0.6
  )
    p.push({
      id: "throughput-drop",
      text: `이번 주 완료 ${last.completed}건, 지난주 ${prev.completed}건보다 크게 줄었어요.`,
      severity: "warn",
    });
  if (
    last &&
    prev &&
    last.completed > prev.completed * 1.4 &&
    last.completed >= 3
  )
    p.push({
      id: "throughput-up",
      text: `이번 주 완료 ${last.completed}건으로 지난주(${prev.completed}건)보다 늘었어요.`,
      severity: "info",
    });
  if (overdue.total >= 5)
    p.push({
      id: "overdue-many",
      text: `지연 카드가 ${overdue.total}장이에요.${overdue.byLabel[0] ? ` 특히 '${overdue.byLabel[0][0]}' 라벨 ${overdue.byLabel[0][1]}장.` : ""}`,
      severity: "warn",
    });
  const cycle = tasks.cycle.at(-1);
  if (cycle && cycle.medianHours > 24 * 7)
    p.push({
      id: "cycle-long",
      text: `완료까지 중앙값 ${Math.round(cycle.medianHours / 24)}일이 걸렸어요. 카드를 더 잘게 쪼개 보는 건 어때요?`,
      severity: "info",
    });
  // 회의·일정 몰림: 상위 셀이 전체의 20% 이상
  let total = 0;
  let best = { dow: 0, hour: 0, v: 0 };
  for (const [dow, row] of heat.entries()) {
    for (const [hour, v] of row.entries()) {
      total += v;
      if (v > best.v) best = { dow, hour, v };
    }
  }
  if (total >= 5 && best.v / total >= 0.2)
    p.push({
      id: "slot-cluster",
      text: `${DOW[best.dow]}요일 ${best.hour}시대에 일정이 몰려요(전체의 ${Math.round((best.v / total) * 100)}%).`,
      severity: "info",
    });
  const mLast = meetings.at(-1);
  if (mLast && mLast.minutes >= 600)
    p.push({
      id: "meeting-heavy",
      text: `이번 주 회의 ${Math.round(mLast.minutes / 60)}시간. 회의 없는 오전 블록을 잡아 두면 어때요?`,
      severity: "warn",
    });
  const cLast = cap.at(-1);
  if (cLast && cLast.captured >= 5 && cLast.resolved / cLast.captured < 0.4)
    p.push({
      id: "capture-backlog",
      text: `캡처 ${cLast.captured}건 중 ${cLast.resolved}건만 정리됐어요. 인박스를 한 번 비워요.`,
      severity: "info",
    });
  if (st.current >= 3)
    p.push({
      id: "streak",
      text: `${st.current}일 연속으로 카드를 완료했어요.`,
      severity: "info",
    });
  if (st.current === 0 && st.activeDays30 > 0)
    p.push({
      id: "streak-broken",
      text: "오늘은 아직 완료한 카드가 없어요.",
      severity: "info",
    });
  return {
    patterns: p,
    facts: {
      tasks: tasks.weekly,
      cycle: tasks.cycle,
      meetings,
      calendar: cal,
      capture: cap,
      streak: st,
      overdue: {
        total: overdue.total,
        byPriority: overdue.byPriority,
        byLabel: overdue.byLabel,
      },
    },
  };
}
