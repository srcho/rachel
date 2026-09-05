import { type MeetingSummary, meetingSummarySchema } from "./schema";

export function summaryToMarkdown(s: MeetingSummary): string {
  const li = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");
  const parts = [`**요약** ${s.tldr}`];
  if (s.keyPoints.length) parts.push(`**핵심**\n${li(s.keyPoints)}`);
  if (s.decisions.length) parts.push(`**결정**\n${li(s.decisions)}`);
  if (s.actionItems.length)
    parts.push(
      `**액션 아이템**\n${li(s.actionItems.map((a) => `${a.title}${a.owner ? ` — ${a.owner}` : ""}${a.due ? ` (${a.due})` : ""}`))}`,
    );
  if (s.openQuestions.length)
    parts.push(`**열린 질문**\n${li(s.openQuestions)}`);
  if (s.followups.length)
    parts.push(
      `**후속**\n${li(s.followups.map((f) => `${f.title}${f.when ? ` (${f.when})` : ""}`))}`,
    );
  return parts.join("\n\n");
}

export function canonicalSummaryMarkdown(
  summary: unknown,
  fallback: string | null = null,
): string | null {
  const parsed = meetingSummarySchema.safeParse(summary);
  return parsed.success ? summaryToMarkdown(parsed.data) : fallback;
}
