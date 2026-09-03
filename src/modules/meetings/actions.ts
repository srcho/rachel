"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { getRegistry } from "@/core/registry/current";
import { meetingsService } from "./service";

async function svc() {
  const user = await requireUser();
  const db = await createServerSupabase();
  return meetingsService(
    createContext({
      db,
      userId: user.id,
      actor: "user",
      registry: await getRegistry(),
    }),
  );
}

export async function startMeetingAction(input: {
  title?: string;
  calendarEventId?: string;
  audioMime?: string;
}) {
  const m = await (await svc()).start(input);
  return { id: m.id, title: m.title };
}

export async function finalizeMeetingAction(
  id: string,
  durationSec: number,
  opts: { skipFinalPass?: boolean } = {},
) {
  await (await svc()).finalize(id, {
    durationSec,
    skipFinalPass: opts.skipFinalPass,
  });
  revalidatePath("/meetings");
}

export async function bookmarkAction(id: string, atMs: number, note?: string) {
  await (await svc()).bookmark(id, atMs, note);
}

export async function renameMeetingAction(id: string, title: string) {
  await (await svc()).update(id, { title: title.trim() || "회의" });
  revalidatePath(`/meetings/${id}`);
}

export async function setSpeakerNameAction(
  id: string,
  speaker: string,
  name: string,
) {
  await (await svc()).setSpeakerName(id, speaker, name);
  revalidatePath(`/meetings/${id}`);
}

export async function deleteMeetingAction(id: string) {
  await (await svc()).remove(id);
  revalidatePath("/meetings");
}

export async function listLiveSegmentsAction(id: string) {
  const s = await svc();
  return (await s.repo.listSegments(id, "live")).map((r) => ({
    id: r.id,
    seq: r.seq,
    start_ms: r.start_ms,
    end_ms: r.end_ms,
    text: r.text,
    status: r.status as "ok" | "failed",
  }));
}
