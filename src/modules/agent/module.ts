import type { RachelModule } from "@/core/contracts";

/** agent 모듈: 채팅 Dock·도구 루프. 도구는 다른 모듈이 제공한다. */
export const agentModule: RachelModule = {
  manifest: { id: "agent", name: "레이첼", icon: "sparkles", schemaVersion: 4 },
  commands: [
    {
      id: "agent.open",
      label: "레이첼에게 말하기",
      shortcut: "mod+j",
      keywords: ["chat", "채팅"],
      run: ({ openDock }) => openDock(),
    },
  ],
};
