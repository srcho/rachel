import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { registry } from "@/modules";
import { calendarRepository } from "./repository";

const STALE_MS = 5 * 60_000;
const lastCheck = new Map<string, number>();

/** 앱 열 때: 마지막 동기화가 5분 넘었으면 sync 잡을 dedupe 로 넣는다(레이아웃에서 fire-and-forget). */
export async function maybeTriggerSync(userId: string): Promise<void> {
  const now = Date.now();
  if ((lastCheck.get(userId) ?? 0) > now - 60_000) return; // 인스턴스당 1분에 한 번만 확인
  lastCheck.set(userId, now);
  try {
    const db = await createServerSupabase();
    const integration = await calendarRepository(db, userId).getIntegration();
    if (!integration || integration.status !== "connected") return;
    const last = integration.last_synced_at
      ? new Date(integration.last_synced_at).getTime()
      : 0;
    if (now - last < STALE_MS) return;
    const ctx = createContext({ db, userId, actor: "system", registry });
    await ctx.enqueue({
      type: "calendar.sync",
      payload: {},
      dedupeKey: `calendar.sync:${userId}`,
    });
  } catch (e) {
    console.warn("[calendar] trigger failed", e);
  }
}
