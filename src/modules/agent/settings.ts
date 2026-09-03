import type { Db } from "@/core/contracts";
import { getProfileSettings } from "@/core/settings/profile";

export const DEFAULT_HONORIFIC = "빈센트님";

/** profiles.settings.honorific — 없으면 기본 호칭 */
export async function getHonorific(db: Db, userId: string): Promise<string> {
  const settings = await getProfileSettings(db, userId);
  return settings.honorific?.trim() || DEFAULT_HONORIFIC;
}
