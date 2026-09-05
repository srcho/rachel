"use server";
import { revalidatePath } from "next/cache";
import { userContext } from "@/core/context";
import { parseDueFromTitle } from "@/modules/tasks/parse-due";
import type { Triage } from "./schema";
import { captureService } from "./service";

async function svc() {
  return captureService(await userContext());
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

export async function quickTaskAction(text: string, creationKey: string) {
  const ctx = await userContext();
  const tool = ctx.registry.tools()["tasks.create"];
  if (!tool) throw new Error("할 일을 사용할 수 없어요");
  const due = parseDueFromTitle(text, ctx.now, ctx.timezone);
  const result = await tool.execute(
    {
      title: due?.title ?? text,
      dueAt: due?.dueAt,
      dueHasTime: due?.hasTime ?? false,
      creationKey,
    },
    ctx,
  );
  revalidatePath("/today");
  return result;
}
