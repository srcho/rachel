import type { ZodType } from "zod";
import type { ServiceContext } from "./context";

export interface JobInput<P = unknown> {
  type: string;
  payload?: P;
  dedupeKey?: string;
  runAt?: Date;
}

export interface JobRecord {
  id: string;
  user_id: string | null;
  type: string;
  payload: unknown;
  dedupe_key: string | null;
  status: "pending" | "running" | "done" | "failed";
  run_at: string;
  attempts: number;
  max_attempts: number;
  locked_at: string | null;
  last_error: string | null;
}

export interface JobHandler<P = unknown> {
  schema: ZodType<P>;
  /** 기본 3 */
  maxAttempts?: number;
  /** 기본 240초 (함수 한도 300초 아래) */
  timeoutSec?: number;
  run(payload: P, ctx: ServiceContext): Promise<void>;
}
