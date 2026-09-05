import { NextResponse } from "next/server";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { TRANSCRIPTION } from "@/core/llm/models";
import { getUserTimezone } from "@/core/settings/assistant";
import {
  assertMuseWav,
  parseWavHeader,
  transcription,
} from "@/core/transcription";
import { registry } from "@/modules";
import { segmentMetaSchema } from "@/modules/meetings/schema";
import { meetingsService } from "@/modules/meetings/service";

export const maxDuration = 60;

/** 라이브 패스: 세그먼트 WAV → Muse ENDPOINTING → transcript_segments(live) */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await requireUser();
  const form = await req.formData();
  const meta = segmentMetaSchema.safeParse({
    seq: Number(form.get("seq")),
    startMs: Number(form.get("startMs")),
    endMs: Number(form.get("endMs")),
  });
  const audio = form.get("audio");
  if (!meta.success || !(audio instanceof Blob))
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const db = await createServerSupabase();
  const ctx = createContext({
    db,
    userId: user.id,
    timezone: await getUserTimezone(db, user.id),
    actor: "user",
    registry,
  });
  const svc = meetingsService(ctx);
  const meeting = await svc.get(id);
  if (!meeting)
    return NextResponse.json({ error: "회의 없음" }, { status: 404 });
  if (meeting.status !== "recording")
    return NextResponse.json(
      { error: "녹음 중인 회의가 아니에요" },
      { status: 409 },
    );

  try {
    const buf = await audio.arrayBuffer();
    assertMuseWav(parseWavHeader(buf), buf.byteLength, {
      maxSeconds: TRANSCRIPTION.maxSeconds,
      maxBytes: TRANSCRIPTION.maxBytes,
    });
    const r = await transcription().transcribeFile(
      {
        db,
        userId: user.id,
        mode: "ENDPOINTING",
        feature: "transcribe_live",
        ref: { type: "meeting", id },
        keywords: meeting.keywords,
        sessionId: `${id}-live-${meta.data.seq}`,
      },
      new Blob([buf], { type: "audio/wav" }),
    );
    const rows = await svc.appendLiveTurns(
      id,
      meta.data.seq,
      meta.data.startMs,
      r.turns,
    );
    return NextResponse.json({
      turns: rows.map((s) => ({
        id: s.id,
        seq: s.seq,
        start_ms: s.start_ms,
        end_ms: s.end_ms,
        text: s.text,
        status: s.status,
      })),
      costUsd: r.costUsd,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await svc
      .markSegmentFailed(
        id,
        meta.data.seq,
        meta.data.startMs,
        meta.data.endMs,
        message,
      )
      .catch(() => {});
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
