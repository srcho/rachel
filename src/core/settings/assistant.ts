import { z } from "zod";
import type { Db, ToolContext } from "@/core/contracts";
import {
  assistantPreferencesPatchSchema,
  assistantPreferencesSchema,
  schedulingPreferencesSchema,
  timezoneSchema,
  validateSchedulingPreferences,
} from "./assistant-schema";
import { getProfileSettings, updateProfileSettings } from "./profile";

export {
  assistantPreferencesSchema,
  schedulingPreferencesSchema,
} from "./assistant-schema";

export async function getSchedulingPreferences(db: Db, userId: string) {
  const settings = await getProfileSettings(db, userId);
  return validateSchedulingPreferences(settings.assistant?.scheduling);
}

export async function getAssistantPreferences(db: Db, userId: string) {
  const settings = await getProfileSettings(db, userId);
  return {
    initiative: "important" as const,
    responseLength: "adaptive" as const,
    ...assistantPreferencesSchema.parse(settings.assistant ?? {}),
  };
}

export async function getUserTimezone(db: Db, userId: string) {
  const { data, error } = await db
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return timezoneSchema.parse(data.timezone);
}

export const assistantSettingsUpdateSchema = z
  .object({
    preferences: assistantPreferencesPatchSchema.optional(),
    honorific: z.string().trim().min(1).max(20).optional(),
    timezone: timezoneSchema.optional(),
  })
  .refine(
    (p) =>
      p.honorific !== undefined ||
      p.timezone !== undefined ||
      p.preferences?.initiative !== undefined ||
      p.preferences?.responseLength !== undefined ||
      Object.values(p.preferences?.scheduling ?? {}).some(
        (value) => value !== undefined,
      ),
    "변경할 설정을 입력해 주세요",
  );
export type AssistantSettingsUpdate = z.infer<
  typeof assistantSettingsUpdateSchema
>;

export function assistantPreferencesService(ctx: ToolContext) {
  async function get() {
    const [settings, timezone] = await Promise.all([
      getProfileSettings(ctx.db, ctx.userId),
      getUserTimezone(ctx.db, ctx.userId),
    ]);
    const preferences = assistantPreferencesSchema.parse(
      settings.assistant ?? {},
    );
    return {
      honorific: settings.honorific ?? "빈센트님",
      timezone,
      preferences: {
        initiative: "important" as const,
        responseLength: "adaptive" as const,
        ...preferences,
      },
      defaults: {
        defaultDurationMinutes: 60,
        workStartHour: 9,
        workEndHour: 19,
        bufferMinutes: 0,
        includeWeekends: false,
      },
      evidence: preferences.evidence ?? null,
      href: "/settings",
    };
  }

  async function update(raw: AssistantSettingsUpdate, userQuote?: string) {
    const patch = assistantSettingsUpdateSchema.parse(raw);
    if (
      ctx.actor !== "user" &&
      (ctx.actor !== "agent" ||
        !userQuote?.trim() ||
        !ctx.latestUserMessage?.text.includes(userQuote))
    ) {
      throw new Error(
        "설정은 사용자가 직접 요청하거나 제안을 수락했을 때만 바꿀 수 있어요",
      );
    }
    const { scheduling: rawScheduling, ...preferencePatch } =
      patch.preferences ?? {};
    const scheduling = { ...rawScheduling };
    const resetPreferredHours: Array<
      "preferredStartHour" | "preferredEndHour"
    > = [];
    for (const key of ["preferredStartHour", "preferredEndHour"] as const) {
      if (scheduling[key] === null) {
        resetPreferredHours.push(key);
        delete scheduling[key];
      }
    }
    await updateProfileSettings(
      ctx.db,
      ctx.userId,
      {
        ...(patch.honorific === undefined
          ? {}
          : { honorific: patch.honorific }),
        assistant: {
          ...preferencePatch,
          ...(rawScheduling
            ? { scheduling: schedulingPreferencesSchema.parse(scheduling) }
            : {}),
          evidence: {
            source: "explicit_user",
            updatedAt: ctx.now.toISOString(),
            basis: ctx.actor === "user" ? "user_settings" : "user_message",
            ...(ctx.actor === "agent"
              ? { messageId: ctx.latestUserMessage?.id, quote: userQuote }
              : {}),
          },
        },
      },
      { timezone: patch.timezone, resetPreferredHours },
    );
    if (patch.timezone) ctx.timezone = patch.timezone;
    return {
      ...(await get()),
      changed: true,
      appliesTo:
        "앞으로의 응답과 새 시간 추천에 적용돼요. 기존 일정과 마감은 유지돼요.",
    };
  }
  return { get, update };
}
