import { NextResponse } from "next/server";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { registry } from "@/modules";
import { subscriptionSchema } from "@/modules/notify/schema";
import { notifyService } from "@/modules/notify/service";

export async function POST(req: Request) {
  const user = await requireUser();
  const parsed = subscriptionSchema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: "잘못된 구독" }, { status: 400 });
  const db = await createServerSupabase();
  await notifyService(
    createContext({ db, userId: user.id, actor: "user", registry }),
  ).subscribe({
    ...parsed.data,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });
  return NextResponse.json({ ok: true });
}
