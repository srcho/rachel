import { redirect } from "next/navigation";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { registry } from "@/modules";
import { tasksService } from "@/modules/tasks/service";

export default async function TasksIndex({
  searchParams,
}: {
  searchParams: Promise<{ card?: string }>;
}) {
  const user = await requireUser();
  const db = await createServerSupabase();
  const { card } = await searchParams;
  if (card && /^[0-9a-f-]{36}$/i.test(card)) {
    const result = await db
      .from("cards")
      .select("board_id")
      .eq("user_id", user.id)
      .eq("id", card)
      .maybeSingle();
    if (result.error) throw result.error;
    if (result.data) redirect(`/tasks/${result.data.board_id}?card=${card}`);
  }
  const board = await tasksService(
    createContext({ db, userId: user.id, actor: "user", registry }),
  ).ensureDefaultBoard();
  redirect(`/tasks/${board.id}`);
}
