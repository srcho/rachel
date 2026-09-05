import { z } from "zod";
import { localYmd, tzOffsetMs } from "@/core/utils/date";
export const repeatRuleSchema = z
  .object({
    kind: z.enum(["weekly", "after_completion"]),
    interval: z
      .number()
      .int()
      .min(1)
      .max(365)
      .describe("반복 간격(일). weekly는 반드시 7이며 격주는 미지원"),
    weekday: z.number().int().min(0).max(6),
  })
  .refine((rule) => rule.kind !== "weekly" || rule.interval === 7, {
    message: "격주 반복은 아직 지원하지 않아요. 매주 반복만 설정할 수 있어요.",
    path: ["interval"],
  });
export type RepeatRule = z.infer<typeof repeatRuleSchema>;
/** Completion creates the next future occurrence; missed weekly dates do not pile up. */
export function nextRepeatDue(
  rule: RepeatRule,
  completedAt: string,
  previousDue: string | null,
  hasTime: boolean,
  timezone: string,
) {
  repeatRuleSchema.parse(rule);
  const completedDay = localYmd(new Date(completedAt), timezone);
  const day = new Date(`${completedDay}T12:00:00Z`);
  if (rule.kind === "after_completion")
    day.setUTCDate(day.getUTCDate() + rule.interval);
  else
    day.setUTCDate(
      day.getUTCDate() + ((rule.weekday - day.getUTCDay() + 7) % 7 || 7),
    );
  const date = day.toISOString().slice(0, 10);
  const time =
    hasTime && previousDue
      ? new Intl.DateTimeFormat("en-GB", {
          timeZone: timezone,
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(new Date(previousDue))
      : "23:59";
  const guess = new Date(`${date}T${time}:00Z`);
  let ms = guess.getTime() - tzOffsetMs(timezone, guess);
  ms = guess.getTime() - tzOffsetMs(timezone, new Date(ms));
  return new Date(ms).toISOString();
}
