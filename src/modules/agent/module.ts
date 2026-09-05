import type { RachelModule } from "@/core/contracts";
import { conversationTools } from "./conversation-tools";
import { executionTools } from "./execution";
import { preferenceTools } from "./preferences";

/** agent 모듈: 채팅 Dock·도구 루프. 도구는 다른 모듈이 제공한다. */
export const agentModule: RachelModule = {
  manifest: { id: "agent", name: "레이첼", icon: "sparkles", schemaVersion: 4 },
  tools: { ...preferenceTools, ...executionTools, ...conversationTools },
  commands: [
    {
      id: "agent.open",
      label: "레이첼에게 말하기",
      shortcut: "mod+j",
      keywords: ["chat", "채팅"],
      action: "openDock",
    },
  ],
};
