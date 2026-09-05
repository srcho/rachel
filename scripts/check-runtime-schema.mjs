import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  if (process.env.VERCEL_ENV === "production") {
    throw new Error(
      "Production schema check requires Supabase server credentials.",
    );
  }
  console.log("Schema check skipped: no database configured for this build.");
} else {
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Query the same API schema used by the app, without reading user rows.
  const checks = [
    ["memories", "id,index_status,invalidated_at,valid_from,valid_until"],
    ["notification_controls", "user_id,disabled_suggestion_kinds"],
    ["assistant_suggestions", "id,status,proposal"],
    ["meetings", "id,note_text,content_version"],
    ["calendars", "id,sync_coverage_from,sync_coverage_to"],
    ["chat_messages", "id,message_seq"],
    ["agent_tool_runs", "id,tool_name,resource_tracking,resource_id"],
  ];
  const results = await Promise.all(
    checks.map(async ([table, columns]) => {
      const { error } = await db
        .from(table)
        .select(columns, { head: true })
        .limit(0)
        .abortSignal(AbortSignal.timeout(15_000));
      return error ? `${table}: ${error.code || "request failed"}` : null;
    }),
  );
  const failures = results.filter(Boolean);
  if (failures.length) {
    throw new Error(
      `Database schema check failed (${failures.join(", ")}). Apply and verify pending migrations before deploying the app.`,
    );
  }
  console.log(`Runtime schema check passed (${checks.length} tables).`);
}
