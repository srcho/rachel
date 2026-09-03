"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { getRegistry } from "@/core/registry/current";
import type { Triage } from "./schema";
import { captureService } from "./service";

async function svc() {
  const user = await requireUser();
  const db = await createServerSupabase();
  return captureService(
    createContext({
      db,
      userId: user.id,
      actor: "user",
      registry: await getRegistry(),
    }),
  );
}

export async function captureAction(
  text: string,
  origin: "text" | "voice" | "share" = "text",
  url?: string,
) {
  const c = await (await svc()).add({ text, origin, url });
  revalidatePath("/capture");
  revalidatePath("/today");
  return { id: c.id };
}
export async function resolveCaptureAction(
  id: string,
  override?: Partial<Triage>,
) {
  const r = await (await svc()).resolve(id, override);
  revalidatePath("/capture");
  return r;
}
export async function dismissCaptureAction(id: string) {
  await (await svc()).dismiss(id);
  revalidatePath("/capture");
}
export async function retriageAction(id: string) {
  await (await svc()).triage(id);
  revalidatePath("/capture");
}
