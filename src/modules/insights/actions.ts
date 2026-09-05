"use server";
import { userContext } from "@/core/context";
import { getOrCreateDailyBrief } from "./brief";
import { getOrCreateWeeklyReview } from "./review";

export async function generateBriefAction(force = false) {
  const ctx = await userContext();
  const row = await getOrCreateDailyBrief(ctx, { force });
  return { contentMd: row.content_md };
}

export async function generateWeeklyReviewAction(force = true) {
  const ctx = await userContext();
  const row = await getOrCreateWeeklyReview(ctx, { force });
  return { contentMd: row.content_md };
}
