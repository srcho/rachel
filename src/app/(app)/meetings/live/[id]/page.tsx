import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { PageHeader } from "@/core/ui/PageHeader";
import { registry } from "@/modules";
import { meetingsService } from "@/modules/meetings/service";
import { LiveScreen } from "@/modules/meetings/ui/LiveScreen";

export const dynamic = "force-dynamic";

export default async function LiveMeetingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const db = await createServerSupabase();
  const m = await meetingsService(
    createContext({ db, userId: user.id, actor: "user", registry }),
  ).get(id);
  if (!m) notFound();
  if (m.status !== "recording") redirect(`/meetings/${id}`);
  return (
    <>
      <PageHeader title="녹음" />
      <LiveScreen meetingId={id} title={m.title} />
    </>
  );
}
