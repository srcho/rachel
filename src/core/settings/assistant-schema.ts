import { z } from "zod";

export const schedulingPreferencesSchema = z.object({
  defaultDurationMinutes: z.number().int().min(5).max(480).optional(),
  workStartHour: z.number().int().min(0).max(23).optional(),
  workEndHour: z.number().int().min(1).max(24).optional(),
  preferredStartHour: z.number().int().min(0).max(23).optional(),
  preferredEndHour: z.number().int().min(1).max(24).optional(),
  bufferMinutes: z.number().int().min(0).max(120).optional(),
  includeWeekends: z.boolean().optional(),
});

export const assistantEvidenceSchema = z.object({
  source: z.literal("explicit_user"),
  updatedAt: z.string().datetime({ offset: true }),
  messageId: z.string().optional(),
  quote: z.string().max(500).optional(),
  suggestionId: z.string().optional(),
  basis: z
    .enum(["user_settings", "user_message", "accepted_candidate"])
    .optional(),
});

export const assistantPreferencesSchema = z.object({
  initiative: z.enum(["on_request", "important", "active"]).optional(),
  responseLength: z.enum(["brief", "adaptive", "detailed"]).optional(),
  scheduling: schedulingPreferencesSchema.optional(),
  evidence: assistantEvidenceSchema.optional(),
});
export type AssistantPreferences = z.infer<typeof assistantPreferencesSchema>;

export const assistantPreferencesPatchSchema = assistantPreferencesSchema
  .omit({ evidence: true })
  .extend({
    scheduling: schedulingPreferencesSchema
      .extend({
        preferredStartHour:
          schedulingPreferencesSchema.shape.preferredStartHour.nullable(),
        preferredEndHour:
          schedulingPreferencesSchema.shape.preferredEndHour.nullable(),
      })
      .optional(),
  });
export type AssistantPreferencesPatch = z.infer<
  typeof assistantPreferencesPatchSchema
>;

export const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "올바른 시간대를 입력해 주세요. 예: Asia/Seoul, America/New_York");

/** Validate the effective interval after merging an explicit patch with saved values. */
export function validateSchedulingPreferences(
  preferences: AssistantPreferences["scheduling"],
) {
  const p = schedulingPreferencesSchema.parse(preferences ?? {});
  const start = p.workStartHour ?? 9;
  const end = p.workEndHour ?? 19;
  if (end <= start) throw new Error("근무 종료 시각은 시작보다 늦어야 해요");
  const preferredStart = Math.max(start, p.preferredStartHour ?? start);
  const preferredEnd = Math.min(end, p.preferredEndHour ?? end);
  if (preferredEnd <= preferredStart)
    throw new Error("선호 시간은 근무 시간 안에서 시작보다 종료가 늦어야 해요");
  return p;
}
