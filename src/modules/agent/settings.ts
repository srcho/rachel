import type { Db } from "@/core/contracts";

export const DEFAULT_HONORIFIC = "빈센트님";

/** profiles.settings.honorific — 없으면 기본 호칭 */
export async function getHonorific(db: Db, userId: string): Promise<string> {
  const { data } = await db
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .maybeSingle();
  const settings = (data?.settings ?? {}) as { honorific?: string };
  return settings.honorific?.trim() || DEFAULT_HONORIFIC;
}
