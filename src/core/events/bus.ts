import type {
  Actor,
  Db,
  DomainEvent,
  DomainEventInput,
  ServiceContext,
} from "@/core/contracts";
import type { Registry } from "@/core/registry/registry";

export interface EmitterDeps {
  db: Db;
  userId: string;
  actor: Actor;
  registry: Registry;
  /** 핸들러에 넘길 컨텍스트(자기 자신을 참조하므로 지연 제공) */
  ctx: () => ServiceContext;
}

/**
 * 도메인 이벤트: domain_events 에 append → 레지스트리 핸들러 순차 실행(실패는 로그만).
 * 무거운 작업은 핸들러 안에서 ctx.enqueue() 로 잡으로 넘긴다.
 */
export function createEmitter(deps: EmitterDeps) {
  return async function emit(input: DomainEventInput): Promise<void> {
    const actor = input.actor ?? deps.actor;
    const payload = (input.payload ?? {}) as Record<string, unknown>;
    const { data, error } = await deps.db
      .from("domain_events")
      .insert({
        user_id: deps.userId,
        type: input.type,
        entity_type: input.entity.type,
        entity_id: input.entity.id,
        payload: payload as never,
        actor,
      })
      .select("id, occurred_at")
      .single();
    if (error) {
      console.error("[events] insert failed", input.type, error.message);
    }
    const event: DomainEvent = {
      id: String(data?.id ?? ""),
      userId: deps.userId,
      occurredAt: data?.occurred_at ?? new Date().toISOString(),
      type: input.type,
      entity: input.entity,
      payload,
      actor,
    };
    for (const handler of deps.registry.eventHandlers(event.type)) {
      try {
        await handler.handle(event, deps.ctx());
      } catch (err) {
        console.error("[events] handler failed", event.type, err);
      }
    }
  };
}
