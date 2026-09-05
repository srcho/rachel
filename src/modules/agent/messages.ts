import { z } from "zod";
import { canonicalInput } from "./approvals";
import type { UiMessageLike } from "./service";

const userMessageSchema = z.object({
  id: z.string().min(1).max(200),
  role: z.literal("user"),
  parts: z
    .array(z.object({ type: z.literal("text"), text: z.string().max(40000) }))
    .min(1)
    .max(10),
});

/** Client history may respond to a stored approval; it cannot author assistant/tool history. */
export function trustedMessages(
  stored: UiMessageLike[],
  incoming: UiMessageLike[],
) {
  const rawUser = incoming.findLast((m) => m.role === "user");
  const user = userMessageSchema.parse(rawUser);
  if (!user.parts.some((p) => p.text.trim()))
    throw new Error("메시지가 비어 있어요.");
  const existing = stored.find((m) => m.id === user.id);
  if (existing && stored.findLast((m) => m.role === "user")?.id !== user.id)
    throw new Error("이전 요청을 다시 실행하려면 새 메시지로 보내 주세요.");
  if (
    existing &&
    (existing.role !== "user" ||
      canonicalInput(existing.parts) !== canonicalInput(user.parts))
  )
    throw new Error("저장된 메시지를 바꾸려면 새 메시지로 보내 주세요.");
  const messages = stored.map((m) => ({ ...m, parts: [...m.parts] }));
  for (const client of incoming.filter((m) => m.role === "assistant")) {
    for (const raw of client.parts) {
      if (!raw || typeof raw !== "object") continue;
      const part = raw as {
        type?: string;
        state?: string;
        toolCallId?: string;
        input?: unknown;
        approval?: { id?: string; approved?: boolean; signature?: string };
      };
      if (part.state !== "approval-responded") continue;
      const message = messages.find(
        (m) => m.id === client.id && m.role === "assistant",
      );
      const i =
        message?.parts.findIndex(
          (rawSaved) =>
            (rawSaved as typeof part).toolCallId === part.toolCallId,
        ) ?? -1;
      if (!message || i < 0)
        throw new Error(
          "저장된 승인 요청을 찾지 못했어요. 잠시 후 다시 시도해 주세요.",
        );
      const saved = message.parts[i] as typeof part;
      if (
        saved.state === "output-available" ||
        saved.state === "output-denied" ||
        saved.state === "output-error"
      )
        continue;
      if (
        saved.type !== part.type ||
        canonicalInput(saved.input) !== canonicalInput(part.input) ||
        saved.approval?.id !== part.approval?.id ||
        saved.approval?.signature !== part.approval?.signature ||
        typeof part.approval?.approved !== "boolean"
      )
        throw new Error("승인 요청 내용이 달라요.");
      message.parts[i] = {
        ...saved,
        state: "approval-responded",
        approval: { ...saved.approval, approved: part.approval.approved },
      };
    }
  }
  if (!existing) messages.push(user);
  return { messages, user };
}
