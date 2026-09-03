import { redirect } from "next/navigation";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { registry } from "@/modules";
import { tasksService } from "@/modules/tasks/service";

export default async function TasksIndex() {
  const user = await requireUser();
  const db = await createServerSupabase();
  const board = await tasksService(
    createContext({ db, userId: user.id, actor: "user", registry }),
  ).ensureDefaultBoard();
  redirect(`/tasks/${board.id}`);
}
