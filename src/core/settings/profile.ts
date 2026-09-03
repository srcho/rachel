import { z } from "zod";
import type { Db } from "@/core/contracts";
import type { Json } from "@/core/db/types.generated";

/** profiles.settings 의 알려진 키. 모듈은 자기 접두어로 키를 추가할 수 있다. */
export const profileSettingsSchema = z.object({
  honorific: z.string().trim().min(1).max(20).optional(),
  monthlyBudgetUsd: z.number().positive().max(10_000).nullable().optional(),
  dictionary: z.array(z.string()).max(200).optional(),
});
export type ProfileSettings = z.infer<typeof profileSettingsSchema>;

export async function getProfileSettings(
  db: Db,
  userId: string,
): Promise<ProfileSettings & Record<string, unknown>> {
  const { data } = await db
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .maybeSingle();
  return ((data?.settings as Record<string, unknown>) ??
    {}) as ProfileSettings & Record<string, unknown>;
}

export async function updateProfileSettings(
  db: Db,
  userId: string,
  patch: Partial<ProfileSettings>,
): Promise<void> {
  const current = await getProfileSettings(db, userId);
  const next = { ...current, ...profileSettingsSchema.partial().parse(patch) };
  const { error } = await db
    .from("profiles")
    .update({ settings: next as unknown as Json })
    .eq("id", userId);
  if (error) throw error;
}
