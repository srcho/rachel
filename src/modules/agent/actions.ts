"use server";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { getRegistry } from "@/core/registry/current";
import { getUserTimezone } from "@/core/settings/assistant";
import { approvalPreview, respondToApproval } from "./approvals";
import {
  listExecutionReceipts,
  reconcileExecution,
  resumeExecution,
} from "./execution";
import { agentService } from "./service";
import { runUndo } from "./tool-adapter";

async function ctxFor() {
  const user = await requireUser();
  const db = await createServerSupabase();
  return createContext({
    db,
    userId: user.id,
    timezone: await getUserTimezone(db, user.id),
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

export async function loadThreadAction(threadId: string, beforeId?: string) {
  const ctx = await ctxFor();
  return agentService(ctx).loadMessages(threadId, beforeId);
}

export async function deleteThreadAction(threadId: string) {
  const ctx = await ctxFor();
  await agentService(ctx).deleteThread(threadId);
}

export async function undoAction(undoId: string) {
  const ctx = await ctxFor();
  return runUndo(ctx.registry.tools(), ctx, undoId);
}

export async function toolPreviewAction(toolCallId: string) {
  return approvalPreview(await ctxFor(), toolCallId);
}

export async function approveToolAction(toolCallId: string, approved: boolean) {
  await respondToApproval(await ctxFor(), toolCallId, approved);
}

export async function executionRecordsAction(threadId: string) {
  return listExecutionReceipts(await ctxFor(), { threadId, limit: 30 });
}

export async function inspectExecutionAction(id: string) {
  return reconcileExecution(await ctxFor(), id);
}

export async function resumeExecutionAction(id: string) {
  return resumeExecution(await ctxFor(), id);
}
