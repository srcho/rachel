import type { Db, JobRecord } from "@/core/contracts";
import type { JobStore } from "./runner";

/** service-role 클라이언트로 동작하는 잡 저장소 */
export function createSupabaseJobStore(admin: Db): JobStore {
  return {
    async claim(batch) {
      const { data, error } = await admin.rpc("claim_jobs", { p_batch: batch });
      if (error) throw new Error(`claim_jobs 실패: ${error.message}`);
      return (data ?? []) as JobRecord[];
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
      if (error) throw new Error(`jobs 실패 갱신 실패: ${error.message}`);
    },
  };
}
