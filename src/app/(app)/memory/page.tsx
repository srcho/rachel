import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { Page } from "@/core/ui/Page";
import { PageHeader } from "@/core/ui/PageHeader";
import { registry } from "@/modules";
import { MEMORY_KINDS, type MemoryKind } from "@/modules/memory/constants";
import { memoryService } from "@/modules/memory/service";
import { MemoryActivity } from "@/modules/memory/ui/MemoryActivity";
import { MemoryList } from "@/modules/memory/ui/MemoryList";
import { MemorySearch } from "@/modules/memory/ui/MemorySearch";

export const dynamic = "force-dynamic";

export default async function MemoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    kind?: string;
    q?: string;
    archived?: string;
    offset?: string;
    id?: string;
  }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const db = await createServerSupabase();
  const activity = await db
    .from("jobs")
    .select("status,updated_at,run_at,last_error")
    .eq("user_id", user.id)
    .eq("type", "memory.extract")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activity.error)
    console.error("[memory] extraction status", activity.error.code);
  const svc = memoryService(
    createContext({ db, userId: user.id, actor: "user", registry }),
  );
  const kind = MEMORY_KINDS.includes(sp.kind as MemoryKind)
    ? (sp.kind as MemoryKind)
    : null;
  const archived = sp.archived === "1";
  const offset = Math.max(0, Number.parseInt(sp.offset ?? "0", 10) || 0);
  const page = await svc.listPage({
    kind: kind ?? undefined,
    q: sp.q?.slice(0, 300),
    status: archived ? "archived" : "active",
    limit: 50,
    offset,
  });
  let memories = page.items;
  if (sp.id) {
    if (!z.string().uuid().safeParse(sp.id).success) notFound();
    const memory = await svc.get(sp.id);
    if (!memory) notFound();
    memories = [memory];
  }
  const href = (nextOffset: number) =>
    `/memory?${new URLSearchParams({
      ...(kind ? { kind } : {}),
      ...(sp.q ? { q: sp.q } : {}),
      ...(archived ? { archived: "1" } : {}),
      offset: String(nextOffset),
    })}`;

  return (
    <>
      <PageHeader
        title="기억"
        meta={sp.id ? "기억 상세" : `${page.total}개`}
        actions={<MemorySearch q={sp.q ?? ""} />}
      />
      <Page width="narrow">
        <MemoryActivity
          unavailable={!!activity.error}
          latest={
            activity.data
              ? {
                  status: activity.data.status,
                  updated_at: activity.data.updated_at,
                  run_at: activity.data.run_at,
                  retrying: !!activity.data.last_error,
                }
              : null
          }
        />
        {sp.id && (
          <Link className="mb-3 block text-sm underline" href="/memory">
            전체 기억 보기
          </Link>
        )}
        <MemoryList
          memories={memories}
          kind={kind}
          q={sp.q ?? ""}
          archived={archived}
        />
        {!sp.id && (offset > 0 || page.hasMore) && (
          <nav
            aria-label="기억 목록 페이지"
            className="mt-4 flex justify-between text-sm"
          >
            {offset > 0 ? (
              <Link href={href(Math.max(0, offset - page.limit))}>이전</Link>
            ) : (
              <span />
            )}
            <span>
              {offset + 1}–{offset + memories.length} / {page.total}
            </span>
            {page.nextOffset !== null && (
              <Link href={href(page.nextOffset)}>다음</Link>
            )}
          </nav>
        )}
      </Page>
    </>
  );
}
