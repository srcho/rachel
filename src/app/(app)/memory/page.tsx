import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { Page } from "@/core/ui/Page";
import { PageHeader } from "@/core/ui/PageHeader";
import { registry } from "@/modules";
import { MEMORY_KINDS, type MemoryKind } from "@/modules/memory/constants";
import { memoryService } from "@/modules/memory/service";
import { MemoryList } from "@/modules/memory/ui/MemoryList";
import { MemorySearch } from "@/modules/memory/ui/MemorySearch";

export const dynamic = "force-dynamic";

export default async function MemoryPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; q?: string; archived?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const db = await createServerSupabase();
  const svc = memoryService(
    createContext({ db, userId: user.id, actor: "user", registry }),
  );
  const kind = MEMORY_KINDS.includes(sp.kind as MemoryKind)
    ? (sp.kind as MemoryKind)
    : null;
  const archived = sp.archived === "1";
  const memories = await svc.list({
    kind: kind ?? undefined,
    q: sp.q,
    status: archived ? "archived" : "active",
    limit: 200,
  });
  return (
    <>
      <PageHeader
        title="기억"
        meta={`${memories.length}개`}
        actions={<MemorySearch q={sp.q ?? ""} />}
      />
      <Page width="narrow">
        <MemoryList
          memories={memories}
          kind={kind}
          q={sp.q ?? ""}
          archived={archived}
        />
      </Page>
    </>
  );
}
