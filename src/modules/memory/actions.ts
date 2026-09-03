"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { getRegistry } from "@/core/registry/current";
import type { MemoryKind } from "./schema";
import { type SearchHit, searchAll } from "./search";
import { memoryService } from "./service";

async function svc() {
  const user = await requireUser();
  const db = await createServerSupabase();
  return memoryService(
    createContext({
      db,
      userId: user.id,
      actor: "user",
      registry: await getRegistry(),
    }),
  );
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
  await (await svc()).remember({ content, kind, source: { type: "manual" } });
  revalidatePath("/memory");
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
  const user = await requireUser();
  const db = await createServerSupabase();
  const ctx = createContext({
    db,
    userId: user.id,
    actor: "user",
    registry: await getRegistry(),
  });
  return searchAll(ctx, query, { types, k: 12 });
}
