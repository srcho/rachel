import { z } from "zod";
import type { Db } from "@/core/contracts";
import type { Json } from "@/core/db/types.generated";
import {
  assistantPreferencesSchema,
  timezoneSchema,
  validateSchedulingPreferences,
} from "./assistant-schema";

/** profiles.settings 의 알려진 키. 모듈은 자기 접두어로 키를 추가할 수 있다. */
export const profileSettingsSchema = z.object({
  honorific: z.string().trim().min(1).max(20).optional(),
  assistant: assistantPreferencesSchema.optional(),
  monthlyBudgetUsd: z.number().positive().max(10_000).nullable().optional(),
  dictionary: z.array(z.string()).max(200).optional(),
  reminders: z
    .object({
      quietStart: z.number().int().min(0).max(23),
      quietEnd: z.number().int().min(0).max(23),
      morningHour: z.number().int().min(0).max(23),
      calendarAlongsideGoogle: z.boolean(),
    })
    .optional(),
  notifications: z.record(z.string(), z.boolean()).optional(),
  /** 마감 있는 카드를 Google Tasks("Rachel" 목록)에 비추기 */
  gtasks: z
    .object({
      enabled: z.boolean(),
      listId: z.string().optional(),
      pulledAt: z.string().optional(),
    })
    .optional(),
});
export type ProfileSettings = z.infer<typeof profileSettingsSchema>;

export async function getProfileSettings(
  db: Db,
  userId: string,
): Promise<ProfileSettings & Record<string, unknown>> {
  const { data, error } = await db
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return ((data?.settings as Record<string, unknown>) ??
    {}) as ProfileSettings & Record<string, unknown>;
}

export async function updateProfileSettings(
  db: Db,
  userId: string,
  patch: Partial<ProfileSettings>,
  options: {
    timezone?: string;
    resetPreferredHours?: Array<"preferredStartHour" | "preferredEndHour">;
  } = {},
): Promise<void> {
  const parsed = profileSettingsSchema.partial().parse(patch);
  const timezone =
    options.timezone === undefined
      ? undefined
      : timezoneSchema.parse(options.timezone);
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: current, error: readError } = await db
      .from("profiles")
      .select("settings,updated_at")
      .eq("id", userId)
      .single();
    if (readError) throw readError;
    const settings = (current.settings ?? {}) as ProfileSettings &
      Record<string, unknown>;
    const next = { ...settings, ...parsed };
    if (parsed.assistant) {
      next.assistant = {
        ...settings.assistant,
        ...parsed.assistant,
        ...(parsed.assistant.scheduling
          ? {
              scheduling: {
                ...settings.assistant?.scheduling,
                ...parsed.assistant.scheduling,
              },
            }
          : {}),
      };
      for (const key of options.resetPreferredHours ?? []) {
        if (next.assistant.scheduling) delete next.assistant.scheduling[key];
      }
      validateSchedulingPreferences(next.assistant.scheduling);
    }
    const { data, error } = await db
      .from("profiles")
      .update({
        settings: next as unknown as Json,
        ...(timezone !== undefined ? { timezone } : {}),
      })
      .eq("id", userId)
      .eq("updated_at", current.updated_at)
      .select("id");
    if (error) throw error;
    if (data?.length) return;
  }
  throw new Error(
    "설정이 다른 곳에서 변경됐어요. 최신 값을 확인하고 다시 저장해 주세요",
  );
}
