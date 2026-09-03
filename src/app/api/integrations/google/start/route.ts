import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireUser } from "@/core/auth/session";
import { buildAuthUrl } from "@/modules/calendar/google";

const STATE_COOKIE = "rachel_google_state";

/** Google 캘린더 연동 시작. state 를 쿠키에 두고 동의 화면으로. */
export async function GET(req: Request) {
  await requireUser();
  const state = randomBytes(16).toString("hex");
  const next = new URL(req.url).searchParams.get("next") ?? "/settings";
  const store = await cookies();
  store.set(STATE_COOKIE, `${state}:${next}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  return NextResponse.redirect(buildAuthUrl(state));
}
