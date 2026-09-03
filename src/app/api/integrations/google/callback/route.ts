import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { registry } from "@/modules";
import { calendarService } from "@/modules/calendar/service";

const STATE_COOKIE = "rachel_google_state";

export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const store = await cookies();
  const saved = store.get(STATE_COOKIE)?.value ?? "";
  store.delete(STATE_COOKIE);
  const [state, next = "/settings"] = saved.split(":");
  const back = (q: string) =>
    NextResponse.redirect(new URL(`${next}?${q}`, url.origin));

  if (url.searchParams.get("error")) return back(`google=denied`);
  const code = url.searchParams.get("code");
  if (!code || !state || url.searchParams.get("state") !== state)
    return back("google=state");

  const db = await createServerSupabase();
  const ctx = createContext({ db, userId: user.id, actor: "user", registry });
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
