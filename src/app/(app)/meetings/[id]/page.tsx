import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { registry } from "@/modules";
import { meetingsService } from "@/modules/meetings/service";
import { MeetingDetail } from "@/modules/meetings/ui/MeetingDetail";

export const dynamic = "force-dynamic";

export default async function MeetingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const db = await createServerSupabase();
  const ctx = createContext({ db, userId: user.id, actor: "user", registry });
  const svc = meetingsService(ctx);
  const meeting = await svc.get(id);
  if (!meeting) notFound();
  if (meeting.status === "recording") redirect(`/meetings/live/${id}`);
  // 서로 독립인 조회는 병렬로(파이널 패스 중 Realtime 갱신마다 이 페이지가 다시 렌더된다)
  const [{ pass, segments }, { data: usage }, { data: cards }] =
    await Promise.all([
      svc.transcript(id),
      db
        .from("llm_usage")
        .select("feature, cost_usd")
        .eq("user_id", user.id)
        .contains("ref", { type: "meeting", id }),
      db
        .from("cards")
        .select("id, title, completed_at")
        .eq("user_id", user.id)
        .eq("meeting_id", id)
        .is("archived_at", null),
    ]);
  const costs: Record<string, number> = {};
  for (const u of usage ?? [])
    costs[u.feature] = (costs[u.feature] ?? 0) + Number(u.cost_usd);
  return (
    <MeetingDetail
      meeting={meeting}
      pass={pass}
      segments={segments}
      costs={costs}
      linkedCards={cards ?? []}
      userId={user.id}
    />
  );
}
