"use server";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { registry } from "@/modules";
import { getOrCreateDailyBrief } from "./brief";

export async function generateBriefAction(force = false) {
  const user = await requireUser();
  const db = await createServerSupabase();
  const ctx = createContext({ db, userId: user.id, actor: "system", registry });
  const row = await getOrCreateDailyBrief(ctx, registry, { force });
  return { contentMd: row.content_md };
}
