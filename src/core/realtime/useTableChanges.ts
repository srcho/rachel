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
    void import("@/core/db/browser").then(({ createBrowserSupabase }) => {
      if (cancelled) return;
      const supabase = createBrowserSupabase();
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
      cleanup?.();
    };
  }, [key, userId, onChange, debounceMs]);
}
