"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { getRegistry } from "@/core/registry/current";

/**
 * 액션 아이템을 카드로. meetings 모듈은 tasks 를 import 하지 않고 레지스트리 도구(tasks.create)를 호출한다.
 */
export async function createCardsFromMeetingAction(
  meetingId: string,
  items: Array<{
    title: string;
    dueAt?: string;
    dueHasTime?: boolean;
    description?: string;
  }>,
): Promise<number> {
  const user = await requireUser();
  const db = await createServerSupabase();
  const registry = await getRegistry();
  const ctx = createContext({
    db,
    userId: user.id,
    actor: "user",
    registry,
    ui: {
      route: `/meetings/${meetingId}`,
      entity: { type: "meeting", id: meetingId },
    },
  });
  const create = registry.tools()["tasks.create"];
  if (!create) throw new Error("tasks 모듈이 없어요");
  let n = 0;
  for (const it of items) {
    await create.execute(
      {
        title: it.title,
        description: it.description ?? "",
        dueAt: it.dueAt ?? null,
        dueHasTime: it.dueHasTime ?? false,
        meetingId,
        source: { type: "meeting", ref_id: meetingId },
      },
      ctx,
    );
    n++;
  }
  revalidatePath(`/meetings/${meetingId}`);
  return n;
}
