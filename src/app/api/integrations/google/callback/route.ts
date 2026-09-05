import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { safeLocalRedirect } from "@/core/auth/policy";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { getUserTimezone } from "@/core/settings/assistant";
import { registry } from "@/modules";
import { calendarService } from "@/modules/calendar/service";

const STATE_COOKIE = "rachel_google_state";

export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const store = await cookies();
  const saved = store.get(STATE_COOKIE)?.value ?? "";
  store.delete(STATE_COOKIE);
  let state: string | undefined;
  let next = "/settings";
  try {
    const value = JSON.parse(saved) as { state?: unknown; next?: unknown };
    if (typeof value.state === "string") state = value.state;
    if (typeof value.next === "string")
      next = safeLocalRedirect(value.next, url.origin, "/settings");
  } catch {
    // An expired or pre-upgrade cookie requires a new connection request.
  }
  const back = (query: string) => {
    const target = new URL(next, url.origin);
    for (const [key, value] of new URLSearchParams(query))
      target.searchParams.set(key, value);
    return NextResponse.redirect(target);
  };

  if (url.searchParams.get("error")) return back(`google=denied`);
  const code = url.searchParams.get("code");
  if (!code || !state || url.searchParams.get("state") !== state)
    return back("google=state");

  const db = await createServerSupabase();
  const ctx = createContext({
    db,
    userId: user.id,
    timezone: await getUserTimezone(db, user.id),
    actor: "user",
    registry,
  });
  try {
    await calendarService(ctx).connectWithCode(code);
    // 연결 직후 첫 동기화(S2.2 잡)
    await ctx.enqueue({
      type: "calendar.sync",
      payload: {},
      dedupeKey: `calendar.sync:${user.id}`,
    });
    return back("google=connected");
  } catch (e) {
    console.error("[google] connect failed", e);
    return back(
      `google=error&message=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`,
    );
  }
}
