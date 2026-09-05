"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { userContext } from "@/core/context";
import {
  assistantPreferencesService,
  assistantSettingsUpdateSchema,
} from "./assistant";

export async function saveAssistantPreferencesAction(
  _previous: { error?: string; saved?: boolean },
  formData: FormData,
): Promise<{ error?: string; saved?: boolean }> {
  try {
    const number = (name: string) => {
      const raw = String(formData.get(name) ?? "").trim();
      return raw ? Number(raw) : Number.NaN;
    };
    const optionalHour = (name: string) => {
      const raw = String(formData.get(name) ?? "").trim();
      return raw ? Number(raw) : null;
    };
    const changes = assistantSettingsUpdateSchema.parse({
      timezone: formData.get("timezone"),
      preferences: {
        initiative: formData.get("initiative"),
        responseLength: formData.get("responseLength"),
        scheduling: {
          defaultDurationMinutes: number("defaultDurationMinutes"),
          workStartHour: number("workStartHour"),
          workEndHour: number("workEndHour"),
          preferredStartHour: optionalHour("preferredStartHour"),
          preferredEndHour: optionalHour("preferredEndHour"),
          bufferMinutes: number("bufferMinutes"),
          includeWeekends: formData.get("includeWeekends") === "on",
        },
      },
    });
    await assistantPreferencesService(await userContext()).update(changes);
    revalidatePath("/settings");
    revalidatePath("/", "layout");
    return { saved: true };
  } catch (error) {
    if (error instanceof z.ZodError)
      return {
        error:
          error.issues[0]?.code === "custom"
            ? error.issues[0].message
            : "설정 값의 입력 범위를 확인해 주세요.",
      };
    return {
      error:
        error instanceof Error
          ? error.message
          : "설정을 저장하지 못했어요. 다시 시도해 주세요.",
    };
  }
}
