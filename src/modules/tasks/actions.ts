"use server";
import { userContext } from "@/core/context";
import type { CreateCardInput, MoveCardInput, UpdateCardInput } from "./schema";
import { tasksService } from "./service";

async function svc() {
  return tasksService(await userContext());
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
