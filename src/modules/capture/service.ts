import type { ServiceContext } from "@/core/contracts";
import type { Database, Json } from "@/core/db/types.generated";
import { llmGenerate } from "@/core/llm/client";
import { captureTriagePrompt } from "@/core/llm/prompts/capture-triage";
import { buildDynamicContext } from "@/modules/agent/context";
import { CAPTURE_EVENTS, type Triage, triageSchema } from "./schema";

export type CaptureRow = Database["public"]["Tables"]["captures"]["Row"];

export function captureService(ctx: ServiceContext) {
  const own = <T extends { eq: (col: string, val: string) => T }>(q: T) =>
    q.eq("user_id", ctx.userId);

  async function add(input: {
    text: string;
    origin?: "text" | "voice" | "share";
    url?: string | null;
  }): Promise<CaptureRow> {
    const text = input.text.trim();
    if (!text) throw new Error("내용이 비어 있어요");
    const { data, error } = await ctx.db
      .from("captures")
      .insert({
        user_id: ctx.userId,
        raw_text: text.slice(0, 4000),
        origin: input.origin ?? "text",
        url: input.url ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    await ctx.emit({
      type: CAPTURE_EVENTS.added,
      entity: { type: "capture", id: data.id },
      payload: { origin: data.origin },
    });
    await ctx.enqueue({
      type: "capture.triage",
      payload: { captureId: data.id },
      dedupeKey: `capture.triage:${data.id}`,
    });
    return data;
  }

  /** 열린 캡처 개수(배지용) — 행을 가져오지 않는다 */
  async function countOpen(): Promise<number> {
    const { count, error } = await own(
      ctx.db.from("captures").select("id", { count: "exact", head: true }),
    ).in("status", ["inbox", "triaged"]);
    if (error) throw error;
    return count ?? 0;
  }

  async function list(
    status: "inbox" | "triaged" | "resolved" | "dismissed" | "open" = "open",
    limit = 50,
  ): Promise<CaptureRow[]> {
    let q = own(ctx.db.from("captures").select("*"));
    q =
      status === "open"
        ? q.in("status", ["inbox", "triaged"])
        : q.eq("status", status);
    const { data, error } = await q
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }

  async function get(id: string): Promise<CaptureRow | null> {
    const { data, error } = await own(ctx.db.from("captures").select("*"))
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /** luna 로 분류 제안(데이터 변경 없음). */
  async function triage(id: string): Promise<Triage> {
    const c = await get(id);
    if (!c) throw new Error("캡처를 찾을 수 없어요");
    const now = await buildDynamicContext(
      { ...ctx, ui: undefined },
      ctx.registry,
      c.raw_text,
    );
    const { output } = await llmGenerate<Triage>({
      db: ctx.db,
      userId: ctx.userId,
      role: "extract",
      feature: "triage",
      ref: { type: "capture", id },
      instructions: captureTriagePrompt(),
      prompt: `${now.split("\n\n")[0] ?? ""}\n\n메모(${c.origin}${c.url ? `, ${c.url}` : ""}): ${c.raw_text}`,
      output: triageSchema,
      maxOutputTokens: 400,
    });
    await ctx.db
      .from("captures")
      .update({ status: "triaged", triage: output as unknown as Json })
      .eq("id", id)
      .eq("user_id", ctx.userId);
    await ctx.emit({
      type: CAPTURE_EVENTS.triaged,
      entity: { type: "capture", id },
      payload: { type: output.type },
    });
    return output;
  }

  /** 제안 확정: 레지스트리 도구로 실제 데이터 생성(모듈 간 import 없음). */
  async function resolve(
    id: string,
    override?: Partial<Triage>,
  ): Promise<{ type: string; ref: Record<string, unknown> }> {
    const c = await get(id);
    if (!c) throw new Error("캡처를 찾을 수 없어요");
    const t = {
      ...((c.triage as Triage | null) ?? { type: "note", reason: "" }),
      ...override,
    } as Triage;
    const tools = ctx.registry.tools();
    let ref: Record<string, unknown> = {};
    if (t.type === "task" && t.task) {
      const create = tools["tasks.create"];
      if (!create) throw new Error("tasks 모듈 없음");
      const card = (await create.execute(
        {
          title: t.task.title,
          priority: t.task.priority,
          dueAt: t.task.due ?? null,
          dueHasTime: Boolean(
            t.task.due &&
              /T\d{2}:\d{2}/.test(t.task.due) &&
              !t.task.due.includes("T23:59"),
          ),
          source: { type: "capture", ref_id: id },
        },
        ctx,
      )) as { id: string };
      ref = { type: "card", id: card.id };
    } else if (t.type === "event" && t.event) {
      const create = tools["calendar.createEvent"];
      if (!create) throw new Error("calendar 모듈 없음");
      const ev = (await create.execute(
        {
          title: t.event.title,
          startAt: t.event.startAt,
          endAt: t.event.endAt,
          allDay: t.event.allDay,
          location: t.event.location,
        },
        ctx,
      )) as { id: string };
      ref = { type: "calendar_event", id: ev.id };
    } else if (t.type === "memory" && t.memory) {
      const remember = tools["memory.remember"];
      if (!remember) throw new Error("memory 모듈 없음");
      const m = (await remember.execute(
        { content: t.memory.content, kind: t.memory.kind, importance: 3 },
        ctx,
      )) as { id: string };
      ref = { type: "memory", id: m.id };
    } else {
      ref = { type: "note" };
    }
    await ctx.db
      .from("captures")
      .update({
        status: "resolved",
        resolved_ref: ref as Json,
        triage: t as unknown as Json,
      })
      .eq("id", id)
      .eq("user_id", ctx.userId);
    await ctx.emit({
      type: CAPTURE_EVENTS.resolved,
      entity: { type: "capture", id },
      payload: ref,
    });
    return { type: t.type, ref };
  }

  async function dismiss(id: string): Promise<void> {
    await ctx.db
      .from("captures")
      .update({ status: "dismissed" })
      .eq("id", id)
      .eq("user_id", ctx.userId);
  }

  return { add, list, countOpen, get, triage, resolve, dismiss };
}
