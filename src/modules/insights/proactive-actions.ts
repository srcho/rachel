"use server";
import { revalidatePath } from "next/cache";
import { userContext } from "@/core/context";
import { proactiveService } from "./proactive";
import type { SuggestionResponse } from "./proactive-schema";
export async function respondSuggestionAction(input: SuggestionResponse) {
  const result = await proactiveService(await userContext()).respond(input);
  revalidatePath("/today");
  revalidatePath("/settings");
  return result;
}
