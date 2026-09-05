import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { ServiceContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { encodeWav } from "@/core/transcription/wav";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { meetingsRepository } from "../repository";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  db: vi.fn(),
  context: vi.fn(),
  transcribe: vi.fn(),
}));
vi.mock("@/core/auth/session", () => ({ requireUser: mocks.user }));
vi.mock("@/core/db/server", () => ({ createServerSupabase: mocks.db }));
vi.mock("@/core/context", () => ({ createContext: mocks.context }));
vi.mock("@/core/settings/assistant", () => ({
  getUserTimezone: async () => "Asia/Seoul",
}));
vi.mock("@/modules", () => ({ registry: {} }));
vi.mock("@/core/transcription", async () => ({
  ...(await import("@/core/transcription/wav")),
  transcription: () => ({ transcribeFile: mocks.transcribe }),
}));

import { POST } from "@/app/api/meetings/[id]/diarize/route";

const available = await localSupabaseAvailable();
describe.skipIf(!available)(
  "final transcript replacement preserves prior content on failure",
  () => {
    let user: Awaited<ReturnType<typeof testUser>>;
    let other: Awaited<ReturnType<typeof testUser>>;
    let ctx: ServiceContext;
    let id: string;
    let previous: unknown;
    beforeAll(async () => {
      user = await testUser("diarize");
      other = await testUser("diarize-other");
      ctx = {
        db: user.db,
        userId: user.id,
        actor: "user",
        timezone: "Asia/Seoul",
        now: new Date(),
        registry: createRegistry(() => []),
        emit: async () => {},
        enqueue: async () => "",
      };
      mocks.user.mockResolvedValue({ id: user.id });
      mocks.db.mockResolvedValue(user.db);
      mocks.context.mockReturnValue(ctx);
    });
    beforeEach(async () => {
      mocks.transcribe.mockReset();
      const meeting = await user.db
        .from("meetings")
        .insert({
          title: "보존할 회의",
          summary_md: "유효한 요약",
          final_pass_status: "done",
        })
        .select("id")
        .single();
      if (!meeting.data) throw meeting.error;
      id = meeting.data.id;
      const repo = meetingsRepository(user.db, user.id);
      await repo.insertSegments(
        [0, 1, 2].map((chunk) => ({
          meeting_id: id,
          pass: "final",
          seq: chunk,
          chunk_index: chunk,
          turn_id: 0,
          start_ms: chunk * 60_000,
          end_ms: chunk * 60_000 + 1000,
          text: `기존 청크 ${chunk}`,
          raw_speaker: "A",
        })),
      );
      previous = await repo.listSegments(id, "final");
    });
    afterAll(async () => {
      await user?.cleanup();
      await other?.cleanup();
    });
    const request = (
      audio: Blob,
      meta = {
        chunkIndex: 0,
        chunkCount: 2,
        offsetTable: [{ chunkMs: 0, meetingMs: 0 }],
      },
    ) => {
      const form = new FormData();
      form.set("audio", audio, "chunk.wav");
      form.set("meta", JSON.stringify(meta));
      return POST(
        new Request("http://localhost/api/meetings/test/diarize", {
          method: "POST",
          body: form,
        }),
        { params: Promise.resolve({ id }) },
      );
    };
    const wav = () => encodeWav(new Int16Array(16_000), 16_000);
    const unchanged = async () => {
      expect(
        await meetingsRepository(user.db, user.id).listSegments(id, "final"),
      ).toEqual(previous);
      expect(
        (
          await user.db
            .from("meetings")
            .select("summary_md")
            .eq("id", id)
            .single()
        ).data?.summary_md,
      ).toBe("유효한 요약");
    };
    it("invalid WAV never calls provider and preserves every prior chunk", async () => {
      expect((await request(new Blob(["invalid wav"]))).status).toBe(502);
      expect(mocks.transcribe).not.toHaveBeenCalled();
      await unchanged();
    });
    it("provider failure and empty result preserve the previous transcript and summary", async () => {
      mocks.transcribe.mockRejectedValueOnce(new Error("provider offline"));
      expect((await request(wav())).status).toBe(502);
      await unchanged();
      mocks.transcribe.mockResolvedValueOnce({ turns: [], costUsd: 0 });
      expect((await request(wav())).status).toBe(502);
      await unchanged();
    });
    it("database insertion failure rolls deletion back and foreign replacement is rejected", async () => {
      // Duplicate turn identity forces the real database unique constraint to fail after DELETE.
      const turn = {
        turnId: 1,
        startMs: 0,
        endMs: 500,
        text: "중복",
        speaker: "A",
      };
      mocks.transcribe.mockResolvedValueOnce({
        turns: [turn, turn],
        costUsd: 0,
      });
      expect((await request(wav())).status).toBe(502);
      await unchanged();
      await expect(
        meetingsRepository(other.db, other.id).replaceFinalChunk(id, 0, [
          {
            turn_id: 1,
            start_ms: 0,
            end_ms: 1,
            text: "침범",
            raw_speaker: "A",
          },
        ]),
      ).rejects.toBeTruthy();
      await unchanged();
    });
    it("successful chunk0 replaces only its chunk; obsolete chunks wait for the last successful response", async () => {
      mocks.transcribe.mockResolvedValue({
        turns: [
          { turnId: 1, startMs: 0, endMs: 500, text: "새 청크", speaker: "A" },
        ],
        costUsd: 0,
      });
      expect((await request(wav())).status).toBe(200);
      let rows = await meetingsRepository(user.db, user.id).listSegments(
        id,
        "final",
      );
      expect(rows.map((r) => r.text)).toEqual([
        "새 청크",
        "기존 청크 1",
        "기존 청크 2",
      ]);
      expect(
        (
          await request(wav(), {
            chunkIndex: 1,
            chunkCount: 2,
            offsetTable: [{ chunkMs: 0, meetingMs: 60_000 }],
          })
        ).status,
      ).toBe(200);
      rows = await meetingsRepository(user.db, user.id).listSegments(
        id,
        "final",
      );
      expect(rows.every((r) => (r.chunk_index ?? 0) < 2)).toBe(true);
      expect(rows.map((r) => r.text)).toEqual(["새 청크", "새 청크"]);
    });
  },
);
