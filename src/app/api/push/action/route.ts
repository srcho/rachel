import { NextResponse } from "next/server";
import { z } from "zod";
import { userContext } from "@/core/context";
import { tasksService } from "@/modules/tasks/service";

const inputSchema = z.object({
  taskId: z.string().uuid(),
  action: z.enum(["complete", "snooze"]),
});
export async function POST(req: Request) {
  if (req.headers.get("origin") !== new URL(req.url).origin)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = inputSchema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  const ctx = await userContext();
  const svc = tasksService(ctx);
  const card = await svc.getCard(parsed.data.taskId);
  if (!card || card.archived_at)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  if (card.completed_at) return NextResponse.json({ ok: true });
  if (parsed.data.action === "complete") await svc.completeCard(card.id);
  else
    await ctx.enqueue({
      type: "notify.reminder",
      payload: { target: "card", id: card.id, dueAt: card.due_at },
      dedupeKey: `snooze:${card.id}:${Math.floor(ctx.now.getTime() / 900000)}`,
      runAt: new Date(ctx.now.getTime() + 900000),
    });
  return NextResponse.json({ ok: true });
}
