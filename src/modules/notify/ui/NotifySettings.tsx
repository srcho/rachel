import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { getRegistry } from "@/core/registry/current";
import { getProfileSettings } from "@/core/settings/profile";
import { NOTIFICATION_KINDS, type NotificationKind } from "../schema";
import { notifyService } from "../service";
import { NotifyControls } from "./NotifyControls";

export async function NotifySettings() {
  const user = await requireUser();
  const db = await createServerSupabase();
  const svc = notifyService(
    createContext({
      db,
      userId: user.id,
      actor: "user",
      registry: await getRegistry(),
    }),
  );
  const [count, settings] = await Promise.all([
    svc.count(),
    getProfileSettings(db, user.id),
  ]);
  const prefs =
    (settings as { notifications?: Partial<Record<NotificationKind, boolean>> })
      .notifications ?? {};
  return (
    <NotifyControls
      subscriptions={count}
      prefs={
        Object.fromEntries(
          NOTIFICATION_KINDS.map((k) => [k, prefs[k] !== false]),
        ) as Record<NotificationKind, boolean>
      }
      vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
    />
  );
}
