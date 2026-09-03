import { NextResponse } from "next/server";
import { requireUser } from "@/core/auth/session";
import { createServerSupabase } from "@/core/db/server";
import {
  assertMuseWav,
  parseWavHeader,
  transcription,
} from "@/core/transcription";

export const maxDuration = 30;

/** 짧은 음성 클립(≤ 60초 WAV) → 텍스트. 음성 캡처·채팅 음성 입력용 */
export async function POST(req: Request) {
  const user = await requireUser();
  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob))
    return NextResponse.json({ error: "audio 없음" }, { status: 400 });
  const buf = await audio.arrayBuffer();
  try {
    assertMuseWav(parseWavHeader(buf), buf.byteLength, {
      maxSeconds: 60,
      maxBytes: 4 * 1024 * 1024,
    });
    const db = await createServerSupabase();
    const r = await transcription().transcribeFile(
      { db, userId: user.id, mode: "PUSH_TO_TALK", feature: "voice_input" },
      new Blob([buf], { type: "audio/wav" }),
    );
    return NextResponse.json({ text: r.transcript, costUsd: r.costUsd });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
