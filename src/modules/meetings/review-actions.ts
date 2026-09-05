"use server";
import { revalidatePath } from "next/cache";
import { userContext } from "@/core/context";
import { createMeetingTasks, type ReviewChoice } from "./review";

export async function createCardsFromMeetingAction(
  meetingId: string,
  items: ReviewChoice[],
) {
  const result = await createMeetingTasks(
    await userContext(),
    meetingId,
    items,
  );
  revalidatePath(`/meetings/${meetingId}`);
  revalidatePath("/tasks");
  return result;
}
