import { notFound } from "next/navigation";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { Page } from "@/core/ui/Page";
import { PageHeader } from "@/core/ui/PageHeader";
import { registry } from "@/modules";
import { tasksService } from "@/modules/tasks/service";
import { Board } from "@/modules/tasks/ui/Board";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;
  const user = await requireUser();
  const db = await createServerSupabase();
  const svc = tasksService(
    createContext({ db, userId: user.id, actor: "user", registry }),
  );
  let view: Awaited<ReturnType<typeof svc.getBoardView>>;
  try {
    view = await svc.getBoardView(boardId);
  } catch {
    notFound();
  }
  return (
    <>
      <PageHeader
        title={view.board.name}
        meta={`카드 ${view.cards.filter((c) => !c.completed_at).length}`}
      />
      <Page width="full">
        <Board initial={view} userId={user.id} />
      </Page>
    </>
  );
}
