import type { ServiceContext } from "./context";

export interface IndexChunk {
  index: number;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface Indexer {
  /** 'card' | 'calendar_event' | 'meeting_transcript' … */
  sourceType: string;
  /** 재인덱싱을 일으키는 이벤트 타입들 */
  on: string[];
  chunks(entityId: string, ctx: ServiceContext): Promise<IndexChunk[]>;
}
