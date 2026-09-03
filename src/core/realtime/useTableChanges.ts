"use client";
import { useEffect } from "react";
import { createBrowserSupabase } from "@/core/db/browser";

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
    const supabase = createBrowserSupabase();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(onChange, debounceMs);
    };
    let channel = supabase.channel(`user:${userId}:${key}`);
    for (const table of tableList) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `user_id=eq.${userId}` },
        fire,
      );
    }
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [key, userId, onChange, debounceMs]);
}
