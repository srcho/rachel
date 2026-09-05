"use server";
import { revalidatePath } from "next/cache";
import { userContext } from "@/core/context";
import type { MemoryKind } from "./schema";
import { type SearchHit, searchAll } from "./search";
import { memoryService } from "./service";

async function svc() {
  return memoryService(await userContext());
}

export async function updateMemoryAction(
  id: string,
  patch: {
    content?: string;
    kind?: MemoryKind;
    importance?: number;
    pinned?: boolean;
  },
) {
  await (await svc()).update(id, patch);
  revalidatePath("/memory");
}
export async function forgetMemoryAction(id: string) {
  await (await svc()).forget(id);
  revalidatePath("/memory");
}
export async function rememberAction(content: string, kind: MemoryKind) {
  const result = await (await svc()).remember({
    content,
    kind,
    source: { type: "manual" },
  });
  revalidatePath("/memory");
  return { review: Boolean(result.memory.review_against) };
}
export async function archiveMemoryAction(id: string, archived: boolean) {
  await (await svc()).update(id, {
    status: archived ? "archived" : "active",
  } as never);
  revalidatePath("/memory");
}

export async function searchAction(
  query: string,
  types?: string[],
): Promise<SearchHit[]> {
  const ctx = await userContext();
  return searchAll(ctx, query, { types, k: 12 });
}

export async function memoryReviewAction(
  id: string,
  choice: "replace" | "keep" | "discard",
) {
  const ctx = await userContext();
  const { error } = await ctx.db.rpc("resolve_memory_review", {
    p_id: id,
    p_choice: choice,
  });
  if (error) throw error;
  revalidatePath("/memory");
}
export async function memoryReviewOriginalAction(id: string) {
  const s = await svc();
  const m = await s.get(id);
  if (!m?.review_against) return null;
  const old = await s.get(m.review_against);
  return old ? { content: old.content, updatedAt: old.updated_at } : null;
}
