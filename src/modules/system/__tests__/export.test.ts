import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ServiceContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { buildExport } from "../export";

const available = await localSupabaseAvailable();
describe.skipIf(!available)("complete source-aware export", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let other: Awaited<ReturnType<typeof testUser>>;
  beforeAll(async () => {
    user = await testUser("export");
    other = await testUser("export-other");
  });
  afterAll(async () => {
    await user?.cleanup();
    await other?.cleanup();
  });
  it("retains the reviewed owner, due date, kind and created-resource mapping without foreign review data", async () => {
    const resultId = crypto.randomUUID();
    const ownIds = [];
    for (const fixture of [user, other]) {
      const meeting = await fixture.db
        .from("meetings")
        .insert({ title: "검토한 회의", note_text: "원문" })
        .select("id")
        .single();
      if (!meeting.data) throw meeting.error;
      const review = await fixture.db
        .from("meeting_followups")
        .insert({
          user_id: fixture.id,
          meeting_id: meeting.data.id,
          action_key: `review:${meeting.data.id}`,
          kind: "waiting",
          result_id: resultId,
          choice: {
            owner: "담당자",
            due: "2026-09-09",
            kind: "waiting",
            title: "답 받기",
          },
        })
        .select("id")
        .single();
      if (!review.data) throw review.error;
      ownIds.push(review.data.id);
    }
    const ctx: ServiceContext = {
      db: user.db,
      userId: user.id,
      actor: "user",
      timezone: "Asia/Seoul",
      now: new Date(),
      registry: createRegistry(() => []),
      emit: async () => {},
      enqueue: async () => "",
    };
    const result = await buildExport(ctx);
    const rows = JSON.parse(result.json).tables.meeting_followups;
    expect(result.counts.meeting_followups).toBe(1);
    expect(rows).toEqual([
      expect.objectContaining({
        id: ownIds[0],
        kind: "waiting",
        result_id: resultId,
        choice: {
          owner: "담당자",
          due: "2026-09-09",
          kind: "waiting",
          title: "답 받기",
        },
      }),
    ]);
    expect(result.json).not.toContain(ownIds[1]);
  });
});
