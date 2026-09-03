"use server";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { getRegistry } from "@/core/registry/current";
import { getOrCreateDailyBrief } from "./brief";
import { getOrCreateWeeklyReview } from "./review";

export async function generateBriefAction(force = false) {
  const user = await requireUser();
  const db = await createServerSupabase();
  const ctx = createContext({
    db,
    userId: user.id,
    actor: "system",
    registry: await getRegistry(),
  });
  const row = await getOrCreateDailyBrief(ctx, { force });
  return { contentMd: row.content_md };
}

export async function generateWeeklyReviewAction(force = true) {
  const user = await requireUser();
  const db = await createServerSupabase();
  const ctx = createContext({
    db,
    userId: user.id,
    actor: "system",
    registry: await getRegistry(),
  });
  const row = await getOrCreateWeeklyReview(ctx, { force });
  return { contentMd: row.content_md };
}
