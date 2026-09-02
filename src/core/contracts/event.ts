import type { Actor, ServiceContext } from "./context";

export type DomainEventType = `${string}.${string}`;

export interface DomainEventInput<T = unknown> {
  type: DomainEventType;
  entity: { type: string; id: string };
  payload?: T;
  actor?: Actor;
}

export interface DomainEvent<T = unknown>
  extends Required<DomainEventInput<T>> {
  id: string;
  userId: string;
  occurredAt: string;
}

export interface EventHandler {
  /** 'task.created' 또는 글롭 'task.*' / '*' */
  on: string | string[];
  handle(event: DomainEvent, ctx: ServiceContext): Promise<void>;
}
