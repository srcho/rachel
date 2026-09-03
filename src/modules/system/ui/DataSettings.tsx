import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { getRegistry } from "@/core/registry/current";
import { listBackups } from "../backup";
import { DataControls } from "./DataControls";

export async function DataSettings() {
  const user = await requireUser();
  const db = await createServerSupabase();
  const backups = await listBackups(
    createContext({
      db,
      userId: user.id,
      actor: "user",
      registry: await getRegistry(),
    }),
  );
  return <DataControls backups={backups} />;
}
