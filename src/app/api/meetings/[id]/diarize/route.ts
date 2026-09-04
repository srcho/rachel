import { NextResponse } from "next/server";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import type { Json } from "@/core/db/types.generated";
import { TRANSCRIPTION } from "@/core/llm/models";
import {
  assertMuseWav,
  parseWavHeader,
  transcription,
} from "@/core/transcription";
import { registry } from "@/modules";
import { chunkToMeetingMs } from "@/modules/meetings/finalpass/chunker";
import { chunkMetaSchema, MEETING_EVENTS } from "@/modules/meetings/schema";
import { meetingsService } from "@/modules/meetings/service";
import { type FinalTurn, stitch } from "@/modules/meetings/stitch";

export const maxDuration = 120;
const OVERLAP_MS = 30_000;

/** 파이널 패스: 청크 WAV → Muse DIARIZATION → final 세그먼트. 마지막 청크면 스티칭·요약 v2. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await requireUser();
  const form = await req.formData();
  const metaRaw = form.get("meta");
  const audio = form.get("audio");
  const meta = chunkMetaSchema.safeParse(
    typeof metaRaw === "string" ? JSON.parse(metaRaw) : null,
  );
  if (!meta.success || !(audio instanceof Blob))
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const db = await createServerSupabase();
  const ctx = createContext({ db, userId: user.id, actor: "user", registry });
  const svc = meetingsService(ctx);
  const meeting = await svc.get(id);
  if (!meeting)
    return NextResponse.json({ error: "회의 없음" }, { status: 404 });
  const { chunkIndex, chunkCount, offsetTable } = meta.data;

  try {
    if (chunkIndex === 0) await svc.repo.deleteSegments(id, "final");
    await svc.update(id, {
      final_pass_status: "running",
      final_pass_progress: {
        done: chunkIndex,
        total: chunkCount,
      } as unknown as Json,
    });
    const buf = await audio.arrayBuffer();
    assertMuseWav(parseWavHeader(buf), buf.byteLength, {
      maxSeconds: TRANSCRIPTION.maxSeconds,
      maxBytes: TRANSCRIPTION.maxBytes,
    });
    const r = await transcription().transcribeFile(
      {
        db,
        userId: user.id,
        mode: "DIARIZATION",
        feature: "transcribe_final",
        ref: { type: "meeting", id },
        keywords: meeting.keywords,
        sessionId: `${id}-final-${chunkIndex}`,
      },
      new Blob([buf], { type: "audio/wav" }),
    );
    await svc.repo.deleteSegments(id, "final", chunkIndex);
    await svc.repo.insertSegments(
      r.turns.map((t) => ({
        meeting_id: id,
        pass: "final" as const,
        seq: chunkIndex,
        chunk_index: chunkIndex,
        turn_id: t.turnId,
        start_ms: chunkToMeetingMs(offsetTable, t.startMs),
        end_ms: chunkToMeetingMs(offsetTable, t.endMs),
        raw_speaker: t.speaker ?? "A",
        speaker: null,
        text: t.text,
        status: "ok" as const,
      })),
    );
    const isLast = chunkIndex === chunkCount - 1;
    if (isLast) {
      const rows = await svc.repo.listSegments(id, "final");
      const turns: FinalTurn[] = rows.map((s) => ({
        chunkIndex: s.chunk_index ?? 0,
        rawSpeaker: s.raw_speaker ?? "A",
        startMs: s.start_ms,
        endMs: s.end_ms,
        text: s.text,
        turnId: s.turn_id ?? 0,
      }));
      const { mapping, turns: kept } = stitch(turns, OVERLAP_MS);
      // 겹침 중복 제거: 유지할 (chunk, turn) 만 남기고 삭제
      const keep = new Set(kept.map((t) => `${t.chunkIndex}:${t.turnId}`));
      const drop = rows
        .filter((s) => !keep.has(`${s.chunk_index ?? 0}:${s.turn_id ?? 0}`))
        .map((s) => s.id);
      if (drop.length)
        await db.from("transcript_segments").delete().in("id", drop);
      await svc.repo.updateSpeakers(
        id,
        Object.entries(mapping).flatMap(([ci, m]) =>
          Object.entries(m).map(([raw, sp]) => ({
            chunkIndex: Number(ci),
            rawSpeaker: raw,
            speaker: sp,
          })),
        ),
      );
      await svc.update(id, {
        final_pass_status: "done",
        final_pass_progress: {
          done: chunkCount,
          total: chunkCount,
        } as unknown as Json,
      });
      await ctx.emit({
        type: MEETING_EVENTS.transcribed,
        entity: { type: "meeting", id },
        payload: {
          pass: "final",
          turns: kept.length,
          speakers: new Set(kept.map((t) => t.speaker)).size,
        },
      });
      await ctx.enqueue({
        type: "meetings.postprocess",
        payload: { meetingId: id, pass: "final" },
        dedupeKey: `meetings.postprocess:${id}:final`,
      });
    } else {
      await svc.update(id, {
        final_pass_progress: {
          done: chunkIndex + 1,
          total: chunkCount,
        } as unknown as Json,
      });
    }
    return NextResponse.json({
      ok: true,
      turns: r.turns.length,
      costUsd: r.costUsd,
      done: isLast,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await svc.update(id, { final_pass_status: "failed" }).catch(() => {});
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
