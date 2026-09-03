"use server";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { getRegistry } from "@/core/registry/current";
import type { CreateCardInput, MoveCardInput, UpdateCardInput } from "./schema";
import { tasksService } from "./service";

async function svc() {
  const user = await requireUser();
  const db = await createServerSupabase();
  return tasksService(
    createContext({
      db,
      userId: user.id,
      actor: "user",
      registry: await getRegistry(),
    }),
  );
}

/** Server Action 은 서비스 호출만 한다. 결과는 직렬화 가능한 행. */
export async function createCardAction(input: CreateCardInput) {
  return (await svc()).createCard(input);
}
export async function updateCardAction(id: string, patch: UpdateCardInput) {
  return (await (await svc()).updateCard(id, patch)).card;
}
export async function moveCardAction(id: string, input: MoveCardInput) {
  return (await (await svc()).moveCard(id, input)).card;
}
export async function completeCardAction(id: string) {
  return (await (await svc()).completeCard(id)).card;
}
export async function archiveCardAction(id: string, archived = true) {
  return (await svc()).archiveCard(id, archived);
}
export async function deleteCardAction(id: string) {
  return (await svc()).deleteCard(id);
}
export async function createColumnAction(boardId: string, name: string) {
  return (await svc()).createColumn(boardId, name);
}
export async function renameColumnAction(id: string, name: string) {
  return (await svc()).renameColumn(id, name);
}
export async function deleteColumnAction(id: string) {
  return (await svc()).deleteColumn(id);
}
