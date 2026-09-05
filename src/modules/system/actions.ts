"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { getRegistry } from "@/core/registry/current";
import { getUserTimezone } from "@/core/settings/assistant";
import { runBackup } from "./backup";

export async function backupNowAction() {
  const user = await requireUser();
  const db = await createServerSupabase();
  const r = await runBackup(
    createContext({
      db,
      userId: user.id,
      timezone: await getUserTimezone(db, user.id),
      actor: "user",
      registry: await getRegistry(),
    }),
  );
  revalidatePath("/settings");
  return { path: r.path, bytes: r.bytes };
}
