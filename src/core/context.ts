import type {
  Actor,
  Db,
  ServiceContext,
  ToolContext,
  UiContext,
} from "@/core/contracts";
import { createEmitter } from "@/core/events/bus";
import { enqueueJob } from "@/core/jobs/queue";
import type { Registry } from "@/core/registry/registry";

export interface CreateContextInput {
  db: Db;
  userId: string;
  actor: Actor;
  registry: Registry;
  timezone?: string;
  ui?: UiContext;
}

/** 서비스·도구·잡 핸들러에 넘길 컨텍스트를 만든다. emit/enqueue 는 여기서 연결된다. */
export function createContext(input: CreateContextInput): ToolContext {
  const ctx: ToolContext = {
    userId: input.userId,
    db: input.db,
    actor: input.actor,
    now: new Date(),
    timezone: input.timezone ?? "Asia/Seoul",
    registry: input.registry,
    ui: input.ui,
    emit: async () => {},
    enqueue: async () => "",
  };
  ctx.emit = createEmitter({
    db: input.db,
    userId: input.userId,
    actor: input.actor,
    registry: input.registry,
    ctx: () => ctx,
  });
  ctx.enqueue = (job) => enqueueJob(input.db, input.userId, job);
  return ctx;
}

export type { ServiceContext };

/**
 * Server Action·서버 컴포넌트용: 로그인 사용자 + 서버 Supabase + 레지스트리로 ServiceContext 를 만든다.
 * (예전엔 같은 6줄이 30곳에 복사돼 있었다)
 */
export async function userContext(
  actor: Actor = "user",
): Promise<ServiceContext> {
  const [{ requireUser }, { createServerSupabase }, { getRegistry }] =
    await Promise.all([
      import("@/core/auth/session"),
      import("@/core/db/server"),
      import("@/core/registry/current"),
    ]);
  const user = await requireUser();
  const db = await createServerSupabase();
  return createContext({
    db,
    userId: user.id,
    actor,
    registry: await getRegistry(),
  });
}
