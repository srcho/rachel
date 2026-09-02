import type { ComponentType } from "react";
import type { ToolContext } from "./context";
import type { Command } from "./command";
import type { EventHandler } from "./event";
import type { Indexer } from "./indexer";
import type { JobHandler } from "./job";
import type { AnyAgentTool } from "./tool";
import type { DashboardWidget } from "./widget";

export interface ModuleNav {
  href: string;
  order: number;
  /** 모바일 하단 탭에 노출 */
  mobileTab?: boolean;
}

export interface ModuleManifest {
  /** 'tasks' — 도구·이벤트·잡 접두어 */
  id: string;
  name: string;
  /** lucide 아이콘 이름 (kebab-case) */
  icon: string;
  nav?: ModuleNav;
  schemaVersion: number;
}

export interface ContextProvider {
  id: string;
  budgetTokens: number;
  build(ctx: ToolContext, userQuery: string): Promise<string | null>;
}

export interface SettingsSection {
  id: string;
  title: string;
  order: number;
  Component: ComponentType;
}

export interface RachelModule {
  manifest: ModuleManifest;
  tools?: Record<string, AnyAgentTool>;
  // biome-ignore lint/suspicious/noExplicitAny: 위젯 데이터 타입은 위젯마다 다르다
  widgets?: DashboardWidget<any>[];
  contextProviders?: ContextProvider[];
  eventHandlers?: EventHandler[];
  // biome-ignore lint/suspicious/noExplicitAny: 잡 페이로드 타입은 잡마다 다르다
  jobs?: Record<string, JobHandler<any>>;
  indexers?: Indexer[];
  commands?: Command[];
  settings?: SettingsSection;
}
