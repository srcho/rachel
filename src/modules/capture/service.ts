import { z } from "zod";
import type { ServiceContext } from "@/core/contracts";
import type { Database, Json } from "@/core/db/types.generated";
import { llmGenerate } from "@/core/llm/client";
import { captureTriagePrompt } from "@/core/llm/prompts/capture-triage";
import { buildDynamicContext } from "@/modules/agent/context";
import { memoryService } from "@/modules/memory/service";
import {
  CAPTURE_EVENTS,
  captureListSchema,
  type Triage,
  triageSchema,
} from "./schema";

export type CaptureRow = Database["public"]["Tables"]["captures"]["Row"];

export function captureService(ctx: ServiceContext) {
  const own = <T extends { eq: (col: string, val: string) => T }>(q: T) =>
    q.eq("user_id", ctx.userId);

  async function add(input: {
    id?: string;
    text: string;
    origin?: "text" | "voice" | "share";
    url?: string | null;
  }): Promise<CaptureRow> {
    const text = input.text.trim();
    if (!text) throw new Error("내용이 비어 있어요");
    const reuse = async (existing: CaptureRow) => {
      if (
        existing.raw_text !== text.slice(0, 4000) ||
        existing.origin !== (input.origin ?? "text") ||
        existing.url !== (input.url ?? null)
      )
        throw new Error("같은 요청 ID의 메모 내용이 달라요");
      if (existing.status === "inbox")
        await ctx.enqueue({
          type: "capture.triage",
          payload: { captureId: existing.id },
          dedupeKey: `capture.triage:${existing.id}`,
        });
      return existing;
    };
    if (input.id) {
      z.string().uuid().parse(input.id);
      const existing = await get(input.id);
      if (existing) return reuse(existing);
    }
    const { data, error } = await ctx.db
      .from("captures")
      .insert({
        ...(input.id ? { id: input.id } : {}),
        user_id: ctx.userId,
        raw_text: text.slice(0, 4000),
        origin: input.origin ?? "text",
        url: input.url ?? null,
      })
      .select("*")
      .single();
    if (error) {
      if (input.id && error.code === "23505") {
        const existing = await get(input.id);
        if (existing) return reuse(existing);
      }
      throw error;
    }
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
    ).in("status", ["inbox", "triaged", "resolving"]);
    if (error) throw error;
    return count ?? 0;
  }

  async function list(
    status:
      | "inbox"
      | "triaged"
      | "resolving"
      | "resolved"
      | "dismissed"
      | "open" = "open",
    limit = 50,
  ): Promise<CaptureRow[]> {
    let q = own(ctx.db.from("captures").select("*"));
    q =
      status === "open"
        ? q.in("status", ["inbox", "triaged", "resolving"])
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
    let c = await get(id);
    if (!c) throw new Error("캡처를 찾을 수 없어요");
    c = await recoverInvalid(c);
    if (c.resolved_ref || !["inbox", "triaged"].includes(c.status))
      throw new Error("이미 확정 중이거나 처리한 메모예요");
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
    const { data: triaged, error: triageError } = await ctx.db
      .from("captures")
      .update({ status: "triaged", triage: output as unknown as Json })
      .eq("id", id)
      .eq("user_id", ctx.userId)
      .in("status", ["inbox", "triaged"])
      .eq("updated_at", c.updated_at)
      .select("id")
      .maybeSingle();
    if (triageError) throw triageError;
    if (!triaged) throw new Error("이미 확정 중이거나 처리한 메모예요");
    await ctx.emit({
      type: CAPTURE_EVENTS.triaged,
      entity: { type: "capture", id },
      payload: { type: output.type },
    });
    return output;
  }

  function command(id: string, t: Triage) {
    const creationKey = `capture:${id}`;
    let name: string;
    let input: Record<string, unknown>;
    let type: string;
    if (t.type === "note") return null;
    if (t.type === "task" && t.task) {
      name = "tasks.create";
      type = "card";
      input = {
        creationKey,
        title: t.task.title,
        priority: t.task.priority,
        dueAt: t.task.due ?? null,
        dueHasTime:
          t.task.dueHasTime ??
          Boolean(t.task.due && !t.task.due.includes("T23:59")),
        source: { type: "capture", ref_id: id },
      };
    } else if (t.type === "event" && t.event) {
      if (Date.parse(t.event.endAt) <= Date.parse(t.event.startAt))
        throw new Error("종료는 시작보다 늦어야 해요");
      name = "calendar.createEvent";
      type = "calendar_event";
      input = { creationKey, ...t.event };
    } else if (t.type === "memory" && t.memory) {
      name = "memory.remember";
      type = "memory";
      input = {
        creationKey,
        ...t.memory,
        importance: 3,
      };
    } else throw new Error("확정할 내용을 확인해 주세요");
    const tool = ctx.registry.tools()[name];
    if (!tool) throw new Error(`${name} 도구를 사용할 수 없어요`);
    // Run the exact downstream schema before freezing the plan or executing writes.
    return { tool, input: tool.inputSchema.parse(input), type };
  }

  function validateMemoryEvidence(c: CaptureRow, t: Triage) {
    if (
      t.type === "memory" &&
      t.memory &&
      ctx.actor !== "user" &&
      !c.raw_text.includes(t.memory.content.trim())
    )
      throw new Error("원문에 없는 기억 해석은 직접 확인 후 확정해 주세요");
  }

  // Earlier versions froze malformed ISO dates before validation. Such a plan
  // cannot execute; release it only after verifying no destination was created.
  async function recoverInvalid(c: CaptureRow): Promise<CaptureRow> {
    if (c.status !== "resolving" || triageSchema.safeParse(c.triage).success)
      return c;
    for (const table of ["cards", "calendar_events", "memories"] as const) {
      const { data, error } = await ctx.db
        .from(table)
        .select("id")
        .eq("user_id", ctx.userId)
        .eq("creation_key", `capture:${c.id}`)
        .limit(1);
      if (error) throw error;
      if (data.length) return c;
    }
    const { data, error } = await ctx.db
      .from("captures")
      .update({ status: "triaged" })
      .eq("id", c.id)
      .eq("user_id", ctx.userId)
      .eq("status", "resolving")
      .eq("updated_at", c.updated_at)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ?? (await get(c.id)) ?? c;
  }

  async function resolve(id: string, override?: Partial<Triage>) {
    let c = await get(id);
    if (!c) throw new Error("메모를 찾을 수 없어요");
    c = await recoverInvalid(c);
    if (c.status === "dismissed")
      throw new Error("무시한 메모예요. 먼저 복원해 주세요");
    const result = (row: CaptureRow, changed: boolean) => ({
      type: (row.triage as Triage).type,
      ref: row.resolved_ref as Record<string, unknown>,
      changed,
      status: row.status,
      href: `/capture/${id}`,
    });
    if (c.status === "resolved") return result(c, false);
    // Restoring a processed item keeps its destination. Reconfirming never
    // changes its kind or silently creates a second resource.
    if (c.resolved_ref) {
      if (override)
        throw new Error("이미 만든 항목은 연결된 원본에서 수정해 주세요");
      const { data, error } = await ctx.db
        .from("captures")
        .update({ status: "resolved" })
        .eq("id", id)
        .eq("user_id", ctx.userId)
        .eq("updated_at", c.updated_at)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("메모 상태가 바뀌었어요. 다시 확인해 주세요");
      return result(data, true);
    }
    if (c.status !== "resolving") {
      const merged = {
        ...((c.triage as Triage | null) ?? { type: "note", reason: "" }),
        ...override,
      };
      const proposed = triageSchema.parse({
        type: merged.type,
        reason: merged.reason,
        ...(merged.type === "task" ? { task: merged.task } : {}),
        ...(merged.type === "event" ? { event: merged.event } : {}),
        ...(merged.type === "memory" ? { memory: merged.memory } : {}),
      });
      validateMemoryEvidence(c, proposed);
      command(id, proposed);
      const { data, error } = await ctx.db
        .from("captures")
        .update({ status: "resolving", triage: proposed as unknown as Json })
        .eq("id", id)
        .eq("user_id", ctx.userId)
        .eq("updated_at", c.updated_at)
        .in("status", ["inbox", "triaged"])
        .select("*")
        .maybeSingle();
      if (error) throw error;
      c = data ?? (await get(id));
      if (!c) throw new Error("메모를 찾을 수 없어요");
      if (c.status === "resolved") return result(c, false);
      if (c.status !== "resolving")
        throw new Error("메모 상태가 바뀌었어요. 다시 확인해 주세요");
    }
    const t = triageSchema.parse(c.triage);
    validateMemoryEvidence(c, t);
    const prepared = command(id, t);
    // Once execution starts, errors may mean the destination exists. Keep the
    // frozen command and creation key so retries reconcile rather than recreate.
    const entity =
      t.type === "memory" && t.memory
        ? (
            await memoryService(ctx).remember({
              creationKey: `capture:${id}`,
              ...t.memory,
              importance: 3,
              source: {
                type: "capture",
                id,
                excerpt:
                  ctx.actor === "user"
                    ? c.raw_text.slice(0, 300)
                    : t.memory.content,
                evidence: "explicit_user",
              },
            })
          ).memory
        : prepared
          ? ((await prepared.tool.execute(prepared.input, ctx)) as {
              id: string;
            })
          : null;
    const ref: Record<string, unknown> =
      prepared && entity
        ? { type: prepared.type, id: entity.id }
        : { type: "note", id, href: `/capture/${id}` };
    const { data: resolved, error: resolveError } = await ctx.db
      .from("captures")
      .update({
        status: "resolved",
        resolved_ref: ref as Json,
        triage: t as unknown as Json,
      })
      .eq("id", id)
      .eq("user_id", ctx.userId)
      .eq("status", "resolving")
      .select("*")
      .maybeSingle();
    if (resolveError) throw resolveError;
    if (!resolved) {
      const current = await get(id);
      if (current?.status === "resolved") return result(current, false);
      throw new Error("메모 상태가 바뀌었어요. 생성 결과를 다시 확인해 주세요");
    }
    await ctx.emit({
      type: CAPTURE_EVENTS.resolved,
      entity: { type: "capture", id },
      payload: ref,
    });
    return {
      type: t.type,
      ref,
      changed: true,
      status: "resolved",
      href: `/capture/${id}`,
    };
  }

  async function changedEvent(id: string) {
    await ctx.emit({
      type: CAPTURE_EVENTS.changed,
      entity: { type: "capture", id },
      payload: {},
    });
  }

  async function listPage(raw: z.input<typeof captureListSchema> = {}) {
    const input = captureListSchema.parse(raw);
    let q = own(ctx.db.from("captures").select("*", { count: "exact" }));
    if (input.status === "open")
      q = q.in("status", ["inbox", "triaged", "resolving"]);
    else if (input.status !== "all") q = q.eq("status", input.status);
    if (input.q)
      q = q.ilike("raw_text", `%${input.q.replace(/[\\%_]/g, "\\$&")}%`);
    const { data, error, count } = await q
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(input.offset, input.offset + input.limit - 1);
    if (error) throw error;
    const total = count ?? 0;
    const next = input.offset + data.length;
    return {
      items: data,
      total,
      hasMore: next < total,
      nextOffset: next < total ? next : null,
      scope: { status: input.status, q: input.q ?? null },
    };
  }

  async function edit(id: string, text: string, expectedVersion: string) {
    const rawText = z.string().trim().min(1).max(4000).parse(text);
    let c = await get(id);
    if (!c) throw new Error("메모를 찾을 수 없어요");
    if (c.updated_at !== expectedVersion)
      throw new Error("메모가 변경됐어요. 다시 읽고 수정해 주세요");
    c = await recoverInvalid(c);
    if (c.status === "resolving")
      throw new Error("생성 결과를 확인 중이에요. 먼저 다시 확정해 주세요");
    const { data, error } = await ctx.db
      .from("captures")
      .update({
        raw_text: rawText,
        ...(c.resolved_ref ? {} : { status: "inbox", triage: null }),
      })
      .eq("id", id)
      .eq("user_id", ctx.userId)
      .eq("updated_at", c.updated_at)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("메모가 변경됐어요. 다시 읽고 수정해 주세요");
    await changedEvent(id);
    return data;
  }

  async function dismiss(id: string) {
    const before = await get(id);
    if (before) await recoverInvalid(before);
    const { data, error } = await ctx.db
      .from("captures")
      .update({ status: "dismissed" })
      .eq("id", id)
      .eq("user_id", ctx.userId)
      .in("status", ["inbox", "triaged"])
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (data) await changedEvent(id);
    const current = data ?? (await get(id));
    return {
      id,
      changed: Boolean(data),
      status: current?.status ?? "missing",
      reason: data
        ? null
        : current?.status === "resolving"
          ? "생성 결과 확인 후 다시 확정해 주세요"
          : "이미 처리했거나 찾을 수 없는 메모예요",
    };
  }

  async function restore(id: string) {
    const { data, error } = await ctx.db
      .from("captures")
      .update({ status: "triaged" })
      .eq("id", id)
      .eq("user_id", ctx.userId)
      .in("status", ["resolved", "dismissed"])
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (data) await changedEvent(id);
    return {
      id,
      changed: Boolean(data),
      status: (data ?? (await get(id)))?.status ?? "missing",
      href: `/capture/${id}`,
    };
  }

  async function remove(id: string, expectedVersion: string) {
    const approvedVersion = ctx.approvedVersions?.[`captures:${id}`];
    if (approvedVersion && approvedVersion !== expectedVersion)
      throw new Error("승인한 메모 버전과 달라요. 다시 확인해 주세요");
    const { data, error } = await ctx.db
      .from("captures")
      .delete()
      .eq("id", id)
      .eq("user_id", ctx.userId)
      .eq("updated_at", expectedVersion)
      .neq("status", "resolving")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data)
      throw new Error("메모가 변경됐거나 확정 중이에요. 다시 확인해 주세요");
    await ctx.emit({
      type: CAPTURE_EVENTS.deleted,
      entity: { type: "capture", id },
      payload: {},
    });
    return {
      id,
      changed: true,
      status: "deleted",
      linkedResourceDeleted: false,
    };
  }

  return {
    add,
    list,
    listPage,
    countOpen,
    get,
    triage,
    resolve,
    dismiss,
    edit,
    restore,
    remove,
  };
}
