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
  const raw = new URL(req.url).searchParams.get("next");
  // 열린 리다이렉트 방지: 같은 사이트의 경로만
  const next =
    raw?.startsWith("/") && !raw.startsWith("//") ? raw : "/settings";
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
