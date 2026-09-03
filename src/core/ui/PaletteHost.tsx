"use client";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { Command } from "@/core/contracts";
import { useDock } from "@/modules/agent/dock/store";
import { startMeetingAction } from "@/modules/meetings/actions";
import { searchAction } from "@/modules/memory/actions";
import type { PaletteHit } from "./CommandPalette";

const CommandPalette = dynamic(
  () => import("./CommandPalette").then((m) => m.CommandPalette),
  { ssr: false },
);

/** 팔레트에 서버 액션·Dock 스토어를 연결하는 조립 지점(앱 레이아웃에서 사용). */
export function PaletteHost({ commands }: { commands: Command[] }) {
  const router = useRouter();
  const setOpen = useDock((s) => s.setOpen);
  const search = useCallback(
    async (q: string): Promise<PaletteHit[]> =>
      (await searchAction(q)).map((h) => ({
        id: h.id,
        sourceType: h.sourceType,
        title: h.title,
        snippet: h.snippet,
        href: h.href,
      })),
    [],
  );
  return (
    <CommandPalette
      commands={commands}
      search={search}
      onAction={async (action) => {
        if (action === "openDock") setOpen(true);
        else if (action === "startMeeting") {
          const m = await startMeetingAction({});
          router.push(`/meetings/live/${m.id}`);
        } else if (action === "newCard") router.push("/tasks");
      }}
    />
  );
}
