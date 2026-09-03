import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ServiceContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { meetingsService } from "../service";

const available = await localSupabaseAvailable();

describe.skipIf(!available)("meetingsService", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let ctx: ServiceContext;
  const jobs: string[] = [];
  beforeAll(async () => {
    user = await testUser("meet");
    ctx = {
      userId: user.id,
      db: user.db,
      actor: "user",
      now: new Date("2026-09-03T01:00:00Z"),
      timezone: "Asia/Seoul",
      registry: createRegistry(() => []),
      emit: async () => {},
      enqueue: async (j) => {
        jobs.push(j.type);
        return "j";
      },
    };
  });
  afterAll(async () => user?.cleanup());

  it("starts, appends live turns with meeting offsets, finalizes and enqueues postprocess", async () => {
    const svc = meetingsService(ctx);
    const m = await svc.start({ audioMime: "audio/webm" });
    expect(m.status).toBe("recording");
    expect(m.keywords).toContain("레이첼");
    expect(m.audio_local_key).toBe(`rec:${m.id}`);
    await svc.appendLiveTurns(m.id, 0, 0, [
      { turnId: 1, startMs: 100, endMs: 4000, text: "안녕하세요" },
    ]);
    await svc.appendLiveTurns(m.id, 1, 12_000, [
      { turnId: 1, startMs: 0, endMs: 3000, text: "두 번째" },
      { turnId: 2, startMs: 3500, endMs: 6000, text: "세 번째" },
    ]);
    await svc.markSegmentFailed(m.id, 2, 24_000, 30_000, "boom");
    expect(await svc.maxSeq(m.id)).toBe(2);
    const t = await svc.transcript(m.id);
    expect(t.pass).toBe("live");
    expect(t.segments.map((s) => [s.start_ms, s.text])).toEqual([
      [100, "안녕하세요"],
      [12_000, "두 번째"],
      [15_500, "세 번째"],
    ]);
    // 같은 seq 재업로드는 덮어쓴다(중복 없음)
    await svc.appendLiveTurns(m.id, 1, 12_000, [
      { turnId: 1, startMs: 0, endMs: 3000, text: "두 번째(재시도)" },
    ]);
    expect(
      (await svc.transcript(m.id)).segments
        .filter((s) => s.seq === 1)
        .map((s) => s.text),
    ).toEqual(["두 번째(재시도)", "세 번째"]);
    const done = await svc.finalize(m.id, { durationSec: 30 });
    expect(done.status).toBe("processing");
    expect(done.final_pass_status).toBe("pending");
    expect(jobs).toContain("meetings.postprocess");
    await svc.bookmark(m.id, 5000, "중요");
    await svc.setSpeakerName(m.id, "S1", "김민수");
    const after = await svc.get(m.id);
    expect(after?.speaker_map).toEqual({ S1: "김민수" });
    expect((after?.bookmarks as unknown[]).length).toBe(1);
  });
});
