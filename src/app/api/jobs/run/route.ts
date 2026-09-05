import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createContext } from "@/core/context";
import { createAdminSupabase } from "@/core/db/admin";
import { env } from "@/core/env";
import { runJobs } from "@/core/jobs/runner";
import { createSupabaseJobStore } from "@/core/jobs/supabase-store";
import { getUserTimezone } from "@/core/settings/assistant";
import { registry } from "@/modules";

export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = env().CRON_SECRET;
  const given = req.headers.get("x-cron-secret") ?? "";
  if (!secret || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

/** pg_cron(1분) 과 enqueue 직후 킥이 호출한다. */
export async function POST(req: Request) {
  if (!authorized(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminSupabase();
  const stats = await runJobs({
    store: createSupabaseJobStore(admin),
    registry,
    contextFor: async (job) =>
      createContext({
        db: admin,
        userId: job.user_id ?? "",
        timezone: job.user_id
          ? await getUserTimezone(admin, job.user_id)
          : "Asia/Seoul",
        actor: "system",
        registry,
      }),
  });
  return NextResponse.json(stats);
}
