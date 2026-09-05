"use server";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { getRegistry } from "@/core/registry/current";
import { toolPreview } from "./preview";
import { agentService } from "./service";
import { runUndo } from "./tool-adapter";

async function ctxFor() {
  const user = await requireUser();
  const db = await createServerSupabase();
  return createContext({
    db,
    userId: user.id,
    actor: "user",
    registry: await getRegistry(),
  });
}

export async function listThreadsAction() {
  const ctx = await ctxFor();
  return (await agentService(ctx).listThreads(20)).map((t) => ({
    id: t.id,
    title: t.title ?? "새 대화",
    lastMessageAt: t.last_message_at,
  }));
}

export async function loadThreadAction(threadId: string) {
  const ctx = await ctxFor();
  return agentService(ctx).loadMessages(threadId);
}

export async function deleteThreadAction(threadId: string) {
  const ctx = await ctxFor();
  await agentService(ctx).deleteThread(threadId);
}

export async function undoAction(undoId: string) {
  const ctx = await ctxFor();
  return runUndo(ctx.registry.tools(), ctx, undoId);
}

export async function toolPreviewAction(name: string, input: unknown) {
  return toolPreview(await ctxFor(), name, input);
}
