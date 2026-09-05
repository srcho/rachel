"use server";
import { revalidatePath } from "next/cache";
import { userContext } from "@/core/context";
import { parseDueFromTitle } from "@/modules/tasks/parse-due";
import type { Triage } from "./schema";
import { captureService } from "./service";
import { captureUrl } from "./url";

async function svc() {
  return captureService(await userContext());
}

export async function captureAction(
  text: string,
  origin: "text" | "voice" | "share" = "text",
  url?: string,
  id?: string,
) {
  const c = await (await svc()).add({
    text,
    origin,
    url: captureUrl(url || text),
    id,
  });
  revalidatePath("/capture", "layout");
  revalidatePath("/today");
  return { id: c.id };
}
export async function resolveCaptureAction(
  id: string,
  override?: Partial<Triage>,
) {
  const service = await svc();
  let r: Awaited<ReturnType<typeof service.resolve>>;
  try {
    r = await service.resolve(id, override);
  } catch (error) {
    console.error("[capture.resolve]", { id, error });
    return {
      ok: false as const,
      error:
        "정리를 완료하지 못했어요. 원문은 보관되어 있어요. 같은 메모에서 다시 확정해 주세요.",
    };
  }
  revalidatePath("/capture", "layout");
  revalidatePath("/today");
  revalidatePath("/memory");
  revalidatePath("/tasks", "layout");
  revalidatePath("/calendar");
  return { ok: true as const, result: r };
}
export async function dismissCaptureAction(id: string) {
  const result = await (await svc()).dismiss(id);
  revalidatePath("/capture", "layout");
  return result;
}
export async function retriageAction(id: string) {
  const service = await svc();
  try {
    await service.triage(id);
  } catch (error) {
    console.error("[capture.triage]", { id, error });
    return {
      ok: false as const,
      error:
        "AI 분류를 완료하지 못했어요. 원문은 저장되어 있어요. 다시 시도하거나 직접 정리해 주세요.",
    };
  }
  revalidatePath("/capture", "layout");
  return { ok: true as const };
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

export async function editCaptureAction(
  id: string,
  text: string,
  expectedVersion: string,
) {
  const result = await (await svc()).edit(id, text, expectedVersion);
  revalidatePath("/capture", "layout");
  return result;
}
export async function restoreCaptureAction(id: string) {
  const result = await (await svc()).restore(id);
  revalidatePath("/capture", "layout");
  return result;
}
export async function deleteCaptureAction(id: string, expectedVersion: string) {
  const result = await (await svc()).remove(id, expectedVersion);
  revalidatePath("/capture", "layout");
  return result;
}
