import type { ServiceContext } from "@/core/contracts";
import { getProfileSettings } from "@/core/settings/profile";

export const MAX_KEYWORDS = 50;

/**
 * 전사 키워드 힌트: 참석자 이름(캘린더 일정) + 사용자 사전 + 최근 카드 제목의 명사.
 * 다른 모듈은 import 하지 않고 DB 를 직접 읽는다(읽기 전용).
 */
export async function buildKeywords(
  ctx: ServiceContext,
  calendarEventId?: string | null,
): Promise<string[]> {
  const words = new Set<string>(["레이첼"]);
  const settings = await getProfileSettings(ctx.db, ctx.userId);
  for (const w of settings.dictionary ?? []) words.add(w);
  if (calendarEventId) {
    const { data } = await ctx.db
      .from("calendar_events")
      .select("title, attendees")
      .eq("id", calendarEventId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    for (const a of (data?.attendees as Array<{ name?: string }> | null) ?? [])
      if (a.name) words.add(a.name);
    if (data?.title) words.add(data.title);
  }
  const { data: cards } = await ctx.db
    .from("cards")
    .select("title")
    .eq("user_id", ctx.userId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(20);
  for (const c of cards ?? []) {
    for (const tok of c.title.split(/[\s,·/()]+/))
      if (tok.length >= 2 && /[A-Za-z가-힣]/.test(tok)) words.add(tok);
  }
  return [...words].slice(0, MAX_KEYWORDS);
}
