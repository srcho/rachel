"use client";
import { registerOutboxHandler } from "@/core/offline/outbox";
import {
  archiveCardAction,
  createCardAction,
  deleteCardAction,
  moveCardAction,
  updateCardAction,
} from "../actions";

registerOutboxHandler("tasks.create", (input) =>
  createCardAction(input as Parameters<typeof createCardAction>[0]),
);
registerOutboxHandler("tasks.update", (id, patch) =>
  updateCardAction(
    id as string,
    patch as Parameters<typeof updateCardAction>[1],
  ),
);
registerOutboxHandler("tasks.move", (id, input) =>
  moveCardAction(id as string, input as Parameters<typeof moveCardAction>[1]),
);
registerOutboxHandler("tasks.archive", (id, archived) =>
  archiveCardAction(id as string, archived as boolean | undefined),
);
registerOutboxHandler("tasks.delete", (id) => deleteCardAction(id as string));

export function TaskOutbox() {
  return null;
}
