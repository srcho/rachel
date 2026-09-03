import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/types.generated";
import type { Registry } from "@/core/registry/registry";
import type { DomainEventInput } from "./event";
import type { JobInput } from "./job";

export type Db = SupabaseClient<Database>;
export type Actor = "user" | "agent" | "system";

/** 잡·이벤트 핸들러·서비스가 받는 컨텍스트. 사용자 세션이 없는 경로에서는 service-role 클라이언트 + userId 스코프 규약. */
export interface ServiceContext {
  userId: string;
  db: Db;
  actor: Actor;
  now: Date;
  timezone: string;
  /** 조립된 레지스트리(다른 모듈의 도구·컨텍스트를 호출할 때) */
  registry: Registry;
  emit(event: DomainEventInput): Promise<void>;
  enqueue(job: JobInput): Promise<string>;
}

export interface UiContext {
  route: string;
  entity?: { type: string; id: string };
}

/** 에이전트 도구가 받는 컨텍스트 = 서비스 컨텍스트 + 화면 컨텍스트 */
export interface ToolContext extends ServiceContext {
  ui?: UiContext;
}
