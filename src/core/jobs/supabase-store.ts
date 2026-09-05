import type { Db, JobRecord } from "@/core/contracts";
import type { Database } from "@/core/db/types.generated";
import type { JobStore } from "./runner";

/** service-role 클라이언트로 동작하는 잡 저장소 */
export function createSupabaseJobStore(admin: Db): JobStore {
  return {
    async claim(batch) {
      const { data, error } = await admin.rpc("claim_jobs", { p_batch: batch });
      if (error) throw new Error(`claim_jobs 실패: ${error.message}`);
      return (data ?? []) as JobRecord[];
    },
    async defer(job, retryAt) {
      const claimed = (
        patch: Database["public"]["Tables"]["jobs"]["Update"],
      ) => {
        let query = admin
          .from("jobs")
          .update(patch)
          .eq("id", job.id)
          .eq("status", "running")
          .eq("attempts", job.attempts);
        query = job.locked_at
          ? query.eq("locked_at", job.locked_at)
          : query.is("locked_at", null);
        return query;
      };
      const { error } = await claimed({
        status: "pending",
        run_at: retryAt.toISOString(),
        locked_at: null,
        attempts: Math.max(0, job.attempts - 1),
        last_error: "실행 전 시간 예산 부족으로 미룸",
      });
      if (error?.code === "23505") {
        // A newer pending job already carries this dedupe key. Keep it; this claim never ran.
        const { error: supersededError } = await claimed({
          status: "failed",
          locked_at: null,
          attempts: Math.max(0, job.attempts - 1),
          last_error: "실행하지 않음: 동일 키의 대기 작업으로 대체됨",
        });
        if (supersededError)
          throw new Error(`jobs 미실행 기록 실패: ${supersededError.message}`);
        return;
      }
      if (error) throw new Error(`jobs 미룸 갱신 실패: ${error.message}`);
    },
    async complete(id) {
      const { error } = await admin
        .from("jobs")
        .update({ status: "done", locked_at: null, last_error: null })
        .eq("id", id);
      if (error) throw new Error(`jobs done 갱신 실패: ${error.message}`);
    },
    async fail(id, message, retryAt) {
      const patch = retryAt
        ? {
            status: "pending" as const,
            run_at: retryAt.toISOString(),
            locked_at: null,
            last_error: message,
          }
        : { status: "failed" as const, locked_at: null, last_error: message };
      const { error } = await admin.from("jobs").update(patch).eq("id", id);
      if (error?.code === "23505" && retryAt) {
        // The retry is already represented by a newer pending job with the same key.
        const { error: supersededError } = await admin
          .from("jobs")
          .update({
            status: "failed",
            locked_at: null,
            last_error: `${message} (동일 키의 대기 작업으로 대체됨)`,
          })
          .eq("id", id)
          .eq("status", "running");
        if (supersededError)
          throw new Error(`jobs 대체 기록 실패: ${supersededError.message}`);
        return;
      }
      if (error) throw new Error(`jobs 실패 갱신 실패: ${error.message}`);
    },
  };
}
