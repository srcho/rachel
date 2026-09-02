import type { Db, JobInput } from "@/core/contracts";
import { env } from "@/core/env";

/** jobs 테이블에 등록(중복 키는 기존 pending id 반환). 등록 직후 러너를 한 번 깨운다. */
export async function enqueueJob(
  db: Db,
  userId: string,
  input: JobInput,
): Promise<string> {
  const { data, error } = await db.rpc("enqueue_job", {
    p_type: input.type,
    p_payload: (input.payload ?? {}) as never,
    p_dedupe_key: input.dedupeKey ?? undefined,
    p_run_at: (input.runAt ?? new Date()).toISOString(),
    p_user_id: userId,
  });
  if (error)
    throw new Error(`enqueue_job 실패(${input.type}): ${error.message}`);
  if (!input.runAt || input.runAt.getTime() <= Date.now()) kickJobRunner();
  return data as string;
}

/** fire-and-forget. 실패해도 pg_cron이 1분 내 다시 부른다. */
export function kickJobRunner(): void {
  const { APP_URL, CRON_SECRET } = env();
  if (!CRON_SECRET) return;
  const run = () =>
    fetch(`${APP_URL}/api/jobs/run`, {
      method: "POST",
      headers: { "x-cron-secret": CRON_SECRET },
    }).catch(() => {});
  // Next.js after()가 있으면 응답 후 실행, 아니면 즉시
  import("next/server")
    .then((m) => (typeof m.after === "function" ? m.after(run) : run()))
    .catch(run);
}
