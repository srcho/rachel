import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ToolContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { nowLine } from "@/modules/agent/context";
import { preferenceTools } from "@/modules/agent/preferences";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import {
  assistantPreferencesService,
  getSchedulingPreferences,
  getUserTimezone,
} from "../assistant";
import { getProfileSettings, updateProfileSettings } from "../profile";

const available = await localSupabaseAvailable();
describe.skipIf(!available)("explicit assistant preferences A30 A35", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let ctx: ToolContext;
  beforeAll(async () => {
    user = await testUser("assistant-prefs");
    ctx = {
      userId: user.id,
      db: user.db,
      actor: "user",
      now: new Date("2026-09-05T15:30:00Z"),
      timezone: "Asia/Seoul",
      registry: createRegistry(() => []),
      emit: async () => {},
      enqueue: async () => "",
    };
  });
  afterAll(async () => user?.cleanup());

  it("uses quiet important-only/adaptive defaults without requiring setup", async () => {
    const state = await assistantPreferencesService(ctx).get();
    expect(state.preferences.initiative).toBe("important");
    expect(state.preferences.responseLength).toBe("adaptive");
    expect(state.evidence).toBeNull();
    expect(state.preferences.scheduling).toBeUndefined();
  });

  it("deep merges explicit scheduling updates and preserves unrelated profile settings", async () => {
    await updateProfileSettings(user.db, user.id, {
      honorific: "빈센트님",
      notifications: { task_due: false },
      assistant: {
        responseLength: "brief",
        scheduling: {
          defaultDurationMinutes: 30,
          workStartHour: 9,
          workEndHour: 19,
        },
      },
    });
    const result = await assistantPreferencesService(ctx).update({
      preferences: { scheduling: { preferredStartHour: 13 } },
    });
    expect(result.preferences.scheduling).toEqual({
      defaultDurationMinutes: 30,
      workStartHour: 9,
      workEndHour: 19,
      preferredStartHour: 13,
    });
    expect(result.preferences.responseLength).toBe("brief");
    expect(result.evidence?.source).toBe("explicit_user");
    const profile = await getProfileSettings(user.db, user.id);
    expect(profile.notifications).toEqual({ task_due: false });
    expect(profile.honorific).toBe("빈센트님");
    expect(
      (await getSchedulingPreferences(user.db, user.id)).defaultDurationMinutes,
    ).toBe(30);
  });

  it("rejects an impossible merged range atomically and supports clearing the optional constraint", async () => {
    const svc = assistantPreferencesService(ctx);
    await expect(
      svc.update({ preferences: { scheduling: { workEndHour: 12 } } }),
    ).rejects.toThrow("선호 시간");
    expect((await svc.get()).preferences.scheduling?.workEndHour).toBe(19);
    await svc.update({
      preferences: { scheduling: { preferredStartHour: null } },
    });
    expect(
      (await svc.get()).preferences.scheduling?.preferredStartHour,
    ).toBeUndefined();
    await expect(
      svc.update({
        preferences: { scheduling: { defaultDurationMinutes: 0 } },
      }),
    ).rejects.toThrow();
    await expect(svc.update({ preferences: {} })).rejects.toThrow(
      "변경할 설정",
    );
  });

  it("requires actual user message evidence for assistant writes and never applies a system inference", async () => {
    const update = preferenceTools.updatePreferences;
    if (!update) throw new Error("preference tool missing");
    const changes = { preferences: { initiative: "on_request" } };
    await expect(
      update.execute(
        { changes, userQuote: "사용자가 조용한 것을 좋아하는 듯함" },
        { ...ctx, actor: "agent" },
      ),
    ).rejects.toThrow("직접 요청");
    await expect(
      assistantPreferencesService({ ...ctx, actor: "system" }).update(
        { preferences: { initiative: "active" } },
        "추정",
      ),
    ).rejects.toThrow("직접 요청");
    const result = await update.execute(
      { changes, userQuote: "내가 요청할 때만 제안해줘" },
      {
        ...ctx,
        actor: "agent",
        latestUserMessage: {
          id: "user-message-1",
          text: "앞으로 내가 요청할 때만 제안해줘",
        },
      },
    );
    expect(result.preferences.initiative).toBe("on_request");
    expect(result.evidence).toMatchObject({
      source: "explicit_user",
      messageId: "user-message-1",
      quote: "내가 요청할 때만 제안해줘",
    });
  });

  it("updates the persisted and current-turn timezone, including the local date across midnight", async () => {
    expect(nowLine(ctx.now, ctx.timezone)).toContain("2026-09-06");
    await assistantPreferencesService(ctx).update({
      timezone: "America/New_York",
    });
    expect(await getUserTimezone(user.db, user.id)).toBe("America/New_York");
    expect(ctx.timezone).toBe("America/New_York");
    expect(nowLine(ctx.now, ctx.timezone)).toContain("2026-09-05");
    await expect(
      assistantPreferencesService(ctx).update({
        timezone: "Not/A_Zone",
        preferences: { responseLength: "detailed" },
      }),
    ).rejects.toThrow("시간대");
    expect(
      (await assistantPreferencesService(ctx).get()).preferences.responseLength,
    ).toBe("brief");
  });

  it("preserves distinct settings changed concurrently", async () => {
    await Promise.all([
      updateProfileSettings(user.db, user.id, {
        assistant: { scheduling: { bufferMinutes: 15 } },
      }),
      updateProfileSettings(user.db, user.id, {
        assistant: { responseLength: "detailed" },
      }),
    ]);
    const state = await assistantPreferencesService(ctx).get();
    expect(state.preferences.responseLength).toBe("detailed");
    expect(state.preferences.scheduling?.bufferMinutes).toBe(15);
    expect(state.preferences.scheduling?.defaultDurationMinutes).toBe(30);
  });
});
