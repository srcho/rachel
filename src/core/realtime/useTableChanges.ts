"use client";
import { useEffect } from "react";

type Table =
  | "cards"
  | "board_columns"
  | "boards"
  | "calendar_events"
  | "meetings"
  | "transcript_segments"
  | "captures";

/**
 * 사용자 행의 변경을 구독한다(RLS 적용). 보이는 화면의 테이블만 구독할 것.
 * 콜백은 디바운스해서 호출된다(연속 변경 시 한 번만).
 * supabase-js(≈50KB gz)는 첫 로드에서 빼고 구독 시점에 동적으로 불러온다.
 */
export function useTableChanges(
  tables: Table[],
  userId: string,
  onChange: () => void,
  debounceMs = 150,
) {
  const key = tables.join(",");
  useEffect(() => {
    const tableList = key.split(",") as Table[];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(onChange, debounceMs);
    };
    const resume = () => {
      if (document.visibilityState === "visible" && navigator.onLine) fire();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("online", resume);
    void import("@/core/db/browser").then(async ({ createBrowserSupabase }) => {
      if (cancelled) return;
      const supabase = createBrowserSupabase();
      // RLS 가 걸린 postgres_changes 는 사용자 JWT 로 join 해야 한다. 세션 로드 전에 구독하면 익명 join 이 되어
      // 변경이 조용히 걸러진다(2026-09-04 확인) — 먼저 세션을 읽어 Realtime 에 토큰을 넣는다.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session)
        await supabase.realtime.setAuth(data.session.access_token);
      let channel = supabase.channel(`user:${userId}:${key}`);
      for (const table of tableList) {
        channel = channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table,
            filter: `user_id=eq.${userId}`,
          },
          fire,
        );
      }
      channel.subscribe();
      cleanup = () => {
        supabase.removeChannel(channel);
      };
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("online", resume);
      cleanup?.();
    };
  }, [key, userId, onChange, debounceMs]);
}
