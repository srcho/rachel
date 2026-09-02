import type { JobHandler, JobRecord, ServiceContext } from "@/core/contracts";
import type { Registry } from "@/core/registry/registry";

/** 잡 저장소 추상화 — Supabase 어댑터와 테스트용 인메모리 구현이 있다. */
export interface JobStore {
  claim(batch: number): Promise<JobRecord[]>;
  complete(id: string): Promise<void>;
  fail(id: string, error: string, retryAt: Date | null): Promise<void>;
}

export interface RunnerDeps {
  store: JobStore;
  registry: Registry;
  /** 잡의 user_id 로 서비스 컨텍스트를 만든다 */
  contextFor(job: JobRecord): ServiceContext;
  batch?: number;
  now?: () => Date;
}

export interface RunStats {
  claimed: number;
  done: number;
  failed: number;
  retried: number;
}

const DEFAULT_TIMEOUT_SEC = 240;

export function backoffMinutes(attempts: number): number {
  return 2 ** attempts; // 2, 4, 8 분
}

async function withTimeout<T>(
  p: Promise<T>,
  sec: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`잡 시간 초과(${sec}s): ${label}`)),
      sec * 1000,
    );
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** pending 잡을 인출해 핸들러로 디스패치한다. 실패는 지수 백오프로 재시도, 한도 초과는 failed. */
export async function runJobs(deps: RunnerDeps): Promise<RunStats> {
  const now = deps.now ?? (() => new Date());
  const handlers = deps.registry.jobHandlers();
  const jobs = await deps.store.claim(deps.batch ?? 10);
  const stats: RunStats = {
    claimed: jobs.length,
    done: 0,
    failed: 0,
    retried: 0,
  };

  for (const job of jobs) {
    // biome-ignore lint/suspicious/noExplicitAny: 핸들러 페이로드 타입은 잡마다 다르다
    const handler: JobHandler<any> | undefined = handlers[job.type];
    if (!handler) {
      await deps.store.fail(job.id, `핸들러 없음: ${job.type}`, null);
      stats.failed++;
      continue;
    }
    const maxAttempts = handler.maxAttempts ?? job.max_attempts;
    try {
      const payload = handler.schema.parse(job.payload ?? {});
      await withTimeout(
        handler.run(payload, deps.contextFor(job)),
        handler.timeoutSec ?? DEFAULT_TIMEOUT_SEC,
        job.type,
      );
      await deps.store.complete(job.id);
      stats.done++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (job.attempts >= maxAttempts) {
        await deps.store.fail(job.id, message, null);
        stats.failed++;
      } else {
        const retryAt = new Date(
          now().getTime() + backoffMinutes(job.attempts) * 60_000,
        );
        await deps.store.fail(job.id, message, retryAt);
        stats.retried++;
      }
    }
  }
  return stats;
}
