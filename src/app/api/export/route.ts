import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { getUserTimezone } from "@/core/settings/assistant";
import { localYmd } from "@/core/utils/date";
import { registry } from "@/modules";
import { buildExport, gzip } from "@/modules/system/export";

export const maxDuration = 120;

/** 전체 내보내기(JSON gzip 다운로드) */
export async function GET() {
  const user = await requireUser();
  const db = await createServerSupabase();
  const ctx = createContext({
    db,
    userId: user.id,
    timezone: await getUserTimezone(db, user.id),
    actor: "user",
    registry,
  });
  const { json } = await buildExport(ctx);
  const gz = gzip(json);
  return new Response(new Uint8Array(gz), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="rachel-export-${localYmd(ctx.now, ctx.timezone)}.json.gz"`,
      "Cache-Control": "no-store",
    },
  });
}
